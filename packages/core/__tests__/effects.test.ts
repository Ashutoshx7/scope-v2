// ============================================================================
// Effects & Auto-Zoom Tests
// ============================================================================

import { describe, it, expect } from "vitest";
import {
	applyEasing,
	calculateZoomTransition,
	DEFAULT_TRANSITION,
	suggestZoomRegions,
} from "../src/effects/index.js";
import {
	analyseCursorTelemetry,
	simplifyTelemetry,
} from "../src/cursor/index.js";
import type { CursorTelemetryPoint } from "../src/types/index.js";

// ---------------------------------------------------------------------------
// Easing
// ---------------------------------------------------------------------------

describe("applyEasing", () => {
	it("linear returns same value", () => {
		expect(applyEasing(0.5, "linear")).toBe(0.5);
	});

	it("all curves return 0 at t=0", () => {
		const curves = ["linear", "ease-in", "ease-out", "ease-in-out", "spring", "bounce"] as const;
		for (const curve of curves) {
			expect(applyEasing(0, curve)).toBe(0);
		}
	});

	it("all curves return 1 at t=1", () => {
		const curves = ["linear", "ease-in", "ease-out", "ease-in-out", "spring", "bounce"] as const;
		for (const curve of curves) {
			expect(applyEasing(1, curve)).toBeCloseTo(1, 5);
		}
	});

	it("ease-in is slower at the start", () => {
		expect(applyEasing(0.3, "ease-in")).toBeLessThan(0.3);
	});

	it("ease-out is faster at the start", () => {
		expect(applyEasing(0.3, "ease-out")).toBeGreaterThan(0.3);
	});

	it("clamps values outside 0-1", () => {
		expect(applyEasing(-0.5, "linear")).toBe(0);
		expect(applyEasing(1.5, "linear")).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// Zoom Transition
// ---------------------------------------------------------------------------

describe("calculateZoomTransition", () => {
	const config = { ...DEFAULT_TRANSITION, durationMs: 300 };

	it("returns inactive before region", () => {
		const result = calculateZoomTransition(500, 1000, 5000, config);
		expect(result.phase).toBe("inactive");
		expect(result.zoomFactor).toBe(0);
	});

	it("returns entering at region start", () => {
		const result = calculateZoomTransition(1100, 1000, 5000, config);
		expect(result.phase).toBe("entering");
		expect(result.zoomFactor).toBeGreaterThan(0);
		expect(result.zoomFactor).toBeLessThan(1);
	});

	it("returns active in the middle", () => {
		const result = calculateZoomTransition(3000, 1000, 5000, config);
		expect(result.phase).toBe("active");
		expect(result.zoomFactor).toBe(1);
	});

	it("returns exiting near region end", () => {
		const result = calculateZoomTransition(4800, 1000, 5000, config);
		expect(result.phase).toBe("exiting");
		expect(result.zoomFactor).toBeGreaterThan(0);
		expect(result.zoomFactor).toBeLessThan(1);
	});

	it("returns inactive after region", () => {
		const result = calculateZoomTransition(6000, 1000, 5000, config);
		expect(result.phase).toBe("inactive");
		expect(result.zoomFactor).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Cursor Telemetry Analysis
// ---------------------------------------------------------------------------

describe("analyseCursorTelemetry", () => {
	function makeTelemetry(count: number): CursorTelemetryPoint[] {
		return Array.from({ length: count }, (_, i) => ({
			timeMs: i * 100,
			cx: 0.5 + Math.sin(i * 0.1) * 0.3,
			cy: 0.5 + Math.cos(i * 0.1) * 0.3,
		}));
	}

	it("returns zeros for empty telemetry", () => {
		const result = analyseCursorTelemetry([], 8);
		expect(result.averageSpeed).toBe(0);
		expect(result.totalDistance).toBe(0);
	});

	it("calculates speed and distance", () => {
		const data = makeTelemetry(100);
		const result = analyseCursorTelemetry(data, 8);
		expect(result.averageSpeed).toBeGreaterThan(0);
		expect(result.totalDistance).toBeGreaterThan(0);
		expect(result.heatMap.length).toBe(64); // 8*8
	});

	it("normalizes heat map to 0-1", () => {
		const data = makeTelemetry(50);
		const result = analyseCursorTelemetry(data, 4);
		const max = Math.max(...result.heatMap);
		expect(max).toBeCloseTo(1, 5);
	});
});

describe("simplifyTelemetry", () => {
	it("keeps first and last points", () => {
		const data: CursorTelemetryPoint[] = [
			{ timeMs: 0, cx: 0, cy: 0 },
			{ timeMs: 10, cx: 0.001, cy: 0.001 },
			{ timeMs: 1000, cx: 0.5, cy: 0.5 },
		];
		const result = simplifyTelemetry(data, 0.01);
		expect(result[0].timeMs).toBe(0);
		expect(result[result.length - 1].timeMs).toBe(1000);
	});

	it("reduces point count", () => {
		// Many tiny movements
		const data: CursorTelemetryPoint[] = Array.from({ length: 100 }, (_, i) => ({
			timeMs: i * 10,
			cx: 0.5 + i * 0.0001,
			cy: 0.5,
		}));
		const result = simplifyTelemetry(data, 0.005);
		expect(result.length).toBeLessThan(data.length);
	});
});

// ---------------------------------------------------------------------------
// Auto-Zoom Suggestions
// ---------------------------------------------------------------------------

describe("suggestZoomRegions", () => {
	it("returns empty for short telemetry", () => {
		const data: CursorTelemetryPoint[] = [
			{ timeMs: 0, cx: 0.5, cy: 0.5 },
			{ timeMs: 100, cx: 0.5, cy: 0.5 },
		];
		expect(suggestZoomRegions(data).length).toBe(0);
	});

	it("detects dwell regions", () => {
		// Create a dwell: stay at (0.3, 0.4) for 3 seconds
		const data: CursorTelemetryPoint[] = [];
		// Move around first
		for (let i = 0; i < 20; i++) {
			data.push({ timeMs: i * 100, cx: 0.1 + i * 0.02, cy: 0.5 });
		}
		// Then dwell
		for (let i = 0; i < 40; i++) {
			data.push({
				timeMs: 2000 + i * 100,
				cx: 0.3 + Math.random() * 0.01,
				cy: 0.4 + Math.random() * 0.01,
			});
		}
		// Then move again
		for (let i = 0; i < 20; i++) {
			data.push({ timeMs: 6000 + i * 100, cx: 0.5 + i * 0.02, cy: 0.5 });
		}

		const suggestions = suggestZoomRegions(data, undefined, {
			minDwellMs: 1500,
			dwellRadius: 0.05,
		});

		expect(suggestions.length).toBeGreaterThan(0);
		// The suggestion should focus near the dwell point
		expect(suggestions[0].focusCx).toBeCloseTo(0.3, 0);
	});

	it("limits suggestions to maxSuggestions", () => {
		// Create many dwell regions
		const data: CursorTelemetryPoint[] = [];
		for (let d = 0; d < 20; d++) {
			const baseTime = d * 5000;
			// Dwell for 2 seconds
			for (let i = 0; i < 20; i++) {
				data.push({
					timeMs: baseTime + i * 100,
					cx: (d * 0.04) % 1,
					cy: 0.5,
				});
			}
			// Move quickly
			for (let i = 0; i < 10; i++) {
				data.push({
					timeMs: baseTime + 2500 + i * 100,
					cx: ((d + 1) * 0.04) % 1,
					cy: 0.5,
				});
			}
		}

		const suggestions = suggestZoomRegions(data, undefined, { maxSuggestions: 5 });
		expect(suggestions.length).toBeLessThanOrEqual(5);
	});
});
