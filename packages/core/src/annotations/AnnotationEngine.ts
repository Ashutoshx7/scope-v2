// ============================================================================
// Annotation Engine — CRUD operations for annotation regions
//
// Pure-logic module for creating, updating, and managing annotations.
// Rendering is handled by FrameRenderer; this module manages the data.
// ============================================================================

import {
	DEFAULT_ANNOTATION_POSITION,
	DEFAULT_ANNOTATION_SIZE,
	DEFAULT_ANNOTATION_STYLE,
	DEFAULT_BLUR_DATA,
	DEFAULT_FIGURE_DATA,
	generateId,
	type AnnotationKeyframe,
	type AnnotationPosition,
	type AnnotationRegion,
	type AnnotationSize,
	type AnnotationTextStyle,
	type AnnotationType,
	type BlurData,
	type FigureData,
} from "../types/index.js";

// ---------------------------------------------------------------------------
// Factory Functions
// ---------------------------------------------------------------------------

/**
 * Creates a new text annotation with default styling.
 */
export function createTextAnnotation(
	startMs: number,
	endMs: number,
	text: string,
	overrides?: Partial<AnnotationRegion>,
): AnnotationRegion {
	return {
		id: generateId(),
		startMs,
		endMs,
		type: "text",
		textContent: text,
		position: { ...DEFAULT_ANNOTATION_POSITION },
		size: { ...DEFAULT_ANNOTATION_SIZE },
		style: { ...DEFAULT_ANNOTATION_STYLE },
		zIndex: 1,
		...overrides,
	};
}

/**
 * Creates a new figure annotation (arrow, rectangle, circle, line).
 */
export function createFigureAnnotation(
	startMs: number,
	endMs: number,
	figureData?: Partial<FigureData>,
	overrides?: Partial<AnnotationRegion>,
): AnnotationRegion {
	return {
		id: generateId(),
		startMs,
		endMs,
		type: "figure",
		position: { ...DEFAULT_ANNOTATION_POSITION },
		size: { width: 15, height: 8 },
		style: { ...DEFAULT_ANNOTATION_STYLE },
		zIndex: 1,
		figureData: { ...DEFAULT_FIGURE_DATA, ...figureData },
		...overrides,
	};
}

/**
 * Creates a new blur region annotation.
 */
export function createBlurAnnotation(
	startMs: number,
	endMs: number,
	blurData?: Partial<BlurData>,
	overrides?: Partial<AnnotationRegion>,
): AnnotationRegion {
	return {
		id: generateId(),
		startMs,
		endMs,
		type: "blur",
		position: { ...DEFAULT_ANNOTATION_POSITION },
		size: { width: 20, height: 15 },
		style: { ...DEFAULT_ANNOTATION_STYLE },
		zIndex: 0, // Blur goes below other annotations
		blurData: { ...DEFAULT_BLUR_DATA, ...blurData },
		...overrides,
	};
}

/**
 * Creates a new freehand drawing annotation.
 */
export function createFreehandAnnotation(
	startMs: number,
	endMs: number,
	path: Array<{ x: number; y: number; pressure?: number }>,
	overrides?: Partial<AnnotationRegion>,
): AnnotationRegion {
	// Calculate bounding box from path
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	for (const p of path) {
		minX = Math.min(minX, p.x);
		minY = Math.min(minY, p.y);
		maxX = Math.max(maxX, p.x);
		maxY = Math.max(maxY, p.y);
	}

	const width = Math.max(5, maxX - minX);
	const height = Math.max(5, maxY - minY);

	// Normalise path relative to bounding box
	const normalised = path.map((p) => ({
		x: ((p.x - minX) / width) * 100,
		y: ((p.y - minY) / height) * 100,
		pressure: p.pressure,
	}));

	return {
		id: generateId(),
		startMs,
		endMs,
		type: "freehand",
		position: { x: minX, y: minY },
		size: { width, height },
		style: { ...DEFAULT_ANNOTATION_STYLE, color: "#ff4444" },
		zIndex: 2,
		freehandPath: normalised,
		figureData: { ...DEFAULT_FIGURE_DATA, strokeWidth: 3 },
		...overrides,
	};
}

/**
 * Creates an image annotation.
 */
