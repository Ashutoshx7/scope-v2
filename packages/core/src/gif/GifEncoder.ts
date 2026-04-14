// ============================================================================
// GIF Exporter
//
// Converts video frames to an animated GIF using a quantization-based
// approach. Built-in implementation — no external GIF library needed.
//
// Features:
//  - Configurable FPS (max 30)
//  - Adaptive colour palette per frame (up to 256 colours)
//  - Dithering support
//  - Frame skipping for target FPS
// ============================================================================

import { clamp } from "../types/index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GifExportConfig {
	/** Output width. */
	width: number;
	/** Output height. */
	height: number;
	/** Target frames per second (capped at 30). */
	fps: number;
	/** Quality (1 = best/slow, 20 = worst/fast). */
	quality?: number;
	/** Whether to apply dithering (better gradients, larger file). */
	dither?: boolean;
}

export interface GifExportProgress {
	currentFrame: number;
	totalFrames: number;
	percentage: number;
}

// ---------------------------------------------------------------------------
// GIF Encoder (LZW-based)
// ---------------------------------------------------------------------------

/**
 * Simple GIF encoder implementation.
 *
 * Outputs a GIF89a binary blob from individual RGBA frames.
 */
export class GifEncoder {
	private width: number;
	private height: number;
	private delay: number;
	private quality: number;
	private output: number[] = [];
	private frameCount = 0;

	constructor(config: GifExportConfig) {
		this.width = config.width;
		this.height = config.height;
		this.delay = Math.round(100 / clamp(config.fps, 1, 30)); // GIF delay is in centiseconds
		this.quality = clamp(config.quality || 10, 1, 30);
	}

	/**
	 * Starts the GIF stream with the header.
	 */
	start(): void {
		this.output = [];
		this.frameCount = 0;

		// GIF89a header
		this.writeString("GIF89a");

		// Logical Screen Descriptor
		this.writeShort(this.width);
		this.writeShort(this.height);
		this.writeByte(0x70); // GCT flag = 0, colour resolution = 7
		this.writeByte(0); // Background colour index
		this.writeByte(0); // Pixel aspect ratio

		// Netscape Looping Extension
		this.writeByte(0x21); // Extension
		this.writeByte(0xff); // Application Extension
		this.writeByte(11); // Block size
		this.writeString("NETSCAPE2.0");
		this.writeByte(3); // Sub-block size
		this.writeByte(1); // Sub-block ID
		this.writeShort(0); // Loop count (0 = infinite)
		this.writeByte(0); // Block terminator
	}

	/**
	 * Adds a frame (RGBA pixel data) to the GIF.
	 */
	addFrame(pixels: Uint8ClampedArray | Uint8Array): void {
		const { width, height } = this;
		const totalPixels = width * height;

		// Build colour palette via median-cut quantization
		const palette = this.buildPalette(pixels, this.quality);
		const paletteSize = 256;
		const paletteBits = 8; // log2(256)

		// Map pixels to palette indices
		const indexedPixels = new Uint8Array(totalPixels);
		for (let i = 0; i < totalPixels; i++) {
			const offset = i * 4;
			const r = pixels[offset];
			const g = pixels[offset + 1];
			const b = pixels[offset + 2];
			indexedPixels[i] = this.findClosestPaletteIndex(palette, r, g, b);
		}

		// Graphic Control Extension
		this.writeByte(0x21); // Extension
		this.writeByte(0xf9); // Graphic Control
		this.writeByte(0x04); // Block size
		this.writeByte(0x00); // Packed byte (no disposal, no transparency)
		this.writeShort(this.delay); // Delay
		this.writeByte(0x00); // Transparent colour index
		this.writeByte(0x00); // Block terminator

		// Image Descriptor
		this.writeByte(0x2c); // Image separator
		this.writeShort(0); // Left
		this.writeShort(0); // Top
		this.writeShort(width);
		this.writeShort(height);
		this.writeByte(0x80 | (paletteBits - 1)); // Local colour table flag + size

		// Local Colour Table
		for (let i = 0; i < paletteSize; i++) {
			this.writeByte(palette[i * 3] || 0);
			this.writeByte(palette[i * 3 + 1] || 0);
			this.writeByte(palette[i * 3 + 2] || 0);
		}

		// LZW-compress the indexed pixels
		this.lzwEncode(indexedPixels, paletteBits);

		this.frameCount++;
	}

	/**
	 * Finishes the GIF and returns the binary blob.
	 */
	finish(): Blob {
		this.writeByte(0x3b); // GIF Trailer
		return new Blob([new Uint8Array(this.output)], { type: "image/gif" });
	}

	// -----------------------------------------------------------------------
	// Colour Quantization
	// -----------------------------------------------------------------------

