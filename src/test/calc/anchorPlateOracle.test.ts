// PR1 — Oracle pack: manual hand-calc derivations from Spanish Código
// Estructural (RD 470/2021) and Eurocode fallback.
//
// CRITICAL READ BEFORE ACTIVATING ANY OF THESE TESTS
// ───────────────────────────────────────────────────
//
// The whole suite is wrapped in `describe.skip` because:
//
//   1. The expected values below are derived from the NORMATIVE FORMULAS
//      as they should be implemented post-fix (CR1 biaxial Ft distribution,
//      CR2 partial-lift rectangular plastic block, CR3 splitting ψh,sp,
//      CR4 dispatcher routing, CR6 concrete shear modes, H4 NEd<0 branch).
//      The current pre-fix module produces DIFFERENT numbers — these
//      tests would fail today against the buggy implementation.
//
//   2. Hand calculations are an authorship artifact, not an independent
//      oracle. A structural engineer must review the math before any of
//      these tests are flipped from `describe.skip` to `describe`. Once
//      reviewed, the tolerances below should be tightened (±20% → ±5%).
//
//   3. As subsequent PRs land they activate individual configs:
//        - Config A (FTUX biaxial)         → after PR7a+PR7b+PR6 (biaxial Ft + partial-lift + splitting)
//        - Config B (Mx puro 6 barras)     → after PR5 (dispatcher routing)
//        - Config C (compresión dominante) → after PR0 (purely additive)
//        - Config D (splitting crítico)    → after PR6 (CR3 splitting rewrite)
//        - Config E (mástil tracción pura) → after PR10 (NEd<0 branch)
//
// Normative references throughout:
//   - CE Anejo 11 = anclajes en hormigón     (≈ EN 1992-4)
//   - CE Anejo 18 = uniones de acero / placa  (≈ EC3 1-8)
//   - CE Anejo 19 = hormigón estructural       (≈ EC2)

import { describe, it, expect } from 'vitest';
import { calcAnchorPlate } from '../../lib/calculations/anchorPlate';
import { anchorPlateDefaults } from '../../data/defaults';

