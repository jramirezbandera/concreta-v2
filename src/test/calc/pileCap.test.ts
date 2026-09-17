// Pile cap (encepado de micropilotes) test suite — creada con los fixes de la
// auditoría adenda 2 (#75-87); antes este motor NO tenía ningún test (#81).
//
// Oracles calculados a mano con el modelo B&T de CE Anejo 19 §6.5 (geometría
// de práctica consolidada ex-EHE): z = 0.85·d, brazo v + 0.25a, bandas sobre
// pilotes, fyd = min(fyk/γs, 400) (tope EHE-08 40.2, decisión 2026-09-15), peso propio 25 kN/m³
// con γG=1.35, anclaje fctd = 0.7·fctm/1.5 y demanda lbd de patilla (α1=0.7).
//
// Defaults (n=2, d_p=220, s=1200, h=800, col 400×400, C25, B500, c=60, φ12,
// N=300, R_adm=250, dims AUTO con redondeo a 5 cm):
//   e_min = max(110+250, 330, 300) = 360 → raw L_x = 1920, L_y = 1120
//   redondeo ↑50 → L_x = 1950, L_y = 1150 ; e_borde = (1950−1200)/2 = 375
//   W_cap = 25e-9·1950·1150·800 = 44.85 kN → R = (300+60.55)/2 = 180.27 kN
//   d = 800−60−6 = 734 → z = 623.9 ; a_eff = 600−100 = 500 → θ = 51.3°
//   Fs = 180.27/sin51.3° = 231.0 kN ; A_node = π·110² = 38013 mm²
//   σ_strut = 6.08 MPa vs σ_Rd = 0.6·0.9·16.7 = 9.02 MPa
//   Ft = 180.27·500/623.9 = 144.5 kN → As_tie = 361.2 mm² (fyd = 400)
//   As_min = 0.26·(2.56/500)·1150·734 = 1123.7 mm² → 10Ø12 = 1131 mm²
//   lb = 3·400/2.688 = 446.4 ; lb,req = 0.7·446.4·(1123.7/1131) = 310.5 mm
//   lb,disp = (375−60) + (800−60−40) = 1015 mm

import { describe, expect, it } from 'vitest';
import { calcPileCap, autoEdge3, polygonArea, triCapOutline } from '../../lib/calculations/pileCap';
import { pileCapDefaults } from '../../data/defaults';

const base = { ...pileCapDefaults };

