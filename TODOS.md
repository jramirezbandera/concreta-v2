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

Sección circular CHS (tubos) en Pilares de acero: DONE (2026-04-20) — polymorphic section adapter (`SectionGeometry` + `ColumnBeamSection`), CHS hot-finished (EN 10210 curva a) + cold-formed (EN 10219 curva c), biaxial collapse via M_res = √(My²+Mz²), closed-section LTB short-circuit (Mcr → ∞ → χ_LT = 1), Class 4 "SIN SOLUCIÓN" verdict + disabled PDF, results grouping by EC3 §, 3 CHS acceptance tests. See `src/lib/sections/chs.ts` + 3 tests in `src/test/calc/steelColumns.test.ts`. Refactored all 5 callers (steelColumns, steelBeams, compositeSection, anchorPlate, SteelColumnsSVG).

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

**Status:** DONE (2026-04-20, bundled with CHS ship) — extracted to `src/components/ui/IconGridSelector.tsx`, generic on option value type. Steel-columns BC selector now consumes it; anchor-plate PR-2 can reuse for `bolt_nLayout` (4/6/8/9) and `rib_count` (0/2/4).

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

### units-toggle: audit shared calc files antes de ship

**Status:** DEFERRED (plan-eng-review 2026-04-21). Blocks shipping `feat/units-toggle`.

El design doc del toggle kg/cm² ↔ kN/m² inventarió los 14 módulos en `src/features/` pero no los archivos compartidos en `src/lib/calculations/`: `beamCases.ts`, `loadGen.ts`, `rcSlabs.ts`, `rcTSection.ts`, `steelColumnBC.ts`. Pueden contener strings hardcoded con unidades (ej. `value: "${x.toFixed(1)} kN"`) que se escaparían del barrido si nadie los revisa. Correr un grep por `'kN'|'kNm'|'N/mm'|'MPa'` en esos 5 archivos antes de mergear `feat/units-toggle`; si hay matches, migrar con el mismo patrón `CheckRow { valueNum, valueQty }`.

**Where to start:** `git grep -nE '"(kN|kNm|N/mm|MPa|kg/cm)' src/lib/calculations/{beamCases,loadGen,rcSlabs,rcTSection,steelColumnBC}.ts`

**Depends on:** `feat/units-toggle` branch creado.

### units-toggle: PDF snapshot tests (post-V1)

**Status:** DEFERRED (plan-eng-review 2026-04-21).

V1 del toggle de unidades usa QA visual manual por módulo (14 PDFs × 2 sistemas = 28 snapshots que mirar a mano por release). Barato con CC+gstack construir snapshot tests de texto extraído del PDF (jsPDF permite `doc.output('text')`). No se hace en V1 para no inflar scope, pero si cada release duele re-mirar 28 PDFs, invertir en esto.

**Where to start:** `src/test/pdf/` (crear), un test por módulo que genera el PDF con un input fijado, extrae el texto, compara contra un snapshot. Uno para SI, uno para técnico.

**Depends on:** `feat/units-toggle` mergeado.

### units-toggle: validación cualitativa con refunfuñones post-ship

**Status:** DEFERRED (plan-eng-review 2026-04-21). Gate de "done real" para el feature.

El design doc tiene como Success Criterion: "enseñar a 2-3 de los refunfuñones originales y medir su reacción — ¿siguen refunfuñando? ¿aparece otra fricción?". Sin ejecutar esta validación, "done" es una creencia, no un hecho. Registrar aquí para no perderlo al cerrar la PR.

**Cómo medir:** contacto directo con 3 ingenieros sénior (>50 años) que ya usan Concreta. Mostrarles el toggle, dejarlos trabajar 10 min, pedir feedback literal. Éxito = ≥2/3 dejan de hacer conversiones mentales y no introducen una nueva queja estructural sobre unidades.

**Depends on:** `feat/units-toggle` desplegado.

### units-toggle: criterio de regresión SI — texto idéntico, no byte-idéntico

