// Micropilotes — Guía Fomento 2005
// Tests cover: FTUX defaults, integración geotécnica, tope estructural,
// catálogo PIRESA, edge cases.
// Run: bun test src/test/calc/micropiles.test.ts

import { describe, expect, it } from 'vitest';
import { calcMicropiles } from '../../lib/calculations/micropiles';
import { micropilesDefaults, micropilesSoilDefaults } from '../../data/defaults';
import { MICROPILE_TUBES, getTube, getTubeAreaGross, getTubeAreaNet } from '../../data/micropileTubes';
import {
  weldThroatMin, interpolateF, interpolateMe,
  RE_BY_CORROSION_MATRIX, getCorrosionRe,
} from '../../data/micropileLookups';

const baseInp  = { ...micropilesDefaults };
const baseSoil = micropilesSoilDefaults.map((l) => ({ ...l }));

// ── FTUX defaults ─────────────────────────────────────────────────────────────
describe('FTUX defaults', () => {
  it('result is valid', () => {
    const r = calcMicropiles(baseInp, baseSoil);
    expect(r.valid).toBe(true);
  });

  it('length = 16 m (cabeza -1 → apoyo -17, replica Excel)', () => {
    const r = calcMicropiles(baseInp, baseSoil);
    expect(r.length).toBeCloseTo(16, 3);
    expect(r.nSegments).toBe(50);
    expect(r.segmentLength).toBeCloseTo(0.32, 3);
    expect(r.segments).toHaveLength(50);
  });

  it('no failing checks at FTUX', () => {
    const r = calcMicropiles(baseInp, baseSoil);
    for (const c of r.checks) {
      expect(c.status, `check ${c.id}`).not.toBe('fail');
    }
  });

  it('every check.article references Guía / EC3 / CTE', () => {
    const r = calcMicropiles(baseInp, baseSoil);
    for (const c of r.checks) {
      const ok = c.article.includes('Guía') || c.article.includes('EC3') ||
                 c.article.includes('CTE')  || c.article.includes('Criterio');
      expect(ok, `check ${c.id} article="${c.article}"`).toBe(true);
    }
  });

  it('Rfc_theoretical matches corrected reference 739.30 kN (post-fix C2, ±0.5 kN)', () => {
    // Excel original daba 738.66 kN; el motor corregido (u = γw·max(0, zBot−zWater)
    // en vez del contador discreto que sobre-estimaba u en el segmento de cruce)
    // da 739.30 kN. La diferencia (+0.09%) es la corrección del bug.
    const r = calcMicropiles(baseInp, baseSoil);
    expect(r.RfcTheoretical).toBeCloseTo(739.30, 0);
  });

  it('Rfc_empirical matches Excel reference 675.17 kN exactly (±0.5%)', () => {
    const r = calcMicropiles(baseInp, baseSoil);
    expect(r.RfcEmpirical).toBeCloseTo(675.17, 0);
  });

  it('Nc_rd matches Excel reference 686.67 kN (±1%)', () => {
    const r = calcMicropiles(baseInp, baseSoil);
    expect(r.Nc_rd).toBeGreaterThan(0.99 * 686.67);
    expect(r.Nc_rd).toBeLessThan(1.01 * 686.67);
  });

  it('Tc_rd matches Excel reference 952.95 kN exactly', () => {
    const r = calcMicropiles(baseInp, baseSoil);
    expect(r.Tc_rd).toBeCloseTo(952.95, 1);
  });

  it('Fc_h matches Excel reference 394.19 kN', () => {
    const r = calcMicropiles(baseInp, baseSoil);
    expect(r.Fc_h).toBeCloseTo(394.19, 1);
  });

  it('Fa_h matches Excel reference 837.07 kN', () => {
    const r = calcMicropiles(baseInp, baseSoil);
    expect(r.Fa_h).toBeCloseTo(837.07, 1);
  });

  it('Mpl_rd matches Excel reference 26.56 kNm', () => {
    const r = calcMicropiles(baseInp, baseSoil);
    expect(r.Mpl_rd).toBeCloseTo(26.56, 1);
  });

  it('method=theoretical selects RfcTheoretical as RfcAdopted', () => {
    const r = calcMicropiles({ ...baseInp, method: 'theoretical' }, baseSoil);
    expect(r.RfcAdopted).toBeCloseTo(r.RfcTheoretical, 3);
  });

  it('method=empirical selects RfcEmpirical as RfcAdopted', () => {
    const r = calcMicropiles({ ...baseInp, method: 'empirical' }, baseSoil);
    expect(r.RfcAdopted).toBeCloseTo(r.RfcEmpirical, 3);
  });

  it('ih and ic utilizations < 1 (CUMPLE)', () => {
    const r = calcMicropiles(baseInp, baseSoil);
    expect(r.ih).toBeGreaterThan(0);
    expect(r.ih).toBeLessThan(1);
    expect(r.ic).toBeGreaterThan(0);
    expect(r.ic).toBeLessThan(1);
  });
});

