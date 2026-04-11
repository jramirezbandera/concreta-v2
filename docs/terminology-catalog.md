# Terminology Catalog — Concreta

Source of truth for every physical-quantity label found in the 12 input panels and 12 result panels. Extracted verbatim from the source files; no inventions.

Total entries: 345

## By module

### rcBeams (33 entries)

File: `src/features/rc-beams/RCBeamsInputs.tsx`, `src/features/rc-beams/RCBeamsResults.tsx`

**Inputs:**
- `b` — Ancho b (mm)
- `h` — Canto h (mm)
- `cover` — Recubrimiento (mm)
- `fck` — fck (MPa)
- `fyk` — fyk (MPa)
- `exposureClass` — Clase de exposicion
- `loadType` — Tipo de carga
- `psi2Custom` — ψ₂ personalizado (—)
- `nBars` (tension) — Num. barras (ud)
- `barDiam` (tension) — Diametro
- `nBars` (compr) — Num. barras (ud)
- `barDiam` (compr) — Diametro
- `stirrupDiam` — Estribos
- `stirrupSpacing` — Separacion (mm)
- `stirrupLegs` — Num. ramas (ud)
- `Md` — Md / |Md| (kNm) — (ELU, M+) / (ELU, M−)
- `VEd` — VEd (kN) — (ELU)
- `M_G` — M carga permanente (kNm) — (ELS)
- `M_Q` — M carga variable (kNm) — (ELS)

**Results:**
- `d` — d (canto util) (mm)
- `As` — As (traccion) (mm²)
- `AsComp` — As,c (compresion) (mm²)
- `x` — x (eje neutro) (mm)
- `MRd` — MRd (kNm)
- `VRd` — VRd (kN)
- `wk` — wk (mm)
- Section groups: `ELU Flexion`, `ELU Cortante`, `Separacion barras`, `ELS Fisuracion`
- `Despiece` — Despiece
- `lapLength` — Solape min. (CE art. 69.5.2) (mm)

### rcColumns (36 entries)

File: `src/features/rc-columns/RCColumnsInputs.tsx`, `src/features/rc-columns/RCColumnsResults.tsx`

**Inputs:**
- `b` — Ancho b (mm)
- `h` — Canto h (mm)
- `cover` — Recubrimiento (mm)
- `L` — Longitud L (m)
- `beta` — Beta β (—) — (coef. pandeo)
- `Lk` — Lk = L × β (m) [derived display]
- `fck` — fck (MPa)
- `fyk` — fyk (MPa)
- `cornerBarDiam` — Ø esquina (mm) — (4 barras)
- `nBarsX` — Núm. interm. (ud) — (por cara) [cara X]
- `barDiamX` — Diámetro (mm) [cara X]
- `nBarsY` — Núm. interm. (ud) — (por cara) [cara Y]
- `barDiamY` — Diámetro (mm) [cara Y]
- `As_total` — As total (mm²) [derived display]
- `stirrupDiam` — Ø estribo (mm)
- `stirrupSpacing` — Separación (mm)
- `Nd` — NEd (kN) — (compresión +)
- `MEdy` — MEdy (kNm) — (eje y, h)
- `MEdz` — MEdz (kNm) — (eje z, b)

**Results:**
- `d` — d (canto útil) (mm)
- `λ` — λ (esbeltez)
- `e1` — e1 (mm)
- `e_imp` — e_imp (mm)
- `e2` — e2  (2º orden) (mm)
- `e_tot` — e_tot (mm)
- `MEd_tot` — MEd,tot (kNm)
- `d'` — d' (arm. compresión) (mm)
- `As_total` — As total (mm²)
- `NRd_max` — NRd,max (kN)
- `MRdy / MRdz` — MRdy / MRdz (kNm)
- `ned → a` — ned → a
- Section groups: `ELU Flexión Esviada`, `Pandeo y segundo orden`, `Armadura longitudinal`, `Armadura transversal`
- `Despiece` — Despiece
- `lapLength` — Solape mín. (CE art. 69.5.2) (mm)

### steelBeams (41 entries)

File: `src/features/steel-beams/SteelBeamsInputs.tsx`, `src/features/steel-beams/SteelBeamsResults.tsx`

**Inputs:**
- `tipo` — Tipo
- `size` — Tamaño
- `steel` — Acero
- `L` — L (m) — (luz viga)
- `bTrib` — b (m) — (ancho trib.)
- `gk` — g (kN/m²) — (perm. adicional)
- `qk` — q (kN/m²) — (sobrecarga uso)
- `useCategory` — Categoría
- `Lcr` — Lcr (m) — (longitud)
- `elsCombo` — Combinación
- `Mser` — Mser (kNm) — (ELS) [derived display]
- `deflLimit` — Límite flecha
- `δadm = L/n` — δadm = L/{deflLimit} (mm) [info row]

Derivation box (read-only):
- `Gk` — Gk = gk·bTrib (kN/m)
- `Qk` — Qk = qk·bTrib (kN/m)
- `wEd` — wEd = 1.35·Gk + 1.50·Qk (kN/m)
- `MEd` — MEd (kNm)
- `VEd` — VEd (kN)
- `wSer` — wSer (kN/m)
- `Mser` — Mser (kNm)