**Status:** CLARIFICATION (plan-eng-review 2026-04-21, codex flag).

El test plan dice "SI output byte-idéntico al pre-refactor". Codex (correctamente) señala que un PDF byte-idéntico es prácticamente imposible (jsPDF embebe timestamps, IDs internos, orden de objetos puede variar entre corridas). El criterio operativo correcto es **texto extraído idéntico + screenshot diff visual = 0 píxeles diferentes** en los 14 módulos en SI. Si el texto cambia o el visual diff > umbral, falla. No comparar bytes crudos.

**Where to start:** `src/test/units/regression-si.test.ts` cuando se implemente el snapshot framework. Mientras tanto, en QA manual: comparar Results en pantalla + valores numéricos del PDF (extracción manual o `doc.output('text')`), no hashes de archivo.

**Depends on:** `feat/units-toggle` en implementación.

### units-toggle: labels.ts no es la fuente de verdad para quantity de inputs

**Status:** CLARIFICATION (plan-eng-review 2026-04-21, codex flag).

El review acordó añadir `quantity?: Quantity` al `Label` en `src/lib/text/labels.ts`. Codex avisa que esto acopla la capa de texto/i18n con la capa de unidades (un símbolo puede aparecer en contextos con magnitudes distintas — ej. 'M' como momento o como masa). La regla: **el `quantity` en `Label` es un default conveniente, no la verdad**. La verdad vive en cada call site del `<UnitNumberInput quantity="...">` y de `formatQuantity(value, quantity, system)`. Si un input usa un label cuyo `quantity` no coincide con el contexto, el call site sobrescribe explícitamente. Documentar esto en el JSDoc de `Label.quantity`.

**Where to start:** cuando se añada el campo, escribir el JSDoc así: `/** Default quantity for inputs using this label. Call sites may override via explicit prop. */`.

**Depends on:** `feat/units-toggle` en implementación.

### units-toggle: CheckRow shape soporta valores no-numéricos vía fallback string

**Status:** SPEC (plan-eng-review 2026-04-21, codex flag — decision iteration 8).

El refactor del CheckRow no puede asumir que todos los checks son `{ valueNum, valueQty }`. Hay casos legítimos hoy: `'∞'` (isolatedFooting.ts:468 cuando no hay vuelco), strings tipo `'3 barras'`, ratios adimensionales, booleanos cumple/no-cumple. **Shape final:**

```ts
type CheckRow = {
  id: string;
  description: string;
  // numeric+dimensional → toggle aplica
  valueNum?: number;
  valueQty?: Quantity;
  limitNum?: number;
  limitQty?: Quantity;
  // fallback (∞, '3 barras', ratios, booleans) → renderiza tal cual
  valueStr?: string;
  limitStr?: string;
  utilization: number;
  status: CheckStatus;  // ok | warn | fail | neutral
  article: string;
  tag?: string;  // ex-SteelCheckRow.tag
};
```

Renderer: si `valueNum != null && valueQty` → `formatQuantity(valueNum, valueQty, system)`. Si no → `valueStr ?? '—'`. Mismo patrón para limit. Esto cubre los 3 tipos de check sin discriminated union (más fricción para 60+ call sites).

**Where to start:** `src/lib/calculations/types.ts` — refactor `CheckRow` + `makeCheck`. Añadir overloads o segundo constructor `makeCheckFromStr(id, desc, valueStr, limitStr, util, status, article)` para los casos no-numéricos.

**Depends on:** `feat/units-toggle` branch creado, antes del piloto triple.

---

## P0 — FEM 2D V1 (post-ship trust gates)

Capturados durante /plan-eng-review 2026-04-28 sobre el design doc Javier-main-design-20260428-151551.md.

### V1.2 — Generalize `<ResultsUnsolvable>` to shared error-state pattern

**Status:** DEFERRED. Capturado en /plan-eng-review re-pass 2026-04-29 sobre Javier-main-design-20260429-162232.md.