// ──────────────────────────────────────────────────────────────────────────
// Config A — FTUX biaxial moderado
// ──────────────────────────────────────────────────────────────────────────
//
// HEB-200, placa 400×300×20 mm S275, 4·φ20 B500S en esquinas (edge_x = edge_y = 50),
// prolongación recta, hef=300, rib_count=2 (h=120, t=10), fck=25,
// pedestal 700×600 (= plate 400×300 + 2·150), pedestal_h = 1000 (default PR0).
// Edges from bolt to pedestal edge: cX=cY=200 mm.
//
// Cargas: NEd=200 kN (compresión), NEd_G=120 kN, Mx=45 kNm, My=10 kNm, VEd=50 kN.
//
// ─── Material strengths ────────────────────────────────────────────────
//   fcd = 25/1.5 = 16.667 MPa
//   fyd (placa S275) = 275/1.05 = 261.9 MPa
//   fyd (B500S)      = 500/1.15 = 434.78 MPa
//   As (φ20) = π·20²/4 = 314.16 mm²
//   FtRd_per_bar = 314.16·434.78/1000 = 136.59 kN
//   FvRd_per_bar = 0.6·314.16·434.78/1000 = 81.95 kN
//
// ─── α extension (CE Anejo 18 §6.2.5(4)) ──────────────────────────────
//   ed = plate_margin_x/plate_a = 150/400 = 0.375
//   el = plate_margin_y/plate_b = 150/300 = 0.500
//   α (formula actual del código) = min(3, max(1, min(1+2·0.375, 1+2·0.5))) = 1.75
//   fjd = (2/3)·1.75·16.667 = 19.44 MPa
//   NOTA: H2 dice que la fórmula correcta es Kj=√(b1·d1/(a·b)), aún por fixear (PR0
//   no lo toca). Para este oracle se usa la fórmula actual del código.
//
// ─── Solver biaxial (post-CR1) — esperado ─────────────────────────────
//   |M_ext| = √(45² + 10²) = 46.1 kNm. Ángulo carga: atan(10/45) ≈ 12.5°.
//   El eje neutro se orienta para satisfacer ΣN, ΣMx, ΣMy. En Mx-dominado
//   las 2 barras del lado tenso reciben la mayor Ft (lineal con distancia al NA).
//   Post-CR1 estimate:
//     - bar en (-150, -100) cerca del NA → Ft ≈ 5-10 kN
//     - bar en (-150, +100) lejos del NA → Ft ≈ 12-18 kN
//     - bars en (+150, ±100) comprimidas o casi neutras
//     Ft_total ≈ 25-35 kN (rango razonable; el actual bug clava 4·136.6 = 546 kN!)
//     Nc = NEd + Ft_total ≈ 225-235 kN
//
// ─── Check 6: longitud anclaje (CE Anejo 19 §49.5) ────────────────────
//   fctd = 0.21·25^(2/3)/1.5 = 1.197 MPa
//   fbd = 2.25·1·1·fctd = 2.69 MPa (η1=η2=1, vertical pre-installed)
//   cd = min(200, 200, (300-20)/2, (200-20)/2) = min(200,200,140,90) = 90 mm
//   3·φ = 60 mm. cd > 3φ → prolongación recta sigue siendo α1=1.0.
//   σsd (post-CR1, Ft_per_bar ≈ 15 kN) = (15/136.59)·434.78 = 47.7 MPa
//   lb_rqd = 1.0 · 20/4 · 47.7/2.69 = 88.7 mm
//   util = 88.7/300 = 0.296 → ★ bajo (anclaje sobrado)
//
// ─── Check 7: cono hormigón (CE Anejo 11 §7.2.1.4) ─────────────────────
//   k1 = 7.7 (cracked)
//   N0Rk,c = 7.7·√25·300^1.5 = 7.7·5·5196.2 = 200055 N
//   N0Rd,c = 200055/1.5 = 133.37 kN
//   s_cr,N = 3·hef = 900 mm
//   c_cr,N = 1.5·hef = 450 mm
//   Ac_N0 = s_cr,N² = 810000 mm²
//
//   Grupo de 4 esquinas (±150, ±100):
//     x_range = 300, y_range = 200
//     extX = min(c_cr,N, pedestal_cX) = min(450, 200) = 200
//     extY = min(c_cr,N, pedestal_cY) = min(450, 200) = 200
//     Ac_N = (300+2·200)·(200+2·200) = 700·600 = 420000 mm²
//     Ac_N / Ac_N0 = 420000/810000 = 0.519
//
//   c_min = 200, c_cr = 450 → ψs,N = 0.7 + 0.3·200/450 = 0.833
//
//   NRd,c = 133.37 · 0.519 · 0.833 = 57.66 kN
//   util (Ft_total ≈ 30 kN) = 30/57.66 = 0.520
//
// ─── Check 9: splitting (CE Anejo 11 §7.2.1.6, post-CR3) ──────────────
//   c_min = 200, c_cr,sp = 1.5·hef = 450 → c_min < c_cr,sp → splitting aplica
//   h_pedestal = 1000, 2·hef = 600 → h > 2·hef → ψh,sp = (h/2hef)^(2/3) bound
//     (h/2hef)^(2/3) = (1000/600)^0.667 = 1.667^0.667 = 1.408
//     2·c_max/hef bound: 2·200/300 = 1.333 → 1.333^0.667 = 1.211
//     ψh,sp = max(1.0, min(1.408, 1.211)) = 1.211
//   ψs,sp = 0.833 (same as cone)
//   Group eccentricity (post-CR3): centroide traccionado ≈ (-75, -25) si Mx domina
//     |e| ≈ √(75² + 25²) = 79 mm
//     s_cr,sp = 3·hef = 900
//     ψec,sp = 1/(1 + 2·79/900) = 1/1.176 = 0.850
//   NRd,sp = N0Rd,c · (Ac/Ac0) · ψh,sp · ψec,sp · ψs,sp
//          = 133.37 · 0.519 · 1.211 · 0.850 · 0.833 = 59.4 kN
//   util ≈ 30/59.4 = 0.505 → ★ comparable a cono
//
// ─── Veredicto Config A esperado ───────────────────────────────────────
//   worstUtil ≈ 0.52 (cono o splitting empatan)
//   status = 'ok' (< 0.80)
//   mode = 'biaxial-plastic'
//
// CURRENT BUG STATE (pre-PR7b): worstUtil = 7.11 (CR1 clavando Ft = 4·FtRd
// hace cono al 700%). Este oracle pasa cuando CR1 + CR3 estén arreglados.
// ──────────────────────────────────────────────────────────────────────────

const configA = { ...anchorPlateDefaults };

