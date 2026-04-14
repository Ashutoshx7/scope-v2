// ============================================================================
// Zoom Panel — Zoom region management and auto-zoom controls
// ============================================================================

import { useCallback } from "react";
import { Focus, Plus, Sparkles, Trash2, ZoomIn } from "lucide-react";
import "./Panels.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ZoomRegionItem {
	id: string;
	startMs: number;
	endMs: number;
	depth: number;
	focusCx: number;
	focusCy: number;
}

export interface ZoomPanelProps {
	regions: ZoomRegionItem[];
	currentTimeMs: number;
	totalDurationMs: number;
	autoZoomEnabled: boolean;
	onAddRegion: (startMs: number, endMs: number) => void;
	onRemoveRegion: (id: string) => void;
	onUpdateRegion: (id: string, updates: Partial<ZoomRegionItem>) => void;
	onToggleAutoZoom: (enabled: boolean) => void;
	onAutoZoomSuggest?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(ms: number): string {
	const s = Math.floor(ms / 1000);
	const m = Math.floor(s / 60);
	return `${m}:${(s % 60).toString().padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ZoomPanel({
	regions,
	currentTimeMs,
	totalDurationMs,
	autoZoomEnabled,
	onAddRegion,
	onRemoveRegion,
	onUpdateRegion,
	onToggleAutoZoom,
	onAutoZoomSuggest,
}: ZoomPanelProps) {
	const handleAddAtPlayhead = useCallback(() => {
		const start = Math.max(0, currentTimeMs - 1000);
		const end = Math.min(totalDurationMs, currentTimeMs + 3000);
		onAddRegion(start, end);
	}, [currentTimeMs, totalDurationMs, onAddRegion]);

	return (
		<div className="panel">
			<h3 className="panel-title">Zoom & Focus</h3>

			{/* Auto-Zoom */}
			<div className="panel-section">
				<div className="panel-row panel-row--between">
					<span className="panel-label">
						<Sparkles size={14} />
						Auto-Zoom (AI)
					</span>
					<label className="switch">
						<input
							type="checkbox"
							checked={autoZoomEnabled}
							onChange={(e) => onToggleAutoZoom(e.target.checked)}
						/>
						<span className="switch-slider" />
					</label>
				</div>

				{!autoZoomEnabled && onAutoZoomSuggest && (
					<button
						className="btn btn--secondary btn--sm btn--full"
						onClick={onAutoZoomSuggest}
						type="button"
					>
						<Sparkles size={14} />
						Suggest Zoom Regions
					</button>
				)}
			</div>

			<div className="panel-divider" />

			{/* Manual Zoom Regions */}
			<div className="panel-section">
				<div className="panel-row panel-row--between">
					<span className="panel-label">Zoom Regions</span>
					<button className="btn btn--ghost btn--icon-sm" onClick={handleAddAtPlayhead} title="Add zoom at playhead" type="button">
						<Plus size={14} />
					</button>
				</div>

				{regions.length === 0 && (
					<p className="panel-empty">
						No zoom regions. Click + or drag on the timeline to add.
					</p>
				)}

				<div className="panel-list">
					{regions.map((region) => (
						<div key={region.id} className="panel-list-item">
							<ZoomIn size={12} className="panel-list-icon" />
							<div className="panel-list-content">
								<span className="panel-list-title">
									{formatTime(region.startMs)} → {formatTime(region.endMs)}
								</span>
								<span className="panel-list-subtitle">
									Depth: {region.depth}x
								</span>
							</div>

							{/* Depth Slider */}
							<input
								type="range"
								min={1}
								max={4}
								step={0.5}
								value={region.depth}
								onChange={(e) =>
									onUpdateRegion(region.id, { depth: parseFloat(e.target.value) })
								}
								className="panel-mini-slider"
							/>

							<button
								className="btn btn--ghost btn--icon-xs"
								onClick={() => onRemoveRegion(region.id)}
								title="Remove"
								type="button"
							>
								<Trash2 size={12} />
							</button>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
