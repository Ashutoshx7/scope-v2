// ============================================================================
// Timeline Engine Tests
// ============================================================================

import { describe, it, expect } from "vitest";
import {
	createZoomRegion,
	createTrimRegion,
	createSpeedRegion,
	validateZoomRegion,
	calculateEffectiveDuration,
	getActiveZoomAtTime,
	clamp,
	generateId,
	DEFAULT_EXPORT_CONFIG,
} from "../src/index.js";

describe("clamp", () => {
	it("returns value when within range", () => {
		expect(clamp(5, 0, 10)).toBe(5);
	});

	it("clamps to min", () => {
		expect(clamp(-5, 0, 10)).toBe(0);
	});

	it("clamps to max", () => {
		expect(clamp(15, 0, 10)).toBe(10);
	});

	it("handles equal min and max", () => {
		expect(clamp(5, 3, 3)).toBe(3);
	});
});

describe("generateId", () => {
	it("returns a string", () => {
		expect(typeof generateId()).toBe("string");
	});

	it("generates unique IDs", () => {
		const ids = new Set(Array.from({ length: 100 }, () => generateId()));
		expect(ids.size).toBe(100);
	});
});

describe("createZoomRegion", () => {
	it("creates a zoom region with defaults", () => {
		const region = createZoomRegion(1000, 5000);
		expect(region.startMs).toBe(1000);
		expect(region.endMs).toBe(5000);
		expect(region.depth).toBe(2);
		expect(region.focusCx).toBe(0.5);
		expect(region.focusCy).toBe(0.5);
		expect(region.id).toBeTruthy();
	});

	it("accepts overrides", () => {
		const region = createZoomRegion(0, 3000, { depth: 3, focusCx: 0.2 });
		expect(region.depth).toBe(3);
		expect(region.focusCx).toBe(0.2);
	});
});

describe("createTrimRegion", () => {
	it("creates a trim region", () => {
		const region = createTrimRegion(500, 1500);
		expect(region.startMs).toBe(500);
		expect(region.endMs).toBe(1500);
		expect(region.id).toBeTruthy();
	});
});

describe("createSpeedRegion", () => {
	it("creates a speed region with default speed", () => {
		const region = createSpeedRegion(0, 2000);
		expect(region.speed).toBe(1.5);
	});

	it("accepts custom speed", () => {
		const region = createSpeedRegion(0, 2000, { speed: 0.5 });
		expect(region.speed).toBe(0.5);
	});
});

describe("validateZoomRegion", () => {
	it("validates a correct region", () => {
		const region = createZoomRegion(1000, 5000);
		expect(validateZoomRegion(region)).toBe(true);
	});

	it("rejects region with start >= end", () => {
		const region = createZoomRegion(5000, 1000);
		expect(validateZoomRegion(region)).toBe(false);
	});

	it("rejects region with invalid depth", () => {
		const region = createZoomRegion(0, 1000, { depth: 0 });
		expect(validateZoomRegion(region)).toBe(false);
	});
});

describe("calculateEffectiveDuration", () => {
	it("returns total duration with no trims or speed changes", () => {
		expect(calculateEffectiveDuration(10000, [], [])).toBe(10000);
	});

	it("subtracts trimmed regions", () => {
		const trims = [createTrimRegion(2000, 4000)];
		expect(calculateEffectiveDuration(10000, trims, [])).toBe(8000);
	});

	it("adjusts for speed regions", () => {
		const speeds = [createSpeedRegion(0, 4000, { speed: 2 })];
		// 4000ms at 2x = 2000ms effective, plus 6000ms at 1x = 8000ms
		expect(calculateEffectiveDuration(10000, [], speeds)).toBe(8000);
	});

	it("handles combined trims and speed", () => {
		const trims = [createTrimRegion(8000, 10000)];
		const speeds = [createSpeedRegion(0, 4000, { speed: 2 })];
		// Remove 2s from trim, 4s at 2x = 2s + 4s at 1x = 6s
		expect(calculateEffectiveDuration(10000, trims, speeds)).toBe(6000);
	});
});

describe("getActiveZoomAtTime", () => {
	it("returns null when no zoom is active", () => {
		const regions = [createZoomRegion(5000, 10000)];
		expect(getActiveZoomAtTime(regions, 3000)).toBeNull();
	});

	it("returns active region", () => {
		const region = createZoomRegion(5000, 10000);
		const result = getActiveZoomAtTime([region], 7000);
		expect(result).not.toBeNull();
		expect(result!.id).toBe(region.id);
	});
});

describe("DEFAULT_EXPORT_CONFIG", () => {
	it("has 1080p defaults", () => {
		expect(DEFAULT_EXPORT_CONFIG.width).toBe(1920);
		expect(DEFAULT_EXPORT_CONFIG.height).toBe(1080);
		expect(DEFAULT_EXPORT_CONFIG.frameRate).toBe(30);
		expect(DEFAULT_EXPORT_CONFIG.format).toBe("mp4");
	});
});