**Results:**
- `Mc,Rd` — Mc,Rd (kNm)
- `Vc,Rd` — Vc,Rd (kN)
- `Mb,Rd (LTB)` — Mb,Rd (LTB) (kNm)
- `χLT` — χLT
- `λ̄LT` — λ̄LT
- `δmax` — δmax (mm)
- `δadm = L/n` — δadm = L/{deflLimit} (mm)
- Section groups: `Sección`, `ELU Flexión`, `ELU Cortante`, `Pandeo lateral (LTB)`, `ELS Flecha`

### steelColumns (35 entries)

File: `src/features/steel-columns/SteelColumnsInputs.tsx`, `src/features/steel-columns/SteelColumnsResults.tsx`

**Inputs:**
- `sectionType` — Tipo
- `size` — Tamaño
- `steel` — Acero
- `Ly` — Ly (m) — (eje fuerte)
- `Lz` — Lz (m) — (eje débil)
- `beta_y` — βy (—)
- `beta_z` — βz (—)
- `Ned` — NEd (kN) — (compresión)
- `My_Ed` — My,Ed (kNm) — (eje fuerte)
- `Mz_Ed` — Mz,Ed (kNm) — (eje débil)

**Results:**
- `NRd` — NRd (kN)
- `My,Rd` — My,Rd (kNm)
- `Mz,Rd` — Mz,Rd (kNm)
- `Nb,Rd,y` — Nb,Rd,y (kN)
- `Nb,Rd,z` — Nb,Rd,z (kN)
- `χy` — χy
- `χz` — χz
- `λ̄y` — λ̄y
- `λ̄z` — λ̄z
- `Mcr` — Mcr (kNm)
- `χLT` — χLT
- `Mb,Rd` — Mb,Rd (kNm)
- Section groups: `Sección`, `Resistencia sección`, `Pandeo (ELU)`, `Pandeo lateral (LTB)`, `Interacción N+M`, `Esbeltez`

### timberBeams (37 entries)

File: `src/features/timber-beams/TimberBeamsInputs.tsx`, `src/features/timber-beams/TimberBeamsResults.tsx`

**Inputs:**
- `gradeId` — Clase resistente
- `b` — b (mm) — ancho
- `h` — h (mm) — canto
- `L` — Luz (m) — L
- `gk` — Permanente (kN/m) — gk
- `qk` — Variable (kN/m) — qk
- `serviceClass` — Clase de servicio
- `loadDuration` — Duración de carga
- `loadType` — Tipo de carga
- `psi2Custom` — ψ₂ personalizado
- `kmod` — kmod  (Tabla 3.1) [derived info]
- `kdef` — kdef  (Tabla 3.2) [derived info]
- `γM` — γM [derived info]
- `isSystem` — Sistema resistente
- `fireResistance` — Requisito fuego
- `exposedFaces` — Caras expuestas

**Results:**
- `kmod` — kmod — duración y clase de servicio  (Tabla 3.1)
- `kh` — kh — factor de tamaño  (§3.2 / §3.3)
- `kcr` — kcr — área eficaz a cortante  (§6.1.7(2))
- `ksys` — ksys — factor de sistema  (§6.6)
- `kdef` — kdef — deformación diferida  (Tabla 3.2)
- `γM` — γM — coeficiente de material
- `ψ₂` — ψ₂ — combinación cuasipermanente
- `MEd` — MEd — momento de cálculo (kNm)
- `VEd` — VEd — cortante de cálculo (kN)
- `σm,d` — σm,d — tensión de flexión (N/mm²)
- `fm,d · kh · ksys` — fm,d · kh · ksys — resist. flexión (N/mm²)
- `τd` — τd — tensión cortante (Av = kcr·A) (N/mm²)
- `fv,d` — fv,d — resist. cortante (N/mm²)
- `λrel,m` — λrel,m — esbeltez relativa LTB
- `kcrit` — kcrit — factor pandeo lateral  (§6.3.3)
- `u_inst` — u_inst — flecha instantánea (mm)
- `u_inst_lim` — Límite instantánea  (L/300) (mm)
- `u_fin` — u_fin — flecha final (mm)
- `u_fin_lim` — Límite final  (L/250) (mm)
- `u_active` — u_activa — flecha activa (mm)
- `u_active_lim` — Límite activa  (L/350) (mm)
- `βn` — βn — velocidad de carbonización (mm/min)
- `dchar` — dchar = βn · t — profundidad carbonizada (mm)
- `d0` — d0 — capa resistencia nula (mm)
- `def` — def = dchar + d0 — penetración eficaz (mm)
- `b_ef × h_ef` — Sección residual  b_ef × h_ef (mm)
- `MEd_fi` — MEd,fi — combinación incendio (kNm)
- `VEd_fi` — VEd,fi (kN)
- `fm_k_fi` — fm,k — resist. flexión  (γM,fi = 1.0) (N/mm²)
- `fv_k_fi` — fv,k — resist. cortante  (γM,fi = 1.0) (N/mm²)

### timberColumns (40 entries)

File: `src/features/timber-columns/TimberColumnsInputs.tsx`, `src/features/timber-columns/TimberColumnsResults.tsx`

**Inputs:**
- `gradeId` — Clase resistente
- `b` — b (mm) — ancho
- `h` — h (mm) — canto
- `L` — Longitud (m) — L
- `beta_y` — Apoyo eje fuerte
- `beta_z` — Apoyo eje débil
- `Nd` — Axil (kN) — Nd
- `Vd` — Cortante (kN) — Vd
- `Md` — Momento (kNm) — Md
- `momentAxis` — Eje de momento
- `serviceClass` — Clase de servicio
- `loadDuration` — Duración de carga
- `kmod` — kmod  (Tabla 3.1) [derived info]
- `γM` — γM [derived info]
- `fireResistance` — Requisito fuego
- `exposedFaces` — Caras expuestas
- `etaFi` — Factor carga — η_fi

