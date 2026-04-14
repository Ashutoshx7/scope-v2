import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["__tests__/**/*.test.ts"],
		environment: "node",
		globals: true,
		coverage: {
			provider: "v8",
			include: ["src/**/*.ts"],
			exclude: ["src/**/index.ts"],
			reporter: ["text", "html", "lcov"],
			thresholds: {
				lines: 60,
				functions: 60,
				branches: 50,
				statements: 60,
			},
		},
		testTimeout: 10000,
		alias: {
			"@openscreen/core": new URL("./src/index.ts", import.meta.url).pathname,
		},
	},
});
