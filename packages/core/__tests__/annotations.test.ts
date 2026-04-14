// ============================================================================
// Annotation Engine Tests
// ============================================================================

import { describe, it, expect } from "vitest";
import {
	createTextAnnotation,
	createFigureAnnotation,
	createBlurAnnotation,
	createFreehandAnnotation,
	moveAnnotation,
	resizeAnnotation,
	retimeAnnotation,
	updateAnnotationText,
	addFadeInEffect,
	addFadeOutEffect,
	addFadeInOutEffect,
	getActiveAnnotations,
	bringToFront,
	sendToBack,
	duplicateAnnotation,
} from "../src/annotations/index.js";

describe("createTextAnnotation", () => {
	it("creates a text annotation with defaults", () => {
		const ann = createTextAnnotation(1000, 5000, "Hello World");
		expect(ann.type).toBe("text");
		expect(ann.textContent).toBe("Hello World");
		expect(ann.startMs).toBe(1000);
		expect(ann.endMs).toBe(5000);
		expect(ann.id).toBeTruthy();
		expect(ann.position).toBeDefined();
		expect(ann.size).toBeDefined();
	});

	it("accepts overrides", () => {
		const ann = createTextAnnotation(0, 1000, "Test", { zIndex: 5 });
		expect(ann.zIndex).toBe(5);
	});
});

describe("createFigureAnnotation", () => {
	it("creates a figure annotation", () => {
		const ann = createFigureAnnotation(0, 2000, { type: "arrow" });
		expect(ann.type).toBe("figure");
		expect(ann.figureData?.type).toBe("arrow");
	});
});

describe("createBlurAnnotation", () => {
	it("creates a blur annotation with z-index 0", () => {
		const ann = createBlurAnnotation(0, 3000);
		expect(ann.type).toBe("blur");
		expect(ann.zIndex).toBe(0);
	});
});

describe("createFreehandAnnotation", () => {
	it("creates a freehand annotation from path", () => {
		const path = [
			{ x: 10, y: 10 },
			{ x: 50, y: 50 },
			{ x: 90, y: 10 },
		];
		const ann = createFreehandAnnotation(0, 1000, path);
		expect(ann.type).toBe("freehand");
		expect(ann.freehandPath).toBeDefined();
		expect(ann.freehandPath!.length).toBe(3);
	});
});

describe("moveAnnotation", () => {
	it("returns a new annotation with updated position", () => {
		const original = createTextAnnotation(0, 1000, "Test");
		const moved = moveAnnotation(original, { x: 50, y: 60 });
		expect(moved.position.x).toBe(50);
		expect(moved.position.y).toBe(60);
		expect(moved.id).toBe(original.id); // Same ID
	});
});

describe("resizeAnnotation", () => {
	it("enforces minimum size", () => {
		const original = createTextAnnotation(0, 1000, "Test");
		const resized = resizeAnnotation(original, { width: -5, height: 0 });
		expect(resized.size.width).toBeGreaterThanOrEqual(1);
		expect(resized.size.height).toBeGreaterThanOrEqual(1);
	});
});

describe("retimeAnnotation", () => {
	it("clamps start to 0", () => {
		const original = createTextAnnotation(1000, 5000, "Test");
		const retimed = retimeAnnotation(original, -100, 3000);
		expect(retimed.startMs).toBe(0);
	});

	it("ensures min duration of 100ms", () => {
		const original = createTextAnnotation(1000, 5000, "Test");
		const retimed = retimeAnnotation(original, 2000, 2000);
		expect(retimed.endMs).toBe(2100);
	});
});

describe("updateAnnotationText", () => {
	it("updates text content", () => {
		const original = createTextAnnotation(0, 1000, "Old");
		const updated = updateAnnotationText(original, "New");
		expect(updated.textContent).toBe("New");
	});
});

describe("keyframe effects", () => {
	it("addFadeInEffect creates keyframes", () => {
		const ann = createTextAnnotation(0, 3000, "Test");
		const withFade = addFadeInEffect(ann, 500);
		expect(withFade.keyframes).toBeDefined();
		expect(withFade.keyframes!.length).toBe(2);
		expect(withFade.keyframes![0].opacity).toBe(0);
		expect(withFade.keyframes![1].opacity).toBe(1);
	});

	it("addFadeOutEffect creates keyframes", () => {
		const ann = createTextAnnotation(0, 3000, "Test");
		const withFade = addFadeOutEffect(ann, 500);
		expect(withFade.keyframes).toBeDefined();
		expect(withFade.keyframes![0].opacity).toBe(1);
		expect(withFade.keyframes![withFade.keyframes!.length - 1].opacity).toBe(0);
	});

	it("addFadeInOutEffect creates 4 keyframes", () => {
		const ann = createTextAnnotation(0, 5000, "Test");
		const withFade = addFadeInOutEffect(ann, 300, 300);
		expect(withFade.keyframes!.length).toBe(4);
	});
});

describe("getActiveAnnotations", () => {
	it("returns annotations active at a given time", () => {
		const a1 = createTextAnnotation(0, 2000, "A");
		const a2 = createTextAnnotation(1000, 3000, "B");
		const a3 = createTextAnnotation(5000, 8000, "C");

		const active = getActiveAnnotations([a1, a2, a3], 1500);
		expect(active.length).toBe(2);
	});

	it("returns empty array when no annotations active", () => {
		const a1 = createTextAnnotation(5000, 8000, "A");
		expect(getActiveAnnotations([a1], 1000).length).toBe(0);
	});
});

describe("bringToFront / sendToBack", () => {
	it("bringToFront sets highest z-index", () => {
		const a1 = createTextAnnotation(0, 1000, "A");
		const a2 = createTextAnnotation(0, 1000, "B");
		const result = bringToFront([a1, a2], a1.id);
		const front = result.find((a) => a.id === a1.id);
		const back = result.find((a) => a.id === a2.id);
		expect(front!.zIndex).toBeGreaterThan(back!.zIndex);
	});

	it("sendToBack sets lowest z-index", () => {
		const a1 = createTextAnnotation(0, 1000, "A");
		const a2 = createTextAnnotation(0, 1000, "B");
		const result = sendToBack([a1, a2], a1.id);
		const sent = result.find((a) => a.id === a1.id);
		const other = result.find((a) => a.id === a2.id);
		expect(sent!.zIndex).toBeLessThan(other!.zIndex);
	});
});

describe("duplicateAnnotation", () => {
	it("creates a copy with new ID and offset position", () => {
		const original = createTextAnnotation(0, 1000, "Test");
		const dup = duplicateAnnotation(original, 500);
		expect(dup.id).not.toBe(original.id);
		expect(dup.startMs).toBe(500);
		expect(dup.endMs).toBe(1500);
		expect(dup.position.x).toBeGreaterThan(original.position.x);
	});
});
