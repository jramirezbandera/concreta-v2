// Motor general de vano simple (UDL + cargas puntuales).
//
// El bloque ANCLA es la pieza que da confianza a todo lo demás: demuestra que
// este motor está calibrado EXACTAMENTE igual que los coeficientes cerrados de
// BEAM_CASES que ya estaban en producción, así que no es un segundo motor que
// pueda divergir. La única excepción es `fp`, cuyos dos coeficientes tabulados
// no eran exactos — y eso también queda anclado aquí para que nadie los
// "arregle" de vuelta.

import { describe, it, expect } from 'vitest';
import { beamResponse, beamDeflection, type PointLoad } from '../../lib/calculations/beamResponse';
import { BEAM_CASES } from '../../lib/calculations/beamCases';
import type { BeamType } from '../../data/defaults';

const TYPES: BeamType[] = ['ss', 'cantilever', 'fp', 'ff'];

// Esfuerzos: convención de BEAM_CASES (w kN/m, L m)
const w = 10;
const L = 6;

// Flechas: unidades coherentes N / mm (C24 150×400, L = 6 m)
const L_mm = 6000;
const w_Nmm = 10;              // 10 kN/m ≡ 10 N/mm
const I = 150 * 400 ** 3 / 12; // mm⁴
const A = 150 * 400;           // mm²
const EI = 11000 * I;          // N·mm²
const GA = 690 * A;            // N
const KAPPA = 1.2;

const none: PointLoad[] = [];

// ── ANCLA: reproducción exacta de BEAM_CASES ────────────────────────────────

describe('beamResponse — ancla: sin carga puntual reproduce BEAM_CASES', () => {
  it.each(TYPES)('%s — MEd y VEd exactos', (bc) => {
    const r = beamResponse(bc, L, w, none);
    expect(r.MEd).toBeCloseTo(BEAM_CASES[bc].MEd(w, L), 9);
    expect(r.VEd).toBeCloseTo(BEAM_CASES[bc].VEd(w, L), 9);
  });

  it.each(['ss', 'cantilever', 'ff'] as BeamType[])(
    '%s — flecha exacta = k_defl·Mser·L²/EI + k_shear·w·L²/GA',
    (bc) => {
      const spec = BEAM_CASES[bc];
      const expected = spec.k_defl * spec.MEd(w_Nmm, L_mm) * L_mm ** 2 / EI
                     + spec.k_shear * w_Nmm * L_mm ** 2 / GA;
      const got = beamDeflection(bc, L_mm, w_Nmm, none, EI, GA, KAPPA).max;
      expect(got / expected).toBeCloseTo(1, 9);
    },
  );

  // fp es la excepción: sus dos coeficientes tabulados son aproximaciones.
  // Máximo exacto en x = (15−√33)L/16 (raíz de 8x² − 15Lx + 6L² = 0).
  it('fp — flecha exacta, y los coeficientes viejos NO la reproducían', () => {
    const s = (15 - Math.sqrt(33)) / 16;
    const bend = (5 / 48 * s ** 3 - s ** 4 / 24 - s ** 2 / 16);        // negativo
    const expBend = Math.abs(bend) * w_Nmm * L_mm ** 4 / EI;
    const shearI = (1 - s) * (5 * s / 8 - s * s / 2) - s * (5 * (1 - s) / 8 - (1 - s * s) / 2);
    const expShear = KAPPA * shearI * w_Nmm * L_mm ** 2 / GA;

    // Flexión sola: su máximo SÍ está en s·L.
    const pureBend = beamDeflection('fp', L_mm, w_Nmm, none, EI, GA, 0);
    expect(pureBend.max / expBend).toBeCloseTo(1, 9);
    expect(pureBend.xMax / L_mm).toBeCloseTo(s, 6);

    // Total: en fp los máximos de flexión y cortante caen en secciones
    // distintas, así que el máximo de la suma es algo mayor que la suma en s·L.
    const got = beamDeflection('fp', L_mm, w_Nmm, none, EI, GA, KAPPA);
    expect(got.at(s * L_mm) / (expBend + expShear)).toBeCloseTo(1, 9);
    expect(got.max).toBeGreaterThanOrEqual(got.at(s * L_mm));
    expect(got.max / (expBend + expShear)).toBeCloseTo(1, 3);

    // Deltas frente a los coeficientes de BEAM_CASES (documentados en beamResponse.ts)
    const oldBend = BEAM_CASES.fp.k_defl * BEAM_CASES.fp.MEd(w_Nmm, L_mm) * L_mm ** 2 / EI;
    const oldShear = BEAM_CASES.fp.k_shear * w_Nmm * L_mm ** 2 / GA;
    expect(expBend / oldBend).toBeCloseTo(1.0031, 3);   // k_defl era 0.3% BAJO
    expect(expShear / oldShear).toBeCloseTo(0.6967, 3); // k_shear era 43% ALTO
  });
});

