// ============================================================================
// Cursor Telemetry Module
//
// Utilities for recording, processing, and analysing cursor movement
// data captured during screen recording.
// ============================================================================

import {
	clamp,
	type CursorTelemetryPoint,
} from "../types/index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CursorClickEvent {
	timeMs: number;
	cx: number;
	cy: number;
	button: "left" | "right" | "middle";
}

export interface CursorAnalysis {
	/** Average cursor speed in normalised units per second. */
	averageSpeed: number;
	/** Maximum cursor speed. */
	maxSpeed: number;
	/** Regions where cursor dwells (stays still). */
	dwellRegions: Array<{
		startMs: number;
		endMs: number;
		cx: number;
		cy: number;
	}>;
	/** Heat map of cursor positions (for visualisation). */
	heatMap: Float32Array;
	/** Total distance travelled (normalised units). */
	totalDistance: number;
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

/**
 * Creates a cursor telemetry recorder that captures mouse position
 * at a configurable sample rate.
 */
export function createCursorRecorder(
	options?: {
		sampleIntervalMs?: number;
		maxSamples?: number;
	},
) {
	const interval = options?.sampleIntervalMs ?? 100;
	const maxSamples = options?.maxSamples ?? 36_000;
	const samples: CursorTelemetryPoint[] = [];
	let startTime = 0;
	let timerId: ReturnType<typeof setInterval> | null = null;

	return {
		start(getSample: () => { cx: number; cy: number }) {
			startTime = Date.now();
			samples.length = 0;

			timerId = setInterval(() => {
				const { cx, cy } = getSample();
				samples.push({
					timeMs: Date.now() - startTime,
					cx: clamp(cx, 0, 1),
					cy: clamp(cy, 0, 1),
				});

				if (samples.length > maxSamples) {
					samples.shift();
				}
			}, interval);
		},

		stop(): CursorTelemetryPoint[] {
			if (timerId) {
				clearInterval(timerId);
				timerId = null;
			}
			return [...samples];
		},

		getSamples(): CursorTelemetryPoint[] {
			return [...samples];
		},

		isRecording(): boolean {
			return timerId !== null;
		},
	};
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

/**
 * Analyses cursor telemetry data for auto-zoom suggestions
 * and visualisation.
 */
export function analyseCursorTelemetry(
	telemetry: CursorTelemetryPoint[],
	heatMapSize: number = 32,
): CursorAnalysis {
	if (telemetry.length < 2) {
		return {
			averageSpeed: 0,
			maxSpeed: 0,
			dwellRegions: [],
			heatMap: new Float32Array(heatMapSize * heatMapSize),
			totalDistance: 0,
		};
	}

	let totalDistance = 0;
	let maxSpeed = 0;
	const speeds: number[] = [];
	const heatMap = new Float32Array(heatMapSize * heatMapSize);

	// Calculate speeds and distances
	for (let i = 1; i < telemetry.length; i++) {
		const prev = telemetry[i - 1];
		const curr = telemetry[i];
		const dx = curr.cx - prev.cx;
		const dy = curr.cy - prev.cy;
		const distance = Math.sqrt(dx * dx + dy * dy);
		const dt = (curr.timeMs - prev.timeMs) / 1000;

		totalDistance += distance;

		if (dt > 0) {
			const speed = distance / dt;
			speeds.push(speed);
			maxSpeed = Math.max(maxSpeed, speed);
		}
	}

	const averageSpeed = speeds.length > 0
		? speeds.reduce((a, b) => a + b, 0) / speeds.length
		: 0;

	// Build heat map
	for (const point of telemetry) {
		const hx = Math.floor(clamp(point.cx * heatMapSize, 0, heatMapSize - 1));
		const hy = Math.floor(clamp(point.cy * heatMapSize, 0, heatMapSize - 1));
		heatMap[hy * heatMapSize + hx] += 1;
	}

	// Normalise heat map
	const maxHeat = Math.max(...heatMap, 1);
	for (let i = 0; i < heatMap.length; i++) {
		heatMap[i] /= maxHeat;
	}

	// Find dwell regions
	const dwellRegions = findDwellRegions(telemetry);

	return {
		averageSpeed,
		maxSpeed,
		dwellRegions,
		heatMap,
		totalDistance,
	};
}

/**
 * Finds regions where the cursor stays relatively still.
 */
function findDwellRegions(
	telemetry: CursorTelemetryPoint[],
	minDwellMs: number = 1500,
	dwellRadius: number = 0.05,
): CursorAnalysis["dwellRegions"] {
	const regions: CursorAnalysis["dwellRegions"] = [];

	let dwellStart = 0;
	let dwellCx = telemetry[0].cx;
	let dwellCy = telemetry[0].cy;

	for (let i = 1; i < telemetry.length; i++) {
		const point = telemetry[i];
		const dx = point.cx - dwellCx;
		const dy = point.cy - dwellCy;
		const distance = Math.sqrt(dx * dx + dy * dy);

		if (distance > dwellRadius) {
			// Check if we had a valid dwell
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

	// Check final dwell
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

/**
 * Simplifies telemetry data by removing points that are very close together.
 * Useful for reducing data size before serialisation.
 */
export function simplifyTelemetry(
	telemetry: CursorTelemetryPoint[],
	minDistanceThreshold: number = 0.005,
	minTimeThresholdMs: number = 50,
): CursorTelemetryPoint[] {
	if (telemetry.length <= 2) return [...telemetry];

	const result: CursorTelemetryPoint[] = [telemetry[0]];

	for (let i = 1; i < telemetry.length - 1; i++) {
		const prev = result[result.length - 1];
		const curr = telemetry[i];

		const dx = curr.cx - prev.cx;
		const dy = curr.cy - prev.cy;
		const distance = Math.sqrt(dx * dx + dy * dy);
		const dt = curr.timeMs - prev.timeMs;

		if (distance >= minDistanceThreshold || dt >= minTimeThresholdMs * 10) {
			result.push(curr);
		}
	}

	result.push(telemetry[telemetry.length - 1]);
	return result;
}
