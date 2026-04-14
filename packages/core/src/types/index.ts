// ============================================================================
// Scope v2 — Core Types
// ============================================================================

// ---------------------------------------------------------------------------
// Zoom
// ---------------------------------------------------------------------------

/** Zoom depth level (1 = slight, 6 = extreme close-up). */
export type ZoomDepth = 1 | 2 | 3 | 4 | 5 | 6;

/** Whether zoom focus follows cursor automatically or is set manually. */
export type ZoomFocusMode = "manual" | "auto";

/** Normalised focus point within the video frame (0–1 range). */
export interface ZoomFocus {
	cx: number;
	cy: number;
}

/** A zoom region on the timeline. */
export interface ZoomRegion {
	id: string;
	startMs: number;
	endMs: number;
	depth: ZoomDepth;
	focus: ZoomFocus;
	focusMode: ZoomFocusMode;
	/** Duration of the zoom-in ease (ms). */
	zoomInDurationMs: number;
	/** Duration of the zoom-out ease (ms). */
	zoomOutDurationMs: number;
	/** Easing curve for zoom-in. */
	easingIn?: string;
	/** Easing curve for zoom-out. */
	easingOut?: string;
}

/** Scale multiplier for each depth level. */
export const ZOOM_DEPTH_SCALES: Record<ZoomDepth, number> = {
	1: 1.25,
	2: 1.5,
	3: 1.8,
	4: 2.2,
	5: 3.5,
	6: 5.0,
};

export const DEFAULT_ZOOM_DEPTH: ZoomDepth = 3;

export const DEFAULT_ZOOM_IN_DURATION_MS = 400;
export const DEFAULT_ZOOM_OUT_DURATION_MS = 400;

// ---------------------------------------------------------------------------
// Trim
// ---------------------------------------------------------------------------

/** A removed section of the timeline. */
export interface TrimRegion {
	id: string;
	startMs: number;
	endMs: number;
}

// ---------------------------------------------------------------------------
// Speed
// ---------------------------------------------------------------------------

/** Playback speed multiplier. */
export type PlaybackSpeed = number;

export const MIN_PLAYBACK_SPEED = 0.1;
export const MAX_PLAYBACK_SPEED = 16;

export function clampPlaybackSpeed(speed: number): PlaybackSpeed {
	return (
		Math.round(Math.min(MAX_PLAYBACK_SPEED, Math.max(MIN_PLAYBACK_SPEED, speed)) * 100) / 100
	);
}

/** A speed-modified segment of the timeline. */
export interface SpeedRegion {
	id: string;
	startMs: number;
	endMs: number;
	speed: PlaybackSpeed;
}

export const DEFAULT_PLAYBACK_SPEED: PlaybackSpeed = 1.5;

export const SPEED_PRESETS: Array<{ speed: PlaybackSpeed; label: string }> = [
	{ speed: 0.25, label: "0.25×" },
	{ speed: 0.5, label: "0.5×" },
	{ speed: 0.75, label: "0.75×" },
	{ speed: 1, label: "1×" },
	{ speed: 1.25, label: "1.25×" },
	{ speed: 1.5, label: "1.5×" },
	{ speed: 2, label: "2×" },
	{ speed: 3, label: "3×" },
	{ speed: 4, label: "4×" },
	{ speed: 8, label: "8×" },
];

// ---------------------------------------------------------------------------
// Annotations
// ---------------------------------------------------------------------------

export type AnnotationType = "text" | "image" | "figure" | "blur" | "freehand";

export type ArrowDirection =
	| "up"
	| "down"
	| "left"
	| "right"
	| "up-right"
	| "up-left"
	| "down-right"
	| "down-left";

export interface FigureData {
	arrowDirection: ArrowDirection;
	color: string;
	strokeWidth: number;
	/** Shape type for non-arrow figures. */
	shapeType?: "arrow" | "rectangle" | "circle" | "line" | "callout";
}

