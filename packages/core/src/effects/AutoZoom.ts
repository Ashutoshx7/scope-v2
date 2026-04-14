// ============================================================================
// Auto-Zoom Suggestion Engine
//
// Analyses cursor telemetry to automatically suggest zoom regions.
// Uses dwell detection, velocity analysis, and click clustering to
// identify moments of user focus worth zooming into.
// ============================================================================

import { type CursorTelemetryPoint, type ZoomRegion, generateId, clamp } from "../types/index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AutoZoomConfig {
	/** Minimum dwell time (ms) to trigger a suggestion. */
	minDwellMs: number;
	/** Maximum cursor movement radius to count as "dwelling" (normalized 0–1). */
	dwellRadius: number;
	/** Minimum gap between zoom suggestions (ms). */
	minGapMs: number;
	/** Default zoom depth. */
	defaultDepth: number;
	/** How much padding (ms) to add before/after the dwell region. */
	paddingMs: number;
	/** Maximum number of suggestions to return. */
	maxSuggestions: number;
	/** Whether to boost suggestions near click events. */
	boostClicks: boolean;
	/** Minimum speed change (normalised units/s) to detect "approach" moments. */
	approachSpeedThreshold: number;
}

const DEFAULT_CONFIG: AutoZoomConfig = {
	minDwellMs: 1500,
	dwellRadius: 0.06,
	minGapMs: 2000,
	defaultDepth: 2,
	paddingMs: 500,
	maxSuggestions: 10,
	boostClicks: true,
	approachSpeedThreshold: 0.15,
};

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export function suggestZoomRegions(
	telemetry: CursorTelemetryPoint[],
	clicks?: Array<{ timeMs: number; cx: number; cy: number }>,
	config?: Partial<AutoZoomConfig>,
): ZoomRegion[] {
	const cfg = { ...DEFAULT_CONFIG, ...config };

	if (telemetry.length < 10) return [];

	const suggestions: ZoomRegion[] = [];

	// 1. Find dwell regions
	const dwells = findDwellRegions(telemetry, cfg.minDwellMs, cfg.dwellRadius);

	// 2. Find rapid approach + stop moments
	const approaches = findApproachMoments(telemetry, cfg.approachSpeedThreshold, cfg.minDwellMs);

	// 3. Merge and score
	const candidates: Array<{
		startMs: number;
		endMs: number;
		cx: number;
		cy: number;
		score: number;
	}> = [];

	for (const dwell of dwells) {
		let score = 1;
		const duration = dwell.endMs - dwell.startMs;
		score += Math.min(duration / 5000, 2); // Longer dwells score higher

		// Boost if near a click
		if (cfg.boostClicks && clicks) {
			const nearbyClicks = clicks.filter(
				(c) => c.timeMs >= dwell.startMs - 500 && c.timeMs <= dwell.endMs + 500,
			);
			score += nearbyClicks.length * 0.5;
		}

		candidates.push({
			startMs: dwell.startMs,
			endMs: dwell.endMs,
			cx: dwell.cx,
			cy: dwell.cy,
			score,
		});
	}

	for (const approach of approaches) {
		let score = 0.8;

		if (cfg.boostClicks && clicks) {
			const nearbyClicks = clicks.filter(
				(c) => Math.abs(c.timeMs - approach.timeMs) < 1000,
			);
			score += nearbyClicks.length * 0.7;
		}

		candidates.push({
			startMs: approach.timeMs - cfg.paddingMs,
			endMs: approach.timeMs + cfg.minDwellMs,
			cx: approach.cx,
			cy: approach.cy,
			score,
		});
	}

	// Sort by score (highest first)
	candidates.sort((a, b) => b.score - a.score);

	// De-duplicate overlapping regions
	for (const candidate of candidates) {
		if (suggestions.length >= cfg.maxSuggestions) break;

		const overlaps = suggestions.some(
			(s) =>
				candidate.startMs < s.endMs + cfg.minGapMs &&
				candidate.endMs > s.startMs - cfg.minGapMs,
		);

		if (overlaps) continue;

		suggestions.push({
			id: generateId(),
			startMs: Math.max(0, candidate.startMs - cfg.paddingMs),
			endMs: candidate.endMs + cfg.paddingMs,
			depth: cfg.defaultDepth as any,
			easingIn: "ease-out",
			easingOut: "ease-in",
			focus: {
				cx: clamp(candidate.cx, 0.1, 0.9),
				cy: clamp(candidate.cy, 0.1, 0.9),
			},
			focusMode: "auto",
			zoomInDurationMs: 400,
			zoomOutDurationMs: 400,
		});
	}

	// Sort by time
	suggestions.sort((a, b) => a.startMs - b.startMs);

	return suggestions;
}

