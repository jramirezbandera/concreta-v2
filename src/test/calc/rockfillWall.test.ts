// Muro de escollera / gaviones — suite del motor de cálculo.
// Oráculos:
//  1. Hoja del usuario "MUROS DE ESCOLLERA O GAVIONES.xlsx" (golden parcial —
//     ver bloque BUGS DEL EXCEL NO REPRODUCIDOS al final).
//  2. Ejemplo real 2005 (Villagondú, Quirós — Recomendaciones 1998): solo
//     plausibilidad; su Ka=0.497 proviene de una formulación propia de la
//     publicación de 1998 no reproducible con Müller-Breslau estándar.
// Run: bun test src/test/calc/rockfillWall.test.ts

import { describe, expect, it } from 'vitest';
import {
  calcRockfillWall,
  kaCoulomb,
  kadMononobeOkabe,
  phiEscolleraGuia,
  PHI_B_LITOLOGIA,
} from '../../lib/calculations/rockfillWall';
import { rockfillWallDefaults, type RockfillWallInputs } from '../../data/defaults';

const base: RockfillWallInputs = { ...rockfillWallDefaults };

// ── Coeficientes de empuje ────────────────────────────────────────────────────
describe('kaCoulomb (Müller-Breslau, plano vertical)', () => {
  it('δ=β=0 degenera en Rankine: φ=30 → 1/3', () => {
    expect(kaCoulomb(30, 0, 0)).toBeCloseTo(1 / 3, 6);
  });

  it('β=0 coincide con el Coulomb del módulo de muros de contención (φ=30, δ=10)', () => {
    // Valor de la fórmula del donante calcRetainingWall (verificado numéricamente)
    expect(kaCoulomb(30, 10, 0)).toBeCloseTo(0.3084658, 6);
  });

  it('oráculo Excel: KAE(φ=28, δ=18, β=0) = 0.3218517', () => {
    expect(kaCoulomb(28, 18, 0)).toBeCloseTo(0.3218517, 6);
  });

  it('β > 0 aumenta Ka; β → φ lo dispara', () => {
    const k0 = kaCoulomb(30, 10, 0);
    const k15 = kaCoulomb(30, 10, 15);
    const k28 = kaCoulomb(30, 10, 28);
    expect(k15).toBeGreaterThan(k0);
    expect(k28).toBeGreaterThan(k15);
  });
});

describe('kadMononobeOkabe', () => {
  it('θ=0 degenera exactamente en kaCoulomb', () => {
    expect(kadMononobeOkabe(30, 10, 0, 0)).toBeCloseTo(kaCoulomb(30, 10, 0), 12);
    expect(kadMononobeOkabe(28, 18, 5, 0)).toBeCloseTo(kaCoulomb(28, 18, 5), 12);
  });

  it('convención del donante: φ=30, δ=10, kh=0.12, kv=0.06 → 0.3939526', () => {
    const theta = Math.atan(0.12 / (1 - 0.06));
    expect(kadMononobeOkabe(30, 10, 0, theta)).toBeCloseTo(0.3939526, 6);
  });

  it('KAD > Ka para θ > 0', () => {
    const theta = Math.atan(0.1);
    expect(kadMononobeOkabe(30, 10, 0, theta)).toBeGreaterThan(kaCoulomb(30, 10, 0));
  });
});

describe('phiEscolleraGuia (Guía 2006 §4.1.3)', () => {
  it('σn = pa = 100 kPa → Δφn = 0', () => {
    const r = phiEscolleraGuia(40, 2, 100);
    expect(r.dPhiN).toBe(0);
    expect(r.phi).toBe(42);
  });

  it('σn = 1000 kPa → Δφn = 7°', () => {
    const r = phiEscolleraGuia(40, 2, 1000);
    expect(r.dPhiN).toBeCloseTo(7, 6);
    expect(r.phi).toBeCloseTo(35, 6);
  });

  it('σn < pa no puede aumentar φ (Δφn ≥ 0 siempre)', () => {
    const r = phiEscolleraGuia(40, 2, 50);
    expect(r.dPhiN).toBe(0);
  });

  it('tabla 4.2 dentro del rango general 38–42°', () => {
    for (const phiB of Object.values(PHI_B_LITOLOGIA)) {
      expect(phiB).toBeGreaterThanOrEqual(38);
      expect(phiB).toBeLessThanOrEqual(42);
    }
  });
});

