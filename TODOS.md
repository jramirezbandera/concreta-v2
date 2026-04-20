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

Punching: DONE (2026-04-06) — 59 tests: ρl from bar dims, tipo-viga Asw by position, vRdcs formula, failing VEd paths, invalid inputs. PDF export shipped. Hand-calc validation pending: run a reference calculation by hand (e.g. interior column 300×300, d=200, fck=25, Ø12@150, VEd=300kN) and diff against calcPunching() before shipping.

Sección Compuesta: DONE (2026-04-06) — 35 tests: FTUX defaults, bare profile, centroid arithmetic, Wpl/Wel_min, EC3 classification (web + flanges), Mrd formula (class 1/2/3/4), custom mode, plate stacking, validation guards, custom y-position. Hand-calc confirmed in design doc: IPE 300 + 200×15 → Iy=13140.7 cm⁴, yc=206.4mm, Wel_min=637 cm³, Class 1 (CE art. 5.2, ε=0.924). See `src/test/calc/compositeSection.test.ts`. PDF export shipped.

Vigas de madera (EC5): DONE (2026-04-09) — 70 tests: kmod/kdef/gammaM, ELU forces, kh size factor (sawn+glulam), kcr=0.67, LTB three-zone formula, ELS deflections, ksys §6.6, fire dchar/def/residual section, kdef SC2/SC3, load durations, beamType cases, fire-section-lost. See `src/test/calc/timberBeams.test.ts`. PDF export shipped. Hand-calc validation pending: run a fire check by hand (e.g. C24 200×400 R60, 3 faces) and verify against calcTimberBeam() before shipping.

Pilares de madera (EC5): DONE (2026-04-10) — 80 tests: input validation (Nd/Vd/Md/beta/b/L), material params, section geometry, slenderness §6.3.2, stresses (σc/σm/τd), §6.3.3 interaction (eq 6.23+6.24, strong/weak axis, pure axial), fire section reduction (3+4 faces, section-lost, etaFi=0/1), kmod matrix, beta factors, hardwood (D40 betaN=0.70), glulam (GL28h). See `src/test/calc/timberColumns.test.ts`. Hand-calc validation pending: run a buckling check by hand (C24 160×160, L=3m, β=1.0, Nd=80kN, Md=8kNm) using the comment header in the test file — λrel≈1.102, kc≈0.614, fc0_d≈12.92 N/mm², confirm util_623 and util_624 match. Also run a fire check by hand (C24 160×160, R60, 4 faces, η_fi=0.65) to verify dchar=48mm, def=55mm, b_ef=h_ef=50mm before shipping.

Zapatas aisladas: DONE — tests + PDF export shipped. Hand-calc validation pending before shipping.
Encepados de pilotes: DONE — tests + PDF export shipped. Hand-calc validation pending before shipping.

Placas de anclaje (anchor-plate, eng-review + design-review 2026-04-19): PR-1 scaffold + PR-2 full planned. **BLOCKS PR-2 merge:**
- Run 3 CYPE oracle cases (HEB-200 NEd=200/Mx=45/My=10, HEA-160 axis-aligned, IPE-300 biaxial-fuerte) — record 10-check numbers into `src/test/calc/anchorPlate.test.ts`.
- Resolve 4 Cross-Model Findings: `pedestal_cX/cY` mapping (T-stub α vs cone Ac,N), µ per EN 1992-4 §6.2.2 (0.2 smooth / 0.4 roughened, use Nc,G not Nc), compression block model (§6.2.5 T-stub effective area vs plastic uniform block — pick one and document), stiffener check (weld+bearing vs remove the h/t limit). See design doc `Javier-forjados-design-20260419-220944.md` section "Cross-Model Findings".
- Resolve 5 CRITICAL design findings (D1–D5): results grouping (4 GroupHeader sub-bands: Placa/Pernos/Anclaje-hormigón/Rigidizadores), amber `converged:false` badge (copy `· APROX (grid)` + tooltip + PDF footer), `validateAnchorPlate()` warnings channel (field-level inline + global amber strip, not toast), solver total-failure state (`· SIN SOLUCIÓN` verdict + disabled PDF), responsive collapse <1024px (SVG sticky → Results → Inputs). See design doc "Design Review Findings" section.
- Resolve 11 IMPORTANT design findings (D6–D16): per-bolt sub-panel promotion to own CollapsibleSection, input section reorder (Perfil→Acciones→Placa→Pernos→Rigidizadores→Pedestal), pre-fill Assignment case defaults, loading state (last-valid SVG + disabled rows, no spinner), 5-second alzado tell (column silhouette + bolts down), icon-grid glyph style (schematic stroke only), compression hatching not "sombra", keyboard nav on icon-grids (radiogroup + arrows), ambient verdict aggregation rule (worst-of-10), design tokens subsection explicit, PDF per-bolt overflow >6 bolts (page 2 with alzado header repeat).