// ── Cargas puntuales: formas cerradas de tabla ──────────────────────────────

describe('beamResponse — carga puntual, formas cerradas', () => {
  const P = 20;

  it('ss — R = Pb/L y Pa/L, MEd = Pab/L', () => {
    const a = 2;
    const b = L - a;
    const r = beamResponse('ss', L, 0, [{ P, a }]);
    expect(r.reactions[0].R).toBeCloseTo(P * b / L, 9);
    expect(r.reactions[1].R).toBeCloseTo(P * a / L, 9);
    expect(r.MEd).toBeCloseTo(P * a * b / L, 9);
    expect(r.xM).toBeCloseTo(a, 9);
    expect(r.VEd).toBeCloseTo(P * b / L, 9);
  });

  it('ménsula — R = P, M = P·a, y la carga en punta da P·L', () => {
    const r = beamResponse('cantilever', L, 0, [{ P, a: 2 }]);
    expect(r.reactions).toHaveLength(1);
    expect(r.reactions[0].R).toBeCloseTo(P, 9);
    expect(r.reactions[0].M).toBeCloseTo(P * 2, 9);
    expect(r.MEd).toBeCloseTo(P * 2, 9);
    expect(beamResponse('cantilever', L, 0, [{ P, a: L }]).MEd).toBeCloseTo(P * L, 9);
  });

  it('fp — carga centrada: R_der = 5P/16 y M_emp = 3PL/16', () => {
    const r = beamResponse('fp', L, 0, [{ P, a: L / 2 }]);
    expect(r.reactions[1].R).toBeCloseTo(5 * P / 16, 9);
    expect(r.reactions[0].M).toBeCloseTo(3 * P * L / 16, 9);
    expect(r.reactions[0].R).toBeCloseTo(11 * P / 16, 9);
    expect(r.MEd).toBeCloseTo(3 * P * L / 16, 9);
  });

  it('ff — carga centrada: M = PL/8 en ambos extremos y R = P/2', () => {
    const r = beamResponse('ff', L, 0, [{ P, a: L / 2 }]);
    expect(r.reactions[0].M).toBeCloseTo(P * L / 8, 9);
    expect(r.reactions[1].M).toBeCloseTo(P * L / 8, 9);
    expect(r.reactions[0].R).toBeCloseTo(P / 2, 9);
    expect(r.MEd).toBeCloseTo(P * L / 8, 9);
  });

  it('una carga situada EN el apoyo no genera esfuerzos', () => {
    for (const a of [0, L]) {
      const r = beamResponse('ss', L, 0, [{ P, a }]);
      expect(r.MEd).toBeCloseTo(0, 9);
      expect(r.VEd).toBeCloseTo(0, 9);
      expect(r.reactions[0].R + r.reactions[1].R).toBeCloseTo(P, 9);
    }
  });
});