// ── FTUX defaults ─────────────────────────────────────────────────────────
describe('FTUX defaults (n=2, d_p=220)', () => {
  const r = calcPileCap(base);

  it('result is valid', () => {
    expect(r.valid).toBe(true);
    expect(r.error).toBeUndefined();
  });

  it('cap dims auto: e_min=360, L_x=1950, L_y=1150 (redondeo ↑5 cm), e_borde=375', () => {
    expect(r.e_min).toBe(360);
    expect(r.L_x).toBe(1950);
    expect(r.L_y).toBe(1150);
    expect(r.e_borde).toBe(375);
  });

  it('W_cap ≈ 44.85 kN y reacciones con peso propio: R_max ≈ 180.3 kN (fix #77)', () => {
    expect(r.W_cap).toBeCloseTo(44.85, 2);
    expect(r.R_max).toBeCloseTo(180.27, 1);
    expect(r.R_max).toBeCloseTo((base.N_Ed + 1.35 * r.W_cap) / 2, 3);
  });

  it('fyd = min(fyk/γs, 400) = 400 con B500 (tope EHE-08 40.2 para el tirante, 58.4.1.2)', () => {
    expect(r.fyd).toBe(400);
    expect(calcPileCap({ ...base, fyk: 400 }).fyd).toBeCloseTo(400 / 1.15, 2);
  });

  it('brazos del modelo B&T: d_eff=734, z=0.85·d=623.9, a_eff=500 (fix #78)', () => {
    expect(r.d_eff).toBe(734);
    expect(r.z_eff).toBeCloseTo(623.9, 1);
    expect(r.a_eff).toBe(500);
  });

  it('θ ≈ 51.3° (dentro de 26.5–63.5)', () => {
    expect(r.theta_deg).toBeCloseTo(51.3, 1);
    expect(r.checks.find((c) => c.id === 'strut-angle')!.status).toBe('ok');
  });

  it('σ_strut ≈ 6.08 MPa vs σ_Rd ≈ 9.02 MPa (biela §6.5.2)', () => {
    expect(r.sigma_strut).toBeCloseTo(6.08, 2);
    expect(r.sigma_Rd_max).toBeCloseTo(9.02, 2);
  });

  it('nodo C-C-C bajo pilar: σ_col = 1.875 MPa vs 15.0 MPa (fix #83)', () => {
    expect(r.sigma_col).toBeCloseTo(1.875, 3);
    expect(r.sigma_Rd_col).toBeCloseTo(15.03, 2);
    expect(r.checks.find((c) => c.id === 'node-column')!.status).toBe('ok');
  });

  it('tirante: Ft ≈ 144.5 kN, As_tie ≈ 361 mm² (fyd = 400), 10Ø12 = 1131 mm²', () => {
    expect(r.Ft_x).toBeCloseTo(144.47, 1);
    expect(r.As_tie_x).toBeCloseTo(361.2, 1);
    expect(r.As_min_x).toBeCloseTo(1123.7, 0);
    expect(r.n_bars_x).toBe(10);
    expect(r.As_prov_x).toBeCloseTo(1131, 0);
  });

  it('check de tirante usa la DEMANDA As_tie, no As_min (fix #82)', () => {
    const c = r.checks.find((ch) => ch.id === 'tie-steel-x')!;
    expect(c.utilization).toBeCloseTo(361.2 / 1131, 2);
    expect(c.status).toBe('ok');
  });

  // Dónde se reparte la armadura principal. La EHE-08 lo dice distinto según el
  // número de pilotes y el dibujo lo enseña: con n ≥ 3, bandas sobre los pilotes
  // de ancho d_p + 2·c (58.4.1.2.2, fix #86); con n = 2 el artículo no habla de
  // banda —el encepado se arma como una viga— y las barras van repartidas en
  // todo el ancho, que es lo que dibuja el plano tipo del estudio (4Ø20 a lo
  // ancho de la sección).
  it('n=2: la inferior se reparte en TODO el ancho (L_y − 2·c = 1030 mm), no en banda', () => {
    expect(r.w_band).toBe(1150 - 2 * 60);
    expect(r.s_bar_x).toBeCloseTo(1030 / 9, 1);
    expect(r.checks.find((c) => c.id === 'bar-spacing')!.description).toMatch(/todo el ancho/);
    expect(r.checks.find((c) => c.id === 'tie-steel-x')!.description).toMatch(/todo el ancho/);
  });

  it('n ≥ 3: banda sobre los pilotes, w_band = d_p + 2·cover = 340 mm (fix #86)', () => {
    for (const n of [3, 4, 6]) {
      expect(calcPileCap({ ...base, n }).w_band).toBe(340);
    }
    expect(calcPileCap({ ...base, n: 4 }).s_bar_x).toBeCloseTo(340 / (calcPileCap({ ...base, n: 4 }).n_bars_x - 1), 1);
  });

  it('anclaje: lb ≈ 446.4 (fctd con 0.7, fyd = 400), lb,req ≈ 310.5, lb,disp = 1015 (fix #75)', () => {
    expect(r.lb).toBeCloseTo(446.4, 1);
    expect(r.lb_net).toBeCloseTo(310.5, 1);
    expect(r.lb_avail).toBe(1015);
  });

  it('demanda de anclaje es de escala lbd (no el mínimo 0.3·lb del bug #75)', () => {
    expect(r.lb_net).toBeGreaterThan(0.5 * r.lb);
  });

  it('secundaria de 2 pilotes (EHE-08 58.4.1.2.1.2): sup 2Ø12 ≥ 1/10 inf; retícula lateral 4‰ con b_ref = h/2', () => {
    // Texto de la EHE-08 (pág. 271): «Su capacidad mecánica no será inferior a
    // 1/10 de la capacidad mecánica de la armadura inferior» y «La cuantía de
    // estas armaduras, referida al área de la sección de hormigón perpendicular
    // a su dirección, será, como mínimo, del 4‰. Si el ancho supera a la mitad
    // del canto, la sección de referencia se toma con un ancho igual a la mitad
    // del canto.»
    expect(r.As_top_req).toBeCloseTo(0.1 * r.As_prov_x, 3);     // 113.1 mm²
    expect(r.As_top_prov).toBeCloseTo(2 * 113.1, 0);             // 2Ø12
    expect(r.b_ref).toBe(400);                                   // min(1950, 1150, 800/2)
    expect(r.As_cv_req).toBeCloseTo(1600, 6);                    // 0,004·400·1000 por metro
    expect(r.As_ch_req).toBeCloseTo(1600, 6);                    // misma sección de referencia
    expect(r.As_cv_prov).toBeCloseTo(2 * 113.1 * 10, 0);         // Ø12 c/100, 2 ramas = 2262 mm²/m
    expect(r.As_ch_prov).toBeCloseTo(2 * 113.1 * 10, 0);
    expect(r.As_g_req).toBe(0);                                  // la retícula inferior es de n ≥ 3
    expect(r.As_cv_tot_req).toBe(0);
    for (const id of ['top-steel', 'stirrups-v', 'face-steel-h']) {
      const row = r.checks.find((c) => c.id === id)!;
      expect(row.status).toBe('ok');
      expect(row.article).toBe('EHE-08 58.4.1.2.1.2');
    }
    expect(r.checks.map((c) => c.id)).not.toContain('grid-h');
    expect(r.checks.find((c) => c.id === 'stirrups-v')!.description).toMatch(/0,4 %/);
  });

  it('secundaria insuficiente → INCUMPLE; ramas y separación entran en lo dispuesto', () => {
    // Ø10 c/200 con 2 ramas = 785 mm²/m < 1600
    const poor = calcPileCap({ ...base, phi_cv: 10, s_cv: 200, phi_ch: 10, s_ch: 200, n_top: 0 });
    expect(poor.As_cv_prov).toBeCloseTo(2 * 78.5 * 5, 0);
    expect(poor.checks.find((c) => c.id === 'stirrups-v')!.status).toBe('fail');
    expect(poor.checks.find((c) => c.id === 'face-steel-h')!.status).toBe('fail');
    expect(poor.checks.find((c) => c.id === 'top-steel')!.status).toBe('fail');
    // Cerco doble (4 ramas) duplica lo dispuesto
    const four = calcPileCap({ ...base, phi_cv: 10, s_cv: 200, n_cv: 4 });
    expect(four.As_cv_prov).toBeCloseTo(2 * poor.As_cv_prov, 6);
    // Separación nula → invalid
    expect(calcPileCap({ ...base, s_cv: 0 }).valid).toBe(false);
  });

  it('n=3 (EHE-08 58.4.1.2.2): retícula inferior ≥ 1/4 de la banda, cercos de banda ≥ N_Ed/(1,5·n); superior y caras sólo informativas', () => {
    const r3 = calcPileCap({ ...base, n: 3 });
    // 58.4.1.2.2.2: N/(1,5·3) = 66,7 kN → 153 mm² en 3 bandas de 1200 + 2·(400 − 60) = 1880 mm
    expect(r3.As_cv_tot_req).toBeCloseTo(300 / 4.5 * 1000 / r3.fyd, 3);
    expect(r3.L_bands).toBe(3 * 1880);
    expect(r3.As_cv_req).toBeCloseTo(r3.As_cv_tot_req / 5.64, 3);
    expect(r3.As_cv_tot_prov).toBeCloseTo(r3.As_cv_prov * 5.64, 3);
    // 58.4.1.2.2.1: 1/4 de la banda (16Ø12 = 1810 mm²) en el ancho libre L_y − 2·w_band
    expect(r3.As_g_req).toBeCloseTo(0.25 * r3.As_prov_x / ((r3.L_y - 2 * r3.w_band) / 1000), 3);
    expect(r3.As_g_prov).toBeCloseTo(113.1 * 10, 0);
    expect(r3.As_top_req).toBe(0);
    expect(r3.As_ch_req).toBe(0);
    const ids = r3.checks.map((c) => c.id);
    expect(ids).toContain('grid-h');
    expect(ids).toContain('stirrups-v');
    expect(ids).toContain('secondary-info');
    expect(ids).not.toContain('top-steel');
    expect(ids).not.toContain('face-steel-h');
    expect(r3.checks.find((c) => c.id === 'grid-h')!.article).toBe('EHE-08 58.4.1.2.2.1');
    expect(r3.checks.find((c) => c.id === 'grid-h')!.status).toBe('ok');
    expect(r3.checks.find((c) => c.id === 'stirrups-v')!.article).toBe('EHE-08 58.4.1.2.2.2');
    expect(r3.checks.find((c) => c.id === 'stirrups-v')!.status).toBe('ok');
  });

  it('n=4: la retícula se compara con las DOS bandas de cada sentido; Ø12 c/100 cumple y c/300 no', () => {
    const r4 = calcPileCap({ ...base, n: 4 });
    expect(r4.As_g_req).toBeCloseTo(0.25 * 2 * r4.As_prov_x / ((r4.L_y - 2 * r4.w_band) / 1000), 3);
    expect(r4.checks.find((c) => c.id === 'grid-h')!.status).toBe('ok');
    // As,min repartido: 9Ø12 por banda (1018 mm²) → req 0,25·2·1018/1,27 = 401 mm²/m; Ø12 c/300 = 377
    const poor = calcPileCap({ ...base, n: 4, s_g: 300 });
    expect(poor.checks.find((c) => c.id === 'grid-h')!.status).toBe('fail');
    expect(calcPileCap({ ...base, n: 4, s_g: 0 }).valid).toBe(false);
  });

  it('todas las filas no neutrales en ok (FTUX verde)', () => {
    r.checks
      .filter((c) => !c.neutral)
      .forEach((c) => expect(c.status).toBe('ok'));
  });

  it('lista completa de checks', () => {
    const ids = r.checks.map((c) => c.id);
    for (const id of ['spacing', 'edge-distance', 'cap-depth', 'pile-react-max', 'strut-angle',
      'strut-capacity', 'tie-steel-x', 'bar-spacing', 'bar-spacing-min',
      'anchorage', 'node-column', 'rigidity', 'top-steel', 'stirrups-v', 'face-steel-h',
      'min-ratio', 'face-spacing']) {
      expect(ids).toContain(id);
    }
  });
});

