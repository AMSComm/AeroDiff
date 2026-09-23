# ⚡ AeroDiff

<p align="center">
  <img src="./public/icon.png" width="96" height="96" alt="AeroDiff Icon" style="border-radius: 16px;" />
</p>

<h3 align="center">Ultra-Fast, Space-Optimized Diff &amp; Merge Suite</h3>

<p align="center">
  <strong>Native Desktop (macOS, Windows, Linux) built with Rust &amp; Tauri v2</strong><br/>
  Engineered for raw speed, zero UI freezes on 500,000+ line files, direct in-place editing, and seamless cross-platform comparisons.
</p>

<p align="center">
  <a href="https://github.com/AMSComm/AeroDiff/releases"><img src="https://img.shields.io/badge/Release-v0.1.0-10b981?style=flat-square" alt="Version 0.1.0" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-0ea5e9?style=flat-square" alt="License MIT" /></a>
  <img src="https://img.shields.io/badge/Desktop-Tauri_v2-22c55e?style=flat-square&logo=tauri" alt="Tauri v2" />
  <img src="https://img.shields.io/badge/Core-Rust_2021-f97316?style=flat-square&logo=rust" alt="Rust Core" />
  <img src="https://img.shields.io/badge/Tests-36%2F36_Passed-06b6d4?style=flat-square" alt="Tests 36/36" />
</p>

---

## 💡 Why AeroDiff?

Traditional diff tools either struggle with memory bloat (VS Code / Electron diffs), lack modern dark-mode ergonomics, or feel clunky and slow when comparing massive files. **AeroDiff** is designed from the ground up for modern developers:

| Feature / Metric | VS Code Diff | Beyond Compare | WinMerge | ⚡ AeroDiff |
|:---|:---:|:---:|:---:|:---:|
| **Memory Footprint** | ~250MB - 600MB | ~80MB - 120MB | ~50MB - 90MB | **< 35MB** |
| **Cold Startup Time** | ~1.5s - 3.5s | ~0.8s - 1.2s | ~0.5s - 1.0s | **< 0.25s** |
| **500,000+ Line Handling** | Freezes / Lags | Smooth | Decent | **Smooth 60fps (Virtualized DOM)** |
| **Installer Size** | ~120MB+ | ~30MB | ~18MB | **~12MB (Native Bundle)** |
| **Direct In-Place Editing** | Yes | Read-heavy UI | Yes | **Yes (Direct Text & CSV Editing)** |
| **Master Unified Scroll** | Desynced on gaps | Linked lines | Dual scrollbars | **Proportional Master Scrollbar** |
| **Cross-Platform Support** | Yes (Electron) | Paid License | Windows Only | **Open Source (macOS, Windows, Linux)** |
| **In-App Auto Update** | Yes | Manual / Nag | Manual | **Zero-Friction In-App Relaunch** |

---

## ✨ Key Capabilities

### 1. High-Performance Text Diff & Intra-Line Highlighting
- **Myers & Patience Algorithms**: Implemented natively in Rust via the `similar` engine for instantaneous delta calculations.
- **Intra-Line Character Precision**: Subtle and clear token-level deltas show exactly which words or characters were modified, added, or deleted.
- **Interactive Chunk Merge (`->` / `<-`)**: One-click chunk merging from Left to Right or Right to Left with deep Undo/Redo (`Cmd/Ctrl + Z`, `Cmd/Ctrl + Shift + Z`).

### 2. Direct In-Place Dual-Pane Editing
- **Instant Live Editing**: Need to fix a typo or modify a config value while comparing? Simply click and type directly in either Left or Right editor panes.
- **Real-Time Diff Recomputation**: Diffs update live as you type without breaking your scroll position or active cursor.
- **Tabular CSV Cell Editing**: Double-click any cell in the CSV viewer to edit directly inline with immediate delta refresh.

### 3. Master Proportional Scroll & Synchronized Horizontal Navigation
- **Master Vertical Scrollbar**: Eliminates awkward desyncs between files with different line counts. A unified scroll track calculates proportional line offsets so corresponding diff blocks stay perfectly aligned.
- **Bi-directional Horizontal Scroll Lock**: Left and Right panels stay strictly in sync during horizontal scrolling, ensuring indented blocks and wide tables remain readable.
- **60fps Virtualization**: Powered by `@tanstack/react-virtual`, rendering only visible lines to guarantee zero lag even on half-million-line files.
- **Bird's Eye Minimap**: Real-time visual overview bar for fast spatial orientation across massive documents.

### 4. Advanced Comparison Filters & Ignore Engine
- **Whitespace Flexibility**: Choose between *Compare All*, *Ignore Leading & Trailing Whitespace (Trim)*, or *Ignore All Whitespace*.
- **Blank Lines & Case Sensitivity**: Filter out insignificant blank line differences or ignore casing variations.
- **Custom Regex Exclusion**: Define regex patterns (e.g., `^// Generated at.*`, timestamps, or uuid headers) to ignore non-semantic changes.

