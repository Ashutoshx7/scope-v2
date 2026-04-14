// ============================================================================
// Project Serializer — Save/load/migrate project files
// ============================================================================

import {
	DEFAULT_BACKGROUND,
	DEFAULT_CROP_REGION,
	DEFAULT_WEBCAM_LAYOUT,
	DEFAULT_WEBCAM_MASK,
	DEFAULT_WEBCAM_SIZE,
	type AnnotationRegion,
	type BackgroundConfig,
	type CropRegion,
	type ProjectFile,
	type ProjectMedia,
	type SpeedRegion,
	type TrimRegion,
	type WebcamLayoutPreset,
	type WebcamMaskShape,
	type WebcamPosition,
	type WebcamSizePreset,
	type ZoomRegion,
} from "../types/index.js";

const CURRENT_VERSION = 2;

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * Creates a new empty project file with default settings.
 */
export function createProject(
	name: string,
	media: ProjectMedia,
	overrides?: Partial<ProjectFile>,
): ProjectFile {
	const now = Date.now();
	return {
		version: CURRENT_VERSION,
		name,
		createdAt: now,
		updatedAt: now,
		media,
		background: DEFAULT_BACKGROUND,
		zoomRegions: [],
		trimRegions: [],
		speedRegions: [],
		annotationRegions: [],
		cropRegion: DEFAULT_CROP_REGION,
		webcam: {
			layout: DEFAULT_WEBCAM_LAYOUT,
			maskShape: DEFAULT_WEBCAM_MASK,
			size: DEFAULT_WEBCAM_SIZE,
			position: null,
		},
		editorSettings: {
			showShadow: true,
			shadowIntensity: 50,
			motionBlur: false,
			motionBlurAmount: 0,
			borderRadius: 12,
			padding: 32,
		},
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Serialize / Deserialize
// ---------------------------------------------------------------------------

/**
 * Serialises a project to a JSON string ready for saving.
 */
export function serializeProject(project: ProjectFile): string {
	return JSON.stringify(
		{
			...project,
			updatedAt: Date.now(),
		},
		null,
		2,
	);
}

/**
 * Parses and validates a project file from a JSON string.
 * Performs version migration if needed.
 */
export function deserializeProject(json: string): ProjectFile {
	const raw = JSON.parse(json);

	if (!raw || typeof raw !== "object") {
		throw new Error("Invalid project file: not an object");
	}

	// Migrate from v1 format (original Scope)
	if (raw.version === undefined || raw.version === 1) {
		return migrateV1ToV2(raw);
	}

	if (raw.version === 2) {
		return validateProjectFile(raw);
	}

	throw new Error(`Unsupported project version: ${raw.version}`);
}

// ---------------------------------------------------------------------------
// V1 → V2 Migration
// ---------------------------------------------------------------------------

/**
 * Migrates a v1 (original Scope) project to v2 format.
 */
function migrateV1ToV2(raw: Record<string, unknown>): ProjectFile {
	const media: ProjectMedia = {
		screenVideoPath: asString(raw.videoPath) || asString((raw.media as Record<string, unknown>)?.screenVideoPath) || "",
	};

	const webcamPath = asString((raw.media as Record<string, unknown>)?.webcamVideoPath);
	if (webcamPath) {
		media.webcamVideoPath = webcamPath;
	}

	return createProject(asString(raw.name) || "Untitled", media, {
		background: migrateBackground(raw.wallpaper || raw.background),
		zoomRegions: asArray<ZoomRegion>(raw.zoomRegions),
		trimRegions: asArray<TrimRegion>(raw.trimRegions),
		speedRegions: asArray<SpeedRegion>(raw.speedRegions),
		annotationRegions: asArray<AnnotationRegion>(raw.annotationRegions || raw.annotations),
		cropRegion: migrateCropRegion(raw.cropRegion),
		webcam: {
			layout: (asString(raw.webcamLayoutPreset) as WebcamLayoutPreset) || DEFAULT_WEBCAM_LAYOUT,
			maskShape: (asString(raw.webcamMaskShape) as WebcamMaskShape) || DEFAULT_WEBCAM_MASK,
			size: (asNumber(raw.webcamSizePreset) as WebcamSizePreset) || DEFAULT_WEBCAM_SIZE,
			position: migrateWebcamPosition(raw.webcamPosition),
		},
		editorSettings: {
			showShadow: asBool(raw.showShadow, true),
			shadowIntensity: asNumber(raw.shadowIntensity) || 50,
			motionBlur: asBool(raw.showBlur, false),
			motionBlurAmount: asNumber(raw.motionBlurAmount) || 0,
			borderRadius: asNumber(raw.borderRadius) || 12,
			padding: asNumber(raw.padding) || 32,
		},
		createdAt: asNumber(raw.createdAt) || Date.now(),
	});
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateProjectFile(raw: Record<string, unknown>): ProjectFile {
	// Basic structural validation — trust the data shape but ensure required fields
	const project = raw as unknown as ProjectFile;

	if (!project.media?.screenVideoPath) {
		throw new Error("Project file missing screen video path");
	}

	return {
		...createProject(project.name || "Untitled", project.media),
		...project,
		version: CURRENT_VERSION,
	};
}

// ---------------------------------------------------------------------------
// Migration Helpers
// ---------------------------------------------------------------------------

function migrateBackground(raw: unknown): BackgroundConfig {
	if (typeof raw === "string") {
		if (raw.startsWith("linear-gradient") || raw.startsWith("radial-gradient")) {
			return { type: "gradient", value: raw };
		}
		if (raw.startsWith("#") || raw.startsWith("rgb")) {
			return { type: "solid", value: raw };
		}
		return { type: "wallpaper", value: raw };
	}
	if (raw && typeof raw === "object") {
		return raw as BackgroundConfig;
	}
	return DEFAULT_BACKGROUND;
}

function migrateCropRegion(raw: unknown): CropRegion {
	if (raw && typeof raw === "object") {
		const r = raw as Record<string, unknown>;
		return {
			x: asNumber(r.x) || 0,
			y: asNumber(r.y) || 0,
			width: asNumber(r.width) || 1,
			height: asNumber(r.height) || 1,
		};
	}
	return DEFAULT_CROP_REGION;
}

function migrateWebcamPosition(raw: unknown): WebcamPosition | null {
	if (raw && typeof raw === "object") {
		const r = raw as Record<string, unknown>;
		const cx = asNumber(r.cx);
		const cy = asNumber(r.cy);
		if (cx !== undefined && cy !== undefined) {
			return { cx, cy };
		}
	}
	return null;
}

// ---------------------------------------------------------------------------
// Type Coercion Helpers
// ---------------------------------------------------------------------------

function asString(val: unknown): string | undefined {
	return typeof val === "string" ? val : undefined;
}

function asNumber(val: unknown): number | undefined {
	return typeof val === "number" && Number.isFinite(val) ? val : undefined;
}

function asBool(val: unknown, fallback: boolean): boolean {
	return typeof val === "boolean" ? val : fallback;
}

function asArray<T>(val: unknown): T[] {
	return Array.isArray(val) ? val : [];
}