// ──────────────────────────────────────────────────────────────────────────
// Config B — Fachada Mx puro 6 barras
// ──────────────────────────────────────────────────────────────────────────
//
// HEB-240, placa 500×400×25 mm S275, 6·φ20 B500S (layout 3×2: -200, 0, +200 en x;
// -150, +150 en y), patilla, hef=400, rib_count=2 (h=150, t=12), fck=25,
// pedestal 800×700×600 (plate_margin = 150).
// Bolt-to-pedestal-edge: cX = cY = 200.
//
// Cargas: NEd=350, NEd_G=200, Mx=120, My=0, VEd=80.
//
// ─── ★ EL TEST PRIMARIO: dispatcher debe routear a biaxial, NO a 4-corner ──
//   Bug CR4 actual: My=0 ⇒ dispatcher rutea a solveAxisAligned4 ⇒ modela
//   sólo 4 esquinas, ignorando las 2 barras del centro. Post-PR5 fix:
//   solveAxisAligned4 sólo se llama si `bar_nLayout === 4`. Para 6 barras
//   con My=0, debe ir al solver biaxial (que maneja 6 correctamente).
//
// ─── Material strengths (mismas que A) ────────────────────────────────
//   FtRd_per_bar = 136.59 kN
//
// ─── α extension ───────────────────────────────────────────────────────
//   ed = 150/500 = 0.30 → 1+2·0.30 = 1.60
//   el = 150/400 = 0.375 → 1+2·0.375 = 1.75
//   α = min(3, max(1, min(1.60, 1.75))) = 1.60
//   fjd = (2/3)·1.60·16.667 = 17.78 MPa
//
// ─── Solver (post-CR4 dispatcher + post-CR1 Ft real) ──────────────────
//   6 barras: layout 3×2. En Mx puro, las 3 del lado tenso (-x) reciben
//   tracción. Distribución lineal con NA paralelo al eje y:
//   barras en (-200, ±150) reciben Ft_max
//   barras en (0, ±150) reciben 0 (en el NA)
//   barras en (+200, ±150) comprimidas
//
//   Equilibrio simplificado:
//     M_int (de 2 barras tensas) ≈ 2·Ft_max·200 = 400·Ft_max [kNmm]
//     Pero las del centro están en el NA → no contribuyen.
//     400·Ft_max ≈ Mx·1000 + Nc·brazo_compresión
//
//   Plástico con bloque rectangular en lado +x:
//     b_eq estimado ≈ 400 (plate_b)
//     ΣN: fjd·b·y - 2·Ft_max = NEd
//     ΣMx: fjd·b·y·(a/2 - y/2) + 2·Ft_max·x_t = Mx + NEd·x_t
//       con x_t = a/2 - edge_x = 250 - (a/2 - spacing/2*... → en 3×2 layout,
//       las barras tensas están en x = -a/2 + edge_x = -200 mm
//       x_t = 200, brazo desde NA en x=0 hasta lado +x.
//
//   Sistema:
//     17.78·400·y - 2·Ft_max = 350·1000 = 350000 N
//     17.78·400·y·(250 - y/2) + 2·Ft_max·200 = 120·10^6 + 350000·200 = 190·10^6 Nmm
//
//   De (1): Ft_max = (17.78·400·y - 350000)/2 = 3556·y - 175000
//
//   Sub en (2): 7112·y·(250 - y/2) + 400·(3556·y - 175000) = 190·10^6
//     7112·y·(250 - y/2) = 7112·250·y - 7112·y²/2 = 1.778·10^6·y - 3556·y²
//     Total: 1.778·10^6·y - 3556·y² + 1.4224·10^6·y - 70·10^6 = 190·10^6
//     -3556·y² + 3.2·10^6·y - 260·10^6 = 0
//     y² - 900·y + 73117 = 0
//     disc = 810000 - 292468 = 517532 → √ = 719.4
//     y = (900-719.4)/2 = 90.3 mm
//
//   Ft_max = 3556·90.3 - 175000 = 321100 - 175000 = 146100 N = 146.1 kN per bar
//   ★ Ft_max > FtRd (=136.6) → saturado! Bars yield.
//
//   Si saturado: redistribuir. Las 3 barras del lado -x todas saturan en Ft = FtRd.
//   2 en y=±150, 1 en y=0 (centro). Pero la del centro en x=-200 también satura.
//   Total saturado Ft = 3·136.6 = 410 kN.
//
//   Recalculando con todas tensas saturadas a 410:
//     ΣN: fjd·b·y - 410 = NEd → fjd·b·y = 760 kN
//     17.78·400·y = 760·1000 → y = 760000/7112 = 106.9 mm
//     ΣMx check: fjd·b·y·(a/2 - y/2) + 410·200 = 17.78·400·106.9·(250-53.5) + 82000
//                = 760000·196.5 + 82000·1000 = 149.3·10^6 + 82·10^6 = 231·10^6 Nmm
//     M aplicado + NEd·x_t = 190·10^6 < 231·10^6 → no equilibra. El bloque puede
//     ser menor.
//
//   Iterando: con sólo 2 barras saturadas (las de y=±150, no la central):
//     Total Ft = 2·136.6 = 273.2 kN; ΣN: y = (NEd + 273.2)/(17.78·400/1000)·1000
//                                         = 623.2/7.112 = 87.6 mm
//     ΣMx: 17.78·400·87.6·(250-43.8) + 273.2·200·... = 622400·206.2 + 54640·1000
//                                                    = 128.3·10^6 + 54.6·10^6 = 182.9·10^6
//     Target 190·10^6 → falta 7·10^6. La barra central agrega: Ft_central·200 ≈ ?
//     Si la central toma Ft_central·200 = 7·10^6 → Ft_central = 35 kN.
//     Total Ft = 273.2 + 35 = 308.2 kN, Nc = 658.2 kN. Aprox razonable.
//
//   Ft_total estimado: 280-310 kN. Nc: 630-660 kN.
//   ★ Resultado: solver biaxial converge con phi ≈ 0 (NA ⊥ eje x).
//
// ─── Cone group ────────────────────────────────────────────────────────
//   Grupo de 6 barras tensas/comprimidas: tomar sólo tensas (3 en x=-200, y=-150,0,+150)
//   x_min=x_max=-200 (un solo x), y_min=-150, y_max=+150
//   range_x=0, range_y=300
//   extX = min(c_cr, 200) = 200, extY = min(c_cr, 200) = 200
//   Ac_N = (0+400)·(300+400) = 280000 mm²
//   Ac_N / Ac_N0 = (3·400)² = 1440000... wait, c_cr=1.5·hef=600, s_cr=1800
//   Ac_N0 = 1800² = 3.24·10^6
//   Ac_N/Ac_N0 = 280000/3240000 = 0.086 → ★ MUCHO menor que A!
//   N0Rd,c (con hef=400) = 7.7·5·8000/1.5 = 205.3 kN
//   ψs,N = 0.7 + 0.3·200/600 = 0.80
//   NRd,c = 205.3 · 0.086 · 0.80 = 14.1 kN
//   util = Ft_total/NRd,c ≈ 290/14.1 = 20.6 → ★ FAIL extremo
//
//   ★ ESTO indica que la configuración Config B en realidad FALLA por cono
//   con esa geometría. Es razonable — fachada con Mx grande y bordes
//   ajustados → cono insuficiente. El TEST sirve para verificar que el
//   solver no falsamente reporte CUMPLE en este caso.
//
// ─── Veredicto Config B esperado ──────────────────────────────────────
//   solver.bolts.length = 6 (★ CRÍTICO para CR4)
//   solver.mode ∈ {'biaxial-plastic', 'biaxial-grid'} (★ para CR4)
//   worstUtil >> 1.0 (cono al 20x), status = 'fail'
//
// CURRENT BUG STATE (pre-PR5 CR4): solver.bolts.length = 4 (ignora 6 barras).
// solver.mode = 'partial-lift'. Resultado falso. Este test fuerza la fix.
// ──────────────────────────────────────────────────────────────────────────

