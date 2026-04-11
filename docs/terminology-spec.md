# Terminology Spec — Concreta

Canonical label set for `src/lib/text/labels.ts`. Every entry listed here
becomes a row in the TypeScript constants file.

**Source of truth for:**
1. `src/lib/text/labels.ts` (the TypeScript file transcribed from this spec)
2. Input field `descLong` + symbol + unit
3. Result `ValueRow` `{sym — descShort  (ref)}` strings
4. Check row `article` field contents
5. SVG label strings

**Derived from:**
- [terminology-catalog.md](./terminology-catalog.md) — raw extraction of 345 current labels
- [terminology-decisions.md](./terminology-decisions.md) — 22 drift decisions

**Rules applied (from terminology-decisions.md):**
- Proper Spanish accents everywhere (#1)
- `NEd` / `VEd` / `MEd` with comma-delimited biaxial subscripts (#2, #3, #4)
- y/z axes for column cross-sections, x/y for plan-view (#5)
- `N/mm²` for concrete strengths (not `MPa`) (#6)
- `Ø` for bar diameter in compact displays, `Diámetro` in input `descLong` (#7)
- Overloaded symbols get separate entries with qualified keys (#8, #17, #20)
- `Ø{d} c/{s}` for rebar spacing display (#13)
- `fy` for steel, `fyk` for RC — do not unify (#14)
- All gamma factors stay distinct (#21)
- Comma-subscripted `As` notation (#22)

**Schema:**
```ts
type Label = {
  sym: string;        // symbol as rendered (UTF-8, may include ₀₁₂ ʸᶻ Ø γ σ τ λ χ ψ ε β)
  descLong: string;   // full Spanish noun phrase (input field label)
  descShort: string;  // ≤ 60 chars (result row label)
  unit: string;       // unit string or '—' for dimensionless
  ref?: string;       // norm + article + eq/table. Required for computed outputs. Omitted for user-entered inputs.
  modules: string[];  // which module files use this entry (audit aid)
};
```

---

## Section 1 — Geometry

### `b_section` — width of a structural cross-section

- sym: `b`
- descLong: `Ancho de la sección`
- descShort: `ancho`
- unit: `mm`
- ref: (input — no ref)
- modules: rcBeams, rcColumns, steelBeams, steelColumns, timberBeams, timberColumns, compositeSection, punching

### `h_section` — depth of a structural cross-section

- sym: `h`
- descLong: `Canto de la sección`
- descShort: `canto`
- unit: `mm`
- ref: (input)
- modules: rcBeams, rcColumns, timberBeams, timberColumns, compositeSection, punching

### `d_effective` — effective depth (distance from compression fiber to rebar centroid)

- sym: `d`
- descLong: `Canto útil`
- descShort: `canto útil`
- unit: `mm`
- ref: `CE art. 40.3.2` (computed in rc modules, input in punching)
- modules: rcBeams (result), rcColumns (result), punching (input)

### `d_prime` — distance from compression fiber to compression rebar centroid

- sym: `d'`
- descLong: `Canto útil de la armadura de compresión`
- descShort: `armadura compresión`
- unit: `mm`
- ref: `CE art. 40.3.2`
- modules: rcColumns

### `L_span` — simply-supported span

- sym: `L`
- descLong: `Luz entre apoyos`
- descShort: `luz`
- unit: `m`
- ref: (input)
- modules: rcBeams, steelBeams, timberBeams

### `L_column` — clear column height

- sym: `L`
- descLong: `Altura libre del pilar`
- descShort: `altura`
- unit: `m`
- ref: (input)
- modules: rcColumns, timberColumns, empresillado

### `Ly_strong` — buckling length about strong axis (steel/timber columns)

- sym: `Ly`
- descLong: `Longitud de pandeo — eje fuerte`
- descShort: `longitud pandeo y`
- unit: `m`
- ref: `EC3 §6.3.1.3`
- modules: steelColumns, timberColumns

### `Lz_weak` — buckling length about weak axis

- sym: `Lz`
- descLong: `Longitud de pandeo — eje débil`
- descShort: `longitud pandeo z`
- unit: `m`
- ref: `EC3 §6.3.1.3`
- modules: steelColumns, timberColumns

### `Lk_buckling` — effective buckling length (β·L)

- sym: `Lk`
- descLong: `Longitud de pandeo`
- descShort: `Lk = β·L`
- unit: `m`
- ref: `CE art. 43.1.2` / `EC3 §6.3.1.3`
- modules: rcColumns

### `B_footing` — footing plan dimension, x-direction

- sym: `B`
- descLong: `Ancho de la zapata (lado x)`
- descShort: `ancho zapata`
- unit: `m`
- ref: (input)
- modules: isolatedFooting

### `L_footing` — footing plan dimension, y-direction

- sym: `L`
- descLong: `Largo de la zapata (lado y)`
- descShort: `largo zapata`
- unit: `m`
- ref: (input)
- modules: isolatedFooting

### `h_footing` — footing total thickness

- sym: `h`
- descLong: `Canto de la zapata`
- descShort: `canto zapata`
- unit: `m`
- ref: (input)
- modules: isolatedFooting

### `Df_embedment` — footing embedment depth

- sym: `Df`
- descLong: `Profundidad de cimentación`
- descShort: `profundidad`
- unit: `m`
- ref: `CTE DB-SE-C §4.3`
- modules: isolatedFooting

### `bc_column` — RC column cross-section width (x-direction) in plan-view contexts

- sym: `bc`
- descLong: `Ancho del pilar (lado x)`
- descShort: `ancho pilar`
- unit: `cm`
- ref: (input)
- modules: isolatedFooting, empresillado

### `hc_column` — RC column cross-section depth (y-direction) in plan-view contexts

- sym: `hc`
- descLong: `Canto del pilar (lado y)`
- descShort: `canto pilar`
- unit: `cm`
- ref: (input)
- modules: isolatedFooting, empresillado

### `b_col` — column width at pile cap interface

- sym: `b_col`
- descLong: `Ancho del pilar (lado x)`
- descShort: `ancho pilar`
- unit: `mm`
- ref: (input)
- modules: pileCap

### `h_col` — column depth at pile cap interface

- sym: `h_col`
- descLong: `Canto del pilar (lado y)`
- descShort: `canto pilar`
- unit: `mm`
- ref: (input)
- modules: pileCap

### `h_encepado` — pile cap thickness

- sym: `h_enc`
- descLong: `Canto del encepado`
- descShort: `canto encepado`
- unit: `mm`
- ref: (input)
- modules: pileCap

### `H_wall` — retaining wall stem height

- sym: `H`
- descLong: `Altura del fuste`
- descShort: `altura fuste`
- unit: `m`
- ref: (input)
- modules: retainingWall

### `hf_footing` — retaining wall footing thickness

- sym: `hf`
- descLong: `Canto de la zapata corrida`
- descShort: `canto zapata`
- unit: `m`
- ref: (input)
- modules: retainingWall

### `cover_mechanical` — mechanical rebar cover (to bar centroid)

- sym: `r`
- descLong: `Recubrimiento mecánico (al eje de la barra)`
- descShort: `recubrimiento`
- unit: `mm`
- ref: `CE art. 37.2.4`
- modules: rcBeams, rcColumns, isolatedFooting, pileCap, punching

### `cover_geometric` — geometric rebar cover (to bar surface)

- sym: `c`
- descLong: `Recubrimiento geométrico (a la superficie de la barra)`
- descShort: `recubrimiento`
- unit: `m`
- ref: `CE art. 37.2.4`
- modules: retainingWall

---

## Section 2 — Materials (concrete and rebar steel)

### `fck` — characteristic compressive strength of concrete

- sym: `fck`
- descLong: `Resistencia característica a compresión del hormigón`
- descShort: `fck`
- unit: `N/mm²`
- ref: `CE art. 39.2 Tabla 39.2`
- modules: rcBeams, rcColumns, isolatedFooting, pileCap, punching, retainingWall

### `fyk` — characteristic yield strength of reinforcing steel

- sym: `fyk`
- descLong: `Límite elástico característico del acero de armar`
- descShort: `fyk`
- unit: `N/mm²`
- ref: `CE art. 32.2 Tabla 32.2.a`
- modules: rcBeams, rcColumns, isolatedFooting, pileCap, punching, retainingWall

### `fcd` — design compressive strength of concrete

- sym: `fcd`
- descLong: `Resistencia de cálculo a compresión del hormigón`
- descShort: `fcd`
- unit: `N/mm²`
- ref: `CE art. 39.4 eq. 39.4.a` — `fcd = αcc · fck / γc`
- modules: rcBeams, rcColumns, punching (implicit in checks)

### `fyd` — design yield strength of reinforcing steel

- sym: `fyd`
- descLong: `Resistencia de cálculo del acero de armar`
- descShort: `fyd`
- unit: `N/mm²`
- ref: `CE art. 38.4 eq. 38.4` — `fyd = fyk / γs`
- modules: rcBeams, rcColumns

### `exposureClass` — environmental exposure class

- sym: (none — dropdown)
- descLong: `Clase de exposición ambiental`
- descShort: `clase exposición`
- unit: `—`
- ref: `CE art. 27 Tabla 27`
- modules: rcBeams, rcColumns

---

## Section 3 — Materials (steel profiles)

### `fy_steel` — nominal yield strength of structural steel

- sym: `fy`
- descLong: `Límite elástico del acero estructural`
- descShort: `fy`
- unit: `N/mm²`
- ref: `EN 10025` / `EC3 §3.2.1 Tabla 3.1`
- modules: steelBeams, steelColumns, compositeSection, empresillado

### `steel_grade` — steel grade selector (S235/S275/S355/S460)

- sym: (dropdown)
- descLong: `Grado del acero estructural`
- descShort: `acero`
- unit: `—`
- ref: `EC3 §3.2.1 Tabla 3.1`
- modules: steelBeams, steelColumns, compositeSection

### `profile_type` — steel profile family (IPE/HEA/HEB/HEM)

- sym: (dropdown)
- descLong: `Tipo de perfil metálico`
- descShort: `tipo`
- unit: `—`
- ref: (selector)
- modules: steelBeams, steelColumns, compositeSection

### `profile_size` — specific profile size within family

- sym: (dropdown)
- descLong: `Designación del perfil`
- descShort: `tamaño`
- unit: `—`
- ref: (selector)
- modules: steelBeams, steelColumns, compositeSection

---

## Section 4 — Materials (timber)

### `grade_timber` — timber strength class

- sym: (dropdown)
- descLong: `Clase resistente`
- descShort: `clase`
- unit: `—`
- ref: `EN 338` (sawn) / `EN 14080` (glulam)
- modules: timberBeams, timberColumns

### `serviceClass` — service class (moisture)

- sym: (dropdown)
- descLong: `Clase de servicio (humedad ambiente)`
- descShort: `clase servicio`
- unit: `—`
- ref: `EC5 §2.3.1.3`
- modules: timberBeams, timberColumns

### `loadDuration` — load duration class

- sym: (dropdown)
- descLong: `Duración de la carga`
- descShort: `duración`
- unit: `—`
- ref: `EC5 §2.3.1.2 Tabla 2.1`
- modules: timberBeams, timberColumns

### `fm_d` — design bending strength (timber)

- sym: `fm,d`
- descLong: `Resistencia de cálculo a flexión`
- descShort: `fm,d`
- unit: `N/mm²`
- ref: `EC5 §2.4.1 eq. 2.14`
- modules: timberBeams, timberColumns

### `fv_d` — design shear strength (timber)

- sym: `fv,d`
- descLong: `Resistencia de cálculo a cortante`
- descShort: `fv,d`
- unit: `N/mm²`
- ref: `EC5 §2.4.1 eq. 2.14`
- modules: timberBeams, timberColumns

### `fc0_d` — design compression strength parallel to grain (timber)

- sym: `fc,0,d`
- descLong: `Resistencia de cálculo a compresión paralela`
- descShort: `fc,0,d`
- unit: `N/mm²`
- ref: `EC5 §2.4.1 eq. 2.14`
- modules: timberColumns

---

## Section 5 — Actions (loads)

### `gk_distributed` — characteristic permanent load (distributed)

- sym: `gk`
- descLong: `Carga permanente característica`
- descShort: `permanente gk`
- unit: `kN/m`
- ref: `CTE DB-SE-AE §2`
- modules: steelBeams, timberBeams, rcBeams (where used)

### `qk_distributed` — characteristic variable load (distributed)

- sym: `qk`
- descLong: `Sobrecarga de uso característica`
- descShort: `variable qk`
- unit: `kN/m`
- ref: `CTE DB-SE-AE §3 Tabla 3.1`
- modules: steelBeams, timberBeams, rcBeams

### `loadType` — CTE use category (drives ψ₂)

- sym: (dropdown)
- descLong: `Categoría de uso (CTE DB-SE-AE)`
- descShort: `categoría`
- unit: `—`
- ref: `CTE DB-SE-AE §3 Tabla 3.1`
- modules: rcBeams, timberBeams, steelBeams

**Canonical option set (unified from #11/#12 of decisions):**
```ts
export const LOAD_TYPE_OPTIONS = [
  { key: 'residential', label: 'Viviendas (Cat. A)',        psi2: 0.3 },
  { key: 'office',      label: 'Oficinas (Cat. B)',         psi2: 0.3 },
  { key: 'public',      label: 'Zonas públicas (Cat. C)',   psi2: 0.6 },
  { key: 'commercial',  label: 'Comercial (Cat. D)',        psi2: 0.6 },
  { key: 'storage',     label: 'Almacenamiento (Cat. E)',   psi2: 0.8 },
  { key: 'parking',     label: 'Aparcamiento (Cat. F)',     psi2: 0.6 },
  { key: 'roof',        label: 'Cubierta (Cat. G)',         psi2: 0.0 },
  { key: 'custom',      label: 'Personalizado',             psi2: null },
] as const;
```

### `psi2` — quasi-permanent combination coefficient

- sym: `ψ₂`
- descLong: `Coeficiente de combinación cuasipermanente`
- descShort: `ψ₂ cuasiperm.`
- unit: `—`
- ref: `CTE DB-SE §4.2.4 Tabla 4.2` / `CE art. 13.2`
- modules: rcBeams, timberBeams (as `psi2Custom` input + derived)

### `NEd` — design axial force (ULS)

- sym: `NEd`
- descLong: `Axil de cálculo (compresión +)`
- descShort: `NEd axil`
- unit: `kN`
- ref: `EC3 §5.3` / `CE art. 42`
- modules: rcColumns, steelColumns, isolatedFooting, pileCap, empresillado, timberColumns

### `VEd` — design shear force (ULS)

- sym: `VEd`
- descLong: `Cortante de cálculo`
- descShort: `VEd cortante`
- unit: `kN`
- ref: `EC3 §6.2.6` / `CE art. 44`
- modules: rcBeams, steelBeams, timberBeams, timberColumns, punching, empresillado

### `MEd` — design bending moment, single axis

- sym: `MEd`
- descLong: `Momento de cálculo`
- descShort: `MEd momento`
- unit: `kNm`
- ref: `EC3 §6.2.5` / `CE art. 42`
- modules: rcBeams, steelBeams, timberBeams, timberColumns

### `My_Ed` — design bending about strong axis (column cross-section)

- sym: `My,Ed`
- descLong: `Momento de cálculo — eje fuerte`
- descShort: `My,Ed`
- unit: `kNm`
- ref: `EC3 §6.2.9` / `CE art. 42`
- modules: rcColumns, steelColumns

### `Mz_Ed` — design bending about weak axis (column cross-section)

- sym: `Mz,Ed`
- descLong: `Momento de cálculo — eje débil`
- descShort: `Mz,Ed`
- unit: `kNm`
- ref: `EC3 §6.2.9` / `CE art. 42`
- modules: rcColumns, steelColumns

### `Mx_Ed_plan` — design bending about plan x-axis (footing/pile cap/empresillado)

- sym: `Mx,Ed`
- descLong: `Momento de cálculo en planta (eje x)`
- descShort: `Mx,Ed`
- unit: `kNm`
- ref: `CE art. 42`
- modules: isolatedFooting, pileCap, empresillado

### `My_Ed_plan` — design bending about plan y-axis

- sym: `My,Ed`
- descLong: `Momento de cálculo en planta (eje y)`
- descShort: `My,Ed`
- unit: `kNm`
- ref: `CE art. 42`
- modules: isolatedFooting, pileCap, empresillado

### `N_k` — characteristic axial load (SLS / geotechnical)

- sym: `Nk`
- descLong: `Axil característico`
- descShort: `Nk`
- unit: `kN`
- ref: `CTE DB-SE §4.2` (combination)
- modules: isolatedFooting

### `Mx_k` / `My_k` / `H_k` — characteristic loads for footing sizing

- sym: `Mx,k` / `My,k` / `Hk`
- descLong: `Momento / fuerza horizontal característica`
- descShort: `Mk / Hk`
- unit: `kNm` / `kN`
- ref: `CTE DB-SE §4.2`
- modules: isolatedFooting

---

## Section 6 — Partial safety factors

### `gamma_c` — concrete partial safety factor

- sym: `γc`
- descLong: `Coeficiente parcial del hormigón`
- descShort: `γc`
- unit: `—`
- ref: `CE art. 15.3 Tabla 15.3.a`
- modules: (implicit in every RC module)

### `gamma_s` — rebar steel partial safety factor

- sym: `γs`
- descLong: `Coeficiente parcial del acero de armar`
- descShort: `γs`
- unit: `—`
- ref: `CE art. 15.3 Tabla 15.3.a`
- modules: (implicit in every RC module)

### `gamma_M0` — steel cross-section resistance partial factor

- sym: `γM0`
- descLong: `Coeficiente parcial — resistencia de la sección`
- descShort: `γM0`
- unit: `—`
- ref: `EC3 §6.1(1)`
- modules: steelBeams, steelColumns, compositeSection, empresillado

### `gamma_M1` — steel buckling resistance partial factor

- sym: `γM1`
- descLong: `Coeficiente parcial — resistencia al pandeo`
- descShort: `γM1`
- unit: `—`
- ref: `EC3 §6.1(1)`
- modules: steelColumns, empresillado

### `gamma_M_timber` — timber material partial factor

- sym: `γM`
- descLong: `Coeficiente parcial del material (madera)`
- descShort: `γM`
- unit: `—`
- ref: `EC5 §2.4.1 Tabla 2.3`
- modules: timberBeams, timberColumns

### `gamma_R_geo` — geotechnical resistance partial factor

- sym: `γR`
- descLong: `Coeficiente parcial de resistencia geotécnica`
- descShort: `γR`
- unit: `—`
- ref: `CTE DB-SE-C §2.3.3`
- modules: isolatedFooting

---

## Section 7 — Coefficients: timber (EC5)

### `kmod` — modification factor for duration and service class

- sym: `kmod`
- descLong: `Factor de modificación por duración y clase de servicio`
- descShort: `kmod`
- unit: `—`
- ref: `EC5 §3.1.3 Tabla 3.1`
- modules: timberBeams, timberColumns

### `kdef` — creep / deferred deformation factor

- sym: `kdef`
- descLong: `Factor de deformación diferida`
- descShort: `kdef`
- unit: `—`
- ref: `EC5 §3.1.4 Tabla 3.2`
- modules: timberBeams

### `kh_sawn` — size factor, sawn timber

- sym: `kh`
- descLong: `Factor de tamaño (madera aserrada)`
- descShort: `kh madera aserrada`
- unit: `—`
- ref: `EC5 §3.2(3) eq. 3.1`
- modules: timberBeams, timberColumns

### `kh_glulam` — size factor, glulam

- sym: `kh`
- descLong: `Factor de tamaño (madera laminada encolada)`
- descShort: `kh madera laminada`
- unit: `—`
- ref: `EC5 §3.3(3) eq. 3.2`
- modules: timberBeams, timberColumns

### `kcr` — effective shear area factor

- sym: `kcr`
- descLong: `Factor de área eficaz a cortante`
- descShort: `kcr`
- unit: `—`
- ref: `EC5 §6.1.7(2)`
- modules: timberBeams

### `ksys` — system factor

- sym: `ksys`
- descLong: `Factor de sistema (láminas solidarias)`
- descShort: `ksys`
- unit: `—`
- ref: `EC5 §6.6`
- modules: timberBeams

### `kcrit` — lateral-torsional buckling reduction factor (timber)

- sym: `kcrit`
- descLong: `Factor de vuelco lateral`
- descShort: `kcrit`
- unit: `—`
- ref: `EC5 §6.3.3`
- modules: timberBeams

### `kc_y` / `kc_z` — compression buckling reduction factors (timber columns)

- sym: `kc,y` / `kc,z`
- descLong: `Coeficiente de pandeo por compresión — eje y/z`
- descShort: `kc,y` / `kc,z`
- unit: `—`
- ref: `EC5 §6.3.2 eq. 6.25, 6.26`
- modules: timberColumns

### `lambda_rel` — relative slenderness (timber)

- sym: `λrel`
- descLong: `Esbeltez relativa`
- descShort: `λrel`
- unit: `—`
- ref: `EC5 §6.3.2 eq. 6.21`
- modules: timberBeams (`λrel,m`), timberColumns (`λrel,y`, `λrel,z`)

---

## Section 8 — Coefficients: steel (EC3)

### `chi_LT` — lateral-torsional buckling reduction factor

- sym: `χLT`
- descLong: `Factor de reducción por pandeo lateral`
- descShort: `χLT`
- unit: `—`
- ref: `EC3 §6.3.2.2 eq. 6.56`
- modules: steelBeams, steelColumns

### `chi_y` / `chi_z` — flexural buckling reduction factors

- sym: `χy` / `χz`
- descLong: `Factor de reducción por pandeo por flexión — eje y/z`
- descShort: `χy` / `χz`
- unit: `—`
- ref: `EC3 §6.3.1.2 eq. 6.49`
- modules: steelColumns

### `lambda_bar_LT` — non-dimensional LTB slenderness

- sym: `λ̄LT`
- descLong: `Esbeltez reducida — pandeo lateral`
- descShort: `λ̄LT`
- unit: `—`
- ref: `EC3 §6.3.2.2 eq. 6.56`
- modules: steelBeams, steelColumns

### `lambda_bar_y` / `lambda_bar_z` — non-dimensional flexural slenderness

- sym: `λ̄y` / `λ̄z`
- descLong: `Esbeltez reducida — eje y/z`
- descShort: `λ̄y` / `λ̄z`
- unit: `—`
- ref: `EC3 §6.3.1.3 eq. 6.50`
- modules: steelColumns

### `beta_buckling` — buckling length coefficient

- sym: `β`
- descLong: `Factor de longitud de pandeo`
- descShort: `β pandeo`
- unit: `—`
- ref: `CE art. 43.1.2 Tabla 43.1.2` / `EC3 §6.3.1.3`
- modules: rcColumns, steelColumns (βy/βz), timberColumns (βy/βz), empresillado (βx/βy, plan-view axes)

### `beta_punching` — punching shear eccentricity factor

- sym: `β`
- descLong: `Factor de excentricidad de carga`
- descShort: `β excentricidad`
- unit: `—`
- ref: `CE art. 46.3.2`
- modules: punching

### `Mcr` — elastic critical moment for LTB

- sym: `Mcr`
- descLong: `Momento crítico elástico (pandeo lateral)`
- descShort: `Mcr`
- unit: `kNm`
- ref: `EC3 §6.3.2.2` (informal annex)
- modules: steelColumns

---

## Section 9 — Resistances

### `MRd_rc` — concrete section bending resistance

- sym: `MRd`
- descLong: `Momento resistente de la sección`
- descShort: `MRd`
- unit: `kNm`
- ref: `CE art. 42.1.2`
- modules: rcBeams

### `MRd_y` / `MRd_z` — biaxial bending resistances

- sym: `MRd,y` / `MRd,z`
- descLong: `Momento resistente — eje y/z`
- descShort: `MRd,y` / `MRd,z`
- unit: `kNm`
- ref: `CE art. 42.1.2`
- modules: rcColumns, steelColumns

### `NRd_max` — maximum axial resistance (RC column)

- sym: `NRd,max`
- descLong: `Axil resistente máximo`
- descShort: `NRd,max`
- unit: `kN`
- ref: `CE art. 42.1.2`
- modules: rcColumns

### `VRd_c` — shear resistance without reinforcement

- sym: `VRd,c`
- descLong: `Cortante resistente sin armadura`
- descShort: `VRd,c`
- unit: `kN`
- ref: `CE art. 44.2.3.2.1`
- modules: rcBeams

### `VRd_s` — shear resistance with stirrups

- sym: `VRd,s`
- descLong: `Cortante resistente con cercos`
- descShort: `VRd,s`
- unit: `kN`
- ref: `CE art. 44.2.3.2.2`
- modules: rcBeams

### `Mc_Rd` — elastic/plastic cross-section bending resistance (steel)

- sym: `Mc,Rd`
- descLong: `Momento resistente de la sección (acero)`
- descShort: `Mc,Rd`
- unit: `kNm`
- ref: `EC3 §6.2.5 eq. 6.12-6.14`
- modules: steelBeams

### `Vc_Rd` — cross-section shear resistance (steel)

- sym: `Vc,Rd`
- descLong: `Cortante resistente de la sección (acero)`
- descShort: `Vc,Rd`
- unit: `kN`
- ref: `EC3 §6.2.6 eq. 6.17-6.18`
- modules: steelBeams

### `Mb_Rd` — LTB resistance moment

- sym: `Mb,Rd`
- descLong: `Momento resistente a vuelco lateral`
- descShort: `Mb,Rd`
- unit: `kNm`
- ref: `EC3 §6.3.2.1 eq. 6.54`
- modules: steelBeams, steelColumns

### `NRd_steel` — cross-section axial resistance (steel)

- sym: `NRd`
- descLong: `Axil resistente de la sección`
- descShort: `NRd`
- unit: `kN`
- ref: `EC3 §6.2.4 eq. 6.10`
- modules: steelColumns

### `Nb_Rd_y` / `Nb_Rd_z` — flexural buckling resistances

- sym: `Nb,Rd,y` / `Nb,Rd,z`
- descLong: `Axil resistente a pandeo — eje y/z`
- descShort: `Nb,Rd,y` / `Nb,Rd,z`
- unit: `kN`
- ref: `EC3 §6.3.1.1 eq. 6.46`
- modules: steelColumns, empresillado (compound)

### `vRd_c_punching` — punching shear resistance without reinforcement

- sym: `vRd,c`
- descLong: `Cortante resistente a punzonamiento (sin cercos)`
- descShort: `vRd,c`
- unit: `N/mm²`
- ref: `CE art. 46.3.3`
- modules: punching, isolatedFooting

### `vRd_cs` — punching shear resistance with stirrups

- sym: `vRd,cs`
- descLong: `Cortante resistente a punzonamiento (con cercos)`
- descShort: `vRd,cs`
- unit: `N/mm²`
- ref: `CE art. 46.3.4`
- modules: punching

### `vRd_max` — maximum punching shear at column face

- sym: `vRd,max`
- descLong: `Cortante resistente máximo en cara de pilar`
- descShort: `vRd,max`
- unit: `N/mm²`
- ref: `CE art. 46.3.2`
- modules: punching

### `vEd_punching` — acting punching shear stress

- sym: `vEd`
- descLong: `Cortante de punzonamiento actuante`
- descShort: `vEd`
- unit: `N/mm²`
- ref: `CE art. 46.3.2`
- modules: punching, isolatedFooting

### `u1_perimeter` — critical punching perimeter at 2d

- sym: `u1`
- descLong: `Perímetro crítico (a 2d del pilar)`
- descShort: `u1`
- unit: `mm`
- ref: `CE art. 46.3.2`
- modules: punching, isolatedFooting

---

## Section 10 — Rebar geometry

### `bar_diameter` — rebar bar diameter (generic)

- sym: `Ø`
- descLong: `Diámetro de la barra`
- descShort: `Ø`
- unit: `mm`
- ref: (input)
- modules: rcBeams, rcColumns, isolatedFooting, pileCap, punching, retainingWall

**Per-context variants (separate keys because the context changes descLong):**

- `Ø_corner` — `Diámetro de la barra de esquina` (rcColumns)
- `Ø_intermediate` — `Diámetro de la barra intermedia` (rcColumns)
- `Ø_stirrup` — `Diámetro del cerco` (rcBeams, rcColumns, punching)
- `Ø_tie` — `Diámetro del tirante` (pileCap)
- `Ø_x` / `Ø_y` — `Diámetro de la barra (dirección x/y)` (isolatedFooting)
- `Ø_top` / `Ø_bottom` — `Diámetro de la barra (cara superior/inferior)` (punching)

### `bar_spacing` — rebar spacing (generic)

- sym: `s`
- descLong: `Separación entre barras`
- descShort: `separación`
- unit: `mm`
- ref: (input), limited by `CE art. 42.3.1`
- modules: rcBeams, rcColumns, isolatedFooting, pileCap, punching

### `n_bars` — number of bars

- sym: `n`
- descLong: `Número de barras`
- descShort: `nº barras`
- unit: `ud`
- ref: (input)
- modules: rcBeams, rcColumns

### `n_stirrup_legs` — number of stirrup legs (transverse rebar)

- sym: `nr`
- descLong: `Número de ramas del cerco`
- descShort: `nº ramas`
- unit: `ud`
- ref: (input)
- modules: rcBeams, punching

### `As_total` — total longitudinal reinforcement area

- sym: `As`
- descLong: `Área total de armadura longitudinal`
- descShort: `As`
- unit: `mm²`
- ref: `CE art. 42.3` (minimum cuantía)
- modules: rcBeams, rcColumns

### `As_tension` — tension reinforcement area

- sym: `As`
- descLong: `Armadura de tracción`
- descShort: `As tracción`
- unit: `mm²`
- ref: `CE art. 42.3.2`
- modules: rcBeams

### `As_compression` — compression reinforcement area

- sym: `As,c`
- descLong: `Armadura de compresión`
- descShort: `As,c compresión`
- unit: `mm²`
- ref: `CE art. 42.3.3`
- modules: rcBeams

### `As_req_x` — required reinforcement per meter, x-direction

- sym: `As,req,x`
- descLong: `Armadura requerida — dirección x`
- descShort: `As,req,x`
- unit: `mm²/m`
- ref: `CE art. 42.1.2` / `art. 58.4.2` (footings)
- modules: isolatedFooting, pileCap

### `As_req_y` — required reinforcement, y-direction

- sym: `As,req,y`
- descLong: `Armadura requerida — dirección y`
- descShort: `As,req,y`
- unit: `mm²/m`
- ref: `CE art. 42.1.2` / `art. 58.4.2`
- modules: isolatedFooting, pileCap

### `As_min_x` / `As_min_y` — minimum reinforcement per direction

- sym: `As,min,x` / `As,min,y`
- descLong: `Armadura mínima geométrica — dirección x/y`
- descShort: `As,min,x` / `As,min,y`
- unit: `mm²/m`
- ref: `CE art. 42.3.5`
- modules: isolatedFooting, pileCap

### `As_adopted_x` / `As_adopted_y` — adopted reinforcement per direction

- sym: `As,adoptado,x` / `As,adoptado,y`
- descLong: `Armadura adoptada — dirección x/y`
- descShort: `As,adoptado,x` / `As,adoptado,y`
- unit: `mm²/m`
- ref: (output)
- modules: isolatedFooting, pileCap

### `rebar_schedule_format` — rebar schedule display string format

**Canonical format:** `Ø{d} c/{s} ({As} mm²/m)`
**Example:** `Ø16 c/200 (1005 mm²/m)`

Applies to: isolatedFooting, pileCap, retainingWall. Replaces the `@`
separator currently used by footing and pileCap.

---

## Section 11 — Geotechnical (soils)

### `phi_soil` — soil internal friction angle

- sym: `φ`
- descLong: `Ángulo de rozamiento interno del terreno`
- descShort: `φ fricción`
- unit: `°`
- ref: `CTE DB-SE-C §4.3`
- modules: isolatedFooting, retainingWall

### `c_soil` — soil cohesion

- sym: `c`
- descLong: `Cohesión del terreno`
- descShort: `c cohesión`
- unit: `kPa`
- ref: `CTE DB-SE-C §4.3`
- modules: isolatedFooting

### `gamma_soil` — soil unit weight

- sym: `γs`
- descLong: `Peso específico del terreno`
- descShort: `γ suelo`
- unit: `kN/m³`
- ref: `CTE DB-SE-C §4.3`
- modules: isolatedFooting, retainingWall

### `mu_base` — base friction coefficient

- sym: `μ`
- descLong: `Coeficiente de rozamiento suelo-base`
- descShort: `μ rozamiento`
- unit: `—`
- ref: `CTE DB-SE-C §4.4.3`
- modules: isolatedFooting, retainingWall

### `delta_wall` — wall-soil friction angle

- sym: `δ`
- descLong: `Ángulo de rozamiento muro-terreno`
- descShort: `δ rozam. pared`
- unit: `°`
- ref: `CTE DB-SE-C §7.3`
- modules: retainingWall

### `sigma_adm` — allowable bearing pressure

- sym: `σadm`
- descLong: `Tensión admisible del terreno`
- descShort: `σadm`
- unit: `kPa`
- ref: `CTE DB-SE-C §4.3` (characteristic) / `§4.3.1` (design)
- modules: isolatedFooting, retainingWall

### `sigma_max` / `sigma_min` — max/min base pressure (eccentric loading)

- sym: `σmax` / `σmin`
- descLong: `Tensión máxima / mínima en base`
- descShort: `σmax` / `σmin`
- unit: `kPa`
- ref: `CTE DB-SE-C §4.4` (Meyerhof)
- modules: isolatedFooting, retainingWall

### `N_SPT` — SPT N-value

- sym: `NSPT`
- descLong: `Valor SPT representativo`
- descShort: `NSPT`
- unit: `—`
- ref: `CTE DB-SE-C §3.5`
- modules: isolatedFooting

---

## Section 12 — Seismic (NCSP-07)

### `Ab_accel` — basic seismic acceleration

- sym: `Ab`
- descLong: `Aceleración sísmica básica`
- descShort: `Ab`
- unit: `g`
- ref: `NCSP-07 §2`
- modules: retainingWall

### `S_site` — soil amplification coefficient

- sym: `S`
- descLong: `Coeficiente de amplificación del suelo`
- descShort: `S amplif.`
- unit: `—`
- ref: `NCSP-07 §2.2`
- modules: retainingWall

### `kh_seismic` — horizontal seismic coefficient

- sym: `kh`
- descLong: `Coeficiente sísmico horizontal`
- descShort: `kh sísmico`
- unit: `—`
- ref: `NCSP-07 §4.2`
- modules: retainingWall

### `kv_seismic` — vertical seismic coefficient

- sym: `kv`
- descLong: `Coeficiente sísmico vertical`
- descShort: `kv sísmico`
- unit: `—`
- ref: `NCSP-07 §4.2`
- modules: retainingWall

### `K_AE` — Mononobe-Okabe active earth pressure coefficient

- sym: `KAE`
- descLong: `Coeficiente de empuje activo sísmico (Mononobe-Okabe)`
- descShort: `KAE Mononobe-Okabe`
- unit: `—`
- ref: `NCSP-07 Anejo A`
- modules: retainingWall

### `Ka_coulomb` — static active earth pressure coefficient (Coulomb)

- sym: `Ka`
- descLong: `Coeficiente de empuje activo (Coulomb)`
- descShort: `Ka Coulomb`
- unit: `—`
- ref: `CTE DB-SE-C §7.3`
- modules: retainingWall

---

## Section 13 — Serviceability

### `wk` — characteristic crack width

- sym: `wk`
- descLong: `Abertura característica de fisura`
- descShort: `wk`
- unit: `mm`
- ref: `CE art. 49.2.4 eq. 49.2.3.b`
- modules: rcBeams

### `delta_max` — maximum vertical deflection

- sym: `δmax`
- descLong: `Flecha máxima`
- descShort: `δmax`
- unit: `mm`
- ref: `CE art. 50` / `EC3 §7.2.1`
- modules: steelBeams

### `delta_adm` — admissible deflection limit

- sym: `δadm`
- descLong: `Flecha admisible`
- descShort: `δadm = L/n`
- unit: `mm`
- ref: `CTE DB-SE §4.3.3`
- modules: steelBeams

### `u_inst` — instantaneous deflection (timber)

- sym: `uinst`
- descLong: `Flecha instantánea`
- descShort: `uinst`
- unit: `mm`
- ref: `EC5 §7.2`
- modules: timberBeams

### `u_fin` — final deflection (timber)

- sym: `ufin`
- descLong: `Flecha final (incluye fluencia)`
- descShort: `ufin`
- unit: `mm`
- ref: `EC5 §7.2 eq. 7.2`
- modules: timberBeams

### `u_active` — active deflection (timber)

- sym: `uactiva`
- descLong: `Flecha activa`
- descShort: `uactiva`
- unit: `mm`
- ref: `EC5 §7.2`
- modules: timberBeams

---

## Section 14 — Fire (EC5 §4)

### `fireResistance` — required fire resistance time

- sym: (dropdown)
- descLong: `Resistencia al fuego requerida`
- descShort: `R (min)`
- unit: `min`
- ref: `CTE DB-SI §6` (requirement) / `EC5 §4.2`
- modules: timberBeams, timberColumns

### `exposedFaces` — number of fire-exposed faces

- sym: (dropdown)
- descLong: `Caras expuestas al fuego`
- descShort: `caras expuestas`
- unit: `—`
- ref: `EC5 §4.2.2`
- modules: timberBeams, timberColumns

### `beta_n` — notional charring rate

- sym: `βn`
- descLong: `Velocidad de carbonización nominal`
- descShort: `βn`
- unit: `mm/min`
- ref: `EC5 §4.2.2 Tabla 3.1`
- modules: timberBeams, timberColumns

### `dchar` — charring depth

- sym: `dchar`
- descLong: `Profundidad carbonizada`
- descShort: `dchar = βn·t`
- unit: `mm`
- ref: `EC5 §4.2.2 eq. 4.1`
- modules: timberBeams, timberColumns

### `d0_zeroStrength` — zero-strength layer

- sym: `d0`
- descLong: `Capa de resistencia nula`
- descShort: `d0`
- unit: `mm`
- ref: `EC5 §4.2.2`
- modules: timberBeams, timberColumns

### `def_penetration` — effective penetration depth

- sym: `def`
- descLong: `Penetración eficaz del fuego`
- descShort: `def = dchar + d0`
- unit: `mm`
- ref: `EC5 §4.2.2 eq. 4.2`
- modules: timberBeams, timberColumns

### `b_ef_fire` / `h_ef_fire` — residual fire-design cross-section

- sym: `b_ef` / `h_ef`
- descLong: `Sección residual tras el fuego`
- descShort: `b_ef × h_ef`
- unit: `mm`
- ref: `EC5 §4.2.2`
- modules: timberBeams, timberColumns

### `eta_fi` — fire load reduction factor

- sym: `ηfi`
- descLong: `Factor de reducción de carga en incendio`
- descShort: `ηfi`
- unit: `—`
- ref: `EC5 §2.4.2 eq. 2.8`
- modules: timberColumns

---

## Module-specific terms (NOT in labels.ts — stay inline)

These appear in only one module and do not warrant the shared constants file.
Keep them inline in the module component. Listed here for audit completeness.

**rcBeams only:** `stirrupLegs`, `M_G`, `M_Q`, `x` (neutral axis), `lapLength`

**rcColumns only:** `e1`, `e_imp`, `e2`, `e_tot`, `MEd_tot`, `cornerBarDiam` (specific context)

**steelBeams only:** `bTrib` (tributary width), `Lcr`, `elsCombo`, `wEd`, `wSer`, `Mser`, `deflLimit`

**timberBeams only:** `kcr`, `ksys`, `kcrit`, `λrel,m`, `MEd_fi`, `VEd_fi`, `fm_k_fi`, `fv_k_fi`

**timberColumns only:** `Lef,y`, `Lef,z`, `fc0,d`, `σc,0,d`, `momentAxis`

**isolatedFooting only:** `ex`, `ey`, `B'`, `L'`, `σ_eff`, `qh`, `qadm`, `Rd,desliz`, `Td,x`, `Td,y`, `ax`, `ay`, `Clasificación`, `d_avg`

**pileCap only:** `R_i`, `R_max`, `R_min`, `Lx × Ly`, `e_borde`, `h_min`, `z_eff`, `a_crit`, `θ` (biela), `σ_biela`, `σ_Rd,max`, `Ft,x`, `Ft,y`, `lb,básica`, `lb,neta`, `lb,disp`, `n` (número pilotes), `d_p`, `s` (sep pilotes), `R_adm`

**punching only:** `cx`, `cy`, `isCircular`, `ρl`, `ρl,min`, `vmin`, `vEd,0`, `Asw por fila`, `uout`, `k` (factor tamaño), `fywk`, `swLegs`, `sr`, `position`, `hasShearReinf`

**retainingWall only:** `tFuste`, `bPunta`, `bTalon`, `gammaSat`, `q` (sobrecarga), `hasWater`, `hw`, `EAH_total`, `EW`, `ΣV`, `e_excent`, `MEd_fuste`, `MEd_talon`, `MEd_punta`, `As,req fuste/talón/punta`, `As,min fuste/talón/punta`

**compositeSection only:** `A` (total), `y_c`, `Iy`, `Wel,sup`, `Wel,inf`, `Wel,min`, `Wpl`, `α` (Wpl/Wel,min), plate `posType`, `t` (plate thickness), `customYBottom`

**empresillado only:** `perfil` (angle profile selector), `s` (batten spacing), `lp`, `bp`, `tp`, `dx/dy`, `hx/hy`, `I_X/I_Y`, `i_X/i_Y`, `N_chord_max`, `lambda_v`, `lambda_0X/Y`, `lambda_vl`, `lambda_effX/Y`, `chi_v`, `chi_X/Y`, `V_Ed` (pletina), `M_Ed_pl`

---

## Summary

- **Pan-module entries (for `labels.ts`):** ~85 (geometry 21 + materials 13 + loads 15 + partial factors 6 + timber coeffs 9 + steel coeffs 6 + resistances 14 + rebar 8 + geotech 8 + seismic 6 + serviceability 6 + fire 9)

  Note: this is larger than the 60 estimate in the decisions doc because the overloading resolution from #8 creates separate entries per physical concept (e.g. 3× `b`, 3× `h`, 3× `L`, 2× `β`).

- **Module-specific entries (stay inline):** ~140 across all 12 modules

- **Catalog coverage:** 345 extracted labels → ~85 pan-module + ~140 inline + ~120 duplicates / near-duplicates consolidated = 100% accounted for

- **Estimated `labels.ts` file size:** ~350 lines of TypeScript (comments + entries)

---

## Next step

Transcribe Sections 1-14 into `src/lib/text/labels.ts` as a single `LABELS`
object satisfying `Record<string, Label>`. Verify every `ref` value against
the actual EC3/EC5/CE/CTE PDF text before committing. Commit `labels.ts`
as a standalone change (no imports yet — the first consumer is the timber
beams exemplar module in a later commit).
