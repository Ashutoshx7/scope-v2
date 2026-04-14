// ============================================================================
// Streaming Video Decoder
//
// Decodes video files frame-by-frame using WebCodecs VideoDecoder +
// web-demuxer for container demuxing. Supports trim and speed regions.
//
// Architecture:
//   1. web-demuxer extracts codec info + individual encoded chunks
//   2. VideoDecoder decodes each chunk → VideoFrame
//   3. Frames are delivered via callback with export timestamps
//   4. Trim regions are skipped, speed regions adjust timing
// ============================================================================

import {
	type SpeedRegion,
	type TrimRegion,
	clamp,
} from "../types/index.js";

/** Metadata returned after loading a video file. */
export interface VideoMetadata {
	width: number;
	height: number;
	duration: number;
	/** Duration derived from the stream container (may differ from metadata). */
	streamDuration: number | null;
	frameRate: number;
	codec: string;
	hasAudio: boolean;
	/** Total number of video samples/frames in the container. */
	sampleCount: number;
}

/** Callback for each decoded frame during decodeAll. */
export type FrameCallback = (
	frame: VideoFrame,
	exportTimestampUs: number,
	sourceTimestampMs: number,
) => Promise<void>;

/**
 * Options for controlling decode behaviour.
 */
interface DecodeOptions {
	/** Maximum number of frames to buffer in the decoder queue. */
	maxDecodeQueue?: number;
	/** Signal to abort decoding. */
	signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_FRAME_RATE = 30;
const DEFAULT_MAX_DECODE_QUEUE = 8;
const DECODE_BACKPRESSURE_WAIT_MS = 2;
const TIMESTAMP_EPSILON_MS = 0.5;

// ---------------------------------------------------------------------------
// StreamingVideoDecoder
// ---------------------------------------------------------------------------

export class StreamingVideoDecoder {
	private decoder: VideoDecoder | null = null;
	private demuxer: any = null; // web-demuxer instance
	private metadata: VideoMetadata | null = null;
	private cancelled = false;
	private frameResolvers: Array<{
		resolve: (frame: VideoFrame) => void;
		reject: (err: Error) => void;
	}> = [];
	private pendingFrames: VideoFrame[] = [];
	private decoderError: Error | null = null;

	// -----------------------------------------------------------------------
	// Public API
	// -----------------------------------------------------------------------

