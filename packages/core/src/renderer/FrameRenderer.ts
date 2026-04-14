// ============================================================================
// Frame Renderer — Canvas-based video frame compositing
//
// Takes raw decoded video frames and composites them onto an output canvas
// with:
//   - Background (wallpaper, gradient, solid, custom image)
//   - Video padding and border radius
//   - Drop shadow
//   - Zoom and pan transforms
//   - Motion blur (frame accumulation)
//   - Crop region
//   - Webcam overlay (PiP, side-by-side, etc.)
//   - Annotations (text, shapes, blur, freehand)
// ============================================================================

import {
	ZOOM_DEPTH_SCALES,
	clamp,
	type AnnotationRegion,
	type BackgroundConfig,
	type CropRegion,
	type CursorTelemetryPoint,
	type SpeedRegion,
	type WebcamLayoutPreset,
	type WebcamMaskShape,
	type WebcamSizePreset,
	type WebcamPosition,
	type ZoomRegion,
} from "../types/index.js";
import {
	computeZoomFocus,
	computeZoomScale,
} from "../timeline/TimelineEngine.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FrameRendererConfig {
	/** Output canvas width. */
	width: number;
	/** Output canvas height. */
	height: number;
	/** Background config (wallpaper URL, gradient, or solid color). */
	wallpaper: string;
	/** Zoom regions for the timeline. */
	zoomRegions: ZoomRegion[];
	/** Whether to render a drop shadow behind the video. */
	showShadow: boolean;
	/** Shadow intensity (0–100). */
	shadowIntensity: number;
	/** Whether to apply motion blur. */
	showBlur: boolean;
	/** Motion blur strength (0–100). */
	motionBlurAmount?: number;
	/** Video corner radius in pixels. */
	borderRadius?: number;
	/** Padding around the video in pixels. */
	padding?: number;
	/** Crop region to apply. */
	cropRegion: CropRegion;
	/** Original video dimensions. */
	videoWidth: number;
	videoHeight: number;
	/** Webcam video dimensions (if available). */
	webcamSize?: { width: number; height: number } | null;
	/** Webcam layout preset. */
	webcamLayoutPreset?: WebcamLayoutPreset;
	/** Webcam mask shape. */
	webcamMaskShape?: WebcamMaskShape;
	/** Webcam size as percentage. */
	webcamSizePreset?: WebcamSizePreset;
	/** Custom webcam position. */
	webcamPosition?: WebcamPosition | null;
	/** Annotation regions to render. */
	annotationRegions?: AnnotationRegion[];
	/** Speed regions (for timestamp mapping). */
	speedRegions?: SpeedRegion[];
	/** Preview dimensions (for the editor viewport). */
	previewWidth?: number;
	previewHeight?: number;
	/** Cursor telemetry for auto-zoom. */
	cursorTelemetry?: CursorTelemetryPoint[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_BORDER_RADIUS = 12;
const DEFAULT_PADDING = 32;
const DEFAULT_SHADOW_INTENSITY = 50;

// ---------------------------------------------------------------------------
// FrameRenderer
// ---------------------------------------------------------------------------

export class FrameRenderer {
	private canvas: OffscreenCanvas | HTMLCanvasElement;
	private ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
	private config: FrameRendererConfig;
	private backgroundImage: ImageBitmap | null = null;
	private previousFrame: ImageData | null = null;
	private initialized = false;

	constructor(config: FrameRendererConfig) {
		this.config = config;

		// Prefer OffscreenCanvas for export (no DOM needed), HTMLCanvasElement for preview
		if (typeof OffscreenCanvas !== "undefined") {
			this.canvas = new OffscreenCanvas(config.width, config.height);
		} else {
			this.canvas = document.createElement("canvas");
			this.canvas.width = config.width;
			this.canvas.height = config.height;
		}

		const ctx = this.canvas.getContext("2d");
		if (!ctx) throw new Error("Failed to get 2D canvas context");
		this.ctx = ctx as OffscreenCanvasRenderingContext2D;
	}

	// -----------------------------------------------------------------------
	// Public API
	// -----------------------------------------------------------------------

	/**
	 * Performs any async initialization (e.g., loading background images).
	 */
	async initialize(): Promise<void> {
		if (this.initialized) return;

		// Load background image if wallpaper is a URL
		const bg = this.config.wallpaper;
		if (bg && !bg.startsWith("linear-gradient") && !bg.startsWith("radial-gradient") && !bg.startsWith("#") && !bg.startsWith("rgb")) {
			try {
				const response = await fetch(bg);
				const blob = await response.blob();
				this.backgroundImage = await createImageBitmap(blob);
			} catch (error) {
				console.warn("[FrameRenderer] Failed to load background:", error);
			}
		}

		this.initialized = true;
	}

	/**
	 * Renders a single frame with all effects applied.
	 *
	 * @param videoFrame - The decoded video frame
	 * @param sourceTimestampUs - The source timestamp in microseconds
	 * @param webcamFrame - Optional webcam frame to composite
	 */
	async renderFrame(
		videoFrame: VideoFrame,
		sourceTimestampUs: number,
		webcamFrame?: VideoFrame | null,
	): Promise<void> {
		const ctx = this.ctx;
		const { width, height } = this.config;
		const sourceMs = sourceTimestampUs / 1000;

		// 1. Clear canvas
		ctx.clearRect(0, 0, width, height);

		// 2. Draw background
		this.drawBackground(ctx, width, height);

		// 3. Calculate video placement with padding
		const padding = this.config.padding ?? DEFAULT_PADDING;
		const borderRadius = this.config.borderRadius ?? DEFAULT_BORDER_RADIUS;
		const cropRegion = this.config.cropRegion;

		// Available area for the video (after padding)
		const availW = width - padding * 2;
		const availH = height - padding * 2;

		// Compute crop-adjusted source dimensions
		const srcW = this.config.videoWidth * cropRegion.width;
		const srcH = this.config.videoHeight * cropRegion.height;

		// Fit video into available area maintaining aspect ratio
		const videoAspect = srcW / srcH;
		const areaAspect = availW / availH;

		let drawW: number;
		let drawH: number;

		if (videoAspect > areaAspect) {
			drawW = availW;
			drawH = availW / videoAspect;
		} else {
			drawH = availH;
			drawW = availH * videoAspect;
		}

		const drawX = (width - drawW) / 2;
		const drawY = (height - drawH) / 2;

		// 4. Apply zoom transform
		const zoomScale = computeZoomScale(sourceMs, this.config.zoomRegions);
		const zoomFocus = computeZoomFocus(
			sourceMs,
			this.config.zoomRegions,
			this.config.cursorTelemetry,
		);

		ctx.save();

		if (zoomScale !== 1) {
			// Translate to zoom focus point, scale, then translate back
			const focusX = drawX + drawW * zoomFocus.cx;
			const focusY = drawY + drawH * zoomFocus.cy;

			ctx.translate(focusX, focusY);
			ctx.scale(zoomScale, zoomScale);
			ctx.translate(-focusX, -focusY);
		}

		// 5. Draw drop shadow
		if (this.config.showShadow) {
			const intensity = (this.config.shadowIntensity ?? DEFAULT_SHADOW_INTENSITY) / 100;
			const shadowBlur = 30 * intensity;
			const shadowAlpha = 0.4 * intensity;

			ctx.shadowColor = `rgba(0, 0, 0, ${shadowAlpha})`;
			ctx.shadowBlur = shadowBlur;
			ctx.shadowOffsetY = 8 * intensity;
		}

		// 6. Draw video with rounded corners
		this.roundedRect(ctx, drawX, drawY, drawW, drawH, borderRadius);
		ctx.clip();

		// Reset shadow after clipping (shadow was applied to the clip path)
		ctx.shadowColor = "transparent";
		ctx.shadowBlur = 0;
		ctx.shadowOffsetY = 0;

		// Draw the video frame (with crop)
		const sx = this.config.videoWidth * cropRegion.x;
		const sy = this.config.videoHeight * cropRegion.y;

		ctx.drawImage(
			videoFrame,
			sx, sy, srcW, srcH,
			drawX, drawY, drawW, drawH,
		);

		ctx.restore();

		// 7. Draw webcam overlay
		if (webcamFrame && this.config.webcamSize) {
			this.drawWebcamOverlay(ctx, webcamFrame, drawX, drawY, drawW, drawH);
		}

		// 8. Draw annotations
		if (this.config.annotationRegions && this.config.annotationRegions.length > 0) {
			this.drawAnnotations(ctx, sourceMs, width, height);
		}

		// 9. Apply motion blur (blend with previous frame)
		if (this.config.showBlur && this.config.motionBlurAmount && this.config.motionBlurAmount > 0) {
			this.applyMotionBlur(ctx, width, height);
		}
	}

	/**
	 * Returns the output canvas.
	 */
	getCanvas(): OffscreenCanvas | HTMLCanvasElement {
		return this.canvas;
	}

	/**
	 * Returns canvas image data for encoding.
	 */
	getImageData(): ImageData {
		return this.ctx.getImageData(0, 0, this.config.width, this.config.height);
	}

	/**
	 * Destroys the renderer and releases resources.
	 */
	destroy(): void {
		this.backgroundImage?.close();
		this.backgroundImage = null;
		this.previousFrame = null;
		this.initialized = false;
	}

	// -----------------------------------------------------------------------
	// Background Rendering
	// -----------------------------------------------------------------------

	private drawBackground(
		ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
		width: number,
		height: number,
	): void {
		const bg = this.config.wallpaper;

		if (this.backgroundImage) {
			// Draw loaded background image, covering the canvas
			const imgAspect = this.backgroundImage.width / this.backgroundImage.height;
			const canvasAspect = width / height;

			let sx = 0, sy = 0, sw = this.backgroundImage.width, sh = this.backgroundImage.height;

			if (imgAspect > canvasAspect) {
				sw = this.backgroundImage.height * canvasAspect;
				sx = (this.backgroundImage.width - sw) / 2;
			} else {
				sh = this.backgroundImage.width / canvasAspect;
				sy = (this.backgroundImage.height - sh) / 2;
			}

			ctx.drawImage(this.backgroundImage, sx, sy, sw, sh, 0, 0, width, height);
			return;
		}

		if (bg.startsWith("linear-gradient") || bg.startsWith("radial-gradient")) {
			// Parse and render CSS gradient
			this.drawCSSGradient(ctx, bg, width, height);
			return;
		}

		if (bg.startsWith("#") || bg.startsWith("rgb")) {
			ctx.fillStyle = bg;
			ctx.fillRect(0, 0, width, height);
			return;
		}

		// Fallback: dark background
		ctx.fillStyle = "#0d0b14";
		ctx.fillRect(0, 0, width, height);
	}

	private drawCSSGradient(
		ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
		cssGradient: string,
		width: number,
		height: number,
	): void {
		// Simple gradient parsing for common cases
		const isLinear = cssGradient.startsWith("linear-gradient");

		// Extract color stops — simplified parser
		const match = cssGradient.match(/\(([^)]+)\)/);
		if (!match) {
			ctx.fillStyle = "#0d0b14";
			ctx.fillRect(0, 0, width, height);
			return;
		}

		const parts = match[1].split(",").map((s) => s.trim());

		// Handle angle
		let angle = 135;
		let colorStart = 0;

		const angleMatch = parts[0].match(/^(\d+)deg$/);
		if (angleMatch) {
			angle = parseInt(angleMatch[1], 10);
			colorStart = 1;
		} else if (parts[0].startsWith("to ")) {
			colorStart = 1;
		}

		// Convert angle to gradient coordinates
		const radians = ((angle - 90) * Math.PI) / 180;
		const length = Math.max(width, height);
		const cx = width / 2;
		const cy = height / 2;

		const gradient = ctx.createLinearGradient(
			cx - Math.cos(radians) * length / 2,
			cy - Math.sin(radians) * length / 2,
			cx + Math.cos(radians) * length / 2,
			cy + Math.sin(radians) * length / 2,
		);

		// Parse color stops
		const colorParts = parts.slice(colorStart);
		colorParts.forEach((part, index) => {
			const colorMatch = part.match(/^(#[0-9a-fA-F]+|rgba?\([^)]+\)|[a-zA-Z]+)\s*(\d+%)?$/);
			if (colorMatch) {
				const color = colorMatch[1];
				const stop = colorMatch[2]
					? parseFloat(colorMatch[2]) / 100
					: index / Math.max(1, colorParts.length - 1);
				gradient.addColorStop(clamp(stop, 0, 1), color);
			}
		});

		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, width, height);
	}

	// -----------------------------------------------------------------------
	// Webcam Overlay
	// -----------------------------------------------------------------------

	private drawWebcamOverlay(
		ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
		webcamFrame: VideoFrame,
		videoX: number,
		videoY: number,
		videoW: number,
		videoH: number,
	): void {
		const layout = this.config.webcamLayoutPreset || "picture-in-picture";
		const maskShape = this.config.webcamMaskShape || "rectangle";
		const sizePercent = this.config.webcamSizePreset || 25;
		const position = this.config.webcamPosition;

		// Calculate webcam dimensions
		const webcamSize = this.config.webcamSize!;
		const webcamAspect = webcamSize.width / webcamSize.height;
		const refDim = Math.min(this.config.width, this.config.height);
		let wcW = refDim * (sizePercent / 100);
		let wcH = wcW / webcamAspect;

		// Default position (bottom-right corner of video)
		let wcX = videoX + videoW - wcW - 16;
		let wcY = videoY + videoH - wcH - 16;

		if (position) {
			wcX = this.config.width * position.cx - wcW / 2;
			wcY = this.config.height * position.cy - wcH / 2;
		}

		// Adjust for layout preset
		if (layout === "side-by-side") {
			wcW = this.config.width * 0.3;
			wcH = wcW / webcamAspect;
			wcX = this.config.width - wcW - 16;
			wcY = (this.config.height - wcH) / 2;
		}

		ctx.save();

		// Apply mask shape
		switch (maskShape) {
			case "circle": {
				const radius = Math.min(wcW, wcH) / 2;
				ctx.beginPath();
				ctx.arc(wcX + wcW / 2, wcY + wcH / 2, radius, 0, Math.PI * 2);
				ctx.clip();
				break;
			}
			case "rounded":
				this.roundedRect(ctx, wcX, wcY, wcW, wcH, 16);
				ctx.clip();
				break;
			case "square": {
				const side = Math.min(wcW, wcH);
				wcX = wcX + (wcW - side) / 2;
				wcY = wcY + (wcH - side) / 2;
				wcW = side;
				wcH = side;
				break;
			}
			default:
				// Rectangle — no special clipping
				break;
		}

		// Draw webcam frame
		ctx.drawImage(webcamFrame, wcX, wcY, wcW, wcH);

		// Draw border
		ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
		ctx.lineWidth = 2;

		if (maskShape === "circle") {
			const radius = Math.min(wcW, wcH) / 2;
			ctx.beginPath();
			ctx.arc(wcX + wcW / 2, wcY + wcH / 2, radius, 0, Math.PI * 2);
			ctx.stroke();
		} else {
			ctx.strokeRect(wcX, wcY, wcW, wcH);
		}

		ctx.restore();
	}

	// -----------------------------------------------------------------------
	// Annotations
	// -----------------------------------------------------------------------

	private drawAnnotations(
		ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
		sourceMs: number,
		canvasWidth: number,
		canvasHeight: number,
	): void {
		const regions = this.config.annotationRegions || [];

		// Sort by z-index and filter to active annotations
		const active = regions
			.filter((a) => sourceMs >= a.startMs && sourceMs <= a.endMs)
			.sort((a, b) => a.zIndex - b.zIndex);

		for (const annotation of active) {
			const x = (annotation.position.x / 100) * canvasWidth;
			const y = (annotation.position.y / 100) * canvasHeight;
			const w = (annotation.size.width / 100) * canvasWidth;
			const h = (annotation.size.height / 100) * canvasHeight;

			// Calculate opacity from keyframes if present
			let opacity = 1;
			if (annotation.keyframes && annotation.keyframes.length > 0) {
				opacity = this.interpolateKeyframeValue(
					sourceMs - annotation.startMs,
					annotation.keyframes,
					"opacity",
				);
			}

			ctx.save();
			ctx.globalAlpha = clamp(opacity, 0, 1);

			switch (annotation.type) {
				case "text":
					this.drawTextAnnotation(ctx, annotation, x, y, w, h);
					break;
				case "image":
					this.drawImageAnnotation(ctx, annotation, x, y, w, h);
					break;
				case "figure":
					this.drawFigureAnnotation(ctx, annotation, x, y, w, h);
					break;
				case "blur":
					this.drawBlurAnnotation(ctx, annotation, x, y, w, h);
					break;
				case "freehand":
					this.drawFreehandAnnotation(ctx, annotation, x, y, w, h);
					break;
			}

			ctx.restore();
		}
	}

	private drawTextAnnotation(
		ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
		annotation: AnnotationRegion,
		x: number, y: number, w: number, h: number,
	): void {
		const style = annotation.style;

		// Background
		if (style.backgroundColor && style.backgroundColor !== "transparent") {
			ctx.fillStyle = style.backgroundColor;
			this.roundedRect(ctx, x, y, w, h, 8);
			ctx.fill();
		}

		// Text
		const text = annotation.textContent || "";
		if (!text) return;

		ctx.fillStyle = style.color;
		ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`;
		ctx.textAlign = style.textAlign as CanvasTextAlign;
		ctx.textBaseline = "middle";

		// Word wrap
		const lines = this.wrapText(ctx, text, w - 16);
		const lineHeight = style.fontSize * 1.3;
		const totalTextHeight = lines.length * lineHeight;
		const startY = y + (h - totalTextHeight) / 2 + lineHeight / 2;

		let textX: number;
		switch (style.textAlign) {
			case "left":
				textX = x + 8;
				break;
			case "right":
				textX = x + w - 8;
				break;
			default:
				textX = x + w / 2;
		}

		for (let i = 0; i < lines.length; i++) {
			ctx.fillText(lines[i], textX, startY + i * lineHeight);
		}
	}

	private drawImageAnnotation(
		ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
		annotation: AnnotationRegion,
		x: number, y: number, w: number, h: number,
	): void {
		// Image annotations are rendered from cached ImageBitmap
		// For now, draw a placeholder
		ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
		ctx.lineWidth = 2;
		ctx.setLineDash([6, 4]);
		ctx.strokeRect(x, y, w, h);
		ctx.setLineDash([]);
	}

	private drawFigureAnnotation(
		ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
		annotation: AnnotationRegion,
		x: number, y: number, w: number, h: number,
	): void {
		const figure = annotation.figureData;
		if (!figure) return;

		ctx.strokeStyle = figure.color;
		ctx.fillStyle = figure.color;
		ctx.lineWidth = figure.strokeWidth;
		ctx.lineCap = "round";
		ctx.lineJoin = "round";

		switch (figure.shapeType || "arrow") {
			case "rectangle":
				ctx.strokeRect(x, y, w, h);
				break;
			case "circle": {
				const rx = w / 2;
				const ry = h / 2;
				ctx.beginPath();
				ctx.ellipse(x + rx, y + ry, rx, ry, 0, 0, Math.PI * 2);
				ctx.stroke();
				break;
			}
			case "line":
				ctx.beginPath();
				ctx.moveTo(x, y + h / 2);
				ctx.lineTo(x + w, y + h / 2);
				ctx.stroke();
				break;
			case "arrow":
			default:
				this.drawArrow(ctx, annotation, x, y, w, h);
				break;
		}
	}

	private drawArrow(
		ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
		annotation: AnnotationRegion,
		x: number, y: number, w: number, h: number,
	): void {
		const dir = annotation.figureData?.arrowDirection || "right";
		let startX: number, startY: number, endX: number, endY: number;

		switch (dir) {
			case "right":
				startX = x; startY = y + h / 2; endX = x + w; endY = y + h / 2;
				break;
			case "left":
				startX = x + w; startY = y + h / 2; endX = x; endY = y + h / 2;
				break;
			case "up":
				startX = x + w / 2; startY = y + h; endX = x + w / 2; endY = y;
				break;
			case "down":
				startX = x + w / 2; startY = y; endX = x + w / 2; endY = y + h;
				break;
			default:
				startX = x; startY = y + h; endX = x + w; endY = y;
		}

		// Arrow line
		ctx.beginPath();
		ctx.moveTo(startX, startY);
		ctx.lineTo(endX, endY);
		ctx.stroke();

		// Arrow head
		const headLen = 16;
		const angle = Math.atan2(endY - startY, endX - startX);
		ctx.beginPath();
		ctx.moveTo(endX, endY);
		ctx.lineTo(
			endX - headLen * Math.cos(angle - Math.PI / 6),
			endY - headLen * Math.sin(angle - Math.PI / 6),
		);
		ctx.lineTo(
			endX - headLen * Math.cos(angle + Math.PI / 6),
			endY - headLen * Math.sin(angle + Math.PI / 6),
		);
		ctx.closePath();
		ctx.fill();
	}

	private drawBlurAnnotation(
		ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
		annotation: AnnotationRegion,
		x: number, y: number, w: number, h: number,
	): void {
		const blur = annotation.blurData;
		if (!blur) return;

		// Read the pixels in the blur area
		const imageData = ctx.getImageData(
			Math.max(0, Math.floor(x)),
			Math.max(0, Math.floor(y)),
			Math.min(Math.ceil(w), this.config.width - Math.floor(x)),
			Math.min(Math.ceil(h), this.config.height - Math.floor(y)),
		);

		// Apply box blur
		this.boxBlur(imageData, blur.intensity);

		// Draw blurred pixels back
		ctx.putImageData(imageData, Math.floor(x), Math.floor(y));
	}

	private drawFreehandAnnotation(
		ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
		annotation: AnnotationRegion,
		x: number, y: number, w: number, h: number,
	): void {
		const points = annotation.freehandPath;
		if (!points || points.length < 2) return;

		ctx.strokeStyle = annotation.style.color;
		ctx.lineWidth = annotation.figureData?.strokeWidth || 3;
		ctx.lineCap = "round";
		ctx.lineJoin = "round";

		ctx.beginPath();
		ctx.moveTo(
			x + (points[0].x / 100) * w,
			y + (points[0].y / 100) * h,
		);

		for (let i = 1; i < points.length; i++) {
			ctx.lineTo(
				x + (points[i].x / 100) * w,
				y + (points[i].y / 100) * h,
			);
		}

		ctx.stroke();
	}

	// -----------------------------------------------------------------------
	// Motion Blur
	// -----------------------------------------------------------------------

	private applyMotionBlur(
		ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
		width: number,
		height: number,
	): void {
		const amount = clamp((this.config.motionBlurAmount || 0) / 100, 0, 0.5);
		if (amount <= 0) return;

		const currentFrame = ctx.getImageData(0, 0, width, height);

		if (this.previousFrame) {
			const current = currentFrame.data;
			const previous = this.previousFrame.data;
			const alpha = amount;

			for (let i = 0; i < current.length; i += 4) {
				current[i] = current[i] * (1 - alpha) + previous[i] * alpha;
				current[i + 1] = current[i + 1] * (1 - alpha) + previous[i + 1] * alpha;
				current[i + 2] = current[i + 2] * (1 - alpha) + previous[i + 2] * alpha;
			}

			ctx.putImageData(currentFrame, 0, 0);
		}

		this.previousFrame = ctx.getImageData(0, 0, width, height);
	}

	// -----------------------------------------------------------------------
	// Helpers
	// -----------------------------------------------------------------------

	private roundedRect(
		ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
		x: number, y: number, w: number, h: number, r: number,
	): void {
		const radius = Math.min(r, w / 2, h / 2);
		ctx.beginPath();
		ctx.moveTo(x + radius, y);
		ctx.lineTo(x + w - radius, y);
		ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
		ctx.lineTo(x + w, y + h - radius);
		ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
		ctx.lineTo(x + radius, y + h);
		ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
		ctx.lineTo(x, y + radius);
		ctx.quadraticCurveTo(x, y, x + radius, y);
		ctx.closePath();
	}

	private wrapText(
		ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
		text: string,
		maxWidth: number,
	): string[] {
		const words = text.split(" ");
		const lines: string[] = [];
		let currentLine = "";

		for (const word of words) {
			const testLine = currentLine ? `${currentLine} ${word}` : word;
			const metrics = ctx.measureText(testLine);

			if (metrics.width > maxWidth && currentLine) {
				lines.push(currentLine);
				currentLine = word;
			} else {
				currentLine = testLine;
			}
		}

		if (currentLine) lines.push(currentLine);
		return lines.length > 0 ? lines : [""];
	}

	private boxBlur(imageData: ImageData, radius: number): void {
		const { data, width, height } = imageData;
		const r = Math.max(1, Math.floor(radius));
		const temp = new Uint8ClampedArray(data.length);

		// Horizontal pass
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				let rSum = 0, gSum = 0, bSum = 0, count = 0;

				for (let kx = -r; kx <= r; kx++) {
					const sx = clamp(x + kx, 0, width - 1);
					const idx = (y * width + sx) * 4;
					rSum += data[idx];
					gSum += data[idx + 1];
					bSum += data[idx + 2];
					count++;
				}

				const idx = (y * width + x) * 4;
				temp[idx] = rSum / count;
				temp[idx + 1] = gSum / count;
				temp[idx + 2] = bSum / count;
				temp[idx + 3] = data[idx + 3];
			}
		}

		// Vertical pass
		for (let x = 0; x < width; x++) {
			for (let y = 0; y < height; y++) {
				let rSum = 0, gSum = 0, bSum = 0, count = 0;

				for (let ky = -r; ky <= r; ky++) {
					const sy = clamp(y + ky, 0, height - 1);
					const idx = (sy * width + x) * 4;
					rSum += temp[idx];
					gSum += temp[idx + 1];
					bSum += temp[idx + 2];
					count++;
				}

				const idx = (y * width + x) * 4;
				data[idx] = rSum / count;
				data[idx + 1] = gSum / count;
				data[idx + 2] = bSum / count;
			}
		}
	}

	private interpolateKeyframeValue(
		offsetMs: number,
		keyframes: Array<{ timeOffsetMs: number; opacity: number }>,
		prop: "opacity",
	): number {
		if (keyframes.length === 0) return 1;
		if (keyframes.length === 1) return keyframes[0][prop];

		// Find surrounding keyframes
		const sorted = [...keyframes].sort((a, b) => a.timeOffsetMs - b.timeOffsetMs);

		if (offsetMs <= sorted[0].timeOffsetMs) return sorted[0][prop];
		if (offsetMs >= sorted[sorted.length - 1].timeOffsetMs) return sorted[sorted.length - 1][prop];

		for (let i = 0; i < sorted.length - 1; i++) {
			if (offsetMs >= sorted[i].timeOffsetMs && offsetMs <= sorted[i + 1].timeOffsetMs) {
				const t = (offsetMs - sorted[i].timeOffsetMs) /
					(sorted[i + 1].timeOffsetMs - sorted[i].timeOffsetMs);
				return sorted[i][prop] + (sorted[i + 1][prop] - sorted[i][prop]) * t;
			}
		}

		return 1;
	}
}
