# Changelog

All notable changes to **AeroDiff** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [v0.1.4] - 2026-10-03

### 🐛 Critical Packaging & Startup Fix
- **Fix Main Application Binary Selection**: Resolved a packaging issue where the headless TCP test utility (`ipc_server`) was packaged as the primary application executable instead of the GUI app (`aerodiff`), causing the application to launch into a background socket listener without displaying a GUI window.
- **Explicit Cargo & Tauri Binary Target**: Configured `default-run = "aerodiff"`, explicit `[[bin]]` and `[[example]]` definitions in `Cargo.toml`, and `mainBinaryName = "aerodiff"` in `tauri.conf.json` to guarantee the GUI executable is always selected across macOS, Windows, and Linux bundles.
- **Atomic Multi-Platform Release Publishing**: Configured GitHub Actions release pipeline to compile macOS, Windows, and Linux packages into a draft release first, and only publish the release publicly once all platform packages have finished building and uploading.

---

## [v0.1.3] - 2026-10-03

### ⚡ Scalable Diff Engine & Memory Alignment
- **Fix Scalable Diff Anchor Loop**: Fixed an anchor extension loop in `diff/engine.rs` where subsequent matching line anchors could re-process preceding lines, causing runaway virtual line expansion (dropping virtual lines from 205M back to exact 596,640) and eliminating multi-gigabyte memory bloat. Diff calculation time on two 133MB CSV files (596,640 lines) dropped to ~590ms.
- **Synchronous Cache Hydration**: Fixed stale render lag in `useDiffSessionLines` by immediately synchronizing cache maps during component render when new diff sessions arrive, eliminating intermediate empty flashes.

### 📊 Tabular CSV Comparison UX
- **Intelligent Horizontal Auto-Snap**: Automatically aligns and centers the first modified column into view when seeking between differences or jumping to changed rows, eliminating manual scrolling across wide multi-column CSV tables.
- **Changed Columns Navigation Toolbar**: Added quick-access jump buttons on the CSV comparison toolbar highlighting modified columns by name and index (e.g. `Col 9`, `Col 10`) with one-click instant focus.
- **High-Contrast Column & Cell Badging**: Added bright delta border glows and `DIFF` badges to changed column headers, accompanied by clear high-contrast `(empty)` indicators for missing/empty cell values.
- **Proactive Chunk Pre-Fetching**: Pre-caches the initial diff chunk on file load so changed columns and delta indicators are highlighted immediately without waiting for scroll events.

### 📝 Text View Precision Indicators
- **Context-Aware Insertion Markers**: In Split View, added dedicated `↳ inserted on right` markers on lines where the left pane has no corresponding deletion, clearly disambiguating line insertions from blank lines.
- **Inline Before/After Unified View**: Added inline before/after delta text (`[strikethrough old] → [new]`) for modified lines in Unified View.
- **Centered Vertical Diff Navigation**: Vertically centers diff chunks in viewport during Next/Previous difference jumps.

### 🧪 Automated E2E & Real-World Performance Benchmarking
- **Full Playwright E2E Suite**: Integrated comprehensive automated Playwright E2E test suite running against native Tauri IPC server (`pnpm run test:e2e`).
- **133MB Stress Benchmark**: Verified 60 FPS scrolling and <50ms seek latency on production 133MB / 596,640-line datasets.

---

## [v0.1.2] - 2026-09-25

### ⚡ Heavy File & Scalable Diff Architecture
- **Memory-Mapped Streaming Engine**: Implemented `memmap2` with multi-threaded byte slicing (`memchr`, `rayon`) and Patience LIS anchoring for huge files. Computes full diffs on 400MB+ files (2.4M+ lines each) in ~3.8 seconds.
- **Windowed Diff Sessions**: Introduced backend session-based diff caching with on-demand chunk streaming via `get_diff_slice(session_id, offset, limit)` to prevent IPC string transfer bloat and Out-Of-Memory crashes.
- **Virtual DOM Viewport**: Enhanced `SplitDiffViewer`, `UnifiedDiffViewer`, and `CsvCompareView` with TanStack Virtual pagination hooks (`useDiffSessionLines`) and skeleton loading placeholders.
- **Resilient Line Number Gutter**: Refactored the text editor line gutter to virtualized DOM rendering, completely eliminating browser freezes and white-screen DOM crashes on massive text pastes.
- **Global Error Boundary**: Added comprehensive application-level ErrorBoundary with graceful recovery to safeguard against unexpected renderer failures.

