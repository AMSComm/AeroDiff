# Changelog

All notable changes to **AeroDiff** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