// ── Navier reactions ──────────────────────────────────────────────────────
describe('Reacciones Navier', () => {
  it('n=2 sin momentos: reacciones iguales', () => {
    const r = calcPileCap(base);
    expect(r.reactions[0]).toBeCloseTo(r.reactions[1], 6);
  });

  it('n=2 con My=60: ΔR = ±50 kN (Σx² = 2·600²)', () => {
    const r = calcPileCap({ ...base, My_Ed: 60 });
    expect(r.R_max - r.R_min).toBeCloseTo(100, 3);
    expect(r.R_max).toBeCloseTo((base.N_Ed + 1.35 * r.W_cap) / 2 + 50, 3);
  });

  it('n=2 acepta My_Ed (momento estáticamente admisible, fix #76)', () => {
    expect(calcPileCap({ ...base, My_Ed: 60 }).valid).toBe(true);
  });

  it('n=2 rechaza Mx_Ed ≠ 0 (estáticamente inadmisible)', () => {
    const r = calcPileCap({ ...base, Mx_Ed: 10 });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/Mx_Ed/);
  });

  it('n=4 con My=120: ΔR = ±50 kN (Σx² = 4·600²)', () => {
    const r = calcPileCap({ ...base, n: 4, My_Ed: 120 });
    expect(r.R_max - r.R_min).toBeCloseTo(100, 3);
  });

  it('n=3 con Mx=72: pilote superior +69.3, inferiores −34.6 (Σy² = 720000)', () => {
    const r = calcPileCap({ ...base, n: 3, Mx_Ed: 72 });
    const Rbase = (base.N_Ed + 1.35 * r.W_cap) / 3;
    expect(r.reactions[0]).toBeCloseTo(Rbase + 69.282, 2);
    expect(r.reactions[1]).toBeCloseTo(Rbase - 34.641, 2);
  });

  it('pilote a tracción → warn sin ratio sobre R_adm de compresión (fix #84)', () => {
    // ΔR = 300e3·600/720000 = 250 kN > R_base = 179 kN → R_min < 0
    const r = calcPileCap({ ...base, My_Ed: 300 });
    expect(r.R_min).toBeLessThan(0);
    const row = r.checks.find((c) => c.id === 'pile-react-tension')!;
    expect(row.status).toBe('warn');
    expect(row.utilization).toBe(0);
  });
});

// ── Geometría ─────────────────────────────────────────────────────────────
describe('Geometría generada', () => {
  it('e_borde respeta d_p/2 + 250 también para pilotes grandes (1.5·d_p gobierna)', () => {
    const r = calcPileCap({ ...base, d_p: 400, s: 1200 });
    expect(r.e_borde).toBe(600);  // max(450, 600, 300)
  });

  it('s_min = max(3·d_p, 750)', () => {
    expect(calcPileCap(base).s_min).toBe(750);
    expect(calcPileCap({ ...base, d_p: 300, s: 1200 }).s_min).toBe(900);
  });

  it('n=3: planta triangular con e = 400 (360 ↑ 5 cm); envolvente s+2e·2/√3 × s·√3/2+2e', () => {
    const r = calcPileCap({ ...base, n: 3 });
    expect(r.e_borde).toBe(400);
    expect(r.L_x).toBeCloseTo(1200 + 2 * 400 * 2 / Math.sqrt(3), 2);  // 2123.8
    expect(r.L_y).toBeCloseTo(1200 * Math.sqrt(3) / 2 + 800, 2);      // 1839.2
  });

  it('n=4: L_x = L_y = s + 2e redondeado ↑ a 50 mm (1920 → 1950)', () => {
    const r = calcPileCap({ ...base, n: 4 });
    expect(r.L_x).toBe(1950);
    expect(r.L_y).toBe(1950);
  });
});

