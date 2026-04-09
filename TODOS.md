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

RC Columns: DONE (v0.2.0, 2026-03-30) — 67 tests: biaxial bending, per-axis slenderness, 15 CE checks. See `src/test/calc/rcColumns.test.ts`.

Retaining walls: DONE (2026-04-01) — 57 tests + 20 rebar tests (after rebar feature), but hand-calc validation against CE/CTE examples not yet done. Run a reference calculation by hand (CE art. 18.2, CTE DB-SE-C §4.4) and diff against calcRetainingWall() before shipping. After rebar feature: also hand-check As_prov vs As_req for Ø16 c/200 on trasdós (H=3m, fck=25, fyk=500) — confirm As_prov=1005 mm²/m vs As_req computed by hand matches calc output.

Punching: DONE (2026-04-06) — 59 tests: ρl from bar dims, tipo-viga Asw by position, vRdcs formula, failing VEd paths, invalid inputs. But hand-calc validation against CE art. 6.4 examples not yet done. Run a reference calculation by hand (e.g. interior column 300×300, d=200, fck=25, Ø12@150, VEd=300kN) and diff against calcPunching() before shipping. Also add PDF export (src/lib/pdf/punching.ts) before shipping.

Sección Compuesta: DONE (2026-04-06) — 35 tests: FTUX defaults, bare profile, centroid arithmetic, Wpl/Wel_min, EC3 classification (web + flanges), Mrd formula (class 1/2/3/4), custom mode, plate stacking, validation guards, custom y-position. Hand-calc confirmed in design doc: IPE 300 + 200×15 → Iy=13140.7 cm⁴, yc=206.4mm, Wel_min=637 cm³, Class 1 (CE art. 5.2, ε=0.924). See `src/test/calc/compositeSection.test.ts`. PDF export pending before shipping.

Footings: not yet implemented — test plan required before shipping.

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

### Retaining wall: NCSP-07 S·Ab cap warning (eng-review 2026-04-01)

When S·Ab > 0.1, NCSP-07 §2.2 requires recalculating S using a site-specific formula (not a simple constant). The current module uses S directly from user input with no validation. For most of Spain (low seismicity), S·Ab < 0.1 and this is fine. For soft soils (S=1.6) + moderate seismicity (Ab=0.08), S·Ab=0.128 — in range where the cap applies.

Fix: add a warning in the inputs panel when `S * Ab > 0.1`: "S·Ab > 0.1: verificar S según NCSP-07 §2.2" and link to table.

**Why P2:** Conservative safe side (higher kh). No structural risk. UI concern only.

### Retaining wall: passive resistance Ep reduction (eng-review 2026-04-01)

CTE DB-SE-C §7.3.2 notes that passive resistance should be excluded or reduced when toe embedment is unreliable (shallow hf, frost zone, disturbed soil in front of toe). Currently Ep is included at full Rankine Kp with no reduction factor or check on minimum hf.

Fix: add a user-facing note in the results: "Ep incluida — verificar que la zapata esté por debajo de la línea de helada y el terreno frente a la punta no esté alterado" or add a checkbox to exclude Ep.

**Why P2:** Including Ep is the unconservative side. In practice most engineers include it, but the user should be aware.

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

### Creep magnification factor Kφ in RC Columns second-order calc (eng review 2026-03-30)

`calcRCColumn` omits CE art. 43.5.3(3) creep factor `Kφ = 1 + β·φ_ef`. For slender columns
under sustained loads (offices: `φ_ef ≈ 2`), second-order eccentricity `e2` is underestimated
by 35–75%. The current result is conservative relative to Kr (safe) but not for creep.

Fix: add optional `phi_ef` input (default 0 = short-term, no creep). When `phi_ef > 0`:
```
Kφ = 1 + 0.35 * phi_ef   (CE art. 43.5.3, simplified)
e2 = Kφ * curv * Lk² / c
```

Priority: P2 — ask first users whether they care about sustained loads. May become P1.

### RC beams PDF — draftsman-quality one-page report (CEO review 2026-03-29)

Current PDF export is an incremental update (both sections, same jsPDF template). The 10x version is a polished one-page compliance report: section diagrams with dimensions, all CE checks with PASS/FAIL pills, rebar schedule, minimum lap note, exposure class and project metadata. Engineers would hand this directly to draftsmen.

Priority: P3 — implement after talking to first users. They'll tell you what format they actually want.

## P3 — Nice to have

- [x] RC Columns results: conditionally hide e2 and e_imp value rows when lambda ≤ 25 — DONE 2026-03-30 (bundled with biaxial bending implementation).
- [ ] RC Columns: per-axis beta (beta_y, beta_z) instead of single shared beta. Useful for columns with asymmetric end conditions (e.g. fixed-pinned in one direction, fixed-fixed in the other). Currently `Lk = L × beta` is the same for both axes. Minor change in `defaults.ts` + `rcColumns.ts` + `RCColumnsInputs.tsx`. ~30 min.
- [x] `@media print` CSS rule for browser Ctrl+P — DONE (added to src/index.css 2026-03-27)
- [ ] Content-Security-Policy headers via `vercel.json`
- [ ] Color contrast audit — `accent` (#38bdf8) on `bg-primary` (#0f172a) at 11-12px font-mono. Check WCAG AA for small text (4.5:1 required). The ratio is ~4.9:1 so likely passes but worth confirming with a tool before public launch.

### rcBeams: report As_req alongside bending check

**Status:** DEFERRED (eng review 2026-03-31)

After `solveRCBending` is added to `types.ts` for the retaining wall module, rcBeams
could use it to display As_req (required steel area) in the key values panel alongside
the existing MRd check. Currently rcBeams only shows MRd vs Md and the user must
mentally invert it. As_req gives direct design guidance.

**Where to start:** `src/lib/calculations/rcBeams.ts` `calcSection()` — call
`solveRCBending(inp.Md, inp.b, d, fcd, fyd)` and add `As_req` to `RCBeamSectionResult`.
Then display it in `RCBeamsResults.tsx` ValueRow section.

**Depends on:** retaining wall module (introduces solveRCBending to types.ts first).

### empresillado: EC3 §6.4.2.1 minimum lp and maximum s normative checks

**Status:** DEFERRED (eng review 2026-04-09)

EC3 §6.4.2.1(5) imposes two normative limits that the current validation does not enforce:
- **Minimum lp:** lp ≥ 0.75 × a, where a is the clear distance between chord centroids in the battened face (approximately hx or hy minus the chord leg width b). A user can enter lp=2cm on a 70cm column face and get a valid result with misleading pletina checks.
- **Maximum s:** s ≤ min(15 × i₁, 70 × iv, a). Violating this limit invalidates the §6.4.3.1 effective slenderness formula — the formula assumes the chord is adequately braced between battens.

These should be **warn-level** (not fail-level, not hard errors) check rows in `calcEmpresillado()` — the formula still produces numbers, but the user should be told the geometry is outside the EC3 applicability domain. Use `makeCheck()` with a threshold > 1.0 to show warn state.

**Where to start:** `src/lib/calculations/empresillado.ts` — add after the `s0_cm` validation, compute `a_x = hx - b_cm` and `a_y = hy - b_cm`, then add warn checks to the `checks` array. Also need EC3 i₁ = sqrt(I1/A) for the max-s check.

**Test:** Add a suite in `empresillado.test.ts` — enter lp=1cm, s=200cm on a 30cm column, expect checks to include a warn-status row.

**Depends on:** none.
