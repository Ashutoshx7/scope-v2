// ============================================================================
// @scope/core — Barrel Export
//
// All modules can be imported from the root or from sub-paths:
//   import { ExportPipeline, createZoomRegion } from "@scope/core";
//   import { StreamingVideoDecoder } from "@scope/core/decoder";
// ============================================================================

// Types
export * from "./types/index.js";

// Timeline Engine
export * from "./timeline/index.js";

// Project Serializer
export * from "./project/index.js";

// Video Decoder
export * from "./decoder/index.js";

// Video Encoder
export * from "./encoder/index.js";

// Video Muxer
export * from "./muxer/index.js";

// Frame Renderer
export * from "./renderer/index.js";

// Audio Processor
export * from "./audio/index.js";

// GIF Encoder
export * from "./gif/index.js";

// Export Pipeline
export * from "./export/index.js";

// Annotation Engine
export * from "./annotations/index.js";

// Cursor Telemetry
export * from "./cursor/index.js";

// Effects (transitions, cursor effects, auto-zoom)
export * from "./effects/index.js";
// Avoid duplicate export of suggestZoomRegions if it's already in timeline