	/**
	 * Loads video metadata from a URL or file path.
	 * This sets up the demuxer and extracts codec/resolution/duration info.
	 */
	async loadMetadata(videoUrl: string): Promise<VideoMetadata> {
		if (this.metadata) return this.metadata;

		try {
			// Dynamic import web-demuxer (it's a large WASM module)
			const { WebDemuxer } = await import("web-demuxer");

			const demuxer = new WebDemuxer();

			await demuxer.load(videoUrl);
			this.demuxer = demuxer;

			const videoInfo = await (demuxer as any).getDecoderConfig("video");
			const mediaInfo = await demuxer.getMediaInfo();

			const width = videoInfo.codedWidth || videoInfo.displayWidth || 1920;
			const height = videoInfo.codedHeight || videoInfo.displayHeight || 1080;

			// Try to get duration from multiple sources
			const containerDuration = (mediaInfo as any).duration || 0;
			const streamDuration = (mediaInfo as any).videoStreamDuration || (mediaInfo as any).duration || null;
			const duration = Math.max(containerDuration, streamDuration || 0);

			// Frame rate calculation
			const frameRate = (mediaInfo as any).videoFrameRate || (mediaInfo as any).fps || DEFAULT_FRAME_RATE;

			// Audio detection
			const hasAudio = !!((mediaInfo as any).audioStreamCount && (mediaInfo as any).audioStreamCount > 0);

			// Sample count
			const sampleCount = (mediaInfo as any).videoSampleCount || 0;

			this.metadata = {
				width,
				height,
				duration: duration / 1_000_000, // Convert µs to seconds
				streamDuration: streamDuration ? streamDuration / 1_000_000 : null,
				frameRate,
				codec: videoInfo.codec || "unknown",
				hasAudio,
				sampleCount,
			};

			return this.metadata;
		} catch (error) {
			throw new Error(
				`Failed to load video metadata: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	/**
	 * Returns the effective duration in seconds after applying trim and speed regions.
	 */
	getEffectiveDuration(
		trimRegions?: TrimRegion[],
		speedRegions?: SpeedRegion[],
	): number {
		if (!this.metadata) throw new Error("Metadata not loaded");

		const totalMs = this.metadata.duration * 1000;
		const trims = trimRegions || [];
		const speeds = speedRegions || [];

		// Calculate trimmed duration
		let trimmedMs = totalMs;
		for (const trim of trims) {
			const trimStart = clamp(trim.startMs, 0, totalMs);
			const trimEnd = clamp(trim.endMs, 0, totalMs);
			if (trimEnd > trimStart) {
				trimmedMs -= trimEnd - trimStart;
			}
		}

		// Apply speed regions (approximation for total duration)
		if (speeds.length === 0) return trimmedMs / 1000;

		let effectiveMs = 0;
		let currentMs = 0;
		const sortedSpeeds = [...speeds].sort((a, b) => a.startMs - b.startMs);

		// Walk through the un-trimmed timeline, skipping trimmed regions
		const sortedTrims = [...trims].sort((a, b) => a.startMs - b.startMs);

		for (let ms = 0; ms < totalMs; ms += 1) {
			// Skip if in a trimmed region
			const isTrimmed = sortedTrims.some(
				(t) => ms >= t.startMs && ms < t.endMs,
			);
			if (isTrimmed) continue;

			// Find speed at this point
			let speed = 1;
			for (const region of sortedSpeeds) {
				if (ms >= region.startMs && ms < region.endMs) {
					speed = region.speed;
					break;
				}
			}

			effectiveMs += 1 / speed;
		}

		return effectiveMs / 1000;
	}

	/**
	 * Decodes all frames, calling the callback for each one.
	 * Respects trim regions (skips trimmed frames) and speed regions
	 * (adjusts output timestamps).
	 */
	async decodeAll(
		targetFrameRate: number,
		trimRegions?: TrimRegion[],
		speedRegions?: SpeedRegion[],
		onFrame?: FrameCallback,
		options?: DecodeOptions,
	): Promise<void> {
		if (!this.metadata || !this.demuxer) {
			throw new Error("Must call loadMetadata() before decodeAll()");
		}

		this.cancelled = false;
		this.decoderError = null;

		const maxQueue = options?.maxDecodeQueue ?? DEFAULT_MAX_DECODE_QUEUE;
		const trims = trimRegions || [];
		const speeds = speedRegions || [];
		const totalDurationMs = this.metadata.duration * 1000;
		const frameDurationMs = 1000 / targetFrameRate;

		// Set up VideoDecoder
		const decoderConfig = await (this.demuxer as any).getDecoderConfig("video");

		this.decoder = new VideoDecoder({
			output: (frame: VideoFrame) => {
				if (this.frameResolvers.length > 0) {
					const resolver = this.frameResolvers.shift()!;
					resolver.resolve(frame);
				} else {
					this.pendingFrames.push(frame);
				}
			},
			error: (error: DOMException) => {
				this.decoderError = new Error(`VideoDecoder error: ${error.message}`);
				// Reject any waiting resolvers
				for (const resolver of this.frameResolvers) {
					resolver.reject(this.decoderError);
				}
				this.frameResolvers = [];
			},
		});

		this.decoder.configure(decoderConfig);

		// Read and decode all samples
		let exportTimestampUs = 0;
		let lastSourceMs = -1;
		const frameDurationUs = 1_000_000 / targetFrameRate;

		try {
			// Iterate through video samples from the demuxer
			let sampleIndex = 0;
			const totalSamples = this.metadata.sampleCount || 10000;

			while (sampleIndex < totalSamples && !this.cancelled) {
				if (options?.signal?.aborted) {
					this.cancelled = true;
					break;
				}

				if (this.decoderError) throw this.decoderError;

				// Get the next encoded video chunk from the demuxer
				const sample = await this.demuxer.readVideoSample(sampleIndex);
				if (!sample) break;

				const sourceTimestampMs = (sample.timestamp || 0) / 1000; // µs → ms

				// Skip if beyond video duration
				if (sourceTimestampMs > totalDurationMs + TIMESTAMP_EPSILON_MS) break;

				// Check if this frame falls within a trimmed region
				const isTrimmed = trims.some(
					(t) => sourceTimestampMs >= t.startMs && sourceTimestampMs < t.endMs,
				);

				if (isTrimmed) {
					sampleIndex++;
					continue;
				}

				// Determine speed at this timestamp
				let speed = 1;
				for (const region of speeds) {
					if (sourceTimestampMs >= region.startMs && sourceTimestampMs < region.endMs) {
						speed = region.speed;
						break;
					}
				}

				// Back-pressure: wait if decode queue is full
				while (
					this.decoder &&
					this.decoder.decodeQueueSize >= maxQueue &&
					!this.cancelled
				) {
					await new Promise((r) => setTimeout(r, DECODE_BACKPRESSURE_WAIT_MS));
				}

				if (this.cancelled) break;

				// Create EncodedVideoChunk and decode
				const chunk = new EncodedVideoChunk({
					type: sample.is_sync ? "key" : "delta",
					timestamp: sample.timestamp || 0,
					duration: sample.duration || 0,
					data: sample.data,
				});

				this.decoder.decode(chunk);

				// Wait for the decoded frame
				const frame = await this.waitForFrame();

				if (this.cancelled) {
					frame.close();
					break;
				}

				// Deliver to callback
				if (onFrame) {
					try {
						await onFrame(frame, exportTimestampUs, sourceTimestampMs);
					} catch (callbackError) {
						frame.close();
						throw callbackError;
					}
				} else {
					frame.close();
				}

				// Advance export timestamp based on speed
				exportTimestampUs += frameDurationUs / speed;
				sampleIndex++;
			}

			// Flush remaining frames
			if (this.decoder && this.decoder.state === "configured" && !this.cancelled) {
				await this.decoder.flush();
			}
		} finally {
			this.cleanup();
		}
	}

	/**
	 * Returns the underlying demuxer instance for audio processing.
	 */
	getDemuxer(): any {
		return this.demuxer;
	}

	/**
	 * Cancels any in-progress decode operation.
	 */
	cancel(): void {
		this.cancelled = true;
		// Close any pending frames
		for (const frame of this.pendingFrames) {
			frame.close();
		}
		this.pendingFrames = [];
		// Reject any waiting resolvers
		const cancelError = new Error("Decode cancelled");
		for (const resolver of this.frameResolvers) {
			resolver.reject(cancelError);
		}
		this.frameResolvers = [];
	}

	/**
	 * Destroys the decoder and releases resources.
	 */
	destroy(): void {
		this.cancel();
		this.cleanup();
		if (this.demuxer) {
			try {
				this.demuxer.close?.();
			} catch {
				// Ignore demuxer close errors
			}
			this.demuxer = null;
		}
		this.metadata = null;
	}

	// -----------------------------------------------------------------------
	// Internals
	// -----------------------------------------------------------------------

	private waitForFrame(): Promise<VideoFrame> {
		// Check if we already have a buffered frame
		if (this.pendingFrames.length > 0) {
			return Promise.resolve(this.pendingFrames.shift()!);
		}

		if (this.decoderError) {
			return Promise.reject(this.decoderError);
		}

		// Wait for the next frame from the decoder
		return new Promise<VideoFrame>((resolve, reject) => {
			this.frameResolvers.push({ resolve, reject });
		});
	}

	private cleanup(): void {
		if (this.decoder) {
			try {
				if (this.decoder.state === "configured") {
					this.decoder.close();
				}
			} catch {
				// Ignore close errors
			}
			this.decoder = null;
		}

		for (const frame of this.pendingFrames) {
			try { frame.close(); } catch { /* ignore */ }
		}
		this.pendingFrames = [];
		this.frameResolvers = [];
	}
}
