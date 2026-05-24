// ============================================================================
// Editor — Redesigned to match Screen Studio reference layout
// ============================================================================

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
	Settings,
	Search,
	Crop,
	User,
	HelpCircle,
	Download,
	Pause,
	Play,
	Plus,
	ZoomIn as ZoomIcon,
	SplitSquareVertical,
	Trash2,
	Undo2,
	Redo2,
	RotateCcw,
	Minus,
	Scissors,
	Monitor,
	FileVideo,
	Upload,
	ChevronLeft,
	ChevronRight,
	MousePointer2,
	Zap,
	LayoutTemplate,
	Video,
	Music,
	Mic,
	ArrowUpLeft,
	ArrowUpRight,
	ArrowDownLeft,
	ArrowDownRight,
} from "lucide-react";

import { useProjectState } from "../hooks/useProjectState.js";
import "./Editor.css";

// ---------------------------------------------------------------------------
// Background presets (gradient thumbnails)
// ---------------------------------------------------------------------------

const GRADIENT_PRESETS = [
	{ id: "bg1", url: "/backgrounds/Astra.webp" },
	{ id: "bg2", url: "/backgrounds/Bliss.webp" },
	{ id: "bg3", url: "/backgrounds/Burst.webp" },
	{ id: "bg4", url: "/backgrounds/Dusk.webp" },
	{ id: "bg5", url: "/backgrounds/Flash.webp" },
	{ id: "bg6", url: "/backgrounds/Ghost.webp" },
	{ id: "bg7", url: "/backgrounds/Helix.webp" },
	{ id: "bg8", url: "/backgrounds/Horizon.webp" },
	{ id: "bg9", url: "/backgrounds/Peak.webp" },
	{ id: "bg10", url: "/backgrounds/mesh1.webp" },
	{ id: "bg11", url: "/backgrounds/mesh2.webp" },
	{ id: "bg12", url: "/backgrounds/mesh3.webp" },
	{ id: "bg13", url: "/backgrounds/mesh4.webp" },
	{ id: "bg14", url: "/backgrounds/mesh5.webp" },
	{ id: "bg15", url: "/backgrounds/mesh6.webp" },
	{ id: "bg16", url: "/backgrounds/mesh7.webp" },
	{ id: "bg17", url: "/backgrounds/mesh8.webp" },
];

const IMAGE_CATEGORIES = [
	{
		label: "Mac",
		items: [
			{ id: "mac1", url: "/backgrounds/mac/mac-asset-1.jpeg" },
			{ id: "mac2", url: "/backgrounds/mac/mac-asset-2.jpg" },
			{ id: "mac3", url: "/backgrounds/mac/mac-asset-3.jpg" },
			{ id: "mac4", url: "/backgrounds/mac/mac-asset-4.jpg" },
			{ id: "mac5", url: "/backgrounds/mac/mac-asset-5.jpg" },
			{ id: "mac6", url: "/backgrounds/mac/mac-asset-6.jpeg" },
			{ id: "mac7", url: "/backgrounds/mac/mac-asset-7.png" },
			{ id: "mac8", url: "/backgrounds/mac/mac-asset-8.jpg" },
			{ id: "mac9", url: "/backgrounds/mac/mac-asset-9.jpg" },
			{ id: "mac10", url: "/backgrounds/mac/mac-asset-10.jpg" },
		],
	},
	{
		label: "Radiant",
		items: Array.from({ length: 10 }, (_, i) => ({
			id: `radiant${i + 1}`,
			url: `/backgrounds/radiant/radiant${i + 1}.${i === 6 ? 'avif' : 'jpg'}`,
		})),
	},
	{
		label: "Raycast",
		items: [
			"autumnal-peach", "blob-red", "blob", "blossom-2", "blue_distortion_1", "blue_distortion_2",
			"blushing-fire", "bright-rain", "chromatic_dark_1", "chromatic_dark_2", "chromatic_light_1",
			"chromatic_light_2", "cube_mono", "cube_prod", "floss", "glass-rainbow", "good-vibes",
			"loupe-mono-light", "loupe", "mono_dark_distortion_1", "mono_dark_distortion_2",
			"mono_light_distortion_1", "moonrise", "red_distortion_2", "red_distortion_4", "rose-thorn",
		].map(name => ({ id: `raycast-${name}`, url: `/backgrounds/raycast/${name}.webp` })),
	},
	{
		label: "Pattern",
		items: Array.from({ length: 11 }, (_, i) => ({
			id: `pattern${i + 1}`,
			url: `/backgrounds/pattern/${i + 1}.webp`,
		})),
	},
	{
		label: "Paper",
		items: ["01", "02", "03", "21", "26", "27", "31", "47"].map(n => ({
			id: `paper${n}`,
			url: `/backgrounds/paper/${n}.webp`,
		})),
	},
];

// ---------------------------------------------------------------------------
// Left panel icon tabs
// ---------------------------------------------------------------------------

type LeftTab = "zoom" | "cursor" | "cut" | "speed" | "zone" | "crop" | "camera" | "audio" | "transcript" | "style";

