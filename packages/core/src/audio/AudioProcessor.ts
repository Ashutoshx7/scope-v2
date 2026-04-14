// ============================================================================
// Audio Processor
//
// Handles:
//  - Audio extraction from video containers
//  - Multi-track mixing (system audio + microphone)
//  - Volume normalization
//  - Audio encoding for MP4 muxing
//  - Waveform data generation for timeline visualization
// ============================================================================

import { clamp } from "../types/index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AudioTrack {
	/** Track identifier. */
	id: string;
	/** Display label. */
	label: string;
	/** Volume multiplier (0–1). */
	volume: number;
	/** Whether this track is muted. */
	muted: boolean;
	/** Audio data as AudioBuffer. */
	buffer?: AudioBuffer;
}

export interface WaveformData {
	/** Normalised amplitudes (0–1), one per bucket. */
	amplitudes: Float32Array;
	/** Duration in seconds. */
	duration: number;
	/** Number of buckets. */
	bucketCount: number;
}

export interface AudioEncodeResult {
	/** Encoded audio data chunks. */
	chunks: Array<{
		data: ArrayBuffer;
		timestamp: number;
		duration: number;
		isSync: boolean;
	}>;
	/** Sample rate of the encoded audio. */
	sampleRate: number;
	/** Number of channels. */
	channelCount: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_SAMPLE_RATE = 48000;
const DEFAULT_CHANNEL_COUNT = 2;
const WAVEFORM_DEFAULT_BUCKETS = 800;

// ---------------------------------------------------------------------------
// AudioProcessor
// ---------------------------------------------------------------------------

export class AudioProcessor {
	private audioContext: OfflineAudioContext | AudioContext | null = null;
	private tracks: AudioTrack[] = [];

	constructor() {}

	// -----------------------------------------------------------------------
	// Public API
	// -----------------------------------------------------------------------

	/**
	 * Decodes audio from an ArrayBuffer (e.g., from a video file).
	 */
	async decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer> {
		const ctx = new AudioContext({ sampleRate: DEFAULT_SAMPLE_RATE });
		try {
			const buffer = await ctx.decodeAudioData(data.slice(0));
			return buffer;
		} finally {
			await ctx.close();
		}
	}

	/**
	 * Adds an audio track to the mix.
	 */
	addTrack(track: AudioTrack): void {
		this.tracks.push(track);
	}

	/**
	 * Removes an audio track.
	 */
	removeTrack(trackId: string): void {
		this.tracks = this.tracks.filter((t) => t.id !== trackId);
	}

	/**
	 * Sets the volume of a track.
	 */
	setTrackVolume(trackId: string, volume: number): void {
		const track = this.tracks.find((t) => t.id === trackId);
		if (track) {
			track.volume = clamp(volume, 0, 1);
		}
	}

	/**
	 * Mixes all tracks into a single AudioBuffer.
	 */
	async mixTracks(
		options?: {
			sampleRate?: number;
			channelCount?: number;
			durationSec?: number;
		},
	): Promise<AudioBuffer> {
		const sampleRate = options?.sampleRate || DEFAULT_SAMPLE_RATE;
		const channelCount = options?.channelCount || DEFAULT_CHANNEL_COUNT;

		// Find the longest track duration
		let maxDuration = 0;
		for (const track of this.tracks) {
			if (track.buffer && !track.muted) {
				maxDuration = Math.max(maxDuration, track.buffer.duration);
			}
		}

		const duration = options?.durationSec || maxDuration;
		if (duration <= 0) {
			throw new Error("No audio tracks with data to mix");
		}

		const totalSamples = Math.ceil(duration * sampleRate);
		const offlineCtx = new OfflineAudioContext(channelCount, totalSamples, sampleRate);

		// Create source nodes for each track
		for (const track of this.tracks) {
			if (!track.buffer || track.muted) continue;

			const source = offlineCtx.createBufferSource();
			source.buffer = track.buffer;

			const gainNode = offlineCtx.createGain();
			gainNode.gain.value = track.volume;

			source.connect(gainNode);
			gainNode.connect(offlineCtx.destination);
			source.start(0);
		}

		return await offlineCtx.startRendering();
	}

	/**
	 * Normalises audio volume to a target peak level.
	 */
	normalizeVolume(
		buffer: AudioBuffer,
		targetPeak: number = 0.9,
	): AudioBuffer {
		// Find peak amplitude across all channels
		let peak = 0;
		for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
			const data = buffer.getChannelData(ch);
			for (let i = 0; i < data.length; i++) {
				peak = Math.max(peak, Math.abs(data[i]));
			}
		}

		if (peak === 0 || peak >= targetPeak) return buffer;

		// Scale all samples
		const scale = targetPeak / peak;
		const result = new AudioBuffer({
			length: buffer.length,
			numberOfChannels: buffer.numberOfChannels,
			sampleRate: buffer.sampleRate,
		});

		for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
			const input = buffer.getChannelData(ch);
			const output = result.getChannelData(ch);
			for (let i = 0; i < input.length; i++) {
				output[i] = clamp(input[i] * scale, -1, 1);
			}
		}