// ---------------------------------------------------------------------------
// Dwell Detection
// ---------------------------------------------------------------------------

function findDwellRegions(
	telemetry: CursorTelemetryPoint[],
	minDwellMs: number,
	dwellRadius: number,
): Array<{ startMs: number; endMs: number; cx: number; cy: number }> {
	const regions: Array<{ startMs: number; endMs: number; cx: number; cy: number }> = [];

	let dwellStart = 0;
	let dwellCx = telemetry[0].cx;
	let dwellCy = telemetry[0].cy;

	for (let i = 1; i < telemetry.length; i++) {
		const point = telemetry[i];
		const dx = point.cx - dwellCx;
		const dy = point.cy - dwellCy;
		const dist = Math.sqrt(dx * dx + dy * dy);

		if (dist > dwellRadius) {
			const startPoint = telemetry[dwellStart];
			const endPoint = telemetry[i - 1];

			if (endPoint.timeMs - startPoint.timeMs >= minDwellMs) {
				regions.push({
					startMs: startPoint.timeMs,
					endMs: endPoint.timeMs,
					cx: dwellCx,
					cy: dwellCy,
				});
			}

			dwellStart = i;
			dwellCx = point.cx;
			dwellCy = point.cy;
		}
	}

	// Check final segment
	const finalStart = telemetry[dwellStart];
	const finalEnd = telemetry[telemetry.length - 1];
	if (finalEnd.timeMs - finalStart.timeMs >= minDwellMs) {
		regions.push({
			startMs: finalStart.timeMs,
			endMs: finalEnd.timeMs,
			cx: dwellCx,
			cy: dwellCy,
		});
	}

	return regions;
}

// ---------------------------------------------------------------------------
// Approach Detection (fast movement followed by sudden stop)
// ---------------------------------------------------------------------------

function findApproachMoments(
	telemetry: CursorTelemetryPoint[],
	speedThreshold: number,
	stopWindowMs: number,
): Array<{ timeMs: number; cx: number; cy: number }> {
	const moments: Array<{ timeMs: number; cx: number; cy: number }> = [];

	if (telemetry.length < 5) return moments;

	// Calculate speeds
	const speeds: Array<{ timeMs: number; speed: number; cx: number; cy: number }> = [];

	for (let i = 1; i < telemetry.length; i++) {
		const prev = telemetry[i - 1];
		const curr = telemetry[i];
		const dx = curr.cx - prev.cx;
		const dy = curr.cy - prev.cy;
		const dist = Math.sqrt(dx * dx + dy * dy);
		const dtSec = (curr.timeMs - prev.timeMs) / 1000;

		if (dtSec > 0) {
			speeds.push({
				timeMs: curr.timeMs,
				speed: dist / dtSec,
				cx: curr.cx,
				cy: curr.cy,
			});
		}
	}

	// Find points where speed drops sharply (approach → stop)
	const windowSize = 5;
	for (let i = windowSize; i < speeds.length - windowSize; i++) {
		// Average speed before
		let avgBefore = 0;
		for (let j = i - windowSize; j < i; j++) {
			avgBefore += speeds[j].speed;
		}
		avgBefore /= windowSize;

		// Average speed after
		let avgAfter = 0;
		for (let j = i; j < i + windowSize; j++) {
			avgAfter += speeds[j].speed;
		}
		avgAfter /= windowSize;

		// Sharp deceleration
		if (avgBefore > speedThreshold && avgAfter < speedThreshold * 0.3) {
			moments.push({
				timeMs: speeds[i].timeMs,
				cx: speeds[i].cx,
				cy: speeds[i].cy,
			});
			// Skip ahead to avoid duplicate detections
			i += windowSize * 2;
		}
	}

	return moments;
}
