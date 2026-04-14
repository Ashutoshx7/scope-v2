// ============================================================================
// Cursor Effects Renderer — Highlight, click visualization, trail
//
// Applied during export by FrameRenderer. Reads cursor telemetry
// and click events to draw effects on top of the composited frame.
// ============================================================================

import { clamp, type CursorTelemetryPoint } from "../types/index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CursorEffectsConfig {
	/** Whether to draw a highlight circle around the cursor. */
	highlight: boolean;
	/** Highlight radius in pixels. */
	highlightRadius?: number;
	/** Highlight color. */
	highlightColor?: string;
	/** Highlight opacity (0–1). */
	highlightOpacity?: number;

	/** Whether to show click ripple effects. */
	clickVisualization: boolean;
	/** Click ripple color. */
	clickColor?: string;
	/** Click ripple max radius. */
	clickMaxRadius?: number;
	/** Click ripple duration in ms. */
	clickDurationMs?: number;

	/** Whether to draw a motion trail. */
	trail: boolean;
	/** Trail length (number of past positions to connect). */
	trailLength?: number;
	/** Trail color. */
	trailColor?: string;
	/** Trail opacity. */
	trailOpacity?: number;
}

export interface ClickEvent {
	timeMs: number;
	cx: number;
	cy: number;
	button: "left" | "right" | "middle";
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: Required<CursorEffectsConfig> = {
	highlight: true,
	highlightRadius: 24,
	highlightColor: "rgba(108, 92, 231, 0.25)",
	highlightOpacity: 0.3,
	clickVisualization: true,
	clickColor: "rgba(108, 92, 231, 0.5)",
	clickMaxRadius: 40,
	clickDurationMs: 400,
	trail: false,
	trailLength: 15,
	trailColor: "rgba(108, 92, 231, 0.3)",
	trailOpacity: 0.2,
};

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export class CursorEffectsRenderer {
	private config: Required<CursorEffectsConfig>;
	private telemetry: CursorTelemetryPoint[] = [];
	private clicks: ClickEvent[] = [];
	private canvasWidth = 0;
	private canvasHeight = 0;

	constructor(config?: Partial<CursorEffectsConfig>) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	/**
	 * Sets the cursor telemetry data.
	 */
	setTelemetry(telemetry: CursorTelemetryPoint[]): void {
		this.telemetry = telemetry;
	}

	/**
	 * Sets the click events.
	 */
	setClicks(clicks: ClickEvent[]): void {
		this.clicks = clicks;
	}

	/**
	 * Sets the canvas dimensions for coordinate mapping.
	 */
	setCanvasSize(width: number, height: number): void {
		this.canvasWidth = width;
		this.canvasHeight = height;
	}

	/**
	 * Renders cursor effects onto the canvas context at the given time.
	 */
	render(ctx: CanvasRenderingContext2D, timeMs: number): void {
		if (this.telemetry.length === 0) return;

		// Find current cursor position via interpolation
		const pos = this.interpolatePosition(timeMs);
		if (!pos) return;

		const px = pos.cx * this.canvasWidth;
		const py = pos.cy * this.canvasHeight;

		// Draw trail
		if (this.config.trail) {
			this.drawTrail(ctx, timeMs);
		}

		// Draw highlight
		if (this.config.highlight) {
			this.drawHighlight(ctx, px, py);
		}

		// Draw click ripples
		if (this.config.clickVisualization) {
			this.drawClickRipples(ctx, timeMs);
		}
	}

	// -----------------------------------------------------------------------
	// Effects
	// -----------------------------------------------------------------------

	private drawHighlight(ctx: CanvasRenderingContext2D, x: number, y: number): void {
		const { highlightRadius, highlightColor, highlightOpacity } = this.config;

		ctx.save();
		ctx.globalAlpha = highlightOpacity;

		// Outer glow
		const gradient = ctx.createRadialGradient(x, y, 0, x, y, highlightRadius);
		gradient.addColorStop(0, highlightColor);
		gradient.addColorStop(0.7, highlightColor);
		gradient.addColorStop(1, "transparent");

		ctx.fillStyle = gradient;
		ctx.beginPath();
		ctx.arc(x, y, highlightRadius, 0, Math.PI * 2);
		ctx.fill();

		// Inner bright spot
		ctx.globalAlpha = highlightOpacity * 1.5;
		const inner = ctx.createRadialGradient(x, y, 0, x, y, 4);
		inner.addColorStop(0, "rgba(255, 255, 255, 0.8)");
		inner.addColorStop(1, "transparent");
		ctx.fillStyle = inner;
		ctx.beginPath();
		ctx.arc(x, y, 4, 0, Math.PI * 2);
		ctx.fill();

		ctx.restore();
	}

	private drawClickRipples(ctx: CanvasRenderingContext2D, timeMs: number): void {
		const { clickColor, clickMaxRadius, clickDurationMs } = this.config;

		for (const click of this.clicks) {
			const elapsed = timeMs - click.timeMs;
			if (elapsed < 0 || elapsed > clickDurationMs) continue;

			const progress = elapsed / clickDurationMs;
			const radius = clickMaxRadius * easeOutCubic(progress);
			const opacity = 1 - easeOutCubic(progress);

			const cx = click.cx * this.canvasWidth;
			const cy = click.cy * this.canvasHeight;

			ctx.save();
			ctx.globalAlpha = opacity * 0.6;

			// Ripple ring
			ctx.strokeStyle = clickColor;
			ctx.lineWidth = 2.5 * (1 - progress);
			ctx.beginPath();
			ctx.arc(cx, cy, radius, 0, Math.PI * 2);
			ctx.stroke();

			// Filled center
			if (progress < 0.3) {
				ctx.globalAlpha = (1 - progress / 0.3) * 0.3;
				ctx.fillStyle = clickColor;
				ctx.beginPath();
				ctx.arc(cx, cy, radius * 0.3, 0, Math.PI * 2);
				ctx.fill();
			}

			ctx.restore();
		}
	}

	private drawTrail(ctx: CanvasRenderingContext2D, timeMs: number): void {
		const { trailLength, trailColor, trailOpacity } = this.config;

		// Get recent positions
		const positions: Array<{ cx: number; cy: number }> = [];
		const sampleInterval = 50; // ms between trail points

		for (let i = 0; i < trailLength; i++) {
			const t = timeMs - i * sampleInterval;
			const pos = this.interpolatePosition(t);
			if (pos) positions.push(pos);
		}

		if (positions.length < 2) return;

		ctx.save();
		ctx.lineCap = "round";
		ctx.lineJoin = "round";

		for (let i = 1; i < positions.length; i++) {
			const alpha = trailOpacity * (1 - i / positions.length);
			const width = 3 * (1 - i / positions.length);

			ctx.globalAlpha = alpha;
			ctx.strokeStyle = trailColor;
			ctx.lineWidth = width;

			ctx.beginPath();
			ctx.moveTo(
				positions[i - 1].cx * this.canvasWidth,
				positions[i - 1].cy * this.canvasHeight,
			);
			ctx.lineTo(
				positions[i].cx * this.canvasWidth,
				positions[i].cy * this.canvasHeight,
			);
			ctx.stroke();
		}

		ctx.restore();
	}

	// -----------------------------------------------------------------------
	// Position Interpolation
	// -----------------------------------------------------------------------

	private interpolatePosition(timeMs: number): { cx: number; cy: number } | null {
		if (this.telemetry.length === 0) return null;

		// Binary search for surrounding samples
		let lo = 0;
		let hi = this.telemetry.length - 1;

		if (timeMs <= this.telemetry[0].timeMs) {
			return { cx: this.telemetry[0].cx, cy: this.telemetry[0].cy };
		}
		if (timeMs >= this.telemetry[hi].timeMs) {
			return { cx: this.telemetry[hi].cx, cy: this.telemetry[hi].cy };
		}

		while (lo < hi - 1) {
			const mid = (lo + hi) >> 1;
			if (this.telemetry[mid].timeMs <= timeMs) {
				lo = mid;
			} else {
				hi = mid;
			}
		}

		const a = this.telemetry[lo];
		const b = this.telemetry[hi];
		const dt = b.timeMs - a.timeMs;
		const t = dt > 0 ? (timeMs - a.timeMs) / dt : 0;

		return {
			cx: a.cx + (b.cx - a.cx) * t,
			cy: a.cy + (b.cy - a.cy) * t,
		};
	}
}

// ---------------------------------------------------------------------------
// Easing
// ---------------------------------------------------------------------------

function easeOutCubic(t: number): number {
	return 1 - (1 - t) ** 3;
}