// ── FTUX defaults ─────────────────────────────────────────────────────────────
describe('FTUX defaults', () => {
  it('resultado válido y sin fallos', () => {
    const r = calcRockfillWall(base);
    expect(r.valid).toBe(true);
    for (const c of r.checks) {
      expect(c.status, `check ${c.id}`).not.toBe('fail');
    }
  });

  it('todo check.article cita Guía, CTE, NCSE o NCSP', () => {
    const r = calcRockfillWall(base);
    for (const c of r.checks) {
      const ok = c.article.includes('Guía') || c.article.includes('CTE') ||
                 c.article.includes('NCSE') || c.article.includes('NCSP');
      expect(ok, `check ${c.id} article: "${c.article}"`).toBe(true);
    }
  });

  it('sin sismo: no hay checks sísmicos ni KAD', () => {
    const r = calcRockfillWall(base);
    expect(r.KAD).toBeUndefined();
    expect(r.checks.find((c) => c.id.includes('sismic'))).toBeUndefined();
  });

  it('contrainclinación 3H:1V en base e hiladas autoestabiliza el caso por defecto', () => {
    const r = calcRockfillWall(base);
    expect(r.FS_desliz).toBe(Infinity);
    expect(r.worstSlide.util).toBe(0);
  });

  it('estabilidad-global presente como fila neutral', () => {
    const r = calcRockfillWall(base);
    const c = r.checks.find((x) => x.id === 'estabilidad-global');
    expect(c?.status).toBe('neutral');
    expect(c?.tag).toBe('VER TALUDES');
  });

  it('cortes de hilada: 50 intervalos, último en z = H, N creciente', () => {
    const r = calcRockfillWall(base);
    expect(r.courses.length).toBe(50);
    expect(r.courses[r.courses.length - 1].z).toBeCloseTo(base.H, 9);
    for (let i = 1; i < r.courses.length; i++) {
      expect(r.courses[i].N).toBeGreaterThan(r.courses[i - 1].N);
    }
  });
});