**Results:**
- `kmod` — kmod
- `γM` — γM
- `kh` — kh
- `fc0,d` — fc0,d (N/mm²)
- `fm,d` — fm,d (N/mm²)
- `fv,d` — fv,d (N/mm²)
- `Lef,y` — Lef,y (eje fuerte) (m)
- `Lef,z` — Lef,z (eje débil) (m)
- `λy` — λy (eje fuerte)
- `λz` — λz (eje débil)
- `λrel,y` — λrel,y
- `λrel,z` — λrel,z
- `kc,y` — kc,y
- `kc,z` — kc,z
- `σc,0,d` — σc,0,d (N/mm²)
- `σm,d` — σm,d (N/mm²)
- `τd` — τd (N/mm²)
- `dchar` — dchar (mm)
- `def` — def (mm)
- `b_ef × h_ef` — Secc. residual (mm)
- Section groups: `Parámetros EC5`, `Pandeo EC5 §6.3.2`, `Tensiones`, `ELU — Verificaciones`, `Fuego — Verificaciones`

### isolatedFooting (45 entries)

File: `src/features/isolated-footing/IsolatedFootingInputsPanel.tsx`, `src/features/isolated-footing/IsolatedFootingResults.tsx`

**Inputs:**
- `soilType` — Tipo de suelo (Cohesivo / Granular)
- `B` — B (m) — ancho (x)
- `L` — L (m) — largo (y)
- `h` — h (m) — canto
- `bc` — bc (m) — pilar ancho x
- `hc` — hc (m) — pilar canto y
- `Df` — Df (m) — profundidad
- `cover` — rec. (mm) — al eje barra
- `N_k` — N_k (kN) — axil
- `Mx_k` — Mx_k (kNm) — momento x
- `My_k` — My_k (kNm) — momento y
- `H_k` — H_k (kN) — horizontal
- `N_Ed` — N_Ed (kN) — axil
- `Mx_Ed` — Mx_Ed (kNm) — momento x
- `My_Ed` — My_Ed (kNm) — momento y
- `fck` — fck (MPa)
- `fyk` — fyk (MPa)
- `phi_x` — Ø_x
- `s_x` — s_x (mm) — sep. barras x
- `phi_y` — Ø_y
- `s_y` — s_y (mm) — sep. barras y
- `c_soil` — c (kPa) — cohesión
- `phi_soil` — φ (°) — ángulo rozam.
- `gamma_soil` — γ_s (kN/m³) — peso unitario
- `gamma_R` — γ_R (—) — coef. segur.
- `mu` — μ (—) — rozam. base
- `c_base` — c_base (kPa) — adhes. base
- `N_spt` — N_SPT (—) — valor repr.

**Results:**
- `ex` — ex (mm)
- `ey` — ey (mm)
- `B'` — B' (m)
- `L'` — L' (m)
- `σmax` — σmax (kPa)
- `σmin` — σmin (kPa)
- `σ_eff` — σ_eff (kPa)
- `qh` — qh (kPa)
- `qadm` — qadm (kPa)
- `Rd,desliz` — Rd,desliz (kN)
- `σ_Ed` — σ_Ed (kPa)
- `d_x` — d_x (mm)
- `d_y` — d_y (mm)
- `ax` — ax (m)
- `ay` — ay (m)
- `Clasificación` — Clasificación (Rígida / Flexible)
- `Td,x` — Td,x (kN)
- `Td,y` — Td,y (kN)
- `MEd,x` — MEd,x (kNm/m)
- `MEd,y` — MEd,y (kNm/m)
- `As,req,x` — As,req,x (mm²/m)
- `As,min,x` — As,min,x (mm²/m)
- `As,adoptado,x` — As,adoptado,x (mm²/m)
- `As,req,y` — As,req,y (mm²/m)
- `As,min,y` — As,min,y (mm²/m)
- `As,adoptado,y` — As,adoptado,y (mm²/m)
- `VEd,x` — VEd,x (kN/m)
- `VEd,y` — VEd,y (kN/m)
- `vRd,c` — vRd,c (MPa)
- `d_avg` — d_avg (mm)
- `u1` — u1 (mm)
- `vEd` — vEd (MPa)
- `vRd,c` — vRd,c (MPa) [punching]

### pileCap (32 entries)

File: `src/features/pile-cap/PileCapInputsPanel.tsx`, `src/features/pile-cap/PileCapResults.tsx`

**Inputs:**
- `n` — Número de micropilotes
- `d_p` — d_p (mm) — diám. pilote
- `s` — s (mm) — sep. c/c
- `h_enc` — h_enc (mm) — canto encepado
- `b_col` — b_col (mm) — ancho pilar x
- `h_col` — h_col (mm) — canto pilar y
- `R_adm` — R_adm (kN) — cap. admisible
- `N_Ed` — N_Ed (kN) — axil (compr.)
- `Mx_Ed` — Mx_Ed (kNm) — momento x
- `My_Ed` — My_Ed (kNm) — momento y
- `fck` — fck (MPa)
- `fyk` — fyk (MPa)
- `phi_tie` — Ø tirante
- `cover` — recubr. (mm) — al eje barra

