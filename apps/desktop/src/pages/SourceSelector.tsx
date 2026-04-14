// ============================================================================
// Source Selector — Floating picker for screens and windows
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { AppWindow, Check, Monitor, RefreshCw } from "lucide-react";
import "./SourceSelector.css";

interface DesktopSource {
	id: string;
	name: string;
	display_id: string;
	thumbnail: string | null;
	appIcon: string | null;
}

export function SourceSelector() {
	const [sources, setSources] = useState<DesktopSource[]>([]);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [activeTab, setActiveTab] = useState<"screens" | "windows">("screens");
	const [loading, setLoading] = useState(true);

	const loadSources = useCallback(async () => {
		setLoading(true);
		try {
			const result = await window.electronAPI?.getSources({
				types: ["window", "screen"],
				thumbnailSize: { width: 320, height: 180 },
			});
			if (result) {
				setSources(result);
			}
		} catch (error) {
			console.error("Failed to load sources:", error);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		loadSources();
	}, [loadSources]);

	const screens = sources.filter((s) => s.id.startsWith("screen:"));
	const windows = sources.filter((s) => s.id.startsWith("window:"));
	const displayedSources = activeTab === "screens" ? screens : windows;

	const handleSelect = useCallback(
		async (source: DesktopSource) => {
			setSelectedId(source.id);
			await window.electronAPI?.selectSource(source);
		},
		[],
	);

	return (
		<div className="source-selector glass-panel glass-panel--floating animate-fade-in-scale">
			{/* Header */}
			<div className="source-header">
				<h2 className="source-title">Select Source</h2>
				<button
					className="hud-icon-btn titlebar-no-drag"
					onClick={loadSources}
					title="Refresh"
					type="button"
				>
					<RefreshCw size={14} className={loading ? "animate-spin" : ""} />
				</button>
			</div>

			{/* Tab Switcher */}
			<div className="tabs source-tabs">
				<button
					className={`tab ${activeTab === "screens" ? "tab--active" : ""}`}
					onClick={() => setActiveTab("screens")}
					type="button"
				>
					<Monitor size={14} />
					Screens ({screens.length})
				</button>
				<button
					className={`tab ${activeTab === "windows" ? "tab--active" : ""}`}
					onClick={() => setActiveTab("windows")}
					type="button"
				>
					<AppWindow size={14} />
					Windows ({windows.length})
				</button>
			</div>

			{/* Source Grid */}
			<div className="source-grid">
				{loading ? (
					<>
						<div className="source-item-skeleton shimmer" />
						<div className="source-item-skeleton shimmer delay-1" />
						<div className="source-item-skeleton shimmer delay-2" />
					</>
				) : displayedSources.length === 0 ? (
					<div className="source-empty">
						<p>No {activeTab} available</p>
					</div>
				) : (
					displayedSources.map((source, index) => (
						<button
							key={source.id}
							className={`source-item glass-card glass-panel--interactive animate-fade-in-up delay-${Math.min(index, 5)} ${
								selectedId === source.id ? "source-item--selected" : ""
							}`}
							onClick={() => handleSelect(source)}
							type="button"
						>
							{source.thumbnail ? (
								<img
									src={source.thumbnail}
									alt={source.name}
									className="source-thumbnail"
									draggable={false}
								/>
							) : (
								<div className="source-thumbnail source-thumbnail--placeholder">
									<Monitor size={32} />
								</div>
							)}
							<div className="source-info">
								{source.appIcon && (
									<img src={source.appIcon} alt="" className="source-app-icon" />
								)}
								<span className="source-name">{source.name}</span>
							</div>
							{selectedId === source.id && (
								<div className="source-check animate-pop">
									<Check size={14} />
								</div>
							)}
						</button>
					))
				)}
			</div>
		</div>
	);
}