**What:** V1.1 introduce `<ResultsUnsolvable>` local en `src/features/fem-analysis/embedded/` para renderizar el estado de modelo inestable (mecanismo, sin apoyos). El componente reutiliza `state-fail` ambient + ResultsHeader con label "INESTABLE". Cuando el segundo módulo necesite un error state análogo (ej: muros con suelo no resoluble, zapatas con cargas exóticas), se promueve a `<ErrorAmbient>` shared en `src/components/ui/`.

**Why:** evitar duplicación cuando aparezca el segundo caso. Hoy YAGNI — un solo módulo lo usa.

**Pros:** componente compartido para error states con ambient gradient + label override; cualquier módulo lo consume.

**Cons:** generalización prematura si solo el FEM lo usa; refactor del local cuando llegue el segundo módulo.

**Context:** ver design doc Javier-main-design-20260429-162232.md → §"Solver error contract (escala P2-D)" + §"Cabecera 'Verdict global del modelo'". El pattern: `<VerdictBadge>` shared + `state-fail` ambient + label override + content slot. Cuando otro módulo necesite "no se puede calcular esto" UI, se generaliza ahí.

**Where to start:** examinar dos módulos candidatos (ej: muros sin geometría suelo, anclajes con momento>capacidad). Si ambos quieren el mismo patrón, refactor `<ResultsUnsolvable>` a `<ErrorAmbient>` con props `{ icon, label, errors, children }` y mover a shared.

**Depends on:** V1.1 ship + segundo módulo que necesite error state similar.

### V1.2 — PDF FEM unifica con `<RCBeamsResults>` layout standalone

**Status:** DEFERRED. Capturado en /plan-eng-review 2026-04-29 para el design doc Javier-main-design-20260429-162232.md.

**What:** `lib/pdf/femAnalysis.ts` actualmente monta su propio layout para vano/apoyo. Tras la V1.1 (panel derecho embebe `<RCBeamsResults>` real), hay drift entre la pantalla y el PDF. V1.2 unifica: cuando una barra tiene `material: 'rc'`, el PDF reutiliza el mismo flujo que `lib/pdf/rcBeams.ts` (PDF del módulo standalone Vigas HA). Análogo para steel.

**Why:** consistency cruzada. La V1.1 elimina las 6 incongruencias visibles que el usuario reportó pero introduce una séptima en superficie diferida (PDF). Hoy es una incongruencia menor y delimitada (solo se ve al exportar PDF), pero un ingeniero que documente un cálculo crítico verá un layout distinto al de los módulos standalone.

**Pros:** simetría total entre pantalla y PDF; reutilización del PDF de módulos standalone (mismo template, mismos estilos); cero duplicación.

**Cons:** refactor del PDF builder (~150 líneas); cobertura tests PDF actual se renueva.

**Context:** ver design doc Javier-main-design-20260429-162232.md → Tradeoff explícito en la sección Open Questions: V1.1 mantiene el PDF actual; V1.2 unifica.

**Where to start:** examinar `lib/pdf/rcBeams.ts` (PDF Vigas HA standalone). Identificar los componentes reutilizables (header, vano-block, apoyo-block, checks-table). En `femAnalysis.ts`: para cada barra HA, llamar al sub-renderer del PDF Vigas HA en lugar del layout propio FEM. Tests del PDF FEM (`src/test/fem-analysis/femAnalysisPdf.test.ts`) actualizan assertions sobre el contenido pero no sobre el shape (sigue siendo PdfResult).

**Depends on:** V1.1 ship (embed real en pantalla).

### CI gate para los 7 casos canónicos del solver FEM

**Status:** TODO post-V1 ship. Capturado en eng-review.

**What:** configurar GitHub Actions / pipeline para ejecutar `vitest run src/test/fem-analysis/solver.test.ts` en cada PR. Cualquier divergencia >1e-6 vs solución analítica = build red, no merge.

