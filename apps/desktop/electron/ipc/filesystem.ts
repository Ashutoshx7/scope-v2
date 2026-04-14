// ============================================================================
// IPC: Filesystem — File I/O, project save/load, video export
// ============================================================================

import fs from "node:fs/promises";
import path from "node:path";
import { app, dialog, ipcMain, shell } from "electron";
import { RECORDINGS_DIR } from "../main.js";

const PROJECT_FILE_EXTENSION = "openscreen";
const ALLOWED_VIDEO_EXTENSIONS = new Set([".webm", ".mp4", ".mov", ".avi", ".mkv"]);

let currentVideoPath: string | null = null;
let currentProjectPath: string | null = null;

export function registerFilesystemHandlers() {
	// Video path management
	ipcMain.handle("get-current-video-path", () => currentVideoPath);
	ipcMain.handle("set-current-video-path", (_, videoPath: string) => {
		currentVideoPath = videoPath;
	});
	ipcMain.handle("clear-current-video-path", () => {
		currentVideoPath = null;
	});

	// Read binary file
	ipcMain.handle("read-binary-file", async (_, inputPath: string) => {
		try {
			const data = await fs.readFile(inputPath);
			return {
				success: true,
				data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
				path: inputPath,
			};
		} catch (error) {
			return { success: false, message: "Failed to read file", error: String(error) };
		}
	});

	// Store recorded video
	ipcMain.handle("store-recorded-video", async (_, videoData: ArrayBuffer, fileName: string) => {
		try {
			const outputPath = path.join(RECORDINGS_DIR, path.basename(fileName));
			await fs.writeFile(outputPath, Buffer.from(videoData));
			currentVideoPath = outputPath;
			currentProjectPath = null;
			return { success: true, path: outputPath };
		} catch (error) {
			return { success: false, message: "Failed to store video", error: String(error) };
		}
	});

	// Store recording session (screen + optional webcam)
	ipcMain.handle("store-recorded-session", async (_, payload: {
		screen: { videoData: ArrayBuffer; fileName: string };
		webcam?: { videoData: ArrayBuffer; fileName: string };
		createdAt?: number;
	}) => {
		try {
			const screenPath = path.join(RECORDINGS_DIR, path.basename(payload.screen.fileName));
			await fs.writeFile(screenPath, Buffer.from(payload.screen.videoData));

			let webcamPath: string | undefined;
			if (payload.webcam) {
				webcamPath = path.join(RECORDINGS_DIR, path.basename(payload.webcam.fileName));
				await fs.writeFile(webcamPath, Buffer.from(payload.webcam.videoData));
			}

			const session = {
				screenVideoPath: screenPath,
				webcamVideoPath: webcamPath,
				createdAt: payload.createdAt ?? Date.now(),
			};

			// Write session manifest
			const manifestPath = path.join(
				RECORDINGS_DIR,
				`${path.parse(payload.screen.fileName).name}.session.json`,
			);
			await fs.writeFile(manifestPath, JSON.stringify(session, null, 2), "utf-8");

			currentVideoPath = screenPath;
			currentProjectPath = null;

			return { success: true, path: screenPath, session };
		} catch (error) {
			return { success: false, message: "Failed to store session", error: String(error) };
		}
	});

	// Save exported video
	ipcMain.handle("save-exported-video", async (_, videoData: ArrayBuffer, fileName: string) => {
		try {
			const isGif = fileName.toLowerCase().endsWith(".gif");
			const result = await dialog.showSaveDialog({
				title: isGif ? "Save GIF" : "Save Video",
				defaultPath: path.join(app.getPath("downloads"), fileName),
				filters: isGif
					? [{ name: "GIF Image", extensions: ["gif"] }]
					: [{ name: "MP4 Video", extensions: ["mp4"] }],
				properties: ["createDirectory", "showOverwriteConfirmation"],
			});

			if (result.canceled || !result.filePath) {
				return { success: false, canceled: true };
			}

			await fs.writeFile(result.filePath, Buffer.from(videoData));
			return { success: true, path: result.filePath };
		} catch (error) {
			return { success: false, message: "Failed to save video", error: String(error) };
		}
	});

	// Open video file picker
	ipcMain.handle("open-video-file-picker", async () => {
		try {
			const result = await dialog.showOpenDialog({
				title: "Select Video",
				defaultPath: RECORDINGS_DIR,
				filters: [
					{ name: "Video Files", extensions: ["webm", "mp4", "mov", "avi", "mkv"] },
					{ name: "All Files", extensions: ["*"] },
				],
				properties: ["openFile"],
			});

			if (result.canceled || result.filePaths.length === 0) {
				return { success: false, canceled: true };
			}

			const filePath = result.filePaths[0];
			const ext = path.extname(filePath).toLowerCase();
			if (!ALLOWED_VIDEO_EXTENSIONS.has(ext)) {
				return { success: false, message: "Unsupported video format" };
			}

			currentVideoPath = filePath;
			currentProjectPath = null;
			return { success: true, path: filePath };
		} catch (error) {
			return { success: false, message: "Failed to open picker", error: String(error) };
		}
	});

	// Reveal in folder
	ipcMain.handle("reveal-in-folder", (_, filePath: string) => {
		try {
			shell.showItemInFolder(filePath);
			return { success: true };
		} catch (error) {
			return { success: false, error: String(error) };
		}
	});

	// Project save
	ipcMain.handle(
		"save-project-file",
		async (_, projectData: unknown, suggestedName?: string, existingPath?: string) => {
			try {
				// Re-save to existing path if trusted
				if (existingPath && currentProjectPath && existingPath === currentProjectPath) {
					await fs.writeFile(existingPath, JSON.stringify(projectData, null, 2), "utf-8");
					return { success: true, path: existingPath };
				}

				const safeName = (suggestedName || `project-${Date.now()}`).replace(
					/[^a-zA-Z0-9-_]/g,
					"_",
				);
				const defaultName = safeName.endsWith(`.${PROJECT_FILE_EXTENSION}`)
					? safeName
					: `${safeName}.${PROJECT_FILE_EXTENSION}`;

				const result = await dialog.showSaveDialog({
					title: "Save Project",
					defaultPath: path.join(RECORDINGS_DIR, defaultName),
					filters: [
						{ name: "OpenScreen Project", extensions: [PROJECT_FILE_EXTENSION] },
						{ name: "JSON", extensions: ["json"] },
					],
					properties: ["createDirectory", "showOverwriteConfirmation"],
				});

				if (result.canceled || !result.filePath) {
					return { success: false, canceled: true };
				}

				await fs.writeFile(result.filePath, JSON.stringify(projectData, null, 2), "utf-8");
				currentProjectPath = result.filePath;
				return { success: true, path: result.filePath };
			} catch (error) {
				return { success: false, message: "Failed to save project", error: String(error) };
			}
		},
	);

	// Project load
	ipcMain.handle("load-project-file", async () => {
		try {
			const result = await dialog.showOpenDialog({
				title: "Open Project",
				defaultPath: RECORDINGS_DIR,
				filters: [
					{ name: "OpenScreen Project", extensions: [PROJECT_FILE_EXTENSION, "json"] },
					{ name: "All Files", extensions: ["*"] },
				],
				properties: ["openFile"],
			});

			if (result.canceled || result.filePaths.length === 0) {
				return { success: false, canceled: true };
			}

			const filePath = result.filePaths[0];
			const content = await fs.readFile(filePath, "utf-8");
			const projectData = JSON.parse(content);

			currentProjectPath = filePath;
			return { success: true, path: filePath, data: projectData };
		} catch (error) {
			return { success: false, message: "Failed to load project", error: String(error) };
		}
	});

	// Recording session
	ipcMain.handle("get-current-recording-session", () => null);
	ipcMain.handle("set-current-recording-session", (_, session: unknown) => {
		// Store session state
	});

	// Get recorded video path
	ipcMain.handle("get-recorded-video-path", async () => {
		if (currentVideoPath) return { success: true, path: currentVideoPath };

		try {
			const files = await fs.readdir(RECORDINGS_DIR);
			const videoFiles = files.filter(
				(f) => f.endsWith(".webm") && !f.endsWith("-webcam.webm"),
			);
			if (videoFiles.length === 0) return { success: false, message: "No video found" };

			const latest = videoFiles.sort().reverse()[0];
			return { success: true, path: path.join(RECORDINGS_DIR, latest) };
		} catch (error) {
			return { success: false, message: "Failed to get video", error: String(error) };
		}
	});
}
