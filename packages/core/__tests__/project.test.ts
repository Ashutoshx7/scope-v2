// ============================================================================
// Project Serializer Tests
// ============================================================================

import { describe, it, expect } from "vitest";
import {
	ProjectSerializer,
} from "../src/project/index.js";

describe("ProjectSerializer", () => {
	const serializer = new ProjectSerializer();

	it("serializes to valid JSON", () => {
		const project = serializer.createEmpty("Test Project");
		const json = serializer.serialize(project);
		expect(() => JSON.parse(json)).not.toThrow();
	});

	it("round-trips correctly", () => {
		const project = serializer.createEmpty("Round Trip Test");
		const json = serializer.serialize(project);
		const restored = serializer.deserialize(json);
		expect(restored.name).toBe("Round Trip Test");
		expect(restored.version).toBe(2);
	});

	it("creates empty project with defaults", () => {
		const project = serializer.createEmpty("Default Test");
		expect(project.version).toBe(2);
		expect(project.name).toBe("Default Test");
		expect(project.zoomRegions).toEqual([]);
		expect(project.trimRegions).toEqual([]);
		expect(project.speedRegions).toEqual([]);
		expect(project.annotationRegions).toEqual([]);
	});

	it("migrates v1 to v2", () => {
		const v1Data = JSON.stringify({
			version: 1,
			name: "Legacy Project",
			videoUrl: "/old/path.webm",
			zoom_regions: [
				{ id: "z1", start_ms: 1000, end_ms: 3000, depth: 2 },
			],
		});

		const migrated = serializer.deserialize(v1Data);
		expect(migrated.version).toBe(2);
		expect(migrated.name).toBe("Legacy Project");
	});

	it("handles malformed JSON gracefully", () => {
		expect(() => serializer.deserialize("not json")).toThrow();
	});

	it("preserves extra fields during serialization", () => {
		const project = serializer.createEmpty("Extra Fields");
		project.background = { value: "linear-gradient(red, blue)", type: "gradient" };
		const json = serializer.serialize(project);
		const restored = serializer.deserialize(json);
		expect(restored.background.value).toContain("gradient");
	});
});