### 5. Multi-Threaded Directory & Folder Comparison
- **Parallel Directory Walking**: Powered by Rust `rayon` and `walkdir` to scan tens of thousands of files across directories in seconds.
- **Fast vs. Deep Inspection**:
  - *Quick Mode*: Compares file sizes and modification timestamps.
  - *Deep Mode*: Calculates high-speed cryptographic / CRC32 / Blake3 byte hashes to guarantee exact match accuracy.
- **Smart Filtering**: Filter folder trees by status (*Modified*, *Only in Left*, *Only in Right*, *Identical*).
- **Direct Drill-Down**: Double-click any modified file in the folder view to immediately open its side-by-side diff.

### 6. Intelligent CSV & Tabular Comparison
- **Auto Delimiter Detection**: Automatically detects comma `,`, semicolon `;`, tab `\t`, or pipe `|` delimiters.
- **Key-Column Record Alignment**: Aligns rows based on selected primary key columns (e.g. `id`), correctly identifying modified rows even if records are sorted in different orders.
- **Detailed Change Stats**: Per-column delta indicators and summary statistics.

### 7. Auto-Encoding Detection & State Persistence
- **Encoding Support**: Seamlessly reads UTF-8, UTF-16 LE/BE, and Windows-1252 files with automatic BOM recognition.
- **Settings Memory**: User preferences, ignore filters, and window states are saved locally and restored on launch.

---

## 📥 Download & Installation

Download official pre-built releases from [GitHub Releases](https://github.com/AMSComm/AeroDiff/releases):

- **macOS:** `AeroDiff-universal.dmg` (Universal binary for Apple Silicon M1/M2/M3/M4 & Intel)
- **Windows:** `AeroDiff_x64-setup.exe` (NSIS Installer) / `AeroDiff_x64.msi`
- **Linux:** `aerodiff_amd64.deb` / `AeroDiff.AppImage`

> 🔄 **In-App Auto-Update:** AeroDiff checks for updates automatically on startup. You can also check manually by clicking the **version badge (e.g. `v0.1.0`)** in the bottom-right status bar. When an update is found, click **Update & Relaunch** to install instantly.

---

## ⌨️ Keyboard Shortcuts

| Shortcut (Win / Linux) | Shortcut (macOS) | Action |
|:---|:---|:---|
| `F7` | `F7` | Jump to Next Diff Chunk |
| `Shift + F7` | `Shift + F7` | Jump to Previous Diff Chunk |
| `Ctrl + Z` | `Cmd + Z` | Undo Chunk Merge |
| `Ctrl + Y` / `Ctrl + Shift + Z` | `Cmd + Shift + Z` | Redo Chunk Merge |
| `Ctrl + S` | `Cmd + S` | Save Active Files |
| `Ctrl + O` | `Cmd + O` | Open File Comparison |
| `Ctrl + Shift + O` | `Cmd + Shift + O` | Open Folder Comparison |

---

## 🛠️ Local Development

### Prerequisites
- **Node.js:** v20+ (recommended v22+)
- **pnpm:** v10+ / v11+ (`corepack enable pnpm`)
- **Rust & Cargo:** 1.78+ (`rustup default stable`)

### Getting Started

```bash
# 1. Clone repository
git clone https://github.com/AMSComm/AeroDiff.git
cd AeroDiff

# 2. Install dependencies
pnpm install

# 3. Run in Web / Vite development mode
pnpm dev

# 4. Run native desktop application in development mode
pnpm tauri dev
```

### Running Tests

```bash
# Run Rust Core Engine Tests (Myers diff, ignore filters, folder walker, CSV engine)
cd src-tauri
cargo test
cd ..

# Run Frontend Unit & Integration Tests (Vitest)
pnpm test

# Run End-to-End Tests (Playwright)
pnpm run test:e2e

# Run Production Build
pnpm build
```

---

## 🏗️ Architecture & Tech Stack

```
AeroDiff Architecture
├── src-tauri/ (Rust Core Backend)
│   ├── src/engine/        # Myers & Patience diff, tokenizer, chunk aligner
│   ├── src/folder/        # Parallel rayon directory walker & hash checker
│   ├── src/table/         # CSV / tabular alignment & key-column matcher
│   ├── src/commands.rs    # Tauri IPC commands exposed to frontend
│   └── Cargo.toml         # similar, rayon, memmap2, crc32fast, csv
│
└── src/ (React 19 + TypeScript Frontend)
    ├── components/diff/   # Virtualized dual-pane text diff & direct editors
    ├── components/folder/ # Folder tree comparison & summary filters
    ├── components/table/  # Tabular CSV compare & inline cell editor
    ├── components/common/ # Master scrollbar, Minimap, UpdateDialog
    ├── stores/            # Zustand state management (diff, folder, table, options)
    └── utils/             # Updater helper, encoding detection, hotkeys
```

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](./LICENSE) for full details.

Copyright (c) 2026 **AM Software** ([https://amsoftware.com.vn](https://amsoftware.com.vn)).
