// ============================================================================
// Transition Effects — Smooth transitions between zoom regions
//
// Applied by FrameRenderer during zoom in/out to add visual polish:
//   - Ease-in/out zoom with configurable curve
//   - Radial blur during zoom transition
//   - Scale + opacity flash on zoom snap
//   - Cross-fade between zoom levels
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TransitionCurve =
	| "linear"
	| "ease-in"
	| "ease-out"
	| "ease-in-out"
	| "spring"
	| "bounce";

export interface TransitionConfig {
	/** Duration of the transition in ms. */
	durationMs: number;
	/** Easing curve to use. */
	curve: TransitionCurve;
	/** Whether to apply a radial blur during zoom transitions. */
	radialBlur: boolean;
	/** Blur intensity (0–1). */
	blurIntensity: number;
	/** Whether to flash a subtle vignette on zoom snap. */
	flashOnSnap: boolean;
}

export const DEFAULT_TRANSITION: TransitionConfig = {
	durationMs: 300,
	curve: "ease-in-out",
	radialBlur: false,
	blurIntensity: 0.3,
	flashOnSnap: true,
};

// ---------------------------------------------------------------------------
// Easing Functions
// ---------------------------------------------------------------------------

export function applyEasing(t: number, curve: TransitionCurve): number {
	const clamped = Math.max(0, Math.min(1, t));

	switch (curve) {
		case "linear":
			return clamped;

		case "ease-in":
			return clamped * clamped * clamped;

		case "ease-out":
			return 1 - (1 - clamped) ** 3;

		case "ease-in-out":
			return clamped < 0.5
				? 4 * clamped * clamped * clamped
				: 1 - (-2 * clamped + 2) ** 3 / 2;

		case "spring": {
			const c4 = (2 * Math.PI) / 3;
			if (clamped === 0 || clamped === 1) return clamped;
			return -(2 ** (-10 * clamped)) * Math.sin((clamped * 10 - 0.75) * c4) + 1;
		}

		case "bounce": {
			const n1 = 7.5625;
			const d1 = 2.75;
			let x = clamped;
			if (x < 1 / d1) return n1 * x * x;
			if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
			if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
			return n1 * (x -= 2.625 / d1) * x + 0.984375;
		}

		default:
			return clamped;
	}
}

// ---------------------------------------------------------------------------
// Transition Calculator
// ---------------------------------------------------------------------------

/**
 * Calculates the current zoom interpolation factor considering
 * transition timing and easing.
 */
export function calculateZoomTransition(
	currentTimeMs: number,
	regionStartMs: number,
	regionEndMs: number,
	config: TransitionConfig = DEFAULT_TRANSITION,
): {
	/** Current zoom factor (0 = no zoom, 1 = full zoom depth). */
	zoomFactor: number;
	/** Phase: "entering" | "active" | "exiting" | "inactive". */
	phase: "entering" | "active" | "exiting" | "inactive";
	/** Transition progress for current phase (0–1). */
	phaseProgress: number;
} {
	const { durationMs, curve } = config;

	// Before region
	if (currentTimeMs < regionStartMs) {
		return { zoomFactor: 0, phase: "inactive", phaseProgress: 0 };
	}

	// After region
	if (currentTimeMs > regionEndMs) {
		return { zoomFactor: 0, phase: "inactive", phaseProgress: 1 };
	}

	const elapsed = currentTimeMs - regionStartMs;
	const remaining = regionEndMs - currentTimeMs;

	// Entering transition
	if (elapsed < durationMs) {
		const t = elapsed / durationMs;
		const easedT = applyEasing(t, curve);
		return { zoomFactor: easedT, phase: "entering", phaseProgress: t };
	}

	// Exiting transition
	if (remaining < durationMs) {
		const t = remaining / durationMs;
		const easedT = applyEasing(t, curve);
		return { zoomFactor: easedT, phase: "exiting", phaseProgress: 1 - t };
	}

	// Fully active
	return { zoomFactor: 1, phase: "active", phaseProgress: 1 };
}

/**
 * Draws a radial blur vignette effect on the canvas during zoom transitions.
 */
export function drawTransitionEffect(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	phase: "entering" | "exiting",
	progress: number,
	config: TransitionConfig = DEFAULT_TRANSITION,
): void {
	if (!config.radialBlur && !config.flashOnSnap) return;

	const centerX = width / 2;
	const centerY = height / 2;

	// Vignette darkening during transition
	if (config.radialBlur && progress > 0 && progress < 1) {
		const intensity = config.blurIntensity * Math.sin(progress * Math.PI);

		ctx.save();
		const gradient = ctx.createRadialGradient(
			centerX, centerY, Math.min(width, height) * 0.3,
			centerX, centerY, Math.max(width, height) * 0.7,
		);
		gradient.addColorStop(0, "transparent");
		gradient.addColorStop(1, `rgba(0, 0, 0, ${intensity * 0.4})`);

		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, width, height);
		ctx.restore();
	}

	// Flash on snap (brief white overlay at the moment of full zoom)
	if (config.flashOnSnap) {
		let flashIntensity = 0;
		if (phase === "entering" && progress > 0.85 && progress < 1) {
			flashIntensity = (1 - Math.abs(progress - 0.92) / 0.08) * 0.08;
		}

		if (flashIntensity > 0) {
			ctx.save();
			ctx.globalAlpha = flashIntensity;
			ctx.fillStyle = "white";
			ctx.fillRect(0, 0, width, height);
			ctx.restore();
		}
	}
}