export type BlurShape = "rectangle" | "oval" | "freehand";

export const MIN_BLUR_INTENSITY = 2;
export const MAX_BLUR_INTENSITY = 40;
export const DEFAULT_BLUR_INTENSITY = 12;

export interface BlurData {
	shape: BlurShape;
	intensity: number;
	/** Normalised freehand points (0–100) within annotation bounds. */
	freehandPoints?: Array<{ x: number; y: number }>;
}

export interface AnnotationPosition {
	/** X offset as percentage of canvas width. */
	x: number;
	/** Y offset as percentage of canvas height. */
	y: number;
}

export interface AnnotationSize {
	/** Width as percentage of canvas width. */
	width: number;
	/** Height as percentage of canvas height. */
	height: number;
}

export interface AnnotationTextStyle {
	color: string;
	backgroundColor: string;
	fontSize: number;
	fontFamily: string;
	fontWeight: "normal" | "bold";
	fontStyle: "normal" | "italic";
	textDecoration: "none" | "underline";
	textAlign: "left" | "center" | "right";
}

/** Keyframe for annotation animation. */
export interface AnnotationKeyframe {
	timeOffsetMs: number;
	opacity: number;
	scale: number;
	offsetX: number;
	offsetY: number;
}

export interface AnnotationRegion {
	id: string;
	startMs: number;
	endMs: number;
	type: AnnotationType;
	textContent?: string;
	imageContent?: string;
	position: AnnotationPosition;
	size: AnnotationSize;
	style: AnnotationTextStyle;
	zIndex: number;
	figureData?: FigureData;
	blurData?: BlurData;
	/** Freehand drawing path data. */
	freehandPath?: Array<{ x: number; y: number; pressure?: number }>;
	/** Animation keyframes. */
	keyframes?: AnnotationKeyframe[];
}

export const DEFAULT_ANNOTATION_POSITION: AnnotationPosition = { x: 50, y: 50 };

export const DEFAULT_ANNOTATION_SIZE: AnnotationSize = { width: 30, height: 20 };

export const DEFAULT_ANNOTATION_STYLE: AnnotationTextStyle = {
	color: "#ffffff",
	backgroundColor: "transparent",
	fontSize: 32,
	fontFamily: "Inter",
	fontWeight: "bold",
	fontStyle: "normal",
	textDecoration: "none",
	textAlign: "center",
};

export const DEFAULT_FIGURE_DATA: FigureData = {
	arrowDirection: "right",
	color: "#34B27B",
	strokeWidth: 4,
	shapeType: "arrow",
};

export const DEFAULT_BLUR_DATA: BlurData = {
	shape: "rectangle",
	intensity: DEFAULT_BLUR_INTENSITY,
};

// ---------------------------------------------------------------------------
// Crop
// ---------------------------------------------------------------------------

/** Crop region as normalised fractions (0–1). */
export interface CropRegion {
	x: number;
	y: number;
	width: number;
	height: number;
}

export const DEFAULT_CROP_REGION: CropRegion = { x: 0, y: 0, width: 1, height: 1 };

/** Preset aspect ratios for quick crop selection. */
export const ASPECT_RATIO_PRESETS = [
	{ label: "16:9", ratio: 16 / 9 },
	{ label: "9:16", ratio: 9 / 16 },
	{ label: "1:1", ratio: 1 },
	{ label: "4:3", ratio: 4 / 3 },
	{ label: "4:5", ratio: 4 / 5 },
	{ label: "21:9", ratio: 21 / 9 },
] as const;

// ---------------------------------------------------------------------------
// Webcam
// ---------------------------------------------------------------------------

export type WebcamLayoutPreset =
	| "picture-in-picture"
	| "side-by-side"
	| "fullscreen"
	| "top-bar"
	| "split";

export type WebcamMaskShape = "rectangle" | "circle" | "square" | "rounded";

/** Webcam size as percentage of canvas reference dimension (10–50). */
export type WebcamSizePreset = number;