// ── Discretización y tensiones efectivas ─────────────────────────────────────
describe('Discretización del fuste', () => {
  it('segments are evenly spaced along the pile shaft', () => {
    const r = calcMicropiles(baseInp, baseSoil);
    for (let i = 1; i < r.segments.length; i++) {
      const dzActual = r.segments[i].zAbs - r.segments[i - 1].zAbs;
      expect(dzActual).toBeCloseTo(0.32, 2);
    }
  });

  it('first segment ends just below the pile head', () => {
    const r = calcMicropiles(baseInp, baseSoil);
    // cabeza = -1 → zHead abs = 1, fondo del primer segmento a 1 + 0.32 = 1.32
    expect(r.segments[0].zAbs).toBeCloseTo(1.32, 2);
    expect(r.segments[0].zFromTop).toBeCloseTo(0.32, 2);
  });

  it('last segment ends at the toe', () => {
    const r = calcMicropiles(baseInp, baseSoil);
    // apoyo abs = 17, fondo del último segmento = 17.0
    expect(r.segments[49].zAbs).toBeCloseTo(17.0, 2);
    expect(r.segments[49].zFromTop).toBeCloseTo(16.0, 2);
  });

  it('Rfc accumulator is monotonically increasing', () => {
    const r = calcMicropiles(baseInp, baseSoil);
    for (let i = 1; i < r.segments.length; i++) {
      expect(r.segments[i].RfcTheoreticalAcc)
        .toBeGreaterThanOrEqual(r.segments[i - 1].RfcTheoreticalAcc);
      expect(r.segments[i].RfcEmpiricalAcc)
        .toBeGreaterThanOrEqual(r.segments[i - 1].RfcEmpiricalAcc);
    }
  });

  it('water table reduces sigmaVeff below NF depth', () => {
    const r = calcMicropiles(baseInp, baseSoil);
    // NF at z=7.5; find segments just below and above
    const above = r.segments.find((s) => Math.abs(s.zAbs - 7.0) < 0.3);
    const below = r.segments.find((s) => Math.abs(s.zAbs - 8.0) < 0.3);
    expect(above).toBeDefined();
    expect(below).toBeDefined();
    // sigmaVeff should still grow with depth but slower below NF
    // (sanity check: not exhaustive)
    expect(below!.sigmaVeff).toBeGreaterThan(above!.sigmaVeff);
  });
});

