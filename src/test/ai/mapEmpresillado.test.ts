// Tests del adapter empresillado (src/lib/ai/modules/empresillado.ts, ola 1):
// unidades MIXTAS (cm salvo tp en mm), catálogo de 45 angulares, invariante
// s > lp (todo-o-nada sobre el estado combinado) y la regla de seguridad
// INVERTIDA de la rehabilitación: bc/hc son medidas del pilar EXISTENTE, así que
// lo peligroso es AGRANDARLOS (lowerIsSafer), mientras el refuerzo es diseño libre.
//
// current = empresalladoDefaults: 30×30 cm · L=3 m · N=500 · Mx=20 · My=10 ·
// Vd=0 · L100x10 · fy=275 · βx=βy=0.5 · s=40 · lp=12 · bp=10 cm · tp=10 mm.

import { describe, it, expect } from 'vitest';
import {
  empresalladoAdapter,
  summarizeEmpresalladoResults,
  S_GT_LP_REASON,
} from '../../lib/ai/modules/empresillado';
import type { AiApplyPlan } from '../../lib/ai/modules/types';
import { AiError } from '../../lib/ai/types';
import { empresalladoDefaults, type EmpresalladoInputs } from '../../data/defaults';
import { calcEmpresillado } from '../../lib/calculations/empresillado';

const SYSTEM = 'si' as const;
const ALREADY = 'Ya coincide con el valor actual';

interface Payload {
  bc_cm: number | null; hc_cm: number | null; L_m: number | null;
  N_Ed_kN: number | null; Mx_kNm: number | null; My_kNm: number | null; Vd_kN: number | null;
  perfil: string | null; fy_MPa: number | null;
  beta_x: number | null; beta_y: number | null;
  s_cm: number | null; lp_cm: number | null; bp_cm: number | null; tp_mm: number | null;
  warnings: string[];
}

function makePayload(partial: Partial<Payload> = {}): Payload {
  return {
    bc_cm: null, hc_cm: null, L_m: null,
    N_Ed_kN: null, Mx_kNm: null, My_kNm: null, Vd_kN: null,
    perfil: null, fy_MPa: null, beta_x: null, beta_y: null,
    s_cm: null, lp_cm: null, bp_cm: null, tp_mm: null,
    warnings: [],
    ...partial,
  };
}

function plan(
  partial: Partial<Payload> = {},
  current: EmpresalladoInputs = empresalladoDefaults,
): AiApplyPlan<EmpresalladoInputs> {
  return empresalladoAdapter.buildPlan(makePayload(partial), current, SYSTEM);
}

const changeFor = (p: AiApplyPlan<EmpresalladoInputs>, label: string) =>
  p.changes.find((c) => c.label === label);
const skipFor = (p: AiApplyPlan<EmpresalladoInputs>, label: string) =>
  p.skipped.find((s) => s.label === label);
const riskFor = (p: AiApplyPlan<EmpresalladoInputs>, field: string) =>
  p.risks.find((r) => r.field === field);

describe('empresillado adapter — parseo defensivo', () => {
  it('payload no-objeto → AiError', () => {
    expect(() => empresalladoAdapter.buildPlan(null, empresalladoDefaults, SYSTEM)).toThrow(AiError);
  });
});

describe('empresillado adapter — unidades mixtas (cm salvo tp en mm)', () => {
  it('el pilar y las presillas van en cm, sin conversión', () => {
    const p = plan({ bc_cm: 40, hc_cm: 50, bp_cm: 12 });
    expect(p.fields).toMatchObject({ bc: 40, hc: 50, bp: 12 });
    expect(changeFor(p, 'Ancho del pilar existente bc')).toMatchObject({ before: '30 cm', after: '40 cm' });
  });

  it('tp va en mm (el único de las presillas)', () => {
    const p = plan({ tp_mm: 12 });
    expect(p.fields.tp).toBe(12);
    expect(changeFor(p, 'Espesor de presilla tp')).toMatchObject({ before: '10 mm', after: '12 mm' });
  });

  it('tp fuera de rango (4–60 mm) → skip sin clamp', () => {
    expect(skipFor(plan({ tp_mm: 2 }), 'Espesor de presilla tp')?.reason).toContain('fuera del rango');
  });
});

describe('empresillado adapter — invariante s > lp (todo-o-nada)', () => {
  it('pareja incoherente (s ≤ lp) → se saltan AMBAS', () => {
    const p = plan({ s_cm: 15, lp_cm: 20 });
    expect(skipFor(p, 'Separación de presillas s')?.reason).toBe(S_GT_LP_REASON);
    expect(skipFor(p, 'Alto de presilla lp')?.reason).toBe(S_GT_LP_REASON);
    expect(p.fields.s).toBeUndefined();
    expect(p.fields.lp).toBeUndefined();
  });

  it('s propuesto que no supera el lp VIGENTE → skip (se evalúa el combinado)', () => {
    const p = plan({ s_cm: 10 }); // lp vigente = 12
    expect(skipFor(p, 'Separación de presillas s')?.reason).toBe(S_GT_LP_REASON);
  });

  it('pareja coherente → se aplican las dos', () => {
    const p = plan({ s_cm: 30, lp_cm: 15 });
    expect(p.fields).toMatchObject({ s: 30, lp: 15 });
  });

  it('juntar las presillas (menos s) es diseño legítimo: se aplica y no es riesgo', () => {
    const p = plan({ s_cm: 25 });
    expect(p.fields.s).toBe(25);
    expect(p.risks).toEqual([]);
  });
});

