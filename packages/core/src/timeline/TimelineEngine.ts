// ============================================================================
// Timeline Engine — Pure logic for zoom, trim, speed region management
// ============================================================================

import {
	DEFAULT_ZOOM_DEPTH,
	DEFAULT_ZOOM_IN_DURATION_MS,
	DEFAULT_ZOOM_OUT_DURATION_MS,
	ZOOM_DEPTH_SCALES,
	clamp,
	generateId,
	type CursorTelemetryPoint,
	type PlaybackSpeed,
	type SpeedRegion,
	type TrimRegion,
	type ZoomDepth,
	type ZoomFocus,
	type ZoomRegion,
} from "../types/index.js";

// ---------------------------------------------------------------------------
// Time Mapping
// ---------------------------------------------------------------------------

/**
 * Maps a source timestamp (ms) to the effective export timestamp
 * considering trim and speed regions.
 */
export function sourceToExportTime(
	sourceMs: number,
	trimRegions: TrimRegion[],
	speedRegions: SpeedRegion[],
): number {
	// First, calculate trimmed time
	let trimmedMs = sourceMs;
	const sortedTrims = [...trimRegions].sort((a, b) => a.startMs - b.startMs);

	for (const trim of sortedTrims) {
		if (sourceMs > trim.endMs) {
			trimmedMs -= trim.endMs - trim.startMs;
		} else if (sourceMs > trim.startMs) {
			trimmedMs -= sourceMs - trim.startMs;
		}
	}

	// Then, apply speed regions
	if (speedRegions.length === 0) return trimmedMs;

	let effectiveMs = 0;
	let currentMs = 0;
	const sortedSpeeds = [...speedRegions].sort((a, b) => a.startMs - b.startMs);

	for (const region of sortedSpeeds) {
		if (currentMs >= trimmedMs) break;

		const regionStart = Math.max(currentMs, region.startMs);
		const regionEnd = Math.min(trimmedMs, region.endMs);

		if (regionStart < regionEnd) {
			// Time before this speed region at normal speed
			if (currentMs < regionStart) {
				effectiveMs += regionStart - currentMs;
			}
			// Time within this speed region
			effectiveMs += (regionEnd - regionStart) / region.speed;
			currentMs = regionEnd;
		}
	}

	// Remaining time after all speed regions
	if (currentMs < trimmedMs) {
		effectiveMs += trimmedMs - currentMs;
	}

	return effectiveMs;
}

/**
 * Computes the total effective duration (seconds) of the video
 * after applying trim and speed regions.
 */
export function computeEffectiveDuration(
	totalDurationMs: number,
	trimRegions: TrimRegion[],
	speedRegions: SpeedRegion[],
): number {
	const exportMs = sourceToExportTime(totalDurationMs, trimRegions, speedRegions);
	return exportMs / 1000;
}

/**
 * Checks whether a source timestamp falls within a trimmed region.
 */
export function isTimeTrimmed(sourceMs: number, trimRegions: TrimRegion[]): boolean {
	return trimRegions.some((trim) => sourceMs >= trim.startMs && sourceMs < trim.endMs);
}

/**
 * Gets the playback speed at a given source timestamp.
 */
export function getSpeedAtTime(sourceMs: number, speedRegions: SpeedRegion[]): PlaybackSpeed {
	for (const region of speedRegions) {
		if (sourceMs >= region.startMs && sourceMs < region.endMs) {
			return region.speed;
		}
	}
	return 1;
}

// ---------------------------------------------------------------------------
// Zoom Regions
// ---------------------------------------------------------------------------

/**
 * Gets the active zoom region at a given source timestamp.
 */
export function getActiveZoomRegion(
	sourceMs: number,
	zoomRegions: ZoomRegion[],
): ZoomRegion | null {
	for (const region of zoomRegions) {
		if (sourceMs >= region.startMs && sourceMs <= region.endMs) {
			return region;
		}
	}
	return null;
}

/**
 * Computes the zoom scale at a given source timestamp,
 * including ease-in/out transitions.
 */
export function computeZoomScale(sourceMs: number, zoomRegions: ZoomRegion[]): number {
	const region = getActiveZoomRegion(sourceMs, zoomRegions);
	if (!region) return 1;

	const targetScale = ZOOM_DEPTH_SCALES[region.depth];
	const elapsed = sourceMs - region.startMs;
	const remaining = region.endMs - sourceMs;

	// Ease in
	if (elapsed < region.zoomInDurationMs) {
		const t = elapsed / region.zoomInDurationMs;
		const eased = easeOutCubic(t);
		return 1 + (targetScale - 1) * eased;
	}

	// Ease out
	if (remaining < region.zoomOutDurationMs) {
		const t = remaining / region.zoomOutDurationMs;
		const eased = easeOutCubic(t);
		return 1 + (targetScale - 1) * eased;
	}

	return targetScale;
}