**Results:**
- `R_i` — R1, R2, … (kN)
- `R_max` — R_max (kN)
- `R_min` — R_min (kN)
- `Lx × Ly` — Lx × Ly (mm)
- `e_borde` — e_borde (mm)
- `h_min` — h_min (mm)
- `z_eff` — z_eff (mm)
- `a_crit` — a_crit (mm)
- `θ` — θ (biela) (°)
- `σ_biela` — σ_biela (MPa)
- `σ_Rd,max` — σ_Rd,max (MPa)
- `Ft,x` — Ft,x (kN)
- `Ft,y` — Ft,y (kN)
- `As,req,x` — As,req,x (mm²)
- `As,min,x` — As,min,x (mm²)
- `As,adoptado,x` — As,adoptado,x (mm²)
- `As,req,y` — As,req,y (mm²)
- `As,min,y` — As,min,y (mm²)
- `As,adoptado,y` — As,adoptado,y (mm²)
- `sep_max` — sep_max (mm)
- `s_bar,x` — s_bar,x (mm)
- `s_bar,y` — s_bar,y (mm)
- `lb,básica` — lb,básica (mm)
- `lb,neta` — lb,neta (mm)
- `lb,disp` — lb,disp (mm)

### punching (28 entries)

File: `src/features/punching/PunchingInputs.tsx`, `src/features/punching/PunchingResults.tsx`

**Inputs:**
- `cx` — Dim. pilar x / Dim. área x — cx (mm)
- `cy` — Dim. pilar y / Dim. área y — cy (mm)
- `isCircular` — Circular
- `d` — Canto útil — d (mm)
- `fck` — fck (MPa)
- `fyk` — fyk (MPa)
- `barDiamSup` — Diámetro [Cara superior]
- `sSup` — Separación — s (mm)
- `barDiamInf` — Diámetro [Cara inferior]
- `sInf` — Separación — s (mm)
- `ρl` — ρl cara tensión [derived display]
- `VEd` — Reacción pilar / Carga puntual — VEd (kN)
- `position` — Posición
- `hasShearReinf` — Con cercos tipo viga
- `swDiam` — Ø cerco
- `swLegs` — Nº ramas
- `sr` — Separación — sr (mm)
- `fywk` — fywk (MPa)

**Results:**
- `β` — β (excentricidad)
- `u0` — u0 (cara del pilar) (mm)
- `u1` — u1 (perímetro crítico) (mm)
- `k` — k (factor tamaño)
- `As sup` — As sup (mm²/m)
- `As inf` — As inf (mm²/m)
- `ρl` — ρl (efectivo)
- `ρl,min` — ρl,min (CE art. 9.1)
- `vmin` — vmin (MPa)
- `vEd,0` — vEd,0 (en u0) (MPa)
- `vEd` — vEd (en u1) (MPa)
- `vRd,c` — vRd,c (sin cercos) (MPa)
- `vRd,max` — vRd,max (máximo) (MPa)
- `Asw por fila` — Asw por fila (mm²)
- `vRd,cs` — vRd,cs (con cercos) (MPa)
- `uout` — uout (mm)

### retainingWall (42 entries)

File: `src/features/retaining-wall/RetainingWallInputs.tsx`, `src/features/retaining-wall/RetainingWallResults.tsx`

**Inputs:**
- `H` — Altura fuste H (m)
- `hf` — Canto zapata hf (m)
- `tFuste` — Espesor fuste (m)
- `bPunta` — Punta bP (m)
- `bTalon` — Talón bT (m)
- `fck` — fck (N/mm²)
- `fyk` — fyk (N/mm²)
- `cover` — Recubrimiento (m)
- `gammaSuelo` — γ suelo seco (kN/m³)
- `gammaSat` — γ suelo sat. (kN/m³)
- `phi` — φ fricción (°)
- `delta` — δ rozamiento pared (°)
- `q` — Sobrecarga q (kN/m²)
- `sigmaAdm` — σ admisible (kPa)
- `mu` — μ fricción base (—)
- `hasWater` — Nivel freático
- `hw` — Prof. NF (desde cor.) (m)
- `Ab` — Ab (acel. básica) (g)
- `S` — S (amplif. suelo) (—)
- Rebar inputs (diam + sep): Trasdós (vert.), Intradós (vert.), Horizontal, Superior (talón), Inferior (punta), Transv. inferior, Transv. superior

**Results:**
- `Ka` — Ka (Coulomb)
- `kh` — kh (derivado)
- `kv` — kv (derivado)
- `KAD` — KAD (Mononobe-Okabe)
- `EAH_total` — EAH total (kN/m)
- `EW` — EW (hidráulica) (kN/m)
- `ΣV` — ΣV (kN/m)
- `e` — e (excentricidad) (m)
- `σ max` — σ max (kPa)
- `σ min` — σ min (kPa)
- `MEd_fuste` — MEd fuste (kNm/m)
- `As,req fuste` — As,req fuste (mm²/m)
- `As,min fuste` — As,min fuste (mm²/m)
- `MEd_talon` — MEd talón (kNm/m)
- `As,req talón` — As,req talón (mm²/m)
- `As,min talón` — As,min talón (mm²/m)
- `MEd_punta` — MEd punta (kNm/m)
- `As,req punta` — As,req punta (mm²/m)
- `As,min punta` — As,min punta (mm²/m)
- Section groups: `Valores geotécnicos`, `Valores estructurales`, `Armado verificado`, `Estabilidad (ELS geotécnico)`, `Sísmico (Mononobe-Okabe)`, `Resistencia fuste (ELU)`, `Resistencia talón (ELU)`, `Resistencia punta (ELU)`

