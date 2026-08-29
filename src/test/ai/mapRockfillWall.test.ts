// Adapter IA de Muros de escollera y gaviones: gates de tipología y de phiMode,
// gates agua/sismo, rangos, y detección de riesgos de seguridad.

import { describe, expect, it } from 'vitest';
import {
  rockfillWallAdapter,
  ESCOLLERA_GATE_REASON,
  GAVION_GATE_REASON,
  PHI_DIRECTO_GATE_REASON,
  PHI_GUIA_GATE_REASON,
  WATER_GATE_REASON,
  SEISMIC_GATE_REASON,
} from '../../lib/ai/modules/rockfillWall';
import { rockfillWallDefaults, type RockfillWallInputs } from '../../data/defaults';

const base: RockfillWallInputs = { ...rockfillWallDefaults };

/** Payload con todo a null salvo lo indicado. */
function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const keys = (rockfillWallAdapter.payloadSchema as { required: string[] }).required;
  const p: Record<string, unknown> = {};
  for (const k of keys) p[k] = k === 'warnings' ? [] : null;
  return { ...p, ...overrides };
}

describe('mapRockfillWall — aplicación básica', () => {
  it('aplica geometría y terreno en SI', () => {
    const plan = rockfillWallAdapter.buildPlan(
      payload({ H_m: 5, a_m: 2.5, gammaSuelo_kNm3: 19, phiRelleno_deg: 32 }),
      base, 'si',
    );
    expect(plan.fields.H).toBe(5);
    expect(plan.fields.a).toBe(2.5);
    expect(plan.fields.gammaSuelo).toBe(19);
    expect(plan.fields.phiRelleno).toBe(32);
  });

  it('valor igual al actual → skipped ALREADY', () => {
    const plan = rockfillWallAdapter.buildPlan(payload({ H_m: base.H }), base, 'si');
    expect(plan.fields.H).toBeUndefined();
    expect(plan.skipped.some((s) => s.field === 'H_m')).toBe(true);
  });

  it('fuera de rango → skipped con motivo de rango', () => {
    const plan = rockfillWallAdapter.buildPlan(payload({ H_m: 50 }), base, 'si');
    expect(plan.fields.H).toBeUndefined();
    expect(plan.skipped.find((s) => s.field === 'H_m')?.reason).toMatch(/rango/);
  });
});

describe('gates de tipología', () => {
  it('en escollera, los campos de gaviones se saltan con motivo', () => {
    const plan = rockfillWallAdapter.buildPlan(
      payload({ stepCaja_m: 0.5, alphaBatter_deg: 8 }),
      base, 'si',
    );
    expect(plan.fields.stepCaja).toBeUndefined();
    expect(plan.skipped.find((s) => s.field === 'stepCaja_m')?.reason).toBe(GAVION_GATE_REASON);
    expect(plan.skipped.find((s) => s.field === 'alphaBatter_deg')?.reason).toBe(GAVION_GATE_REASON);
  });

  it('cambiar a gaviones en el MISMO payload abre su familia y cierra la de escollera', () => {
    const plan = rockfillWallAdapter.buildPlan(
      payload({ wallType: 'gaviones', stepCaja_m: 0.4, mIntra_h1v: 0.5 }),
      base, 'si',
    );
    expect(plan.fields.wallType).toBe('gaviones');
    expect(plan.fields.stepCaja).toBe(0.4);
    expect(plan.fields.mIntra).toBeUndefined();
    expect(plan.skipped.find((s) => s.field === 'mIntra_h1v')?.reason).toBe(ESCOLLERA_GATE_REASON);
  });

  it('altura de caja no estándar se rechaza', () => {
    const plan = rockfillWallAdapter.buildPlan(
      payload({ wallType: 'gaviones', hCaja_m: 0.7 }),
      base, 'si',
    );
    expect(plan.fields.hCaja).toBeUndefined();
    expect(plan.skipped.find((s) => s.field === 'hCaja_m')?.reason).toMatch(/no estándar/);
  });
});

