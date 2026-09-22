---
version: 1.0.0
name: AeroDiff Design Specification
description: Space-optimized, high-density, anti-slop visual system for AeroDiff high-performance comparison suite.
colors:
  bg-app: "#09090b"
  bg-toolbar: "#121215"
  bg-pane-left: "#09090b"
  bg-pane-right: "#09090b"
  bg-gutter: "#141418"
  border: "#27272a"
  border-subtle: "#18181b"
  text-primary: "#f4f4f5"
  text-secondary: "#a1a1aa"
  text-muted: "#71717a"
  accent: "#10b981"
  accent-hover: "#34d399"
  diff-added-bg: "rgba(16, 185, 129, 0.15)"
  diff-added-inline: "rgba(16, 185, 129, 0.35)"
  diff-added-gutter: "#10b981"
  diff-deleted-bg: "rgba(244, 63, 94, 0.15)"
  diff-deleted-inline: "rgba(244, 63, 94, 0.35)"
  diff-deleted-gutter: "#f43f5e"
  diff-modified-bg: "rgba(234, 179, 8, 0.15)"
  diff-modified-inline: "rgba(234, 179, 8, 0.35)"
  diff-modified-gutter: "#eab308"
  diff-empty-bg: "#101014"
typography:
  ui:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: "400"
    lineHeight: "1.4"
  diff:
    fontFamily: "'JetBrains Mono', 'SF Mono', Menlo, Monaco, Consolas, monospace"
    fontSize: "13px"
    fontWeight: "400"
    lineHeight: "20px"
rounded:
  xs: "2px"
  sm: "4px"
  md: "6px"
  lg: "8px"
spacing:
  xs: "2px"
  sm: "6px"
  md: "10px"
  lg: "14px"
  xl: "20px"
components:
  header:
    height: "44px"
    background: "{colors.bg-toolbar}"
    borderBottom: "1px solid {colors.border}"
  options-bar:
    height: "36px"
    background: "{colors.bg-app}"
    borderBottom: "1px solid {colors.border-subtle}"
  gutter:
    width: "48px"
    background: "{colors.bg-gutter}"
    color: "{colors.text-muted}"
  status-bar:
    height: "26px"
    background: "{colors.bg-toolbar}"
    borderTop: "1px solid {colors.border}"
---

# AeroDiff — Design Specification

## 1. Overview
AeroDiff is a precision, high-density desktop comparison suite for developers, QA engineers, and data analysts.
The interface is designed according to **zero wasted space, 60fps virtualization, razor-sharp typography, and instant visual contrast**.

## 2. Color System & Contrast
- **Base Canvas:** Deep Carbon (`#09090b`), reducing eye fatigue when reading millions of code lines.
- **Diff Color Harmonies:**
  - **Additions (Green):** Emerald `#10b981` (15% background wash, 35% intra-line token wash).
  - **Deletions (Red):** Rose `#f43f5e` (15% background wash, 35% intra-line token wash).
  - **Modifications (Yellow):** Warm Amber `#eab308` (15% background wash, 35% intra-line token wash).
  - **Empty Alignment Rows:** Stippled dark carbon (`#101014`) with subtle diagonal crosshatch pattern to signal padded space.
- **Purple Ban Compliance:** 100% free of purple, violet, or artificial neon gradients.

## 3. Typography & Row Sizing
- Fixed line height of `20px` across both left and right panes ensures lockstep scroll synchronization without jitter.
- Monospace font stack prioritized: `JetBrains Mono`, `SF Mono`, `Menlo`, `Consolas`.

## 4. Space Optimization
1. Toolbars are condensed to `44px` and options to `36px` to grant `> 90%` of screen height directly to diff comparison.
2. Floating diff navigation HUD and minimap bar provide bird's-eye spatial awareness without cluttering gutters.
