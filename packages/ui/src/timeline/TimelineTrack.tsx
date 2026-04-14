// ============================================================================
// Timeline Track — Core horizontal track with draggable regions
//
// Renders a single horizontal track (zoom, trim, speed, or annotation)
// with draggable/resizable regions and a playhead indicator.
// ============================================================================

import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import "./Timeline.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TimelineRegion {
	id: string;
	startMs: number;
	endMs: number;
	color?: string;
	label?: string;
	/** Tooltip content when hovering. */
	tooltip?: string;
}

export interface TimelineTrackProps {
	/** Track label shown on the left. */
	label: string;
	/** Track icon (React node). */
	icon?: ReactNode;
	/** Total duration of the video in ms. */
	totalDurationMs: number;
	/** Regions to render on this track. */
	regions: TimelineRegion[];
	/** Default color for regions without a specific color. */
	regionColor?: string;
	/** Current playhead position in ms. */
	playheadMs: number;
	/** Visible range start (for zoom-to-fit). */
	viewStartMs?: number;
	/** Visible range end (for zoom-to-fit). */
	viewEndMs?: number;
	/** Pixel height of the track. */
	height?: number;
	/** Whether regions can be dragged/resized. */
	editable?: boolean;
	/** Called when a region is moved or resized. */
	onRegionChange?: (regionId: string, startMs: number, endMs: number) => void;
	/** Called when the user clicks on empty space to create a region. */
	onCreateRegion?: (startMs: number, endMs: number) => void;
	/** Called when a region is selected. */
	onSelectRegion?: (regionId: string | null) => void;
	/** Called when a region should be deleted. */
	onDeleteRegion?: (regionId: string) => void;
	/** Currently selected region ID. */
	selectedRegionId?: string | null;
	/** Whether to show snap guides. */
	showSnap?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_REGION_WIDTH_PX = 8;
const SNAP_THRESHOLD_PX = 6;
const RESIZE_HANDLE_WIDTH_PX = 6;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TimelineTrack({
	label,
	icon,
	totalDurationMs,
	regions,
	regionColor = "var(--color-primary-500)",
	playheadMs,
	viewStartMs = 0,
	viewEndMs,
	height = 32,
	editable = true,
	onRegionChange,
	onCreateRegion,
	onSelectRegion,
	onDeleteRegion,
	selectedRegionId,
	showSnap = true,
}: TimelineTrackProps) {
	const trackRef = useRef<HTMLDivElement>(null);
	const [dragState, setDragState] = useState<{
		type: "move" | "resize-start" | "resize-end" | "create";
		regionId?: string;
		startX: number;
		startMs: number;
		endMs: number;
		originalStartMs: number;
		originalEndMs: number;
	} | null>(null);

	const effectiveViewEnd = viewEndMs ?? totalDurationMs;
	const viewDuration = effectiveViewEnd - viewStartMs;

	// Convert ms to pixel position
	const msToPixel = useCallback(
		(ms: number): number => {
			if (!trackRef.current || viewDuration <= 0) return 0;
			const width = trackRef.current.clientWidth;
			return ((ms - viewStartMs) / viewDuration) * width;
		},
		[viewStartMs, viewDuration],
	);

	// Convert pixel position to ms
	const pixelToMs = useCallback(
		(px: number): number => {
			if (!trackRef.current || viewDuration <= 0) return 0;
			const width = trackRef.current.clientWidth;
			return viewStartMs + (px / width) * viewDuration;
		},
		[viewStartMs, viewDuration],
	);

	// Mouse down on empty track — start creating a region
	const handleTrackMouseDown = useCallback(
		(e: MouseEvent) => {
			if (!editable || !trackRef.current) return;

			const rect = trackRef.current.getBoundingClientRect();
			const x = e.clientX - rect.left;
			const ms = pixelToMs(x);

			// Check if clicking on a region
			const clickedRegion = regions.find((r) => {
				const startPx = msToPixel(r.startMs);
				const endPx = msToPixel(r.endMs);
				return x >= startPx && x <= endPx;
			});

			if (clickedRegion) return; // Handled by region mouse down

			// Start creating a new region
			if (onCreateRegion) {
				setDragState({
					type: "create",
					startX: x,
					startMs: ms,
					endMs: ms,
					originalStartMs: ms,
					originalEndMs: ms,
				});
			}

			onSelectRegion?.(null);
		},
		[editable, pixelToMs, msToPixel, regions, onCreateRegion, onSelectRegion],
	);

	// Mouse down on a region
	const handleRegionMouseDown = useCallback(
		(e: MouseEvent, region: TimelineRegion, type: "move" | "resize-start" | "resize-end") => {
			e.stopPropagation();
			if (!editable || !trackRef.current) return;

			const rect = trackRef.current.getBoundingClientRect();
			const x = e.clientX - rect.left;

			setDragState({
				type,
				regionId: region.id,
				startX: x,
				startMs: region.startMs,
				endMs: region.endMs,
				originalStartMs: region.startMs,
				originalEndMs: region.endMs,
			});

			onSelectRegion?.(region.id);
		},
		[editable, onSelectRegion],
	);

	// Mouse move — drag/resize/create
	useEffect(() => {
		if (!dragState) return;

		const handleMouseMove = (e: globalThis.MouseEvent) => {
			if (!trackRef.current) return;
			const rect = trackRef.current.getBoundingClientRect();
			const x = e.clientX - rect.left;
			const deltaMs = pixelToMs(x) - pixelToMs(dragState.startX);

			switch (dragState.type) {
				case "move": {
					const duration = dragState.originalEndMs - dragState.originalStartMs;
					let newStart = dragState.originalStartMs + deltaMs;
					let newEnd = newStart + duration;
					// Clamp
					if (newStart < 0) {
						newStart = 0;
						newEnd = duration;
					}
					if (newEnd > totalDurationMs) {
						newEnd = totalDurationMs;
						newStart = newEnd - duration;
					}
					setDragState((prev) =>
						prev ? { ...prev, startMs: newStart, endMs: newEnd } : null,
					);
					break;
				}
				case "resize-start": {
					const newStart = Math.max(0, Math.min(dragState.originalStartMs + deltaMs, dragState.endMs - 100));
					setDragState((prev) =>
						prev ? { ...prev, startMs: newStart } : null,
					);
					break;
				}
				case "resize-end": {
					const newEnd = Math.min(totalDurationMs, Math.max(dragState.originalEndMs + deltaMs, dragState.startMs + 100));
					setDragState((prev) =>
						prev ? { ...prev, endMs: newEnd } : null,
					);
					break;
				}
				case "create": {
					const ms = pixelToMs(x);
					setDragState((prev) =>
						prev
							? {
									...prev,
									startMs: Math.min(prev.originalStartMs, ms),
									endMs: Math.max(prev.originalStartMs, ms),
								}
							: null,
					);
					break;
				}
			}
		};

		const handleMouseUp = () => {
			if (!dragState) return;

			if (dragState.type === "create" && onCreateRegion) {
				const duration = dragState.endMs - dragState.startMs;
				if (duration > 200) {
					onCreateRegion(dragState.startMs, dragState.endMs);
				}
			} else if (dragState.regionId && onRegionChange) {
				onRegionChange(dragState.regionId, dragState.startMs, dragState.endMs);
			}

			setDragState(null);
		};

		document.addEventListener("mousemove", handleMouseMove);
		document.addEventListener("mouseup", handleMouseUp);
		return () => {
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);
		};
	}, [dragState, pixelToMs, totalDurationMs, onRegionChange, onCreateRegion]);

