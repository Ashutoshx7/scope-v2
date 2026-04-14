// ============================================================================
// Settings Panel — Shadow, border radius, padding, motion blur, cursor
// ============================================================================

import { useCallback } from "react";
import {
	Eye,
	Layers,
	Monitor,
	Move,
	Sparkles,
	Sun,
} from "lucide-react";
import "./Panels.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SettingsPanelProps {
	showShadow: boolean;
	shadowIntensity: number;
	borderRadius: number;
	padding: number;
	motionBlur: boolean;
	motionBlurAmount: number;
	cursorHighlight: boolean;
	clickVisualization: boolean;

	onShowShadowChange: (show: boolean) => void;
	onShadowIntensityChange: (intensity: number) => void;
	onBorderRadiusChange: (radius: number) => void;
	onPaddingChange: (padding: number) => void;
	onMotionBlurChange: (enabled: boolean) => void;
	onMotionBlurAmountChange: (amount: number) => void;
	onCursorHighlightChange: (enabled: boolean) => void;
	onClickVisualizationChange: (enabled: boolean) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RADIUS_PRESETS = [0, 8, 12, 16, 24, 32];
const PADDING_PRESETS = [0, 16, 24, 32, 48, 64];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SettingsPanel({
	showShadow,
	shadowIntensity,
	borderRadius,
	padding,
	motionBlur,
	motionBlurAmount,
	cursorHighlight,
	clickVisualization,
	onShowShadowChange,
	onShadowIntensityChange,
	onBorderRadiusChange,
	onPaddingChange,
	onMotionBlurChange,
	onMotionBlurAmountChange,
	onCursorHighlightChange,
	onClickVisualizationChange,
}: SettingsPanelProps) {
	return (
		<div className="panel">
			<h3 className="panel-title">Settings</h3>

			{/* Shadow */}
			<div className="panel-section">
				<div className="panel-row panel-row--between">
					<span className="panel-label">
						<Layers size={14} />
						Drop Shadow
					</span>
					<label className="switch">
						<input type="checkbox" checked={showShadow} onChange={(e) => onShowShadowChange(e.target.checked)} />
						<span className="switch-slider" />
					</label>
				</div>
				{showShadow && (
					<>
						<div className="panel-row panel-row--between">
							<span className="panel-sublabel">Intensity</span>
							<span className="panel-value">{shadowIntensity}%</span>
						</div>
						<input
							type="range"
							min={0}
							max={100}
							value={shadowIntensity}
							onChange={(e) => onShadowIntensityChange(parseInt(e.target.value, 10))}
							className="slider"
						/>
					</>
				)}
			</div>

			<div className="panel-divider" />

			{/* Border Radius */}
			<div className="panel-section">
				<div className="panel-row panel-row--between">
					<span className="panel-label">
						<Monitor size={14} />
						Corner Radius
					</span>
					<span className="panel-value">{borderRadius}px</span>
				</div>
				<div className="panel-preset-row">
					{RADIUS_PRESETS.map((r) => (
						<button
							key={r}
							className={`panel-preset-chip ${borderRadius === r ? "panel-preset-chip--active" : ""}`}
							onClick={() => onBorderRadiusChange(r)}
							type="button"
						>
							{r}
						</button>
					))}
				</div>
			</div>

			<div className="panel-divider" />

			{/* Padding */}
			<div className="panel-section">
				<div className="panel-row panel-row--between">
					<span className="panel-label">
						<Move size={14} />
						Padding
					</span>
					<span className="panel-value">{padding}px</span>
				</div>
				<div className="panel-preset-row">
					{PADDING_PRESETS.map((p) => (
						<button
							key={p}
							className={`panel-preset-chip ${padding === p ? "panel-preset-chip--active" : ""}`}
							onClick={() => onPaddingChange(p)}
							type="button"
						>
							{p}
						</button>
					))}
				</div>
			</div>

			<div className="panel-divider" />

			{/* Motion Blur */}
			<div className="panel-section">
				<div className="panel-row panel-row--between">
					<span className="panel-label">
						<Sparkles size={14} />
						Motion Blur
					</span>
					<label className="switch">
						<input type="checkbox" checked={motionBlur} onChange={(e) => onMotionBlurChange(e.target.checked)} />
						<span className="switch-slider" />
					</label>
				</div>
				{motionBlur && (
					<>
						<div className="panel-row panel-row--between">
							<span className="panel-sublabel">Amount</span>
							<span className="panel-value">{motionBlurAmount}%</span>
						</div>
						<input
							type="range"
							min={10}
							max={100}
							value={motionBlurAmount}
							onChange={(e) => onMotionBlurAmountChange(parseInt(e.target.value, 10))}
							className="slider"
						/>
					</>
				)}
			</div>

			<div className="panel-divider" />

			{/* Cursor */}
			<div className="panel-section">
				<span className="panel-label">
					<Sun size={14} />
					Cursor Effects
				</span>
				<div className="panel-row panel-row--between" style={{ marginTop: "var(--space-2)" }}>
					<span className="panel-sublabel">Cursor Highlight</span>
					<label className="switch">
						<input type="checkbox" checked={cursorHighlight} onChange={(e) => onCursorHighlightChange(e.target.checked)} />
						<span className="switch-slider" />
					</label>
				</div>
				<div className="panel-row panel-row--between">
					<span className="panel-sublabel">Click Visualization</span>
					<label className="switch">
						<input type="checkbox" checked={clickVisualization} onChange={(e) => onClickVisualizationChange(e.target.checked)} />
						<span className="switch-slider" />
					</label>
				</div>
			</div>
		</div>
	);
}