const ICON_TABS: { id: LeftTab; icon: typeof Settings; label: string }[] = [
	{ id: "zoom", icon: ZoomIcon, label: "Zoom" },
	{ id: "cursor", icon: MousePointer2, label: "Cursor" },
	{ id: "cut", icon: Scissors, label: "Cut" },
	{ id: "speed", icon: Zap, label: "Speed" },
	{ id: "zone", icon: LayoutTemplate, label: "Zone" },
	{ id: "crop", icon: Crop, label: "Crop" },
	{ id: "camera", icon: Video, label: "Camera" },
	{ id: "audio", icon: Music, label: "Audio" },
	{ id: "transcript", icon: Mic, label: "Transcript" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Editor() {
	const { state, dispatch, canUndo, canRedo, addZoomRegion } = useProjectState();
	const videoRef = useRef<HTMLVideoElement>(null);

	const [activeTab, setActiveTab] = useState<LeftTab>("zoom");
	const [bgTab, setBgTab] = useState<"Image" | "Gradient" | "Color" | "Hidden">("Image");
	const [frameTab, setFrameTab] = useState<"Default" | "Minimal" | "Hidden">("Default");
	const [aspectRatio, setAspectRatio] = useState("Native");
	const [imageBlur, setImageBlur] = useState("Moderate");
	const [frameStyle, setFrameStyle] = useState("Default");
	const [frameBorderRadius, setFrameBorderRadius] = useState("Curved");
	const [cursorSize, setCursorSize] = useState("Medium");
	const [cursorStyle, setCursorStyle] = useState("Mac OS");
	const [cursorColor, setCursorColor] = useState("Native");
	const [smoothMovement, setSmoothMovement] = useState(true);
	const [cursorShadow, setCursorShadow] = useState(true);
	const [clickStyle, setClickStyle] = useState("Pressure");
	const [clickForce, setClickForce] = useState("None");
	const [activeBg, setActiveBg] = useState("bg1");
	const [timelineZoom, setTimelineZoom] = useState(50);
	const [darkMode, setDarkMode] = useState(true);
	const [selectedZoomId, setSelectedZoomId] = useState<string | null>(null);
	const [trimIn, setTrimIn] = useState(0); // ms
	const [trimOut, setTrimOut] = useState(0); // ms (0 = end)

	// Auto-load video from URL query param (passed from recording flow)
	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const videoPath = params.get("videoPath");
		if (videoPath) {
			// Convert file path to a file:// URL for the video element
			const videoUrl = videoPath.startsWith("file://")
				? videoPath
				: `file://${videoPath}`;
			dispatch({ type: "LOAD_VIDEO", url: videoUrl, path: videoPath });
		}
	}, []);

	// Keyboard shortcuts
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.code === "Space" && !e.metaKey && !e.ctrlKey) {
				e.preventDefault();
				dispatch({ type: "SET_PLAYING", playing: !state.playing });
			}
			if ((e.metaKey || e.ctrlKey) && e.code === "KeyZ" && !e.shiftKey) {
				e.preventDefault();
				dispatch({ type: "UNDO" });
			}
			if ((e.metaKey || e.ctrlKey) && e.code === "KeyZ" && e.shiftKey) {
				e.preventDefault();
				dispatch({ type: "REDO" });
			}
			// Delete selected zoom region
			if ((e.code === "Delete" || e.code === "Backspace") && selectedZoomId) {
				e.preventDefault();
				dispatch({ type: "REMOVE_ZOOM_REGION", id: selectedZoomId });
				setSelectedZoomId(null);
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [state.playing]);

	const formatTime = (ms: number) => {
		const totalSec = Math.floor(ms / 1000);
		const min = String(Math.floor(totalSec / 60)).padStart(2, "0");
		const sec = String(totalSec % 60).padStart(2, "0");
		const centis = String(Math.floor((ms % 1000) / 10)).padStart(2, "0");
		return `${min}:${sec}.${centis}`;
	};

	const progressPct = state.totalDurationMs > 0
		? (state.currentTimeMs / state.totalDurationMs) * 100
		: 0;

	// -----------------------------------------------------------------------
	// Video playback sync
	// -----------------------------------------------------------------------

	useEffect(() => {
		const video = videoRef.current;
		if (!video) return;

		const onLoaded = () => {
			if (Number.isFinite(video.duration)) {
				dispatch({ type: "SET_DURATION", durationMs: video.duration * 1000 });
			} else {
				// WebM from MediaRecorder often has Infinity duration.
				// Workaround: seek to a huge time, browser will clamp to real end.
				video.currentTime = Number.MAX_SAFE_INTEGER;
				const onSeeked = () => {
					video.removeEventListener("seeked", onSeeked);
					dispatch({ type: "SET_DURATION", durationMs: video.duration * 1000 });
					video.currentTime = 0;
				};
				video.addEventListener("seeked", onSeeked);
			}
		};
		const onTimeUpdate = () => {
			dispatch({ type: "SET_TIME", timeMs: video.currentTime * 1000 });
		};
		const onEnded = () => {
			dispatch({ type: "SET_PLAYING", playing: false });
		};

		video.addEventListener("loadedmetadata", onLoaded);
		video.addEventListener("timeupdate", onTimeUpdate);
		video.addEventListener("ended", onEnded);

		return () => {
			video.removeEventListener("loadedmetadata", onLoaded);
			video.removeEventListener("timeupdate", onTimeUpdate);
			video.removeEventListener("ended", onEnded);
		};
	}, [state.videoUrl]);

	// Play/pause sync
	useEffect(() => {
		const video = videoRef.current;
		if (!video || !state.videoUrl) return;

		if (state.playing) {
			video.play().catch(() => { });
		} else {
			video.pause();
		}
	}, [state.playing, state.videoUrl]);

	// Seek when user clicks transport progress bar
	const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
		const rect = e.currentTarget.getBoundingClientRect();
		const pct = (e.clientX - rect.left) / rect.width;
		const timeMs = pct * state.totalDurationMs;
		dispatch({ type: "SET_TIME", timeMs });
		if (videoRef.current) {
			videoRef.current.currentTime = timeMs / 1000;
		}
	}, [state.totalDurationMs]);

	// Compute preview styles from settings
	const previewBg = bgTab === "Hidden" ? "transparent" : (
		bgTab === "Gradient"
			? `url(${GRADIENT_PRESETS.find(b => b.id === activeBg)?.url || GRADIENT_PRESETS[0].url}) center/cover no-repeat`
			: bgTab === "Image"
				? (state.customBgUrl ? `url(${state.customBgUrl}) center/cover no-repeat` : `url(${IMAGE_CATEGORIES[0].items[0].url}) center/cover no-repeat`)
				: "#1a1a1a"
	);

	// Translate aspect ratio string to CSS value
	const aspectRatioValue = aspectRatio === "Native" ? "16 / 9" : aspectRatio.replace(":", " / ");

	// Translate border radius
	let borderRadiusPx = "8px";
	if (frameBorderRadius === "Sharp") borderRadiusPx = "0px";
	else if (frameBorderRadius === "Curved") borderRadiusPx = "12px";
	else if (frameBorderRadius === "Round") borderRadiusPx = "24px";

	// Translate style to frame properties
	let currentBoxShadow = "none";
	let currentBorder = "none";
	let framePadding = "0px";
	let frameBackground = "transparent";
	let frameBackdropFilter = "none";

	if (frameStyle === "Default") {
		currentBoxShadow = "0 8px 40px rgba(0,0,0,0.4)";
	} else if (frameStyle === "Glass Light") {
		framePadding = "12px";
		frameBackground = "rgba(255, 255, 255, 0.15)";
		frameBackdropFilter = "blur(24px)";
		currentBoxShadow = "0 24px 64px rgba(0,0,0,0.4)";
		currentBorder = "1px solid rgba(255, 255, 255, 0.4)";
	} else if (frameStyle === "Glass Dark") {
		framePadding = "12px";
		frameBackground = "rgba(0, 0, 0, 0.4)";
		frameBackdropFilter = "blur(24px)";
		currentBoxShadow = "0 24px 64px rgba(0,0,0,0.6)";
		currentBorder = "1px solid rgba(255, 255, 255, 0.1)";
	} else if (frameStyle === "Outline") {
		currentBorder = "2px solid rgba(255,255,255,0.15)";
	} else if (frameStyle === "Border") {
		framePadding = "12px";
		frameBackground = "#ffffff";
		currentBoxShadow = "0 24px 64px rgba(0,0,0,0.4)";
	} else if (frameStyle === "Border Dark") {
		framePadding = "12px";
		frameBackground = "#111111";
		currentBoxShadow = "0 24px 64px rgba(0,0,0,0.6)";
	}

	// Calculate outer radius for the frame based on padding
	const innerRadiusNum = parseInt(borderRadiusPx) || 0;
	const outerRadiusPx = innerRadiusNum > 0 ? `${innerRadiusNum + parseInt(framePadding || "0")}px` : "0px";

	// Determine active zoom region for current time
	const activeZoom = useMemo(() => {
		const t = state.currentTimeMs;
		return state.zoomRegions.find(r => t >= r.startMs && t <= r.endMs) || null;
	}, [state.currentTimeMs, state.zoomRegions]);

	const frameWrapperStyle: React.CSSProperties = {
		width: "100%",
		height: "100%",
		position: "relative",
		padding: activeZoom ? "0px" : framePadding,
		background: activeZoom ? "transparent" : frameBackground,
		backdropFilter: activeZoom ? "none" : frameBackdropFilter,
		WebkitBackdropFilter: activeZoom ? "none" : frameBackdropFilter,
		boxShadow: activeZoom ? "none" : currentBoxShadow,
		border: activeZoom ? "none" : currentBorder,
		borderRadius: activeZoom ? "0px" : outerRadiusPx,
		transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
		boxSizing: "border-box"
	};

	const videoStyle: React.CSSProperties = {
		width: "100%",
		height: "100%",
		objectFit: "cover",
		borderRadius: activeZoom ? "0px" : borderRadiusPx,
		// Zoom: scale from the focal point
		transformOrigin: activeZoom
			? `${activeZoom.focusCx * 100}% ${activeZoom.focusCy * 100}%`
			: "center center",
		transform: activeZoom ? `scale(${activeZoom.depth})` : "scale(1)",
		transition: "transform 0.5s cubic-bezier(0.4, 0, 0.2, 1), transform-origin 0.5s cubic-bezier(0.4, 0, 0.2, 1), border-radius 0.3s"
	};

	// Trim-aware effective end
	const effectiveTrimOut = trimOut > 0 ? trimOut : state.totalDurationMs;

	// Skip trimmed-out region during playback
	useEffect(() => {
		if (!state.playing || !videoRef.current) return;
		const video = videoRef.current;

		// If before trim-in, jump to it
		if (state.currentTimeMs < trimIn) {
			video.currentTime = trimIn / 1000;
		}
		// If past trim-out, stop
		if (effectiveTrimOut > 0 && state.currentTimeMs >= effectiveTrimOut) {
			dispatch({ type: "SET_PLAYING", playing: false });
			video.currentTime = effectiveTrimOut / 1000;
		}
	}, [state.currentTimeMs, state.playing, trimIn, effectiveTrimOut]);

	// Add zoom region at current playhead
	const handleAddZoom = useCallback(() => {
		const duration = state.totalDurationMs;
		if (duration <= 0) return;
		const start = state.currentTimeMs;
		const segmentLen = Math.min(3000, duration - start); // 3s default
		addZoomRegion(start, start + segmentLen);
	}, [state.currentTimeMs, state.totalDurationMs, addZoomRegion]);

	// Delete selected zoom region
	const handleDeleteSelected = useCallback(() => {
		if (selectedZoomId) {
			dispatch({ type: "REMOVE_ZOOM_REGION", id: selectedZoomId });
			setSelectedZoomId(null);
		}
	}, [selectedZoomId]);

	// Reset timeline
	const handleResetTimeline = useCallback(() => {
		// Remove all zoom regions and reset trim
		for (const r of state.zoomRegions) {
			dispatch({ type: "REMOVE_ZOOM_REGION", id: r.id });
		}
		setTrimIn(0);
		setTrimOut(0);
		setSelectedZoomId(null);
	}, [state.zoomRegions]);

	// -----------------------------------------------------------------------
	// Render
	// -----------------------------------------------------------------------

	return (
		<div className={`editor-root ${darkMode ? "theme-dark" : ""}`}>
			{/* Main Body */}
			<div className="editor-body">
				{/* Left Panel */}
				<div className="editor-left-panel">
					{/* Icon Bar */}
					<div className="left-icon-bar">
						{ICON_TABS.map((tab) => (
							<button
								key={tab.id}
								className={`left-icon-btn ${activeTab === tab.id ? "active" : ""}`}
								onClick={() => setActiveTab(tab.id)}
								title={tab.label}
								type="button"
							>
								<tab.icon size={18} strokeWidth={1.5} />
								<span className="icon-label">{tab.label}</span>
							</button>
						))}
					</div>

					<div className="left-settings">
						{activeTab === "zoom" && (
							<div className="zoom-settings-panel">
								<div className="settings-section row-between no-border">
									<span className="settings-sublabel">Zoom effect</span>
									<button className="toggle-switch on" type="button" />
								</div>

								<div className="settings-section button-row no-border">
									<button className="secondary-btn" onClick={handleAddZoom} type="button">+ Add clip</button>
									<button className="secondary-btn" type="button">Auto zoom</button>
								</div>

								<div className="settings-section no-border">
									<div className="settings-section-title">MODE</div>
									<div className="settings-tabs zoom-tabs">
										<button className="settings-tab" type="button">Static</button>
										<button className="settings-tab" type="button">Follow</button>
										<button className="settings-tab active" type="button">Deadzone</button>
									</div>
								</div>

								<div className="settings-section no-border">
									<div className="settings-section-title">CLIP SETTINGS</div>

									<div className="zoom-slider-row">
										<span className="zoom-label">Scale</span>
										<div className="zoom-stepper">
											<Minus size={12} /> <span>1.5</span> <Plus size={12} />
										</div>
									</div>

									<div className="zoom-input-row">
										<span className="zoom-label">Zoom in</span>
										<div className="zoom-input-wrapper"><input type="text" className="zoom-input" defaultValue="1.00s" /></div>
									</div>
									<div className="zoom-input-row">
										<span className="zoom-label">Zoom out</span>
										<div className="zoom-input-wrapper"><input type="text" className="zoom-input" defaultValue="1.00s" /></div>
									</div>
									<div className="zoom-input-row">
										<span className="zoom-label">Deadzone size</span>
										<div className="zoom-input-wrapper"><input type="text" className="zoom-input" defaultValue="0.40" /></div>
									</div>
									<div className="zoom-input-row">
										<span className="zoom-label">Pan duration</span>
										<div className="zoom-input-wrapper"><input type="text" className="zoom-input" defaultValue="1.60s" /></div>
									</div>
									<div className="zoom-input-row">
										<span className="zoom-label">Speed</span>
										<div className="zoom-input-wrapper"><input type="text" className="zoom-input" defaultValue="9.0" /></div>
									</div>
									<div className="zoom-input-row">
										<span className="zoom-label">Predict</span>
										<div className="zoom-input-wrapper"><input type="text" className="zoom-input" defaultValue="0.25s" /></div>
									</div>
								</div>

								<div className="settings-section no-border">
									<button className="delete-zoom-btn" onClick={handleDeleteSelected} type="button">Delete zoom clip</button>
								</div>
							</div>
						)}

						{activeTab === "cursor" && (
							<div className="cursor-settings-panel">
								<div className="settings-section no-border">
									<div className="settings-section-title">THEME</div>
									<div className="cursor-theme-grid">
										<button className="cursor-theme-btn" type="button"><MousePointer2 size={12} /> macOS Tahoe</button>
										<button className="cursor-theme-btn" type="button"><MousePointer2 size={12} /> macOS Dark</button>
										<button className="cursor-theme-btn" type="button"><MousePointer2 size={12} /> Theme 1</button>
										<button className="cursor-theme-btn" type="button"><MousePointer2 size={12} /> Theme 5</button>
										<button className="cursor-theme-btn" type="button"><MousePointer2 size={12} /> Theme 6</button>
										<button className="cursor-theme-btn" type="button"><MousePointer2 size={12} /> Theme 7</button>
										<button className="cursor-theme-btn" type="button"><MousePointer2 size={12} /> Theme 8</button>
										<button className="cursor-theme-btn" type="button"><MousePointer2 size={12} /> Theme 9</button>
										<button className="cursor-theme-btn" type="button"><MousePointer2 size={12} /> Theme 10</button>
										<button className="cursor-theme-btn" type="button"><MousePointer2 size={12} /> Theme 12</button>
										<button className="cursor-theme-btn" type="button"><MousePointer2 size={12} /> Theme 13</button>
										<button className="cursor-theme-btn" type="button"><MousePointer2 size={12} /> Theme 15</button>
										<button className="cursor-theme-btn active" type="button"><MousePointer2 size={12} /> Theme 17</button>
										<button className="cursor-theme-btn" type="button"><MousePointer2 size={12} /> Theme 18</button>
									</div>
									<button className="cursor-theme-btn touch-btn" type="button"><div className="touch-dot" /> Touch</button>
								</div>

								<div className="settings-section no-border">
									<div className="settings-section-title">APPEARANCE</div>
									<div className="zoom-input-row">
										<span className="zoom-label">Size</span>
										<div className="zoom-input-wrapper"><input type="text" className="zoom-input" defaultValue="5.0%" /></div>
									</div>
									<div className="zoom-input-row">
										<span className="zoom-label">Shadow</span>
										<div className="zoom-input-wrapper"><input type="text" className="zoom-input string-input" defaultValue="Medium" /></div>
									</div>
								</div>

								<div className="settings-section no-border">
									<div className="settings-section-title">MOTION</div>
									<div className="zoom-input-row">
										<span className="zoom-label">Speed</span>
										<div className="zoom-input-wrapper"><input type="text" className="zoom-input string-input" defaultValue="Normal" /></div>
									</div>
									<div className="zoom-input-row">
										<span className="zoom-label">Sway</span>
										<div className="zoom-input-wrapper"><input type="text" className="zoom-input string-input" defaultValue="Subtle" /></div>
									</div>
									<div className="zoom-input-row">
										<span className="zoom-label">Motion blur</span>
										<div className="zoom-input-wrapper"><input type="text" className="zoom-input string-input" defaultValue="Medium" /></div>
									</div>
									<div className="zoom-input-row">
										<span className="zoom-label">Click effect</span>
										<div className="zoom-input-wrapper"><input type="text" className="zoom-input string-input" defaultValue="Medium" /></div>
									</div>
								</div>

								<div className="settings-section no-border">
									<div className="settings-section-title">BEHAVIOR</div>
									<div className="settings-section row-between no-border">
										<span className="settings-sublabel">Hide when idle</span>
										<button className="toggle-switch" type="button" />
									</div>
									<div className="settings-section row-between no-border">
										<span className="settings-sublabel">Lock cursor type</span>
										<button className="toggle-switch" type="button" />
									</div>

									<button className="secondary-btn margin-top-btn" type="button">+ Hide cursor at playhead</button>
								</div>
							</div>
						)}

						{activeTab === "cut" && (
							<div className="cut-settings-panel">
								<div className="settings-section-title">CUT</div>
								<p className="sidebar-description">Mark a section, then remove it from the timeline.</p>

								<button
									className="secondary-btn margin-bottom-btn"
									onClick={() => setTrimIn(state.currentTimeMs)}
									type="button"
								>
									+ Cut at playhead
								</button>

								<p className="sidebar-hint-text">Select a cut clip on the timeline to edit it</p>
							</div>
						)}

						{activeTab === "speed" && (
							<div className="cut-settings-panel">
								<div className="settings-section-title">SPEED</div>
								<p className="sidebar-description">Change playback speed for the whole video or specific segments.</p>

								<button
									className="secondary-btn margin-bottom-btn"
									type="button"
								>
									+ Speed at playhead
								</button>

								<div className="settings-section-title margin-top-btn">QUICK PRESETS</div>
								<div className="settings-section button-row no-border margin-bottom-btn">
									<button className="secondary-btn" type="button">0.5×</button>
									<button className="secondary-btn" type="button">1.5×</button>
									<button className="secondary-btn" type="button">2×</button>
								</div>

								<p className="sidebar-hint-text">Select a speed clip on the timeline to edit it</p>
							</div>
						)}

						{activeTab === "zone" && (
							<div className="cut-settings-panel">
								<div className="settings-section-title">ZONE</div>
								<p className="sidebar-description">Highlight, blur or mask a region of the video. Drag on the preview to draw the zone.</p>

								<div className="settings-section button-row no-border margin-bottom-btn">
									<button className="secondary-btn" type="button">+ Highlight</button>
									<button className="secondary-btn" type="button">+ Blur</button>
									<button className="secondary-btn" type="button">+ Mask</button>
								</div>

								<p className="sidebar-hint-text">Add a zone, then drag on the preview to<br />position it</p>
							</div>
						)}

						{activeTab === "crop" && (
							<div className="cut-settings-panel">
								<div className="settings-section-title">CROP VIDEO</div>
								<p className="sidebar-description">Drag the edges on the preview to crop.</p>

								<button className="primary-blue-btn margin-bottom-btn" type="button">
									Edit crop
								</button>
							</div>
						)}

						{activeTab === "camera" && (
							<div className="cut-settings-panel">
								<div className="settings-section row-between no-border" style={{ marginTop: "8px", padding: "12px 16px" }}>
									<span className="settings-sublabel">Camera overlay</span>
									<button className="toggle-switch on" type="button" />
								</div>

								<div className="settings-section no-border">
									<div className="settings-section-title">POSITION</div>
									<div className="camera-position-pad">
										<button className="pos-btn top-left active" type="button"><ArrowUpLeft size={14} /></button>
										<button className="pos-btn top-right" type="button"><ArrowUpRight size={14} /></button>
										<button className="pos-btn bottom-left" type="button"><ArrowDownLeft size={14} /></button>
										<button className="pos-btn bottom-right" type="button"><ArrowDownRight size={14} /></button>
									</div>
								</div>

								<div className="settings-section no-border">
									<div className="settings-section-title">SIZE & SHAPE</div>
									<div className="zoom-input-row">
										<span className="zoom-label">Size</span>
										<div className="zoom-input-wrapper"><input type="text" className="zoom-input string-input" defaultValue="15%" /></div>
									</div>
									<div className="zoom-input-row">
										<span className="zoom-label">Roundness</span>
										<div className="zoom-input-wrapper"><input type="text" className="zoom-input string-input" defaultValue="60%" /></div>
									</div>
									<div className="settings-section row-between no-border" style={{ padding: "0 16px", border: "1px solid var(--border)", marginBottom: "8px" }}>
										<span className="settings-sublabel">Squircle</span>
										<button className="toggle-switch on" type="button" />
									</div>
								</div>

								<div className="settings-section no-border">
									<div className="settings-section-title">FRAMING</div>
									<div className="zoom-input-row">
										<span className="zoom-label">Horizontal pan</span>
										<div className="zoom-input-wrapper"><input type="text" className="zoom-input string-input" defaultValue="0%" /></div>
									</div>
								</div>

								<div className="settings-section no-border">
									<div className="settings-section-title">ZOOM REACTION</div>
									<div className="settings-section row-between no-border margin-bottom-btn" style={{ padding: "0 16px", border: "1px solid var(--border)", marginBottom: "8px" }}>
										<span className="settings-sublabel">Shrink during zoom</span>
										<button className="toggle-switch on" type="button" />
									</div>
									<div className="zoom-input-row">
										<span className="zoom-label">Decrease size</span>
										<div className="zoom-input-wrapper"><input type="text" className="zoom-input string-input" defaultValue="10%" /></div>
									</div>
									<div className="zoom-input-row">
										<span className="zoom-label">In transition</span>
										<div className="zoom-input-wrapper"><input type="text" className="zoom-input string-input" defaultValue="0.35s" /></div>
									</div>
									<div className="zoom-input-row">
										<span className="zoom-label">Out transition</span>
										<div className="zoom-input-wrapper"><input type="text" className="zoom-input string-input" defaultValue="0.35s" /></div>
									</div>
								</div>

								<div className="settings-section no-border">
									<div className="settings-section-title">FULLSCREEN CAMERA</div>
									<button className="secondary-btn margin-bottom-btn" style={{ width: "100%", background: "#1e1e1e", border: "none" }} type="button">Add fullscreen clip at playhead</button>
								</div>
							</div>
						)}

						{activeTab === "audio" && (
							<div className="cut-settings-panel">
								<div className="settings-section-title">BACKGROUND AUDIO</div>
								<p className="sidebar-description">Add background music or a sound effect to your recording.</p>

								<button
									className="secondary-btn margin-bottom-btn"
									style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
									type="button"
								>
									<Music size={14} /> Import audio file
								</button>
							</div>
						)}
					</div>
				</div>

				{/* Center: Preview + Timeline */}
				<div className="editor-content">
					{/* Video Preview */}
					<div className="editor-preview">
						<div
							className="preview-canvas"
							style={{
								background: state.videoUrl ? previewBg : undefined,
								padding: state.videoUrl && !activeZoom ? "24px" : "0px",
								transition: "padding 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
								aspectRatio: aspectRatioValue
							}}
						>
							{state.videoUrl ? (
								<div style={frameWrapperStyle}>
									<video
										ref={videoRef}
										src={state.videoUrl}
										style={videoStyle}
										playsInline
										muted={state.muted}
									/>
								</div>
							) : (
								<>
									<div className="load-card" onClick={() => window.electronAPI?.startNewRecording()}>
										<div className="load-card-icon">
											<Monitor size={28} />
										</div>
										<div className="load-card-title">Load a recording</div>
										<div className="load-card-desc">Supports automatic and follow-cursor zooms</div>
										<div className="load-card-action">Load latest recording</div>
									</div>
									<div className="load-card">
										<div className="load-card-icon">
											<FileVideo size={28} />
										</div>
										<div className="load-card-title">Load a video file</div>
										<div className="load-card-desc">Add manual zooms and trim your video with ease</div>
									</div>
								</>
							)}
						</div>
					</div>

					{/* Combined Timeline Section */}
					<div className="editor-timeline-wrapper">
						<div className="editor-tl-toolbar">
							<div className="transport-time">
								{formatTime(state.currentTimeMs)} <span style={{ opacity: 0.3, margin: "0 4px" }}>|</span> {formatTime(state.totalDurationMs)}
							</div>

							<div className="tl-right-tools">
								<button className="tl-tool-pill" type="button" onClick={handleAddZoom}>
									+ Zoom
								</button>
								<button className="tl-tool-pill" type="button">
									+ Hide cursor
								</button>
								<button className="tl-tool-pill" type="button" onClick={() => setTrimIn(state.currentTimeMs)}>
									+ Cut
								</button>
								<button className="tl-tool-pill" type="button">
									+ Speed
								</button>
								<button className="tl-tool-pill" type="button">
									+ Camera
								</button>

								<div className="tl-separator" />

								<div className="tl-play-controls">
									<button className="transport-btn skip-btn" type="button">
										<ChevronLeft size={16} />
									</button>
									<button
										className="transport-btn play-btn"
										onClick={() => dispatch({ type: "SET_PLAYING", playing: !state.playing })}
										type="button"
									>
										{state.playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
									</button>
									<button className="transport-btn skip-btn" type="button">
										<ChevronRight size={16} />
									</button>
								</div>
							</div>
						</div>

						{/* Timeline Track */}
						<div className="editor-timeline-area">
							{/* Timeline Sidebar Labels */}
							<div className="timeline-sidebar">
								<div className="timeline-row-label">VIDEO</div>
								<div className="timeline-row-label">ZOOM</div>
								<div className="timeline-row-label">CURSOR</div>
							</div>

							<div className="timeline-track-container" onClick={(e) => {
								if (state.totalDurationMs <= 0) return;
								const rect = e.currentTarget.getBoundingClientRect();
								const pct = (e.clientX - rect.left) / rect.width;
								const timeMs = pct * state.totalDurationMs;
								dispatch({ type: "SET_TIME", timeMs });
								if (videoRef.current) {
									videoRef.current.currentTime = timeMs / 1000;
								}
								setSelectedZoomId(null);
							}}>
								{/* Dynamic Ruler */}
								<div className="timeline-ruler">
									{(() => {
										const totalSec = Math.max(1, Math.floor(state.totalDurationMs / 1000));
										const step = totalSec <= 10 ? 1 : totalSec <= 30 ? 5 : totalSec <= 120 ? 10 : 30;
										const ticks: number[] = [];
										for (let s = 0; s <= totalSec; s += step) ticks.push(s);
										return ticks.map(s => (
											<div key={s} className="timeline-tick" style={{ left: `${(s / totalSec) * 100}%` }}>
												<div className="tick-mark" />
												{`${s}s`}
											</div>
										));
									})()}
								</div>

								<div className="timeline-rows">
									{/* VIDEO Track */}
									<div className="timeline-row">
										<div className="timeline-pill pill-video" style={{ left: '0%', width: '100%' }}>
											<div className="pill-content">
												<span className="pill-title">Clip</span>
												<span className="pill-desc">{Math.round(state.totalDurationMs / 1000)}s</span>
											</div>
										</div>
									</div>

									{/* ZOOM Track */}
									<div className="timeline-row">
										{state.zoomRegions.length > 0 ? state.zoomRegions.map((region) => {
											const startPct = (region.startMs / Math.max(1, state.totalDurationMs)) * 100;
											const widthPct = ((region.endMs - region.startMs) / Math.max(1, state.totalDurationMs)) * 100;
											const isSelected = selectedZoomId === region.id;
											return (
												<div
													key={region.id}
													className={`timeline-pill pill-zoom ${isSelected ? 'selected' : ''}`}
													style={{ left: `${startPct}%`, width: `${widthPct}%` }}
													onClick={(e) => {
														e.stopPropagation();
														setSelectedZoomId(isSelected ? null : region.id);
													}}
												>
													<div className="pill-content">
														<span className="pill-title">Zoom</span>
														<span className="pill-desc">{region.depth}x Deadzone</span>
													</div>
													<div className="pill-delete-btn" onClick={(e) => {
														e.stopPropagation();
														dispatch({ type: "REMOVE_ZOOM", id: region.id });
														if (isSelected) setSelectedZoomId(null);
													}}>
														<Trash2 size={10} />
													</div>
												</div>
											);
										}) : (
											/* Dummy pill to match screenshot if empty */
											<div className="timeline-pill pill-zoom" style={{ left: '25%', width: '60%' }}>
												<div className="pill-content">
													<span className="pill-title">Zoom</span>
													<span className="pill-desc">1.5x Deadzone</span>
												</div>
												<div className="pill-delete-btn"><Trash2 size={10} /></div>
											</div>
										)}
									</div>

									{/* CURSOR Track */}
									<div className="timeline-row">
										<div className="timeline-pill pill-cursor" style={{ left: '2%', width: '20%' }}>
											<div className="pill-content">
												<span className="pill-title">Cursor</span>
												<span className="pill-desc">Hidden</span>
											</div>
											<div className="pill-delete-btn"><Trash2 size={10} /></div>
										</div>
									</div>
								</div>

								{/* Playhead */}
								<div className="timeline-playhead" style={{ left: `${progressPct}%` }}>
									<div className="playhead-top" />
									<div className="playhead-line" />
								</div>
							</div>

							{/* Trim-out handle */}
							<div
								className="timeline-trim-handle right"
								title={`Trim out: ${formatTime(effectiveTrimOut)}`}
								onClick={() => setTrimOut(state.currentTimeMs)}
							>
								<Scissors size={14} />
							</div>
						</div>
					</div>
				</div>

				{/* Right Panel */}
				<div className="editor-right-panel">
					{/* Settings Content */}
					<div className="right-settings">
						{/* Export Card */}
						<div className="right-card" style={{ padding: "4px" }}>
							<button
								className="export-btn"
								type="button"
								onClick={() => dispatch({ type: "EXPORT_START" })}
							>
								Export video
							</button>
						</div>

						{/* Aspect Ratio Card */}
						<div className="right-card">
							<div className="settings-section-title">ASPECT RATIO</div>
							<select
								className="settings-select"
								value={aspectRatio}
								onChange={(e) => setAspectRatio(e.target.value)}
							>
								<option>Native</option>
								<option>16:9</option>
								<option>9:16</option>
								<option>4:3</option>
								<option>1:1</option>
								<option>4:5</option>
								<option>21:9</option>
							</select>
						</div>

						{/* Background Card */}
						<div className="right-card">
							<div className="settings-section-title">BACKGROUND</div>
							<div className="settings-tabs">
								{(["Image", "Gradient", "Color", "Hidden"] as const).map((t) => (
									<button
										key={t}
										className={`settings-tab ${bgTab === t ? "active" : ""}`}
										onClick={() => setBgTab(t)}
										type="button"
									>
										{t}
									</button>
								))}
							</div>
							{bgTab === "Gradient" && (
								<div className="bg-thumbs">
									{GRADIENT_PRESETS.map((bg) => (
										<div
											key={bg.id}
											className={`bg-thumb ${activeBg === bg.id ? "active" : ""}`}
											style={{ background: `url(${bg.url}) center/cover no-repeat` }}
											onClick={() => {
												setActiveBg(bg.id);
												dispatch({ type: "SET_BACKGROUND", value: bg.url, bgType: "gradient" });
											}}
										/>
									))}
								</div>
							)}
							{bgTab === "Image" && (
								<div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '4px' }}>
									{IMAGE_CATEGORIES.map(category => (
										<div key={category.label}>
											<div className="settings-section-title" style={{ marginBottom: '8px' }}>{category.label.toUpperCase()}</div>
											<div className="bg-thumbs">
												{category.items.map(img => (
													<div
														key={img.id}
														className={`bg-thumb ${state.customBgUrl === img.url ? "active" : ""}`}
														style={{ background: `url(${img.url}) center/cover no-repeat` }}
														onClick={() => dispatch({ type: "SET_CUSTOM_BG", url: img.url })}
													/>
												))}
											</div>
										</div>
									))}
								</div>
							)}
							{bgTab === "Color" && (
								<div className="color-picker-row">
									<input
										type="color"
										className="color-swatch"
										defaultValue="#1a1a1a"
									/>
									<span className="color-value">#1A1A1A</span>
								</div>
							)}
						</div>

						{/* Image Blur Card */}
						<div className="right-card row-between">
							<span className="settings-sublabel">Image blur</span>
							<select
								className="settings-select inline-select"
								value={imageBlur}
								onChange={(e) => setImageBlur(e.target.value)}
							>
								<option>None</option>
								<option>Light</option>
								<option>Moderate</option>
								<option>Heavy</option>
							</select>
						</div>

						{/* Style Card */}
						<div className="right-card">
							<div className="settings-section-title">STYLE</div>
							<div className="style-grid">
								<div className="style-item" onClick={() => setFrameStyle("Default")}><div className={`style-thumb default ${frameStyle === "Default" ? "active" : ""}`}></div><span>Default</span></div>
								<div className="style-item" onClick={() => setFrameStyle("Glass Light")}><div className={`style-thumb glass-light ${frameStyle === "Glass Light" ? "active" : ""}`}></div><span>Glass Light</span></div>
								<div className="style-item" onClick={() => setFrameStyle("Glass Dark")}><div className={`style-thumb glass-dark ${frameStyle === "Glass Dark" ? "active" : ""}`}></div><span>Glass Dark</span></div>
								<div className="style-item" onClick={() => setFrameStyle("Outline")}><div className={`style-thumb outline ${frameStyle === "Outline" ? "active" : ""}`}></div><span>Outline</span></div>
								<div className="style-item" onClick={() => setFrameStyle("Border")}><div className={`style-thumb border-light ${frameStyle === "Border" ? "active" : ""}`}></div><span>Border</span></div>
								<div className="style-item" onClick={() => setFrameStyle("Border Dark")}><div className={`style-thumb border-dark ${frameStyle === "Border Dark" ? "active" : ""}`}></div><span>Border Dark</span></div>
							</div>
						</div>

						{/* Border Card */}
						<div className="right-card">
							<div className="settings-section-title">BORDER</div>
							<div className="border-grid">
								<div className="style-item" onClick={() => setFrameBorderRadius("Sharp")}><div className={`style-thumb sharp ${frameBorderRadius === "Sharp" ? "active" : ""}`}></div><span>Sharp</span></div>
								<div className="style-item" onClick={() => setFrameBorderRadius("Curved")}><div className={`style-thumb curved ${frameBorderRadius === "Curved" ? "active" : ""}`}></div><span>Curved</span></div>
								<div className="style-item" onClick={() => setFrameBorderRadius("Round")}><div className={`style-thumb round ${frameBorderRadius === "Round" ? "active" : ""}`}></div><span>Round</span></div>
							</div>
							<div className="zoom-input-row" style={{ marginTop: "12px" }}>
								<span className="zoom-label">Radius</span>
								<div className="zoom-input-wrapper"><input type="text" className="zoom-input string-input" defaultValue="10" /></div>
							</div>
							<div className="zoom-input-row">
								<span className="zoom-label">Scale</span>
								<div className="zoom-input-wrapper"><input type="text" className="zoom-input string-input" defaultValue="1.0" /></div>
							</div>
						</div>

						{/* Shadow Card */}
						<div className="right-card">
							<div className="settings-section-title">SHADOW</div>
							<div className="shadow-grid">
								<div className="style-item"><div className="style-thumb shadow-none"></div><span>None</span></div>
								<div className="style-item"><div className="style-thumb shadow-hug"></div><span>Hug</span></div>
								<div className="style-item"><div className="style-thumb shadow-soft active"></div><span>Soft</span></div>
								<div className="style-item"><div className="style-thumb shadow-strong"></div><span>Strong</span></div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
