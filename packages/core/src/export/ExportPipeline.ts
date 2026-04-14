// ============================================================================
// Export Pipeline — Orchestrates the full decode → render → encode → mux flow
//
// This is the single entry point for exporting a video. It coordinates:
//   1. StreamingVideoDecoder: demux and decode the source video
//   2. FrameRenderer: composite each frame with effects
//   3. VideoEncoderWrapper: encode the rendered frames
//   4. VideoMuxer: package into MP4 container
//   5. GifEncoder: alternative output for GIF format
//
// Features:
//   - Hardware → software encoder fallback with automatic retry
//   - Progress reporting as async iterator
//   - Cancellation via AbortSignal
//   - Memory-aware queue management
// ============================================================================

import {
	type AnnotationRegion,
	type BackgroundConfig,
	type CropRegion,
	type CursorTelemetryPoint,
	type ExportConfig,
	type ExportProgress,
	type ExportResult,
	type SpeedRegion,
	type TrimRegion,
	type WebcamLayoutPreset,
	type WebcamMaskShape,
	type WebcamPosition,
	type WebcamSizePreset,
	type ZoomRegion,
	clamp,
} from "../types/index.js";
import { StreamingVideoDecoder } from "../decoder/StreamingDecoder.js";
import { VideoEncoderWrapper, selectBestCodec } from "../encoder/VideoEncoderWrapper.js";
import { FrameRenderer } from "../renderer/FrameRenderer.js";
import { VideoMuxer } from "../muxer/VideoMuxer.js";
import { AudioProcessor } from "../audio/AudioProcessor.js";
import { GifEncoder } from "../gif/GifEncoder.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExportPipelineConfig {
	/** URL or file path to the screen recording video. */
	videoUrl: string;
	/** URL or file path to the webcam video (optional). */
	webcamUrl?: string;
	/** URL or file path to the audio (if separate from video). */
	audioUrl?: string;

	/** Export format and quality settings. */
	export: ExportConfig;

	/** Background configuration. */
	background: BackgroundConfig;

	/** Timeline regions. */
	zoomRegions: ZoomRegion[];
	trimRegions: TrimRegion[];
	speedRegions: SpeedRegion[];
	annotationRegions: AnnotationRegion[];

	/** Crop region. */
	cropRegion: CropRegion;

	/** Webcam overlay settings. */
	webcam?: {
		layout: WebcamLayoutPreset;
		maskShape: WebcamMaskShape;
		size: WebcamSizePreset;
		position: WebcamPosition | null;
	};

	/** Editor settings. */
	editorSettings?: {
		showShadow: boolean;
		shadowIntensity: number;
		motionBlur: boolean;
		motionBlurAmount: number;
		borderRadius: number;
		padding: number;
	};

	/** Cursor telemetry for auto-zoom. */
	cursorTelemetry?: CursorTelemetryPoint[];

	/** Progress callback. */
	onProgress?: (progress: ExportProgress) => void;

	/** Abort signal for cancellation. */
	signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// ExportPipeline
// ---------------------------------------------------------------------------

export class ExportPipeline {
	private config: ExportPipelineConfig;
	private decoder: StreamingVideoDecoder | null = null;
	private webcamDecoder: StreamingVideoDecoder | null = null;
	private encoder: VideoEncoderWrapper | null = null;
	private renderer: FrameRenderer | null = null;
	private muxer: VideoMuxer | null = null;
	private gifEncoder: GifEncoder | null = null;
	private audioProcessor: AudioProcessor | null = null;
	private aborted = false;

	constructor(config: ExportPipelineConfig) {
		this.config = config;
	}

	// -----------------------------------------------------------------------
	// Public API
	// -----------------------------------------------------------------------

	/**
	 * Runs the full export pipeline and returns the result.
	 */
	async run(): Promise<ExportResult> {
		try {
			if (this.config.signal?.aborted) {
				return { success: false, error: "Export cancelled" };
			}

			// Listen for abort
			this.config.signal?.addEventListener("abort", () => {
				this.aborted = true;
			});

			if (this.config.export.format === "gif") {
				return await this.exportGif();
			}

			return await this.exportVideo();
		} catch (error) {
			if (this.aborted) {
				return { success: false, error: "Export cancelled" };
			}
			const message = error instanceof Error ? error.message : String(error);
			console.error("[ExportPipeline] Export failed:", message);
			return { success: false, error: message };
		} finally {
			this.cleanup();
		}
	}

	/**
	 * Cancels the export.
	 */
	cancel(): void {
		this.aborted = true;
		this.decoder?.cancel();
		this.webcamDecoder?.cancel();
	}

	// -----------------------------------------------------------------------
	// Video Export (MP4 / WebM)
	// -----------------------------------------------------------------------

