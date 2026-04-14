// ============================================================================
// Crop Panel — Aspect ratio presets and free-form crop
// ============================================================================

import { useCallback, useState } from "react";
import { Crop, Maximize2, Monitor, Smartphone } from "lucide-react";
import "./Panels.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CropRegionData {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface CropPanelProps {
	cropRegion: CropRegionData;
	onCropChange: (region: CropRegionData) => void;
	videoWidth: number;
	videoHeight: number;
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

const PRESETS = [
	{ id: "free", label: "Free", icon: <Crop size={16} />, ratio: null },
	{ id: "16:9", label: "16:9", icon: <Monitor size={16} />, ratio: 16 / 9 },
	{ id: "9:16", label: "9:16", icon: <Smartphone size={16} />, ratio: 9 / 16 },
	{ id: "4:3", label: "4:3", icon: <Monitor size={16} />, ratio: 4 / 3 },
	{ id: "1:1", label: "1:1", icon: <Maximize2 size={16} />, ratio: 1 },
	{ id: "4:5", label: "4:5", icon: <Smartphone size={16} />, ratio: 4 / 5 },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CropPanel({
	cropRegion,
	onCropChange,
	videoWidth,
	videoHeight,
}: CropPanelProps) {
	const [activePreset, setActivePreset] = useState<string>("free");

	const handlePresetSelect = useCallback(
		(preset: typeof PRESETS[number]) => {
			setActivePreset(preset.id);

			if (preset.id === "free") {
				// Reset to full frame
				onCropChange({ x: 0, y: 0, width: 1, height: 1 });
				return;
			}

			if (!preset.ratio) return;

			const videoAspect = videoWidth / videoHeight;
			const targetAspect = preset.ratio;

			let cropW: number;
			let cropH: number;

			if (targetAspect > videoAspect) {
				// Target is wider — crop height
				cropW = 1;
				cropH = videoAspect / targetAspect;
			} else {
				// Target is taller — crop width
				cropH = 1;
				cropW = targetAspect / videoAspect;
			}

			onCropChange({
				x: (1 - cropW) / 2,
				y: (1 - cropH) / 2,
				width: cropW,
				height: cropH,
			});
		},
		[onCropChange, videoWidth, videoHeight],
	);

	const handleReset = useCallback(() => {
		setActivePreset("free");
		onCropChange({ x: 0, y: 0, width: 1, height: 1 });
	}, [onCropChange]);

	return (
		<div className="panel">
			<h3 className="panel-title">Crop & Resize</h3>

			{/* Presets */}
			<div className="panel-section">
				<span className="panel-label">Aspect Ratio</span>
				<div className="panel-grid panel-grid--3">
					{PRESETS.map((preset) => (
						<button
							key={preset.id}
							className={`panel-preset ${activePreset === preset.id ? "panel-preset--active" : ""}`}
							onClick={() => handlePresetSelect(preset)}
							type="button"
						>
							{preset.icon}
							<span>{preset.label}</span>
						</button>
					))}
				</div>
			</div>

			<div className="panel-divider" />

			{/* Crop Values */}
			<div className="panel-section">
				<span className="panel-label">Crop Region</span>

				<div className="panel-grid panel-grid--2">
					<div className="panel-field">
						<label>X</label>
						<input
							type="number"
							value={Math.round(cropRegion.x * videoWidth)}
							onChange={(e) => {
								const px = parseInt(e.target.value, 10) || 0;
								onCropChange({ ...cropRegion, x: px / videoWidth });
							}}
							className="panel-text-input panel-text-input--sm"
							min={0}
							max={videoWidth}
						/>
					</div>
					<div className="panel-field">
						<label>Y</label>
						<input
							type="number"
							value={Math.round(cropRegion.y * videoHeight)}
							onChange={(e) => {
								const px = parseInt(e.target.value, 10) || 0;
								onCropChange({ ...cropRegion, y: px / videoHeight });
							}}
							className="panel-text-input panel-text-input--sm"
							min={0}
							max={videoHeight}
						/>
					</div>
					<div className="panel-field">
						<label>Width</label>
						<input
							type="number"
							value={Math.round(cropRegion.width * videoWidth)}
							onChange={(e) => {
								const px = parseInt(e.target.value, 10) || 1;
								onCropChange({ ...cropRegion, width: px / videoWidth });
							}}
							className="panel-text-input panel-text-input--sm"
							min={1}
							max={videoWidth}
						/>
					</div>
					<div className="panel-field">
						<label>Height</label>
						<input
							type="number"
							value={Math.round(cropRegion.height * videoHeight)}
							onChange={(e) => {
								const px = parseInt(e.target.value, 10) || 1;
								onCropChange({ ...cropRegion, height: px / videoHeight });
							}}
							className="panel-text-input panel-text-input--sm"
							min={1}
							max={videoHeight}
						/>
					</div>
				</div>
			</div>

			{/* Reset */}
			<button className="btn btn--secondary btn--sm btn--full" onClick={handleReset} type="button">
				Reset Crop
			</button>
		</div>
	);
}
