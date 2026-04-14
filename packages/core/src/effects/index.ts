export { CursorEffectsRenderer } from "../cursor/CursorEffects.js";
export type { CursorEffectsConfig, ClickEvent } from "../cursor/CursorEffects.js";

export {
	applyEasing,
	calculateZoomTransition,
	drawTransitionEffect,
	DEFAULT_TRANSITION,
} from "./TransitionEffects.js";
export type { TransitionCurve, TransitionConfig } from "./TransitionEffects.js";

export { suggestZoomRegions } from "./AutoZoom.js";
export type { AutoZoomConfig } from "./AutoZoom.js";
