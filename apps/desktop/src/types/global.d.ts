// ============================================================================
// Global type declarations for the Electron renderer process
// ============================================================================

import type { ElectronAPI } from "../electron/preload.js";

declare global {
	interface Window {
		electronAPI?: ElectronAPI;
	}
}

export {};