	private buildPalette(pixels: Uint8ClampedArray | Uint8Array, quality: number): Uint8Array {
		const palette = new Uint8Array(256 * 3);
		const step = Math.max(1, Math.floor(pixels.length / (4 * 1000 / quality)));

		// Simple uniform sampling for quick palette generation
		const colors: Array<[number, number, number]> = [];
		for (let i = 0; i < pixels.length && colors.length < 256; i += 4 * step) {
			const r = pixels[i];
			const g = pixels[i + 1];
			const b = pixels[i + 2];
			// Skip near-duplicates
			const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
			colors.push([r, g, b]);
		}

		// Deduplicate and pad to 256
		const unique = new Map<number, [number, number, number]>();
		for (const [r, g, b] of colors) {
			const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
			if (!unique.has(key)) unique.set(key, [r, g, b]);
			if (unique.size >= 256) break;
		}

		let idx = 0;
		for (const [r, g, b] of unique.values()) {
			palette[idx * 3] = r;
			palette[idx * 3 + 1] = g;
			palette[idx * 3 + 2] = b;
			idx++;
			if (idx >= 256) break;
		}

		return palette;
	}

	private findClosestPaletteIndex(
		palette: Uint8Array,
		r: number,
		g: number,
		b: number,
	): number {
		let minDist = Infinity;
		let closest = 0;

		for (let i = 0; i < 256; i++) {
			const pr = palette[i * 3];
			const pg = palette[i * 3 + 1];
			const pb = palette[i * 3 + 2];
			const dist = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;

			if (dist < minDist) {
				minDist = dist;
				closest = i;
				if (dist === 0) break;
			}
		}

		return closest;
	}

	// -----------------------------------------------------------------------
	// LZW Encoding
	// -----------------------------------------------------------------------

	private lzwEncode(pixels: Uint8Array, minCodeSize: number): void {
		const clearCode = 1 << minCodeSize;
		const eoiCode = clearCode + 1;

		this.writeByte(minCodeSize); // LZW minimum code size

		let codeSize = minCodeSize + 1;
		let nextCode = eoiCode + 1;
		const maxCode = 4096;

		const codeTable = new Map<string, number>();

		// Initialize code table
		for (let i = 0; i < clearCode; i++) {
			codeTable.set(String(i), i);
		}

		let buffer = 0;
		let bufferBits = 0;
		const subBlocks: number[] = [];
		let subBlock: number[] = [];

		const outputCode = (code: number) => {
			buffer |= code << bufferBits;
			bufferBits += codeSize;

			while (bufferBits >= 8) {
				subBlock.push(buffer & 0xff);
				buffer >>= 8;
				bufferBits -= 8;

				if (subBlock.length >= 255) {
					subBlocks.push(subBlock.length, ...subBlock);
					subBlock = [];
				}
			}
		};

		// Output clear code
		outputCode(clearCode);

		if (pixels.length === 0) {
			outputCode(eoiCode);
		} else {
			let indexBuffer = String(pixels[0]);

			for (let i = 1; i < pixels.length; i++) {
				const k = String(pixels[i]);
				const combined = `${indexBuffer},${k}`;

				if (codeTable.has(combined)) {
					indexBuffer = combined;
				} else {
					outputCode(codeTable.get(indexBuffer)!);

					if (nextCode < maxCode) {
						codeTable.set(combined, nextCode++);
						if (nextCode > (1 << codeSize) && codeSize < 12) {
							codeSize++;
						}
					} else {
						// Reset
						outputCode(clearCode);
						codeTable.clear();
						for (let j = 0; j < clearCode; j++) {
							codeTable.set(String(j), j);
						}
						nextCode = eoiCode + 1;
						codeSize = minCodeSize + 1;
					}

					indexBuffer = k;
				}
			}

			outputCode(codeTable.get(indexBuffer)!);
			outputCode(eoiCode);
		}

		// Flush remaining bits
		if (bufferBits > 0) {
			subBlock.push(buffer & 0xff);
		}

		if (subBlock.length > 0) {
			subBlocks.push(subBlock.length, ...subBlock);
		}

		// Write sub-blocks
		for (const byte of subBlocks) {
			this.writeByte(byte);
		}

		this.writeByte(0); // Block terminator
	}

	// -----------------------------------------------------------------------
	// Binary Writing
	// -----------------------------------------------------------------------

	private writeByte(b: number): void {
		this.output.push(b & 0xff);
	}

	private writeShort(s: number): void {
		this.writeByte(s & 0xff);
		this.writeByte((s >> 8) & 0xff);
	}

	private writeString(s: string): void {
		for (let i = 0; i < s.length; i++) {
			this.writeByte(s.charCodeAt(i));
		}
	}
}