describe('beamDeflection — carga puntual, formas cerradas', () => {
  const P = 20000;   // N

  it('ss centrada — PL³/48EI + κPL/4GA', () => {
    const got = beamDeflection('ss', L_mm, 0, [{ P, a: L_mm / 2 }], EI, GA, KAPPA).max;
    const expected = P * L_mm ** 3 / (48 * EI) + KAPPA * P * L_mm / (4 * GA);
    expect(got / expected).toBeCloseTo(1, 9);
  });

  it('ménsula con carga en punta — PL³/3EI + κPL/GA', () => {
    const got = beamDeflection('cantilever', L_mm, 0, [{ P, a: L_mm }], EI, GA, KAPPA).max;
    const expected = P * L_mm ** 3 / (3 * EI) + KAPPA * P * L_mm / GA;
    expect(got / expected).toBeCloseTo(1, 9);
  });

  it('ménsula con carga intramedia — Pa²(3L−a)/6EI en la punta', () => {
    const a = 4000;
    const got = beamDeflection('cantilever', L_mm, 0, [{ P, a }], EI, GA, 0).max;
    expect(got / (P * a * a * (3 * L_mm - a) / (6 * EI))).toBeCloseTo(1, 9);
  });

  it('ff centrada — PL³/192EI (solo flexión)', () => {
    const got = beamDeflection('ff', L_mm, 0, [{ P, a: L_mm / 2 }], EI, GA, 0).max;
    expect(got / (P * L_mm ** 3 / (192 * EI))).toBeCloseTo(1, 9);
  });

  it('ss descentrada — Pb(L²−b²)^1.5/(9√3·L·EI) (solo flexión)', () => {
    const a = 4000;
    const b = L_mm - a;
    const got = beamDeflection('ss', L_mm, 0, [{ P, a }], EI, GA, 0);
    const expected = P * b * (L_mm ** 2 - b * b) ** 1.5 / (9 * Math.sqrt(3) * L_mm * EI);
    expect(got.max / expected).toBeCloseTo(1, 8);
    expect(got.xMax).toBeCloseTo(Math.sqrt((L_mm ** 2 - b * b) / 3), 3);
  });

  it('es lineal: superponer UDL y puntual por separado = calcularlas juntas', () => {
    const load: PointLoad[] = [{ P, a: 2200 }];
    const a1 = beamDeflection('fp', L_mm, w_Nmm, [], EI, GA, KAPPA).at(3100);
    const a2 = beamDeflection('fp', L_mm, 0, load, EI, GA, KAPPA).at(3100);
    const both = beamDeflection('fp', L_mm, w_Nmm, load, EI, GA, KAPPA).at(3100);
    expect(both).toBeCloseTo(a1 + a2, 6);
  });
});

// ── Equilibrio ───────────────────────────────────────────────────────────────

describe('beamResponse — equilibrio', () => {
  const loads: PointLoad[] = [{ P: 20, a: 2.2 }];

  it.each(TYPES)('%s — ΣR = w·L + ΣP', (bc) => {
    const r = beamResponse(bc, L, w, loads);
    const sumR = r.reactions.reduce((s, x) => s + x.R, 0);
    expect(sumR).toBeCloseTo(w * L + 20, 9);
  });

  it.each(TYPES)('%s — M(0) = −M_emp,izq y M(L) = −M_emp,der', (bc) => {
    const r = beamResponse(bc, L, w, loads);
    expect(r.M(0)).toBeCloseTo(-r.reactions[0].M, 9);
    const right = r.reactions[1];
    expect(r.M(L)).toBeCloseTo(right ? -right.M : 0, 9);
  });

  it('las etiquetas y el tipo de apoyo describen el esquema', () => {
    expect(beamResponse('ss', L, w, none).reactions.map((x) => x.kind)).toEqual(['pinned', 'pinned']);
    expect(beamResponse('cantilever', L, w, none).reactions.map((x) => x.kind)).toEqual(['fixed']);
    expect(beamResponse('fp', L, w, none).reactions.map((x) => x.kind)).toEqual(['fixed', 'pinned']);
    expect(beamResponse('ff', L, w, none).reactions.map((x) => x.kind)).toEqual(['fixed', 'fixed']);
    expect(beamResponse('cantilever', L, w, none).reactions[0].label).toBe('Empotramiento');
  });

  it('superposición de esfuerzos: UDL + puntual por separado = juntas', () => {
    const only = beamResponse('ss', L, w, none);
    const pt = beamResponse('ss', L, 0, loads);
    const both = beamResponse('ss', L, w, loads);
    expect(both.M(2.2)).toBeCloseTo(only.M(2.2) + pt.M(2.2), 9);
    expect(both.reactions[0].R).toBeCloseTo(only.reactions[0].R + pt.reactions[0].R, 9);
  });
});