const configB = {
  ...anchorPlateDefaults,
  sectionType: 'HEB' as const,
  sectionSize: 240,
  plate_a: 500,
  plate_b: 400,
  plate_t: 25,
  plate_steel: 'S275' as const,
  bar_nLayout: 6 as const,
  bar_diam: 20 as const,
  bar_grade: 'B500S' as const,
  bar_spacing_x: 200,
  bar_spacing_y: 300,
  bar_edge_x: 50,
  bar_edge_y: 50,
  bar_hef: 400,
  bottom_anchorage: 'patilla' as const,
  rib_count: 2 as const,
  rib_h: 150,
  rib_t: 12,
  fck: 25,
  pedestal_cX: 200, pedestal_cY: 200,
  pedestal_cX1: 200, pedestal_cX2: 200, pedestal_cY1: 200, pedestal_cY2: 200,
  pedestal_h: 600,
  plate_margin_x: 150, plate_margin_y: 150,
  NEd: 350, NEd_G: 200, Mx: 120, My: 0, VEd: 80, Vx: 80, Vy: 0,
};

// ──────────────────────────────────────────────────────────────────────────
// Config C — Interior compresión dominante
// ──────────────────────────────────────────────────────────────────────────
//
// HEB-280, placa 450×450×30 mm S355, 4·φ25 B500S esquinas (edge=60),
// prolongación recta, hef=400, rib_count=0, fck=30,
// pedestal 700×700×500.
//
// Cargas: NEd=1200, NEd_G=900, Mx=30, My=15, VEd=40.
//
// ─── Análisis: e_max ────────────────────────────────────────────────────
//   |M_ext| = √(30² + 15²) = 33.5 kNm
//   e = M/NEd = 33500/1200 = 27.9 mm
//   a/6 = 450/6 = 75 mm → e < a/6 → ★ uniform-compression
//
//   No hay tracción en barras. Nc = NEd = 1200 kN.
//
// ─── Plate compression (CE Anejo 18 §6.2.5) ─────────────────────────────
//   fcd = 30/1.5 = 20 MPa
//   α = min(3, max(1, min(1+2·125/450, 1+2·125/450))) = 1.556 (margin asumido 125)
//   fjd = (2/3)·1.556·20 = 20.75 MPa
//   c = t·√(fyd/(3·fjd)) — post-H5 fix usando fyd no fy:
//   fyd_S355 = 355/1.05 = 338.1 MPa
//   c = 30·√(338.1/(3·20.75)) = 30·√(5.43) = 30·2.331 = 69.93 mm
//   Para HEB-280 (h=270, b=280):
//     c_max_strong = (450-270)/2 = 90, c_max_weak = (450-280)/2 = 85
//     c_eff = min(69.93, 90, 85) = 69.93
//   2 flanges (uniform-compression):
//     A_flange = (280+2·c)·(13+2·c) = 419.86·152.86 = 64175 mm² each
//     A_web ≈ (10.5+2·c)·(270-2·13-2·c) = 150.36·94.14 = 14150 mm²
//     Aeff = 2·64175 + 14150 = 142500 mm² (capped at 450·450 = 202500)
//   Nc,Rd = fjd · Aeff = 20.75·142500/1000 = 2956.9 kN
//   util = 1200/2956.9 = 0.406 → ★ bien
//
// ─── Sin tracción ⇒ cone, splitting, anchorage, pullout = neutral ─────
// ─── bolt shear: con NEd_G=900, µ=0.4 → Vfric=360 > VEd=40 → trivial ──
//
// ─── Veredicto Config C esperado ──────────────────────────────────────
//   solver.mode = 'uniform-compression'
//   solver.Nc ≈ 1200 (= NEd)
//   solver.Ft_total = 0
//   worstUtil ≈ 0.40-0.45 (plate compression)
//   status = 'ok'
//
// CURRENT BUG STATE (pre-fix): probablemente ya funciona en este caso
// porque pure compression activa fast path. Bien para regression test.
// ──────────────────────────────────────────────────────────────────────────

