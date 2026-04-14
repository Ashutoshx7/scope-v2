// ============================================================================
// Recording HUD — Fully Integrated (Phase 4)
//
// Now wired to Electron APIs for real screen capture, cursor telemetry,
// and automatic transition to the editor after recording stops.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import {
	Camera,
	ChevronDown,
	Mic,
	MicOff,
	Monitor,
	Pause,
	Play,
	RotateCcw,
	Settings,
	Square,
	Volume2,
	VolumeX,
	X,
} from "lucide-react";
import "./RecordingHUD.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RecordingConfig {
	sourceId: string | null;
	sourceLabel: string;
	micEnabled: boolean;
	systemAudioEnabled: boolean;
	webcamEnabled: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RecordingHUD() {
	const [recording, setRecording] = useState(false);
	const [paused, setPaused] = useState(false);
	const [elapsedSeconds, setElapsedSeconds] = useState(0);
	const [showCountdown, setShowCountdown] = useState(false);
	const [countdownValue, setCountdownValue] = useState(3);

	const [config, setConfig] = useState<RecordingConfig>({
		sourceId: null,
		sourceLabel: "Select Source",
		micEnabled: false,
		systemAudioEnabled: false,
		webcamEnabled: false,
	});

	const timerRef = useRef<number | null>(null);
	const startTimeRef = useRef<number>(0);
	const mediaRecorderRef = useRef<MediaRecorder | null>(null);
	const chunksRef = useRef<Blob[]>([]);

	// Format elapsed time
	const formatTime = (seconds: number): string => {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
	};

	// Timer management
	useEffect(() => {
		if (recording && !paused) {
			timerRef.current = window.setInterval(() => {
				setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
			}, 250);
		} else if (timerRef.current) {
			clearInterval(timerRef.current);
			timerRef.current = null;
		}
		return () => {
			if (timerRef.current) clearInterval(timerRef.current);
		};
	}, [recording, paused]);

	// Listen for source selection from SourceSelector window
	useEffect(() => {
		const handleSourceSelected = (_event: any, source: { id: string; name: string }) => {
			setConfig((prev) => ({
				...prev,
				sourceId: source.id,
				sourceLabel: source.name,
			}));
		};

		window.electronAPI?.onSourceSelected?.(handleSourceSelected);

		return () => {
			window.electronAPI?.removeSourceSelectedListener?.(handleSourceSelected);
		};
	}, []);

	// Listen for global hotkey (Ctrl/Cmd+Shift+R to toggle recording)
	useEffect(() => {
		const handleHotkey = (_event: any, action: string) => {
			if (action === "toggle-recording") {
				if (recording) {
					stopRecording();
				} else {
					startCountdown();
				}
			}
		};
		window.electronAPI?.onGlobalHotkey?.(handleHotkey);
		return () => {
			window.electronAPI?.removeGlobalHotkeyListener?.(handleHotkey);
		};
	}, [recording]);

	// -----------------------------------------------------------------------
	// Recording Control
	// -----------------------------------------------------------------------

	const startCountdown = useCallback(() => {
		setShowCountdown(true);
		setCountdownValue(3);

		let count = 3;
		const interval = setInterval(() => {
			count--;
			if (count <= 0) {
				clearInterval(interval);
				setShowCountdown(false);
				startRecording();
			} else {
				setCountdownValue(count);
			}
		}, 1000);
	}, [config]);

	const startRecording = useCallback(async () => {
		try {
			// Request screen capture via Electron desktopCapturer
			const constraints: MediaStreamConstraints = {
				audio: config.systemAudioEnabled ? {
					// @ts-ignore — Electron-specific
					mandatory: {
						chromeMediaSource: "desktop",
					},
				} as any : false,
				video: {
					// @ts-ignore — Electron-specific
					mandatory: {
						chromeMediaSource: "desktop",
						chromeMediaSourceId: config.sourceId || "screen:0:0",
						maxWidth: 3840,
						maxHeight: 2160,
						maxFrameRate: 60,
					},
				} as any,
			};

			const stream = await navigator.mediaDevices.getUserMedia(constraints);

			// Add microphone if enabled
			if (config.micEnabled) {
				try {
					const micStream = await navigator.mediaDevices.getUserMedia({
						audio: { echoCancellation: true, noiseSuppression: true },
					});
					for (const track of micStream.getAudioTracks()) {
						stream.addTrack(track);
					}
				} catch (err) {
					console.warn("[RecordingHUD] Microphone access denied:", err);
				}
			}

			// Set up MediaRecorder
			const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
				? "video/webm;codecs=vp9"
				: "video/webm;codecs=vp8";

			const recorder = new MediaRecorder(stream, {
				mimeType,
				videoBitsPerSecond: 8_000_000,
			});

			chunksRef.current = [];

			recorder.ondataavailable = (e) => {
				if (e.data.size > 0) {
					chunksRef.current.push(e.data);
				}
			};

			recorder.onstop = async () => {
				// Stop all tracks
				for (const track of stream.getTracks()) {
					track.stop();
				}

				if (chunksRef.current.length === 0) return;

				// Create blob and save via Electron IPC
				const blob = new Blob(chunksRef.current, { type: mimeType });
				const arrayBuffer = await blob.arrayBuffer();

				try {
					const result = await window.electronAPI?.saveRecording(
						new Uint8Array(arrayBuffer),
						config.sourceLabel,
					);

					if (result?.success && result.path) {
						// Open editor window with the recording
						window.electronAPI?.openEditor(result.path);
					}
				} catch (err) {
					console.error("[RecordingHUD] Failed to save recording:", err);
				}
			};

			recorder.start(1000); // Capture in 1-second chunks
			mediaRecorderRef.current = recorder;
			setRecording(true);
			setPaused(false);
			setElapsedSeconds(0);
			startTimeRef.current = Date.now();

			// Start cursor telemetry
			window.electronAPI?.startCursorTelemetry?.();

		} catch (err) {
			console.error("[RecordingHUD] Failed to start recording:", err);
		}
	}, [config]);

	const stopRecording = useCallback(() => {
		if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
			mediaRecorderRef.current.stop();
		}
		mediaRecorderRef.current = null;
		setRecording(false);
		setPaused(false);
		setElapsedSeconds(0);

		// Stop cursor telemetry
		window.electronAPI?.stopCursorTelemetry?.();
	}, []);

	const handleRecord = useCallback(() => {
		if (recording) {
			stopRecording();
		} else {
			startCountdown();
		}
	}, [recording, startCountdown, stopRecording]);

	const handlePause = useCallback(() => {
		if (!mediaRecorderRef.current) return;

		if (paused) {
			mediaRecorderRef.current.resume();
			startTimeRef.current = Date.now() - elapsedSeconds * 1000;
		} else {
			mediaRecorderRef.current.pause();
		}
		setPaused((p) => !p);
	}, [paused, elapsedSeconds]);

	const handleRestart = useCallback(() => {
		stopRecording();
		setTimeout(() => startCountdown(), 300);
	}, [stopRecording, startCountdown]);

	const handleClose = useCallback(() => {
		stopRecording();
		window.electronAPI?.hudOverlayClose();
	}, [stopRecording]);

	const handleSelectSource = useCallback(() => {
		window.electronAPI?.openSourceSelector();
	}, []);

	return (
		<div className="hud-layout">
			{/* Countdown Overlay */}
			{showCountdown && (
				<div className="hud-countdown animate-fade-in">
					<div className="hud-countdown-number animate-scale-bounce" key={countdownValue}>
						{countdownValue}
					</div>
				</div>
			)}

			{/* Main HUD Bar */}
			<div className="hud-bar glass-toolbar animate-slide-in-bottom titlebar-drag">
				{/* Source Selector */}
				<button
					id="hud-source-selector"
					className="hud-source-btn titlebar-no-drag"
					onClick={handleSelectSource}
					type="button"
				>
					<Monitor size={14} />
					<span className="hud-source-label">{config.sourceLabel}</span>
					<ChevronDown size={12} />
				</button>

				<div className="divider--vertical" />

				{/* Audio Controls */}
				<button
					id="hud-mic-toggle"
					className={`hud-icon-btn titlebar-no-drag ${config.micEnabled ? "hud-icon-btn--active" : ""}`}
					onClick={() => setConfig((p) => ({ ...p, micEnabled: !p.micEnabled }))}
					title={config.micEnabled ? "Mute Microphone" : "Enable Microphone"}
					type="button"
				>
					{config.micEnabled ? <Mic size={16} /> : <MicOff size={16} />}
				</button>

				<button
					id="hud-system-audio-toggle"
					className={`hud-icon-btn titlebar-no-drag ${config.systemAudioEnabled ? "hud-icon-btn--active" : ""}`}
					onClick={() => setConfig((p) => ({ ...p, systemAudioEnabled: !p.systemAudioEnabled }))}
					title={config.systemAudioEnabled ? "Mute System Audio" : "Enable System Audio"}
					type="button"
				>
					{config.systemAudioEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
				</button>

				<button
					id="hud-webcam-toggle"
					className={`hud-icon-btn titlebar-no-drag ${config.webcamEnabled ? "hud-icon-btn--active" : ""}`}
					onClick={() => setConfig((p) => ({ ...p, webcamEnabled: !p.webcamEnabled }))}
					title={config.webcamEnabled ? "Disable Camera" : "Enable Camera"}
					type="button"
				>
					<Camera size={16} />
				</button>

				<div className="divider--vertical" />

				{/* Recording Controls */}
				{recording && (
					<>
						<div className="hud-timer">
							<div className={`recording-dot ${!paused ? "recording-dot--active" : ""}`} />
							<span className="hud-timer-text">{formatTime(elapsedSeconds)}</span>
						</div>

						<button
							className="hud-icon-btn titlebar-no-drag"
							onClick={handlePause}
							title={paused ? "Resume" : "Pause"}
							type="button"
						>
							{paused ? <Play size={16} /> : <Pause size={16} />}
						</button>

						<button
							className="hud-icon-btn titlebar-no-drag"
							onClick={handleRestart}
							title="Restart Recording"
							type="button"
						>
							<RotateCcw size={16} />
						</button>
					</>
				)}

				{/* Record / Stop Button */}
				<button
					id="hud-record-btn"
					className={`hud-record-btn titlebar-no-drag ${recording ? "hud-record-btn--recording" : ""}`}
					onClick={handleRecord}
					title={recording ? "Stop Recording" : "Start Recording"}
					type="button"
				>
					{recording ? (
						<Square size={16} fill="currentColor" />
					) : (
						<div className="hud-record-dot" />
					)}
				</button>

				<div className="divider--vertical" />

				{/* Window Controls */}
				<button
					className="hud-icon-btn hud-icon-btn--subtle titlebar-no-drag"
					onClick={() => window.electronAPI?.hudOverlayHide()}
					title="Minimize"
					type="button"
				>
					<Settings size={14} />
				</button>

				<button
					className="hud-icon-btn hud-icon-btn--subtle titlebar-no-drag"
					onClick={handleClose}
					title="Quit"
					type="button"
				>
					<X size={14} />
				</button>
			</div>
		</div>
	);
}
