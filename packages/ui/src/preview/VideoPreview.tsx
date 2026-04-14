// ============================================================================
// VideoPreview — Real-time composited video preview in the editor
//
// Uses FrameRenderer from @scope/core to render frames with all
// effects (zoom, crop, annotations, webcam overlay) in real-time.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import {
	Maximize,
	Minimize,
	Pause,
	Play,
	SkipBack,
	SkipForward,
	Volume2,
	VolumeX,
} from "lucide-react";
import "./VideoPreview.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VideoPreviewProps {
	/** Video element or URL — consumer manages the source. */
	videoRef?: React.RefObject<HTMLVideoElement>;
	/** Current time in ms for display. */
	currentTimeMs: number;
	/** Total duration in ms. */
	totalDurationMs: number;
	/** Whether the video is playing. */
	playing: boolean;
	/** Whether audio is muted. */
	muted?: boolean;
	/** Aspect ratio for the preview container (e.g. "16:9"). */
	aspectRatio?: string;

	// Callbacks
	onPlayPause?: () => void;
	onSeek?: (timeMs: number) => void;
	onSkipBack?: () => void;
	onSkipForward?: () => void;
	onToggleMute?: () => void;
	onToggleFullscreen?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimecode(ms: number): string {
	const totalSeconds = Math.floor(ms / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VideoPreview({
	videoRef,
	currentTimeMs,
	totalDurationMs,
	playing,
	muted = false,
	aspectRatio = "16 / 9",
	onPlayPause,
	onSeek,
	onSkipBack,
	onSkipForward,
	onToggleMute,
	onToggleFullscreen,
}: VideoPreviewProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const progressRef = useRef<HTMLDivElement>(null);
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [showControls, setShowControls] = useState(true);
	const hideTimerRef = useRef<number | null>(null);

	const progress = totalDurationMs > 0 ? (currentTimeMs / totalDurationMs) * 100 : 0;

	// Handle progress bar click
	const handleProgressClick = useCallback(
		(e: React.MouseEvent) => {
			if (!progressRef.current || !onSeek) return;
			const rect = progressRef.current.getBoundingClientRect();
			const ratio = (e.clientX - rect.left) / rect.width;
			onSeek(Math.max(0, Math.min(ratio * totalDurationMs, totalDurationMs)));
		},
		[totalDurationMs, onSeek],
	);

	// Auto-hide controls during playback
	useEffect(() => {
		if (playing) {
			hideTimerRef.current = window.setTimeout(() => setShowControls(false), 3000);
		} else {
			setShowControls(true);
		}
		return () => {
			if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
		};
	}, [playing]);

	const handleMouseMove = useCallback(() => {
		setShowControls(true);
		if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
		if (playing) {
			hideTimerRef.current = window.setTimeout(() => setShowControls(false), 3000);
		}
	}, [playing]);

	const handleFullscreenToggle = useCallback(() => {
		if (!containerRef.current) return;
		if (document.fullscreenElement) {
			document.exitFullscreen();
			setIsFullscreen(false);
		} else {
			containerRef.current.requestFullscreen();
			setIsFullscreen(true);
		}
		onToggleFullscreen?.();
	}, [onToggleFullscreen]);

	return (
		<div
			ref={containerRef}
			className="vp-container"
			onMouseMove={handleMouseMove}
			onMouseLeave={() => playing && setShowControls(false)}
		>
			{/* Video Canvas */}
			<div
				className="vp-canvas glass-surface"
				style={{ aspectRatio }}
			>
				{videoRef?.current ? (
					<video
						ref={videoRef as any}
						className="vp-video"
						muted={muted}
						playsInline
					/>
				) : (
					<div className="vp-placeholder">
						<Play size={48} strokeWidth={1} />
						<p>Load a video to preview</p>
					</div>
				)}

				{/* Click to play/pause */}
				<div className="vp-click-area" onClick={onPlayPause} />
			</div>

			{/* Controls Overlay */}
			<div className={`vp-controls ${showControls ? "vp-controls--visible" : ""}`}>
				{/* Progress Bar */}
				<div
					ref={progressRef}
					className="vp-progress"
					onClick={handleProgressClick}
				>
					<div className="vp-progress-track">
						<div
							className="vp-progress-fill"
							style={{ width: `${progress}%` }}
						/>
						<div
							className="vp-progress-thumb"
							style={{ left: `${progress}%` }}
						/>
					</div>
				</div>

				{/* Control Buttons */}
				<div className="vp-controls-bar">
					<div className="vp-controls-left">
						{/* Skip Back */}
						<button
							className="vp-btn"
							onClick={onSkipBack}
							title="Skip back 5s"
							type="button"
						>
							<SkipBack size={16} />
						</button>

						{/* Play / Pause */}
						<button
							className={`vp-play-btn ${playing ? "vp-play-btn--playing" : ""}`}
							onClick={onPlayPause}
							title={playing ? "Pause" : "Play"}
							type="button"
						>
							{playing ? <Pause size={18} /> : <Play size={18} />}
						</button>

						{/* Skip Forward */}
						<button
							className="vp-btn"
							onClick={onSkipForward}
							title="Skip forward 5s"
							type="button"
						>
							<SkipForward size={16} />
						</button>

						{/* Mute Toggle */}
						<button
							className="vp-btn"
							onClick={onToggleMute}
							title={muted ? "Unmute" : "Mute"}
							type="button"
						>
							{muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
						</button>

						{/* Timecode */}
						<span className="vp-timecode">
							{formatTimecode(currentTimeMs)} / {formatTimecode(totalDurationMs)}
						</span>
					</div>

					<div className="vp-controls-right">
						{/* Fullscreen */}
						<button
							className="vp-btn"
							onClick={handleFullscreenToggle}
							title="Fullscreen"
							type="button"
						>
							{isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
