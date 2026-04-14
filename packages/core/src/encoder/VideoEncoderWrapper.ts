// ============================================================================
// Video Encoder Wrapper
//
// Wraps the WebCodecs VideoEncoder with:
//  - Automatic hardware → software fallback
//  - Stall detection with configurable timeout
//  - Back-pressure management with adaptive queue sizing
//  - Quality presets (draft → ultra)
//  - Progress reporting
// ============================================================================

import { type ExportConfig, EXPORT_QUALITY_PRESETS } from "../types/index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EncoderConfig {
	width: number;
	height: number;
	frameRate: number;
	bitrate: number;
	codec?: string;
	/** Hardware acceleration preference. Auto tries hardware first, then software. */
	hardwareAcceleration?: "auto" | "prefer-hardware" | "prefer-software";
	/** Maximum frames to queue in the encoder before applying back-pressure. */
	maxEncodeQueue?: number;
	/** Milliseconds without encoder output before declaring a stall. */
	stallTimeoutMs?: number;
	/** Key frame interval (every N frames). */
	keyFrameInterval?: number;
}

export interface EncoderOutput {
	chunk: EncodedVideoChunk;
	metadata?: EncodedVideoChunkMetadata;
}

export type EncoderOutputCallback = (output: EncoderOutput) => void | Promise<void>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_CODEC = "avc1.640033"; // H.264 High Level 5.1
const DEFAULT_MAX_ENCODE_QUEUE = 120;
const DEFAULT_MAX_ENCODE_QUEUE_SOFTWARE = 32;
const DEFAULT_STALL_TIMEOUT_MS = 15_000;
const DEFAULT_FLUSH_TIMEOUT_MS = 20_000;
const DEFAULT_KEY_FRAME_INTERVAL = 150;

// Supported codecs in preference order
const CODEC_PREFERENCES = [
	"avc1.640033", // H.264 High L5.1
	"avc1.42001e", // H.264 Baseline L3.0
	"vp09.00.10.08", // VP9 Profile 0
] as const;

// ---------------------------------------------------------------------------
// VideoEncoderWrapper
// ---------------------------------------------------------------------------

export class VideoEncoderWrapper {
	private encoder: VideoEncoder | null = null;
	private config: EncoderConfig;
	private outputCallback: EncoderOutputCallback;
	private encodeQueueSize = 0;
	private chunkCount = 0;
	private lastOutputAt = 0;
	private fatalError: Error | null = null;
	private closed = false;
	private videoDescription: Uint8Array | undefined;
	private videoColorSpace: VideoColorSpaceInit | undefined;
	private activeHardwareAcceleration: HardwareAcceleration = "prefer-hardware";

	constructor(config: EncoderConfig, onOutput: EncoderOutputCallback) {
		this.config = config;
		this.outputCallback = onOutput;
	}

	// -----------------------------------------------------------------------
	// Public API
	// -----------------------------------------------------------------------

	/**
	 * Initialises the encoder, trying hardware acceleration first,
	 * then falling back to software if necessary.
	 */
	async initialize(): Promise<void> {
		const preferences = this.getAccelerationPreferences();

		for (const preference of preferences) {
			try {
				await this.initializeWithAcceleration(preference);
				this.activeHardwareAcceleration = preference;
				console.log(
					`[VideoEncoderWrapper] Initialized with ${preference === "prefer-hardware" ? "hardware" : "software"} acceleration`,
				);
				return;
			} catch (error) {
				console.warn(
					`[VideoEncoderWrapper] ${preference} failed:`,
					error instanceof Error ? error.message : error,
				);
				this.cleanupEncoder();
			}
		}

		throw new Error("No supported video encoder configuration found on this system.");
	}

