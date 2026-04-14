// ============================================================================
// Extension Background Service Worker (Phase 5: Complete)
//
// Orchestrates screen/tab capture, manages recording state, coordinates
// between popup, side panel, offscreen document, and content scripts.
// ============================================================================

/// <reference types="chrome" />

interface RecordingState {
	active: boolean;
	type: "tab" | "desktop" | "camera" | null;
	startTime: number;
	mediaStreamId?: string;
	tabId?: number;
}

let recordingState: RecordingState = {
	active: false,
	type: null,
	startTime: 0,
};

let cursorTelemetryData: Array<{ timeMs: number; cx: number; cy: number }> = [];

// ---------------------------------------------------------------------------
// Message handling
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	switch (message.action) {
		case "start-tab-capture":
			startTabCapture().then(sendResponse);
			return true;

		case "start-desktop-capture":
			startDesktopCapture().then(sendResponse);
			return true;

		case "stop-recording":
			stopRecording().then(sendResponse);
			return true;

		case "get-recording-state":
			sendResponse(recordingState);
			return false;

		case "open-editor":
			openSidePanel(message.windowId);
			sendResponse({ success: true });
			return false;

		// From offscreen document
		case "recording-started":
			recordingState.active = true;
			// Notify content script to show indicator
			if (recordingState.tabId) {
				chrome.tabs.sendMessage(recordingState.tabId, {
					action: "content-start-indicator",
				}).catch(() => {});
			}
			broadcastState();
			return false;

		case "recording-complete":
			recordingState.active = false;
			recordingState.type = null;
			// Notify content script to hide indicator
			if (recordingState.tabId) {
				chrome.tabs.sendMessage(recordingState.tabId, {
					action: "content-stop-indicator",
				}).catch(() => {});
			}
			// Reset icon
			chrome.action.setIcon({
				path: { 16: "icons/icon-16.png", 48: "icons/icon-48.png", 128: "icons/icon-128.png" },
			});
			broadcastState();
			// Show notification
			chrome.notifications?.create({
				type: "basic",
				iconUrl: "icons/icon-128.png",
				title: "Recording Complete",
				message: "Your recording is ready! Click to open the editor.",
			});
			return false;

		// From content script
		case "cursor-telemetry":
			cursorTelemetryData = message.data || [];
			sendResponse({ success: true });
			return false;

		case "get-cursor-telemetry":
			sendResponse({ data: cursorTelemetryData });
			return false;

		default:
			return false;
	}
});

// ---------------------------------------------------------------------------
// Notification click → open side panel
// ---------------------------------------------------------------------------

chrome.notifications?.onClicked?.addListener(async () => {
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
	if (tab?.windowId) {
		openSidePanel(tab.windowId);
	}
});

// ---------------------------------------------------------------------------
// Tab Capture
// ---------------------------------------------------------------------------

async function startTabCapture(): Promise<{ success: boolean; error?: string }> {
	try {
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
		if (!tab?.id) throw new Error("No active tab");

		const streamId = await chrome.tabCapture.getMediaStreamId({
			targetTabId: tab.id,
		});

		recordingState = {
			active: true,
			type: "tab",
			startTime: Date.now(),
			mediaStreamId: streamId,
			tabId: tab.id,
		};

		await ensureOffscreenDocument();

		chrome.runtime.sendMessage({
			action: "offscreen-start-recording",
			streamId,
			type: "tab",
		});

		chrome.action.setIcon({
			path: { 16: "icons/icon-recording-16.png", 48: "icons/icon-recording-48.png" },
		});

		return { success: true };
	} catch (error) {
		return { success: false, error: String(error) };
	}
}

// ---------------------------------------------------------------------------
// Desktop Capture
// ---------------------------------------------------------------------------

async function startDesktopCapture(): Promise<{ success: boolean; error?: string }> {
	return new Promise((resolve) => {
		chrome.desktopCapture.chooseDesktopMedia(
			["screen", "window", "tab"],
			async (streamId) => {
				if (!streamId) {
					resolve({ success: false, error: "User cancelled" });
					return;
				}

				const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

				recordingState = {
					active: true,
					type: "desktop",
					startTime: Date.now(),
					mediaStreamId: streamId,
					tabId: tab?.id,
				};

				await ensureOffscreenDocument();

				chrome.runtime.sendMessage({
					action: "offscreen-start-recording",
					streamId,
					type: "desktop",
				});

				chrome.action.setIcon({
					path: { 16: "icons/icon-recording-16.png", 48: "icons/icon-recording-48.png" },
				});

				resolve({ success: true });
			},
		);
	});
}

// ---------------------------------------------------------------------------
// Stop Recording
// ---------------------------------------------------------------------------

async function stopRecording(): Promise<{ success: boolean }> {
	// Tell content script to hide indicator
	if (recordingState.tabId) {
		chrome.tabs.sendMessage(recordingState.tabId, {
			action: "content-stop-indicator",
		}).catch(() => {});
	}

	// Tell offscreen to stop
	chrome.runtime.sendMessage({ action: "offscreen-stop-recording" });

	recordingState = { active: false, type: null, startTime: 0 };

	chrome.action.setIcon({
		path: { 16: "icons/icon-16.png", 48: "icons/icon-48.png", 128: "icons/icon-128.png" },
	});

	broadcastState();
	return { success: true };
}

// ---------------------------------------------------------------------------
// Side Panel
// ---------------------------------------------------------------------------

async function openSidePanel(windowId?: number) {
	try {
		if (windowId) {
			await chrome.sidePanel.open({ windowId });
		}
	} catch (err) {
		console.warn("[ServiceWorker] Failed to open side panel:", err);
	}
}

// ---------------------------------------------------------------------------
// Offscreen Document Management
// ---------------------------------------------------------------------------

async function ensureOffscreenDocument() {
	const existingContexts = await chrome.runtime.getContexts({
		contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
	});

	if (existingContexts.length > 0) return;

	await chrome.offscreen.createDocument({
		url: "offscreen.html",
		reasons: [chrome.offscreen.Reason.USER_MEDIA],
		justification: "Recording screen/tab media stream",
	});
}

// ---------------------------------------------------------------------------
// Broadcast recording state to popup
// ---------------------------------------------------------------------------

function broadcastState() {
	chrome.runtime.sendMessage({
		action: "recording-state-changed",
		state: recordingState,
	}).catch(() => {}); // Popup may not be open
}

// ---------------------------------------------------------------------------
// Context menu for quick access
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(() => {
	chrome.contextMenus?.create({
		id: "scope-record-tab",
		title: "Record this tab",
		contexts: ["page"],
	});
	chrome.contextMenus?.create({
		id: "scope-record-screen",
		title: "Record screen",
		contexts: ["page"],
	});
});

chrome.contextMenus?.onClicked?.addListener((info) => {
	if (info.menuItemId === "scope-record-tab") {
		startTabCapture();
	} else if (info.menuItemId === "scope-record-screen") {
		startDesktopCapture();
	}
});

// ---------------------------------------------------------------------------
// Keyboard shortcuts
// ---------------------------------------------------------------------------

chrome.commands?.onCommand?.addListener((command) => {
	if (command === "toggle-recording") {
		if (recordingState.active) {
			stopRecording();
		} else {
			startTabCapture();
		}
	}
});