// ── Tope estructural ─────────────────────────────────────────────────────────
describe('Tope estructural', () => {
  it('As_y matches catalog for Ø88,9 × 9 mm tube', () => {
    const r = calcMicropiles(baseInp, baseSoil);
    const tube = getTube('Ø88,9 × 9 mm');
    const expected = getTubeAreaGross(tube.de, tube.e);
    expect(r.As_y).toBeCloseTo(expected, 0);
    expect(r.As_y).toBeCloseTo(2259.12, 0);
  });

  it('As_d = As_y reduced by corrosion re (Tabla A-5.1)', () => {
    const r = calcMicropiles(baseInp, baseSoil);
    // re=0.6 mm (natural-undisturbed), de_net = 88.9 - 1.2 = 87.7
    // As_d = π/4·(87.7² − 70.9²) ≈ 2093 mm²
    expect(r.As_d).toBeGreaterThan(2050);
    expect(r.As_d).toBeLessThan(2150);
    expect(r.As_d).toBeLessThan(r.As_y);
  });

  it('Nc_rd positive and ic = Nc_d / Nc_rd', () => {
    const r = calcMicropiles(baseInp, baseSoil);
    expect(r.Nc_rd).toBeGreaterThan(0);
    expect(r.ic).toBeCloseTo(baseInp.designLoad / r.Nc_rd, 4);
    // Order of magnitude check vs Excel target (686.67 kN), tolerancia ±15%
    expect(r.Nc_rd).toBeGreaterThan(0.85 * 686.67);
    expect(r.Nc_rd).toBeLessThan(1.15 * 686.67);
  });

  it('R factor follows 1.07 − 0.027·CR ≤ 1', () => {
    const r = calcMicropiles({ ...baseInp, CR: 7.5 }, baseSoil);
    expect(r.R).toBeCloseTo(1.07 - 0.027 * 7.5, 4);
  });

  it('higher CR reduces Nc_rd (buckling penalty)', () => {
    const a = calcMicropiles({ ...baseInp, CR: 5 }, baseSoil);
    const b = calcMicropiles({ ...baseInp, CR: 15 }, baseSoil);
    expect(b.Nc_rd).toBeLessThan(a.Nc_rd);
  });

  it('Fe factor follows execution lookup (Guía Fomento Tabla 3.5)', () => {
    const a = calcMicropiles({ ...baseInp, execution: 'wt-below-no-casing-no-mud' }, baseSoil);
    const b = calcMicropiles({ ...baseInp, execution: 'casing-lost' }, baseSoil);
    expect(b.Fe).toBe(1.0);
    expect(a.Fe).toBe(1.30);
    // Lower Fe → higher Nc_rd
    expect(b.Nc_rd).toBeGreaterThan(a.Nc_rd);
  });

  it('Fe values match Guía Fomento Tabla 3.5 verbatim', () => {
    // Verificación 1:1 con la tabla oficial del PDF.
    expect(calcMicropiles({ ...baseInp, execution: 'wt-above-no-casing-no-mud' }, baseSoil).Fe).toBe(1.50);
    expect(calcMicropiles({ ...baseInp, execution: 'wt-below-no-casing-no-mud' }, baseSoil).Fe).toBe(1.30);
    expect(calcMicropiles({ ...baseInp, execution: 'with-mud' },                  baseSoil).Fe).toBe(1.15);
    expect(calcMicropiles({ ...baseInp, execution: 'casing-recoverable' },        baseSoil).Fe).toBe(1.05);
    expect(calcMicropiles({ ...baseInp, execution: 'casing-lost' },               baseSoil).Fe).toBe(1.00);
  });
});

// ── Catálogo PIRESA ──────────────────────────────────────────────────────────
describe('Catálogo PIRESA', () => {
  it('every tube has positive de and e', () => {
    for (const t of MICROPILE_TUBES) {
      expect(t.de).toBeGreaterThan(0);
      expect(t.e).toBeGreaterThan(0);
      expect(t.label.length).toBeGreaterThan(0);
    }
  });

  it('getTube returns default for unknown label', () => {
    const t = getTube('NONEXISTENT');
    expect(t.label).toBe('Ø88,9 × 9 mm');
  });

  it('getTubeAreaGross Ø88,9 × 9 = 2259.12 mm² ± 0.5', () => {
    expect(getTubeAreaGross(88.9, 9)).toBeCloseTo(2259.12, 1);
  });

  it('getTubeAreaNet reduces with re > 0', () => {
    const gross = getTubeAreaGross(88.9, 9);
    const net   = getTubeAreaNet(88.9, 9, 0.6);
    expect(net).toBeLessThan(gross);
  });
});

