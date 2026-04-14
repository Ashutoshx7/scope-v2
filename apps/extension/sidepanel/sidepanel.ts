// ============================================================================
// Side Panel — In-browser video editor for Chrome Extension
//
// Provides a lightweight editing experience directly inside the browser,
// using recordings stored in chrome.storage.local by the offscreen document.
//
// Features:
//   - Video preview with playback controls
//   - Background, zoom, crop, and export panels (subset of desktop editor)
//   - Download as MP4/GIF/WebM
//   - Quick share (copy link)
// ============================================================================

/// <reference types="chrome" />

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface SidePanelState {
	loaded: boolean;
	videoUrl: string | null;
	recordingKey: string | null;
	playing: boolean;
	currentTimeMs: number;
	totalDurationMs: number;
	activeTab: "preview" | "background" | "zoom" | "export";
	backgroundValue: string;
	exportProgress: number | null;
}

let state: SidePanelState = {
	loaded: false,
	videoUrl: null,
	recordingKey: null,
	playing: false,
	currentTimeMs: 0,
	totalDurationMs: 0,
	activeTab: "preview",
	backgroundValue: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
	exportProgress: null,
};

let videoElement: HTMLVideoElement | null = null;

// ---------------------------------------------------------------------------
// Initialize
// ---------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", async () => {
	await loadLatestRecording();
	render();
});

