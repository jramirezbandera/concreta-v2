# Terminology Drift Decisions — Concreta

Output of the drift-resolution step. Each of the 22 drift clusters from
[terminology-catalog.md](./terminology-catalog.md) has a binding decision
below. Every decision drives the spec (next step) and `src/lib/text/labels.ts`
after that.

**Decision rule in general:**
- When EC/CE has a notation, use it exactly.
- When two forms are both valid, pick the one the interviewed arquitecto
  técnico is most likely to recognize from the code PDF they will open to
  verify.
- When a symbol is overloaded across physical concepts, keep the symbol and
  disambiguate in `descLong`. Do NOT rename symbols just to avoid overload.
- When something is a typo (missing accents, wrong subscript delimiter),
  fix it toward the properly-accented EC form.

---

## 1. Accent drift (rcBeams has no accents)

**Decision:** Proper Spanish accents everywhere. `Separación`, `Diámetro`,
`Compresión`, `Tracción`, `Fisuración`, `Sección`, `Núm.`, `Clase de
exposición`.

**Why:** rcBeams is the outlier — 10 other modules already use accents. It's
a typo cascade, not a design choice. The Spanish CE and CTE documents use
accents; our citation-first wedge is undermined by unaccented labels because
the user scanning back to the PDF sees different text.

**Applies to:** rcBeams rewrite. Fix every occurrence in one pass.

---

## 2. `NEd` / `N_Ed` / `Nd` spelling

**Decision:** `NEd`. No underscore. No bare `Nd`.

**Why:** EC3 prose uses `NEd` (italic N, subscript Ed) in article text.
`N_Ed` is a programming transliteration that leaks into the UI. `Nd` is
older CTE/CE shorthand that conflicts with "design axial" in some textbooks.
`NEd` is the form an arquitecto técnico will see when they open EC3.

**Applies to:** rcColumns (already correct), steelColumns (already correct),
isolatedFooting (rename from `N_Ed`), pileCap (rename), empresillado
(rename), timberColumns (rename from `Nd`).

---

## 3. `VEd` / `V_Ed` / `Vd` spelling

**Decision:** `VEd`. Same reasoning as #2.

**Applies to:** empresillado (rename from `V_Ed`), pileCap (rename),
timberColumns (rename from `Vd`).

---

## 4. `MEd` subscript delimiter

**Decision:** `MEd` for single-axis, `My,Ed` and `Mz,Ed` for biaxial with a
**comma** subscript delimiter (EC3 convention).

**Why:** EC3 and EC5 both use comma-delimited subscripts (`My,Ed`, not
`My_Ed` or `MEdy`). The comma form is what the user will see in the code
PDF. Comma in subscripts also avoids the ambiguity of reading `Mx_Ed` as
"M times x_Ed."