export function createImageAnnotation(
	startMs: number,
	endMs: number,
	imageContent: string, // base64 data URL
	overrides?: Partial<AnnotationRegion>,
): AnnotationRegion {
	return {
		id: generateId(),
		startMs,
		endMs,
		type: "image",
		imageContent,
		position: { ...DEFAULT_ANNOTATION_POSITION },
		size: { width: 20, height: 20 },
		style: { ...DEFAULT_ANNOTATION_STYLE },
		zIndex: 1,
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Update Operations
// ---------------------------------------------------------------------------

/**
 * Updates an annotation's position (as percentage of canvas).
 */
export function moveAnnotation(
	annotation: AnnotationRegion,
	position: AnnotationPosition,
): AnnotationRegion {
	return { ...annotation, position };
}

/**
 * Resizes an annotation (as percentage of canvas).
 */
export function resizeAnnotation(
	annotation: AnnotationRegion,
	size: AnnotationSize,
): AnnotationRegion {
	return {
		...annotation,
		size: {
			width: Math.max(1, size.width),
			height: Math.max(1, size.height),
		},
	};
}

/**
 * Updates the time range of an annotation.
 */
export function retimeAnnotation(
	annotation: AnnotationRegion,
	startMs: number,
	endMs: number,
): AnnotationRegion {
	return {
		...annotation,
		startMs: Math.max(0, startMs),
		endMs: Math.max(startMs + 100, endMs),
	};
}

/**
 * Updates the style of a text annotation.
 */
export function updateAnnotationStyle(
	annotation: AnnotationRegion,
	style: Partial<AnnotationTextStyle>,
): AnnotationRegion {
	return {
		...annotation,
		style: { ...annotation.style, ...style },
	};
}

/**
 * Updates the text content of a text annotation.
 */
export function updateAnnotationText(
	annotation: AnnotationRegion,
	text: string,
): AnnotationRegion {
	return { ...annotation, textContent: text };
}

/**
 * Changes the z-index of an annotation.
 */
export function setAnnotationZIndex(
	annotation: AnnotationRegion,
	zIndex: number,
): AnnotationRegion {
	return { ...annotation, zIndex };
}

// ---------------------------------------------------------------------------
// Keyframe Management
// ---------------------------------------------------------------------------

/**
 * Adds a fade-in effect to an annotation.
 */
export function addFadeInEffect(
	annotation: AnnotationRegion,
	durationMs: number = 300,
): AnnotationRegion {
	const keyframes: AnnotationKeyframe[] = [
		{ timeOffsetMs: 0, opacity: 0, scale: 1, offsetX: 0, offsetY: 0 },
		{ timeOffsetMs: durationMs, opacity: 1, scale: 1, offsetX: 0, offsetY: 0 },
	];

	return { ...annotation, keyframes };
}

/**
 * Adds a fade-out effect to an annotation.
 */
export function addFadeOutEffect(
	annotation: AnnotationRegion,
	durationMs: number = 300,
): AnnotationRegion {
	const duration = annotation.endMs - annotation.startMs;
	const keyframes: AnnotationKeyframe[] = [
		{ timeOffsetMs: 0, opacity: 1, scale: 1, offsetX: 0, offsetY: 0 },
		{ timeOffsetMs: duration - durationMs, opacity: 1, scale: 1, offsetX: 0, offsetY: 0 },
		{ timeOffsetMs: duration, opacity: 0, scale: 1, offsetX: 0, offsetY: 0 },
	];

	return { ...annotation, keyframes };
}

/**
 * Adds both fade-in and fade-out effects.
 */
export function addFadeInOutEffect(
	annotation: AnnotationRegion,
	fadeInMs: number = 300,
	fadeOutMs: number = 300,
): AnnotationRegion {
	const duration = annotation.endMs - annotation.startMs;
	const keyframes: AnnotationKeyframe[] = [
		{ timeOffsetMs: 0, opacity: 0, scale: 1, offsetX: 0, offsetY: 0 },
		{ timeOffsetMs: fadeInMs, opacity: 1, scale: 1, offsetX: 0, offsetY: 0 },
		{ timeOffsetMs: duration - fadeOutMs, opacity: 1, scale: 1, offsetX: 0, offsetY: 0 },
		{ timeOffsetMs: duration, opacity: 0, scale: 1, offsetX: 0, offsetY: 0 },
	];

	return { ...annotation, keyframes };
}

// ---------------------------------------------------------------------------
// Collection Operations
// ---------------------------------------------------------------------------

/**
 * Returns all annotations active at a given timestamp.
 */
export function getActiveAnnotations(
	annotations: AnnotationRegion[],
	timeMs: number,
): AnnotationRegion[] {
	return annotations
		.filter((a) => timeMs >= a.startMs && timeMs <= a.endMs)
		.sort((a, b) => a.zIndex - b.zIndex);
}

/**
 * Reorders annotations by z-index (bring to front / send to back).
 */
export function bringToFront(
	annotations: AnnotationRegion[],
	annotationId: string,
): AnnotationRegion[] {
	const maxZ = Math.max(...annotations.map((a) => a.zIndex), 0);
	return annotations.map((a) =>
		a.id === annotationId ? { ...a, zIndex: maxZ + 1 } : a,
	);
}

export function sendToBack(
	annotations: AnnotationRegion[],
	annotationId: string,
): AnnotationRegion[] {
	const minZ = Math.min(...annotations.map((a) => a.zIndex), 0);
	return annotations.map((a) =>
		a.id === annotationId ? { ...a, zIndex: minZ - 1 } : a,
	);
}

/**
 * Duplicates an annotation with a new ID and offset position.
 */
export function duplicateAnnotation(
	annotation: AnnotationRegion,
	timeOffsetMs: number = 0,
): AnnotationRegion {
	return {
		...annotation,
		id: generateId(),
		startMs: annotation.startMs + timeOffsetMs,
		endMs: annotation.endMs + timeOffsetMs,
		position: {
			x: annotation.position.x + 2,
			y: annotation.position.y + 2,
		},
	};
}
