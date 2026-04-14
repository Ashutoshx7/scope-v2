// ============================================================================
// Audio Panel — Volume, background music, noise reduction
// ============================================================================

import { useCallback, useRef } from "react";
import { Music, Upload, Volume2, VolumeX } from "lucide-react";
import "./Panels.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AudioTrackItem {
	id: string;
	label: string;
	volume: number;
	muted: boolean;
}

export interface AudioPanelProps {
	tracks: AudioTrackItem[];
	onTrackVolumeChange: (trackId: string, volume: number) => void;
	onTrackMuteToggle: (trackId: string) => void;
	onAddBackgroundMusic?: () => void;
	noiseReduction: boolean;
	onNoiseReductionToggle: (enabled: boolean) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AudioPanel({
	tracks,
	onTrackVolumeChange,
	onTrackMuteToggle,
	onAddBackgroundMusic,
	noiseReduction,
	onNoiseReductionToggle,
}: AudioPanelProps) {
	return (
		<div className="panel">
			<h3 className="panel-title">Audio</h3>

			{/* Tracks */}
			<div className="panel-section">
				<span className="panel-label">Audio Tracks</span>

				{tracks.length === 0 && (
					<p className="panel-empty">No audio tracks detected.</p>
				)}

				<div className="panel-list">
					{tracks.map((track) => (
						<div key={track.id} className="panel-audio-track">
							<button
								className={`panel-mute-btn ${track.muted ? "panel-mute-btn--muted" : ""}`}
								onClick={() => onTrackMuteToggle(track.id)}
								title={track.muted ? "Unmute" : "Mute"}
								type="button"
							>
								{track.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
							</button>
							<span className="panel-audio-label">{track.label}</span>
							<input
								type="range"
								min={0}
								max={100}
								value={track.muted ? 0 : Math.round(track.volume * 100)}
								onChange={(e) =>
									onTrackVolumeChange(track.id, parseInt(e.target.value, 10) / 100)
								}
								className="slider panel-audio-slider"
								disabled={track.muted}
							/>
							<span className="panel-value panel-audio-value">
								{track.muted ? "—" : `${Math.round(track.volume * 100)}%`}
							</span>
						</div>
					))}
				</div>
			</div>

			<div className="panel-divider" />

			{/* Background Music */}
			<div className="panel-section">
				<span className="panel-label">Background Music</span>
				<button
					className="panel-upload-zone panel-upload-zone--sm"
					onClick={onAddBackgroundMusic}
					type="button"
				>
					<Music size={18} />
					<span>Add background music</span>
					<span className="panel-upload-hint">MP3, WAV, OGG</span>
				</button>
			</div>

			<div className="panel-divider" />

			{/* Noise Reduction */}
			<div className="panel-section">
				<div className="panel-row panel-row--between">
					<span className="panel-label">Noise Reduction</span>
					<label className="switch">
						<input
							type="checkbox"
							checked={noiseReduction}
							onChange={(e) => onNoiseReductionToggle(e.target.checked)}
						/>
						<span className="switch-slider" />
					</label>
				</div>
				<p className="panel-hint">
					Reduces background noise from microphone recordings.
				</p>
			</div>
		</div>
	);
}