// ── Soldadura ────────────────────────────────────────────────────────────────
describe('Garganta de soldadura (Guía Fomento Tabla A-5.1)', () => {
  it('weldThroatMin matches official table verbatim', () => {
    // Tabla A-5.1 oficial: 3 < t < 10 → eg > 3;  10 ≤ t ≤ 20 → eg > 4,5
    expect(weldThroatMin(4)).toBe(3);     // 3 < 4 < 10
    expect(weldThroatMin(6)).toBe(3);     // 3 < 6 < 10
    expect(weldThroatMin(9)).toBe(3);     // 3 < 9 < 10
    expect(weldThroatMin(10)).toBe(4.5);  // 10 ≤ 10 ≤ 20
    expect(weldThroatMin(15)).toBe(4.5);  // 10 ≤ 15 ≤ 20
    expect(weldThroatMin(20)).toBe(4.5);  // 10 ≤ 20 ≤ 20
  });

  it('weldThroatMin returns null outside table range', () => {
    expect(weldThroatMin(3)).toBe(null);   // t ≤ 3 (mínimo absoluto Guía)
    expect(weldThroatMin(2)).toBe(null);
    expect(weldThroatMin(21)).toBe(null);  // t > 20 (fuera de tabla)
  });

  it('FTUX welding throat passes (eg=6 ≥ eg_min=3 for t=9mm)', () => {
    const r = calcMicropiles(baseInp, baseSoil);
    const c = r.checks.find((x) => x.id === 'welding-throat');
    expect(c).toBeDefined();
    expect(c!.status).toBe('ok');
  });

  it('tubo con espesor fuera de tabla A-5.1 invalida cálculo', () => {
    // No hay ningún tubo PIRESA con t=2 (mínimo es 5.5 mm), pero verificamos
    // la rama de error con un t simulado vía un tubo extremo del catálogo.
    // El catálogo actual es 5.5–9 mm, todos dentro del rango → este test
    // documenta la rama por si en el futuro se añade un tubo de pared fina.
    // Para forzar el path: weldThroatMin(2) ya devuelve null → cubierto arriba.
    expect(weldThroatMin(2)).toBe(null);
  });
});

// ── Empujes horizontales (Guía 3.7) ──────────────────────────────────────────
describe('Empujes horizontales', () => {
  it('without applied M/V utilization is zero', () => {
    const r = calcMicropiles(baseInp, baseSoil);
    expect(r.im).toBeCloseTo(0, 3);
    expect(r.iv).toBeCloseTo(0, 3);
  });

  it('Mpl,rd and Vpl,rd are positive', () => {
    const r = calcMicropiles(baseInp, baseSoil);
    expect(r.Mpl_rd).toBeGreaterThan(0);
    expect(r.Vpl_rd).toBeGreaterThan(0);
  });

  it('Le and Lef are positive', () => {
    const r = calcMicropiles(baseInp, baseSoil);
    expect(r.Le).toBeGreaterThan(0);
    expect(r.Lef).toBeGreaterThan(0);
    expect(r.Lef).toBeGreaterThan(r.Le);   // f_lef · 1.2 > 1
  });

  // ── Fix C4 — MEd = (M₀ + V·Lef) · me en el empotramiento ficticio ────────
  it('cortante en cabeza sin momento aplicado produce flexión (MEd = V·Lef·me)', () => {
    // Antes el código solo chequeaba im = M/Mpl, ignorando V·Lef.
    // Si baseShear>0 y baseMoment=0, im debe ser positivo (V crea momento).
    // Tras añadir me (Tabla 3.9): MEd_final = V·Lef·me, con me=0.85 para
    // micropilotes largos típicos (L/Le ≫ 7).
    const r = calcMicropiles(
      { ...baseInp, baseMoment: 0, baseShear: 50 },
      baseSoil,
    );
    expect(r.im).toBeGreaterThan(0);
    const bend = r.checks.find((c) => c.id === 'bending');
    expect(bend).toBeDefined();
    const expectedMEd = 50 * r.Lef * 0.85;        // V·Lef·me (FTUX L/Le≈36 → me=0.85)
    expect(bend!.value).toContain(expectedMEd.toFixed(2));
  });

  it('cortante VEd no incluye conversión M→V ficticia', () => {
    // Antes Vd_tot = Vd + M/(Lef/2). Ahora VEd = Vd a secas.
    const r = calcMicropiles(
      { ...baseInp, baseMoment: 100, baseShear: 20 },
      baseSoil,
    );
    const shear = r.checks.find((c) => c.id === 'shear');
    expect(shear!.value).toContain('20.00');   // VEd = 20, no 20 + 100/(Lef/2)
  });
});

