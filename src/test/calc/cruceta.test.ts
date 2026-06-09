import { describe, it, expect } from 'vitest';
import { calcCruceta, sidesForPosition } from '../../lib/calculations/cruceta';
import { punchingDefaults, type PunchingInputs } from '../../data/defaults';

// Modo cruceta RECORTADO a "compañero de hand-calc" (2026-06-09): punzonamiento
// CONSERVADOR de la placa (reusa calcPunching en modo 'pilar') + clase/capacidades del
// UPN (informativo) + cabida del ala. El reparto lo verifica el ingeniero a mano, así
// que el verdict NO depende del u1 de la placa (informativo), solo de u0 (aplastamiento)
// + clase UPN + cabida.
const base: PunchingInputs = { ...punchingDefaults, mode: 'pilar-cruceta' };

describe('sidesForPosition', () => {
  it('interior=4, borde=3, esquina=2', () => {
    expect(sidesForPosition('interior')).toBe(4);
    expect(sidesForPosition('borde')).toBe(3);
    expect(sidesForPosition('esquina')).toBe(2);
  });
});

describe('cruceta (compañero de hand-calc)', () => {
  it('default válido; expone el detalle de cruceta', () => {
    const r = calcCruceta(base);
    expect(r.valid).toBe(true);
    expect(r.cruceta).toBeDefined();
    const c = r.cruceta!;
    expect(c.upnSize).toBe(160);
    expect(c.steelGrade).toBe('S275');
    expect(c.upnClass).toBeGreaterThanOrEqual(1);
    expect(c.upnClass).toBeLessThanOrEqual(3);   // gama soportada
    expect(c.MRd).toBeGreaterThan(0);            // capacidades UPN (informativo)
    expect(c.VplRd).toBeGreaterThan(0);
    expect(c.u0).toBeGreaterThan(0);             // perímetros de la PLACA (de calcPunching)
    expect(c.u1).toBeGreaterThan(c.u0);
    expect(c.nArms).toBe(4);                     // interior = 4 (display)
  });

  it('reusa el punzonamiento de la PLACA (placa = área cargada): u0 = 2(a+b)', () => {
    const r = calcCruceta(base);                 // placa 300×300, interior
    expect(r.cruceta!.u0).toBeCloseTo(2 * (300 + 300), 0);
  });

  it('placa sola que no pasa u1: ÁMBAR (no gris, no verde) y NO bloquea (de-gateado)', () => {
    // V alto: el u1 de la placa se supera (vEd > vRd,c) pero u0 (aplastamiento) aguanta.
    // De-gateado a warn: no hace fail (valid sigue true, el reparto lo rescata), pero se
    // muestra en ÁMBAR con su % real → el verdict NO sale verde fingiendo que cumple (H1).
    const r = calcCruceta({ ...base, VEd: 600 });
    const u1Check = r.checks.find((c) => c.id === 'punz-ved-vrdc');
    expect(u1Check, 'punz-ved-vrdc').toBeDefined();
    expect(u1Check!.status).toBe('warn');            // ámbar, NO neutral/gris
    expect(u1Check!.neutral).not.toBe(true);         // mantiene su barra de %
    expect(u1Check!.utilization).toBeGreaterThan(1); // la placa sola no pasa
    expect(u1Check!.description).toMatch(/reparto|mano/i);
    expect(r.valid).toBe(true);                       // de-gateado: no bloquea (hand-calc rescata)
  });

  it('u0 (aplastamiento en cara de placa) SÍ gatea el verdict', () => {
    // V muy alto: vEd,0 > vRd,max → aplastamiento en la placa → falla (real, sin reparto que valga).
    const r = calcCruceta({ ...base, VEd: 1200 });
    const crush = r.checks.find((c) => c.id === 'punz-ved-max');
    expect(crush!.status).toBe('fail');
    expect(r.valid).toBe(false);
  });

  it('clase de sección UPN presente; clase ≤ 3 no falla', () => {
    const r = calcCruceta(base);
    const cls = r.checks.find((c) => c.id === 'cru-class');
    expect(cls, 'cru-class').toBeDefined();
    expect(cls!.status).not.toBe('fail');
  });

  it('capacidades del UPN como fila informativa (neutral)', () => {
    const cap = calcCruceta(base).checks.find((c) => c.id === 'cru-upn-cap');
    expect(cap, 'cru-upn-cap').toBeDefined();
    expect(cap!.status).toBe('neutral');
  });
});

describe('cabida del ala en el hueco al borde', () => {
  it('borde: b ≤ hueco al borde — cabe (hueco grande) → no falla', () => {
    const r = calcCruceta({ ...base, position: 'borde', edgeY: 500, VEd: 120 });
    expect(r.checks.find((c) => c.id === 'cru-edge-fit')!.status).not.toBe('fail');
    expect(r.cruceta!.nArms).toBe(3);            // borde = 3 (display)
  });
  it('borde: b > hueco al borde → FALLA (UPN160 b=65 > 40)', () => {
    const r = calcCruceta({ ...base, position: 'borde', edgeY: 40, VEd: 120 });
    expect(r.checks.find((c) => c.id === 'cru-edge-fit')!.status).toBe('fail');
    expect(r.valid).toBe(false);
  });
  it('esquina: comprueba ambos huecos', () => {
    const r = calcCruceta({ ...base, position: 'esquina', edgeY: 500, edgeX: 40, VEd: 80 });
    expect(r.checks.find((c) => c.id === 'cru-edge-fit')!.status).not.toBe('fail');   // 65 ≤ 500
    expect(r.checks.find((c) => c.id === 'cru-edge-fit-2')!.status).toBe('fail');     // 65 > 40
    expect(r.valid).toBe(false);
    expect(r.cruceta!.nArms).toBe(2);            // esquina = 2 (display)
  });
});

describe('validación', () => {
  it('rechaza placa con dimensión ≤ 0', () => {
    expect(calcCruceta({ ...base, plateA: 0 }).valid).toBe(false);
    expect(calcCruceta({ ...base, plateA: 0 }).error).toMatch(/placa/i);
  });
  it('rechaza borde sin distancia al borde', () => {
    const r = calcCruceta({ ...base, position: 'borde', edgeY: 0 });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/borde/i);
  });
  it('rechaza esquina sin 2ª distancia', () => {
    expect(calcCruceta({ ...base, position: 'esquina', edgeY: 500, edgeX: 0 }).valid).toBe(false);
  });
  it('propaga el error de validación de la placa (d ≤ 0)', () => {
    const r = calcCruceta({ ...base, d: 0 });
    expect(r.valid).toBe(false);
    expect(r.error).toBeDefined();
  });
});
