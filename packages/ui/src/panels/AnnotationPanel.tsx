// ============================================================================
// Annotation Panel — Text, shapes, blur, freehand drawing tool selection
// ============================================================================

import { useCallback, useState } from "react";
import {
	ArrowRight,
	Circle,
	Hand,
	Minus,
	MousePointer2,
	Pencil,
	RectangleHorizontal,
	SquareAsterisk,
	Trash2,
	Type,
} from "lucide-react";
import "./Panels.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AnnotationTool =
	| "select"
	| "text"
	| "arrow"
	| "rectangle"
	| "circle"
	| "line"
	| "blur"
	| "freehand";

export interface AnnotationItem {
	id: string;
	type: string;
	label: string;
	startMs: number;
	endMs: number;
}

export interface AnnotationPanelProps {
	activeTool: AnnotationTool;
	annotations: AnnotationItem[];
	selectedId: string | null;
	strokeColor: string;
	fillColor: string;
	fontSize: number;
	strokeWidth: number;
	onToolChange: (tool: AnnotationTool) => void;
	onSelectAnnotation: (id: string | null) => void;
	onDeleteAnnotation: (id: string) => void;
	onStrokeColorChange: (color: string) => void;
	onFillColorChange: (color: string) => void;
	onFontSizeChange: (size: number) => void;
	onStrokeWidthChange: (width: number) => void;
}

// ---------------------------------------------------------------------------
// Tool Config
// ---------------------------------------------------------------------------

const TOOLS: Array<{ id: AnnotationTool; icon: React.ReactNode; label: string }> = [
	{ id: "select", icon: <MousePointer2 size={16} />, label: "Select" },
	{ id: "text", icon: <Type size={16} />, label: "Text" },
	{ id: "arrow", icon: <ArrowRight size={16} />, label: "Arrow" },
	{ id: "rectangle", icon: <RectangleHorizontal size={16} />, label: "Rectangle" },
	{ id: "circle", icon: <Circle size={16} />, label: "Circle" },
	{ id: "line", icon: <Minus size={16} />, label: "Line" },
	{ id: "blur", icon: <SquareAsterisk size={16} />, label: "Blur" },
	{ id: "freehand", icon: <Pencil size={16} />, label: "Draw" },
];

const PRESET_COLORS = [
	"#ff4444", "#ff8c00", "#facc15", "#4ade80",
	"#22d3ee", "#6c5ce7", "#ec4899", "#ffffff",
	"#94a3b8", "#000000",
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AnnotationPanel({
	activeTool,
	annotations,
	selectedId,
	strokeColor,
	fillColor,
	fontSize,
	strokeWidth,
	onToolChange,
	onSelectAnnotation,
	onDeleteAnnotation,
	onStrokeColorChange,
	onFillColorChange,
	onFontSizeChange,
	onStrokeWidthChange,
}: AnnotationPanelProps) {
	return (
		<div className="panel">
			<h3 className="panel-title">Annotations</h3>

			{/* Tool Palette */}
			<div className="panel-section">
				<span className="panel-label">Tools</span>
				<div className="panel-tools">
					{TOOLS.map((tool) => (
						<button
							key={tool.id}
							className={`panel-tool ${activeTool === tool.id ? "panel-tool--active" : ""}`}
							onClick={() => onToolChange(tool.id)}
							title={tool.label}
							type="button"
						>
							{tool.icon}
						</button>
					))}
				</div>
			</div>

			<div className="panel-divider" />

			{/* Style Options */}
			<div className="panel-section">
				<span className="panel-label">Color</span>
				<div className="panel-grid panel-grid--5">
					{PRESET_COLORS.map((c) => (
						<button
							key={c}
							className={`panel-swatch panel-swatch--sm ${strokeColor === c ? "panel-swatch--selected" : ""}`}
							style={{
								background: c,
								border: c === "#ffffff" || c === "#000000" ? "1px solid var(--border-default)" : undefined,
							}}
							onClick={() => onStrokeColorChange(c)}
							type="button"
						/>
					))}
				</div>
			</div>

			{/* Size Controls */}
			{(activeTool === "text") && (
				<div className="panel-section">
					<div className="panel-row panel-row--between">
						<span className="panel-label">Font Size</span>
						<span className="panel-value">{fontSize}px</span>
					</div>
					<input
						type="range"
						min={12}
						max={72}
						value={fontSize}
						onChange={(e) => onFontSizeChange(parseInt(e.target.value, 10))}
						className="slider"
					/>
				</div>
			)}

			{(activeTool === "arrow" || activeTool === "rectangle" || activeTool === "circle" || activeTool === "line" || activeTool === "freehand") && (
				<div className="panel-section">
					<div className="panel-row panel-row--between">
						<span className="panel-label">Stroke Width</span>
						<span className="panel-value">{strokeWidth}px</span>
					</div>
					<input
						type="range"
						min={1}
						max={12}
						value={strokeWidth}
						onChange={(e) => onStrokeWidthChange(parseInt(e.target.value, 10))}
						className="slider"
					/>
				</div>
			)}

			<div className="panel-divider" />

			{/* Annotation List */}
			<div className="panel-section">
				<span className="panel-label">Active Annotations ({annotations.length})</span>

				{annotations.length === 0 && (
					<p className="panel-empty">
						Select a tool and draw on the preview to add annotations.
					</p>
				)}

				<div className="panel-list">
					{annotations.map((a) => (
						<div
							key={a.id}
							className={`panel-list-item ${selectedId === a.id ? "panel-list-item--selected" : ""}`}
							onClick={() => onSelectAnnotation(a.id)}
						>
							<div className="panel-list-content">
								<span className="panel-list-title">{a.label || a.type}</span>
							</div>
							<button
								className="btn btn--ghost btn--icon-xs"
								onClick={(e) => {
									e.stopPropagation();
									onDeleteAnnotation(a.id);
								}}
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
