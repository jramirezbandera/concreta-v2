# Changelog

All notable changes to Concreta are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.1.0] - 2026-03-28

### Added
- Landing page with scroll-reveal animations, module cards, and feature strip
- RC Beams module: full CE-compliant bending, shear, and crack width calculations
- Live SVG cross-section rendering (screen and PDF modes) that updates on every input change
- PDF export for RC beams using jsPDF + svg2pdf.js
- App shell: sidebar navigation with structural icons, topbar with copy-link and export-PDF actions
- URL state persistence: full calculation state serialized to query params (shareable links)
- localStorage persistence with schema versioning and per-module keys
- Module registry with shipped/placeholder states for future modules
- Vitest test suite: 17 tests covering CUMPLE, ADVERTENCIA, INCUMPLE, and edge cases for RC beams
- Geist Sans/Mono fonts via local woff2 with font-display: swap
- Tailwind CSS v4 dark theme with semantic state tokens (ok/warn/fail/neutral)
- Canvas dot-grid background ("mesa de trabajo del ingeniero")
- PWA manifest with service worker registration (prompt mode)
- DESIGN.md v2.0 design system documentation
- TODOS.md with deferred items from CEO and design reviews

### Fixed
- Added exposure class validation in RC beam calculations to prevent URL-injected invalid classes from producing unconservative crack width limits (wk fallback was 0.3 mm regardless of XC4's required 0.2 mm)