	private async exportVideo(): Promise<ExportResult> {
		const { videoUrl, export: exportConfig } = this.config;

		// 1. Load video metadata
		this.decoder = new StreamingVideoDecoder();
		const metadata = await this.decoder.loadMetadata(videoUrl);

		// 2. Load webcam metadata (if available)
		let webcamMetadata = null;
		if (this.config.webcamUrl) {
			this.webcamDecoder = new StreamingVideoDecoder();
			webcamMetadata = await this.webcamDecoder.loadMetadata(this.config.webcamUrl);
		}

		if (this.aborted) return { success: false, error: "Export cancelled" };

		// 3. Select codec
		const codec = exportConfig.codec || await selectBestCodec(exportConfig.width, exportConfig.height);

		// 4. Set up frame renderer
		const editorSettings = this.config.editorSettings;
		this.renderer = new FrameRenderer({
			width: exportConfig.width,
			height: exportConfig.height,
			wallpaper: this.config.background.value,
			zoomRegions: this.config.zoomRegions,
			showShadow: editorSettings?.showShadow ?? true,
			shadowIntensity: editorSettings?.shadowIntensity ?? 50,
			showBlur: editorSettings?.motionBlur ?? false,
			motionBlurAmount: editorSettings?.motionBlurAmount ?? 0,
			borderRadius: editorSettings?.borderRadius ?? 12,
			padding: editorSettings?.padding ?? 32,
			cropRegion: this.config.cropRegion,
			videoWidth: metadata.width,
			videoHeight: metadata.height,
			webcamSize: webcamMetadata ? { width: webcamMetadata.width, height: webcamMetadata.height } : null,
			webcamLayoutPreset: this.config.webcam?.layout,
			webcamMaskShape: this.config.webcam?.maskShape,
			webcamSizePreset: this.config.webcam?.size,
			webcamPosition: this.config.webcam?.position,
			annotationRegions: this.config.annotationRegions,
			speedRegions: this.config.speedRegions,
			cursorTelemetry: this.config.cursorTelemetry,
		});

		await this.renderer.initialize();

		if (this.aborted) return { success: false, error: "Export cancelled" };

		// 5. Set up muxer
		this.muxer = new VideoMuxer(exportConfig, metadata.hasAudio);
		await this.muxer.initialize();

		// 6. Set up encoder (with hardware → software fallback)
		const encodedChunks: Array<{ chunk: EncodedVideoChunk; metadata?: EncodedVideoChunkMetadata }> = [];

		this.encoder = new VideoEncoderWrapper(
			{
				width: exportConfig.width,
				height: exportConfig.height,
				frameRate: exportConfig.frameRate,
				bitrate: exportConfig.bitrate,
				codec,
				hardwareAcceleration: "auto",
			},
			async (output) => {
				await this.muxer!.addVideoChunk(output.chunk, output.metadata);
			},
		);

		try {
			await this.encoder.initialize();
		} catch (hwError) {
			// If hardware fails, retry with software
			console.warn("[ExportPipeline] Hardware encoder failed, trying software:", hwError);
			this.encoder.close();

			this.encoder = new VideoEncoderWrapper(
				{
					width: exportConfig.width,
					height: exportConfig.height,
					frameRate: exportConfig.frameRate,
					bitrate: exportConfig.bitrate,
					codec,
					hardwareAcceleration: "prefer-software",
				},
				async (output) => {
					await this.muxer!.addVideoChunk(output.chunk, output.metadata);
				},
			);

			await this.encoder.initialize();
		}

		if (this.aborted) return { success: false, error: "Export cancelled" };

		// 7. Calculate total frames for progress
		const effectiveDuration = this.decoder.getEffectiveDuration(
			this.config.trimRegions,
			this.config.speedRegions,
		);
		const totalFrames = Math.ceil(effectiveDuration * exportConfig.frameRate);
		let currentFrame = 0;

		// 8. Decode → render → encode loop
		await this.decoder.decodeAll(
			exportConfig.frameRate,
			this.config.trimRegions,
			this.config.speedRegions,
			async (videoFrame, exportTimestampUs, sourceTimestampMs) => {
				if (this.aborted) {
					videoFrame.close();
					throw new Error("Export cancelled");
				}

				// Render the frame
				await this.renderer!.renderFrame(videoFrame, exportTimestampUs);
				videoFrame.close();

				// Create a VideoFrame from the rendered canvas
				const renderedFrame = new VideoFrame(this.renderer!.getCanvas() as any, {
					timestamp: exportTimestampUs,
				});

				// Encode the rendered frame
				await this.encoder!.encode(renderedFrame, currentFrame);
				renderedFrame.close();

				// Report progress
				currentFrame++;
				if (this.config.onProgress) {
					const percentage = clamp((currentFrame / totalFrames) * 100, 0, 100);
					this.config.onProgress({
						currentFrame,
						totalFrames,
						percentage,
						estimatedTimeRemaining: 0, // TODO: estimate based on FPS
						phase: "encoding",
					});
				}
			},
			{ signal: this.config.signal },
		);

		if (this.aborted) return { success: false, error: "Export cancelled" };

		// 9. Flush encoder
		this.config.onProgress?.({
			currentFrame,
			totalFrames,
			percentage: 95,
			estimatedTimeRemaining: 0,
			phase: "muxing",
		});

		await this.encoder.flush();

		// 10. Finalize MP4
		this.config.onProgress?.({
			currentFrame,
			totalFrames,
			percentage: 99,
			estimatedTimeRemaining: 0,
			phase: "finalizing",
		});

		const blob = await this.muxer.finalize();

		this.config.onProgress?.({
			currentFrame,
			totalFrames,
			percentage: 100,
			estimatedTimeRemaining: 0,
			phase: "finalizing",
		});

		return { success: true, blob };
	}