**Why:** el primer usuario beta detectó que el solver mock no era real. Los 7 casos canónicos (simple beam UDL, continuous 2/3 vanos UDL, ménsula UDL/punto, simple beam point center, Gerber con articulación interna) son la línea de defensa contra regresiones del solver real. Sin CI gate, una refactor inadvertida puede romper la solución analítica y nadie se entera hasta que un usuario lo detecta en obra.

**Pros:** protege la confianza que Concreta ha construido; cualquier PR que toque solver.ts/autoDecompose.ts es validado contra física conocida.

**Cons:** requiere configurar GitHub Actions (si no está ya) o equivalente.

**Context:** los 7 casos están listados en design doc Success Criteria #7. Implementación de solver pasa por TDD escribiendo estos tests primero. CI gate es la cristalización de ese TDD.

**Where to start:** verificar `.github/workflows/` existente; si hay `test.yml`, añadir el comando del FEM solver suite. Si no, crear flow mínimo: checkout + bun/npm install + vitest run. Tag job como "fem-solver-canonical" para visibilidad en PR checks.

**Depends on:** V1 ship (solver real implementado + 7 tests verdes).

### Validación empírica FEM vs CYPE (5 casos reales del usuario beta)

**Status:** TODO primera semana post-V1 ship.

**What:** pedirle al usuario beta 5 modelos suyos reales que ya pasaron por CYPE. Replicarlos en el FEM de Concreta. Comparar M_max, V_max, deformación, reacciones. Documentar divergencias por caso en `docs/fem-vs-cype-validation.md`.

**Why:** los tests analíticos (7 canónicos) verifican corrección matemática contra solución cerrada. Los casos reales verifican que **el modelado físico** (entrada de cargas, condiciones de borde, peso propio, combinaciones) coincide con lo que un ingeniero profesional espera. Si divergimos >2% en cualquier valor, hay un bug de modelado (no de solver) y NO debemos promocionar el módulo hasta arreglarlo. Si divergimos <2%, podemos publicar la comparación como dato de confianza ("CYPE-compatible within engineering tolerance").

**Pros:** trust-building crítico para el wedge "no abrir CYPE para casos triviales". Los profesionales que ya pagan CYPE solo migrarán parte de su carga si confían que los números coinciden.

**Cons:** requiere coordinación con el usuario beta para los archivos CYPE; tiempo del fundador (~1 día comparando).

**Context:** ver design doc Success Criteria #2 (adapter verificable) y The Assignment. Esto es el complemento práctico — los tests de adapter usan cálculo manual; este TODO es validación contra el competidor directo.

**Where to start:** post-V1 ship, agendar 30 min con el usuario beta. Pedir 5 archivos `.proyectoCYPE` o screenshots de los reportes CYPE. Replicar uno por uno en Concreta FEM. Capturar diferencia en hoja de cálculo simple. Si todo cuadra, escribir blog post / sección landing page.

**Depends on:** V1 ship con solver real + adapter HA + adapter Steel.

### V1.5 — Rubber-band selection en canvas

**Status:** DEFERRED del feedback Q5 del usuario beta (eng-review 2026-04-28).

**What:** al usar la herramienta seleccionar, el usuario hace click+drag para dibujar un rectángulo de selección. Todos los nodos/barras dentro del rectángulo quedan multi-seleccionados. Permite operaciones masivas (borrar, mover, cambiar material) sin click uno a uno.

**Why:** el usuario beta lo pidió explícitamente ("la herramienta seleccionar podria hacer una ventana de seleccion al pinchar y arrastrar"). Cortado de V1 por scope (no es load-bearing del wedge). Para modelos de >5 vanos con múltiples cargas, multi-select acelera el modelado significativamente.

**Pros:** UX más cercana a CYPE/SAP que el usuario espera; mejora la productividad para modelos medianos.

**Cons:** requiere repensar el data model de selección (single → array); todas las operaciones que asumen single selection necesitan handle multi.

