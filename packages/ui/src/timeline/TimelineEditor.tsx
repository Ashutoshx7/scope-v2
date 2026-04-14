// ============================================================================
// Timeline Editor — Multi-track timeline with ruler, waveform, and playhead
// ============================================================================

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import {
	FastForward,
	Focus,
	Music,
	Paintbrush,
	Scissors,
	ZoomIn,
} from "lucide-react";
import { TimelineTrack, type TimelineRegion } from "./TimelineTrack.js";
import "./Timeline.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TimelineEditorProps {
	/** Total duration of the video in ms. */
	totalDurationMs: number;
	/** Current playhead position in ms. */
	playheadMs: number;
	/** Whether the video is currently playing. */
	playing: boolean;

	/** Zoom regions. */
	zoomRegions: TimelineRegion[];
	/** Trim regions. */
	trimRegions: TimelineRegion[];
	/** Speed regions. */
	speedRegions: TimelineRegion[];
	/** Annotation regions. */
	annotationRegions: TimelineRegion[];

	/** Audio waveform amplitudes (0–1), one per bucket. */
	waveformData?: Float32Array;

	// Callbacks
	onSeek?: (timeMs: number) => void;
	onPlayPause?: () => void;
	onZoomRegionChange?: (id: string, startMs: number, endMs: number) => void;
	onZoomRegionCreate?: (startMs: number, endMs: number) => void;
	onZoomRegionDelete?: (id: string) => void;
	onTrimRegionChange?: (id: string, startMs: number, endMs: number) => void;
	onTrimRegionCreate?: (startMs: number, endMs: number) => void;
	onTrimRegionDelete?: (id: string) => void;
	onSpeedRegionChange?: (id: string, startMs: number, endMs: number) => void;
	onSpeedRegionCreate?: (startMs: number, endMs: number) => void;
	onSpeedRegionDelete?: (id: string) => void;
	onAnnotationRegionChange?: (id: string, startMs: number, endMs: number) => void;
	onAnnotationRegionSelect?: (id: string | null) => void;
	selectedAnnotationId?: string | null;
}

// ---------------------------------------------------------------------------
// Timeline Ruler
// ---------------------------------------------------------------------------