### compositeSection (21 entries)

File: `src/features/compositeSection/CompositeSectionInputs.tsx`, `src/features/compositeSection/CompositeSectionResults.tsx`

**Inputs:**
- `profileType` — Tipo
- `profileSize` — Tamaño
- `grade` — Acero
- Plate fields:
  - `posType` — Posición
  - `b` — b (mm)
  - `t` — t (mm)
  - `customYBottom` — y inf. (mm)

**Results:**
- `A` — A total (cm²)
- `y_c` — y_c (desde abajo) (mm)
- `Iy` — Iy (cm⁴)
- `Wel,sup` — Wel,sup (cm³)
- `Wel,inf` — Wel,inf (cm³)
- `Wel,min` — Wel,min (cm³)
- `Wpl` — Wpl (cm³)
- `α` — α (Wpl / Wel,min)
- `MRd` — MRd (kNm)
- `fy` — fy (MPa)
- `γM0` — γM0
- Section groups: `Propiedades compuestas`, `Clasificación CE art. 5.2`, `Momento resistente`

### empresillado (37 entries)

File: `src/features/empresillado/EmpresalladoInputs.tsx`, `src/features/empresillado/EmpresalladoResults.tsx`

**Inputs:**
- `bc` — Ancho del pilar (bc) (cm)
- `hc` — Canto del pilar (hc) (cm)
- `L` — Altura libre del pilar (L) (m)
- `N_Ed` — Axil de diseño (N_Ed) (kN)
- `Mx_Ed` — Momento eje X (Mx_Ed) (kNm)
- `My_Ed` — Momento eje Y (My_Ed) (kNm)
- `Vd` — Cortante de diseño (V_Ed) (kN)
- `perfil` — Perfil
- `fy` — Límite elástico (fy) (MPa)
- `beta_x` — Coef. pandeo eje X (beta_x)
- `beta_y` — Coef. pandeo eje Y (beta_y)
- `s` — Separación entre pletinas (s) (cm)
- `lp` — Alto de pletina (lp) (cm)
- `bp` — Ancho de pletina (bp) (cm)
- `tp` — Espesor de pletina (tp) (mm)

**Results:**
- `dx / dy` — Excentricidad centroides (dx / dy) (cm)
- `hx / hy` — Separacion entre centroides (hx / hy) (cm)
- `I_X / I_Y` — Inercia compuesta (I_X / I_Y) (cm4)
- `i_X / i_Y` — Radio de giro compuesto (i_X / i_Y) (cm)
- `Formula: N_Ed/4 + Mx + My` — Formula: N_Ed/4 + Mx + My (kN)
- `N_chord_max` — Axil maximo en cordon (N_chord) (kN)
- `lambda_v` — Esbeltez local (lambda_v)
- `chi_v` — Coef. reducción local (chi_v) — curva b
- `lambda_0X / lambda_0Y` — Esbeltez global no corregida (lambda_0) X / Y
- `lambda_vl` — Esbeltez local aportada (lambda_vl)
- `lambda_effX / lambda_effY` — Esbeltez efectiva corregida (lambda_eff) X / Y
- `chi_X / chi_Y` — Coef. reducción de pandeo (chi) X / Y
- `chi` — Chi gobernante (eje más desfavorable)
- `V_Ed` — Cortante de diseño en pletina (V_Ed) (kN)
- `M_Ed_pl` — Momento flector en pletina (M_Ed) (kNm)
- Section groups: `Geometría de la sección compuesta`, `Cordones — EC3 §6.4.2`, `Pandeo local del cordón — EC3 §6.4.2.1`, `Pandeo global de la sección compuesta — EC3 §6.4.3`, `Pletinas — EC3 §6.4.3.2`

---

## Cross-module frequency

Symbols appearing in ≥2 modules (candidates for `labels.ts`):