	/**
	 * Encodes a single video frame.
	 * Applies back-pressure if the encode queue is full.
	 */
	async encode(frame: VideoFrame, frameIndex: number): Promise<void> {
		if (this.closed || !this.encoder) {
			throw new Error("Encoder is not initialized or has been closed.");
		}

		if (this.fatalError) {
			throw this.fatalError;
		}

		const maxQueue = this.getMaxQueueSize();

		// Back-pressure: wait for encoder to catch up
		while (
			this.encoder &&
			this.encoder.encodeQueueSize >= maxQueue &&
			!this.closed
		) {
			// Stall detection
			if (Date.now() - this.lastOutputAt > this.getStallTimeout()) {
				throw new Error(
					this.activeHardwareAcceleration === "prefer-hardware"
						? "Hardware video encoder stalled. Retrying with software encoder."
						: "Video encoder stalled during export.",
				);
			}
			await new Promise((r) => setTimeout(r, 5));
		}

		if (this.closed || !this.encoder) return;

		if (this.encoder.state !== "configured") {
			console.warn(`[Frame ${frameIndex}] Encoder state: ${this.encoder.state}`);
			return;
		}

		const isKeyFrame = frameIndex % (this.config.keyFrameInterval || DEFAULT_KEY_FRAME_INTERVAL) === 0;

		this.encodeQueueSize++;
		this.encoder.encode(frame, { keyFrame: isKeyFrame });
	}

	/**
	 * Flushes remaining frames from the encoder.
	 */
	async flush(): Promise<void> {
		if (!this.encoder || this.encoder.state !== "configured") return;

		const timeoutMs = this.config.stallTimeoutMs ?? DEFAULT_FLUSH_TIMEOUT_MS;

		await this.withTimeout(
			this.encoder.flush(),
			timeoutMs,
			"Encoder flush timed out.",
		);
	}

	/**
	 * Closes the encoder and releases resources.
	 */
	close(): void {
		this.closed = true;
		this.cleanupEncoder();
	}

	/**
	 * Returns the video description (SPS/PPS for H.264) if available.
	 * This is needed by the muxer to write the MP4 header.
	 */
	getVideoDescription(): Uint8Array | undefined {
		return this.videoDescription;
	}

	/**
	 * Returns the video color space info if available.
	 */
	getVideoColorSpace(): VideoColorSpaceInit | undefined {
		return this.videoColorSpace;
	}

	/**
	 * Whether a fatal error has occurred.
	 */
	hasFatalError(): boolean {
		return this.fatalError !== null;
	}

	/**
	 * The fatal error, if any.
	 */
	getFatalError(): Error | null {
		return this.fatalError;
	}

	// -----------------------------------------------------------------------
	// Internals
	// -----------------------------------------------------------------------

	private async initializeWithAcceleration(
		hardwareAcceleration: HardwareAcceleration,
	): Promise<void> {
		this.encodeQueueSize = 0;
		this.chunkCount = 0;
		this.lastOutputAt = Date.now();
		this.fatalError = null;
		this.videoDescription = undefined;
		this.videoColorSpace = undefined;
		this.closed = false;

		const codec = this.config.codec || DEFAULT_CODEC;

		this.encoder = new VideoEncoder({
			output: (chunk, meta) => {
				this.lastOutputAt = Date.now();
				this.encodeQueueSize = Math.max(0, this.encodeQueueSize - 1);

				// Capture video description from first chunk
				if (meta?.decoderConfig?.description && !this.videoDescription) {
					const desc = meta.decoderConfig.description;
					if (desc instanceof ArrayBuffer || desc instanceof SharedArrayBuffer) {
						this.videoDescription = new Uint8Array(desc);
					} else if (ArrayBuffer.isView(desc)) {
						this.videoDescription = new Uint8Array(
							desc.buffer,
							desc.byteOffset,
							desc.byteLength,
						);
					}
				}

				// Capture color space
				if (meta?.decoderConfig?.colorSpace && !this.videoColorSpace) {
					this.videoColorSpace = meta.decoderConfig.colorSpace;
				}

				this.chunkCount++;

				// Deliver to consumer
				try {
					const result = this.outputCallback({ chunk, metadata: meta });
					if (result instanceof Promise) {
						result.catch((err) => {
							console.error("[VideoEncoderWrapper] Output callback error:", err);
						});
					}
				} catch (err) {
					console.error("[VideoEncoderWrapper] Output callback error:", err);
				}
			},
			error: (error) => {
				console.error("[VideoEncoderWrapper] Encoder error:", error);
				this.fatalError =
					error instanceof Error
						? error
						: new Error(`VideoEncoder error: ${String(error)}`);
			},
		});

		const encoderConfig: VideoEncoderConfig = {
			codec,
			width: this.config.width,
			height: this.config.height,
			bitrate: this.config.bitrate,
			framerate: this.config.frameRate,
			latencyMode: "quality",
			bitrateMode: "variable",
			hardwareAcceleration,
		};

		// Check support
		const support = await VideoEncoder.isConfigSupported(encoderConfig);
		if (!support.supported) {
			throw new Error(
				`Encoder config not supported (${hardwareAcceleration}, ${codec})`,
			);
		}

		this.encoder.configure(encoderConfig);
	}