function TimelineRuler({
	totalDurationMs,
	playheadMs,
	onSeek,
}: {
	totalDurationMs: number;
	playheadMs: number;
	onSeek?: (timeMs: number) => void;
}) {
	const rulerRef = useRef<HTMLDivElement>(null);

	const handleClick = useCallback(
		(e: React.MouseEvent) => {
			if (!rulerRef.current || !onSeek) return;
			const rect = rulerRef.current.getBoundingClientRect();
			const x = e.clientX - rect.left;
			const ratio = x / rect.width;
			onSeek(ratio * totalDurationMs);
		},
		[totalDurationMs, onSeek],
	);

	// Generate time markers
	const markers = useMemo(() => {
		const totalSeconds = totalDurationMs / 1000;
		const interval = totalSeconds <= 30 ? 5 : totalSeconds <= 120 ? 10 : 30;
		const result: Array<{ ms: number; label: string }> = [];

		for (let s = 0; s <= totalSeconds; s += interval) {
			const mins = Math.floor(s / 60);
			const secs = s % 60;
			result.push({
				ms: s * 1000,
				label: `${mins}:${secs.toString().padStart(2, "0")}`,
			});
		}

		return result;
	}, [totalDurationMs]);

	const playheadPercent = totalDurationMs > 0 ? (playheadMs / totalDurationMs) * 100 : 0;

	return (
		<div className="tl-ruler" ref={rulerRef} onClick={handleClick}>
			{markers.map((m) => (
				<div
					key={m.ms}
					className="tl-ruler-marker"
					style={{ left: `${(m.ms / totalDurationMs) * 100}%` }}
				>
					<span className="tl-ruler-label">{m.label}</span>
					<div className="tl-ruler-tick" />
				</div>
			))}
			<div className="tl-ruler-playhead" style={{ left: `${playheadPercent}%` }}>
				<div className="tl-ruler-playhead-head" />
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Waveform Display
// ---------------------------------------------------------------------------

function WaveformDisplay({
	data,
	totalDurationMs,
	height = 40,
}: {
	data: Float32Array;
	totalDurationMs: number;
	height?: number;
}) {
	const barCount = data.length;
	if (barCount === 0) return null;

	return (
		<div className="tl-waveform" style={{ height }}>
			<svg
				viewBox={`0 0 ${barCount} ${height}`}
				preserveAspectRatio="none"
				className="tl-waveform-svg"
			>
				{Array.from(data).map((amplitude, i) => {
					const barHeight = Math.max(1, amplitude * height * 0.9);
					const y = (height - barHeight) / 2;
					return (
						<rect
							key={i}
							x={i}
							y={y}
							width={0.7}
							height={barHeight}
							rx={0.3}
							className="tl-waveform-bar"
						/>
					);
				})}
			</svg>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TimelineEditor({
	totalDurationMs,
	playheadMs,
	playing,
	zoomRegions,
	trimRegions,
	speedRegions,
	annotationRegions,
	waveformData,
	onSeek,
	onPlayPause,
	onZoomRegionChange,
	onZoomRegionCreate,
	onZoomRegionDelete,
	onTrimRegionChange,
	onTrimRegionCreate,
	onTrimRegionDelete,
	onSpeedRegionChange,
	onSpeedRegionCreate,
	onSpeedRegionDelete,
	onAnnotationRegionChange,
	onAnnotationRegionSelect,
	selectedAnnotationId,
}: TimelineEditorProps) {
	const [selectedTrack, setSelectedTrack] = useState<string | null>(null);
	const [selectedZoomId, setSelectedZoomId] = useState<string | null>(null);
	const [selectedTrimId, setSelectedTrimId] = useState<string | null>(null);
	const [selectedSpeedId, setSelectedSpeedId] = useState<string | null>(null);

	return (
		<div className="tl-editor">
			{/* Ruler */}
			<div className="tl-ruler-container">
				<div className="tl-track-label" />
				<TimelineRuler
					totalDurationMs={totalDurationMs}
					playheadMs={playheadMs}
					onSeek={onSeek}
				/>
			</div>

			{/* Waveform */}
			{waveformData && waveformData.length > 0 && (
				<div className="tl-waveform-container">
					<div className="tl-track-label">
						<span className="tl-track-icon"><Music size={12} /></span>
						<span className="tl-track-label-text">Audio</span>
					</div>
					<WaveformDisplay data={waveformData} totalDurationMs={totalDurationMs} />
				</div>
			)}

			{/* Tracks */}
			<div className="tl-tracks">
				{/* Zoom Track */}
				<TimelineTrack
					label="Zoom"
					icon={<ZoomIn size={12} />}
					totalDurationMs={totalDurationMs}
					regions={zoomRegions}
					regionColor="hsla(186, 94%, 45%, 0.6)"
					playheadMs={playheadMs}
					editable={true}
					onRegionChange={onZoomRegionChange}
					onCreateRegion={onZoomRegionCreate}
					onDeleteRegion={onZoomRegionDelete}
					onSelectRegion={setSelectedZoomId}
					selectedRegionId={selectedZoomId}
					height={28}
				/>

				{/* Trim Track */}
				<TimelineTrack
					label="Trim"
					icon={<Scissors size={12} />}
					totalDurationMs={totalDurationMs}
					regions={trimRegions}
					regionColor="hsla(350, 85%, 48%, 0.5)"
					playheadMs={playheadMs}
					editable={true}
					onRegionChange={onTrimRegionChange}
					onCreateRegion={onTrimRegionCreate}
					onDeleteRegion={onTrimRegionDelete}
					onSelectRegion={setSelectedTrimId}
					selectedRegionId={selectedTrimId}
					height={28}
				/>

				{/* Speed Track */}
				<TimelineTrack
					label="Speed"
					icon={<FastForward size={12} />}
					totalDurationMs={totalDurationMs}
					regions={speedRegions}
					regionColor="hsla(38, 95%, 45%, 0.5)"
					playheadMs={playheadMs}
					editable={true}
					onRegionChange={onSpeedRegionChange}
					onCreateRegion={onSpeedRegionCreate}
					onDeleteRegion={onSpeedRegionDelete}
					onSelectRegion={setSelectedSpeedId}
					selectedRegionId={selectedSpeedId}
					height={28}
				/>

				{/* Annotation Track */}
				<TimelineTrack
					label="Notes"
					icon={<Paintbrush size={12} />}
					totalDurationMs={totalDurationMs}
					regions={annotationRegions}
					regionColor="hsla(252, 87%, 52%, 0.5)"
					playheadMs={playheadMs}
					editable={true}
					onRegionChange={onAnnotationRegionChange}
					onSelectRegion={onAnnotationRegionSelect}
					selectedRegionId={selectedAnnotationId}
					height={28}
				/>
			</div>
		</div>
	);
}
