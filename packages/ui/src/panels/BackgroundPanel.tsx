// ============================================================================
// Background Panel — Wallpaper, gradient, solid color, and custom image
// ============================================================================

import { useCallback, useState } from "react";
import { ImageIcon, Palette, Upload, Sparkles } from "lucide-react";
import "./Panels.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BackgroundPanelProps {
	value: string;
	type: "wallpaper" | "gradient" | "solid" | "custom";
	onChange: (value: string, type: "wallpaper" | "gradient" | "solid" | "custom") => void;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const WALLPAPERS = [
	{ id: "gradient-aurora", value: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", label: "Aurora" },
	{ id: "gradient-ocean", value: "linear-gradient(135deg, #0c3547 0%, #204e61 50%, #2a6f97 100%)", label: "Ocean" },
	{ id: "gradient-sunset", value: "linear-gradient(135deg, #fa709a 0%, #fee140 100%)", label: "Sunset" },
	{ id: "gradient-forest", value: "linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)", label: "Forest" },
	{ id: "gradient-midnight", value: "linear-gradient(135deg, #0d0b14 0%, #1a1625 50%, #2d283e 100%)", label: "Midnight" },
	{ id: "gradient-candy", value: "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)", label: "Candy" },
	{ id: "gradient-fire", value: "linear-gradient(135deg, #f5af19 0%, #f12711 100%)", label: "Fire" },
	{ id: "gradient-arctic", value: "linear-gradient(135deg, #e0eafc 0%, #cfdef3 100%)", label: "Arctic" },
	{ id: "gradient-neon", value: "linear-gradient(135deg, #00d2ff 0%, #3a7bd5 100%)", label: "Neon" },
	{ id: "gradient-rose", value: "linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)", label: "Rose" },
	{ id: "gradient-emerald", value: "linear-gradient(135deg, #11998e 0%, #38ef7d 100%)", label: "Emerald" },
	{ id: "gradient-cosmos", value: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)", label: "Cosmos" },
];

const SOLID_COLORS = [
	{ id: "solid-dark", value: "#0d0b14", label: "Dark" },
	{ id: "solid-charcoal", value: "#1e1e1e", label: "Charcoal" },
	{ id: "solid-slate", value: "#334155", label: "Slate" },
	{ id: "solid-white", value: "#ffffff", label: "White" },
	{ id: "solid-cream", value: "#faf5e4", label: "Cream" },
	{ id: "solid-blue", value: "#1e3a5f", label: "Navy" },
	{ id: "solid-green", value: "#134e4a", label: "Teal" },
	{ id: "solid-purple", value: "#3b0764", label: "Plum" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BackgroundPanel({ value, type, onChange }: BackgroundPanelProps) {
	const [activeTab, setActiveTab] = useState<"wallpaper" | "gradient" | "solid" | "custom">(type);
	const [customColor, setCustomColor] = useState("#0d0b14");

	const handleWallpaperSelect = useCallback(
		(wallpaper: typeof WALLPAPERS[number]) => {
			onChange(wallpaper.value, "gradient");
		},
		[onChange],
	);

	const handleSolidSelect = useCallback(
		(color: typeof SOLID_COLORS[number]) => {
			onChange(color.value, "solid");
		},
		[onChange],
	);

	const handleCustomColorChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			setCustomColor(e.target.value);
			onChange(e.target.value, "solid");
		},
		[onChange],
	);

	return (
		<div className="panel">
			<h3 className="panel-title">Background</h3>

			{/* Tab Switcher */}
			<div className="panel-tabs">
				<button
					className={`panel-tab ${activeTab === "wallpaper" ? "panel-tab--active" : ""}`}
					onClick={() => setActiveTab("wallpaper")}
					type="button"
				>
					<Sparkles size={12} />
					Gradients
				</button>
				<button
					className={`panel-tab ${activeTab === "solid" ? "panel-tab--active" : ""}`}
					onClick={() => setActiveTab("solid")}
					type="button"
				>
					<Palette size={12} />
					Solid
				</button>
				<button
					className={`panel-tab ${activeTab === "custom" ? "panel-tab--active" : ""}`}
					onClick={() => setActiveTab("custom")}
					type="button"
				>
					<Upload size={12} />
					Custom
				</button>
			</div>

			{/* Content */}
			{activeTab === "wallpaper" && (
				<div className="panel-grid panel-grid--3">
					{WALLPAPERS.map((wp) => (
						<button
							key={wp.id}
							className={`panel-swatch panel-swatch--lg ${value === wp.value ? "panel-swatch--selected" : ""}`}
							style={{ background: wp.value }}
							onClick={() => handleWallpaperSelect(wp)}
							title={wp.label}
							type="button"
						>
							{value === wp.value && <span className="panel-swatch-check">✓</span>}
						</button>
					))}
				</div>
			)}

			{activeTab === "solid" && (
				<>
					<div className="panel-grid panel-grid--4">
						{SOLID_COLORS.map((c) => (
							<button
								key={c.id}
								className={`panel-swatch ${value === c.value ? "panel-swatch--selected" : ""}`}
								style={{ background: c.value, border: c.value === "#ffffff" ? "1px solid var(--border-default)" : undefined }}
								onClick={() => handleSolidSelect(c)}
								title={c.label}
								type="button"
							>
								{value === c.value && <span className="panel-swatch-check">✓</span>}
							</button>
						))}
					</div>

					{/* Custom color picker */}
					<div className="panel-row" style={{ marginTop: "var(--space-3)" }}>
						<label className="panel-label">Custom</label>
						<div className="panel-color-input">
							<input
								type="color"
								value={customColor}
								onChange={handleCustomColorChange}
								className="panel-color-picker"
							/>
							<input
								type="text"
								value={customColor}
								onChange={handleCustomColorChange}
								className="panel-text-input panel-text-input--mono"
								maxLength={7}
							/>
						</div>
					</div>
				</>
			)}

			{activeTab === "custom" && (
				<div className="panel-upload-zone">
					<ImageIcon size={24} />
					<p>Drop an image here or click to upload</p>
					<span className="panel-upload-hint">PNG, JPG, WebP. Max 10 MB.</span>
				</div>
			)}
		</div>
	);
}