// ── Dimensiones en planta (auto/manual) ───────────────────────────────────
describe('Dimensiones en planta', () => {
  it('auto: siempre múltiplos de 50 mm, nunca por debajo del valor sin redondear', () => {
    const r = calcPileCap({ ...base, d_p: 225, s: 1210 });
    // e_min = max(112.5+250, 337.5, 300) = 362.5 → raw L_x = 1935 → 1950
    expect(r.L_x).toBe(1950);
    expect(r.L_x % 50).toBe(0);
    expect(r.L_y % 50).toBe(0);
    expect(r.e_borde).toBeGreaterThanOrEqual(r.e_min);
    expect(r.checks.find((c) => c.id === 'edge-distance')!.status).toBe('ok');
  });

  it('manual: usa Lx/Ly del usuario y recalcula e_borde y peso propio', () => {
    const r = calcPileCap({ ...base, dims_auto: false, L_x: 2000, L_y: 1200 });
    expect(r.valid).toBe(true);
    expect(r.L_x).toBe(2000);
    expect(r.L_y).toBe(1200);
    expect(r.e_borde).toBe(400);  // (2000 − 1200)/2
    expect(r.W_cap).toBeCloseTo(25e-9 * 2000 * 1200 * 800, 3);
    expect(r.checks.find((c) => c.id === 'edge-distance')!.status).toBe('ok');
  });

  it('manual con e_borde < e_min: cálculo válido pero edge-distance INCUMPLE', () => {
    const r = calcPileCap({ ...base, dims_auto: false, L_x: 1700, L_y: 1200 });
    // e_x = 250 < e_min = 360 pero ≥ d_p/2 = 110 → no invalida, señala fail
    expect(r.valid).toBe(true);
    expect(r.e_borde).toBe(250);
    expect(r.checks.find((c) => c.id === 'edge-distance')!.status).toBe('fail');
  });

  it('manual: anclaje horizontal crece con e_borde (lb_avail usa el e real)', () => {
    const r = calcPileCap({ ...base, dims_auto: false, L_x: 2200, L_y: 1200 });
    // e_borde = 500 → lb_avail = (500−60) + (800−60−40) = 1140
    expect(r.lb_avail).toBe(1140);
  });

  it('manual: pilote fuera de planta (e < d_p/2) → invalid', () => {
    const r = calcPileCap({ ...base, dims_auto: false, L_x: 1350, L_y: 1200 });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/no caben/);
  });

  it('manual: pilar que no cabe en planta → invalid', () => {
    const r = calcPileCap({ ...base, dims_auto: false, L_x: 2000, L_y: 300 });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/pilar/);
  });

  it('manual: Lx ≤ 0 → invalid', () => {
    expect(calcPileCap({ ...base, dims_auto: false, L_x: 0, L_y: 1200 }).valid).toBe(false);
  });
});

// ── Placa de reparto en cabeza de micro ───────────────────────────────────
// Con placa el nodo comprimido apoya en la placa (área mayor), no en la
// sección del tubo: es la vía real de obra para descargar la biela sin subir
// fck ni el diámetro del micro.
describe('Placa de reparto (nodo comprimido)', () => {
  it('sin placa: A_node = π·d_p²/4 (sección del micro)', () => {
    const r = calcPileCap(base);
    expect(r.A_node).toBeCloseTo(Math.PI * 110 * 110, 1);  // π·(220/2)²
  });

  it('placa circular Ø320: A_node = π·320²/4 y σ_biela baja de 6.08 a 2.87 MPa', () => {
    const r = calcPileCap({ ...base, plate_on: true, plate_shape: 'circ', d_plate: 320 });
    expect(r.valid).toBe(true);
    expect(r.A_node).toBeCloseTo(Math.PI * 320 * 320 / 4, 1);  // 80425 mm²
    expect(r.sigma_strut).toBeCloseTo(2.87, 2);
    // Fs no cambia (misma geometría de biela): solo cambia el área de apoyo
    expect(r.Fs_max).toBeCloseTo(calcPileCap(base).Fs_max, 6);
  });

  it('placa cuadrada lado 320: A_node = 320² (mayor que la circular)', () => {
    const r = calcPileCap({ ...base, plate_on: true, plate_shape: 'cuad', d_plate: 320 });
    expect(r.A_node).toBe(320 * 320);
    expect(r.sigma_strut).toBeCloseTo(2.26, 2);
  });

  it('con placa aparece la fila informativa plate-info (dimensionar placa aparte)', () => {
    const con = calcPileCap({ ...base, plate_on: true, d_plate: 320 });
    const sin = calcPileCap(base);
    expect(con.checks.find((c) => c.id === 'plate-info')?.status).toBe('neutral');
    expect(sin.checks.find((c) => c.id === 'plate-info')).toBeUndefined();
  });

  it('placa menor que la cabeza del micro (d_plate < d_p) → invalid', () => {
    const r = calcPileCap({ ...base, plate_on: true, d_plate: 200 });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/placa/i);
  });

  it('placas contiguas solapadas (d_plate > s) → invalid', () => {
    const r = calcPileCap({ ...base, plate_on: true, d_plate: 1250 });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/solapan/);
  });

  it('placa que no cabe en planta (d_plate/2 > e_borde) → invalid', () => {
    // dims auto: e_x = 375 → placa Ø800 requiere 400 mm de eje a borde
    const r = calcPileCap({ ...base, plate_on: true, d_plate: 800 });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/no cabe/);
  });

  it('plate_on false ignora d_plate aunque sea inválido (estados antiguos)', () => {
    const r = calcPileCap({ ...base, plate_on: false, d_plate: 0 });
    expect(r.valid).toBe(true);
    expect(r.A_node).toBeCloseTo(Math.PI * 110 * 110, 1);
  });
});

// ── Biela y nodos ─────────────────────────────────────────────────────────
describe('Biela y nodos', () => {
  it('encepado flexible (s grande, canto corto): θ < 26.5° → strut-angle fail', () => {
    const r = calcPileCap({ ...base, s: 2000, h_enc: 560 });
    expect(r.theta_deg).toBeLessThan(26.5);
    expect(r.checks.find((c) => c.id === 'strut-angle')!.status).toBe('fail');
  });

  it('pilar pequeño muy cargado: nodo C-C-C fail (antes sin comprobar, fix #83)', () => {
    const r = calcPileCap({ ...base, N_Ed: 2000, b_col: 300, h_col: 300, R_adm: 1500 });
    expect(r.sigma_col).toBeCloseTo(2000000 / 90000, 2);  // 22.2 MPa
    expect(r.checks.find((c) => c.id === 'node-column')!.status).toBe('fail');
  });

  it('σ_Rd biela = 0.60·ν′·fcd (lado seguro frente al nodo 0.85·ν′·fcd)', () => {
    const r = calcPileCap(base);
    expect(r.sigma_Rd_max).toBeCloseTo(0.6 * (1 - 25 / 250) * 16.7, 3);
    expect(r.sigma_Rd_col).toBeCloseTo(1.0 * (1 - 25 / 250) * 16.7, 3);
  });
});

