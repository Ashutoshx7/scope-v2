// ============================================================================
// useProjectState — Central state management for the editor
//
// Manages ALL project-level state: timeline regions, background, crop,
// webcam, settings, annotations, undo/redo history, and dirty tracking.
// ============================================================================

import { useCallback, useMemo, useReducer, useRef } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ZoomRegionState {
	id: string;
	startMs: number;
	endMs: number;
	depth: number;
	focusCx: number;
	focusCy: number;
}

export interface TrimRegionState {
	id: string;
	startMs: number;
	endMs: number;
}

export interface SpeedRegionState {
	id: string;
	startMs: number;
	endMs: number;
	speed: number;
}

export interface AnnotationRegionState {
	id: string;
	startMs: number;
	endMs: number;
	type: string;
	label: string;
}

export interface ProjectState {
	// Playback
	playing: boolean;
	currentTimeMs: number;
	totalDurationMs: number;
	muted: boolean;

	// Video metadata
	videoWidth: number;
	videoHeight: number;
	videoUrl: string | null;
	webcamUrl: string | null;

	// Project info
	projectName: string;
	projectPath: string | null;
	hasUnsavedChanges: boolean;

	// Sidebar
	activeSidebarTab: SidebarTab;

	// Background
	backgroundValue: string;
	backgroundType: "wallpaper" | "gradient" | "solid" | "custom";

	// Timeline regions
	zoomRegions: ZoomRegionState[];
	trimRegions: TrimRegionState[];
	speedRegions: SpeedRegionState[];
	annotationRegions: AnnotationRegionState[];

	// Crop
	cropRegion: { x: number; y: number; width: number; height: number };

	// Webcam
	webcamLayout: "picture-in-picture" | "side-by-side" | "fullscreen" | "off";
	webcamMaskShape: "circle" | "rounded" | "rectangle" | "square";
	webcamSize: number;
	hasWebcam: boolean;

	// Audio
	audioTracks: Array<{ id: string; label: string; volume: number; muted: boolean }>;
	noiseReduction: boolean;

	// Settings
	showShadow: boolean;
	shadowIntensity: number;
	borderRadius: number;
	padding: number;
	motionBlur: boolean;
	motionBlurAmount: number;
	cursorHighlight: boolean;
	clickVisualization: boolean;

	// Annotations toolbar
	annotationTool: string;
	strokeColor: string;
	fillColor: string;
	fontSize: number;
	strokeWidth: number;
	selectedAnnotationId: string | null;

	// Auto-zoom
	autoZoomEnabled: boolean;

	// Export
	exportProgress: number | null;
	exportPhase: string;
	exportCompleted: boolean;
	exportError: string | null;
	exportOutputPath: string | null;

	// Undo history
	undoStack: ProjectSnapshot[];
	redoStack: ProjectSnapshot[];
}

export type SidebarTab =
	| "background"
	| "zoom"
	| "annotations"
	| "crop"
	| "audio"
	| "webcam"
	| "settings";

type ProjectSnapshot = Omit<
	ProjectState,
	"playing" | "currentTimeMs" | "muted" | "activeSidebarTab" | "undoStack" | "redoStack" |
	"exportProgress" | "exportPhase" | "exportCompleted" | "exportError" | "exportOutputPath" |
	"annotationTool" | "selectedAnnotationId"
>;

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