// ── Golden: hoja Excel del usuario (hiladas, configuración estática Rankine) ──
// Config de la hoja "Comprobaciones Espesor crecient": muro trapecial
// b(z) = 1.2 + 0.6·z, γ_piedra = 26, relleno γ=18/φ=28/c=0, q=10, sin agua.
// En esas hojas el Excel usa Rankine (ka = tan²(45−φ/2) = 0.361033, sin δ) →
// se replica con delta = 0. Sin sismo (el ΔE puntual del Excel arrastra el bug
// de posición y contaminaría la comparación).
describe('golden Excel — comprobación hilada a hilada', () => {
  const excel: RockfillWallInputs = {
    ...base,
    wallType: 'escollera',
    H: 2.7,
    a: 1.2,
    mIntra: 0.6,
    mTras: 0,
    alphaHiladas: 0,    // α_piedra = 0 en la hoja
    hz: 0.7,
    x0: 0,
    xT: 0,
    alphaBase: 0,
    df: 0,
    gammaAp: 26,
    phiMode: 'directo',
    phi: 38,            // φ piedra-piedra de la hoja
    contactoMejorado: false,  // → tan(⅔·38°) = 0.47341 como el Excel
    gammaSuelo: 18,
    gammaSat: 20,
    phiRelleno: 28,
    delta: 0,           // paridad Rankine
    beta: 0,
    q: 10,
    sigmaAdm: 100,
    muBase: Math.tan((2 / 3) * 35 * Math.PI / 180),
    usePassive: false,
    hasWater: false,
    Ab: 0,
    S: 1,
  };

  it('Ka = Rankine 0.361033', () => {
    const r = calcRockfillWall(excel);
    expect(r.Ka).toBeCloseTo(0.361033, 5);
  });

  it('ley de anchos b(z) = 1.2 + 0.6·z', () => {
    const r = calcRockfillWall(excel);
    for (const p of r.courses) {
      expect(p.b).toBeCloseTo(1.2 + 0.6 * p.z, 9);
    }
  });

  const atZ = (r: ReturnType<typeof calcRockfillWall>, z: number) => {
    const p = r.courses.find((c) => Math.abs(c.z - z) < 1e-6);
    expect(p, `corte z=${z}`).toBeDefined();
    return p!;
  };

  it('N(z) contra la columna V del Excel (±2%)', () => {
    const r = calcRockfillWall(excel);
    // (z, N_excel) — el Excel integra por trapecios con un pequeño sesgo de
    // arranque (~1%); nuestro valor es la integral exacta de γ·b(z).
    const rows: Array<[number, number]> = [
      [0.54, 19.35],
      [1.08, 43.249],
      [1.62, 71.697],
      [2.16, 104.693],
      [2.7, 142.239],
    ];
    for (const [z, nExcel] of rows) {
      const p = atZ(r, z);
      expect(Math.abs(p.N - nExcel) / nExcel, `N en z=${z}`).toBeLessThan(0.02);
    }
  });

  it('Q(H) contra Qmax del Excel: 33.185 kN/m (±2%)', () => {
    const r = calcRockfillWall(excel);
    const p = atZ(r, 2.7);
    // Exacto: ½·ka·γ·H² + ka·q·H = 23.688 + 9.748 = 33.44
    expect(Math.abs(p.Q - 33.185) / 33.185).toBeLessThan(0.02);
  });

  it('índice de deslizamiento entre hiladas en la base: 0.7392 (±3%)', () => {
    const r = calcRockfillWall(excel);
    const p = atZ(r, 2.7);
    // Excel: I = Q/[N·tan(⅔·38°)/1.5] = 0.7392 (α_piedra = 0)
    expect(Math.abs(p.utilSlide - 0.7392) / 0.7392).toBeLessThan(0.03);
  });

  it('con α hiladas > 0 el índice de deslizamiento baja', () => {
    const r0 = calcRockfillWall(excel);
    const r18 = calcRockfillWall({ ...excel, alphaHiladas: 18.43 });
    expect(r18.worstSlide.util).toBeLessThan(r0.worstSlide.util);
  });
});

