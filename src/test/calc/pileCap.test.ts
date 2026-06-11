// Pile cap (encepado de micropilotes) test suite — creada con los fixes de la
// auditoría adenda 2 (#75-87); antes este motor NO tenía ningún test (#81).
//
// Oracles calculados a mano con el modelo B&T de CE Anejo 19 §6.5 (geometría
// de práctica consolidada ex-EHE): z = 0.85·d, brazo v + 0.25a, bandas sobre
// pilotes, fyd = fyk/γs (SIN tope 400 — EHE derogada), peso propio 25 kN/m³
// con γG=1.35, anclaje fctd = 0.7·fctm/1.5 y demanda lbd de patilla (α1=0.7).
//
// Defaults (n=2, d_p=220, s=1200, h=800, col 400×400, C25, B500, c=60, φ12,
// N=300, R_adm=250):
//   e = max(110+250, 330, 300) = 360 → L_x = 1920, L_y = 1120
//   W_cap = 25e-9·1920·1120·800 = 43.008 kN → R = (300+58.06)/2 = 179.03 kN
//   d = 800−60−6 = 734 → z = 623.9 ; a_eff = 600−100 = 500 → θ = 51.3°
//   Fs = 179.03/sin51.3° = 229.4 kN ; A_node = π·110² = 38013 mm²
//   σ_strut = 6.04 MPa vs σ_Rd = 0.6·0.9·16.7 = 9.02 MPa
//   Ft = 179.03·500/623.9 = 143.5 kN → As_tie = 330.0 mm² (fyd=434.78)
//   As_min = 0.26·(2.56/500)·1120·734 = 1094 mm² → 10Ø12 = 1131 mm²
//   lb = 3·434.78/2.688 = 485.2 ; lb,req = 0.7·485.2·(1094/1131) = 328.7 mm
//   lb,disp = (360−60) + (800−60−40) = 1000 mm

import { describe, expect, it } from 'vitest';
import { calcPileCap } from '../../lib/calculations/pileCap';
import { pileCapDefaults } from '../../data/defaults';

const base = { ...pileCapDefaults };