**Context:** ver design doc Approaches → "Atiende todo el feedback Q5 menos rubber-band selection (V1.5)". Q5 feedback verbatim en chat de office-hours 2026-04-28.

**Where to start:** después de V1 ship + validación empírica. `Canvas.tsx` añadir state `selectedSet: Set<{kind, id}>`. Implementar onMouseDown→drag→onMouseUp con SVG rect. Refactor `selected` (singular) → `selectedSet` en panel.

**Depends on:** V1 estable, sin bugs críticos en single-select.

### V1.5 — Distinguir Q vs W vs S con ψ específicos en combinación

**Status:** DEFERRED del design doc Open Questions (eng-review 2026-04-28).

**What:** hoy V1 mete todas las cargas variables (Q, W, S, E) en un solo bucket con factor parcial 1.5 sobre la suma. V1.5 las separa según hipótesis: para combinación ELU determinante, aplicar ψ₀ a las acciones simultáneas no-determinantes; para ELS-frecuente aplicar ψ₁; para ELS-cuasi-permanente ψ₂. Los datos ya están en el modelo (cada Load tiene `lc: 'G'|'Q'|'W'|'S'|'E'`); falta la lógica de combinación.

**Why:** la combinación ELU "1.35G + 1.5Q + 1.5·ψ₀,W·W + 1.5·ψ₀,S·S" es la correcta según CTE DB-SE. El bucket único de V1 es conservadoramente correcto (puede sobrestimar) pero no es lo que el usuario profesional espera ver. Para modelos con viento Y nieve simultáneos, la diferencia puede ser 10-20% en el valor de combinación determinante.

**Pros:** comparable directamente con CYPE; cumple CTE estrictamente; necesario para ELS-cuasi-permanente para fisuración (ψ₂·Q según useCategory).

**Cons:** lógica de combinación es ~150 líneas más; tests de combinación adicionales; UI para elegir hipótesis determinante.

**Context:** ver design doc → Architectural decisions → Hipótesis de carga + combinaciones (ELU + ELS) → última nota: "V1 mezcla todas las variables en un solo bucket... V1.5 las separa con ψ₀, ψ₁, ψ₂ específicos por hipótesis".

**Where to start:** `src/features/fem-analysis/combinations.ts` (new). Tabla CTE DB-SE de ψ₀/ψ₁/ψ₂ por categoría de uso (residencial, oficina, parking, etc.). Función `buildCombinations(loads: Load[], useCategory: string): { ELU: WeightedLoadSet[], ELSc: WeightedLoadSet, ELSf: WeightedLoadSet, ELSqp: WeightedLoadSet }`. Solver itera sobre cada combinación; envelope toma el peor.

**Depends on:** V1 ship con bucket único.

### V1.5 — Mobile edit mode (touch-friendly sketch tools)

**Status:** DEFERRED del design review 2026-04-28.

**What:** V1 ships mobile read-only ("Modo lectura — abre en escritorio para editar"). V1.5 añade edit mode touch-friendly: tap-and-hold para editar cota inline, FAB "+vano" botón grande (≥56×56px), modal touch-friendly de hinge confirm, swipe para borrar barra, pinch-to-zoom en canvas.

**Why:** algunos ingenieros quieren validar rápidamente un cálculo en una visita de obra desde el móvil. Read-only solo cubre ver, no permite el ajuste rápido.

**Pros:** abre uso casual mobile (visitas obra, revisiones).

**Cons:** UX touch para sketch tools siempre es subpar comparado con desktop; testing en dispositivos reales caro; código de fallback duplicado (mouse vs touch handlers).

**Context:** ver design doc → "Mobile + a11y" sección. V1 detecta width <768px y muestra MobileTabBar pattern + canvas read-only. V1.5 desbloquea edit features bajo flag `enableMobileEdit`.