		return result;
	}

	/**
	 * Generates waveform data for timeline visualization.
	 */
	generateWaveform(
		buffer: AudioBuffer,
		bucketCount: number = WAVEFORM_DEFAULT_BUCKETS,
	): WaveformData {
		const amplitudes = new Float32Array(bucketCount);
		const samplesPerBucket = Math.floor(buffer.length / bucketCount);

		if (samplesPerBucket === 0) {
			return { amplitudes, duration: buffer.duration, bucketCount };
		}

		// Mix all channels for waveform (mono representation)
		const channelCount = buffer.numberOfChannels;

		for (let bucket = 0; bucket < bucketCount; bucket++) {
			const startSample = bucket * samplesPerBucket;
			const endSample = Math.min(startSample + samplesPerBucket, buffer.length);
			let maxAmplitude = 0;

			for (let ch = 0; ch < channelCount; ch++) {
				const channelData = buffer.getChannelData(ch);
				for (let i = startSample; i < endSample; i++) {
					maxAmplitude = Math.max(maxAmplitude, Math.abs(channelData[i]));
				}
			}

			amplitudes[bucket] = maxAmplitude;
		}

		return {
			amplitudes,
			duration: buffer.duration,
			bucketCount,
		};
	}

	/**
	 * Encodes an AudioBuffer into chunks suitable for muxing.
	 * Uses AudioEncoder if available, otherwise falls back to
	 * raw PCM data.
	 */
	async encodeAudio(
		buffer: AudioBuffer,
		options?: {
			codec?: string;
			bitrate?: number;
		},
	): Promise<AudioEncodeResult> {
		const chunks: AudioEncodeResult["chunks"] = [];
		const codec = options?.codec || "mp4a.40.2"; // AAC-LC
		const bitrate = options?.bitrate || 128_000;

		// Check if AudioEncoder is available
		if (typeof AudioEncoder === "undefined") {
			// Fallback: return raw PCM data
			return this.encodeAudioPCM(buffer);
		}

		return new Promise<AudioEncodeResult>((resolve, reject) => {
			const encoder = new AudioEncoder({
				// @ts-ignore - Web Audio API types vary across environments
		output: (chunk: any, _meta?: any) => {
					const data = new ArrayBuffer(chunk.byteLength);
					chunk.copyTo(data);
					chunks.push({
						data,
						timestamp: chunk.timestamp,
						duration: chunk.duration || 0,
						isSync: chunk.type === "key",
					});
				},
				error: (error: DOMException) => {
					reject(new Error(`AudioEncoder error: ${error.message}`));
				},
			});

			encoder.configure({
				codec,
				sampleRate: buffer.sampleRate,
				numberOfChannels: buffer.numberOfChannels,
				bitrate,
			});

			// Feed audio data as AudioData frames
			const frameSize = 1024; // Standard AAC frame size
			const totalFrames = Math.ceil(buffer.length / frameSize);

			for (let i = 0; i < totalFrames; i++) {
				const startSample = i * frameSize;
				const endSample = Math.min(startSample + frameSize, buffer.length);
				const frameSamples = endSample - startSample;

				// Interleave channel data
				const interleaved = new Float32Array(frameSamples * buffer.numberOfChannels);
				for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
					const channelData = buffer.getChannelData(ch);
					for (let s = 0; s < frameSamples; s++) {
						interleaved[s * buffer.numberOfChannels + ch] = channelData[startSample + s];
					}
				}

				const audioData = new AudioData({
					format: "f32-planar",
					sampleRate: buffer.sampleRate,
					numberOfFrames: frameSamples,
					numberOfChannels: buffer.numberOfChannels,
					timestamp: Math.floor((startSample / buffer.sampleRate) * 1_000_000),
					data: interleaved,
				});

				encoder.encode(audioData);
				audioData.close();
			}

			encoder.flush().then(() => {
				encoder.close();
				resolve({
					chunks,
					sampleRate: buffer.sampleRate,
					channelCount: buffer.numberOfChannels,
				});
			}).catch(reject);
		});
	}

	/**
	 * Cleans up resources.
	 */
	destroy(): void {
		this.tracks = [];
		if (this.audioContext) {
			try {
				(this.audioContext as AudioContext).close?.();
			} catch { /* ignore */ }
			this.audioContext = null;
		}
	}

	// -----------------------------------------------------------------------
	// Internals
	// -----------------------------------------------------------------------

	private encodeAudioPCM(buffer: AudioBuffer): AudioEncodeResult {
		// Raw PCM fallback — convert to 16-bit integer
		const chunks: AudioEncodeResult["chunks"] = [];
		const frameSize = 4096;
		const channelCount = buffer.numberOfChannels;
		const totalFrames = Math.ceil(buffer.length / frameSize);

		for (let i = 0; i < totalFrames; i++) {
			const startSample = i * frameSize;
			const endSample = Math.min(startSample + frameSize, buffer.length);
			const frameSamples = endSample - startSample;
			const pcmData = new Int16Array(frameSamples * channelCount);

			for (let ch = 0; ch < channelCount; ch++) {
				const channelData = buffer.getChannelData(ch);
				for (let s = 0; s < frameSamples; s++) {
					const sample = clamp(channelData[startSample + s], -1, 1);
					pcmData[s * channelCount + ch] = Math.floor(sample * 32767);
				}
			}

			const timestamp = Math.floor((startSample / buffer.sampleRate) * 1_000_000);
			const duration = Math.floor((frameSamples / buffer.sampleRate) * 1_000_000);

			chunks.push({
				data: pcmData.buffer,
				timestamp,
				duration,
				isSync: true,
			});
		}

		return {
			chunks,
			sampleRate: buffer.sampleRate,
			channelCount,
		};
	}
}