| Symbol | Modules | Current descriptions |
|--------|---------|---------------------|
| `b` | rcBeams, rcColumns, steelBeams, timberBeams, timberColumns, compositeSection | "Ancho b" (rc), "b (ancho trib.)" (steelBeams), "b — ancho" (timber), "b" (composite) |
| `h` | rcBeams, rcColumns, timberBeams, timberColumns, isolatedFooting | "Canto h" (rc), "h — canto" (timber), "h — canto" (footing) |
| `L` | rcColumns, steelBeams, timberBeams, timberColumns, empresillado, isolatedFooting | "Longitud L" (rcCol), "L (luz viga)" (steelB), "Luz — L" (timberB), "Longitud — L" (timberCol), "Altura libre del pilar (L)" (empres), "L (largo y)" (footing) |
| `cover` | rcBeams, rcColumns, isolatedFooting, pileCap, retainingWall | "Recubrimiento" (rc), "rec. — al eje barra" (footing), "recubr. — al eje barra" (pileCap), "Recubrimiento" (retain) |
| `fck` | rcBeams, rcColumns, isolatedFooting, pileCap, punching, retainingWall | "fck" with units "MPa" (rc/footing/pileCap/punching) and "N/mm²" (retain) |
| `fyk` | rcBeams, rcColumns, isolatedFooting, pileCap, punching, retainingWall | "fyk" with units "MPa" / "N/mm²" |
| `fy` | compositeSection, empresillado | "fy" (composite), "Límite elástico (fy)" (empres) |
| `d` | rcBeams (result), rcColumns (result), punching (input), isolatedFooting (d_x, d_y, d_avg) | "d (canto util)" (rcBeams), "d (canto útil)" (rcColumns/punching), "d_x / d_y / d_avg" (footing) |
| `d'` | rcColumns | "d' (arm. compresión)" |
| `N_Ed` / `NEd` / `Nd` / `Ned` | rcColumns, steelColumns, isolatedFooting, pileCap, empresillado, timberColumns | "NEd — (compresión +)" (rcCol), "NEd — (compresión)" (steelCol), "N_Ed — axil" (footing), "N_Ed — axil (compr.)" (pileCap), "Axil de diseño (N_Ed)" (empres), "Axil — Nd" (timberCol) |
| `VEd` / `V_Ed` / `Vd` | rcBeams, steelBeams, timberBeams, timberColumns, punching, empresillado | "VEd — (ELU)" (rcB), "VEd" (steelB derived, timber result), "Reacción pilar — VEd" (punching), "Cortante de diseño (V_Ed)" (empres), "Cortante — Vd" (timberCol) |
| `MEd` / `Md` / `MEdy` / `MEdz` / `My_Ed` / `Mz_Ed` / `Mx_Ed` / `My_Ed` | rcBeams, rcColumns, steelBeams (derived), steelColumns, timberBeams, timberColumns, isolatedFooting, pileCap, empresillado, retainingWall | "Md — (ELU, M+)" (rcB), "MEdy — (eje y, h)" (rcCol), "MEd — momento de cálculo" (timberB), "Momento — Md" (timberCol), "Mx_Ed — momento x" (footing/pileCap), "Momento eje X (Mx_Ed)" (empres), "MEd fuste/talón/punta" (retain) |
| `MRd` | rcBeams, compositeSection | "MRd" (rcB), "MRd" (composite) |
| `NRd` / `NRd,max` | rcColumns, steelColumns | "NRd,max" (rcCol), "NRd" (steelCol) |
| `MRdy / MRdz` / `My,Rd` / `Mz,Rd` | rcColumns, steelColumns | "MRdy / MRdz" (rcCol), "My,Rd" / "Mz,Rd" (steelCol) |
| `λ` / `λ̄` | rcColumns, steelColumns, timberBeams, timberColumns, empresillado | "λ (esbeltez)" (rcCol), "λ̄y / λ̄z" (steelCol), "λrel,m" (timberB), "λy / λz / λrel,y / λrel,z" (timberCol), "lambda_v / lambda_0 / lambda_eff" (empres) |
| `χ` / `χLT` / `χy` / `χz` / `chi` | steelBeams, steelColumns, empresillado | "χLT" (steelB), "χy / χz / χLT" (steelCol), "chi_v / chi_X / chi_Y / chi" (empres) |
| `β` / `beta` | rcColumns, steelColumns, timberColumns, empresillado, punching, retainingWall | "Beta β — (coef. pandeo)" (rcCol), "βy / βz" (steelCol, BETA options), "β (excentricidad)" (punching), "Coef. pandeo eje X (beta_x)" (empres) |
| `γM` / `γM0` | compositeSection, timberBeams, timberColumns | "γM0" (composite), "γM — coeficiente de material" (timberB), "γM" (timberCol) |
| `kmod` | timberBeams, timberColumns | "kmod (Tabla 3.1)" / "kmod — duración y clase de servicio" |
| `kdef` | timberBeams (input + result) | "kdef (Tabla 3.2)" / "kdef — deformación diferida" |
| `kh` | timberBeams, timberColumns | "kh — factor de tamaño (§3.2 / §3.3)" (timberB), "kh" (timberCol) |
| `loadType` | rcBeams, timberBeams | "Tipo de carga" (both) |
| `loadDuration` | timberBeams, timberColumns | "Duración de carga" (both) |
| `serviceClass` | timberBeams, timberColumns | "Clase de servicio" (both) |
| `psi2Custom` | rcBeams, timberBeams | "ψ₂ personalizado" (both) |
| `gk` | steelBeams, timberBeams | "g — (perm. adicional)" (steelB), "Permanente — gk" (timberB) |
| `qk` | steelBeams, timberBeams | "q — (sobrecarga uso)" (steelB), "Variable — qk" (timberB) |
| `gradeId` | timberBeams, timberColumns | "Clase resistente" (both) |
| `fireResistance` | timberBeams, timberColumns | "Requisito fuego" (both) |
| `exposedFaces` | timberBeams, timberColumns | "Caras expuestas" (both) |
| `steel` / `grade` | steelBeams, steelColumns, compositeSection | "Acero" (all three) |
| `tipo` / `sectionType` / `profileType` | steelBeams, steelColumns, compositeSection | "Tipo" (all three) |
| `size` / `profileSize` | steelBeams, steelColumns, compositeSection | "Tamaño" (all three) |
| `u1` | punching, isolatedFooting | "u1 (perímetro crítico)" (punching), "u1" (footing) |
| `vRd,c` | punching, isolatedFooting | "vRd,c (sin cercos)" / "vRd,c" |
| `vEd` | punching, isolatedFooting | "vEd (en u1)" / "vEd" |
| `As,req,x/y`, `As,min,x/y`, `As,adoptado,x/y` | isolatedFooting, pileCap | identical labels |
| `Mx_Ed`, `My_Ed` | isolatedFooting, pileCap, empresillado | "Mx_Ed — momento x" (footing/pileCap), "Momento eje X (Mx_Ed)" (empres) |
| `N_k`, `Mx_k`, `My_k`, `H_k` | isolatedFooting only (SLS loads) | "N_k — axil" |
| `phi_tie` / `phi_x` / `phi_y` / `cornerBarDiam` / `barDiamX` / `barDiamY` / `stirrupDiam` / `barDiam` / `barDiamSup` / `barDiamInf` / `swDiam` | rcBeams, rcColumns, isolatedFooting, pileCap, punching | "Ø esquina", "Ø estribo", "Diametro/Diámetro", "Ø_x / Ø_y", "Ø tirante", "Ø cerco" |
| `stirrupSpacing` / `sSup` / `sInf` / `sr` / `s_x` / `s_y` | rcBeams, rcColumns, punching, isolatedFooting | "Separacion" / "Separación" / "sep. barras x" |
| `beta_y`, `beta_z` | steelColumns, timberColumns, empresillado | "βy / βz" (steelCol, timberCol), "beta_x / beta_y" (empres, note X/Y naming mismatch) |
| `Ly`, `Lz` | steelColumns | (single module) — axis-specific |
| `Lef,y`, `Lef,z` | timberColumns | (single module) |
| `fv,d`, `fm,d`, `fc0,d` | timberBeams, timberColumns | identical naming |
| `σm,d`, `τd` | timberBeams, timberColumns | identical naming |
| `dchar`, `def`, `b_ef`, `h_ef` | timberBeams, timberColumns | identical naming |
| `mu` / `μ` | isolatedFooting, retainingWall | "μ — rozam. base" (footing), "μ fricción base" (retain) |
| `phi` / `φ` | isolatedFooting, retainingWall | "φ — ángulo rozam." (footing), "φ fricción" (retain) |
| `σmax` / `σmin` | isolatedFooting, retainingWall | "σmax / σmin" (footing), "σ max / σ min" (retain) |
| `e` | isolatedFooting (ex, ey), retainingWall (e excentricidad), rcColumns (e1, e2, e_imp, e_tot) | various |
| `Mb,Rd` | steelBeams, steelColumns | "Mb,Rd (LTB)" (steelB), "Mb,Rd" (steelCol) |
| `Mcr` | steelColumns | (single) |
| `δadm`, `δmax` | steelBeams | (single module) |
| `bc`, `hc` | isolatedFooting, empresillado | "bc — pilar ancho x" (footing), "Ancho del pilar (bc)" (empres) |