const configC = {
  ...anchorPlateDefaults,
  sectionType: 'HEB' as const,
  sectionSize: 280,
  plate_a: 450,
  plate_b: 450,
  plate_t: 30,
  plate_steel: 'S355' as const,
  bar_nLayout: 4 as const,
  bar_diam: 25 as const,
  bar_grade: 'B500S' as const,
  bar_spacing_x: 330, bar_spacing_y: 330,
  bar_edge_x: 60, bar_edge_y: 60,
  bar_hef: 400,
  bottom_anchorage: 'prolongacion_recta' as const,
  rib_count: 0 as const,
  rib_h: 0,
  rib_t: 0,
  fck: 30,
  pedestal_cX: 185, pedestal_cY: 185,
  pedestal_cX1: 185, pedestal_cX2: 185, pedestal_cY1: 185, pedestal_cY2: 185,
  pedestal_h: 500,
  plate_margin_x: 125, plate_margin_y: 125,
  NEd: 1200, NEd_G: 900, Mx: 30, My: 15, VEd: 40, Vx: 40, Vy: 0,
};

// ──────────────────────────────────────────────────────────────────────────
// Config D — Esquina splitting crítico
// ──────────────────────────────────────────────────────────────────────────
//
// HEB-200, placa 350×300×20 mm S275, 4·φ16 B500S (edge=40, hef=250), gancho,
// rib_count=2, fck=25, pedestal 500×400×400 (★ pedestal_h=400 < 2·hef=500 ⇒
// ψh,sp aplica con amplificación moderada).
// cX=75, cY=50 → ★ MUY cerca del borde.
//
// Cargas: NEd=80, NEd_G=50, Mx=35, My=20, VEd=30.
//
// ─── Material strengths ────────────────────────────────────────────────
//   As (φ16) = π·16²/4 = 201.06 mm²
//   FtRd_per_bar = 201.06·434.78/1000 = 87.41 kN
//
// ─── Splitting (CE Anejo 11 §7.2.1.6, post-CR3) ────────────────────────
//   hef = 250, c_cr,sp = 1.5·250 = 375
//   c_min = min(cX, cY) = 50
//   c_min < c_cr,sp → splitting aplica.
//   h_pedestal = 400, 2·hef = 500 → h < 2·hef → ψh,sp puede < 1 (pero capped a 1)
//   (h/2hef)^(2/3) = (400/500)^0.667 = 0.8^0.667 = 0.862
//   2·c_min/hef = 2·50/250 = 0.4 → 0.4^0.667 = 0.543
//   ψh,sp = max(1.0, min(0.862, 0.543)) = max(1.0, 0.543) = 1.0
//
//   k1·√fck·hef^1.5/γMc = 7.7·5·250^1.5/1.5 = 7.7·5·3953/1.5 = 101469 N = 101.5 kN
//   N0Rd,c = 101.5 kN
//
//   Group de 4 esquinas (±135, ±110) — el plate es 350×300 con edge 40:
//     bolt_x = ±(350/2 - 40) = ±135, bolt_y = ±(300/2 - 40) = ±110
//     x_range = 270, y_range = 220
//   c_cr,N = c_cr,sp = 375 (ambos = 1.5·hef)
//   extX = min(375, cX=75) = 75
//   extY = min(375, cY=50) = 50
//   Ac_N = (270+150)·(220+100) = 420·320 = 134400 mm²
//   Ac_N0 = (3·250)² = 562500
//   Ac_N / Ac_N0 = 0.239
//
//   ψs,sp = 0.7 + 0.3·50/375 = 0.74
//   Group eccentricity post-CR1 (4 esquinas con Mx=35, My=20):
//     Centroide traccionado: |e| ≈ √(135² · ratio² + 110² · ratio²)
//     Asumiendo distribución lineal y Mx>My, ratio_x ≈ 0.5, ratio_y ≈ 0.3:
//     e_x ≈ 0.5·135 = 67, e_y ≈ 0.3·110 = 33
//     |e| = √(67²+33²) = 75 mm
//     s_cr,sp = 3·250 = 750
//     ψec,sp = 1/(1+2·75/750) = 1/1.2 = 0.833
//
//   NRd,sp = N0Rd,c · (Ac/Ac0) · ψh,sp · ψec,sp · ψs,sp
//          = 101.5 · 0.239 · 1.0 · 0.833 · 0.74 = 14.97 kN ≈ 15 kN
//
// ─── Solver biaxial post-CR1 ──────────────────────────────────────────
//   |M_ext| = √(35² + 20²) = 40.3 kNm
//   Lever ≈ 2·135 = 270 mm
//   Aproximación: Ft_total ≈ M / lever ≈ 40300/270 = 149 kN... pero capped:
//   4·FtRd = 4·87.41 = 349.6 kN total cap → no satura
//   Estimación: Ft_total ≈ 20-35 kN (post-equilibrium con NEd=80)
//
// ─── Veredicto Config D esperado ──────────────────────────────────────
//   solver.mode ∈ {'biaxial-plastic', 'biaxial-grid'}
//   splitting check: util = Ft_total/NRd,sp ≈ 30/15 = 2.0 → ★ FAIL
//   status = 'fail'
//
// CURRENT BUG STATE (pre-CR3): ψh = √(50/375) = 0.365 (fórmula equivocada)
// + multiplica por n_t=4 (?? también buggy). Da NRd,sp distinto, posible
// "no crítico" o util falsa.
// ──────────────────────────────────────────────────────────────────────────