// ── Plausibilidad: ejemplo Villagondú 2005 (Recomendaciones 1998) ────────────
describe('ejemplo 2005 Villagondú (plausibilidad)', () => {
  // Mapeo: H vista 6.3 + zapata 1.0; a=2.2; intradós 5H:10V; trasdós 4H:10V;
  // puntera x0=0.14; β=15°; δ=22°; terreno φ=15.2°, γ=1.71 t/m³ ≈ 16.8 kN/m³;
  // escollera γ=2.2 t/m³ ≈ 21.6 kN/m³; base contrainclinada 1H:3V.
  const v2005: RockfillWallInputs = {
    ...base,
    H: 6.3,
    a: 2.2,
    mIntra: 0.5,
    mTras: 0.4,
    alphaHiladas: 18.43,
    hz: 1.0,
    x0: 0.14,
    xT: 0,
    alphaBase: 18.43,
    gammaAp: 21.6,
    phi: 63.4,           // tg φ_E = 2 según el informe
    phiRelleno: 15.2,
    delta: 22,
    beta: 15,
    gammaSuelo: 16.8,
    gammaSat: 19,
    q: 0,
    sigmaAdm: 230,       // 2.34 kg/cm²
    muBase: Math.tan((2 / 3) * 35 * Math.PI / 180),
    hasWater: false,
    Ab: 0,
    S: 1,
  };

  it('geometría derivada coincide con el plano: bBase ≈ 2.83, B ≈ 2.97', () => {
    const r = calcRockfillWall(v2005);
    expect(r.valid).toBe(true);
    expect(r.bBase).toBeCloseTo(2.83, 2);
    expect(r.B).toBeCloseTo(2.97, 2);
  });

  it('Ka Müller-Breslau (plano vertical) = 0.914 — el 0.497 del informe usa la formulación propia de 1998', () => {
    // β = 15° ≈ φ = 15.2° dispara el Ka de Coulomb (sin(φ−β) → 0). El informe
    // de 2005 obtenía 0.497 con la formulación de las Recomendaciones 1998
    // sobre el trasdós inclinado (α = −21.8°), no reproducible con la
    // formulación estándar; este caso queda como referencia de plausibilidad.
    const r = calcRockfillWall(v2005);
    expect(r.Ka).toBeCloseTo(0.9135, 3);
  });

  it('factores de seguridad en rangos plausibles (informe: Csd = 1.5, Csv = 2.16)', () => {
    const r = calcRockfillWall(v2005);
    expect(r.FS_vuelco).toBeGreaterThan(1.2);
    expect(isFinite(r.FS_vuelco)).toBe(true);
    // Con base contrainclinada 1H:3V el deslizamiento puede resultar autoestable
    expect(r.FS_desliz).toBeGreaterThan(1.2);
  });
});

// ── Agua ──────────────────────────────────────────────────────────────────────
describe('nivel freático', () => {
  it('hasWater=false ≡ NF por debajo de la base', () => {
    const dry = calcRockfillWall({ ...base, hasWater: false });
    const deep = calcRockfillWall({ ...base, hasWater: true, hw: base.H + base.hz + 5 });
    expect(dry.EAH_total).toBeCloseTo(deep.EAH_total, 9);
    expect(dry.ΣV).toBeCloseTo(deep.ΣV, 9);
    expect(deep.EW).toBeUndefined();
  });

  it('agua sube el empuje horizontal y baja ΣV (subpresión)', () => {
    const dry = calcRockfillWall(base);
    const wet = calcRockfillWall({ ...base, hasWater: true, hw: 1.0 });
    expect(wet.EAH_total).toBeGreaterThan(dry.EAH_total);
    expect(wet.ΣV).toBeLessThan(dry.ΣV);
    expect(wet.EW).toBeGreaterThan(0);
  });

  it('agua muy alta con muro ligero → inválido (levanta)', () => {
    const r = calcRockfillWall({
      ...base, H: 1, hz: 1, a: 0.5, mIntra: 0, gammaAp: 3,
      hasWater: true, hw: 0,
    });
    expect(r.valid).toBe(false);
  });
});

// ── Sismo ─────────────────────────────────────────────────────────────────────
describe('sismo Mononobe-Okabe', () => {
  const seis: RockfillWallInputs = { ...base, Ab: 0.12, S: 1.0 };

  it('kh = S·Ab, kv = kh/2; checks sísmicos presentes', () => {
    const r = calcRockfillWall(seis);
    expect(r.kh_derived).toBeCloseTo(0.12, 9);
    expect(r.kv_derived).toBeCloseTo(0.06, 9);
    expect(r.KAD).toBeGreaterThan(r.Ka);
    for (const id of ['vuelco-sismico', 'deslizamiento-sismico', 'hilada-deslizamiento-sismico']) {
      expect(r.checks.find((c) => c.id === id), id).toBeDefined();
    }
  });

  it('FS sísmicos ≤ estáticos', () => {
    const r = calcRockfillWall(seis);
    expect(r.FS_vuelco_seis!).toBeLessThan(r.FS_vuelco);
    if (isFinite(r.FS_desliz)) {
      expect(r.FS_desliz_seis!).toBeLessThanOrEqual(r.FS_desliz);
    }
  });

  it('kh=0 no emite resultados sísmicos', () => {
    const r = calcRockfillWall({ ...base, Ab: 0 });
    expect(r.FS_vuelco_seis).toBeUndefined();
    expect(r.worstSlideSeis).toBeUndefined();
  });

  it('guard de inestabilidad: φ − β − θ < 0', () => {
    const r = calcRockfillWall({
      ...seis, phiRelleno: 16, beta: 10, Ab: 0.2, S: 1.1,
    });
    // θ = atan(0.22/0.89) ≈ 13.9° > φ − β = 6°
    expect(r.seismicUnstable).toBe(true);
  });
});

