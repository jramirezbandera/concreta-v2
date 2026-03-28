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

## Color Palette (dark theme)

The color palette is defined as Tailwind theme variables in `src/index.css`.

### Reference:

Base:
- bg-primary: #0f172a   (slate-950 — page background and input fields)
- bg-surface: #1e293b   (slate-800 — panels, result blocks)
- border-main: #334155  (slate-600)
- text-primary: #f8fafc
- text-secondary: #94a3b8 (slate-400 — labels, code references)
- text-disabled: #475569 (slate-600 — unavailable modules)
- accent: #38bdf8        (sky-400 — interactive elements only: focus, active nav, bar fill)
- accent-hover: #0ea5e9

Semantic state colors (add to Tailwind CSS v4):
- state-ok:      #22c55e  (green-500 — utilization < 80%)
- state-warn:    #f59e0b  (amber-500 — utilization 80–99%)
- state-fail:    #ef4444  (red-500   — utilization ≥ 100%)
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