export const DEFAULT_WEBCAM_LAYOUT: WebcamLayoutPreset = "picture-in-picture";
export const DEFAULT_WEBCAM_SIZE: WebcamSizePreset = 25;
export const DEFAULT_WEBCAM_MASK: WebcamMaskShape = "rectangle";

export interface WebcamPosition {
	/** Normalised horizontal center (0–1). */
	cx: number;
	/** Normalised vertical center (0–1). */
	cy: number;
}

// ---------------------------------------------------------------------------
// Cursor Telemetry
// ---------------------------------------------------------------------------

export interface CursorTelemetryPoint {
	timeMs: number;
	/** Normalised x (0–1). */
	cx: number;
	/** Normalised y (0–1). */
	cy: number;
}

// ---------------------------------------------------------------------------
// Background
// ---------------------------------------------------------------------------

export type BackgroundType = "wallpaper" | "gradient" | "solid" | "custom-image";

export interface BackgroundConfig {
	type: BackgroundType;
	/** Wallpaper filename or gradient CSS string or hex color. */
	value: string;
	/** Custom image data URL (for custom-image type). */
	imageData?: string;
}

export const DEFAULT_BACKGROUND: BackgroundConfig = {
	type: "gradient",
	value: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)",
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export interface ExportConfig {
	width: number;
	height: number;
	frameRate: number;
	bitrate: number;
	codec: string;
	format: "mp4" | "gif" | "webm";
}

export interface ExportProgress {
	currentFrame: number;
	totalFrames: number;
	percentage: number;
	estimatedTimeRemaining: number;
	phase?: "encoding" | "muxing" | "finalizing";
}

export interface ExportResult {
	success: boolean;
	blob?: Blob;
	error?: string;
}

export const EXPORT_QUALITY_PRESETS = {
	draft: { bitrate: 2_000_000, frameRate: 24, label: "Draft (fast)" },
	standard: { bitrate: 8_000_000, frameRate: 30, label: "Standard" },
	high: { bitrate: 16_000_000, frameRate: 30, label: "High" },
	ultra: { bitrate: 32_000_000, frameRate: 60, label: "Ultra (slow)" },
} as const;

export const RESOLUTION_PRESETS = [
	{ label: "720p", width: 1280, height: 720 },
	{ label: "1080p", width: 1920, height: 1080 },
	{ label: "1440p", width: 2560, height: 1440 },
	{ label: "4K", width: 3840, height: 2160 },
] as const;

// ---------------------------------------------------------------------------
// Recording Session
// ---------------------------------------------------------------------------

export interface RecordingSession {
	screenVideoPath: string;
	webcamVideoPath?: string;
	createdAt: number;
}

export interface ProjectMedia {
	screenVideoPath: string;
	webcamVideoPath?: string;
}

// ---------------------------------------------------------------------------
// Project File
// ---------------------------------------------------------------------------

export interface ProjectFile {
	version: 2;
	name: string;
	createdAt: number;
	updatedAt: number;
	media: ProjectMedia;
	background: BackgroundConfig;
	zoomRegions: ZoomRegion[];
	trimRegions: TrimRegion[];
	speedRegions: SpeedRegion[];
	annotationRegions: AnnotationRegion[];
	cropRegion: CropRegion;
	webcam: {
		layout: WebcamLayoutPreset;
		maskShape: WebcamMaskShape;
		size: WebcamSizePreset;
		position: WebcamPosition | null;
	};
	editorSettings: {
		showShadow: boolean;
		shadowIntensity: number;
		motionBlur: boolean;
		motionBlurAmount: number;
		borderRadius: number;
		padding: number;
	};
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

export function clamp(value: number, min: number, max: number): number {
	if (Number.isNaN(value)) return (min + max) / 2;
	return Math.min(max, Math.max(min, value));
}

export function generateId(): string {
	return crypto.randomUUID();
}