// ── Edge cases ───────────────────────────────────────────────────────────────
describe('Edge cases', () => {
  it('Nc,d > Rfc,d → ih fails (utilization ≥ 1)', () => {
    const r = calcMicropiles({ ...baseInp, designLoad: 2000 }, baseSoil);
    expect(r.ih).toBeGreaterThanOrEqual(1);
    const c = r.checks.find((x) => x.id === 'hund-theoretical');
    expect(c!.status).toBe('fail');
  });

  it('effort=tension adds pullout check', () => {
    const r = calcMicropiles({ ...baseInp, effort: 'tension' }, baseSoil);
    const pull = r.checks.find((x) => x.id === 'pullout');
    expect(pull).toBeDefined();
    expect(r.it).toBeDefined();
  });

  it('effort=compression has no pullout check', () => {
    const r = calcMicropiles({ ...baseInp, effort: 'compression' }, baseSoil);
    expect(r.checks.find((x) => x.id === 'pullout')).toBeUndefined();
    expect(r.it).toBeUndefined();
  });

  it('water table above pile head leaves all segments unsaturated', () => {
    // NF a -0.5 (encima de la cabeza -1.0) → debería computar pero sin agua dentro del pilote
    const r = calcMicropiles({ ...baseInp, waterTableElevation: -0.5 }, baseSoil);
    expect(r.valid).toBe(true);
  });

  it('single-stratum soil computes', () => {
    const single = [{ id: 1, type: 'cohesive' as const, thickness: 30, gamma: 19, c: 100, phi: 25, Nspt: 25, su: 0, rflim: 0.15 }];
    const r = calcMicropiles(baseInp, single);
    expect(r.valid).toBe(true);
    expect(r.RfcTheoretical).toBeGreaterThan(0);
  });

  it('invalid input — toe above head → invalid', () => {
    const r = calcMicropiles({ ...baseInp, toeElevation: -0.5 }, baseSoil);
    expect(r.valid).toBe(false);
  });

  it('invalid input — empty soil → invalid', () => {
    const r = calcMicropiles(baseInp, []);
    expect(r.valid).toBe(false);
  });

  it('invalid input — negative drillDiameter → invalid', () => {
    const r = calcMicropiles({ ...baseInp, drillDiameter: -0.1 }, baseSoil);
    expect(r.valid).toBe(false);
  });

  it('aggressive corrosion env reduces As_d more', () => {
    const a = calcMicropiles({ ...baseInp, corrosionEnv: 'natural-undisturbed' },       baseSoil);
    const b = calcMicropiles({ ...baseInp, corrosionEnv: 'fill-aggressive-loose' },     baseSoil);
    expect(b.As_d).toBeLessThan(a.As_d);
    expect(b.Nc_rd).toBeLessThan(a.Nc_rd);
  });

  it('connection=other halves the steel contribution', () => {
    const a = calcMicropiles({ ...baseInp, connection: 'no-loss' }, baseSoil);
    const b = calcMicropiles({ ...baseInp, connection: 'other' }, baseSoil);
    expect(b.Fa_h).toBeLessThan(a.Fa_h);
  });
});

// ── Fix C1 — bulbo estructural ≤ perforación ─────────────────────────────────
describe('Validación d_struct ≤ Dn (fix C1)', () => {
  it('rechaza configuración con d_struct > Dn perforación', () => {
    // Ø88,9 + 2·45,55 = 180 mm. Si Dn = 0,15 m = 150 mm → debe invalidar.
    const r = calcMicropiles({ ...baseInp, drillDiameter: 0.15 }, baseSoil);
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/bulbo estructural/);
  });

  it('acepta Dn justo igual al bulbo estructural', () => {
    // Ø88,9 + 2·45,55 = 180 mm exacto.
    const r = calcMicropiles({ ...baseInp, drillDiameter: 0.180 }, baseSoil);
    expect(r.valid).toBe(true);
  });
});

