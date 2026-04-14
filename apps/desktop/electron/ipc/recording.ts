// ============================================================================
// IPC: Recording — Source capture, cursor telemetry, recording state
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import { desktopCapturer, ipcMain, screen, systemPreferences, type BrowserWindow } from "electron";
import { RECORDINGS_DIR } from "../main.js";

interface CursorTelemetryPoint {
	timeMs: number;
	cx: number;
	cy: number;
}

interface SelectedSource {
	name: string;
	display_id?: string;
	[key: string]: unknown;
}

const CURSOR_SAMPLE_INTERVAL_MS = 100;
const MAX_CURSOR_SAMPLES = 36_000; // 1 hour at 10Hz

let selectedSource: SelectedSource | null = null;
let cursorCaptureInterval: ReturnType<typeof setInterval> | null = null;
let cursorCaptureStartTimeMs = 0;
let activeCursorSamples: CursorTelemetryPoint[] = [];
export let pendingCursorSamples: CursorTelemetryPoint[] = [];

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function sampleCursorPoint() {
	const cursor = screen.getCursorScreenPoint();
	const sourceDisplayId = Number(selectedSource?.display_id);
	const sourceDisplay = Number.isFinite(sourceDisplayId)
		? (screen.getAllDisplays().find((d) => d.id === sourceDisplayId) ?? null)
		: null;
	const display = sourceDisplay ?? screen.getDisplayNearestPoint(cursor);
	const { bounds } = display;
	const w = Math.max(1, bounds.width);
	const h = Math.max(1, bounds.height);

	activeCursorSamples.push({
		timeMs: Math.max(0, Date.now() - cursorCaptureStartTimeMs),
		cx: clamp((cursor.x - bounds.x) / w, 0, 1),
		cy: clamp((cursor.y - bounds.y) / h, 0, 1),
	});

	if (activeCursorSamples.length > MAX_CURSOR_SAMPLES) {
		activeCursorSamples.shift();
	}
}

function stopCursorCapture() {
	if (cursorCaptureInterval) {
		clearInterval(cursorCaptureInterval);
		cursorCaptureInterval = null;
	}
}

export function registerRecordingHandlers(
	getMainWindow: () => BrowserWindow | null,
	getSourceSelectorWindow: () => BrowserWindow | null,
	onRecordingStateChange: (recording: boolean) => void,
	onOpenEditor: (videoPath: string) => void,
	onOpenSourceSelector: () => void,
) {
	// Sources
	ipcMain.handle("get-sources", async (_, opts) => {
		const sources = await desktopCapturer.getSources(opts);
		return sources.map((s) => ({
			id: s.id,
			name: s.name,
			display_id: s.display_id,
			thumbnail: s.thumbnail?.toDataURL() ?? null,
			appIcon: s.appIcon?.toDataURL() ?? null,
		}));
	});

	ipcMain.handle("select-source", (_, source: SelectedSource) => {
		selectedSource = source;
		const selectorWin = getSourceSelectorWindow();
		if (selectorWin && !selectorWin.isDestroyed()) selectorWin.close();
		return selectedSource;
	});

	ipcMain.handle("get-selected-source", () => selectedSource);

	// Camera access (macOS)
	ipcMain.handle("request-camera-access", async () => {
		if (process.platform !== "darwin") {
			return { success: true, granted: true, status: "granted" };
		}
		try {
			const status = systemPreferences.getMediaAccessStatus("camera");
			if (status === "granted") return { success: true, granted: true, status };

			if (status === "not-determined") {
				const granted = await systemPreferences.askForMediaAccess("camera");
				return {
					success: true,
					granted,
					status: granted ? "granted" : systemPreferences.getMediaAccessStatus("camera"),
				};
			}

			return { success: true, granted: false, status };
		} catch (error) {
			return { success: false, granted: false, status: "unknown", error: String(error) };
		}
	});

	// Recording state + cursor telemetry
	ipcMain.handle("set-recording-state", (_, recording: boolean) => {
		if (recording) {
			stopCursorCapture();
			activeCursorSamples = [];
			pendingCursorSamples = [];
			cursorCaptureStartTimeMs = Date.now();
			sampleCursorPoint();
			cursorCaptureInterval = setInterval(sampleCursorPoint, CURSOR_SAMPLE_INTERVAL_MS);
		} else {
			stopCursorCapture();
			pendingCursorSamples = [...activeCursorSamples];
			activeCursorSamples = [];
		}
		onRecordingStateChange(recording);
	});

	ipcMain.handle("get-cursor-telemetry", () => {
		return { success: true, samples: pendingCursorSamples };
	});

	// Cursor telemetry start/stop via send (not invoke)
	ipcMain.on("cursor:start-telemetry", () => {
		stopCursorCapture();
		activeCursorSamples = [];
		pendingCursorSamples = [];
		cursorCaptureStartTimeMs = Date.now();
		sampleCursorPoint();
		cursorCaptureInterval = setInterval(sampleCursorPoint, CURSOR_SAMPLE_INTERVAL_MS);
	});

	ipcMain.handle("cursor:stop-telemetry", () => {
		stopCursorCapture();
		pendingCursorSamples = [...activeCursorSamples];
		activeCursorSamples = [];
		return pendingCursorSamples;
	});

	// Save recording blob to disk
	ipcMain.handle("recording:save", async (_, { data, sourceName }: { data: number[]; sourceName: string }) => {
		try {
			const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
			const safeName = (sourceName || "recording").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 50);
			const filename = `${safeName}_${timestamp}.webm`;
			const filePath = path.join(RECORDINGS_DIR, filename);

			// Ensure recordings directory exists
			if (!fs.existsSync(RECORDINGS_DIR)) {
				fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
			}

			fs.writeFileSync(filePath, Buffer.from(new Uint8Array(data)));
			console.log(`[Recording] Saved: ${filePath}`);
			return { success: true, path: filePath };
		} catch (error) {
			console.error("[Recording] Failed to save:", error);
			return { success: false };
		}
	});

	// Get latest recording path
	ipcMain.handle("recording:get-latest-path", async () => {
		try {
			if (!fs.existsSync(RECORDINGS_DIR)) {
				return { success: false };
			}
			const files = fs.readdirSync(RECORDINGS_DIR)
				.filter(f => f.endsWith(".webm"))
				.map(f => ({
					name: f,
					time: fs.statSync(path.join(RECORDINGS_DIR, f)).mtimeMs,
				}))
				.sort((a, b) => b.time - a.time);

			if (files.length === 0) return { success: false };
			return { success: true, path: path.join(RECORDINGS_DIR, files[0].name) };
		} catch {
			return { success: false };
		}
	});

	// Open editor with recording (from HUD after stop)
	ipcMain.on("recording:open-editor", (_event, videoPath: string) => {
		console.log(`[Recording] Opening editor with: ${videoPath}`);
		// Close the HUD and open the editor
		const mainWin = getMainWindow();
		if (mainWin && !mainWin.isDestroyed()) {
			mainWin.close();
		}
		// The switchToEditor-like logic: we need to send the video path
		// We'll emit an event that main.ts listens for
		onOpenEditor(videoPath);
	});

	// Source selector (from preload channel name)
	ipcMain.on("recording:open-source-selector", () => {
		const selectorWin = getSourceSelectorWindow();
		if (selectorWin && !selectorWin.isDestroyed()) {
			selectorWin.focus();
		} else {
			onOpenSourceSelector();
		}
	});
}
