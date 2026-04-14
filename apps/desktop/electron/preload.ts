// ============================================================================
// Electron Preload — Secure IPC bridge (Phase 4: Complete)
//
// Exposes a typed, limited API surface to the renderer process via
// contextBridge. All communication goes through ipcRenderer channels.
// ============================================================================

import { contextBridge, ipcRenderer } from "electron";

// ---------------------------------------------------------------------------
// API Definition
// ---------------------------------------------------------------------------

const electronAPI = {
	// -----------------------------------------------------------------------
	// Recording
	// -----------------------------------------------------------------------

	/** Opens the source selector window. */
	openSourceSelector: () => ipcRenderer.send("recording:open-source-selector"),

	/** Starts a new recording (opens HUD). */
	startNewRecording: () => ipcRenderer.send("recording:start-new"),

	/** Saves a recording blob via main process. */
	saveRecording: (data: Uint8Array, sourceName: string): Promise<{ success: boolean; path?: string }> =>
		ipcRenderer.invoke("recording:save", { data: Array.from(data), sourceName }),

	/** Opens the editor with a specific video file. */
	openEditor: (videoPath: string) => ipcRenderer.send("recording:open-editor", videoPath),

	/** Gets the path to the most recently recorded video. */
	getRecordedVideoPath: (): Promise<{ success: boolean; path?: string }> =>
		ipcRenderer.invoke("recording:get-latest-path"),

	/** Source selected callback. */
	onSourceSelected: (callback: (event: any, source: { id: string; name: string }) => void) =>
		ipcRenderer.on("recording:source-selected", callback),

	removeSourceSelectedListener: (callback: (...args: any[]) => void) =>
		ipcRenderer.removeListener("recording:source-selected", callback),

	// -----------------------------------------------------------------------
	// Cursor Telemetry
	// -----------------------------------------------------------------------

	/** Starts cursor position tracking. */
	startCursorTelemetry: () => ipcRenderer.send("cursor:start-telemetry"),

	/** Stops cursor position tracking and returns data. */
	stopCursorTelemetry: (): Promise<Array<{ timeMs: number; cx: number; cy: number }>> =>
		ipcRenderer.invoke("cursor:stop-telemetry"),

	// -----------------------------------------------------------------------
	// Filesystem
	// -----------------------------------------------------------------------

	/** Saves a project file. */
	saveProjectFile: (
		data: Record<string, unknown>,
		name: string,
		existingPath?: string,
	): Promise<{ success: boolean; path?: string }> =>
		ipcRenderer.invoke("fs:save-project", { data, name, existingPath }),

	/** Loads a project file. */
	loadProjectFile: (): Promise<{ success: boolean; data?: Record<string, unknown>; path?: string }> =>
		ipcRenderer.invoke("fs:load-project"),

	/** Exports to a chosen file path. */
	exportToFile: (
		data: Uint8Array,
		defaultName: string,
		format: string,
	): Promise<{ success: boolean; path?: string }> =>
		ipcRenderer.invoke("fs:export-file", { data: Array.from(data), defaultName, format }),

	/** Reveals a file in the system file explorer. */
	revealInFolder: (filePath: string) => ipcRenderer.send("fs:reveal-in-folder", filePath),

	// -----------------------------------------------------------------------
	// System
	// -----------------------------------------------------------------------

	/** Gets the platform info. */
	getPlatformInfo: (): Promise<{ platform: string; arch: string; version: string }> =>
		ipcRenderer.invoke("system:platform-info"),

	/** Register/unregister global hotkeys. */
	onGlobalHotkey: (callback: (event: any, action: string) => void) =>
		ipcRenderer.on("system:global-hotkey", callback),

	removeGlobalHotkeyListener: (callback: (...args: any[]) => void) =>
		ipcRenderer.removeListener("system:global-hotkey", callback),

	// -----------------------------------------------------------------------
	// Window Controls
	// -----------------------------------------------------------------------

	/** Hides the HUD overlay. */
	hudOverlayHide: () => ipcRenderer.send("hud-overlay-hide"),

	/** Closes the HUD overlay. */
	hudOverlayClose: () => ipcRenderer.send("hud-overlay-close"),
};

// ---------------------------------------------------------------------------
// Expose to renderer
// ---------------------------------------------------------------------------

contextBridge.exposeInMainWorld("electronAPI", electronAPI);

// ---------------------------------------------------------------------------
// TypeScript declaration for use in renderer code
// ---------------------------------------------------------------------------

export type ElectronAPI = typeof electronAPI;
