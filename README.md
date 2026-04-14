# OpenScreen v2

> Free, open-source screen recorder & editor — as a desktop app and Chrome extension.

<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D22-brightgreen" />
  <img src="https://img.shields.io/badge/pnpm-9-blue" />
  <img src="https://img.shields.io/badge/electron-39-blueviolet" />
  <img src="https://img.shields.io/badge/manifest-v3-orange" />
  <img src="https://img.shields.io/badge/license-MIT-green" />
</p>

---

## ✨ Features

- **Screen Recording** — Capture your entire screen, a window, or a browser tab
- **Built-in Video Editor** — Timeline with zoom, trim, speed, and annotation tracks
- **Background Effects** — 12 gradient presets, solid colors, custom images
- **Auto-Zoom** — AI-powered zoom suggestions from cursor telemetry
- **Annotations** — Text, arrows, shapes, blur regions, freehand drawing
- **Cursor Effects** — Highlight, click visualization, motion trails
- **Smooth Transitions** — 6 easing curves (linear, ease, spring, bounce)
- **Export** — MP4, WebM, and GIF with configurable quality/resolution
- **Cross-Platform** — Desktop (Windows, macOS, Linux) + Chrome Extension

---

## 🏗️ Architecture

```
openscreen-v2/
├── packages/
│   ├── core/        ← Video engine (decoder, encoder, muxer, renderer, audio, GIF)
│   └── ui/          ← Shared React components (timeline, preview, panels)
├── apps/
│   ├── desktop/     ← Electron desktop app
│   └── extension/   ← Chrome Extension (Manifest V3)
└── .github/
    └── workflows/   ← CI + Release pipelines
```

| Package | Lines | What It Does |
|---|---|---|
| `@openscreen/core` | ~5,700 | Video processing engine — zero-dependency where possible |
| `@openscreen/ui` | ~4,650 | React components — timeline, preview, 7 panels, export dialog |
| `@openscreen/desktop` | ~3,200 | Electron app — recording HUD, source selector, editor |
| `@openscreen/extension` | ~1,700 | Chrome Extension — popup, offscreen recorder, side panel editor |

---

## 🚀 Quick Start

### Prerequisites

- **Node.js 22+**
- **pnpm 9+** — `npm install -g pnpm`

### Setup

```bash
git clone https://github.com/yourname/openscreen-v2.git
cd openscreen-v2
pnpm install
```

### Development

```bash
# Desktop app (Electron + Vite hot reload)
pnpm dev

# Chrome extension (watch mode)
pnpm dev:ext
```

### Testing

```bash
# Run all tests
pnpm test

# Watch mode
pnpm --filter @openscreen/core test:watch

# With coverage
pnpm --filter @openscreen/core test -- --coverage
```

### Build

```bash
# Build everything
pnpm build

# Desktop only (unpacked)
pnpm --filter @openscreen/desktop package

# Desktop release (installer)
pnpm --filter @openscreen/desktop release

# Chrome extension
pnpm build:extension
```

---

## 🖥️ Desktop App

The desktop app runs on **Electron 39** with a **Vite + React** renderer.

### Recording Flow

1. **Source Selector** → Choose screen/window to record
2. **Recording HUD** → Floating glassmorphism control bar with countdown
3. **MediaRecorder** → WebM/VP9 at 8 Mbps, 60fps
4. **Auto-save** → Recording saved via IPC, editor opens automatically

### Editor

- **Video Preview** — Play/pause/seek with auto-hiding controls
- **Timeline** — 4 editable tracks (zoom, trim, speed, annotations)
- **7 Sidebar Panels** — Background, Zoom, Annotations, Crop, Audio, Webcam, Settings
- **Export Dialog** — MP4/GIF/WebM with quality presets and progress tracking
- **Undo/Redo** — 50-deep snapshot stack (Cmd+Z / Cmd+Shift+Z)
- **Keyboard Shortcuts** — Space (play), Cmd+S (save), Cmd+E (export)

---

## 🌐 Chrome Extension

Manifest V3 extension with:

- **Popup** — Quick recording controls (tab or screen capture)
- **Offscreen Document** — Hidden MediaRecorder for tab/desktop capture
- **Side Panel** — In-browser video editor with preview, backgrounds, and download
- **Content Script** — Recording indicator pill + click visualization + cursor tracking
- **Keyboard Shortcut** — `Ctrl+Shift+R` to toggle recording
- **Context Menu** — Right-click → "Record this tab" / "Record screen"

---

## 🎨 Design System

Built with a custom glassmorphism design system:

- **HSL-based tokens** with primary/accent/success/warning/error palettes
- **5 surface layers** (base → sunken → default → raised → floating)
- **Frosted glass panels** with backdrop-filter blur
- **12 micro-animations** (fade, scale, slide, bounce, shimmer, pulse)
- **40+ component classes** (buttons, tabs, inputs, toggles, sliders)

---

## 🧪 Testing

Tests use **Vitest** with V8 coverage:

| Test Suite | Tests | What's Covered |
|---|---|---|
| `timeline.test.ts` | 16 | Region factories, validation, duration calculation |
| `annotations.test.ts` | 16 | CRUD operations, keyframes, z-ordering |
| `effects.test.ts` | 14 | Easing curves, zoom transitions, auto-zoom |
| `project.test.ts` | 6 | Serialization, round-trip, v1→v2 migration |
| `gif.test.ts` | 4 | GIF89a encoding, header, single-frame |

---

## 📦 CI/CD

| Workflow | Trigger | Jobs |
|---|---|---|
| **CI** | Push / PR to `main` | Lint → Test → Build (3-platform matrix) |
| **Release** | Tag `v*` | Test → Desktop (Linux/macOS/Windows) → Extension ZIP → GitHub Release |

---

## 📄 License

MIT © OpenScreen Contributors