**Applies to:**
- rcColumns: rename `MEdy` / `MEdz` → `My,Ed` / `Mz,Ed`
- isolatedFooting: rename `Mx_Ed` / `My_Ed` → `Mx,Ed` / `My,Ed` (footing
  uses x/y because it's a plan-view object, not a column cross-section —
  keep x/y for footings, see #5)
- pileCap: same as footing
- empresillado: rename `Mx_Ed` / `My_Ed` → `Mx,Ed` / `My,Ed` (column cross-
  section but plan-view geometry — see #5 decision on axis naming)
- rcBeams / timberBeams: rename `Md` → `MEd`
- steelBeams: `MEd` is already derived correctly

---

## 5. Axis convention — y/z vs X/Y vs x/y

**Decision:** Three-case rule driven by physical meaning, not module identity:

| Object type | Axes | Why |
|---|---|---|
| Column cross-section bending (strong/weak) | `y` / `z` | EC3/EC5 convention. `y` = strong axis, `z` = weak axis. |
| Plan-view footprint (footing, pile cap, empresillado column seen from above) | `x` / `y` | These are plan dimensions, not cross-section bending axes. Using y/z here is wrong because there is no "strong axis" for a square footing. |
| Building global axes (rarely used in Concreta) | `X` / `Y` | Uppercase when the global building frame matters. Not used in this app today. |

**Applies to:**
- rcColumns, steelColumns, timberColumns → `y` / `z` (already mostly correct)
- isolatedFooting, pileCap → `x` / `y` (already correct, keep)
- empresillado → currently `X` / `Y`, rename to `x` / `y` (lowercase — it's
  a plan-view geometry problem, not a global building frame)

**Note:** `β` in rcColumns/steelColumns/timberColumns uses y/z subscripts
(`βy`, `βz`). Fine. `β` in empresillado uses x/y subscripts (`βx`, `βy`).
Also fine under this rule — empresillado is plan-view.

---

## 6. `fck` / `fyk` unit rendering — MPa vs N/mm²

**Decision:** `N/mm²` everywhere.

**Why:** Numerically identical, but N/mm² is what CE and EC2 use in their
article text. The citation-first wedge fails if the unit on screen is `MPa`
and the unit in the code PDF is `N/mm²`. The user scanning for a match will
lose a beat. Minor but it matters when the whole product is built on "every
number is a citation you can verify in 10 seconds."

**Applies to:** rcBeams, rcColumns, isolatedFooting, pileCap, punching —
rename the dropdown-option unit suffix from `MPa` to `N/mm²`.
retainingWall already correct.

---

## 7. `Ø` / `Diámetro` / `φ` for bar diameter

**Decision:**
- **Symbol in compact displays (rebar schedules, SVG labels, result rows):** `Ø`
- **Descriptive label text (input field `descLong`):** `Diámetro`
- **Never use `φ` for bar diameter.** Reserve `φ` for:
  - Friction angle (geotech): `φ fricción` in retainingWall, isolatedFooting
  - Creep coefficient (RC second-order): `φ_ef` in rcColumns (future work)

**Why:** `Ø` is ubiquitous on Spanish construction drawings. Every
arquitecto técnico reads it instantly. `Diámetro` spelled out is better in
input labels because the user is thinking "diámetro de la barra" when
entering a value, not "Ø 16." `φ` overload is a real bug waiting to happen:
an unaccented `phi` in geotech prose and `phi_x` for rebar in the same app
is confusing.

**Applies to:**
- isolatedFooting: rename `phi_x`, `phi_y` (rebar) → `Ø_x`, `Ø_y`; keep `φ`
  for friction angle with `descLong: "Ángulo de rozamiento interno"`
- pileCap: rename `phi_tie` → `Ø tirante`
- punching: already uses `Ø cerco` — keep
- rcBeams: "Diametro" → "Diámetro" (accent fix) for input label;
  result/rebar display uses `Ø`
- retainingWall: `φ fricción` stays (friction angle)

---

## 8. `b` / `h` / `L` symbol overloading

**Decision:** Keep the symbol. Disambiguate in `descLong`. Create separate
`labels.ts` entries per physical concept, named after the concept:

| Entry key | sym | descLong | Module uses |
|---|---|---|---|
| `b_section` | `b` | Ancho de la sección | rcBeams, rcColumns, steelBeams (not tributary), timberBeams, timberColumns, compositeSection, punching |
| `b_tributary` | `b` | Ancho tributario | steelBeams (gravity load width), rcBeams if used |
| `b_footing` | `B` | Ancho de la zapata (lado x) | isolatedFooting, pileCap |
| `h_section` | `h` | Canto de la sección | rcBeams, rcColumns, timberBeams, timberColumns |
| `h_footing` | `h` | Canto de la zapata | isolatedFooting |
| `h_encepado` | `h` | Canto del encepado | pileCap |
| `L_span` | `L` | Luz entre apoyos | rcBeams, steelBeams, timberBeams |
| `L_column` | `L` | Altura libre del pilar | rcColumns, steelColumns, timberColumns, empresillado |
| `L_footing` | `L` | Largo de la zapata (lado y) | isolatedFooting |

**Why:** Users don't confuse `b` between an RC beam and a footing because
the context (which module they're in) disambiguates. But the `descLong`
MUST say which `b` so a screenshot without the module header still reads
correctly. Separate `labels.ts` entries prevent one module accidentally
inheriting another's description.

**Tradeoff:** `labels.ts` grows from ~45 to ~60 pan-module entries. Worth it.

---

## 9. Cover label — `Recubrimiento` / `rec.` / `recubr.`

**Decision:** Full word `Recubrimiento` in input `descLong`. Symbol `r` in
compact displays (result rows, SVG). Sub-qualifier `"al eje de la barra"`
when the cover in question is to the bar centroid (footing, pileCap) vs
the bar edge (rc beams).

**Applies to:** isolatedFooting (expand `rec.` → `Recubrimiento`), pileCap
(expand `recubr.` → `Recubrimiento`). rcBeams, rcColumns, retainingWall
already correct.

---

## 10. `Separación` / `Diámetro` / `Compresión` / `Tracción` accents

**Decision:** Covered by #1. All accented.

---

## 11. `loadType` options — `parking` vs `storage`

**Decision:** This is NOT a drift. It's two distinct load categories from
CTE DB-SE-AE Tabla 3.1 with different ψ₂ values:
- `parking` (Categoría F: zonas de tráfico y aparcamiento) → ψ₂ = 0.6
- `storage` (Categoría E: zonas de almacenamiento) → ψ₂ = 0.8

**Fix:** Both modules (rcBeams and timberBeams) should expose **both**
options, not one each. Today rcBeams has parking (no storage) and timberBeams
has storage (no parking). That's incomplete on both sides. Unify to a single
`LOAD_TYPE_OPTIONS` constant in `src/lib/text/labels.ts` or a sibling file
and import from both.

**Canonical list (CTE DB-SE-AE Tabla 3.1 ψ₂ values):**

| Key | descLong | ψ₂ |
|---|---|---|
| residential | Viviendas (Categoría A) | 0.3 |
| office | Oficinas (Categoría B) | 0.3 |
| public | Zonas públicas (Categoría C) | 0.6 |
| commercial | Comercial (Categoría D) | 0.6 |
| storage | Almacenamiento (Categoría E) | 0.8 |
| parking | Aparcamiento (Categoría F) | 0.6 |
| roof | Cubierta (Categoría G) | 0 |
| custom | Personalizado | (user input) |

---

## 12. `useCategory` (steelBeams CTE codes) vs `loadType` (semantic keys)

**Decision:** Unify to semantic keys everywhere. The CTE code (A1, A2, B,
C1…) goes in the descLong as a suffix: `"Viviendas (Cat. A)"`. Users don't
recall "B" — they recall "oficinas." The CTE code is the citation, not the
primary label.

**Why:** Same rationale as the whole wedge — descriptive first, citation
second. `useCategory` asking "A1 / A2 / B / C1" is the exact style of
UX the arquitecto técnico struggles with.

**Applies to:** steelBeams — migrate `useCategory` to the unified
`LOAD_TYPE_OPTIONS` from #11. Preserve the CTE code in the display.

**Effort:** small refactor, touches `SteelBeamsInputs.tsx` and `steelBeams.ts`
defaults. Low risk because the ψ₂ values map 1:1.

---

## 13. Rebar spacing display format

**Decision:** `Ø{d} c/{s} ({As} mm²/m)` everywhere.

**Why:** `c/` is Spanish shorthand for "cada" (every). Widely recognized on
Spanish drawings. The `@` form is an English-language convention that leaked
from US/UK codes. retainingWall already uses `c/`; footing and pileCap use
`@`. Migrate the two `@` modules.

**Example:** `Ø16 c/200 (1005 mm²/m)`

**Applies to:** isolatedFooting, pileCap — change display format.
retainingWall stays.

---

## 14. `fy` vs `fyk`

**Decision:** Keep distinct by discipline. Do NOT unify.

- **Steel modules** (steelBeams, steelColumns, compositeSection, empresillado):
  use `fy` — EC3 uses `fy` for the nominal yield strength (EN 10025 tables
  give `fy` values directly; the `k` characteristic subscript is implicit in
  the steel grade designation S235/S275/S355/S460).
- **RC modules** (rcBeams, rcColumns, punching, isolatedFooting, pileCap,
  retainingWall): use `fyk` — EC2 and CE always use `fyk` for rebar
  characteristic yield because the 5% fractile distinction is explicit in
  concrete design.

**Why:** This is a real EC notation distinction, not a drift. The reviewer's
iteration-1 flag was correct to keep these separate.

**Applies to:** nothing — both forms are already used correctly by discipline.
Just document the rule in the spec so no one "fixes" it in a later refactor.

---

## 15. `φ` (friction angle) vs `Ø` (bar diameter)

**Decision:** Covered by #7. Reserve `φ` for friction angle + creep
coefficient. Reserve `Ø` for bar diameter.

---

## 16. `kmod` / `γM` result description consistency

**Decision:** Both timber modules use the full result-row description format:
```
kmod — modificación por duración y clase de servicio  (EC5 §3.1.3 Tabla 3.1)
γM — coeficiente parcial de material  (EC5 §2.4.1 Tabla 2.3)
```

timberBeams already does this for `kmod`. timberColumns should mirror the
format. Both should include the `γM` description, not the bare symbol.

**Applies to:** timberColumns — expand `kmod` and `γM` result rows.

---

## 17. `β` overloaded: buckling coefficient vs load-eccentricity factor

**Decision:** Keep the symbol. Separate `labels.ts` entries:

| Entry key | sym | descLong | ref |
|---|---|---|---|
| `beta_buckling` | `β` | Factor de longitud de pandeo | EC3 §6.3.1.3 Tabla 6.2 / EC5 §6.3.2 |
| `beta_punching` | `β` | Factor de excentricidad de carga | CE art. 46.3 |

**Why:** Same symbol, totally different physics. Users know which one they're
looking at because of the module context, but the `descLong` must carry the
distinction so screenshots are unambiguous.

---

## 18. `Mb,Rd` with/without `(LTB)` qualifier

**Decision:** Drop the `(LTB)` qualifier. `Mb,Rd` already means lateral
torsional buckling resistance in EC3 §6.3.2 — the `b` subscript IS the LTB
marker. Adding `(LTB)` is redundant. steelBeams has it, steelColumns doesn't;
remove from steelBeams.

**Canonical:** `Mb,Rd — momento resistente a vuelco lateral  (EC3 §6.3.2 eq. 6.54)`

---

## 19. `bc` / `hc` label spellings

**Decision:** In empresillado, `bc` and `hc` are the column cross-section
dimensions being reinforced with the angle frame. Canonical:

- `bc` — Ancho del pilar (lado x) — cm
- `hc` — Canto del pilar (lado y) — cm

Same `descLong` pattern as footing plan dimensions. No other module uses
`bc` / `hc`.

**Applies to:** empresillado — align label text.

---

## 20. `h` reused for section depth vs footing thickness vs `h_enc`

**Decision:** Covered by #8. Separate `labels.ts` entries: `h_section`,
`h_footing`, `h_encepado`. pileCap's `h_enc` symbol stays as `h_enc` because
"encepado" is a distinct structural element with its own term — don't
collapse it into the generic `h`.

---

## 21. Structural `γM0` vs geotechnical `γM`

**Decision:** Keep distinct. Different EC documents, different physical
meanings:

- `γM0` — EC3 §6.1, structural resistance partial factor (steel cross-section
  checks). Value: 1.05 in Spain.
- `γM1` — EC3 §6.1, buckling resistance partial factor. Value: 1.05.
- `γM` (plain) — EC5 §2.4.1, timber material partial factor. Depends on
  material type (1.25 solid, 1.25 glulam, 1.3 LVL, …).
- `γc` — CE art. 15.3, concrete partial factor. Value: 1.5.
- `γs` — CE art. 15.3, rebar steel partial factor. Value: 1.15.
- `γR` — CTE DB-SE-C §2.3.3, geotechnical resistance partial factor. Varies
  by limit state (sliding/overturning/bearing).

These are **five different symbols** for **five different code clauses**.
All must coexist in `labels.ts`. Do NOT unify.

**Applies to:** spec — document the full set explicitly so no one later
tries to collapse them.

---

## 22. `As` suffix conventions — `As,req,x` / `As_req_x` / `As,req fuste`

**Decision:** Comma-delimited subscripts throughout. Rationale same as #4.

- `As,req,x` (required area, x-direction in plan-view rebar mat)
- `As,req,y` (required, y-direction)
- `As,prov` (provided, shorthand for "provided")
- `As,min` (minimum per code)
- `As,fuste` (stem, for retaining walls — the word replaces the comma-delimited
  subscript here because "fuste" is an element name, not a direction)

**Applies to:** isolatedFooting (rename `As_req_x` → `As,req,x`), pileCap
(same), rcBeams (already mostly correct), retainingWall (already uses
`As fuste` style — align to `As,fuste`).

---

## Summary of changes by module

| Module | Changes from decisions |
|---|---|
| rcBeams | #1 accent fixes (Separación, Diámetro, Compresión, Tracción, Fisuración, Sección, Núm., exposición) · #4 Md → MEd · #6 MPa → N/mm² · #7 "Diametro" → "Diámetro" |
| rcColumns | #4 MEdy/MEdz → My,Ed/Mz,Ed · #6 MPa → N/mm² |
| steelBeams | #12 useCategory → unified LOAD_TYPE_OPTIONS · #18 drop (LTB) qualifier · none for fy (stays) |
| steelColumns | none material, already uses y/z and NEd correctly |
| timberBeams | #4 Md → MEd · #11 add parking category alongside storage |
| timberColumns | #2 Nd → NEd · #3 Vd → VEd · #4 Md → MEd · #16 kmod/γM result row expansion |
| isolatedFooting | #2 N_Ed → NEd · #4 Mx_Ed/My_Ed → Mx,Ed/My,Ed · #6 MPa → N/mm² · #7 phi_x/phi_y → Ø_x/Ø_y · #9 rec. → Recubrimiento · #13 @ → c/ · #22 As_req_x → As,req,x |
| pileCap | #2 N_Ed → NEd · #3 V_Ed → VEd · #4 Mx_Ed/My_Ed → Mx,Ed/My,Ed · #6 MPa → N/mm² · #7 phi_tie → Ø tirante · #9 recubr. → Recubrimiento · #13 @ → c/ · #22 As_ suffix |
| punching | #6 MPa → N/mm² |
| retainingWall | none — already uses N/mm², c/, accents, φ for friction |
| compositeSection | none material (uses fy correctly per #14) |
| empresillado | #2 N_Ed → NEd · #3 V_Ed → VEd · #4 Mx_Ed/My_Ed → Mx,Ed/My,Ed · #5 X/Y → x/y axis · #19 bc/hc label alignment |

**Largest diff:** isolatedFooting and pileCap (6-7 changes each).
**Smallest diff:** steelColumns, compositeSection, retainingWall (0 changes).
**Most consequential:** rcBeams accent cascade (~12 occurrences in one file).

---

## Non-drift rules carried forward into the spec

- `fy` vs `fyk` stays split by discipline (steel vs RC). Decision #14.
- `γM0`, `γM1`, `γM`, `γc`, `γs`, `γR` all coexist. Decision #21.
- Symbol overloading resolved by separate `labels.ts` entries with
  qualified keys. Decisions #8, #17, #20.
- Axis convention: y/z for column cross-sections, x/y for plan-view
  geometries, X/Y reserved for global building frame (unused today).
  Decision #5.
- Rebar spacing: `Ø{d} c/{s}` format, never `@`. Decision #13.
- Load category: unified CTE DB-SE-AE Tabla 3.1 list (8 entries including
  custom). Decision #11.

---

## What this document is NOT

- Not the `labels.ts` spec. That's the next step. This doc says "here are
  the 22 drift decisions," not "here is the final 60-entry catalog."
- Not a refactor plan. Per-module changes above are hints to the spec
  author, not a commit ordering.
- Not binding on module-specific terminology. Single-module symbols
  (`λ_rel,m` in timber LTB, `α_cc` in RC, `kcr` in timber shear) are not
  touched here — they stay inline in their home module.

---

## Next step

Write `docs/terminology-spec.md` using these 22 decisions as the rule set.
For each entry in the catalog that lands in `labels.ts`, fill in `sym`,
`descLong`, `descShort`, `unit`, `ref`, and `modules`. Then transcribe to
TypeScript.