const configD = {
  ...anchorPlateDefaults,
  sectionType: 'HEB' as const,
  sectionSize: 200,
  plate_a: 350,
  plate_b: 300,
  plate_t: 20,
  plate_steel: 'S275' as const,
  bar_nLayout: 4 as const,
  bar_diam: 16 as const,
  bar_grade: 'B500S' as const,
  bar_spacing_x: 270, bar_spacing_y: 220,
  bar_edge_x: 40, bar_edge_y: 40,
  bar_hef: 250,
  bottom_anchorage: 'gancho' as const,
  rib_count: 2 as const,
  rib_h: 120, rib_t: 10,
  fck: 25,
  pedestal_cX: 75, pedestal_cY: 50,
  pedestal_cX1: 75, pedestal_cX2: 75, pedestal_cY1: 50, pedestal_cY2: 50,
  pedestal_h: 400,
  plate_margin_x: 75, plate_margin_y: 50,
  NEd: 80, NEd_G: 50, Mx: 35, My: 20, VEd: 30, Vx: 30, Vy: 0,
};

// ──────────────────────────────────────────────────────────────────────────
// Config E — Mástil tracción pura (NEd < 0)
// ──────────────────────────────────────────────────────────────────────────
//
// HEA-160, placa 300×300×15 mm S235, 4·φ16 B500S esquinas (edge=40, hef=300),
// patilla, rib_count=0, fck=25, pedestal 500×500×500 cuadrado.
//
// Cargas: NEd=-50 kN (★ TRACCIÓN), NEd_G=0, Mx=8, My=8, VEd=15.
//
// ─── Análisis post-H4 fix ──────────────────────────────────────────────
//   Pure-tension branch: todas las 4 barras traccionadas. Sin bloque compresión.
//   Distribución base axial: -NEd / 4 = 50/4 = 12.5 kN por barra.
//   Más momento: las 2 barras del cuadrante (+x,+y) reciben adicional positivo,
//   las 2 del (-x,-y) reciben adicional negativo.
//
//   Lever para Mx: 2 barras a +110 mm, 2 a -110 mm. (bolt position ±110 = 150-40)
//   ΣMx = 2·Ft_top·110 - 2·Ft_bot·110 = Mx·1000
//   Ft_top - Ft_bot = 8000/(2·110)/1000 = 36.4 kN... wait Mx*1000=8000 kNmm
//   Ft_top - Ft_bot = 8000/220 = 36.4 kN
//   ΣN: 2·Ft_top + 2·Ft_bot = 50 kN → Ft_top + Ft_bot = 25
//   → Ft_top = 30.7 kN, Ft_bot = -5.7 kN (parcialmente comprimida)
//
//   Pero todas las barras embebidas no comprimen físicamente (no hay placa
//   tirando hacia arriba contra ellas si NEd<0). Si Ft_bot < 0, esa barra
//   está descomprimida pero su contribución estructural es 0 (no comprime
//   el hormigón porque la placa está despegada).
//
//   Modelo simplificado: Ft_bot = 0, sólo Ft_top resiste.
//   Recalcular: 2·Ft_top·110 = 8000+(50·110/2)·... no, no es así si Ft_bot=0.
//
//   Si Ft_bot=0:
//     ΣN: 2·Ft_top = -NEd → Ft_top = 25 kN
//     ΣMx: 2·Ft_top·110 = Mx_aplicado + brazo·NEd_eqv = 8000 kNmm? No.
//     Si las 2 barras superiores resisten todo:
//     ΣMx alrededor del CG: 2·Ft_top·110 - 0 = 25·220 = 5500 kNmm = 5.5 kNm
//     Mx aplicado = 8 kNm > 5.5 → no equilibra. Necesita Ft_top más.
//     Ft_top·220 = 8000 → Ft_top = 36.4 kN.
//     Pero ΣN: 2·Ft_top = 72.8 kN > 50 (NEd absoluto). Imposible sin reacción.
//
//   Esto sugiere que la solución correcta para Config E es no-equilibrio
//   en x sólo (Ft_top también resiste Vy de algo).
//
//   Mejor: NEd=-50 kN, Mx=8, My=8. Centroide de tracción ≠ centroide geométrico.
//   Todas las 4 barras pueden estar en tracción si el momento lo permite.
//
//   Ft distribuido linealmente desde un "punto neutro" virtual fuera de la
//   placa. Aproximación: distribución por área. Las 4 barras con coords:
//     barra 0: (-110, -110)  → relativo a centroide tracción
//     barra 1: (+110, -110)
//     barra 2: (-110, +110)
//     barra 3: (+110, +110)
//   Centroide de carga: tracción NEd actúa en (0,0), Mx en y, My en x.
//   Equivalente: punto de aplicación (My/N, Mx/N) = (8/50, 8/50)·1000 = (160, 160) mm
//   ★ Fuera de la placa (300×300). Tracción excéntrica fuerte.
//
//   Para que las 4 barras equilibren tracción excéntrica con resultante en
//   (160,160), la barra (-110,-110) puede estar comprimida (descomprimida hasta 0).
//
//   Estimación a mano simplificada:
//     barra (+x,+y) lleva el grueso: Ft ≈ 25-35 kN
//     barras (+x,-y) y (-x,+y): Ft ≈ 5-15 kN
//     barra (-x,-y): Ft ≈ 0 (descomprimida)
//
//   Total Ft ≈ 35-60 kN, debe igualar |NEd|=50 → aprox OK.
//
// ─── Cono (toda la jaula tensa) ─────────────────────────────────────────
//   tBars = 3 o 4 barras (no incluye la descomprimida si Ft=0).
//   Para simplificar, asumimos 4 tensas:
//     x_range = 220, y_range = 220
//     c_cr,N = 1.5·300 = 450, extX = extY = min(450, 150) = 150
//     Ac_N = (220+300)·(220+300) = 270400 mm²
//     Ac_N0 = (3·300)² = 810000
//     Ac/Ac0 = 0.334
//   N0Rd,c = 7.7·5·300^1.5/1.5 = 133.4 kN
//   ψs,N = 0.7 + 0.3·150/450 = 0.80
//   NRd,c = 133.4·0.334·0.80 = 35.6 kN
//   util = 50/35.6 = 1.40 → ★ FAIL
//
// ─── Veredicto Config E esperado ──────────────────────────────────────
//   solver.mode = 'pure-tension' (★ post-PR10 new branch)
//   solver.Nc ≈ 0 (no compression)
//   solver.Ft_total ≈ 50 kN (= |NEd|)
//   solver.nTension = 3 o 4
//   worstUtil > 1.0 (cono al 140%)
//   status = 'fail'
//
// CURRENT BUG STATE (pre-PR10): `Math.max(NEd, 1e-6)` enmascara → output basura.
// solver.mode probablemente 'partial-lift' con valores absurdos.
// ──────────────────────────────────────────────────────────────────────────

