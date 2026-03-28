# Changelog

All notable changes to Concreta are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.1.1] - 2026-03-28

### Added
- Steel Beams: load generator mode — select use category (CTE DB-SE-AE tabla 3.1), permanent load, variable load, and tributary width; derives MEd/VEd/Mser automatically using γG=1.35, γQ=1.50
- Steel Beams: M/V/δ diagram panel (SVG) showing bending moment parabola, linear shear diagram with sign, and deflection curve color-coded by ok/warn/fail status — visible in generator mode
- Steel Beams: mode tab bar with ARIA roles (tablist/tab/aria-selected) switching between load generator and manual input; switching to manual pre-populates inputs from derived values
- Steel Beams: Lcr input now stored in mm, displayed in meters (consistent with L field)
- Steel Beams: M-V interaction row skipped in generator mode (V=0 at midspan for simply-supported UDL — mathematically correct, not conservative)
- Steel Beams: Lcr > L validation warning row — neutral check row injected when buckling length exceeds span (conservative result, not unconservative, but worth reviewing)
- `loadGen.ts`: `deriveFromLoads()` pure function for UDL load derivation, exported with GAMMA_G/GAMMA_Q constants
- Vitest: 14 test suites (79 tests) for steel beams, covering generator mode, M-V interaction, LTB, deflection, and Lcr > L warning

### Changed
- Steel Beams: M/V diagrams PDFs clone updated to use `effectiveInputs` (consistent with screen rendering)
- Steel Beams: manually editing q (sobrecarga de uso) auto-selects "Personalizada" in the use category dropdown — prevents stale category label after custom qk override
- Steel Beams: load type dropdowns (LTB, deflection) disabled when generator mode is active (UDL is forced by the generator)

### Fixed
- Steel Beams PDF: Lcr displayed as `X.XX m` instead of `XXXX mm` (unit consistency with UI)
- Steel Beams: removed unused `wEd` prop from `SteelBeamsDiagrams` component

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
