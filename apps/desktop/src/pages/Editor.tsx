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
} from "lucide-react";

import { useProjectState } from "../hooks/useProjectState.js";
import "./Editor.css";

// ---------------------------------------------------------------------------
// Background presets (gradient thumbnails)
// ---------------------------------------------------------------------------

const BG_PRESETS = [
	{ id: "bg1", css: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)" },
	{ id: "bg2", css: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)" },
	{ id: "bg3", css: "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)" },
	{ id: "bg4", css: "linear-gradient(135deg, #fa709a 0%, #fee140 100%)" },
	{ id: "bg5", css: "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)" },
	{ id: "bg6", css: "linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)" },
	{ id: "bg7", css: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" },
	{ id: "bg8", css: "linear-gradient(135deg, #0c3547 0%, #1a6073 50%, #2d9196 100%)" },
	{ id: "bg9", css: "linear-gradient(135deg, #2b5876 0%, #4e4376 100%)" },
	{ id: "bg10", css: "linear-gradient(135deg, #c471f5 0%, #fa71cd 100%)" },
];

// ---------------------------------------------------------------------------
// Right panel icon tabs
// ---------------------------------------------------------------------------

type RightTab = "settings" | "zoom" | "crop" | "avatar" | "help";

const ICON_TABS: { id: RightTab; icon: typeof Settings; label: string }[] = [
	{ id: "settings", icon: Settings, label: "Settings" },
	{ id: "zoom", icon: Search, label: "Zoom" },
	{ id: "crop", icon: Crop, label: "Crop" },
	{ id: "avatar", icon: User, label: "Avatar" },
	{ id: "help", icon: HelpCircle, label: "Help" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Editor() {
	const { state, dispatch, canUndo, canRedo, addZoomRegion } = useProjectState();
	const videoRef = useRef<HTMLVideoElement>(null);

	const [activeTab, setActiveTab] = useState<RightTab>("settings");
	const [bgTab, setBgTab] = useState<"Image" | "Gradient" | "Color" | "Hidden">("Image");
	const [frameTab, setFrameTab] = useState<"Default" | "Minimal" | "Hidden">("Default");
	const [aspectRatio, setAspectRatio] = useState("Native");
	const [imageBlur, setImageBlur] = useState("Moderate");
	const [frameShadow, setFrameShadow] = useState(true);
	const [frameBorder, setFrameBorder] = useState(false);
	const [cursorSize, setCursorSize] = useState("Medium");
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
			video.play().catch(() => {});
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
		bgTab === "Gradient" || bgTab === "Image"
			? BG_PRESETS.find(b => b.id === activeBg)?.css || BG_PRESETS[0].css
			: "#1a1a1a"
	);

	// Determine active zoom region for current time
	const activeZoom = useMemo(() => {
		const t = state.currentTimeMs;
		return state.zoomRegions.find(r => t >= r.startMs && t <= r.endMs) || null;
	}, [state.currentTimeMs, state.zoomRegions]);

	const videoStyle: React.CSSProperties = {
		width: "100%",
		height: "100%",
		objectFit: "contain",
		borderRadius: activeZoom ? "0px" : "8px",
		boxShadow: frameShadow && !activeZoom ? "0 8px 40px rgba(0,0,0,0.4)" : "none",
		border: frameBorder && !activeZoom ? "1px solid rgba(255,255,255,0.15)" : "none",
		// Zoom: scale from the focal point
		transformOrigin: activeZoom
			? `${activeZoom.focusCx * 100}% ${activeZoom.focusCy * 100}%`
			: "center center",
		transform: activeZoom ? `scale(${activeZoom.depth})` : "scale(1)",
		transition: "transform 0.5s cubic-bezier(0.4, 0, 0.2, 1), transform-origin 0.5s cubic-bezier(0.4, 0, 0.2, 1), border-radius 0.3s",
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
				{/* Left: Preview + Timeline */}
				<div className="editor-content">
					{/* Video Preview */}
					<div className="editor-preview">
					<div
							className="preview-canvas"
							style={{
								background: state.videoUrl ? previewBg : undefined,
								padding: state.videoUrl && !activeZoom ? "24px" : "0px",
								transition: "padding 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
							}}
						>
							{state.videoUrl ? (
							<div style={{
								width: "100%",
								height: "100%",
								overflow: "hidden",
								borderRadius: "8px",
								position: "relative",
							}}>
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

					{/* Transport Controls */}
					<div className="editor-transport">
						<button
							className="transport-btn"
							onClick={() => dispatch({ type: "SET_PLAYING", playing: !state.playing })}
							type="button"
						>
							{state.playing ? <Pause size={16} /> : <Play size={16} />}
						</button>
						<span className="transport-time">
							{formatTime(state.currentTimeMs)} / {formatTime(state.totalDurationMs)}
						</span>
						<div
							className="transport-progress"
							onClick={handleSeek}
						>
							<div className="transport-progress-fill" style={{ width: `${progressPct}%` }} />
						</div>
					</div>

					{/* Timeline Toolbar */}
					<div className="editor-tl-toolbar">
						<div className="tl-tool-group">
							<button className="tl-tool-btn" type="button" onClick={handleAddZoom}>
								<Plus size={14} /> Add zoom
							</button>
							<button className="tl-tool-icon-btn" type="button" title="Add zoom at playhead" onClick={handleAddZoom}>
								<ZoomIcon size={14} />
							</button>
						</div>

						<div className="tl-tool-group">
							<button
								className="tl-tool-icon-btn"
								type="button"
								title="Set trim in-point"
								onClick={() => setTrimIn(state.currentTimeMs)}
							>
								<SplitSquareVertical size={14} />
							</button>
							<button
								className="tl-tool-icon-btn"
								type="button"
								title="Delete selected zoom"
								disabled={!selectedZoomId}
								onClick={handleDeleteSelected}
							>
								<Trash2 size={14} />
							</button>
						</div>

						<div className="tl-tool-group">
							<button
								className="tl-tool-icon-btn"
								type="button"
								title="Undo"
								disabled={!canUndo}
								onClick={() => dispatch({ type: "UNDO" })}
							>
								<Undo2 size={14} />
							</button>
							<button
								className="tl-tool-icon-btn"
								type="button"
								title="Redo"
								disabled={!canRedo}
								onClick={() => dispatch({ type: "REDO" })}
							>
								<Redo2 size={14} />
							</button>
						</div>

						<button className="tl-tool-btn standalone" type="button" onClick={handleResetTimeline}>
							<RotateCcw size={14} /> Reset timeline
						</button>

						<div className="tl-zoom-slider">
							<Minus size={12} />
							<input
								type="range"
								min={10}
								max={100}
								value={timelineZoom}
								onChange={(e) => setTimelineZoom(Number(e.target.value))}
							/>
							<Plus size={12} />
						</div>
					</div>

					{/* Timeline Track */}
					<div className="editor-timeline-area">
						<div className="timeline-track">
							{/* Trim-in handle */}
							<div
								className="timeline-trim-handle left"
								title={`Trim in: ${formatTime(trimIn)}`}
								onClick={() => setTrimIn(state.currentTimeMs)}
							>
								<Scissors size={14} />
							</div>
							
							<div
								className="timeline-content"
								onClick={(e) => {
									if (state.totalDurationMs <= 0) return;
									const rect = e.currentTarget.getBoundingClientRect();
									const pct = (e.clientX - rect.left) / rect.width;
									const timeMs = pct * state.totalDurationMs;
									dispatch({ type: "SET_TIME", timeMs });
									if (videoRef.current) {
										videoRef.current.currentTime = timeMs / 1000;
									}
									setSelectedZoomId(null); // deselect zoom block on timeline click
								}}
							>
								{/* Trim shading (before trim-in / after trim-out) */}
								{trimIn > 0 && (
									<div
										className="timeline-trim-shade"
										style={{ left: 0, width: `${(trimIn / Math.max(1, state.totalDurationMs)) * 100}%` }}
									/>
								)}
								{effectiveTrimOut > 0 && effectiveTrimOut < state.totalDurationMs && (
									<div
										className="timeline-trim-shade"
										style={{ right: 0, width: `${((state.totalDurationMs - effectiveTrimOut) / Math.max(1, state.totalDurationMs)) * 100}%` }}
									/>
								)}

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
												{`${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`}
											</div>
										));
									})()}
								</div>

								{/* Zoom Regions */}
								<div className="timeline-blocks">
									{state.zoomRegions.map((region) => {
										const startPct = (region.startMs / Math.max(1, state.totalDurationMs)) * 100;
										const widthPct = ((region.endMs - region.startMs) / Math.max(1, state.totalDurationMs)) * 100;
										const isSelected = selectedZoomId === region.id;
										const isActive = activeZoom?.id === region.id;
										return (
											<div
												key={region.id}
												className={`zoom-block ${isSelected ? 'selected' : ''} ${isActive ? 'active' : ''}`}
												style={{ left: `${startPct}%`, width: `${widthPct}%` }}
												onClick={(e) => {
													e.stopPropagation();
													setSelectedZoomId(isSelected ? null : region.id);
												}}
											>
												<ZoomIcon size={12} /> {region.depth}x
											</div>
										);
									})}
								</div>

								{/* Playhead */}
								<div className="timeline-playhead" style={{ left: `${progressPct}%` }}>
									<div className="playhead-top" />
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
					{/* Icon Bar */}
					<div className="right-icon-bar">
						{ICON_TABS.map((tab) => (
							<button
								key={tab.id}
								className={`right-icon-btn ${activeTab === tab.id ? "active" : ""}`}
								onClick={() => setActiveTab(tab.id)}
								title={tab.label}
								type="button"
							>
								<tab.icon size={16} />
							</button>
						))}
					</div>

					{/* Settings Content */}
					<div className="right-settings">
						{/* Export Button */}
						<button
							className="export-btn"
							type="button"
							onClick={() => dispatch({ type: "EXPORT_START" })}
						>
							Export video
						</button>

						{/* Theme (Added Dark Mode Feature) */}
						<div className="settings-section">
							<div className="settings-label">Theme</div>
							<div className="settings-tabs">
								<button
									className={`settings-tab ${!darkMode ? "active" : ""}`}
									onClick={() => setDarkMode(false)}
									type="button"
								>
									Light
								</button>
								<button
									className={`settings-tab ${darkMode ? "active" : ""}`}
									onClick={() => setDarkMode(true)}
									type="button"
								>
									Dark
								</button>
							</div>
						</div>

						{/* Aspect Ratio */}
						<div className="settings-section">
							<div className="settings-label">Aspect ratio</div>
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

						{/* Background */}
						<div className="settings-section">
							<div className="settings-label">Background</div>
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
									{BG_PRESETS.map((bg) => (
										<div
											key={bg.id}
											className={`bg-thumb ${activeBg === bg.id ? "active" : ""}`}
											style={{ background: bg.css }}
											onClick={() => {
												setActiveBg(bg.id);
												dispatch({ type: "SET_BACKGROUND", value: bg.css, bgType: "gradient" });
											}}
										/>
									))}
								</div>
							)}
							{bgTab === "Image" && (
								<div className="bg-thumbs">
									{BG_PRESETS.map((bg) => (
										<div
											key={bg.id}
											className={`bg-thumb ${activeBg === bg.id ? "active" : ""}`}
											style={{ background: bg.css }}
											onClick={() => setActiveBg(bg.id)}
										/>
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

						{/* Image Blur */}
						<div className="settings-section">
							<div className="settings-inline">
								<span className="settings-sublabel">Image blur</span>
								<select
									className="settings-select"
									value={imageBlur}
									onChange={(e) => setImageBlur(e.target.value)}
								>
									<option>None</option>
									<option>Light</option>
									<option>Moderate</option>
									<option>Heavy</option>
								</select>
							</div>
						</div>

						{/* Browser Frame */}
						<div className="settings-section">
							<div className="settings-label">Browser frame</div>
							<div className="settings-tabs">
								{(["Default", "Minimal", "Hidden"] as const).map((t) => (
									<button
										key={t}
										className={`settings-tab ${frameTab === t ? "active" : ""}`}
										onClick={() => setFrameTab(t)}
										type="button"
									>
										{t}
									</button>
								))}
							</div>

							<div className="settings-toggle-row">
								<button
									className={`toggle-switch ${frameShadow ? "on" : ""}`}
									onClick={() => setFrameShadow(!frameShadow)}
									type="button"
								/>
								<span className="settings-toggle-label">Frame shadow</span>
							</div>
							<div className="settings-toggle-row">
								<button
									className={`toggle-switch ${frameBorder ? "on" : ""}`}
									onClick={() => setFrameBorder(!frameBorder)}
									type="button"
								/>
								<span className="settings-toggle-label">Frame border</span>
							</div>
						</div>

						{/* Cursor */}
						<div className="settings-section">
							<div className="settings-label">Cursor</div>
							<span className="pro-badge">Available on Cursorful Pro Desktop</span>

							<div className="settings-inline">
								<span className="settings-sublabel">Size</span>
								<select
									className="settings-select"
									value={cursorSize}
									onChange={(e) => setCursorSize(e.target.value)}
								>
									<option>Small</option>
									<option>Medium</option>
									<option>Large</option>
								</select>
							</div>

							<div className="settings-toggle-row">
								<button
									className={`toggle-switch ${smoothMovement ? "on" : ""}`}
									onClick={() => setSmoothMovement(!smoothMovement)}
									type="button"
								/>
								<span className="settings-toggle-label">Smooth movement</span>
							</div>
							<div className="settings-toggle-row">
								<button
									className={`toggle-switch ${cursorShadow ? "on" : ""}`}
									onClick={() => setCursorShadow(!cursorShadow)}
									type="button"
								/>
								<span className="settings-toggle-label">Cursor shadow</span>
							</div>
						</div>

						{/* Click Animation */}
						<div className="settings-section">
							<div className="settings-label">Click animation</div>
							<div className="settings-inline">
								<span className="settings-sublabel">Style</span>
								<select
									className="settings-select"
									value={clickStyle}
									onChange={(e) => setClickStyle(e.target.value)}
								>
									<option>None</option>
									<option>Pressure</option>
									<option>Ripple</option>
									<option>Highlight</option>
								</select>
							</div>
							<div className="settings-inline">
								<span className="settings-sublabel">Force</span>
								<select
									className="settings-select"
									value={clickForce}
									onChange={(e) => setClickForce(e.target.value)}
								>
									<option>None</option>
									<option>Light</option>
									<option>Medium</option>
									<option>Strong</option>
								</select>
							</div>
						</div>

						{/* Windowed Browser Padding */}
						<div className="settings-section">
							<div className="settings-label">Inset padding</div>
							<div className="padding-grid">
								<div className="padding-field">
									<label>Top</label>
									<input type="number" defaultValue={0} min={0} />
								</div>
								<div className="padding-field">
									<label>Right</label>
									<input type="number" defaultValue={0} min={0} />
								</div>
								<div className="padding-field">
									<label>Bottom</label>
									<input type="number" defaultValue={0} min={0} />
								</div>
								<div className="padding-field">
									<label>Left</label>
									<input type="number" defaultValue={0} min={0} />
								</div>
							</div>
							<button className="reset-inset-btn" type="button">Reset inset</button>
						</div>

						{/* Footer */}
						<div className="sidebar-footer">
							<div className="sidebar-footer-bug">
								Found a 🐛 bug? <a href="#">Contact support</a>.
							</div>
							<div className="sidebar-footer-links-grid">
								<span>© 2026 Cursorful</span>
								<a href="#">Terms of Service</a>
								<a href="#">Refund Policy</a>
								<a href="#">Privacy Policy</a>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
