# TODOS — Concreta

Items deferred from the CEO review and design doc. Work these before public launch.

## P1 — Must resolve before launch

### Monetization model decision

**Status:** DEFERRED (CEO review 2026-03-27)

Options to evaluate:
- **Free / OSS** — builds community, no revenue. Best if goal is platform adoption.
- **Freemium** — PDF export behind paywall? Core calcs free, premium output.
- **Subscription** — 10-20€/mo. Recurring revenue, low friction, industry norm.
- **One-time purchase** — 50-100€. Engineers prefer owning tools.

Decision affects: branding, landing page copy, whether to gate any features, pricing page.

**Architecture note:** the MVP shell has no monetization assumptions baked in.
Do not add feature flags or gating logic until this decision is made.

**How to decide:** talk to 5 structural engineers. Ask what they pay for CYPE or similar.
The answer is usually a monthly subscription in the 30-80€ range — which makes 10-20€ look cheap.

### Calc validation strategy

**Status:** DONE for RC Beams (v0.1.0, 2026-03-28). Repeat for each new module before shipping.

RC Beams: 17 Vitest tests — CUMPLE, ADVERTENCIA, INCUMPLE + input validation edge cases. See `src/test/calc/rcBeams.test.ts`.

Steel Beams: DONE (v0.1.1, 2026-03-28) — 14 suites, 79 tests: class detection, M-V interaction, LTB, deflection, generator mode, Lcr>L validation, input validation. See `src/test/calc/steelBeams.test.ts`.

RC Columns, Footings: not yet implemented — test plan required before shipping.

Before shipping any module, run reference calculations by hand (or from CE code examples) and diff against the calc functions. Calc correctness is the product.

### SPECS.md known deviations — update before launch

Two explicit overrides from the CEO review that SPECS.md still reflects incorrectly:
1. Section 8.2 specifies a "Calculate" button — overridden to live recalculation (no button in MVP)
2. Section 19 acceptance criteria includes tablet — originally overridden to desktop ≥900px for MVP, but mobile/tablet support was implemented 2026-03-29 (tabbed layout <768px, full desktop ≥768px)

Update SPECS.md to reflect these decisions before public launch.

### sw.js Cache-Control header

**Status:** DEFERRED

`sw.js` must be served with `Cache-Control: no-cache` or the PWA update mechanism breaks. Currently deferred (vercel.json out of scope for MVP). Add this before deploying to any static host:
- Vercel: `vercel.json` headers rule for `/sw.js`
- Netlify: `_headers` file
- Apache/Nginx: server config

---

## P2 — Post-launch, pre-growth

### Over-reinforcement handling in RC beams (adversarial review finding)

`calcRCBeam` silently continues when x > xLimit (over-reinforced section). Should either fail the check explicitly or add a 'warn' status row. Currently the beam result shows CUMPLE for an over-reinforced section, which is unconservative.

Fix: add a `bending-over` check row that sets status='warn' when x > xLimit.

**Status:** IN SCOPE for RC beams redesign (2026-03-29). Will be fixed in that pass.

### T-beam effective flange width in RC beams (CEO review 2026-03-29)

`calcRCBeam` currently assumes rectangular cross-section for bending resistance. For beam-slab buildings (the majority of real construction), the compression flange dramatically increases MRd — often 2-3x vs. rectangular. Engineers using T-beams will see conservative (over-failing) bending results.

Fix: add `midspan_beff` (effective flange width, mm) and `midspan_hf` (slab thickness, mm) as optional flat state fields. When set, use T-section stress block per CE art. 18.2.4. When not set, default to rectangular (current behavior).

**Why P2:** Conservative result is not wrong — it's safe. But it forces engineers to oversize or ignore the check. After talking to first users, this will likely become P1.

### URL double-write race in useModuleState (adversarial review finding)

When a user rapidly edits multiple fields, `setSearchParams` may fire after `localStorage` has already been written with a newer state. Low risk in practice but could cause a stale URL to persist for 300ms. Consider using a single debounced callback that writes both atomically.

- [ ] Calculation history panel (show last 5 calcs per module)
- [x] Mobile / tablet layout — DONE 2026-03-29 (tabbed layout <768px, full desktop ≥768px)
- [ ] Keyboard shortcuts (Tab through inputs, Enter to focus results)
- [ ] Copy-to-clipboard on individual result values (including rebar schedule line — e.g. "4Ø16 + Ø8/c150 (2T)")
- [ ] Two-tab localStorage sync via `storage` event listener
- [ ] URL versioning (`?v=1&b=300...`) if external integrations are built on top
- [ ] Custom section input for steel profiles (currently bundled IPE/HEA/HEB only)
- [ ] Mat foundations (losas) — 2D plate theory, requires separate module
- [ ] `<title>` tag per module (`Viga HEM — Concreta`) — `document.title` on route change
- [ ] PWA icons — create `public/icons/icon-192.png` and `icon-512.png` (referenced in manifest)

### RC beams PDF — draftsman-quality one-page report (CEO review 2026-03-29)

Current PDF export is an incremental update (both sections, same jsPDF template). The 10x version is a polished one-page compliance report: section diagrams with dimensions, all CE checks with PASS/FAIL pills, rebar schedule, minimum lap note, exposure class and project metadata. Engineers would hand this directly to draftsmen.

Priority: P3 — implement after talking to first users. They'll tell you what format they actually want.

## P3 — Nice to have

- [x] `@media print` CSS rule for browser Ctrl+P — DONE (added to src/index.css 2026-03-27)
- [ ] Content-Security-Policy headers via `vercel.json`
- [ ] Color contrast audit — `accent` (#38bdf8) on `bg-primary` (#0f172a) at 11-12px font-mono. Check WCAG AA for small text (4.5:1 required). The ratio is ~4.9:1 so likely passes but worth confirming with a tool before public launch.