const configE = {
  ...anchorPlateDefaults,
  sectionType: 'HEA' as const,
  sectionSize: 160,
  plate_a: 300,
  plate_b: 300,
  plate_t: 15,
  plate_steel: 'S235' as const,
  bar_nLayout: 4 as const,
  bar_diam: 16 as const,
  bar_grade: 'B500S' as const,
  bar_spacing_x: 220, bar_spacing_y: 220,
  bar_edge_x: 40, bar_edge_y: 40,
  bar_hef: 300,
  bottom_anchorage: 'patilla' as const,
  rib_count: 0 as const,
  rib_h: 0, rib_t: 0,
  fck: 25,
  pedestal_cX: 150, pedestal_cY: 150,
  pedestal_cX1: 150, pedestal_cX2: 150, pedestal_cY1: 150, pedestal_cY2: 150,
  pedestal_h: 500,
  plate_margin_x: 100, plate_margin_y: 100,
  NEd: -50,
  NEd_G: 0,
  Mx: 8, My: 8, VEd: 15, Vx: 15, Vy: 0,
};

// ──────────────────────────────────────────────────────────────────────────
// SUITE — wrapped in `describe.skip` until structural review + PRs land
// ──────────────────────────────────────────────────────────────────────────

describe.skip('anchor plate — manual hand-calc oracle (PR1, ACTIVATE PER CONFIG)', () => {

  // ── Config A: activate after PR7a + PR7b + PR6 ────────────────────────
  describe('Config A — FTUX biaxial moderado (activate after PR7b + PR6)', () => {
    it('solver converges in biaxial mode', () => {
      const r = calcAnchorPlate(configA);
      expect(['biaxial-plastic', 'biaxial-grid']).toContain(r.solver.mode);
      expect(r.solver.converged).toBe(true);
    });

    it('Ft_total per hand calc — 4-corner biaxial Mx-dominated', () => {
      const r = calcAnchorPlate(configA);
      // Hand calc estimate: 25-35 kN. Tolerance ±30% pending structural review.
      expect(r.solver.Ft_total).toBeGreaterThan(20);
      expect(r.solver.Ft_total).toBeLessThan(45);
    });

    it('Nc ≈ NEd + Ft_total (axial equilibrium)', () => {
      const r = calcAnchorPlate(configA);
      expect(r.solver.Nc).toBeCloseTo(configA.NEd + r.solver.Ft_total, 1);
    });

    it('worstUtil ≈ 0.50-0.60 (cone/splitting govern)', () => {
      const r = calcAnchorPlate(configA);
      // Hand calc: cone util ≈ 0.52, splitting ≈ 0.50. Pending tighter
      // bounds after structural review.
      expect(r.worstUtil).toBeGreaterThan(0.40);
      expect(r.worstUtil).toBeLessThan(0.70);
    });
  });

  // ── Config B: activate after PR5 (CR4 dispatcher) ─────────────────────
  describe('Config B — Fachada Mx puro 6 barras (activate after PR5)', () => {
    it('★ solver models all 6 bars (NOT 4) — CR4 fix', () => {
      const r = calcAnchorPlate(configB);
      expect(r.solver.bolts).toHaveLength(6);
    });

    it('★ routes to biaxial path (not axis-aligned-4) despite My=0', () => {
      const r = calcAnchorPlate(configB);
      expect(['biaxial-plastic', 'biaxial-grid']).toContain(r.solver.mode);
    });

    it('Ft_total reflects 6-bar layout under Mx puro', () => {
      const r = calcAnchorPlate(configB);
      // Hand calc: 280-310 kN. Wide tolerance pending review.
      expect(r.solver.Ft_total).toBeGreaterThan(220);
      expect(r.solver.Ft_total).toBeLessThan(380);
    });

    it('worstUtil > 1.0 (concrete cone fails with tight bordes for Mx grande)', () => {
      const r = calcAnchorPlate(configB);
      expect(r.worstUtil).toBeGreaterThan(1.0);
      expect(r.overallStatus).toBe('fail');
    });
  });

  // ── Config C: activate after PR0 (purely additive — should pass now) ──
  describe('Config C — Interior compresión dominante', () => {
    it('routes to uniform-compression (|e| < a/6)', () => {
      const r = calcAnchorPlate(configC);
      expect(r.solver.mode).toBe('uniform-compression');
    });

    it('no bars in tension', () => {
      const r = calcAnchorPlate(configC);
      expect(r.solver.Ft_total).toBe(0);
      expect(r.solver.n_t).toBe(0);
    });

    it('Nc = NEd', () => {
      const r = calcAnchorPlate(configC);
      expect(r.solver.Nc).toBeCloseTo(configC.NEd, 2);
    });

    it('worstUtil ≈ 0.40-0.50 (plate compression governs)', () => {
      const r = calcAnchorPlate(configC);
      expect(r.worstUtil).toBeGreaterThan(0.30);
      expect(r.worstUtil).toBeLessThan(0.65);
      expect(r.overallStatus).toBe('ok');
    });

    it('tension-related checks are neutral (no Ft)', () => {
      const r = calcAnchorPlate(configC);
      const cone = r.checks.find((c) => c.id === 'concrete-cone')!;
      const splitting = r.checks.find((c) => c.id === 'splitting')!;
      // Post-PR3: neutral. Pre-PR3: status='ok' (which is buggy). This test
      // implicitly requires PR3 too.
      expect(cone.utilization).toBe(0);
      expect(splitting.utilization).toBe(0);
    });
  });

  // ── Config D: activate after PR6 (CR3 splitting rewrite) ──────────────
  describe('Config D — Esquina splitting crítico (activate after PR6)', () => {
    it('splitting check governs with critical edge proximity', () => {
      const r = calcAnchorPlate(configD);
      const sp = r.checks.find((c) => c.id === 'splitting')!;
      // Hand calc: NRd,sp ≈ 15 kN, Ft_total ≈ 30 kN → util ≈ 2.0
      expect(sp.utilization).toBeGreaterThan(1.0);
    });

    it('splitting psi_h,sp uses member depth (not edge distance)', () => {
      const r = calcAnchorPlate(configD);
      const sp = r.checks.find((c) => c.id === 'splitting')!;
      // After CR3 fix, limit string mentions ψh from pedestal_h, not edge
      // distance. h=400, 2·hef=500 → ψh,sp ≤ 1.0.
      expect(sp.limit).toMatch(/ψh=1\.00/);
    });

    it('worstUtil > 1.5 (splitting fails sharply)', () => {
      const r = calcAnchorPlate(configD);
      expect(r.worstUtil).toBeGreaterThan(1.5);
      expect(r.overallStatus).toBe('fail');
    });
  });

  // ── Config E: activate after PR10 (NEd<0 pure-tension branch) ─────────
  describe('Config E — Mástil tracción pura NEd<0 (activate after PR10)', () => {
    it('★ solver routes to pure-tension mode (NEd<0)', () => {
      const r = calcAnchorPlate(configE);
      expect(r.solver.mode).toBe('pure-tension' as never);
    });

    it('Nc ≈ 0 (no compression under plate)', () => {
      const r = calcAnchorPlate(configE);
      expect(r.solver.Nc).toBeLessThan(1);
    });

    it('Ft_total ≈ |NEd| = 50 kN', () => {
      const r = calcAnchorPlate(configE);
      expect(r.solver.Ft_total).toBeGreaterThan(40);
      expect(r.solver.Ft_total).toBeLessThan(70);
    });

    it('all bars (or near-all) in tension', () => {
      const r = calcAnchorPlate(configE);
      expect(r.solver.n_t).toBeGreaterThanOrEqual(3);
    });

    it('cone check fails (Ac/Ac0 with edges tightly aligned)', () => {
      const r = calcAnchorPlate(configE);
      const cone = r.checks.find((c) => c.id === 'concrete-cone')!;
      expect(cone.utilization).toBeGreaterThan(1.0);
      expect(r.overallStatus).toBe('fail');
    });
  });
});