	// Handle keyboard delete
	useEffect(() => {
		if (!selectedRegionId || !onDeleteRegion) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Delete" || e.key === "Backspace") {
				onDeleteRegion(selectedRegionId);
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [selectedRegionId, onDeleteRegion]);

	// Get the regions to render (use drag state for live updates)
	const renderRegions = regions.map((r) => {
		if (dragState?.regionId === r.id) {
			return { ...r, startMs: dragState.startMs, endMs: dragState.endMs };
		}
		return r;
	});

	// Playhead position
	const playheadX = msToPixel(playheadMs);

	return (
		<div className="tl-track" style={{ height }}>
			{/* Track Label */}
			<div className="tl-track-label">
				{icon && <span className="tl-track-icon">{icon}</span>}
				<span className="tl-track-label-text">{label}</span>
			</div>

			{/* Track Body */}
			<div
				ref={trackRef}
				className={`tl-track-body ${dragState ? "tl-track-body--dragging" : ""}`}
				onMouseDown={handleTrackMouseDown}
			>
				{/* Regions */}
				{renderRegions.map((region) => {
					const left = msToPixel(region.startMs);
					const width = msToPixel(region.endMs) - left;
					const isSelected = selectedRegionId === region.id;
					const color = region.color || regionColor;

					return (
						<div
							key={region.id}
							className={`tl-region ${isSelected ? "tl-region--selected" : ""}`}
							style={{
								left: `${left}px`,
								width: `${Math.max(width, MIN_REGION_WIDTH_PX)}px`,
								backgroundColor: color,
								borderColor: isSelected ? "white" : "transparent",
							}}
							onMouseDown={(e) => handleRegionMouseDown(e, region, "move")}
							title={region.tooltip || region.label}
						>
							{/* Resize handles */}
							{editable && (
								<>
									<div
										className="tl-region-handle tl-region-handle--start"
										onMouseDown={(e) => handleRegionMouseDown(e, region, "resize-start")}
									/>
									<div
										className="tl-region-handle tl-region-handle--end"
										onMouseDown={(e) => handleRegionMouseDown(e, region, "resize-end")}
									/>
								</>
							)}

							{/* Label */}
							{region.label && width > 40 && (
								<span className="tl-region-label">{region.label}</span>
							)}
						</div>
					);
				})}

				{/* Create preview */}
				{dragState?.type === "create" && (
					<div
						className="tl-region tl-region--creating"
						style={{
							left: `${msToPixel(dragState.startMs)}px`,
							width: `${Math.max(msToPixel(dragState.endMs) - msToPixel(dragState.startMs), 2)}px`,
							backgroundColor: regionColor,
						}}
					/>
				)}

				{/* Playhead */}
				<div
					className="tl-playhead"
					style={{ left: `${playheadX}px` }}
				/>
			</div>
		</div>
	);
}