// ── Tirantes ──────────────────────────────────────────────────────────────
describe('Tirantes por banda (EHE 58.4.1.2)', () => {
  it('n=2: Ft = R_max·(s/2 − 0.25·b_col)/z', () => {
    const r = calcPileCap(base);
    expect(r.Ft_x).toBeCloseTo(r.R_max * (600 - 100) / r.z_eff, 3);
  });

  it('pilar más ancho reduce el brazo y el tirante (v + 0.25a, fix #78)', () => {
    const wide = calcPileCap({ ...base, b_col: 600 });
    expect(wide.Ft_x).toBeLessThan(calcPileCap(base).Ft_x);
  });

  it('n=4: bandas por dirección con brazos independientes (h_col ≠ b_col)', () => {
    const r = calcPileCap({ ...base, n: 4, h_col: 600 });
    expect(r.Ft_x).toBeCloseTo(r.R_max * (600 - 100) / r.z_eff, 3);
    expect(r.Ft_y!).toBeCloseTo(r.R_max * (600 - 150) / r.z_eff, 3);
    expect(r.Ft_y!).toBeLessThan(r.Ft_x);
  });

  it('n=3: tirante POR LADO = Hd/√3 = 0,68·R/d·(0,58·s − 0,25·a) (Calavera fig. 14-9)', () => {
    const r = calcPileCap({ ...base, n: 3 });
    const a_r = 1200 / Math.sqrt(3);
    expect(r.a_eff).toBeCloseTo(a_r - 100, 1);
    // Descomposición exacta del radial en los dos lados concurrentes
    expect(r.Ft_x).toBeCloseTo(r.R_max * r.a_eff / r.z_eff / Math.sqrt(3), 6);
    // Expresión de la práctica (0,58 ≈ 1/√3 redondeado): Td = 0,68·N/d·(0,58·l − 0,25·a)
    const ehe = 0.68 * r.R_max / r.d_eff * (0.58 * 1200 - 0.25 * 400);
    expect(r.Ft_x / ehe).toBeGreaterThan(0.985);
    expect(r.Ft_x / ehe).toBeLessThan(1.015);
    // Antes: 0,681·Hd (el 0,68 ya llevaba el 1/0,85 y se dividía otra vez por z) → +18 %
    expect(r.Ft_x).toBeLessThan(0.681 * r.R_max * r.a_eff / r.z_eff);
  });

  it('fyk=400 → fyd = 347.8 (el tope 400 sólo muerde con B500)', () => {
    expect(calcPileCap({ ...base, fyk: 400 }).fyd).toBeCloseTo(400 / 1.15, 2);
    expect(calcPileCap({ ...base, fyk: 500 }).fyd).toBe(400);
  });

  it('congestión: muchas barras en el ancho de reparto → bar-spacing-min fail (fix #82)', () => {
    const r = calcPileCap({ ...base, N_Ed: 8000, R_adm: 6000 });
    expect(r.s_bar_x).toBeLessThan(20);
    expect(r.checks.find((c) => c.id === 'bar-spacing-min')!.status).toBe('fail');
  });
});