// ── Gaviones ──────────────────────────────────────────────────────────────────
describe('gaviones', () => {
  const gav: RockfillWallInputs = {
    ...base, wallType: 'gaviones', gammaAp: 16,
    hCaja: 1.0, stepCaja: 0.5, stepAlign: 'back', alphaBatter: 6,
  };

  it('nRows = round(H/hCaja); H efectiva; cortes en las juntas', () => {
    const r = calcRockfillWall(gav);
    expect(r.nRows).toBe(4);
    expect(r.H_eff).toBeCloseTo(4, 9);
    expect(r.courses.length).toBe(4);
    expect(r.courses.map((c) => c.z)).toEqual([1, 2, 3, 4]);
  });

  it('ancho de contacto en junta = ancho de la fila superior', () => {
    const r = calcRockfillWall(gav);
    expect(r.courses[0].b).toBeCloseTo(2.0, 9);   // junta bajo la fila 1
    expect(r.courses[1].b).toBeCloseTo(2.5, 9);
    expect(r.courses[3].b).toBeCloseTo(3.5, 9);
  });

  it('H no múltiplo de hCaja se redondea a filas enteras', () => {
    const r = calcRockfillWall({ ...gav, H: 3.7 });
    expect(r.nRows).toBe(4);
    expect(r.H_eff).toBeCloseTo(4.0, 9);
    const filas = r.checks.find((c) => c.id === 'geom-filas');
    expect(filas?.status).toBe('neutral');
  });

  it('gavión rectangular (step=0, batter=0) ≡ escollera prismática', () => {
    const g = calcRockfillWall({
      ...gav, stepCaja: 0, alphaBatter: 0, a: 2.5, gammaAp: 18,
    });
    const e = calcRockfillWall({
      ...base, a: 2.5, mIntra: 0, mTras: 0, alphaHiladas: 0, gammaAp: 18,
    });
    expect(g.valid && e.valid).toBe(true);
    expect(g.ΣV).toBeCloseTo(e.ΣV, 6);
    expect(g.EAH_total).toBeCloseTo(e.EAH_total, 6);
    expect(g.FS_vuelco).toBeCloseTo(e.FS_vuelco, 6);
    // Junta inferior del gavión = corte z=H de la escollera
    const gLast = g.courses[g.courses.length - 1];
    const eLast = e.courses[e.courses.length - 1];
    expect(gLast.N).toBeCloseTo(eLast.N, 6);
    expect(gLast.Q).toBeCloseTo(eLast.Q, 6);
  });

  it('sin checks geométricos de escollera; geom-cimiento sí', () => {
    const r = calcRockfillWall(gav);
    expect(r.checks.find((c) => c.id === 'geom-coronacion')).toBeUndefined();
    expect(r.checks.find((c) => c.id === 'geom-intrados')).toBeUndefined();
    expect(r.checks.find((c) => c.id === 'geom-cimiento')).toBeDefined();
  });
});