**Where to start:** `src/features/fem-analysis/components/MobileEditTools.tsx` (new). Hook `useTouch()` para detectar touchstart/touchend con threshold tap-vs-swipe. Refactor InlineEdit para abrir en bottom-sheet en mobile en vez de inline overlay (pantallas pequeñas tienen poco espacio para overlay sobre la cota).

**Depends on:** V1 ship con read-only mobile estable.

### V1.5 — A11y full WCAG AA + screen reader SVG diagrams

**Status:** DEFERRED del design review 2026-04-28.

**What:** V1 ships con a11y básica funcional (keyboard nav, ARIA landmarks, touch targets ≥44px, color contrast). V1.5 añade: structured description per bar accesible via screen reader ("Barra b1, viga HA 30×50, vano 5m, M_max 60 kN·m sagging en 2.5m, V_max 50 kN en apoyos, verdict CUMPLE η=78%"), aria-live region que anuncia cambios en tiempo real ("Verdict actualizado: REVISIÓN η=85%"), alternative text-only view del modelo entero (lista linealizada de barras + propiedades + esfuerzos), testing con NVDA/VoiceOver/JAWS, labels descriptivos en cada tool button + cada glyph SVG.

**Why:** producto profesional usado por estudios de ingeniería que pueden tener ingenieros con limitaciones visuales. Cumplir WCAG AA es requisito en contratos públicos en España.

**Pros:** usable por más perfiles; cumple compliance para clientes empresa pública.

**Cons:** screen reader UX para SVG complejo es difícil de testear y mantener; aria-live updates pueden ser ruidosas si el solver corre en cada keystroke (mitigado por nuestro onblur/onenter strategy).

**Context:** ver design doc → "Mobile + a11y" sección. V1 cubre keyboard + ARIA básica + contrast (cumple AA en lo visual). V1.5 cubre la parte temporal/dinámica del SVG.

**Where to start:** auditoría manual con NVDA del módulo V1 ya shipeado. Identificar gaps reales (vs hipotéticos). `src/features/fem-analysis/a11y.ts` (new) con función `describeBar(designBar, result): string` que produce el texto natural-language. Aria-live region en `<div role="status" aria-live="polite">` en index.tsx para verdict updates.

**Depends on:** V1 ship + audit con usuarios reales con limitaciones visuales (1 sesión).

### V1 — Actualizar DESIGN.md v2.1 con specs descubiertas durante el FEM

**Status:** TO DO en paralelo con la implementación del FEM V1 (no diferido).

**What:** actualizar `DESIGN.md` durante la implementación del FEM con: (a) Excepción documentada de "state-warn permitido para cargas en SVG" (con razonamiento del Q5 feedback), (b) Spec del componente `<InlineEdit>` (font-mono 12px, focus-ring border-accent, enter/escape/blur behavior), (c) Spec del "+vano" button flotante (24×24px, accent border, posicionamiento al extremo derecho del último apoyo no-cantilever), (d) Hinge glyph spec (círculo open accent r=4 stroke 1.5 fill bg-primary, offset 12px perpendicular), (e) Token alias `state-pending = state-neutral` con badge `○ PENDIENTE` y barra dashed.

**Why:** Concreta tiene un design system maduro (v2.0, 424 líneas). Los patterns descubiertos durante el FEM son reutilizables (el +vano button puede aparecer en futuras herramientas, el InlineEdit en otros módulos cuando se desbloqueen). Sin actualizar DESIGN.md, el siguiente módulo no ve estas reglas y diverge.

**Pros:** cohesión continua del design system; bumped version v2.1.

**Cons:** ~30 min de escritura; bumpear version requiere comunicar a otros stakeholders (si hubiera).

**Context:** ver design doc → "Design specifications (post /plan-design-review)" sección. Las decisiones se tomaron durante /plan-design-review 2026-04-28.

**Where to start:** al final de la implementación de cada Lane (A→D), revisar qué se aprendió y volcar a DESIGN.md. Bump version a 2.1 cuando todo el FEM V1 esté shipeado y los patterns confirmados en producción.