// ── Planta triangular (n=3) ───────────────────────────────────────────────
// Encepado rígido de tres pilotes (Calavera fig. 14-9; plano tipo del
// usuario: Ø180, A=70, B=60, C=35, H=95): triángulo de lado s ampliado e por
// cada lado con las esquinas achaflanadas a e del eje de cada pilote. Cotas
// de obra s, e y h; Lx × Ly es solo la envolvente del hexágono.
describe('Planta triangular (n=3)', () => {
  const r = calcPileCap({ ...base, n: 3 });
  const SQ3 = Math.sqrt(3);

  it('el contorno es un hexágono antihorario y cada pilote queda a e de sus TRES bordes', () => {
    expect(r.outline).toHaveLength(6);
    expect(polygonArea(r.outline)).toBeGreaterThan(0);
    // Distancia de cada pilote a la recta de cada arista adyacente = e
    const distToEdge = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      return Math.abs(dx * (p.y - a.y) - dy * (p.x - a.x)) / Math.hypot(dx, dy);
    };
    // Vértices: 0-1 chaflán A (superior), 1-2 lado izquierdo, 2-3 chaflán B,
    // 3-4 lado inferior, 4-5 chaflán C, 5-0 lado derecho.
    // Pilote B (inferior izquierdo) = pilePos[1]
    const pB = r.pilePos[1];
    const o = r.outline;
    expect(distToEdge(pB, o[2], o[3])).toBeCloseTo(400, 6);  // chaflán B
    expect(distToEdge(pB, o[3], o[4])).toBeCloseTo(400, 6);  // lado inferior
    expect(distToEdge(pB, o[1], o[2])).toBeCloseTo(400, 6);  // lado izquierdo
    // y NO a e del lado opuesto ni del chaflán de A
    expect(distToEdge(pB, o[0], o[1])).toBeGreaterThan(1000);
    // Chaflán superior horizontal a e sobre el pilote A, de ancho 2·e/√3
    expect(o[0].y).toBeCloseTo(r.pilePos[0].y + 400, 6);
    expect(o[1].y).toBeCloseTo(o[0].y, 6);
    expect(o[0].x - o[1].x).toBeCloseTo(2 * 400 / SQ3, 6);
  });

  it('área real = triángulo ampliado menos los tres picos; peso propio con esa área', () => {
    const L = 1200 + 2 * SQ3 * 400;                 // lado del triángulo ampliado
    const pico = (SQ3 / 4) * (2 * 400 / SQ3) ** 2;   // triángulo equilátero de altura e
    const A = (SQ3 / 4) * L * L - 3 * pico;
    expect(r.A_cap).toBeCloseTo(A, 3);
    expect(r.A_cap).toBeLessThan(r.L_x * r.L_y);    // ~ 2/3 de la envolvente
    expect(r.W_cap).toBeCloseTo(25e-9 * A * 800, 6);
  });

  it('plano tipo Ø180, s=700, pilar 30×30: e auto = 350 (la cota C = 35 cm del plano)', () => {
    expect(autoEdge3(180, 700, 300, 300)).toBe(350);
    const t = calcPileCap({ ...base, n: 3, d_p: 180, s: 700, h_enc: 950, b_col: 300, h_col: 300 });
    expect(t.valid).toBe(true);
    expect(t.e_borde).toBe(350);
    expect(t.L_y).toBeCloseTo(700 * SQ3 / 2 + 700, 2);   // B + 2C = 60,6 + 70 cm
  });

  it('pilar grande: e auto crece hasta que el pilar cabe en el hexágono', () => {
    // Esquinas (±750, ±750) contra el lado izquierdo: 0,866·750 + 0,5·750 − s/(2√3) = 678 → 700
    const t = calcPileCap({ ...base, n: 3, b_col: 1500, h_col: 1500 });
    expect(t.valid).toBe(true);
    expect(t.e_borde).toBe(700);
    // Manual con e insuficiente: el pilar no cabe → invalid
    const m = calcPileCap({ ...base, n: 3, b_col: 1500, h_col: 1500, dims_auto: false, e_man: 400 });
    expect(m.valid).toBe(false);
    expect(m.error).toMatch(/pilar no cabe/);
  });

  it('manual: e_man es la cota; por debajo de e_min → edge-distance INCUMPLE; < d_p/2 → invalid', () => {
    const m = calcPileCap({ ...base, n: 3, dims_auto: false, e_man: 350 });
    expect(m.valid).toBe(true);
    expect(m.e_borde).toBe(350);
    expect(m.checks.find((c) => c.id === 'edge-distance')!.status).toBe('fail');
    expect(m.outline).toEqual(triCapOutline(1200, 350));
    expect(calcPileCap({ ...base, n: 3, dims_auto: false, e_man: 100 }).valid).toBe(false);
    expect(calcPileCap({ ...base, n: 3, dims_auto: false, e_man: 0 }).valid).toBe(false);
  });

  it('Lx/Ly manuales NO afectan a n=3 (la planta la definen s y e)', () => {
    const m = calcPileCap({ ...base, n: 3, dims_auto: false, e_man: 400, L_x: 5000, L_y: 5000 });
    expect(m.L_x).toBeCloseTo(r.L_x, 6);
    expect(m.A_cap).toBeCloseTo(r.A_cap, 6);
  });

  it('rigidez: s ≤ 2,6·h (1200 ≤ 2080 cumple; con h=400 incumple)', () => {
    const ok = r.checks.find((c) => c.id === 'rigidity')!;
    expect(ok.status).toBe('ok');
    expect(ok.limit).toBe('2080 mm');
    const bad = calcPileCap({ ...base, n: 3, h_enc: 400, cover: 40 });
    expect(bad.checks.find((c) => c.id === 'rigidity')!.status).toBe('fail');
  });

  it('n=2/4: rigidez por vuelo cara pilar–eje pilote v ≤ 2·h (defaults: 400 ≤ 1600)', () => {
    for (const n of [2, 4]) {
      const t = calcPileCap({ ...base, n });
      const row = t.checks.find((c) => c.id === 'rigidity')!;
      expect(row.status).toBe('ok');
      expect(row.value).toBe('400 mm');
    }
    // n=2/4 siguen siendo rectángulos: 4 vértices y área Lx·Ly
    const t2 = calcPileCap(base);
    expect(t2.outline).toHaveLength(4);
    expect(t2.A_cap).toBeCloseTo(t2.L_x * t2.L_y, 6);
  });
});