// ── Comprobaciones geométricas de la Guía ────────────────────────────────────
describe('checks geométricos (Guía 2006 §2)', () => {
  it('defaults exactamente en el mínimo normativo → ok, no warn', () => {
    const r = calcRockfillWall({ ...base, alphaHiladas: 18.43, hz: 1.0 });
    for (const id of ['geom-coronacion', 'geom-intrados', 'geom-hiladas', 'geom-cimiento']) {
      expect(r.checks.find((c) => c.id === id)?.status, id).toBe('ok');
    }
  });

  it('coronación: 1.5 m admisible solo con H < 5 m', () => {
    const low = calcRockfillWall({ ...base, H: 4, a: 1.6 });
    expect(low.checks.find((c) => c.id === 'geom-coronacion')?.status).toBe('ok');
    const high = calcRockfillWall({ ...base, H: 6, a: 1.6 });
    expect(high.checks.find((c) => c.id === 'geom-coronacion')?.status).toBe('fail');
  });

  it('intradós más vertical que 1H:3V → fail', () => {
    const r = calcRockfillWall({ ...base, mIntra: 0.2 });
    expect(r.checks.find((c) => c.id === 'geom-intrados')?.status).toBe('fail');
  });

  it('cimiento < 1 m → fail', () => {
    const r = calcRockfillWall({ ...base, hz: 0.7 });
    expect(r.checks.find((c) => c.id === 'geom-cimiento')?.status).toBe('fail');
  });
});

// ── φ modo guía ───────────────────────────────────────────────────────────────
describe('φ en modo guía', () => {
  it('emite la fila neutral phi-escollera con φ derivado', () => {
    const r = calcRockfillWall({ ...base, phiMode: 'guia', litologia: 'caliza', dPhiE: 2 });
    const c = r.checks.find((x) => x.id === 'phi-escollera');
    expect(c?.status).toBe('neutral');
    expect(r.phiEff).toBeCloseTo(39.5 + 2 - (r.dPhiN ?? 0), 6);
    expect(r.sigmaN).toBeCloseTo(r.sigma_max, 9);
  });

  it('en modo directo no hay fila phi-escollera', () => {
    const r = calcRockfillWall(base);
    expect(r.checks.find((x) => x.id === 'phi-escollera')).toBeUndefined();
    expect(r.phiEff).toBe(base.phi);
  });

  it('contacto mejorado usa φ completo entre hiladas', () => {
    const std = calcRockfillWall({ ...base, alphaHiladas: 0 });
    const mej = calcRockfillWall({ ...base, alphaHiladas: 0, contactoMejorado: true });
    expect(mej.phiPP).toBeCloseTo(std.phiPP * 1.5, 6);
    expect(mej.worstSlide.util).toBeLessThanOrEqual(std.worstSlide.util);
  });
});

// ── Estabilidad de base: monotonías e invariantes ─────────────────────────────
describe('estabilidad en la base', () => {
  // Configuración exigida (base horizontal) para que los FS sean finitos
  const flat: RockfillWallInputs = { ...base, alphaBase: 0, alphaHiladas: 0, q: 15 };

  it('FS_desliz crece con muBase', () => {
    const lo = calcRockfillWall({ ...flat, muBase: 0.3 });
    const hi = calcRockfillWall({ ...flat, muBase: 0.6 });
    expect(hi.FS_desliz).toBeGreaterThan(lo.FS_desliz);
  });

  it('contrainclinar la base mejora el deslizamiento', () => {
    const r0 = calcRockfillWall(flat);
    const r18 = calcRockfillWall({ ...flat, alphaBase: 18.43 });
    expect(
      !isFinite(r18.FS_desliz) || r18.FS_desliz > r0.FS_desliz,
    ).toBe(true);
  });

  it('empuje pasivo opt-in mejora el deslizamiento', () => {
    const noEp = calcRockfillWall({ ...flat, df: 0.8, usePassive: false });
    const ep = calcRockfillWall({ ...flat, df: 0.8, usePassive: true });
    expect(ep.Ep).toBeGreaterThan(0);
    expect(ep.FS_desliz).toBeGreaterThan(noEp.FS_desliz);
  });

  it("b' de Meyerhof = B − 2|e| y σ_ref = ΣV/b'", () => {
    const r = calcRockfillWall(flat);
    expect(r.bEq).toBeCloseTo(r.B - 2 * Math.abs(r.e), 9);
    expect(r.sigma_ref).toBeCloseTo(r.ΣV / r.bEq, 6);
  });

  it('σadm pequeña dispara el fail de sigma-max', () => {
    const r = calcRockfillWall({ ...flat, sigmaAdm: 30 });
    expect(r.checks.find((c) => c.id === 'sigma-max')?.status).toBe('fail');
  });

  it('sobrecarga favorable excluida de estabilidad: q sube σ pero baja FS', () => {
    const r0 = calcRockfillWall({ ...flat, q: 0 });
    const rq = calcRockfillWall({ ...flat, q: 20 });
    expect(rq.FS_vuelco).toBeLessThan(r0.FS_vuelco);
    expect(rq.sigma_ref).toBeGreaterThan(r0.sigma_ref);
  });
});

