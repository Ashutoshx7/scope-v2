// ============================================================================
// Electron Main Process — Window management, tray, and IPC orchestration
// ============================================================================

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	app,
	BrowserWindow,
	ipcMain,
	Menu,
	nativeImage,
	session,
	systemPreferences,
	Tray,
	screen,
} from "electron";
import { registerRecordingHandlers } from "./ipc/recording.js";
import { registerFilesystemHandlers } from "./ipc/filesystem.js";
import { registerSystemHandlers } from "./ipc/system.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// macOS: Use Screen & System Audio Recording permissions
if (process.platform === "darwin") {
	app.commandLine.appendSwitch("disable-features", "MacCatapLoopbackAudioForScreenShare");
}

// Paths
export const APP_ROOT = path.join(__dirname, "..");
export const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
export const RENDERER_DIST = path.join(APP_ROOT, "dist");
export const RECORDINGS_DIR = path.join(app.getPath("userData"), "recordings");

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
	? path.join(APP_ROOT, "public")
	: RENDERER_DIST;

// ---------------------------------------------------------------------------
// Window State
// ---------------------------------------------------------------------------

let mainWindow: BrowserWindow | null = null;
let sourceSelectorWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
const isMac = process.platform === "darwin";

// ---------------------------------------------------------------------------
// Window Factories
// ---------------------------------------------------------------------------

function createHudOverlayWindow(): BrowserWindow {
	const { workArea } = screen.getPrimaryDisplay();
	const width = 600;
	const height = 160;

	const win = new BrowserWindow({
		width,
		height,
		minWidth: width,
		maxWidth: width,
		minHeight: height,
		maxHeight: height,
		x: Math.floor(workArea.x + (workArea.width - width) / 2),
		y: Math.floor(workArea.y + workArea.height - height - 5),
		frame: false,
		transparent: true,
		resizable: false,
		alwaysOnTop: true,
		skipTaskbar: true,
		hasShadow: false,
		show: true,
		webPreferences: {
			preload: path.join(__dirname, "preload.mjs"),
			nodeIntegration: false,
			contextIsolation: true,
			backgroundThrottling: false,
		},
	});

	if (isMac) {
		win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
	}

	if (VITE_DEV_SERVER_URL) {
		win.loadURL(`${VITE_DEV_SERVER_URL}?windowType=hud-overlay`);
	} else {
		win.loadFile(path.join(RENDERER_DIST, "index.html"), {
			query: { windowType: "hud-overlay" },
		});
	}

	return win;
}

function createEditorWindow(videoPath?: string): BrowserWindow {
	const win = new BrowserWindow({
		width: 1200,
		height: 800,
		minWidth: 800,
		minHeight: 600,
		...(isMac && {
			titleBarStyle: "hiddenInset",
			trafficLightPosition: { x: 12, y: 12 },
		}),
		transparent: false,
		resizable: true,
		alwaysOnTop: false,
		skipTaskbar: false,
		title: "Scope",
		backgroundColor: "#000000",
		show: true,
		webPreferences: {
			preload: path.join(__dirname, "preload.mjs"),
			nodeIntegration: false,
			contextIsolation: true,
			webSecurity: false,
			backgroundThrottling: false,
		},
	});

	win.maximize();

	const query: Record<string, string> = { windowType: "editor" };
	if (videoPath) {
		query.videoPath = videoPath;
	}

	if (VITE_DEV_SERVER_URL) {
		const params = new URLSearchParams(query).toString();
		win.loadURL(`${VITE_DEV_SERVER_URL}?${params}`);
	} else {
		win.loadFile(path.join(RENDERER_DIST, "index.html"), { query });
	}

	return win;
}

function createSourceSelectorWindow(): BrowserWindow {
	const { width, height } = screen.getPrimaryDisplay().workAreaSize;

	const win = new BrowserWindow({
		width: 620,
		height: 420,
		minHeight: 350,
		maxHeight: 500,
		x: Math.round((width - 620) / 2),
		y: Math.round((height - 420) / 2),
		frame: false,
		resizable: false,
		alwaysOnTop: true,
		transparent: true,
		backgroundColor: "#00000000",
		webPreferences: {
			preload: path.join(__dirname, "preload.mjs"),
			nodeIntegration: false,
			contextIsolation: true,
		},
	});

	if (isMac) {
		win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
	}

	if (VITE_DEV_SERVER_URL) {
		win.loadURL(`${VITE_DEV_SERVER_URL}?windowType=source-selector`);
	} else {
		win.loadFile(path.join(RENDERER_DIST, "index.html"), {
			query: { windowType: "source-selector" },
		});
	}

	win.on("closed", () => {
		sourceSelectorWindow = null;
	});

	return win;
}

// ---------------------------------------------------------------------------
// Tray
// ---------------------------------------------------------------------------

function getTrayIcon(filename: string, size: number) {
	return nativeImage
		.createFromPath(path.join(process.env.VITE_PUBLIC || RENDERER_DIST, filename))
		.resize({ width: size, height: size, quality: "best" });
}

function createTray() {
	const iconSize = isMac ? 16 : 24;
	tray = new Tray(getTrayIcon("scope.png", iconSize));
	tray.on("click", () => showMainWindow());
	tray.on("double-click", () => showMainWindow());
	updateTrayMenu();
}

function updateTrayMenu(recording = false) {
	if (!tray) return;

	const menuTemplate = recording
		? [
				{
					label: "Stop Recording",
					click: () => {
						mainWindow?.webContents.send("stop-recording-from-tray");
					},
				},
			]
		: [
				{ label: "Open", click: () => showMainWindow() },
				{ label: "Quit", click: () => app.quit() },
			];

	tray.setContextMenu(Menu.buildFromTemplate(menuTemplate));
	tray.setToolTip(recording ? "Recording..." : "Scope");
}