// ── FTUX defaults ─────────────────────────────────────────────────────────
describe('FTUX defaults (n=2, d_p=220)', () => {
  const r = calcPileCap(base);

  it('result is valid', () => {
    expect(r.valid).toBe(true);
    expect(r.error).toBeUndefined();
  });

  it('cap dims: e=360, L_x=1920, L_y=1120 (e = d_p/2 + 250, fix #87)', () => {
    expect(r.e_borde).toBe(360);
    expect(r.L_x).toBe(1920);
    expect(r.L_y).toBe(1120);
  });

  it('W_cap ≈ 43.0 kN y reacciones con peso propio: R_max ≈ 179.0 kN (fix #77)', () => {
    expect(r.W_cap).toBeCloseTo(43.008, 2);
    expect(r.R_max).toBeCloseTo(179.03, 1);
    expect(r.R_max).toBeCloseTo((base.N_Ed + 1.35 * r.W_cap) / 2, 3);
  });

  it('fyd = fyk/γs = 434.8 (CE Anejo 19 — sin el tope 400 de la EHE derogada, #85)', () => {
    expect(r.fyd).toBeCloseTo(500 / 1.15, 2);
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

  it('σ_strut ≈ 6.04 MPa vs σ_Rd ≈ 9.02 MPa (biela §6.5.2)', () => {
    expect(r.sigma_strut).toBeCloseTo(6.04, 2);
    expect(r.sigma_Rd_max).toBeCloseTo(9.02, 2);
  });

  it('nodo C-C-C bajo pilar: σ_col = 1.875 MPa vs 15.0 MPa (fix #83)', () => {
    expect(r.sigma_col).toBeCloseTo(1.875, 3);
    expect(r.sigma_Rd_col).toBeCloseTo(15.03, 2);
    expect(r.checks.find((c) => c.id === 'node-column')!.status).toBe('ok');
  });

  it('tirante: Ft ≈ 143.5 kN, As_tie ≈ 330 mm², 10Ø12 = 1131 mm²', () => {
    expect(r.Ft_x).toBeCloseTo(143.5, 1);
    expect(r.As_tie_x).toBeCloseTo(330.0, 1);
    expect(r.As_min_x).toBeCloseTo(1094.3, 0);
    expect(r.n_bars_x).toBe(10);
    expect(r.As_prov_x).toBeCloseTo(1131, 0);
  });

  it('check de tirante usa la DEMANDA As_tie, no As_min (fix #82)', () => {
    const c = r.checks.find((ch) => ch.id === 'tie-steel-x')!;
    expect(c.utilization).toBeCloseTo(330.0 / 1131, 2);
    expect(c.status).toBe('ok');
  });

  it('banda sobre pilotes: w_band = d_p + 2·cover = 340 mm, s_bar ≈ 37.8 mm (fix #86)', () => {
    expect(r.w_band).toBe(340);
    expect(r.s_bar_x).toBeCloseTo(340 / 9, 1);
  });

  it('anclaje: lb ≈ 485.2 (fctd con 0.7), lb,req ≈ 328.7, lb,disp = 1000 (fix #75)', () => {
    expect(r.lb).toBeCloseTo(485.2, 1);
    expect(r.lb_net).toBeCloseTo(328.7, 1);
    expect(r.lb_avail).toBe(1000);
  });

  it('demanda de anclaje es de escala lbd (no el mínimo 0.3·lb del bug #75)', () => {
    expect(r.lb_net).toBeGreaterThan(0.5 * r.lb);
  });

  it('armadura secundaria recomendada (fix #79, práctica ex-EHE): sup ≥ 10% inf, retícula 4‰', () => {
    expect(r.As_top_req).toBeCloseTo(0.1 * r.As_prov_x, 3);
    expect(r.As_grid_v).toBeCloseTo(4 * Math.min(1120, 400), 1);  // 1600 mm²/m
    expect(r.As_grid_h).toBeCloseTo(4 * Math.min(800, 560), 1);   // 2240 mm²/m
    const row = r.checks.find((c) => c.id === 'secondary-rebar')!;
    expect(row.status).toBe('neutral');
    expect(row.article).toMatch(/58\.4\.1\.4/);
  });

  it('todas las filas no neutrales en ok (FTUX verde)', () => {
    r.checks
      .filter((c) => !c.neutral)
      .forEach((c) => expect(c.status).toBe('ok'));
  });

  it('lista completa de checks', () => {
    const ids = r.checks.map((c) => c.id);
    for (const id of ['spacing', 'cap-depth', 'pile-react-max', 'strut-angle',
      'strut-capacity', 'tie-steel-x', 'bar-spacing', 'bar-spacing-min',
      'anchorage', 'node-column', 'secondary-rebar']) {
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

  it('n=3: L_y = s·√3/2 + 2e', () => {
    const r = calcPileCap({ ...base, n: 3 });
    expect(r.L_y).toBeCloseTo(1200 * Math.sqrt(3) / 2 + 2 * 360, 1);
  });

  it('n=4: L_x = L_y = s + 2e', () => {
    const r = calcPileCap({ ...base, n: 4 });
    expect(r.L_x).toBe(1920);
    expect(r.L_y).toBe(1920);
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

  it('n=3: tirante POR LADO = 0.681·R_max·a_eff/z (fix #80)', () => {
    const r = calcPileCap({ ...base, n: 3 });
    const a_r = 1200 / Math.sqrt(3);
    expect(r.a_eff).toBeCloseTo(a_r - 100, 1);
    expect(r.Ft_x).toBeCloseTo(0.681 * r.R_max * r.a_eff / r.z_eff, 2);
  });

  it('fyk=400 → fyd = 347.8 (fyd = fyk/γs para cualquier grado)', () => {
    expect(calcPileCap({ ...base, fyk: 400 }).fyd).toBeCloseTo(400 / 1.15, 2);
  });

  it('congestión: muchas barras en banda → bar-spacing-min fail (fix #82)', () => {
    const r = calcPileCap({ ...base, N_Ed: 4000, R_adm: 3000 });
    expect(r.s_bar_x).toBeLessThan(20);
    expect(r.checks.find((c) => c.id === 'bar-spacing-min')!.status).toBe('fail');
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
  for (const n of [2, 3, 4]) {
    it(`n=${n} con momentos: campos numéricos finitos`, () => {
      const r = calcPileCap({
        ...base, n,
        Mx_Ed: n === 2 ? 0 : 40,
        My_Ed: 40,
      });
      expect(r.valid).toBe(true);
      for (const v of [r.R_max, r.R_min, r.theta_deg, r.Fs_max, r.sigma_strut,
        r.Ft_x, r.As_tie_x, r.As_prov_x, r.s_bar_x, r.lb, r.lb_net, r.lb_avail,
        r.W_cap, r.sigma_col, r.As_grid_v, r.As_grid_h]) {
        expect(Number.isFinite(v)).toBe(true);
      }
      r.checks.filter((c) => !c.neutral).forEach((c) => {
        expect(Number.isNaN(c.utilization)).toBe(false);
      });
    });
  }
});