describe('empresillado adapter — catálogo de angulares', () => {
  it('angular inexistente → skip', () => {
    expect(skipFor(plan({ perfil: 'L200x20' }), 'Angular de los cordones')?.reason)
      .toContain('no está en el catálogo');
  });

  it('angular del catálogo → change con la etiqueta bonita', () => {
    const c = changeFor(plan({ perfil: 'L120x12' }), 'Angular de los cordones');
    expect(c).toMatchObject({ before: 'L 100×10', after: 'L 120×12' });
  });
});

describe('empresillado adapter — esfuerzos', () => {
  it('momento negativo → valor absoluto + warning (el motor toma |M|)', () => {
    const p = plan({ Mx_kNm: -35 });
    expect(p.fields.Mx_Ed).toBe(35);
    expect(p.warnings.join(' ')).toContain('valor absoluto');
  });

  it('Vd negativo → skip (el motor lo rechaza)', () => {
    expect(skipFor(plan({ Vd_kN: -5 }), 'Cortante Vd')?.reason).toContain('fuera del rango');
  });

  it('N_Ed igual al actual → ALREADY', () => {
    expect(skipFor(plan({ N_Ed_kN: 500 }), 'Axil N_Ed')?.reason).toBe(ALREADY);
  });
});

describe('empresillado adapter — seguridad: "lo existente es DATO" (regla invertida)', () => {
  it('AGRANDAR el pilar existente → riesgo (lowerIsSafer)', () => {
    const current: EmpresalladoInputs = { ...empresalladoDefaults, bc: 35 };
    const p = plan({ bc_cm: 50 }, current);
    expect(riskFor(p, 'bc')?.why).toContain('EXISTENTE');
    expect(riskFor(p, 'bc')?.why).toContain('medida de obra');
  });

  it('REDUCIR el pilar existente NO es riesgo (es el lado conservador)', () => {
    const current: EmpresalladoInputs = { ...empresalladoDefaults, hc: 40 };
    expect(plan({ hc_cm: 30 }, current).risks).toEqual([]);
  });

  it('agrandar el pilar desde el default no salta (gate anti-ruido: se está midiendo)', () => {
    expect(plan({ bc_cm: 45, hc_cm: 45 }).risks).toEqual([]);
  });

  it('rebajar esfuerzos fijados → riesgo', () => {
    const current: EmpresalladoInputs = { ...empresalladoDefaults, N_Ed: 900, Vd: 40 };
    expect(riskFor(plan({ N_Ed_kN: 300 }, current), 'N_Ed')).toBeDefined();
    expect(riskFor(plan({ Vd_kN: 5 }, current), 'Vd')).toBeDefined();
  });

  it('rebajar β sobre un valor fijado → riesgo', () => {
    const current: EmpresalladoInputs = { ...empresalladoDefaults, beta_x: 1.0 };
    expect(riskFor(plan({ beta_x: 0.5 }, current), 'beta_x')).toBeDefined();
  });

  it('reforzar (angular mayor, más acero, presillas más gruesas) NUNCA es riesgo', () => {
    const current: EmpresalladoInputs = { ...empresalladoDefaults, perfil: 'L80x8', fy: 275, tp: 8 };
    expect(plan({ perfil: 'L150x14', fy_MPa: 355, tp_mm: 15 }, current).risks).toEqual([]);
  });
});

describe('empresillado adapter — snapshot', () => {
  it('defaults → 15 claves sin confirmar', () => {
    const snap = JSON.parse(empresalladoAdapter.snapshot(empresalladoDefaults));
    expect(snap.valores.bc_cm).toBe(30);
    expect(snap.valores.tp_mm).toBe(10);
    expect(snap.valores.perfil).toBe('L100x10');
    expect(snap.sin_confirmar).toHaveLength(15);
  });
});

describe('empresillado adapter — resumen de resultados', () => {
  it('cálculo válido → veredicto + extras (cordón, segundo orden, pandeo global)', () => {
    const s = summarizeEmpresalladoResults(calcEmpresillado(empresalladoDefaults));
    expect(s.verdict).not.toBe('invalid');
    expect(s.text).toContain('Cordón más comprimido');
    expect(s.text).toContain('Segundo orden: MEd,II');
    expect(s.text).toContain('Pandeo global: χ');
  });

  it('s ≤ lp → invalid (error != null)', () => {
    const s = summarizeEmpresalladoResults(calcEmpresillado({ ...empresalladoDefaults, s: 10, lp: 12 }));
    expect(s.verdict).toBe('invalid');
    expect(s.text).toContain('CÁLCULO NO VÁLIDO');
  });
});
