// ============================================================================
// Export Dialog — Format, quality, resolution picker with progress display
// ============================================================================

import { useCallback, useState } from "react";
import { Download, Loader2, X, CheckCircle2, AlertCircle } from "lucide-react";
import "./ExportDialog.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExportFormat = "mp4" | "gif" | "webm";
export type ExportQuality = "draft" | "standard" | "high" | "ultra";
export type ExportResolution = "720p" | "1080p" | "1440p" | "4k";

export interface ExportDialogProps {
	open: boolean;
	onClose: () => void;
	onStartExport: (config: {
		format: ExportFormat;
		quality: ExportQuality;
		resolution: ExportResolution;
	}) => void;
	/** 0–100 progress. null = not exporting. */
	progress: number | null;
	/** Current phase name. */
	phase?: string;
	/** Whether the export completed successfully. */
	completed?: boolean;
	/** Error message if export failed. */
	error?: string | null;
	/** Path to the exported file (for reveal in folder). */
	outputPath?: string | null;
	onRevealFile?: (path: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExportDialog({
	open,
	onClose,
	onStartExport,
	progress,
	phase,
	completed,
	error,
	outputPath,
	onRevealFile,
}: ExportDialogProps) {
	const [format, setFormat] = useState<ExportFormat>("mp4");
	const [quality, setQuality] = useState<ExportQuality>("standard");
	const [resolution, setResolution] = useState<ExportResolution>("1080p");

	const isExporting = progress !== null && !completed && !error;

	const handleExport = useCallback(() => {
		onStartExport({ format, quality, resolution });
	}, [format, quality, resolution, onStartExport]);

	if (!open) return null;

	return (
		<div className="export-overlay animate-fade-in" onClick={onClose}>
			<div className="export-dialog glass-panel animate-scale-bounce" onClick={(e) => e.stopPropagation()}>
				{/* Header */}
				<div className="export-header">
					<h3 className="export-title">Export Video</h3>
					<button className="btn btn--ghost btn--icon-sm" onClick={onClose} type="button">
						<X size={16} />
					</button>
				</div>

				{/* Completed State */}
				{completed && (
					<div className="export-success">
						<CheckCircle2 size={40} className="export-success-icon" />
						<h4>Export Complete!</h4>
						<p>Your video has been exported successfully.</p>
						{outputPath && onRevealFile && (
							<button className="btn btn--secondary btn--sm" onClick={() => onRevealFile(outputPath)} type="button">
								Show in Folder
							</button>
						)}
						<button className="btn btn--gradient btn--md" onClick={onClose} type="button">
							Done
						</button>
					</div>
				)}

				{/* Error State */}
				{error && (
					<div className="export-error">
						<AlertCircle size={40} className="export-error-icon" />
						<h4>Export Failed</h4>
						<p>{error}</p>
						<button className="btn btn--secondary btn--md" onClick={onClose} type="button">
							Close
						</button>
					</div>
				)}

				{/* Export Progress */}
				{isExporting && (
					<div className="export-progress-view">
						<Loader2 size={32} className="export-spinner" />
						<h4>{phase || "Exporting..."}</h4>
						<div className="export-progress-bar">
							<div className="export-progress-fill" style={{ width: `${progress}%` }} />
						</div>
						<span className="export-progress-label">{Math.round(progress!)}%</span>
					</div>
				)}

				{/* Settings (only when not exporting) */}
				{!isExporting && !completed && !error && (
					<>
						<div className="export-options">
							{/* Format */}
							<div className="export-group">
								<label className="export-label">Format</label>
								<div className="export-chips">
									{(["mp4", "gif", "webm"] as const).map((f) => (
										<button
											key={f}
											className={`export-chip ${format === f ? "export-chip--active" : ""}`}
											onClick={() => setFormat(f)}
											type="button"
										>
											{f.toUpperCase()}
										</button>
									))}
								</div>
							</div>

							{/* Quality */}
							<div className="export-group">
								<label className="export-label">Quality</label>
								<div className="export-chips">
									{(["draft", "standard", "high", "ultra"] as const).map((q) => (
										<button
											key={q}
											className={`export-chip ${quality === q ? "export-chip--active" : ""}`}
											onClick={() => setQuality(q)}
											type="button"
										>
											{q.charAt(0).toUpperCase() + q.slice(1)}
										</button>
									))}
								</div>
							</div>

							{/* Resolution */}
							{format !== "gif" && (
								<div className="export-group">
									<label className="export-label">Resolution</label>
									<div className="export-chips">
										{(["720p", "1080p", "1440p", "4k"] as const).map((r) => (
											<button
												key={r}
												className={`export-chip ${resolution === r ? "export-chip--active" : ""}`}
												onClick={() => setResolution(r)}
												type="button"
											>
												{r}
											</button>
										))}
									</div>
								</div>
							)}
						</div>

						{/* Actions */}
						<div className="export-actions">
							<button className="btn btn--secondary btn--md" onClick={onClose} type="button">
								Cancel
							</button>
							<button className="btn btn--gradient btn--md" onClick={handleExport} type="button">
								<Download size={16} />
								Start Export
							</button>
						</div>
					</>
				)}
			</div>
		</div>
	);
}