type ProjectAction =
	| { type: "SET_PLAYING"; playing: boolean }
	| { type: "SET_TIME"; timeMs: number }
	| { type: "SET_DURATION"; durationMs: number }
	| { type: "SET_MUTED"; muted: boolean }
	| { type: "SET_VIDEO_META"; width: number; height: number; url: string; webcamUrl?: string }
	| { type: "SET_PROJECT_NAME"; name: string }
	| { type: "SET_PROJECT_PATH"; path: string | null }
	| { type: "MARK_CLEAN" }
	| { type: "SET_SIDEBAR_TAB"; tab: SidebarTab }

	// Background
	| { type: "SET_BACKGROUND"; value: string; bgType: "wallpaper" | "gradient" | "solid" | "custom" }

	// Zoom
	| { type: "ADD_ZOOM_REGION"; region: ZoomRegionState }
	| { type: "UPDATE_ZOOM_REGION"; id: string; updates: Partial<ZoomRegionState> }
	| { type: "REMOVE_ZOOM_REGION"; id: string }
	| { type: "SET_AUTO_ZOOM"; enabled: boolean }

	// Trim
	| { type: "ADD_TRIM_REGION"; region: TrimRegionState }
	| { type: "UPDATE_TRIM_REGION"; id: string; startMs: number; endMs: number }
	| { type: "REMOVE_TRIM_REGION"; id: string }

	// Speed
	| { type: "ADD_SPEED_REGION"; region: SpeedRegionState }
	| { type: "UPDATE_SPEED_REGION"; id: string; startMs: number; endMs: number }
	| { type: "REMOVE_SPEED_REGION"; id: string }

	// Annotations
	| { type: "ADD_ANNOTATION"; annotation: AnnotationRegionState }
	| { type: "UPDATE_ANNOTATION"; id: string; startMs: number; endMs: number }
	| { type: "REMOVE_ANNOTATION"; id: string }
	| { type: "SELECT_ANNOTATION"; id: string | null }
	| { type: "SET_ANNOTATION_TOOL"; tool: string }
	| { type: "SET_STROKE_COLOR"; color: string }
	| { type: "SET_FILL_COLOR"; color: string }
	| { type: "SET_FONT_SIZE"; size: number }
	| { type: "SET_STROKE_WIDTH"; width: number }

	// Crop
	| { type: "SET_CROP"; region: { x: number; y: number; width: number; height: number } }

	// Webcam
	| { type: "SET_WEBCAM_LAYOUT"; layout: ProjectState["webcamLayout"] }
	| { type: "SET_WEBCAM_MASK"; mask: ProjectState["webcamMaskShape"] }
	| { type: "SET_WEBCAM_SIZE"; size: number }

	// Audio
	| { type: "SET_TRACK_VOLUME"; trackId: string; volume: number }
	| { type: "TOGGLE_TRACK_MUTE"; trackId: string }
	| { type: "SET_NOISE_REDUCTION"; enabled: boolean }

	// Settings
	| { type: "SET_SHOW_SHADOW"; show: boolean }
	| { type: "SET_SHADOW_INTENSITY"; intensity: number }
	| { type: "SET_BORDER_RADIUS"; radius: number }
	| { type: "SET_PADDING"; padding: number }
	| { type: "SET_MOTION_BLUR"; enabled: boolean }
	| { type: "SET_MOTION_BLUR_AMOUNT"; amount: number }
	| { type: "SET_CURSOR_HIGHLIGHT"; enabled: boolean }
	| { type: "SET_CLICK_VIZ"; enabled: boolean }

	// Export
	| { type: "EXPORT_START" }
	| { type: "EXPORT_PROGRESS"; progress: number; phase: string }
	| { type: "EXPORT_COMPLETE"; path?: string }
	| { type: "EXPORT_ERROR"; error: string }
	| { type: "EXPORT_RESET" }

	// Undo/Redo
	| { type: "UNDO" }
	| { type: "REDO" }

	// Load project
	| { type: "LOAD_PROJECT"; state: Partial<ProjectState> }

	// Load video from recording
	| { type: "LOAD_VIDEO"; url: string; path: string };

// ---------------------------------------------------------------------------
// Initial State
// ---------------------------------------------------------------------------