**Depends on:** FEM V1 implementación (no es bloqueante de ship, pero sí de cierre del módulo).

### Mobile a11y sweep — todos los módulos (design-review 2026-05-04)

**Status:** DEFERRED del /plan-design-review 2026-05-04 (afecta a TODOS los módulos del repo, no solo masonry-walls).

**What:** Pasada coordinada de a11y mobile sobre todo el shell + módulos:
- Touch targets ≥ 44×44 px (WCAG AA): hoy los inputs hacen ~24-28px alto, y los mini-buttons "× eliminar" ~14×11 px. Imposible de pulsar con dedo en iPad/iPhone.
- Navegación por teclado en SVGs interactivos: machones de masonry-walls, barras de fem-analysis, perfiles de steel-beams. Hoy son `<g onClick>` sin tabIndex/onKeyDown — un usuario con teclado no puede seleccionarlos.
- Focus visible sobre elementos custom (botones de Section header, MiniBtn, sidebar entries activos).

**Why:** producto profesional usado en estudios de ingeniería. WCAG AA es requisito en contratos públicos en España. Hoy el módulo masonry-walls tiene SVG con `role=img + aria-labelledby` y title-per-machón (parche del design review), pero la navegación por teclado sigue rota. Otros módulos hermanos están peor.

**Pros:** producto usable por más perfiles; elimina riesgo de exclusión por discapacidad visual o motor; cumple compliance contractual.

**Cons:** romper la densidad de los inputs sólo en un módulo es inconsistente. Hay que hacerlo coordinado con DESIGN.md (subir minBtn de 24 a 28px o 32px, ajustar paddings de NumField). Riesgo: el panel de inputs crece vertical y obliga a más scroll.

**Context:** ver `src/components/checks/index.tsx` (CheckRowItem `compact`), `src/features/masonry-walls/MasonryWallsInputs.tsx` (NumField + MiniBtn + SelField), `src/features/empresillado/EmpresalladoInputs.tsx` (NumberField del módulo). Decisión clave: pasar a `min-h-44` en mobile (`max-md:min-h-11`) sin tocar desktop, o uniformar a 32px global.

**Where to start:** auditoría con NVDA/VoiceOver en móvil sobre el módulo más simple (rc-beams). Identificar gaps reales. Sweep de `MiniBtn`/`NumberField`/`Section` con responsive padding. Tests de Playwright con teclado-only navigation por módulo.

**Depends on:** ninguno técnico; depende de prioridad relativa frente a otras features.

### Masonry walls — PDF dimensions en m/cm en lugar de mm (design-review 2026-05-04)

**Status:** DEFERRED del /plan-design-review 2026-05-04.

**What:** El PDF de muros de fábrica (`src/lib/pdf/masonryWalls.ts`) muestra `L = 6000 mm`, `t = 240 mm`, etc. Tras el ajuste de unidades en la UI (commit `53e1a0c`), el usuario ve `L = 6.00 m`, `t = 24 cm` en pantalla. PDF debe seguir la misma convención para no confundir.

**Why:** consistencia entre vista en pantalla y vista impresa. El PDF se entrega al promotor / aparejador / arquitecto técnico; ver mm cuando el técnico ha trabajado en m/cm rompe la confianza.

**Pros:** consistencia UI/PDF; números más legibles para revisión externa.

**Cons:** ninguno material. El motor de cálculo sigue en mm; sólo es presentación.

**Context:** `src/lib/pdf/masonryWalls.ts` líneas ~85-95 (sección GEOMETRIA), ~135 (cota L). El refactor consiste en formatear con `(value/1000).toFixed(2)` para metros y `(value/10).toFixed(1)` para cm, igual que el `scale` prop del NumField.

**Where to start:** un solo fichero, ~10 líneas. Lo hace cualquier sweep posterior del módulo. Test: abrir PDF y comprobar que coincide con la pantalla.

**Depends on:** ninguno.