	// -----------------------------------------------------------------------
	// GIF Export
	// -----------------------------------------------------------------------

	private async exportGif(): Promise<ExportResult> {
		const { videoUrl, export: exportConfig } = this.config;

		// Load metadata
		this.decoder = new StreamingVideoDecoder();
		const metadata = await this.decoder.loadMetadata(videoUrl);

		// Set up renderer
		const editorSettings = this.config.editorSettings;
		this.renderer = new FrameRenderer({
			width: exportConfig.width,
			height: exportConfig.height,
			wallpaper: this.config.background.value,
			zoomRegions: this.config.zoomRegions,
			showShadow: editorSettings?.showShadow ?? true,
			shadowIntensity: editorSettings?.shadowIntensity ?? 50,
			showBlur: false, // No motion blur for GIF
			borderRadius: editorSettings?.borderRadius ?? 12,
			padding: editorSettings?.padding ?? 32,
			cropRegion: this.config.cropRegion,
			videoWidth: metadata.width,
			videoHeight: metadata.height,
			annotationRegions: this.config.annotationRegions,
			speedRegions: this.config.speedRegions,
			cursorTelemetry: this.config.cursorTelemetry,
		});

		await this.renderer.initialize();

		// Set up GIF encoder (cap FPS at 15 for reasonable file size)
		const gifFps = Math.min(exportConfig.frameRate, 15);
		this.gifEncoder = new GifEncoder({
			width: exportConfig.width,
			height: exportConfig.height,
			fps: gifFps,
			quality: 10,
		});

		this.gifEncoder.start();

		const effectiveDuration = this.decoder.getEffectiveDuration(
			this.config.trimRegions,
			this.config.speedRegions,
		);
		const totalFrames = Math.ceil(effectiveDuration * gifFps);
		let currentFrame = 0;

		// Decode at the GIF's target FPS
		await this.decoder.decodeAll(
			gifFps,
			this.config.trimRegions,
			this.config.speedRegions,
			async (videoFrame, exportTimestampUs) => {
				if (this.aborted) {
					videoFrame.close();
					throw new Error("Export cancelled");
				}

				await this.renderer!.renderFrame(videoFrame, exportTimestampUs);
				videoFrame.close();

				// Get pixel data from rendered canvas
				const imageData = this.renderer!.getImageData();
				this.gifEncoder!.addFrame(imageData.data);

				currentFrame++;
				this.config.onProgress?.({
					currentFrame,
					totalFrames,
					percentage: clamp((currentFrame / totalFrames) * 100, 0, 100),
					estimatedTimeRemaining: 0,
					phase: "encoding",
				});
			},
			{ signal: this.config.signal },
		);

		if (this.aborted) return { success: false, error: "Export cancelled" };

		const blob = this.gifEncoder.finish();

		this.config.onProgress?.({
			currentFrame,
			totalFrames,
			percentage: 100,
			estimatedTimeRemaining: 0,
			phase: "finalizing",
		});

		return { success: true, blob };
	}

	// -----------------------------------------------------------------------
	// Cleanup
	// -----------------------------------------------------------------------

	private cleanup(): void {
		this.decoder?.destroy();
		this.decoder = null;
		this.webcamDecoder?.destroy();
		this.webcamDecoder = null;
		this.encoder?.close();
		this.encoder = null;
		this.renderer?.destroy();
		this.renderer = null;
		this.muxer?.destroy();
		this.muxer = null;
		this.audioProcessor?.destroy();
		this.audioProcessor = null;
		this.gifEncoder = null;
	}
}