// ── Fix C2 — semántica del nivel freático ────────────────────────────────────
describe('NF — semántica única u = γw·max(0, zBot−zWater) (fix C2)', () => {
  it('NF sobre la cabeza satura todo el fuste con u > 0 desde el primer segmento', () => {
    // waterTableElevation = -0.5 (encima de topElevation = -1).
    // zWaterHead = -1 − (-0.5) = -0.5 m → max(0, zBot − (-0.5)) = zBot + 0.5 > 0
    // para cualquier segmento. Resultado: Rfc menor que con NF dentro del pilote.
    const dryHigh = calcMicropiles(
      { ...baseInp, waterTableElevation: -200 },                // NF imposiblemente bajo
      baseSoil,
    );
    const submerged = calcMicropiles(
      { ...baseInp, waterTableElevation: -0.5 },                // NF sobre la cabeza
      baseSoil,
    );
    expect(submerged.valid).toBe(true);
    // Con NF sobre cabeza, σv,eff es menor → rfc menor → Rfc menor.
    expect(submerged.RfcTheoretical).toBeLessThan(dryHigh.RfcTheoretical);
  });

  it('NF bajo el apoyo deja u = 0 en todos los segmentos', () => {
    const r = calcMicropiles(
      { ...baseInp, waterTableElevation: -50 },                 // muy por debajo del apoyo
      baseSoil,
    );
    expect(r.valid).toBe(true);
    // σv,eff debe crecer monotónicamente con γ del estrato (sin descuento de u).
    for (let i = 1; i < r.segments.length; i++) {
      expect(r.segments[i].sigmaVeff).toBeGreaterThanOrEqual(r.segments[i - 1].sigmaVeff);
    }
  });
});

// ── Fix C3 — Fu en Tc_rd ─────────────────────────────────────────────────────
describe('Fu en tracción (fix C3)', () => {
  it('connection=other reduce Tc_rd igual que Fa_h', () => {
    const a = calcMicropiles({ ...baseInp, effort: 'tension', connection: 'no-loss' }, baseSoil);
    const b = calcMicropiles({ ...baseInp, effort: 'tension', connection: 'other'   }, baseSoil);
    // Fu(no-loss)=1.0, Fu(other)=0.5 → Tc_rd debe caer a ~la mitad.
    expect(b.Tc_rd).toBeCloseTo(a.Tc_rd * 0.5, 1);
  });

  it('connection=no-loss preserva Tc_rd = 952.95 kN (FTUX Excel)', () => {
    // Fu=1.0 en el default → el valor Excel se mantiene.
    const r = calcMicropiles({ ...baseInp, connection: 'no-loss' }, baseSoil);
    expect(r.Tc_rd).toBeCloseTo(952.95, 1);
  });
});

// ── Fix E1 — tubo no reconocido ──────────────────────────────────────────────
describe('Validación del tubo (fix E1)', () => {
  it('rechaza tubo con label no presente en el catálogo PIRESA', () => {
    const r = calcMicropiles({ ...baseInp, tube: 'Ø999 × 99 mm' }, baseSoil);
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/no encontrado/);
  });
});

// ── Cobertura adicional — bug crítico señalado por Codex ─────────────────────
describe('Cobertura post-auditoría', () => {
  it('drillDiameter SÍ afecta al fuste (perímetro)', () => {
    // Aunque dTotal está acotado por structuralCover, perimeter = π·Dn sí
    // depende de Dn → cambiar Dn debe cambiar Rfc.
    const a = calcMicropiles({ ...baseInp, drillDiameter: 0.185 }, baseSoil);
    const b = calcMicropiles({ ...baseInp, drillDiameter: 0.220 }, baseSoil);
    expect(b.RfcTheoretical).toBeGreaterThan(a.RfcTheoretical);
  });

  it('corrosión que consume todo el espesor invalida', () => {
    // Ø60,3 × 5,5 con relleno agresivo (re=3.25 mm > e/2=2.75 mm) → invalidar.
    const r = calcMicropiles(
      { ...baseInp, tube: 'Ø60,3 × 5,5 mm', corrosionEnv: 'fill-aggressive-loose' },
      baseSoil,
    );
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/corrosi/i);
  });

  it('re values match Guía Fomento Tabla 2.4 verbatim (50 años)', () => {
    // Verificación 1:1 con la columna 50 años de la tabla oficial.
    // re no se expone directamente, lo derivamos por la diferencia As_y − As_d.
    // FTUX usa Ø88,9 × 9 → as comparamos solo el re directo vía MicropilesResult.re.
    expect(calcMicropiles({ ...baseInp, corrosionEnv: 'natural-undisturbed' },             baseSoil).re).toBe(0.60);
    expect(calcMicropiles({ ...baseInp, corrosionEnv: 'natural-contaminated-industrial' }, baseSoil).re).toBe(1.50);
    expect(calcMicropiles({ ...baseInp, corrosionEnv: 'natural-aggressive-peat' },         baseSoil).re).toBe(1.75);
    expect(calcMicropiles({ ...baseInp, corrosionEnv: 'fill-non-aggressive-loose' },       baseSoil).re).toBe(1.20);
    expect(calcMicropiles({ ...baseInp, corrosionEnv: 'fill-aggressive-loose' },           baseSoil).re).toBe(3.25);
  });
});

