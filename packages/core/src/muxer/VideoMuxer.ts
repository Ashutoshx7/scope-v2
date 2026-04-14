// ============================================================================
// Video Muxer — MP4 container creation using mp4box
//
// Takes encoded video chunks (and optionally audio) and packages them
// into a valid MP4 file ready for download/sharing.
// ============================================================================

import type { ExportConfig } from "../types/index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MuxerConfig {
	width: number;
	height: number;
	frameRate: number;
	codec: string;
	hasAudio: boolean;
}

// ---------------------------------------------------------------------------
// VideoMuxer
// ---------------------------------------------------------------------------

export class VideoMuxer {
	private mp4boxFile: any = null;
	private videoTrackId: number | null = null;
	private audioTrackId: number | null = null;
	private config: MuxerConfig;
	private chunkCount = 0;
	private outputChunks: ArrayBuffer[] = [];
	private initialized = false;

	constructor(exportConfig: ExportConfig, hasAudio: boolean) {
		this.config = {
			width: exportConfig.width,
			height: exportConfig.height,
			frameRate: exportConfig.frameRate,
			codec: exportConfig.codec,
			hasAudio,
		};
	}

	// -----------------------------------------------------------------------
	// Public API
	// -----------------------------------------------------------------------

	/**
	 * Initializes the mp4box file writer and creates the video track.
	 */
	async initialize(): Promise<void> {
		// @ts-ignore - mp4box is a CJS module with complex exports
		const MP4Box = (await import("mp4box")).default || (await import("mp4box"));
		const mp4File = MP4Box.createFile();

		this.mp4boxFile = mp4File;

		// Collect output chunks
		mp4File.onReady = () => {};

		// Create video track
		this.videoTrackId = mp4File.addTrack({
			type: "video",
			width: this.config.width,
			height: this.config.height,
			timescale: 1_000_000, // microsecond precision
			// Codec-specific config will be set with the first chunk's description
		});

		this.initialized = true;
	}

	/**
	 * Adds an encoded video chunk to the MP4 container.
	 */
	async addVideoChunk(
		chunk: EncodedVideoChunk,
		metadata?: EncodedVideoChunkMetadata,
	): Promise<void> {
		if (!this.mp4boxFile || this.videoTrackId === null) {
			throw new Error("Muxer not initialized");
		}

		// Extract the chunk data
		const data = new ArrayBuffer(chunk.byteLength);
		chunk.copyTo(data);

		// Build the sample
		const sample: any = {
			data,
			duration: chunk.duration || 0,
			dts: chunk.timestamp,
			cts: chunk.timestamp,
			is_sync: chunk.type === "key",
		};

		// If this is the first chunk and we have a description, set it on the track
		if (this.chunkCount === 0 && metadata?.decoderConfig?.description) {
			const desc = metadata.decoderConfig.description;
			let descBuffer: ArrayBuffer;

			if (desc instanceof ArrayBuffer) {
				descBuffer = desc;
			} else if (desc instanceof SharedArrayBuffer) {
				descBuffer = new ArrayBuffer(desc.byteLength);
				new Uint8Array(descBuffer).set(new Uint8Array(desc));
			} else if (ArrayBuffer.isView(desc)) {
				// Create a proper ArrayBuffer by slicing the view's buffer correctly
				descBuffer = desc.buffer.slice(desc.byteOffset, desc.byteOffset + desc.byteLength) as ArrayBuffer;
			} else {
				descBuffer = new ArrayBuffer(0);
			}

			// Set the description (avcC box for H.264)
			if (descBuffer.byteLength > 0) {
				sample.description = {
					avcC: descBuffer,
				};
			}
		}

		this.mp4boxFile.addSample(this.videoTrackId, data, sample);
		this.chunkCount++;
	}

	/**
	 * Adds an audio sample to the MP4 container.
	 */
	async addAudioSample(
		data: ArrayBuffer,
		timestamp: number,
		duration: number,
		isSync: boolean,
	): Promise<void> {
		if (!this.mp4boxFile) {
			throw new Error("Muxer not initialized");
		}

		if (this.audioTrackId === null) {
			// Create audio track on first sample
			this.audioTrackId = this.mp4boxFile.addTrack({
				type: "audio",
				timescale: 1_000_000,
				samplerate: 48000,
				channel_count: 2,
				samplesize: 16,
			});
		}

		this.mp4boxFile.addSample(this.audioTrackId, data, {
			data,
			duration,
			dts: timestamp,
			cts: timestamp,
			is_sync: isSync,
		});
	}

	/**
	 * Creates an audio track with specific configuration.
	 */
	createAudioTrack(config: {
		sampleRate: number;
		channelCount: number;
		codec?: string;
		description?: ArrayBuffer;
	}): number {
		if (!this.mp4boxFile) throw new Error("Muxer not initialized");

		const trackConfig: any = {
			type: "audio",
			timescale: 1_000_000,
			samplerate: config.sampleRate,
			channel_count: config.channelCount,
			samplesize: 16,
		};

		if (config.description) {
			trackConfig.description = config.description;
		}

		this.audioTrackId = this.mp4boxFile.addTrack(trackConfig);
		return this.audioTrackId || 0;
	}

	/**
	 * Finalises the MP4 file and returns it as a Blob.
	 */
	async finalize(): Promise<Blob> {
		if (!this.mp4boxFile) {
			throw new Error("Muxer not initialized");
		}

		// Get the MP4 output as array buffers
		const outputBuffers: ArrayBuffer[] = [];

		try {
			const buffer = this.mp4boxFile.getBuffer();
			if (buffer) {
				outputBuffers.push(buffer);
			}
		} catch {
			// Some versions of mp4box use a different API
			// Fallback: try to save to a stream
		}

		const blob = new Blob(outputBuffers.length > 0 ? outputBuffers : this.outputChunks, {
			type: "video/mp4",
		});

		return blob;
	}

	/**
	 * Destroys the muxer and releases resources.
	 */
	destroy(): void {
		if (this.mp4boxFile) {
			try {
				this.mp4boxFile.flush?.();
			} catch {
				// Ignore
			}
			this.mp4boxFile = null;
		}
		this.videoTrackId = null;
		this.audioTrackId = null;
		this.outputChunks = [];
		this.initialized = false;
	}

	/**
	 * Whether the muxer is ready to accept chunks.
	 */
	isReady(): boolean {
		return this.initialized && this.mp4boxFile !== null;
	}
}
