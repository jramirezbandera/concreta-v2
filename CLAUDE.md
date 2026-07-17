# Concreta — Project Context

## What it is

Concreta is a structural engineering calculation web app for everyday professional use. Simple, visual, fast. It is not a CYPE or SAP: it is a desk tool for routine calculations.

## Specification

The in-depth app specs are in [SPECS.md](./SPECS.md).

## Stack

- React 19 + Vite
- Tailwind CSS v4
- React Router
- lucide-react (icons)
- jsPDF + svg2pdf.js (PDF exports)
- Static PWA

## Versioning

Before you deploy the web to github pages, bump the version in package.json. Use calendar versioning: For example, if today is january 1st 2025, use `250101.0`. If doing more than one deploy on the same day increment the patch number sequentially, eg. `250101.1`

## Code Standards

- Spanish Structural Code (CE) — reinforced concrete and steel
- CTE DB-SE — actions, combinations, limit states, foundations
- Automatic partial safety factors: γc=1.5, γs=1.15, γM0=1.05, γM1=1.05

## MVP Modules

1. Reinforced concrete: beams (bending, shear, cracking) and columns (combined bending + compression, buckling)
2. Steel: rolled beams (bending, shear, interaction, LTB, deflection)
3. Foundations: isolated footings and mat foundations

## Design Inspirations

- [Vercel](https://vercel.com)
- [Tailwind CSS](https://tailwindcss.com)

Keep it modern simple and professional, everything must be explained visually, live svg rendering of the input data and output, visual checkers implemented. 

## Color Palette (dark theme — "Ónice")

The color palette is defined as Tailwind theme variables in `src/index.css`.
The dark theme is "Ónice": a deep neutral-black base (no blue tint), high contrast.
Only the neutral base + neutral chart tokens are monochrome; the sky accent and the
semantic state colours are kept from the brand palette.

### Reference:

Base:
- bg-primary: #0c0c0e   (near-black — page background, input fields and canvas)
- bg-surface: #161619   (panels, sidebar, result blocks)
- bg-elevated: #202024  (cards / raised blocks)
- border-main: #2c2c34  (primary border — lifts off elevated)
- border-sub: #202027   (dividers / card edges)
- text-primary: #fafafa
- text-secondary: #9a9ea7 (labels, code references)
- text-disabled: #6b6f79  (labels/refs/helptext, 10px group headers, unavailable modules)
- accent: #38bdf8        (sky-400 — interactive elements only: focus, active nav, bar fill)
- accent-hover: #0ea5e9

Semantic state colors (add to Tailwind CSS v4):
- state-ok:      #22c55e  (green-500 — utilization < 95%)
- state-warn:    #f59e0b  (amber-500 — utilization 95–99%)
- state-fail:    #f56565  (red-450   — utilization ≥ 100%; lifted from #ef4444 so fail text clears AA on the near-black panel)
- state-neutral: #64748b  (slate-500 — no data state)

## Typography

Text scale:
- `text-xs`: code references, unit labels
- `text-sm`: field labels, section headers
- `text-base`: input values, result rows
- `text-lg`: block verdict row
- `text-xl`: module title (topbar, semibold)

## gstack

Use /browse from gstack for all web browsing. Never use mcp__claude-in-chrome__* tools.
Available skills: /office-hours, /plan-ceo-review, /plan-eng-review, /plan-design-review,
/design-consultation, /review, /ship, /land-and-deploy, /canary, /benchmark, /browse,
/qa, /qa-only, /design-review, /setup-browser-cookies, /setup-deploy, /retro,
/investigate, /document-release, /codex, /cso, /autoplan, /careful, /freeze, /guard,
/unfreeze, /gstack-upgrade.