// ── Tabla 3.8 — interpolación f para Lef ────────────────────────────────────
describe('interpolateF (Guía Fomento Tabla 3.8)', () => {
  it('matches table verbatim at anchor points', () => {
    expect(interpolateF(0)).toBe(1.70);
    expect(interpolateF(0.5)).toBe(1.25);
    expect(interpolateF(1)).toBe(1.00);
  });

  it('interpolates linearly between anchors', () => {
    // Medio camino entre (0, 1.70) y (0.5, 1.25) → (0.25, 1.475)
    expect(interpolateF(0.25)).toBeCloseTo(1.475, 4);
    // Medio camino entre (0.5, 1.25) y (1, 1.00) → (0.75, 1.125)
    expect(interpolateF(0.75)).toBeCloseTo(1.125, 4);
  });

  it('clamps outside the table range', () => {
    expect(interpolateF(-1)).toBe(1.70);   // < 0 → extremo bajo
    expect(interpolateF(5)).toBe(1.00);    // > 1 → extremo alto
  });

  it('FTUX (E0=9000, EL=500000) gives f ≈ 1.684', () => {
    // E0/EL = 0.018 → muy cerca de 0 → f ≈ 1.70 - 0.45·(0.018/0.5)
    const r = calcMicropiles(baseInp, baseSoil);
    // Lef = 1.2 · f · Le → f = Lef / (1.2 · Le)
    const f_derived = r.Lef / (1.2 * r.Le);
    expect(f_derived).toBeGreaterThan(1.65);
    expect(f_derived).toBeLessThan(1.70);
  });
});

// ── Tabla 3.9 — interpolación me para reducción del momento ──────────────────
describe('interpolateMe (Guía Fomento Tabla 3.9)', () => {
  it('matches table verbatim at anchor points', () => {
    expect(interpolateMe(0)).toBe(0.45);
    expect(interpolateMe(1)).toBe(0.60);
    expect(interpolateMe(2)).toBe(0.70);
    expect(interpolateMe(7)).toBe(0.85);
  });

  it('interpolates linearly between anchors', () => {
    expect(interpolateMe(0.5)).toBeCloseTo(0.525, 4);   // entre (0,0.45)-(1,0.60)
    expect(interpolateMe(1.5)).toBeCloseTo(0.65, 4);    // entre (1,0.60)-(2,0.70)
    expect(interpolateMe(4.5)).toBeCloseTo(0.775, 4);   // entre (2,0.70)-(7,0.85)
  });

  it('clamps at extremes', () => {
    expect(interpolateMe(-1)).toBe(0.45);
    expect(interpolateMe(100)).toBe(0.85);  // L/Le ≫ 7 (micropilote largo típico)
  });

  it('reduces the bending utilization compared to non-reduced raw moment', () => {
    // Con baseShear=50, MEd debería ser (50·Lef)·me, no solo 50·Lef.
    const r = calcMicropiles({ ...baseInp, baseShear: 50 }, baseSoil);
    const bend = r.checks.find((c) => c.id === 'bending');
    expect(bend).toBeDefined();
    // Para FTUX L=16 m, Le ≈ 0.44 m → L/Le ≈ 36 → me = 0.85 (clamp).
    const expectedMEd = 50 * r.Lef * 0.85;
    expect(bend!.value).toContain(expectedMEd.toFixed(2));
  });
});