describe('gates de phiMode', () => {
  it("en 'directo', litología y Δφe se saltan", () => {
    const plan = rockfillWallAdapter.buildPlan(
      payload({ litologia: 'granito', dPhiE_deg: 2 }),
      base, 'si',
    );
    expect(plan.fields.litologia).toBeUndefined();
    expect(plan.skipped.find((s) => s.field === 'litologia')?.reason).toBe(PHI_GUIA_GATE_REASON);
  });

  it("cambiar a 'guia' en el mismo payload abre litología y cierra φ directo", () => {
    const plan = rockfillWallAdapter.buildPlan(
      payload({ phiMode: 'guia', litologia: 'granito', phi_deg: 42 }),
      base, 'si',
    );
    expect(plan.fields.phiMode).toBe('guia');
    expect(plan.fields.litologia).toBe('granito');
    expect(plan.fields.phi).toBeUndefined();
    expect(plan.skipped.find((s) => s.field === 'phi_deg')?.reason).toBe(PHI_DIRECTO_GATE_REASON);
  });
});

describe('gates de agua y sismo', () => {
  it('hw sin hasWater se salta', () => {
    const plan = rockfillWallAdapter.buildPlan(payload({ hw_m: 2 }), base, 'si');
    expect(plan.fields.hw).toBeUndefined();
    expect(plan.skipped.find((s) => s.field === 'hw_m')?.reason).toBe(WATER_GATE_REASON);
  });

  it('S sin Ab se salta; con Ab en el mismo payload se aplica', () => {
    const p1 = rockfillWallAdapter.buildPlan(payload({ S: 1.3 }), base, 'si');
    expect(p1.skipped.find((s) => s.field === 'S')?.reason).toBe(SEISMIC_GATE_REASON);
    const p2 = rockfillWallAdapter.buildPlan(payload({ Ab: 0.12, S: 1.3 }), base, 'si');
    expect(p2.fields.Ab).toBe(0.12);
    expect(p2.fields.S).toBe(1.3);
  });
});

describe('riesgos de seguridad', () => {
  // Gate anti-ruido: el riesgo solo salta sobre un valor ESTABLECIDO (distinto
  // del default de fábrica, o confirmado en el hilo). Se parte de valores ≠ default.
  it('subir σadm es riesgo (lowerIsSafer)', () => {
    const plan = rockfillWallAdapter.buildPlan(
      payload({ sigmaAdm_kPa: 400 }),
      { ...base, sigmaAdm: 150 }, 'si',
    );
    expect(plan.risks.some((r) => r.field === 'sigmaAdm')).toBe(true);
  });

  it('subir γap del muro es riesgo (el peso propio es la resistencia)', () => {
    const plan = rockfillWallAdapter.buildPlan(
      payload({ gammaAp_kNm3: 22 }),
      { ...base, gammaAp: 17 }, 'si',
    );
    expect(plan.risks.some((r) => r.field === 'gammaAp')).toBe(true);
  });

  it('activar contacto mejorado es riesgo SIEMPRE (alwaysCheck)', () => {
    const plan = rockfillWallAdapter.buildPlan(
      payload({ contactoMejorado: true }),
      base, 'si',
    );
    expect(plan.fields.contactoMejorado).toBe(true);
    expect(plan.risks.some((r) => r.field === 'contactoMejorado')).toBe(true);
  });

  it('bajar γap no es riesgo (dirección conservadora)', () => {
    const plan = rockfillWallAdapter.buildPlan(
      payload({ gammaAp_kNm3: 16 }),
      { ...base, gammaAp: 19 }, 'si',
    );
    expect(plan.fields.gammaAp).toBe(16);
    expect(plan.risks.some((r) => r.field === 'gammaAp')).toBe(false);
  });
});

describe('snapshot', () => {
  it('serializa valores y marca los no confirmados', () => {
    const snap = JSON.parse(rockfillWallAdapter.snapshot(base)) as {
      valores: Record<string, unknown>;
      sin_confirmar: string[];
    };
    expect(snap.valores.wallType).toBe('escollera');
    expect(snap.valores.H_m).toBe(base.H);
    // Todo default de fábrica → sin confirmar
    expect(snap.sin_confirmar).toContain('H_m');
    const touched = { ...base, H: 6.2 };
    const snap2 = JSON.parse(rockfillWallAdapter.snapshot(touched)) as { sin_confirmar: string[] };
    expect(snap2.sin_confirmar).not.toContain('H_m');
  });
});