// ── Cuantía geométrica mínima (EHE-08 42.3.5 + 58.8.2) ────────────────────
// 58.8.2 (pág. 282 del texto del Ministerio): «La armadura longitudinal debe
// satisfacer lo establecido en el Artículo 42º. La cuantía mínima se refiere a
// la suma de la armadura de la cara inferior, de la cara superior y de las
// paredes laterales, en la dirección considerada. La armadura dispuesta en las
// caras superior, inferior y laterales no distará más de 30 cm. Se recomienda
// que el diámetro mínimo […] no sea inferior a 12 mm.» Tabla 42.3.5, nota (1):
// losas de cimentación y zapatas armadas, la mitad de 2,0/1,8‰ → 1,0/0,9‰.
describe('Cuantía geométrica mínima (EHE-08 42.3.5 + 58.8.2)', () => {
  const r = calcPileCap(base);

  it('defaults n=2: ρ_min = 0,9‰ (B500); suma banda, superior, malla de las dos caras y laterales', () => {
    expect(r.rho_min).toBe(0.0009);
    const A12 = 113.1;
    const lat = A12 * (800 - 60 - 40) / 100;               // Ø12 c/100 en 700 mm de altura, por cara
    const n_cercos = Math.floor((1950 - 120) / 100) + 1;   // 19
    // Malla Ø12 c/100: en el sentido x la inferior ya barre todo el ancho (armado
    // de viga), así que sólo suma la cara superior; en y, las dos caras enteras.
    const grid_x = r.As_g_prov * 1150 / 1000;
    const grid_y = 2 * r.As_g_prov * 1950 / 1000;          // sin bandas ∥ y con 2 pilotes
    expect(r.As_dir_x).toBeCloseTo(r.As_prov_x + r.As_top_prov + grid_x + 2 * lat, 0);
    expect(r.As_dir_y).toBeCloseTo(n_cercos * 2 * A12 + grid_y + 2 * lat, 0);
    expect(r.rho_x).toBeCloseTo(r.As_dir_x / (1150 * 800), 9);
    expect(r.rho_y).toBeCloseTo(r.As_dir_y / (1950 * 800), 9);
    expect(r.rho_x).toBeGreaterThan(0.0009);
    const row = r.checks.find((c) => c.id === 'min-ratio')!;
    expect(row.status).toBe('ok');
    expect(row.article).toMatch(/42\.3\.5/);
    expect(calcPileCap({ ...base, fyk: 400 }).rho_min).toBe(0.0010);
  });

  it('encepado grande con poco acero: la cuantía INCUMPLE aunque el tirante cumpla', () => {
    // 2 pilotes, h = 1500, sin superior y todo Ø8 c/300 (el máximo que admite el
    // 58.8.2): mucho hormigón y poco acero → ρ_y ≪ 0,9‰
    const poor = calcPileCap({
      ...base, h_enc: 1500, n_top: 0,
      phi_cv: 8, s_cv: 300, phi_ch: 8, s_ch: 300, phi_g: 8, s_g: 300,
    });
    expect(poor.valid).toBe(true);
    expect(poor.rho_y).toBeLessThan(0.0009);
    expect(poor.checks.find((c) => c.id === 'min-ratio')!.status).toBe('fail');
    expect(poor.checks.find((c) => c.id === 'min-ratio')!.description).toMatch(/sentido y/);
  });

  it('hormigón sin armar ≤ 300 mm en las tres caras, y diámetro mínimo recomendado 12 mm', () => {
    expect(r.hueco_max).toBe(100);   // malla, horizontal y cercos, todo c/100
    expect(r.checks.find((c) => c.id === 'face-spacing')!.status).toBe('ok');
    expect(r.checks.find((c) => c.id === 'min-diam')).toBeUndefined();
    const wide = calcPileCap({ ...base, s_ch: 350 });
    expect(wide.checks.find((c) => c.id === 'face-spacing')!.status).toBe('fail');
    expect(wide.checks.find((c) => c.id === 'face-spacing')!.description).toMatch(/horizontal de caras/);
    // La malla de las caras superior e inferior cuenta con CUALQUIER n: es la
    // que cose los paños entre bandas (antes sólo se miraba con n ≥ 3).
    for (const n of [2, 3, 4, 6]) {
      const m = calcPileCap({ ...base, n, s_g: 350, h_enc: n === 6 ? 1400 : 800 });
      expect(m.hueco_max).toBe(350);
      expect(m.checks.find((c) => c.id === 'face-spacing')!.status).toBe('fail');
      expect(m.checks.find((c) => c.id === 'face-spacing')!.description).toMatch(/malla arriba y abajo/);
    }
    const thin = calcPileCap({ ...base, phi_cv: 10, phi_ch: 8 });
    const row = thin.checks.find((c) => c.id === 'min-diam')!;
    expect(row.status).toBe('warn');
    expect(row.description).toMatch(/cercos Ø10/);
    expect(row.description).toMatch(/horizontal Ø8/);
  });

  it('n=4 y n=6: bandas del sentido, malla de las dos caras y superiores', () => {
    const r4 = calcPileCap({ ...base, n: 4 });
    const lat = 113.1 * 700 / 100;
    const grid_x = 2 * r4.As_g_prov * (r4.L_y - 2 * r4.w_band) / 1000;
    expect(r4.As_dir_x).toBeCloseTo(2 * r4.As_prov_x + grid_x + 2 * r4.As_top_prov + 2 * lat, 0);
    expect(r4.checks.find((c) => c.id === 'min-ratio')!.status).toBe('ok');
    const r6 = calcPileCap({ ...base, n: 6, h_enc: 1400 });
    const lat6 = 113.1 * (1400 - 100) / 100;
    const grid6 = 2 * r6.As_g_prov * (r6.L_y - 3 * r6.w_band) / 1000;
    expect(r6.As_dir_x).toBeCloseTo(3 * r6.As_prov_x + grid6 + 3 * r6.As_top_prov + 2 * lat6, 0);
    expect(r6.rho_x).toBeGreaterThan(0.0009);
  });

  it('n=3: sección L_y·h en x con la banda inferior; las inclinadas se proyectan sobre y', () => {
    const r3 = calcPileCap({ ...base, n: 3 });
    const lat = 113.1 * 700 / 100;
    const grid_x = 2 * r3.As_g_prov * (r3.L_y - r3.w_band) / 1000;
    const grid_y = 2 * r3.As_g_prov * r3.L_x / 1000;
    expect(r3.As_dir_x).toBeCloseTo(r3.As_prov_x + r3.As_top_prov + grid_x + lat, 0);
    expect(r3.As_dir_y).toBeCloseTo(
      2 * Math.sin(Math.PI / 3) * (r3.As_prov_x + r3.As_top_prov + lat) + grid_y, 0);
    expect(r3.checks.find((c) => c.id === 'min-ratio')!.status).toBe('ok');
  });
});

