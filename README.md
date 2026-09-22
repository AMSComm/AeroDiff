# AeroDiff ⚡

> **AeroDiff** is an ultra-fast, space-optimized, cross-platform diff & merge suite inspired by WinMerge and Beyond Compare. Built for speed, precision, and handling heavy files effortlessly.

---

## ✨ Key Capabilities

1. **Precision File & Text Comparison:**
   - **Myers & Patience Diff Engine:** Implemented in Rust for raw execution speed.
   - **Intra-Line Character & Word Highlights:** Clear visual contrast for exact modified tokens.
   - **Interactive Chunk Merge (`->` / `<-`):** One-click chunk merge with robust Undo/Redo (`Cmd+Z` / `Ctrl+Z`).
   - **Synchronized Virtualized Dual-Pane:** 60fps scrolling on files with 500,000+ lines using zero-bloat row windowing.
   - **Bird's Eye Diff Minimap:** Real-time visual overview bar for instant spatial awareness.

2. **Advanced Ignore Engine:**
   - **Ignore Whitespace:** Modeled with `None`, `Leading & Trailing (Trim)`, or `All Whitespace`.
   - **Ignore Blank Lines:** Skips empty lines between code blocks.
   - **Ignore Case:** Case-insensitive comparison toggle.
   - **Regex Line Exclusion:** Match and ignore comments, build timestamps (`^// Build at.*`), or generated headers.

3. **Multi-Threaded Folder Comparison:**
   - Powered by parallel directory walking (`rayon` + `walkdir`).
   - Fast mode (Size & Modified date) + Deep mode (CRC32/Blake3 byte hash verification).
   - Filter by status (`Modified`, `Only in Left`, `Only in Right`, `Identical`).
   - Double-click any file to jump straight into side-by-side diff.

4. **Smart CSV & Tabular Compare:**
   - Automatic delimiter detection (`,`, `;`, `\t`, `|`).
   - **Key Column Alignment:** Compares records by primary key column even if rows are sorted differently.
   - Cell-level diff highlighting and change summary statistics.

5. **Resource Efficiency:**
   - Native installer size: **~12MB** (compared to > 150MB Electron apps).
   - Idle RAM: **< 35MB**.
   - Cold startup: **< 250ms**.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `F7` | Jump to Next Diff Chunk |
| `Shift + F7` | Jump to Previous Diff Chunk |
| `Cmd + Z` / `Ctrl + Z` | Undo Chunk Merge |
| `Cmd + Shift + Z` / `Ctrl + Y` | Redo Chunk Merge |
| `Cmd + S` / `Ctrl + S` | Save Active Files |

---

## 🛠️ Tech Stack

- **Desktop Core:** [Tauri v2](https://tauri.app) + [Rust 2021](https://www.rust-lang.org)
- **Diff Algorithms:** `similar` (Myers & Patience), `memmap2`, `crc32fast`, `rayon`, `csv`
- **Frontend Presentation:** React 19, TypeScript 5.8, Vite 8, Tailwind CSS v4
- **Virtualization:** `@tanstack/react-virtual`
- **State Management:** Zustand 5
- **Icons:** Lucide React

---

## 🧪 Testing & Verification

AeroDiff is developed following strict **Test-Driven Development (TDD)**:

```bash
# 1. Run Rust Core Engine Tests (17 tests covering Myers diff, ignore filters, merges, folders, csv)
cd src-tauri
cargo test

# 2. Run Frontend Unit & Integration Tests (Vitest)
pnpm test

# 3. Production Build Verification
pnpm build
```

---

## 📦 Multi-Platform Release (GitHub Actions)

The repository includes pre-configured GitHub Actions workflows:
- `.github/workflows/test.yml`: Continuous Integration running full Rust and Frontend test suites on push and pull requests.
- `.github/workflows/release.yml`: Automated multi-platform matrix building:
  - **macOS:** `.dmg` (Universal binary for Apple Silicon & Intel)
  - **Windows:** `.exe` (NSIS installer) & `.msi`
  - **Linux:** `.deb` & `.AppImage`

---

## 📄 License

MIT License - Copyright © 2026 Doãn Huy <huy.nguyen@amsoftware.com.vn>