// ── Validación de entradas ────────────────────────────────────────────────────
describe('validación de entradas', () => {
  it('H ≤ 0 inválido', () => {
    expect(calcRockfillWall({ ...base, H: 0 }).valid).toBe(false);
  });
  it('a ≤ 0 inválido', () => {
    expect(calcRockfillWall({ ...base, a: 0 }).valid).toBe(false);
  });
  it('hz ≤ 0 inválido', () => {
    expect(calcRockfillWall({ ...base, hz: 0 }).valid).toBe(false);
  });
  it('β ≥ φ del relleno inválido', () => {
    expect(calcRockfillWall({ ...base, beta: 30, phiRelleno: 30 }).valid).toBe(false);
  });
  it('trasdós cruzando el intradós inválido', () => {
    expect(calcRockfillWall({ ...base, a: 0.5, mIntra: 0, mTras: 0.5 }).valid).toBe(false);
  });
  it('hCaja ≤ 0 inválido en gaviones', () => {
    expect(calcRockfillWall({ ...base, wallType: 'gaviones', hCaja: 0 }).valid).toBe(false);
  });
});

// ── BUGS DEL EXCEL NO REPRODUCIDOS ───────────────────────────────────────────
// Documentación de las divergencias deliberadas respecto a la hoja
// "MUROS DE ESCOLLERA O GAVIONES.xlsx" (los valores del Excel NO son golden):
//  1. Doble conteo sísmico: la hoja usa K_AD como Ka estático Y suma además
//     ΔE = ½γh²(K_AD − K_AE). Aquí: Ka estático + ΔE_AD solo en situación
//     sísmica.
//  2. Ev = h·γ·Ka·sin δ (dimensionalmente tensión, no fuerza). Aquí:
//     Ev = Ea·sin δ.
//  3. Brazo del peso del muro d_m = b_base + B/2 (cae fuera del muro; infla
//     Csv de ≈3.6 a 8.58). Aquí: centroide real del trapecio/cajas.
//  4. ΔE sísmico aplicado a h/3 desde CORONACIÓN (debería ser desde la base).
//     Aquí: incremento dinámico a 0.6·H (Seed & Whitman).
//  5. Cohesión de base C'·0.5 con unidades ambiguas. Aquí: sin cohesión en la
//     base (c = 0, lado seguro; el rozamiento va en muBase).
//  6. Mezcla Rankine (hojas de esfuerzos) / Coulomb+δ (hoja global). Aquí:
//     Müller-Breslau consistente en todo el motor.
//  7. El índice de vuelco por hiladas del Excel usa M/N con M solo de la ley
//     de empujes (modelo 1-D sin geometría). Aquí la excentricidad incluye la
//     posición real del centroide del muro, por lo que ese índice NO se
//     compara numéricamente contra la hoja.