/**
 * Computes the zoom focus point at a given source timestamp.
 */
export function computeZoomFocus(
	sourceMs: number,
	zoomRegions: ZoomRegion[],
	cursorTelemetry?: CursorTelemetryPoint[],
): ZoomFocus {
	const region = getActiveZoomRegion(sourceMs, zoomRegions);
	if (!region) return { cx: 0.5, cy: 0.5 };

	if (region.focusMode === "auto" && cursorTelemetry && cursorTelemetry.length > 0) {
		return interpolateCursorPosition(sourceMs, cursorTelemetry);
	}

	return region.focus;
}

/**
 * Creates a new zoom region with default values.
 */
export function createZoomRegion(
	startMs: number,
	endMs: number,
	overrides?: Partial<ZoomRegion>,
): ZoomRegion {
	return {
		id: generateId(),
		startMs,
		endMs,
		depth: DEFAULT_ZOOM_DEPTH,
		focus: { cx: 0.5, cy: 0.5 },
		focusMode: "manual",
		zoomInDurationMs: DEFAULT_ZOOM_IN_DURATION_MS,
		zoomOutDurationMs: DEFAULT_ZOOM_OUT_DURATION_MS,
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Cursor Interpolation
// ---------------------------------------------------------------------------

/**
 * Interpolates cursor position at a given timestamp from telemetry data.
 */
export function interpolateCursorPosition(
	timeMs: number,
	telemetry: CursorTelemetryPoint[],
): ZoomFocus {
	if (telemetry.length === 0) return { cx: 0.5, cy: 0.5 };
	if (telemetry.length === 1) return { cx: telemetry[0].cx, cy: telemetry[0].cy };

	// Binary search for surrounding points
	let lo = 0;
	let hi = telemetry.length - 1;

	if (timeMs <= telemetry[lo].timeMs) {
		return { cx: telemetry[lo].cx, cy: telemetry[lo].cy };
	}
	if (timeMs >= telemetry[hi].timeMs) {
		return { cx: telemetry[hi].cx, cy: telemetry[hi].cy };
	}

	while (hi - lo > 1) {
		const mid = (lo + hi) >> 1;
		if (telemetry[mid].timeMs <= timeMs) {
			lo = mid;
		} else {
			hi = mid;
		}
	}

	const a = telemetry[lo];
	const b = telemetry[hi];
	const t = (timeMs - a.timeMs) / (b.timeMs - a.timeMs);
	const smoothT = smoothStep(t);

	return {
		cx: clamp(a.cx + (b.cx - a.cx) * smoothT, 0, 1),
		cy: clamp(a.cy + (b.cy - a.cy) * smoothT, 0, 1),
	};
}

// ---------------------------------------------------------------------------
// Region Validation
// ---------------------------------------------------------------------------

/**
 * Sorts and merges overlapping regions of the same type.
 */
export function mergeOverlappingRegions<T extends { startMs: number; endMs: number; id: string }>(
	regions: T[],
): T[] {
	if (regions.length <= 1) return [...regions];

	const sorted = [...regions].sort((a, b) => a.startMs - b.startMs);
	const merged: T[] = [sorted[0]];

	for (let i = 1; i < sorted.length; i++) {
		const current = sorted[i];
		const last = merged[merged.length - 1];

		if (current.startMs <= last.endMs) {
			// Overlapping — extend the last region
			merged[merged.length - 1] = {
				...last,
				endMs: Math.max(last.endMs, current.endMs),
			};
		} else {
			merged.push(current);
		}
	}

	return merged;
}

/**
 * Validates that a region has a positive duration and valid bounds.
 */
export function isValidRegion(region: { startMs: number; endMs: number }): boolean {
	return (
		Number.isFinite(region.startMs) &&
		Number.isFinite(region.endMs) &&
		region.startMs >= 0 &&
		region.endMs > region.startMs
	);
}

// ---------------------------------------------------------------------------
// Easing Functions
// ---------------------------------------------------------------------------

function easeOutCubic(t: number): number {
	return 1 - Math.pow(1 - t, 3);
}

function smoothStep(t: number): number {
	return t * t * (3 - 2 * t);
}