---

## Drift report

Symbols where current descriptions disagree across modules (blocking for a canonical `labels.ts`). Each row lists the exact spellings that exist today; a canonical form must be chosen before consolidation.

- **`b` (width)** — rcBeams/rcColumns: "Ancho b"; steelBeams: "b" with sub "(ancho trib.)" (different concept — tributary width, not section width); timberBeams/timberColumns: "b" with sub "ancho"; compositeSection: "b" (plate width, different concept). Note three distinct concepts using the same symbol.
- **`h` (depth)** — rcBeams/rcColumns: "Canto h"; timberBeams/timberColumns: "h" with sub "canto"; isolatedFooting: "h" with sub "canto" (footing thickness, different concept); pileCap: `h_enc` "canto encepado".
- **`L` (length)** — rcColumns: "Longitud L" (column height); steelBeams: "L" with sub "(luz viga)"; timberBeams: "Luz" with sub "L"; timberColumns: "Longitud" with sub "L"; empresillado: "Altura libre del pilar (L)"; isolatedFooting: "L" with sub "largo (y)" (different concept — footing length in y). Multiple concepts.
- **`cover` / `Recubrimiento`** — rcBeams/rcColumns/retainingWall: "Recubrimiento" (no unit clarifier); isolatedFooting: "rec." with sub "al eje barra"; pileCap: "recubr." with sub "al eje barra". Three spellings.
- **`fck` unit** — rcBeams/rcColumns/isolatedFooting/pileCap/punching render options as "… MPa"; retainingWall renders options as "… N/mm²". Same quantity, inconsistent unit label.
- **`fyk` unit** — same drift: MPa in most modules, N/mm² in retainingWall.
- **Accents** — rcBeams has "Ancho" / "Canto" / "Clase de exposicion" / "Traccion" / "Compresion" / "Separacion" / "Diametro" / "Num. ramas" with NO accents; rcColumns, steelBeams, punching etc. use accented forms ("Separación", "Diámetro", "Compresión", "Núm.", "Tracción"). Major drift across otherwise-identical labels.
- **`NEd` variants** — "NEd" (rcColumns, steelColumns with sub), "N_Ed" (isolatedFooting, pileCap, empresillado), "Nd" (timberColumns sub). Same quantity, 3 spellings.
- **`VEd` variants** — "VEd" (rcBeams, steelBeams derived, timberBeams), "V_Ed" (empresillado, pileCap sub), "Vd" (timberColumns sub). Same quantity, 3 spellings.
- **`MEd` variants** — "Md" (rcBeams, timberColumns sub), "MEd" (steelBeams derived, timberBeams), "MEdy/MEdz" (rcColumns), "My,Ed / Mz,Ed" (steelColumns), "Mx_Ed / My_Ed" (isolatedFooting, pileCap, empresillado). Mix of subscript delimiters ("," vs "_" vs "y/z" vs "x/y").
- **`β` variants** — "Beta β" (rcColumns), "βy / βz" (steelColumns, timberColumns), "β" (punching, different concept: load eccentricity), "beta_x / beta_y" (empresillado — uses X/Y instead of y/z axis naming). Axis convention drift.
- **Axis naming** — steelColumns and timberColumns use y/z (strong/weak); empresillado uses X/Y for the same concept. Blocking.
- **`Separación` / `Separacion`** — appears both with and without accent across rcBeams vs rcColumns/punching.
- **`Diámetro` / `Diametro`** — same accent drift between rcBeams (no accent) and rcColumns/punching (accented).
- **`φ` / `phi`** — isolatedFooting: "φ" with sub "ángulo rozam." (also `phi_x`, `phi_y`, `phi_tie` as rebar diameters); retainingWall: "φ fricción"; pileCap: `phi_tie` "Ø tirante". Symbol `φ` vs `Ø` used inconsistently for bar diameter vs friction angle.
- **`Ø` variants** — "Ø esquina" / "Ø estribo" (rcColumns), "Ø_x / Ø_y" (isolatedFooting), "Ø tirante" (pileCap), "Ø cerco" (punching), "Diametro" / "Diámetro" (rcBeams, rcColumns, punching). Phi symbol vs word "Diámetro" drift.
- **`kmod` description** — timberBeams: "kmod — duración y clase de servicio  (Tabla 3.1)" (result) / "kmod  (Tabla 3.1)" (input info); timberColumns: "kmod" plain (result) / "kmod  (Tabla 3.1)" (input info). Result rows disagree.
- **`γM` description** — timberBeams: "γM — coeficiente de material"; timberColumns: "γM" plain. Input info rows identical.
- **`fck` / `fyk` unit**: (listed above — MPa vs N/mm²).
- **`Compresión` label for rebar** — rcBeams uses "Compresion (barras sup.)" / "Compresion (barras inf.)" (no accent); rcColumns does not render this label directly but would need consistency.
- **Load type options** — rcBeams LOAD_TYPE_OPTIONS uses keys {residential, office, parking, roof, custom}; timberBeams uses {residential, office, storage, roof, custom}. `parking` vs `storage` drift (different ψ₂ too: 0.6 vs 0.8).
- **`useCategory`** (steelBeams) vs `loadType` (rcBeams, timberBeams) — different mechanisms for the same role. steelBeams uses CTE DB-SE-AE tabla 3.1 codes (A1, A2, B, C1…) while rcBeams/timberBeams use semantic keys.
- **Rebar spacing display** — isolatedFooting/pileCap: `Ø{n}@{s} → {As} mm²/m`; retainingWall: `Ø{n} c/{sep} ({As} mm²/m)`. Different separator conventions.
- **`fy` vs `fyk`** — steelBeams result row: `fy` (MPa); compositeSection result: `fy`; empresillado input: `fy` labeled "Límite elástico". For reinforced-concrete modules `fyk` is used. Steel modules inconsistently drop the `k` subscript.

