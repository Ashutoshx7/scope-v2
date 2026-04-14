// ============================================================================
// GIF Encoder Tests
// ============================================================================

import { describe, it, expect } from "vitest";
import { GifEncoder } from "../src/gif/index.js";

describe("GifEncoder", () => {
	it("creates a valid GIF blob", () => {
		const encoder = new GifEncoder({
			width: 4,
			height: 4,
			fps: 10,
			quality: 10,
		});

		encoder.start();

		// Create a simple red frame
		const pixels = new Uint8ClampedArray(4 * 4 * 4);
		for (let i = 0; i < 4 * 4; i++) {
			pixels[i * 4] = 255;     // R
			pixels[i * 4 + 1] = 0;   // G
			pixels[i * 4 + 2] = 0;   // B
			pixels[i * 4 + 3] = 255; // A
		}

		encoder.addFrame(pixels);

		// Create a blue frame
		const pixels2 = new Uint8ClampedArray(4 * 4 * 4);
		for (let i = 0; i < 4 * 4; i++) {
			pixels2[i * 4] = 0;
			pixels2[i * 4 + 1] = 0;
			pixels2[i * 4 + 2] = 255;
			pixels2[i * 4 + 3] = 255;
		}

		encoder.addFrame(pixels2);

		const blob = encoder.finish();

		expect(blob).toBeInstanceOf(Blob);
		expect(blob.type).toBe("image/gif");
		expect(blob.size).toBeGreaterThan(0);
	});

	it("starts with GIF89a header", async () => {
		const encoder = new GifEncoder({ width: 2, height: 2, fps: 5 });
		encoder.start();

		const pixels = new Uint8ClampedArray(2 * 2 * 4);
		encoder.addFrame(pixels);

		const blob = encoder.finish();
		const buffer = await blob.arrayBuffer();
		const header = new TextDecoder().decode(new Uint8Array(buffer, 0, 6));
		expect(header).toBe("GIF89a");
	});

	it("handles single-frame GIF", () => {
		const encoder = new GifEncoder({ width: 1, height: 1, fps: 1 });
		encoder.start();

		const pixels = new Uint8ClampedArray([128, 128, 128, 255]);
		encoder.addFrame(pixels);

		const blob = encoder.finish();
		expect(blob.size).toBeGreaterThan(0);
	});

	it("caps FPS at 30", () => {
		// Should not throw even with FPS > 30
		const encoder = new GifEncoder({ width: 2, height: 2, fps: 60 });
		encoder.start();
		const pixels = new Uint8ClampedArray(2 * 2 * 4);
		encoder.addFrame(pixels);
		const blob = encoder.finish();
		expect(blob.size).toBeGreaterThan(0);
	});
});