Before shipping any module, run reference calculations by hand (or from CE code examples) and diff against the calc functions. Calc correctness is the product.

### SPECS.md known deviations — update before launch

One remaining override from the CEO review that SPECS.md still reflects incorrectly:
1. Section 8.2 specifies a "Calculate" button — overridden to live recalculation (no button in MVP)

Update SPECS.md to reflect this decision before public launch.

### sw.js Cache-Control header

**Status:** DEFERRED

`sw.js` must be served with `Cache-Control: no-cache` or the PWA update mechanism breaks. Currently deferred (vercel.json out of scope for MVP). Add this before deploying to any static host:
- Vercel: `vercel.json` headers rule for `/sw.js`
- Netlify: `_headers` file
- Apache/Nginx: server config

---

## P2 — Post-launch, pre-growth

### Refactor: extract IconGridSelector<T> shared component (eng-review 2026-04-19)

`src/features/steel-columns/SteelColumnsInputs.tsx:168` has a local `BCSelector` icon-grid component (radio-button grid with SVG icons, keyboard arrow navigation, `aria-pressed`). Anchor-plate PR-2 needs the same pattern for `bolt_nLayout` (4/6/8/9) and `rib_count` (0/2/4). Extract to `src/components/ui/IconGridSelector<T>` as a standalone refactor PR before anchor-plate PR-2. Generic on option value type. Snapshot-test against current steel-columns render to catch regression.

**Why P2:** unblocks anchor-plate PR-2 but doesn't gate any shipped module today. Safe standalone worktree.

### Landing: trust signals — testimonials strip (CEO review 2026-04-10)

After the first 10 real users, ask each for a one-sentence quote about their specific use case
(e.g. "Uso Concreta para revisar vigas antes de modelar en CYPE. Ahorra 20 minutos por proyecto.").

When 3 quotes are collected, add a testimonials strip to `Landing.tsx` between the Features strip
and the Modules section. Same design language as the Features strip — no avatars, just the quote,
name, and discipline. Avoid placeholder copy at launch; wait for real quotes.

**Where to start:** `src/pages/Landing.tsx` — add a `TESTIMONIALS` array and a strip section
between `<div className="h-px bg-border-main" />` (after Features) and the Modules section.

**Why P2:** Can't add fake testimonials. Landing is accurate today. Trust signals matter
most when competing for engineers who heard about Concreta from a colleague — they'll check
the landing before trying it.

### Retaining wall: NCSP-07 S·Ab cap warning (eng-review 2026-04-01)

When S·Ab > 0.1, NCSP-07 §2.2 requires recalculating S using a site-specific formula (not a simple constant). The current module uses S directly from user input with no validation. For most of Spain (low seismicity), S·Ab < 0.1 and this is fine. For soft soils (S=1.6) + moderate seismicity (Ab=0.08), S·Ab=0.128 — in range where the cap applies.

Fix: add a warning in the inputs panel when `S * Ab > 0.1`: "S·Ab > 0.1: verificar S según NCSP-07 §2.2" and link to table.

**Why P2:** Conservative safe side (higher kh). No structural risk. UI concern only.