---

## Summary

- **Total catalog size:** 345 entries (inputs + results across 12 modules).
- **Pan-module symbols (≥2 modules):** approximately 45 distinct physical-quantity symbols appear in 2 or more modules (see frequency table).
- **Drift cases:** 22 notable drift clusters that block a clean `labels.ts` consolidation, including:
  1. Accent drift (rcBeams lacks accents the other modules have)
  2. `NEd` / `N_Ed` / `Nd` spelling variants
  3. `VEd` / `V_Ed` / `Vd` spelling variants
  4. `MEd` subscript delimiter chaos (comma / underscore / inline y/z / x/y)
  5. Axis naming (y/z vs X/Y) between steel/timber columns and empresillado
  6. `fck`/`fyk` unit rendering (MPa vs N/mm²) between retainingWall and the rest
  7. `Ø` vs `Diámetro` vs `φ` for bar diameter
  8. `b` / `h` / `L` reused for multiple physical concepts without disambiguation
  9. `cover` label spellings (Recubrimiento / rec. / recubr.)
  10. `Separación` / `Diámetro` / `Compresión` / `Tracción` accent inconsistencies between rcBeams and rcColumns
  11. `loadType` option-key drift (parking vs storage)
  12. `useCategory` (steelBeams, CTE codes) vs `loadType` (semantic) for the same role
  13. Rebar spacing string format (`@` vs `c/`)
  14. `fy` vs `fyk` in steel modules
  15. `phi` used for bar diameter subscripts in footing/pileCap but for friction angle in retainingWall/footing
  16. `kmod` / `γM` result-row description spelled out vs plain between timberBeams and timberColumns
  17. Concept reuse: `β` for buckling coefficient (rcCol, steelCol, timberCol) vs load-eccentricity factor (punching)
  18. `Mb,Rd` with vs without "(LTB)" qualifier between steelBeams and steelColumns
  19. `bc` / `hc` label spellings ("Ancho del pilar (bc)" vs "bc — pilar ancho x")
  20. `h` reused for section depth (rc/timber beams) vs footing thickness vs pile-cap `h_enc`
  21. Structural vs geotechnical γM0 labeling
  22. `As` suffix conventions: `As,req,x` / `As_req_x` / `As,req fuste` mixing comma, underscore, and prose subscripts