---

## [v0.1.1] - 2026-09-23

### ⚙️ Architecture & Standardization
- **Ecosystem Standardization**: Synchronized tooling, build pipelines, and release environments with AMSComm MarkFlow standard.
- **High-Speed Linting**: Integrated Oxlint (`^1.81.0`) with automated validation steps across local scripts and GitHub Actions workflows.
- **Binary Size & Startup Optimization**: Configured release compilation profile in Rust with Link-Time Optimization (LTO), symbol stripping, and single codegen unit.
- **Automated Release Notes Synchronization**: Added standalone `sync-release-notes` workflow and post-release automation hook.
- **Dependency Updates**: Updated Tailwind CSS and Vite plugin to `4.3.3`.

---

## [v0.1.0] - 2026-09-23

### 🚀 Initial Release - High-Performance Cross-Platform Diff & Merge Suite

#### ⚡ Core Diff & Merge Engine
- **Rust-Powered Algorithmic Core**: High-speed Myers and Patience diff computation using Rust's `similar` engine, executing complex diffs with zero UI lockup.
- **Intra-Line Character & Word Highlights**: Precision token-level delta highlights providing immediate visual recognition of modified tokens.
- **Interactive Chunk Merge (`->` / `<-`)**: One-click chunk merging from Left to Right or Right to Left with deep Undo/Redo history (`Cmd/Ctrl + Z`, `Cmd/Ctrl + Shift + Z`).
- **Direct In-Place Editing**: Edit text directly inside both Left and Right comparison panes with automatic live re-diffing on modification.
- **Direct Tabular Cell Editing**: Modify CSV cells directly with inline input editing, real-time delta recomputation, and column alignment.

#### 📜 Synchronized Viewport & Scrolling
- **Unified Master Vertical Scrollbar**: Coordinated master vertical scroll thumb tracking proportional document offsets, guaranteeing identical visual alignment even when line counts differ dramatically.
- **Bi-directional Synchronized Horizontal Scroll**: Smooth cross-pane horizontal scrolling keeping indented blocks, long lines, and wide tables perfectly locked in sync.
- **60fps Virtualized DOM**: Windowed rendering powered by `@tanstack/react-virtual` capable of handling 500,000+ line documents under 35MB of idle memory.
- **Bird's Eye Diff Minimap**: Visual side-rail map rendering chunk blocks in real-time for instant spatial navigation across large files.

#### 🔍 Comparison & Ignore Filters
- **Whitespace Tolerance**: Toggle between *Compare All*, *Ignore Leading & Trailing Whitespace (Trim)*, and *Ignore All Whitespace*.
- **Blank Lines & Case Sensitivity**: Instantly filter out empty line disparities or ignore case variations with a single click.
- **Regex Line Exclusion**: Define custom regex exclusion patterns (e.g. build metadata, generated timestamps, or license headers).
- **Directory & Folder Comparison**: Multi-threaded parallel folder scanning (`rayon` + `walkdir`) with Quick Mode (size/timestamp) and Deep Mode (CRC32/Blake3 hash verification).
- **CSV & Tabular Compare**: Smart delimiter detection (`,`, `;`, `\t`, `|`) with key-column alignment for out-of-order records.

#### 🌐 Encodings & System Integration
- **Auto-Encoding Detection**: Seamlessly reads UTF-8, UTF-16 LE/BE, and Windows-1252 files with BOM recognition.
- **Preferences & State Persistence**: Automatically preserves ignore flags, comparison options, and panel layouts across restarts.
- **In-App Auto-Update & Relaunch**: One-click update checking with download progress bar and direct application relaunch via `tauri-plugin-updater` and `tauri-plugin-process`.
- **Cross-Platform Installers**: Native pre-built releases for macOS (Universal `.dmg` for Apple Silicon & Intel), Windows (`.exe` NSIS installer & `.msi`), and Linux (`.deb` & `.AppImage`).