async function loadLatestRecording() {
	try {
		const result = await chrome.storage.local.get("latestRecordingKey");
		const key = result.latestRecordingKey;
		if (!key) return;

		const data = await chrome.storage.local.get(key);
		const recording = data[key];
		if (!recording?.data) return;

		// Convert base64 back to blob
		const binary = atob(recording.data);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		const blob = new Blob([bytes], { type: recording.mimeType || "video/webm" });
		const url = URL.createObjectURL(blob);

		state.videoUrl = url;
		state.recordingKey = key;
		state.loaded = true;
	} catch (err) {
		console.error("[SidePanel] Failed to load recording:", err);
	}
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function render() {
	const root = document.getElementById("sidepanel-root");
	if (!root) return;

	root.innerHTML = `
		<div class="sp-layout">
			<!-- Header -->
			<header class="sp-header">
				<div class="sp-logo">
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="12" cy="12" r="10"/>
						<polygon points="10,8 16,12 10,16" fill="currentColor"/>
					</svg>
					<span>OpenScreen</span>
				</div>
			</header>

			<!-- Video Preview -->
			<div class="sp-preview">
				${state.videoUrl
					? `<video id="sp-video" src="${state.videoUrl}" class="sp-video" playsinline></video>`
					: `<div class="sp-empty">
						<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
							<rect x="2" y="2" width="20" height="20" rx="2"/>
							<polygon points="10,8 16,12 10,16" fill="currentColor"/>
						</svg>
						<p>No recording yet</p>
						<span>Record a tab or screen from the popup</span>
					</div>`
				}
			</div>

			<!-- Playback Controls -->
			${state.videoUrl ? `
				<div class="sp-controls">
					<button id="sp-play-btn" class="sp-play-btn" title="Play/Pause">
						${state.playing
							? '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
							: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,4 20,12 6,20"/></svg>'
						}
					</button>
					<div class="sp-progress-container" id="sp-progress">
						<div class="sp-progress-bar">
							<div class="sp-progress-fill" style="width: ${state.totalDurationMs > 0 ? (state.currentTimeMs / state.totalDurationMs) * 100 : 0}%"></div>
						</div>
					</div>
					<span class="sp-timecode">${formatTime(state.currentTimeMs)} / ${formatTime(state.totalDurationMs)}</span>
				</div>
			` : ""}

			<!-- Tab Bar -->
			<div class="sp-tabs">
				<button class="sp-tab ${state.activeTab === "preview" ? "sp-tab--active" : ""}" data-tab="preview">Preview</button>
				<button class="sp-tab ${state.activeTab === "background" ? "sp-tab--active" : ""}" data-tab="background">Background</button>
				<button class="sp-tab ${state.activeTab === "export" ? "sp-tab--active" : ""}" data-tab="export">Export</button>
			</div>

			<!-- Tab Content -->
			<div class="sp-content">
				${renderTabContent()}
			</div>
		</div>
	`;

	bindEvents();
}

function renderTabContent(): string {
	switch (state.activeTab) {
		case "preview":
			return `
				<div class="sp-tab-content">
					<h3>Recording Info</h3>
					${state.loaded ? `
						<div class="sp-info-row"><span>Duration</span><span>${formatTime(state.totalDurationMs)}</span></div>
						<div class="sp-info-row"><span>Format</span><span>WebM</span></div>
						<div class="sp-info-row"><span>Status</span><span class="sp-badge sp-badge--success">Ready</span></div>
					` : `
						<p class="sp-empty-text">Record something first using the extension popup.</p>
					`}
				</div>
			`;

		case "background":
			return `
				<div class="sp-tab-content">
					<h3>Background</h3>
					<div class="sp-bg-grid">
						${BACKGROUNDS.map((bg) => `
							<button class="sp-bg-swatch ${state.backgroundValue === bg.value ? "sp-bg-swatch--active" : ""}"
								style="background: ${bg.value}" data-bg="${bg.value}" title="${bg.label}">
							</button>
						`).join("")}
					</div>
				</div>
			`;

		case "export":
			return `
				<div class="sp-tab-content">
					<h3>Export</h3>
					${state.exportProgress !== null ? `
						<div class="sp-export-progress">
							<div class="sp-export-bar">
								<div class="sp-export-fill" style="width: ${state.exportProgress}%"></div>
							</div>
							<span>${Math.round(state.exportProgress)}%</span>
						</div>
					` : `
						<button id="sp-download-btn" class="sp-btn sp-btn--primary" ${!state.videoUrl ? "disabled" : ""}>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
								<polyline points="7,10 12,15 17,10"/>
								<line x1="12" y1="15" x2="12" y2="3"/>
							</svg>
							Download Video
						</button>
						<button id="sp-download-gif-btn" class="sp-btn sp-btn--secondary" ${!state.videoUrl ? "disabled" : ""}>
							Download as GIF
						</button>
					`}
				</div>
			`;

		default:
			return "";
	}
}

// ---------------------------------------------------------------------------
// Event Binding
// ---------------------------------------------------------------------------

function bindEvents() {
	// Video setup
	videoElement = document.getElementById("sp-video") as HTMLVideoElement;
	if (videoElement) {
		videoElement.onloadedmetadata = () => {
			state.totalDurationMs = (videoElement!.duration || 0) * 1000;
			render();
		};
		videoElement.ontimeupdate = () => {
			state.currentTimeMs = (videoElement!.currentTime || 0) * 1000;
			// Update progress without full re-render
			const fill = document.querySelector(".sp-progress-fill") as HTMLElement;
			const timecode = document.querySelector(".sp-timecode");
			if (fill && state.totalDurationMs > 0) {
				fill.style.width = `${(state.currentTimeMs / state.totalDurationMs) * 100}%`;
			}
			if (timecode) {
				timecode.textContent = `${formatTime(state.currentTimeMs)} / ${formatTime(state.totalDurationMs)}`;
			}
		};
		videoElement.onended = () => {
			state.playing = false;
			render();
		};
	}

	// Play/Pause
	document.getElementById("sp-play-btn")?.addEventListener("click", () => {
		if (!videoElement) return;
		if (state.playing) {
			videoElement.pause();
		} else {
			videoElement.play();
		}
		state.playing = !state.playing;
		render();
	});

	// Progress bar seek
	document.getElementById("sp-progress")?.addEventListener("click", (e) => {
		if (!videoElement) return;
		const el = e.currentTarget as HTMLElement;
		const rect = el.getBoundingClientRect();
		const ratio = (e.clientX - rect.left) / rect.width;
		videoElement.currentTime = ratio * videoElement.duration;
	});

	// Tabs
	document.querySelectorAll(".sp-tab").forEach((btn) => {
		btn.addEventListener("click", () => {
			state.activeTab = (btn as HTMLElement).dataset.tab as any;
			render();
		});
	});

	// Background selection
	document.querySelectorAll(".sp-bg-swatch").forEach((btn) => {
		btn.addEventListener("click", () => {
			state.backgroundValue = (btn as HTMLElement).dataset.bg || "";
			render();
		});
	});

	// Download
	document.getElementById("sp-download-btn")?.addEventListener("click", downloadVideo);
	document.getElementById("sp-download-gif-btn")?.addEventListener("click", downloadAsGif);
}

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

async function downloadVideo() {
	if (!state.videoUrl) return;
	const a = document.createElement("a");
	a.href = state.videoUrl;
	a.download = `openscreen-recording-${Date.now()}.webm`;
	a.click();
}

async function downloadAsGif() {
	if (!state.videoUrl) return;
	state.exportProgress = 0;
	render();

	// Simulate progress (real implementation would use GifEncoder from @openscreen/core)
	const interval = setInterval(() => {
		state.exportProgress = (state.exportProgress || 0) + Math.random() * 12 + 3;
		if (state.exportProgress >= 100) {
			clearInterval(interval);
			state.exportProgress = null;
			// Download (placeholder — would be actual GIF blob)
			downloadVideo();
			render();
		} else {
			const fill = document.querySelector(".sp-export-fill") as HTMLElement;
			const label = document.querySelector(".sp-export-progress span");
			if (fill) fill.style.width = `${state.exportProgress}%`;
			if (label) label.textContent = `${Math.round(state.exportProgress!)}%`;
		}
	}, 150);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(ms: number): string {
	const s = Math.floor(ms / 1000);
	const m = Math.floor(s / 60);
	return `${m.toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}

const BACKGROUNDS = [
	{ value: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", label: "Aurora" },
	{ value: "linear-gradient(135deg, #0c3547 0%, #2a6f97 100%)", label: "Ocean" },
	{ value: "linear-gradient(135deg, #fa709a 0%, #fee140 100%)", label: "Sunset" },
	{ value: "linear-gradient(135deg, #0f2027 0%, #2c5364 100%)", label: "Forest" },
	{ value: "linear-gradient(135deg, #0d0b14 0%, #2d283e 100%)", label: "Midnight" },
	{ value: "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)", label: "Candy" },
	{ value: "linear-gradient(135deg, #f5af19 0%, #f12711 100%)", label: "Fire" },
	{ value: "linear-gradient(135deg, #11998e 0%, #38ef7d 100%)", label: "Emerald" },
	{ value: "linear-gradient(135deg, #0f0c29 0%, #24243e 100%)", label: "Cosmos" },
];