### Retaining wall: passive resistance Ep reduction (eng-review 2026-04-01)

CTE DB-SE-C §7.3.2 notes that passive resistance should be excluded or reduced when toe embedment is unreliable (shallow hf, frost zone, disturbed soil in front of toe). Currently Ep is included at full Rankine Kp with no reduction factor or check on minimum hf.

Fix: add a user-facing note in the results: "Ep incluida — verificar que la zapata esté por debajo de la línea de helada y el terreno frente a la punta no esté alterado" or add a checkbox to exclude Ep.

**Why P2:** Including Ep is the unconservative side. In practice most engineers include it, but the user should be aware.

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
- [ ] SVG a11y: add `<title>` and `<desc>` tags to all module diagrams (M/V/δ, I-section, punzonamiento perimeter, zapata plan, etc.). Currently screen readers get nothing from the SVG canvas. Pan-module pass after the diagram legibility work lands. Est ~15 min CC per module × 13 modules.
- [ ] PDF font embedding QA: after the diagram legibility fix (steel-beams design doc 2026-04-19) lands, run a PDF export and verify Geist Sans/Mono actually render in the exported PDF. svg2pdf + jsPDF silently fall back to Helvetica if the font isn't registered via `doc.addFont()`. If fallback is observed, either register Geist explicitly or switch the PDF `fontFamily` to `ui-monospace, monospace` (grayscale mode already uses #333/#555/#888 so the visual impact is small). ~10 min QA.
- [ ] `ff` sagging label ratio (design doc 2026-04-19): the hard-coded 0.5 ratio for `ff` midspan sagging is exact for a uniformly distributed load and approximate otherwise. Today `calcSteelBeam` only supports UDL. If point loads or triangular loads are ever added to the steel-beams module (or any other beam module uses the same diagram pattern), replace `MEd × 0.5` with a value derived from the actual load case. Cheap to fix at the source when it arrives.

### rcBeams: report As_req alongside bending check

**Status:** DEFERRED (eng review 2026-03-31)

After `solveRCBending` is added to `types.ts` for the retaining wall module, rcBeams
could use it to display As_req (required steel area) in the key values panel alongside
the existing MRd check. Currently rcBeams only shows MRd vs Md and the user must
mentally invert it. As_req gives direct design guidance.

**Where to start:** `src/lib/calculations/rcBeams.ts` `calcSection()` — call
`solveRCBending(inp.Md, inp.b, d, fcd, fyd)` and add `As_req` to `RCBeamSectionResult`.
Then display it in `RCBeamsResults.tsx` ValueRow section.

**Depends on:** none (solveRCBending already exists in types.ts, shipped with retaining wall).

### empresillado: EC3 §6.4.2.1 minimum lp and maximum s normative checks

**Status:** DEFERRED (eng review 2026-04-09)

EC3 §6.4.2.1(5) imposes two normative limits that the current validation does not enforce:
- **Minimum lp:** lp ≥ 0.75 × a, where a is the clear distance between chord centroids in the battened face (approximately hx or hy minus the chord leg width b). A user can enter lp=2cm on a 70cm column face and get a valid result with misleading pletina checks.
- **Maximum s:** s ≤ min(15 × i₁, 70 × iv, a). Violating this limit invalidates the §6.4.3.1 effective slenderness formula — the formula assumes the chord is adequately braced between battens.

These should be **warn-level** (not fail-level, not hard errors) check rows in `calcEmpresillado()` — the formula still produces numbers, but the user should be told the geometry is outside the EC3 applicability domain. Use `makeCheck()` with a threshold > 1.0 to show warn state.

**Where to start:** `src/lib/calculations/empresillado.ts` — add after the `s0_cm` validation, compute `a_x = hx - b_cm` and `a_y = hy - b_cm`, then add warn checks to the `checks` array. Also need EC3 i₁ = sqrt(I1/A) for the max-s check.

**Test:** Add a suite in `empresillado.test.ts` — enter lp=1cm, s=200cm on a 30cm column, expect checks to include a warn-status row.

**Depends on:** none.