// ---------------------------------------------------------------------------
// Window Management
// ---------------------------------------------------------------------------

function showMainWindow() {
	if (mainWindow && !mainWindow.isDestroyed()) {
		if (mainWindow.isMinimized()) mainWindow.restore();
		mainWindow.show();
		mainWindow.focus();
		return;
	}
	mainWindow = createHudOverlayWindow();
}

function switchToEditor(videoPath?: string) {
	if (mainWindow && !mainWindow.isDestroyed()) {
		mainWindow.close();
		mainWindow = null;
	}
	mainWindow = createEditorWindow(videoPath);
}

function switchToHud() {
	if (mainWindow && !mainWindow.isDestroyed()) {
		mainWindow.close();
		mainWindow = null;
	}
	showMainWindow();
}

// ---------------------------------------------------------------------------
// Application Menu
// ---------------------------------------------------------------------------

function setupApplicationMenu() {
	const template: Electron.MenuItemConstructorOptions[] = [];

	if (isMac) {
		template.push({
			label: app.name,
			submenu: [
				{ role: "about" },
				{ type: "separator" },
				{ role: "services" },
				{ type: "separator" },
				{ role: "hide" },
				{ role: "hideOthers" },
				{ role: "unhide" },
				{ type: "separator" },
				{ role: "quit" },
			],
		});
	}

	template.push(
		{
			label: "File",
			submenu: [
				{
					label: "Open Project…",
					accelerator: "CmdOrCtrl+O",
					click: () => mainWindow?.webContents.send("menu-load-project"),
				},
				{
					label: "Save Project",
					accelerator: "CmdOrCtrl+S",
					click: () => mainWindow?.webContents.send("menu-save-project"),
				},
				{
					label: "Save Project As…",
					accelerator: "CmdOrCtrl+Shift+S",
					click: () => mainWindow?.webContents.send("menu-save-project-as"),
				},
				...(isMac ? [] : [{ type: "separator" as const }, { role: "quit" as const }]),
			],
		},
		{
			label: "Edit",
			submenu: [
				{ role: "undo" },
				{ role: "redo" },
				{ type: "separator" },
				{ role: "cut" },
				{ role: "copy" },
				{ role: "paste" },
				{ role: "selectAll" },
			],
		},
		{
			label: "View",
			submenu: [
				{ role: "reload" },
				{ role: "forceReload" },
				{ role: "toggleDevTools" },
				{ type: "separator" },
				{ role: "resetZoom" },
				{ role: "zoomIn" },
				{ role: "zoomOut" },
				{ type: "separator" },
				{ role: "togglefullscreen" },
			],
		},
		{
			label: "Window",
			submenu: isMac
				? [{ role: "minimize" }, { role: "zoom" }, { type: "separator" }, { role: "front" }]
				: [{ role: "minimize" }, { role: "close" }],
		},
	);

	Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------------------------------------------------------------------------
// App Lifecycle
// ---------------------------------------------------------------------------

async function ensureRecordingsDir() {
	try {
		await fs.mkdir(RECORDINGS_DIR, { recursive: true });
	} catch (error) {
		console.error("Failed to create recordings directory:", error);
	}
}

app.on("window-all-closed", () => {
	// Keep running (macOS behavior — tray stays active)
});

app.on("activate", () => {
	if (BrowserWindow.getAllWindows().length === 0) {
		showMainWindow();
	}
});

app.whenReady().then(async () => {
	// Media permissions
	session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
		return ["media", "audioCapture", "microphone", "videoCapture", "camera"].includes(permission);
	});

	session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
		callback(
			["media", "audioCapture", "microphone", "videoCapture", "camera"].includes(permission),
		);
	});

	// macOS microphone permission
	if (isMac) {
		const micStatus = systemPreferences.getMediaAccessStatus("microphone");
		if (micStatus !== "granted") {
			await systemPreferences.askForMediaAccess("microphone");
		}
	}

	// HUD close
	ipcMain.on("hud-overlay-close", () => app.quit());
	ipcMain.on("hud-overlay-hide", () => {
		if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
	});

	// Window switching
	ipcMain.handle("switch-to-editor", () => switchToEditor());
	ipcMain.handle("switch-to-hud", () => switchToHud());
	ipcMain.handle("start-new-recording", () => switchToHud());

	ipcMain.handle("open-source-selector", () => {
		if (sourceSelectorWindow && !sourceSelectorWindow.isDestroyed()) {
			sourceSelectorWindow.focus();
			return;
		}
		sourceSelectorWindow = createSourceSelectorWindow();
	});

	// Register modular IPC handlers
	registerRecordingHandlers(
		() => mainWindow,
		() => sourceSelectorWindow,
		(recording) => updateTrayMenu(recording),
		(videoPath) => {
			// Called when recording is saved and editor should open
			switchToEditor(videoPath);
			console.log(`[Main] Editor opened for: ${videoPath}`);
		},
		() => {
			// Called when source selector is requested
			if (sourceSelectorWindow && !sourceSelectorWindow.isDestroyed()) {
				sourceSelectorWindow.focus();
				return;
			}
			sourceSelectorWindow = createSourceSelectorWindow();
		},
	);
	registerFilesystemHandlers();
	registerSystemHandlers();

	await ensureRecordingsDir();
	createTray();
	setupApplicationMenu();
	showMainWindow();
});
