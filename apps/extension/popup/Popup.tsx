// ============================================================================
// Extension Popup — Quick recording controls
// ============================================================================

import React, { useCallback, useEffect, useState } from "react";
import ReactDOM from "react-dom/client";

interface RecordingState {
	active: boolean;
	type: "tab" | "desktop" | "camera" | null;
	startTime: number;
}

function Popup() {
	const [recordingState, setRecordingState] = useState<RecordingState>({
		active: false,
		type: null,
		startTime: 0,
	});
	const [elapsedSeconds, setElapsedSeconds] = useState(0);

	useEffect(() => {
		// Get initial state
		chrome.runtime.sendMessage({ action: "get-recording-state" }, (state) => {
			if (state) setRecordingState(state);
		});
	}, []);

	useEffect(() => {
		if (!recordingState.active) {
			setElapsedSeconds(0);
			return;
		}
		const interval = setInterval(() => {
			setElapsedSeconds(Math.floor((Date.now() - recordingState.startTime) / 1000));
		}, 250);
		return () => clearInterval(interval);
	}, [recordingState.active, recordingState.startTime]);

	const formatTime = (s: number) => {
		const m = Math.floor(s / 60);
		return `${m.toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
	};

	const startTabCapture = useCallback(async () => {
		const result = await chrome.runtime.sendMessage({ action: "start-tab-capture" });
		if (result?.success) {
			setRecordingState({ active: true, type: "tab", startTime: Date.now() });
		}
	}, []);

	const startDesktopCapture = useCallback(async () => {
		const result = await chrome.runtime.sendMessage({ action: "start-desktop-capture" });
		if (result?.success) {
			setRecordingState({ active: true, type: "desktop", startTime: Date.now() });
		}
	}, []);

	const stopRecording = useCallback(async () => {
		await chrome.runtime.sendMessage({ action: "stop-recording" });
		setRecordingState({ active: false, type: null, startTime: 0 });
	}, []);

	const openEditor = useCallback(async () => {
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
		if (tab?.windowId) {
			chrome.runtime.sendMessage({ action: "open-editor", windowId: tab.windowId });
		}
	}, []);

	return (
		<div style={styles.container}>
			{/* Header */}
			<div style={styles.header}>
				<div style={styles.logo}>
					<span style={styles.logoIcon}>⏺</span>
					<span style={styles.logoText}>OpenScreen</span>
				</div>
				<span style={styles.version}>v2.0</span>
			</div>

			{recordingState.active ? (
				/* Recording Active */
				<div style={styles.recordingPanel}>
					<div style={styles.timerRow}>
						<div style={styles.recordingDot} />
						<span style={styles.timerText}>{formatTime(elapsedSeconds)}</span>
						<span style={styles.recordingType}>
							{recordingState.type === "tab" ? "Tab" : "Screen"}
						</span>
					</div>
					<button onClick={stopRecording} style={styles.stopBtn}>
						■ Stop Recording
					</button>
				</div>
			) : (
				/* Recording Options */
				<div style={styles.optionsPanel}>
					<button onClick={startTabCapture} style={styles.optionBtn}>
						<span style={styles.optionIcon}>🖥️</span>
						<div>
							<div style={styles.optionTitle}>Record This Tab</div>
							<div style={styles.optionDesc}>No permission dialog needed</div>
						</div>
					</button>

					<button onClick={startDesktopCapture} style={styles.optionBtn}>
						<span style={styles.optionIcon}>🖵</span>
						<div>
							<div style={styles.optionTitle}>Record Screen</div>
							<div style={styles.optionDesc}>Full screen or window</div>
						</div>
					</button>

					<div style={styles.divider} />

					<button onClick={openEditor} style={styles.editorBtn}>
						✂️ Open Editor
					</button>
				</div>
			)}
		</div>
	);
}

// Inline styles (extension popup has limited CSS options)
const styles: Record<string, React.CSSProperties> = {
	container: {
		padding: 16,
		display: "flex",
		flexDirection: "column",
		gap: 16,
	},
	header: {
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
	},
	logo: {
		display: "flex",
		alignItems: "center",
		gap: 8,
	},
	logoIcon: { fontSize: 20 },
	logoText: { fontSize: 16, fontWeight: 700 },
	version: { fontSize: 11, color: "#888", fontWeight: 500 },
	recordingPanel: {
		display: "flex",
		flexDirection: "column",
		gap: 12,
	},
	timerRow: {
		display: "flex",
		alignItems: "center",
		gap: 10,
		padding: "10px 14px",
		background: "rgba(255, 50, 50, 0.08)",
		borderRadius: 12,
		border: "1px solid rgba(255, 50, 50, 0.15)",
	},
	recordingDot: {
		width: 10,
		height: 10,
		borderRadius: "50%",
		background: "#ff3333",
		animation: "pulse 1.5s ease-in-out infinite",
	},
	timerText: {
		fontFamily: "'JetBrains Mono', monospace",
		fontSize: 18,
		fontWeight: 600,
		flex: 1,
	},
	recordingType: {
		fontSize: 11,
		color: "#aaa",
		textTransform: "uppercase" as const,
		fontWeight: 600,
		letterSpacing: "0.05em",
	},
	stopBtn: {
		width: "100%",
		height: 40,
		background: "linear-gradient(135deg, #e53e3e, #c53030)",
		color: "white",
		border: "none",
		borderRadius: 10,
		fontSize: 13,
		fontWeight: 600,
		cursor: "pointer",
	},
	optionsPanel: {
		display: "flex",
		flexDirection: "column",
		gap: 8,
	},
	optionBtn: {
		display: "flex",
		alignItems: "center",
		gap: 12,
		width: "100%",
		padding: "10px 14px",
		background: "rgba(255, 255, 255, 0.04)",
		border: "1px solid rgba(255, 255, 255, 0.08)",
		borderRadius: 12,
		color: "#f0f0f5",
		cursor: "pointer",
		textAlign: "left" as const,
		transition: "all 0.15s ease",
	},
	optionIcon: { fontSize: 24 },
	optionTitle: { fontSize: 13, fontWeight: 600, marginBottom: 2 },
	optionDesc: { fontSize: 11, color: "#888" },
	divider: {
		height: 1,
		background: "rgba(255, 255, 255, 0.06)",
		margin: "4px 0",
	},
	editorBtn: {
		width: "100%",
		height: 36,
		background: "linear-gradient(135deg, #6c5ce7, #5b4bdb)",
		color: "white",
		border: "none",
		borderRadius: 10,
		fontSize: 13,
		fontWeight: 600,
		cursor: "pointer",
	},
};

ReactDOM.createRoot(document.getElementById("root")!).render(
	<React.StrictMode>
		<Popup />
	</React.StrictMode>,
);