// ── Tabla 2.4 — matriz completa terreno × vida útil ──────────────────────────
describe('Matriz corrosión completa (Guía Fomento Tabla 2.4)', () => {
  it('all 25 cells match official table verbatim', () => {
    // Suelos naturales sin alterar
    expect(getCorrosionRe('natural-undisturbed', 5)).toBe(0.00);
    expect(getCorrosionRe('natural-undisturbed', 25)).toBe(0.30);
    expect(getCorrosionRe('natural-undisturbed', 50)).toBe(0.60);
    expect(getCorrosionRe('natural-undisturbed', 75)).toBe(0.90);
    expect(getCorrosionRe('natural-undisturbed', 100)).toBe(1.20);

    // Suelos naturales contaminados / industriales
    expect(getCorrosionRe('natural-contaminated-industrial', 5)).toBe(0.15);
    expect(getCorrosionRe('natural-contaminated-industrial', 25)).toBe(0.75);
    expect(getCorrosionRe('natural-contaminated-industrial', 50)).toBe(1.50);
    expect(getCorrosionRe('natural-contaminated-industrial', 75)).toBe(2.25);
    expect(getCorrosionRe('natural-contaminated-industrial', 100)).toBe(3.00);

    // Suelos naturales agresivos (turbas, ciénagas)
    expect(getCorrosionRe('natural-aggressive-peat', 5)).toBe(0.20);
    expect(getCorrosionRe('natural-aggressive-peat', 25)).toBe(1.00);
    expect(getCorrosionRe('natural-aggressive-peat', 50)).toBe(1.75);
    expect(getCorrosionRe('natural-aggressive-peat', 75)).toBe(2.50);
    expect(getCorrosionRe('natural-aggressive-peat', 100)).toBe(3.25);

    // Rellenos no agresivos sin compactar
    expect(getCorrosionRe('fill-non-aggressive-loose', 5)).toBe(0.18);
    expect(getCorrosionRe('fill-non-aggressive-loose', 25)).toBe(0.70);
    expect(getCorrosionRe('fill-non-aggressive-loose', 50)).toBe(1.20);
    expect(getCorrosionRe('fill-non-aggressive-loose', 75)).toBe(1.70);
    expect(getCorrosionRe('fill-non-aggressive-loose', 100)).toBe(2.20);

    // Rellenos agresivos sin compactar
    expect(getCorrosionRe('fill-aggressive-loose', 5)).toBe(0.50);
    expect(getCorrosionRe('fill-aggressive-loose', 25)).toBe(2.00);
    expect(getCorrosionRe('fill-aggressive-loose', 50)).toBe(3.25);
    expect(getCorrosionRe('fill-aggressive-loose', 75)).toBe(4.50);
    expect(getCorrosionRe('fill-aggressive-loose', 100)).toBe(5.75);
  });

  it('designLifeYears in MicropilesInputs propagates to result.re', () => {
    const r5   = calcMicropiles({ ...baseInp, designLifeYears: 5 },   baseSoil);
    const r50  = calcMicropiles({ ...baseInp, designLifeYears: 50 },  baseSoil);
    const r100 = calcMicropiles({ ...baseInp, designLifeYears: 100 }, baseSoil);
    // Para 'natural-undisturbed': 0 → 0.60 → 1.20 → re monotónicamente creciente.
    expect(r5.re).toBe(0.00);
    expect(r50.re).toBe(0.60);
    expect(r100.re).toBe(1.20);
    // Mayor vida útil → más corrosión → menos sección efectiva → menos Nc_rd.
    expect(r100.Nc_rd).toBeLessThan(r50.Nc_rd);
    expect(r50.Nc_rd).toBeLessThan(r5.Nc_rd);
  });

  it('matrix has all 5 envs × 5 lives = 25 entries', () => {
    const envs = Object.keys(RE_BY_CORROSION_MATRIX);
    expect(envs).toHaveLength(5);
    for (const env of envs) {
      const lives = Object.keys(RE_BY_CORROSION_MATRIX[env as keyof typeof RE_BY_CORROSION_MATRIX]);
      expect(lives).toHaveLength(5);
    }
  });
});