// ── Retícula 2 × 3 (n=6) ──────────────────────────────────────────────────
// Plano tipo del usuario: dos columnas de micropilotes con el doble de
// separación que las tres filas, pilar en el centro. Bandas sobre cada fila y
// cada columna (EHE-08 58.4.1.2.2.1); la biela pésima es la de las esquinas.
describe('Retícula 2 × 3 (n=6)', () => {
  // h=1400 para que la biela de esquina (a ≈ 1697) quede dentro de 26,5°
  const inp6 = { ...base, n: 6, h_enc: 1400 };
  const r = calcPileCap(inp6);

  it('posiciones: columnas a ±s_x/2 = ±1200, filas a −s, 0, +s; envolvente cuadrada 3150', () => {
    expect(r.valid).toBe(true);
    expect(r.pilePos).toHaveLength(6);
    expect(r.pilePos.map((p) => p.x)).toEqual([-1200, 1200, -1200, 1200, -1200, 1200]);
    expect(r.pilePos.map((p) => p.y)).toEqual([-1200, -1200, 0, 0, 1200, 1200]);
    expect(r.L_x).toBe(3150);   // 2400 + 2·360 = 3120 → ↑50
    expect(r.L_y).toBe(3150);   // 2·1200 + 720 = 3120 → ↑50
    expect(r.outline).toHaveLength(4);
  });

  it('tirantes: tres filas y los cuatro tramos de las columnas, sin diagonales', () => {
    expect(r.ties).toHaveLength(7);
    for (const [i, j] of r.ties) {
      const p = r.pilePos[i];
      const q = r.pilePos[j];
      expect(Math.abs(p.x - q.x) < 1e-9 || Math.abs(p.y - q.y) < 1e-9).toBe(true);
    }
  });

  it('bandas: Ft,x = R·(s_x/2 − 0,25·b)/z y Ft,y = R·(s − 0,25·h)/z (T1d de 58.4.1.2.2.1 con l/2 = x_max)', () => {
    expect(r.Ft_x).toBeCloseTo(r.R_max * (1200 - 100) / r.z_eff, 6);
    expect(r.Ft_y!).toBeCloseTo(r.R_max * (1200 - 100) / r.z_eff, 6);
    expect(r.n_bars_y).not.toBeNull();
    expect(r.checks.map((c) => c.id)).toContain('tie-steel-y');
  });

  it('la biela pésima es la de la esquina (a = √2·1200), no la de la fila central (1200)', () => {
    expect(r.a_crit).toBeCloseTo(Math.hypot(1200, 1200), 6);
    expect(r.a_eff).toBeCloseTo(Math.hypot(1200, 1200) - 100, 6);
    expect(r.theta_deg).toBeCloseTo(Math.atan2(r.z_eff, r.a_eff) * 180 / Math.PI, 6);
    expect(r.Fs_max).toBeCloseTo(r.R_max / Math.sin(r.theta_deg * Math.PI / 180), 6);
    expect(r.checks.find((c) => c.id === 'strut-angle')!.status).toBe('ok');
    // Con el canto por defecto (800) la esquina queda a 21° → INCUMPLE
    expect(calcPileCap({ ...base, n: 6 }).checks.find((c) => c.id === 'strut-angle')!.status).toBe('fail');
  });

  it('separación mínima con la menor de filas y columnas; rigidez con el vuelo mayor', () => {
    expect(r.checks.find((c) => c.id === 'spacing')!.limit).toBe('1200 mm');
    const tight = calcPileCap({ ...inp6, s_x: 700 });
    expect(tight.checks.find((c) => c.id === 'spacing')!.status).toBe('fail');
    expect(tight.checks.find((c) => c.id === 'spacing')!.limit).toBe('700 mm');
    expect(r.checks.find((c) => c.id === 'rigidity')!.value).toBe('1000 mm');   // 1200 − 200
    expect(calcPileCap({ ...inp6, s_x: 0 }).valid).toBe(false);
    expect(calcPileCap({ ...base, n: 5 }).valid).toBe(false);
  });

  it('secundaria: retícula ≥ 1/4 de las TRES filas (x) y de las DOS columnas (y); cercos en las cinco bandas', () => {
    const ext = r.e_borde - 60;
    expect(r.L_bands).toBeCloseTo(3 * (2400 + 2 * ext) + 2 * (2400 + 2 * ext), 6);
    const req_x = 0.25 * 3 * r.As_prov_x / ((r.L_y - 3 * r.w_band) / 1000);
    const req_y = 0.25 * 2 * r.As_prov_y! / ((r.L_x - 2 * r.w_band) / 1000);
    expect(r.As_g_req).toBeCloseTo(Math.max(req_x, req_y), 6);
    expect(r.As_cv_tot_req).toBeCloseTo(300 / 9 * 1000 / r.fyd, 6);
    expect(r.checks.map((c) => c.id)).toContain('grid-h');
  });

  it('As,min de la sección se reparte entre las bandas del sentido: /3 en x y /2 en y con n=6, /2 con n=4', () => {
    const fctm = 2.56;
    const total_x = Math.max(0.26 * (fctm / 500) * r.L_y * r.d_eff, 0.0013 * r.L_y * r.d_eff);
    const total_y = Math.max(0.26 * (fctm / 500) * r.L_x * r.d_eff, 0.0013 * r.L_x * r.d_eff);
    expect(r.As_min_x).toBeCloseTo(total_x / 3, 3);
    expect(r.As_min_y!).toBeCloseTo(total_y / 2, 3);
    const r4 = calcPileCap({ ...base, n: 4 });
    const total4 = Math.max(0.26 * (fctm / 500) * r4.L_y * r4.d_eff, 0.0013 * r4.L_y * r4.d_eff);
    expect(r4.As_min_x).toBeCloseTo(total4 / 2, 3);
    // n=2: una banda, el mínimo entero (1123,7 mm² → 10Ø12, como en el FTUX)
    expect(calcPileCap(base).As_min_x).toBeCloseTo(1123.7, 0);
  });

  it('n=2, 3 y 4 no cambian con la generalización (bielas equidistantes)', () => {
    const r2 = calcPileCap(base);
    expect(r2.a_crit).toBe(600);
    expect(r2.a_eff).toBe(500);
    expect(r2.Fs_max).toBeCloseTo(r2.R_max / Math.sin(r2.theta_deg * Math.PI / 180), 6);
    const r4 = calcPileCap({ ...base, n: 4 });
    expect(r4.a_crit).toBeCloseTo(1200 / Math.SQRT2, 6);
    expect(r4.Ft_x).toBeCloseTo(r4.R_max * (600 - 100) / r4.z_eff, 6);
    expect(r4.ties).toHaveLength(4);
    expect(calcPileCap({ ...base, n: 3 }).ties).toHaveLength(3);
    expect(r2.ties).toEqual([[0, 1]]);
  });
});

// ── Validación de entradas ────────────────────────────────────────────────
describe('Validación', () => {
  it('n fuera de {2,3,4} → invalid', () => {
    expect(calcPileCap({ ...base, n: 5 }).valid).toBe(false);
  });

  it('N_Ed ≤ 0 → invalid', () => {
    expect(calcPileCap({ ...base, N_Ed: 0 }).valid).toBe(false);
  });

  it('R_adm ≤ 0 → invalid', () => {
    expect(calcPileCap({ ...base, R_adm: 0 }).valid).toBe(false);
  });

  it('fck fuera de 20-50 → invalid', () => {
    expect(calcPileCap({ ...base, fck: 55 }).valid).toBe(false);
    expect(calcPileCap({ ...base, fck: 15 }).valid).toBe(false);
  });

  it('canto incompatible con recubrimiento → invalid', () => {
    expect(calcPileCap({ ...base, h_enc: 50, cover: 60 }).valid).toBe(false);
  });
});

// ── Robustez numérica ─────────────────────────────────────────────────────
describe('Sin NaN/Infinity', () => {
  for (const n of [2, 3, 4, 6]) {
    it(`n=${n} con momentos: campos numéricos finitos`, () => {
      const r = calcPileCap({
        ...base, n,
        Mx_Ed: n === 2 ? 0 : 40,
        My_Ed: 40,
      });
      expect(r.valid).toBe(true);
      for (const v of [r.R_max, r.R_min, r.theta_deg, r.Fs_max, r.sigma_strut,
        r.Ft_x, r.As_tie_x, r.As_prov_x, r.s_bar_x, r.lb, r.lb_net, r.lb_avail,
        r.W_cap, r.sigma_col, r.As_cv_req, r.As_ch_req, r.As_top_prov]) {
        expect(Number.isFinite(v)).toBe(true);
      }
      r.checks.filter((c) => !c.neutral).forEach((c) => {
        expect(Number.isNaN(c.utilization)).toBe(false);
      });
    });
  }
});
