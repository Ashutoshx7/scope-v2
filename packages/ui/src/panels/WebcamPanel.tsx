// ============================================================================
// Webcam Panel — Layout, mask shape, size, and position controls
// ============================================================================

import { useCallback, useState } from "react";
import {
	Camera,
	CameraOff,
	Circle,
	Maximize2,
	RectangleHorizontal,
	Square,
} from "lucide-react";
import "./Panels.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WebcamLayout = "picture-in-picture" | "side-by-side" | "fullscreen" | "off";
export type WebcamMask = "circle" | "rounded" | "rectangle" | "square";
export type WebcamSize = 15 | 20 | 25 | 30 | 35;

export interface WebcamPanelProps {
	layout: WebcamLayout;
	maskShape: WebcamMask;
	size: WebcamSize;
	hasWebcam: boolean;
	onLayoutChange: (layout: WebcamLayout) => void;
	onMaskChange: (mask: WebcamMask) => void;
	onSizeChange: (size: WebcamSize) => void;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const LAYOUTS: Array<{ id: WebcamLayout; label: string; icon: React.ReactNode }> = [
	{ id: "picture-in-picture", label: "PiP", icon: <Camera size={14} /> },
	{ id: "side-by-side", label: "Side", icon: <RectangleHorizontal size={14} /> },
	{ id: "fullscreen", label: "Full", icon: <Maximize2 size={14} /> },
	{ id: "off", label: "Off", icon: <CameraOff size={14} /> },
];

const MASKS: Array<{ id: WebcamMask; label: string; icon: React.ReactNode }> = [
	{ id: "circle", label: "Circle", icon: <Circle size={14} /> },
	{ id: "rounded", label: "Rounded", icon: <Square size={14} /> },
	{ id: "rectangle", label: "Rect", icon: <RectangleHorizontal size={14} /> },
	{ id: "square", label: "Square", icon: <Square size={14} /> },
];

const SIZES: WebcamSize[] = [15, 20, 25, 30, 35];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WebcamPanel({
	layout,
	maskShape,
	size,
	hasWebcam,
	onLayoutChange,
	onMaskChange,
	onSizeChange,
}: WebcamPanelProps) {
	if (!hasWebcam) {
		return (
			<div className="panel">
				<h3 className="panel-title">Webcam</h3>
				<div className="panel-empty-state">
					<CameraOff size={32} />
					<p>No webcam recording detected</p>
					<span className="panel-hint">
						Record with webcam enabled to see overlay options.
					</span>
				</div>
			</div>
		);
	}

	return (
		<div className="panel">
			<h3 className="panel-title">Webcam</h3>

			{/* Layout */}
			<div className="panel-section">
				<span className="panel-label">Layout</span>
				<div className="panel-grid panel-grid--4">
					{LAYOUTS.map((l) => (
						<button
							key={l.id}
							className={`panel-preset ${layout === l.id ? "panel-preset--active" : ""}`}
							onClick={() => onLayoutChange(l.id)}
							type="button"
						>
							{l.icon}
							<span>{l.label}</span>
						</button>
					))}
				</div>
			</div>

			{layout !== "off" && layout !== "fullscreen" && (
				<>
					<div className="panel-divider" />

					{/* Mask Shape */}
					<div className="panel-section">
						<span className="panel-label">Shape</span>
						<div className="panel-grid panel-grid--4">
							{MASKS.map((m) => (
								<button
									key={m.id}
									className={`panel-preset ${maskShape === m.id ? "panel-preset--active" : ""}`}
									onClick={() => onMaskChange(m.id)}
									type="button"
								>
									{m.icon}
									<span>{m.label}</span>
								</button>
							))}
						</div>
					</div>

					<div className="panel-divider" />

					{/* Size */}
					<div className="panel-section">
						<div className="panel-row panel-row--between">
							<span className="panel-label">Size</span>
							<span className="panel-value">{size}%</span>
						</div>
						<input
							type="range"
							min={15}
							max={35}
							step={5}
							value={size}
							onChange={(e) => onSizeChange(parseInt(e.target.value, 10) as WebcamSize)}
							className="slider"
						/>
					</div>
				</>
			)}
		</div>
	);
}
