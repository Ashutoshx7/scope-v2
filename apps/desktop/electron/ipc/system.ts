// ============================================================================
// IPC: System — Platform info, asset paths, external URLs, shortcuts
// ============================================================================

import path from "node:path";
import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { app, ipcMain, shell } from "electron";
import { APP_ROOT, RENDERER_DIST } from "../main.js";

const SHORTCUTS_FILE = path.join(app.getPath("userData"), "shortcuts.json");

export function registerSystemHandlers() {
	ipcMain.handle("get-platform", () => process.platform);

	ipcMain.handle("get-asset-base-path", () => {
		try {
			const assetPath = app.isPackaged
				? path.join(process.resourcesPath, "assets")
				: path.join(APP_ROOT, "public", "assets");
			return pathToFileURL(`${assetPath}${path.sep}`).toString();
		} catch {
			return null;
		}
	});

	ipcMain.handle("open-external-url", async (_, url: string) => {
		try {
			await shell.openExternal(url);
			return { success: true };
		} catch (error) {
			return { success: false, error: String(error) };
		}
	});

	ipcMain.handle("get-shortcuts", async () => {
		try {
			const content = await fs.readFile(SHORTCUTS_FILE, "utf-8");
			return JSON.parse(content);
		} catch {
			return {};
		}
	});

	ipcMain.handle("save-shortcuts", async (_, shortcuts: unknown) => {
		try {
			await fs.writeFile(SHORTCUTS_FILE, JSON.stringify(shortcuts, null, 2), "utf-8");
			return { success: true };
		} catch (error) {
			return { success: false, error: String(error) };
		}
	});
}