	private getAccelerationPreferences(): HardwareAcceleration[] {
		const pref = this.config.hardwareAcceleration || "auto";

		if (pref === "prefer-hardware") return ["prefer-hardware"];
		if (pref === "prefer-software") return ["prefer-software"];

		// Auto: try both. On Windows, start with software (more reliable).
		if (typeof navigator !== "undefined" && /\bWindows\b/i.test(navigator.userAgent)) {
			return ["prefer-software", "prefer-hardware"];
		}
		return ["prefer-hardware", "prefer-software"];
	}

	private getMaxQueueSize(): number {
		if (this.config.maxEncodeQueue) return this.config.maxEncodeQueue;
		return this.activeHardwareAcceleration === "prefer-software"
			? DEFAULT_MAX_ENCODE_QUEUE_SOFTWARE
			: DEFAULT_MAX_ENCODE_QUEUE;
	}

	private getStallTimeout(): number {
		return this.config.stallTimeoutMs ?? DEFAULT_STALL_TIMEOUT_MS;
	}

	private cleanupEncoder(): void {
		if (this.encoder) {
			try {
				if (this.encoder.state === "configured") {
					this.encoder.close();
				}
			} catch {
				// Ignore
			}
			this.encoder = null;
		}
		this.encodeQueueSize = 0;
	}

	private withTimeout<T>(
		promise: Promise<T>,
		timeoutMs: number,
		message: string,
	): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
			promise.then(
				(value) => {
					clearTimeout(timer);
					resolve(value);
				},
				(error) => {
					clearTimeout(timer);
					reject(error);
				},
			);
		});
	}
}

// ---------------------------------------------------------------------------
// Utility: Pick codec
// ---------------------------------------------------------------------------

/**
 * Selects the best supported codec from a preference list.
 */
export async function selectBestCodec(
	width: number,
	height: number,
): Promise<string> {
	for (const codec of CODEC_PREFERENCES) {
		try {
			const support = await VideoEncoder.isConfigSupported({
				codec,
				width,
				height,
				bitrate: 8_000_000,
				framerate: 30,
			});
			if (support.supported) return codec;
		} catch {
			continue;
		}
	}
	return DEFAULT_CODEC;
}

/**
 * Returns an ExportConfig from a quality preset name.
 */
export function getExportConfigForPreset(
	preset: keyof typeof EXPORT_QUALITY_PRESETS,
	width: number,
	height: number,
	codec?: string,
): ExportConfig {
	const p = EXPORT_QUALITY_PRESETS[preset];
	return {
		width,
		height,
		frameRate: p.frameRate,
		bitrate: p.bitrate,
		codec: codec || DEFAULT_CODEC,
		format: "mp4",
	};
}
