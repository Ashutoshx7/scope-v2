// ============================================================================
// Content Script — Recording indicator overlay + cursor tracking
//
// Injected into all pages. Provides:
//   1. A floating "Recording" indicator pill (red dot + timer)
//   2. Cursor position tracking for telemetry
//   3. Click visualization ripple effect
//   4. Communication bridge between the page and background SW
// ============================================================================

/// <reference types="chrome" />

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let isRecording = false;
let isPaused = false;
let startTime = 0;
let indicatorElement: HTMLElement | null = null;
let timerInterval: ReturnType<typeof setInterval> | null = null;
let cursorTracker: ReturnType<typeof setInterval> | null = null;

// ---------------------------------------------------------------------------
// Messages from Background
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	switch (message.action) {
		case "content-start-indicator":
			showRecordingIndicator();
			startCursorTracking();
			sendResponse({ success: true });
			break;

		case "content-stop-indicator":
			hideRecordingIndicator();
			stopCursorTracking();
			sendResponse({ success: true });
			break;

		case "content-pause-indicator":
			setPauseState(true);
			sendResponse({ success: true });
			break;

		case "content-resume-indicator":
			setPauseState(false);
			sendResponse({ success: true });
			break;

		default:
			break;
	}
	return false;
});

// ---------------------------------------------------------------------------
// Recording Indicator
// ---------------------------------------------------------------------------

function showRecordingIndicator() {
	isRecording = true;
	isPaused = false;
	startTime = Date.now();

	// Create indicator element
	indicatorElement = document.createElement("div");
	indicatorElement.id = "scope-recording-indicator";
	indicatorElement.setAttribute("style", `
		position: fixed;
		top: 16px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 2147483647;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 14px;
		background: rgba(15, 12, 20, 0.85);
		backdrop-filter: blur(16px);
		-webkit-backdrop-filter: blur(16px);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 100px;
		font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
		font-size: 12px;
		font-weight: 600;
		color: #e8e4f0;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.04);
		pointer-events: none;
		animation: scope-slide-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
		transition: opacity 0.3s ease, transform 0.3s ease;
	`);

	indicatorElement.innerHTML = `
		<span id="scope-rec-dot" style="
			width: 8px;
			height: 8px;
			background: #ff4444;
			border-radius: 50%;
			animation: scope-pulse 1.5s ease-in-out infinite;
			flex-shrink: 0;
		"></span>
		<span>REC</span>
		<span id="scope-rec-timer" style="
			font-family: 'SF Mono', 'Fira Code', monospace;
			font-size: 11px;
			color: rgba(255, 255, 255, 0.6);
		">00:00</span>
	`;

	// Add animation keyframes
	const style = document.createElement("style");
	style.id = "scope-styles";
	style.textContent = `
		@keyframes scope-slide-in {
			from {
				opacity: 0;
				transform: translateX(-50%) translateY(-20px) scale(0.9);
			}
			to {
				opacity: 1;
				transform: translateX(-50%) translateY(0) scale(1);
			}
		}
		@keyframes scope-pulse {
			0%, 100% { opacity: 1; }
			50% { opacity: 0.3; }
		}
		@keyframes scope-click-ripple {
			0% {
				transform: translate(-50%, -50%) scale(0);
				opacity: 0.6;
			}
			100% {
				transform: translate(-50%, -50%) scale(1);
				opacity: 0;
			}
		}
	`;

	document.documentElement.appendChild(style);
	document.documentElement.appendChild(indicatorElement);

	// Start timer
	timerInterval = setInterval(updateTimer, 250);

	// Add click visualization
	document.addEventListener("click", handleClickVisualization, true);
}

function hideRecordingIndicator() {
	isRecording = false;
	isPaused = false;

	if (indicatorElement) {
		indicatorElement.style.opacity = "0";
		indicatorElement.style.transform = "translateX(-50%) translateY(-20px) scale(0.9)";
		setTimeout(() => {
			indicatorElement?.remove();
			indicatorElement = null;
		}, 300);
	}

	if (timerInterval) {
		clearInterval(timerInterval);
		timerInterval = null;
	}

	// Remove click visualization
	document.removeEventListener("click", handleClickVisualization, true);

	// Remove styles
	document.getElementById("scope-styles")?.remove();
}

function setPauseState(paused: boolean) {
	isPaused = paused;
	const dot = document.getElementById("scope-rec-dot");
	if (dot) {
		dot.style.background = paused ? "#ff8c00" : "#ff4444";
		dot.style.animation = paused ? "none" : "scope-pulse 1.5s ease-in-out infinite";
	}
}

function updateTimer() {
	if (isPaused) return;
	const elapsed = Math.floor((Date.now() - startTime) / 1000);
	const mins = Math.floor(elapsed / 60);
	const secs = elapsed % 60;
	const timerEl = document.getElementById("scope-rec-timer");
	if (timerEl) {
		timerEl.textContent = `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
	}
}

// ---------------------------------------------------------------------------
// Click Visualization
// ---------------------------------------------------------------------------

function handleClickVisualization(e: MouseEvent) {
	if (!isRecording) return;

	const ripple = document.createElement("div");
	ripple.setAttribute("style", `
		position: fixed;
		left: ${e.clientX}px;
		top: ${e.clientY}px;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: rgba(108, 92, 231, 0.3);
		border: 2px solid rgba(108, 92, 231, 0.5);
		pointer-events: none;
		z-index: 2147483646;
		animation: scope-click-ripple 0.5s ease-out forwards;
	`);

	document.documentElement.appendChild(ripple);
	setTimeout(() => ripple.remove(), 500);
}

// ---------------------------------------------------------------------------
// Cursor Position Tracking
// ---------------------------------------------------------------------------

let cursorData: Array<{ timeMs: number; cx: number; cy: number }> = [];

function startCursorTracking() {
	cursorData = [];
	const startMs = Date.now();

	document.addEventListener("mousemove", handleMouseMove);

	function handleMouseMove(e: MouseEvent) {
		const cx = e.clientX / window.innerWidth;
		const cy = e.clientY / window.innerHeight;
		cursorData.push({
			timeMs: Date.now() - startMs,
			cx: Math.max(0, Math.min(1, cx)),
			cy: Math.max(0, Math.min(1, cy)),
		});

		// Keep last 10 minutes at 10Hz (6000 entries max)
		if (cursorData.length > 6000) {
			cursorData.shift();
		}
	}

	// Store reference for cleanup
	(window as any).__scope_mousemove = handleMouseMove;
}

function stopCursorTracking() {
	const handler = (window as any).__scope_mousemove;
	if (handler) {
		document.removeEventListener("mousemove", handler);
		delete (window as any).__scope_mousemove;
	}

	// Send cursor data to background
	if (cursorData.length > 0) {
		chrome.runtime.sendMessage({
			action: "cursor-telemetry",
			data: cursorData,
		});
		cursorData = [];
	}
}