const initialProjectState: ProjectState = {
	playing: false,
	currentTimeMs: 0,
	totalDurationMs: 0,
	muted: false,
	videoWidth: 1920,
	videoHeight: 1080,
	videoUrl: null,
	webcamUrl: null,
	projectName: "Untitled Recording",
	projectPath: null,
	hasUnsavedChanges: false,
	activeSidebarTab: "background",
	backgroundValue: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
	backgroundType: "gradient",
	zoomRegions: [],
	trimRegions: [],
	speedRegions: [],
	annotationRegions: [],
	cropRegion: { x: 0, y: 0, width: 1, height: 1 },
	webcamLayout: "picture-in-picture",
	webcamMaskShape: "circle",
	webcamSize: 25,
	hasWebcam: false,
	audioTracks: [],
	noiseReduction: false,
	showShadow: true,
	shadowIntensity: 50,
	borderRadius: 12,
	padding: 32,
	motionBlur: false,
	motionBlurAmount: 30,
	cursorHighlight: false,
	clickVisualization: false,
	annotationTool: "select",
	strokeColor: "#ff4444",
	fillColor: "transparent",
	fontSize: 24,
	strokeWidth: 3,
	selectedAnnotationId: null,
	autoZoomEnabled: false,
	exportProgress: null,
	exportPhase: "",
	exportCompleted: false,
	exportError: null,
	exportOutputPath: null,
	undoStack: [],
	redoStack: [],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _idCounter = 0;
function genId(): string {
	return `r_${Date.now()}_${++_idCounter}`;
}

function takeSnapshot(state: ProjectState): ProjectSnapshot {
	const { playing, currentTimeMs, muted, activeSidebarTab, undoStack, redoStack,
		exportProgress, exportPhase, exportCompleted, exportError, exportOutputPath,
		annotationTool, selectedAnnotationId, ...snapshot } = state;
	return snapshot;
}

function markDirty(state: ProjectState, pushUndo = true): ProjectState {
	const next = { ...state, hasUnsavedChanges: true };
	if (pushUndo) {
		const snapshot = takeSnapshot(state);
		next.undoStack = [...state.undoStack.slice(-49), snapshot];
		next.redoStack = [];
	}
	return next;
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function projectReducer(state: ProjectState, action: ProjectAction): ProjectState {
	switch (action.type) {
		// Playback (no dirty)
		case "SET_PLAYING": return { ...state, playing: action.playing };
		case "SET_TIME": return { ...state, currentTimeMs: Math.max(0, Math.min(action.timeMs, state.totalDurationMs)) };
		case "SET_DURATION": return { ...state, totalDurationMs: action.durationMs };
		case "SET_MUTED": return { ...state, muted: action.muted };
		case "SET_SIDEBAR_TAB": return { ...state, activeSidebarTab: action.tab };
		case "SET_ANNOTATION_TOOL": return { ...state, annotationTool: action.tool };
		case "SELECT_ANNOTATION": return { ...state, selectedAnnotationId: action.id };
		case "SET_PROJECT_NAME": return { ...state, projectName: action.name, hasUnsavedChanges: true };
		case "SET_PROJECT_PATH": return { ...state, projectPath: action.path };
		case "MARK_CLEAN": return { ...state, hasUnsavedChanges: false };

		// Video metadata
		case "SET_VIDEO_META":
			return {
				...state,
				videoWidth: action.width,
				videoHeight: action.height,
				videoUrl: action.url,
				webcamUrl: action.webcamUrl || null,
				hasWebcam: !!action.webcamUrl,
			};

		// Background
		case "SET_BACKGROUND":
			return markDirty({ ...state, backgroundValue: action.value, backgroundType: action.bgType });

		// Zoom regions
		case "ADD_ZOOM_REGION":
			return markDirty({ ...state, zoomRegions: [...state.zoomRegions, action.region] });
		case "UPDATE_ZOOM_REGION":
			return markDirty({
				...state,
				zoomRegions: state.zoomRegions.map((r) => r.id === action.id ? { ...r, ...action.updates } : r),
			});
		case "REMOVE_ZOOM_REGION":
			return markDirty({ ...state, zoomRegions: state.zoomRegions.filter((r) => r.id !== action.id) });
		case "SET_AUTO_ZOOM":
			return markDirty({ ...state, autoZoomEnabled: action.enabled });

		// Trim regions
		case "ADD_TRIM_REGION":
			return markDirty({ ...state, trimRegions: [...state.trimRegions, action.region] });
		case "UPDATE_TRIM_REGION":
			return markDirty({
				...state,
				trimRegions: state.trimRegions.map((r) => r.id === action.id ? { ...r, startMs: action.startMs, endMs: action.endMs } : r),
			});
		case "REMOVE_TRIM_REGION":
			return markDirty({ ...state, trimRegions: state.trimRegions.filter((r) => r.id !== action.id) });

		// Speed regions
		case "ADD_SPEED_REGION":
			return markDirty({ ...state, speedRegions: [...state.speedRegions, action.region] });
		case "UPDATE_SPEED_REGION":
			return markDirty({
				...state,
				speedRegions: state.speedRegions.map((r) => r.id === action.id ? { ...r, startMs: action.startMs, endMs: action.endMs } : r),
			});
		case "REMOVE_SPEED_REGION":
			return markDirty({ ...state, speedRegions: state.speedRegions.filter((r) => r.id !== action.id) });

		// Annotations
		case "ADD_ANNOTATION":
			return markDirty({ ...state, annotationRegions: [...state.annotationRegions, action.annotation] });
		case "UPDATE_ANNOTATION":
			return markDirty({
				...state,
				annotationRegions: state.annotationRegions.map((a) => a.id === action.id ? { ...a, startMs: action.startMs, endMs: action.endMs } : a),
			});
		case "REMOVE_ANNOTATION":
			return markDirty({
				...state,
				annotationRegions: state.annotationRegions.filter((a) => a.id !== action.id),
				selectedAnnotationId: state.selectedAnnotationId === action.id ? null : state.selectedAnnotationId,
			});

		// Style
		case "SET_STROKE_COLOR": return { ...state, strokeColor: action.color };
		case "SET_FILL_COLOR": return { ...state, fillColor: action.color };
		case "SET_FONT_SIZE": return { ...state, fontSize: action.size };
		case "SET_STROKE_WIDTH": return { ...state, strokeWidth: action.width };

		// Crop
		case "SET_CROP":
			return markDirty({ ...state, cropRegion: action.region });

		// Webcam
		case "SET_WEBCAM_LAYOUT":
			return markDirty({ ...state, webcamLayout: action.layout });
		case "SET_WEBCAM_MASK":
			return markDirty({ ...state, webcamMaskShape: action.mask });
		case "SET_WEBCAM_SIZE":
			return markDirty({ ...state, webcamSize: action.size });

		// Audio
		case "SET_TRACK_VOLUME":
			return markDirty({
				...state,
				audioTracks: state.audioTracks.map((t) => t.id === action.trackId ? { ...t, volume: action.volume } : t),
			});
		case "TOGGLE_TRACK_MUTE":
			return markDirty({
				...state,
				audioTracks: state.audioTracks.map((t) => t.id === action.trackId ? { ...t, muted: !t.muted } : t),
			});
		case "SET_NOISE_REDUCTION":
			return markDirty({ ...state, noiseReduction: action.enabled });

		// Settings
		case "SET_SHOW_SHADOW": return markDirty({ ...state, showShadow: action.show });
		case "SET_SHADOW_INTENSITY": return markDirty({ ...state, shadowIntensity: action.intensity });
		case "SET_BORDER_RADIUS": return markDirty({ ...state, borderRadius: action.radius });
		case "SET_PADDING": return markDirty({ ...state, padding: action.padding });
		case "SET_MOTION_BLUR": return markDirty({ ...state, motionBlur: action.enabled });
		case "SET_MOTION_BLUR_AMOUNT": return markDirty({ ...state, motionBlurAmount: action.amount });
		case "SET_CURSOR_HIGHLIGHT": return markDirty({ ...state, cursorHighlight: action.enabled });
		case "SET_CLICK_VIZ": return markDirty({ ...state, clickVisualization: action.enabled });

		// Export
		case "EXPORT_START":
			return { ...state, exportProgress: 0, exportPhase: "preparing", exportCompleted: false, exportError: null };
		case "EXPORT_PROGRESS":
			return { ...state, exportProgress: action.progress, exportPhase: action.phase };
		case "EXPORT_COMPLETE":
			return { ...state, exportProgress: 100, exportCompleted: true, exportOutputPath: action.path || null };
		case "EXPORT_ERROR":
			return { ...state, exportProgress: null, exportError: action.error };
		case "EXPORT_RESET":
			return { ...state, exportProgress: null, exportPhase: "", exportCompleted: false, exportError: null, exportOutputPath: null };

		// Undo / Redo
		case "UNDO": {
			if (state.undoStack.length === 0) return state;
			const snapshot = state.undoStack[state.undoStack.length - 1];
			const currentSnapshot = takeSnapshot(state);
			return {
				...state,
				...snapshot,
				undoStack: state.undoStack.slice(0, -1),
				redoStack: [...state.redoStack, currentSnapshot],
				playing: state.playing,
				currentTimeMs: state.currentTimeMs,
				muted: state.muted,
				activeSidebarTab: state.activeSidebarTab,
			};
		}
		case "REDO": {
			if (state.redoStack.length === 0) return state;
			const snapshot = state.redoStack[state.redoStack.length - 1];
			const currentSnapshot = takeSnapshot(state);
			return {
				...state,
				...snapshot,
				undoStack: [...state.undoStack, currentSnapshot],
				redoStack: state.redoStack.slice(0, -1),
				playing: state.playing,
				currentTimeMs: state.currentTimeMs,
				muted: state.muted,
				activeSidebarTab: state.activeSidebarTab,
			};
		}

		// Load project
		case "LOAD_PROJECT":
			return { ...initialProjectState, ...action.state, hasUnsavedChanges: false, undoStack: [], redoStack: [] };

		// Load video from file path
		case "LOAD_VIDEO":
			return {
				...state,
				videoUrl: action.url,
				projectPath: action.path,
				projectName: action.path.split("/").pop()?.replace(/\.webm$/, "") || "Recording",
			};

		default:
			return state;
	}
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useProjectState() {
	const [state, dispatch] = useReducer(projectReducer, initialProjectState);

	const canUndo = state.undoStack.length > 0;
	const canRedo = state.redoStack.length > 0;

	// Convenience helpers
	const addZoomRegion = useCallback((startMs: number, endMs: number) => {
		dispatch({
			type: "ADD_ZOOM_REGION",
			region: { id: genId(), startMs, endMs, depth: 2, focusCx: 0.5, focusCy: 0.5 },
		});
	}, []);

	const addTrimRegion = useCallback((startMs: number, endMs: number) => {
		dispatch({
			type: "ADD_TRIM_REGION",
			region: { id: genId(), startMs, endMs },
		});
	}, []);

	const addSpeedRegion = useCallback((startMs: number, endMs: number) => {
		dispatch({
			type: "ADD_SPEED_REGION",
			region: { id: genId(), startMs, endMs, speed: 1.5 },
		});
	}, []);

	return {
		state,
		dispatch,
		canUndo,
		canRedo,
		addZoomRegion,
		addTrimRegion,
		addSpeedRegion,
	};
}
