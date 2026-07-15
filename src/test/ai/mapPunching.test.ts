// Tests del adapter punching (src/lib/ai/modules/punching.ts, ola 1): TRES MODOS
// con campos inertes (cruceta fuerza cx/cy/isCircular/cercos; los modos de losa
// no usan el bloque de cruceta), gate de posición (isCircular solo interior;
// bordes solo borde/esquina), gate de cercos, y las reglas de seguridad
// calibradas con el β real de betaForPosition (posición y modo).
//
// current = punchingDefaults: modo pilar · interior · 300×300 · d=200 · HA-25 ·
// B500 · Ø12/150 arriba y abajo · VEd=260 · sin cercos · cruceta HEB200 +
// placa 300×300 + UPN160 + edgeY=edgeX=500.

import { describe, it, expect } from 'vitest';
import {
  punchingAdapter,
  summarizePunchingResults,
  CRUCETA_INERT_REASON,
  SLAB_INERT_REASON,
  CIRCULAR_POSITION_REASON,
  SHEAR_REINF_GATE_REASON,
  EDGE_POSITION_REASON,
} from '../../lib/ai/modules/punching';
import type { AiApplyPlan } from '../../lib/ai/modules/types';
import { AiError } from '../../lib/ai/types';
import { punchingDefaults, type PunchingInputs } from '../../data/defaults';
import { calcPunching } from '../../lib/calculations/punching';

const SYSTEM = 'si' as const;
const ALREADY = 'Ya coincide con el valor actual';

interface Payload {
  mode: string | null; position: string | null; isCircular: boolean | null;
  cx_mm: number | null; cy_mm: number | null; d_mm: number | null;
  fck_MPa: number | null; fyk_MPa: number | null;
  barDiamSup_mm: number | null; sSup_mm: number | null;
  barDiamInf_mm: number | null; sInf_mm: number | null;
  VEd_kN: number | null; hasShearReinf: boolean | null;
  swDiam_mm: number | null; swLegs: number | null; sr_mm: number | null; fywk_MPa: number | null;
  colType: string | null; colSize: number | null;
  plateA_mm: number | null; plateB_mm: number | null;
  steelGrade: string | null; upnSize: number | null; weldThroat_mm: number | null;
  edgeY_mm: number | null; edgeX_mm: number | null;
  warnings: string[];
}

function makePayload(partial: Partial<Payload> = {}): Payload {
  return {
    mode: null, position: null, isCircular: null,
    cx_mm: null, cy_mm: null, d_mm: null,
    fck_MPa: null, fyk_MPa: null,
    barDiamSup_mm: null, sSup_mm: null, barDiamInf_mm: null, sInf_mm: null,
    VEd_kN: null, hasShearReinf: null,
    swDiam_mm: null, swLegs: null, sr_mm: null, fywk_MPa: null,
    colType: null, colSize: null, plateA_mm: null, plateB_mm: null,
    steelGrade: null, upnSize: null, weldThroat_mm: null,
    edgeY_mm: null, edgeX_mm: null,
    warnings: [],
    ...partial,
  };
}

function plan(
  partial: Partial<Payload> = {},
  current: PunchingInputs = punchingDefaults,
): AiApplyPlan<PunchingInputs> {
  return punchingAdapter.buildPlan(makePayload(partial), current, SYSTEM);
}

const changeFor = (p: AiApplyPlan<PunchingInputs>, label: string) =>
  p.changes.find((c) => c.label === label);
const skipFor = (p: AiApplyPlan<PunchingInputs>, label: string) =>
  p.skipped.find((s) => s.label === label);
const riskFor = (p: AiApplyPlan<PunchingInputs>, field: string) =>
  p.risks.find((r) => r.field === field);

const CRUCETA: PunchingInputs = { ...punchingDefaults, mode: 'pilar-cruceta' };

describe('punching adapter — parseo defensivo', () => {
  it('payload no-objeto → AiError', () => {
    expect(() => punchingAdapter.buildPlan(7, punchingDefaults, SYSTEM)).toThrow(AiError);
  });
});

describe('punching adapter — modos de losa (pilar / carga puntual)', () => {
  it('aplica geometría, armado y esfuerzo', () => {
    const p = plan({ cx_mm: 400, cy_mm: 350, d_mm: 250, VEd_kN: 500 });
    expect(p.fields).toMatchObject({ cx: 400, cy: 350, d: 250, VEd: 500 });
    expect(changeFor(p, 'Canto útil d')).toMatchObject({ before: '200 mm', after: '250 mm' });
  });

  it('los campos de la cruceta se saltan con motivo', () => {
    const p = plan({ colType: 'HEA', plateA_mm: 400, upnSize: 200, edgeY_mm: 300 });
    expect(skipFor(p, 'Perfil del pilar (cruceta)')?.reason).toBe(SLAB_INERT_REASON);
    expect(skipFor(p, 'Ancho de la placa a')?.reason).toBe(SLAB_INERT_REASON);
    expect(skipFor(p, 'Perfil UPN')?.reason).toBe(SLAB_INERT_REASON);
    expect(skipFor(p, 'Distancia al borde libre')?.reason).toBe(SLAB_INERT_REASON);
    expect(p.fields).toEqual({});
  });

  it('fck fuera de catálogo → skip; del catálogo → change', () => {
    expect(skipFor(plan({ fck_MPa: 55 }), 'Hormigón fck')?.reason).toContain('no está en el catálogo');
    expect(plan({ fck_MPa: 30 }).fields.fck).toBe(30);
  });

  it('valor igual al actual → skip ALREADY (nunca se aplica en silencio)', () => {
    expect(skipFor(plan({ VEd_kN: 260 }), 'Esfuerzo VEd')?.reason).toBe(ALREADY);
    expect(skipFor(plan({ d_mm: 200 }), 'Canto útil d')?.reason).toBe(ALREADY);
  });
});

describe('punching adapter — gate de posición', () => {
  it('isCircular fuera de interior → skip', () => {
    const p = plan({ position: 'borde', isCircular: true });
    expect(skipFor(p, 'Soporte circular')?.reason).toBe(CIRCULAR_POSITION_REASON);
    expect(p.fields.isCircular).toBeUndefined();
  });

  it('isCircular en interior → change', () => {
    const p = plan({ isCircular: true });
    expect(p.fields.isCircular).toBe(true);
    expect(changeFor(p, 'Soporte circular')).toMatchObject({ before: 'Rectangular', after: 'Circular' });
  });
});

describe('punching adapter — gate de cercos', () => {
  it('sin cercos activos, su configuración se salta', () => {
    const p = plan({ swDiam_mm: 10, swLegs: 4, sr_mm: 120, fywk_MPa: 500 });
    expect(skipFor(p, 'Ø del cerco')?.reason).toBe(SHEAR_REINF_GATE_REASON);
    expect(skipFor(p, 'Separación radial sr')?.reason).toBe(SHEAR_REINF_GATE_REASON);
    expect(p.fields.swDiam).toBeUndefined();
  });

  it('activar los cercos en el mismo turno abre el gate', () => {
    const p = plan({ hasShearReinf: true, swDiam_mm: 10, swLegs: 4, sr_mm: 120 });
    expect(p.fields.hasShearReinf).toBe(true);
    expect(p.fields.swDiam).toBe(10);
    expect(p.fields.swLegs).toBe(4);
    expect(p.fields.sr).toBe(120);
  });

  it('Ø de cerco fuera del catálogo de cercos → skip', () => {
    const current: PunchingInputs = { ...punchingDefaults, hasShearReinf: true };
    expect(skipFor(plan({ swDiam_mm: 16 }, current), 'Ø del cerco')?.reason).toContain('diámetros de cerco');
  });
});

describe('punching adapter — modo cruceta', () => {
  it('cx/cy/isCircular/cercos son inertes (los fuerza el motor)', () => {
    const p = plan({ cx_mm: 500, cy_mm: 500, isCircular: true, hasShearReinf: true, sInf_mm: 200 }, CRUCETA);
    expect(skipFor(p, 'Dimensión cx')?.reason).toBe(CRUCETA_INERT_REASON);
    expect(skipFor(p, 'Soporte circular')?.reason).toBe(CRUCETA_INERT_REASON);
    expect(skipFor(p, 'Cercos de punzonamiento')?.reason).toBe(CRUCETA_INERT_REASON);
    expect(skipFor(p, 'Separación malla inferior')?.reason).toBe(CRUCETA_INERT_REASON);
    expect(p.fields).toEqual({});
  });

  it('cambiar a modo cruceta en el mismo turno abre su bloque', () => {
    const p = plan({ mode: 'pilar-cruceta', colType: 'HEA', colSize: 260, plateA_mm: 400, upnSize: 200 });
    expect(p.fields.mode).toBe('pilar-cruceta');
    expect(p.fields.colType).toBe('HEA');
    expect(p.fields.colSize).toBe(260);
    expect(p.fields.plateA).toBe(400);
    expect(p.fields.upnSize).toBe(200);
  });

  it('el tamaño del pilar se valida contra la familia FINAL', () => {
    // IPE no tiene 260 en catálogo; HEA sí.
    const p = plan({ colType: 'IPE', colSize: 260 }, CRUCETA);
    expect(skipFor(p, 'Tamaño del pilar (cruceta)')?.reason).toContain('no está en el catálogo');
  });

  it('UPN fuera de catálogo → skip', () => {
    expect(skipFor(plan({ upnSize: 175 }, CRUCETA), 'Perfil UPN')?.reason).toContain('no está en el catálogo');
  });

  it('edgeY solo con borde/esquina; edgeX solo con esquina', () => {
    const interior = plan({ edgeY_mm: 400, edgeX_mm: 400 }, CRUCETA);
    expect(skipFor(interior, 'Distancia al borde libre')?.reason).toBe(EDGE_POSITION_REASON);

    const borde = plan({ position: 'borde', edgeY_mm: 400, edgeX_mm: 400 }, CRUCETA);
    expect(borde.fields.edgeY).toBe(400);
    expect(skipFor(borde, 'Distancia al 2º borde')?.reason).toBe(EDGE_POSITION_REASON);

    const esquina = plan({ position: 'esquina', edgeY_mm: 400, edgeX_mm: 350 }, CRUCETA);
    expect(esquina.fields.edgeY).toBe(400);
    expect(esquina.fields.edgeX).toBe(350);
  });
});

describe('punching adapter — reglas de seguridad', () => {
  it('rebajar VEd sobre un valor fijado → riesgo', () => {
    const current: PunchingInputs = { ...punchingDefaults, VEd: 600 };
    expect(riskFor(plan({ VEd_kN: 300 }, current), 'VEd')?.why).toContain('perímetro crítico');
  });

  it('"mover" el pilar de esquina a interior → riesgo (β 1.5 → 1.15)', () => {
    const current: PunchingInputs = { ...punchingDefaults, position: 'esquina' };
    expect(riskFor(plan({ position: 'interior' }, current), 'position')?.why).toContain('β');
  });

  it('de interior a esquina NO es riesgo (más exigente)', () => {
    expect(plan({ position: 'esquina' }).risks).toEqual([]);
  });

  it('declarar carga puntual la reacción de un pilar → riesgo (β 1.15 → 1.0)', () => {
    const current: PunchingInputs = { ...punchingDefaults, mode: 'pilar-cruceta' };
    const p = plan({ mode: 'carga-puntual' }, current);
    expect(riskFor(p, 'mode')?.why).toContain('transfiere momento');
  });

  it('agrandar la distancia al borde de la cruceta → riesgo (lowerIsSafer)', () => {
    const current: PunchingInputs = { ...CRUCETA, position: 'borde', edgeY: 300 };
    expect(riskFor(plan({ edgeY_mm: 800 }, current), 'edgeY')?.why).toContain('medida real del macizo');
  });

  it('subir el canto útil, el armado o poner cercos NUNCA es riesgo (es la vía legítima)', () => {
    const current: PunchingInputs = { ...punchingDefaults, d: 220, barDiamSup: 10 };
    const p = plan({ d_mm: 300, barDiamSup_mm: 16, sSup_mm: 100, hasShearReinf: true }, current);
    expect(p.risks).toEqual([]);
  });
});

describe('punching adapter — snapshot', () => {
  it('defaults → 27 claves sin confirmar; plateT NO viaja (no tiene control en la UI)', () => {
    const snap = JSON.parse(punchingAdapter.snapshot(punchingDefaults));
    expect(snap.valores.mode).toBe('pilar');
    expect(snap.valores.cx_mm).toBe(300);
    expect(snap.valores.VEd_kN).toBe(260);
    expect(snap.valores).not.toHaveProperty('plateT');
    expect(snap.valores).not.toHaveProperty('plateT_mm');
    expect(snap.sin_confirmar).toHaveLength(27);
  });
});

describe('punching adapter — resumen de resultados', () => {
  it('cálculo válido → veredicto + extras (perímetros, tensiones, ρl, uout)', () => {
    const s = summarizePunchingResults(calcPunching(punchingDefaults));
    expect(s.verdict).not.toBe('invalid');
    expect(s.text).toContain('Perímetros: u0');
    expect(s.text).toContain('Tensiones: vEd');
    expect(s.text).toContain('Cuantía de flexión ρl');
    expect(s.text).toContain('uout');
  });

  it('INCUMPLE (valid:false SIN error) se resume como fail, no como invalid', () => {
    const r = calcPunching({ ...punchingDefaults, VEd: 3000 });
    expect(r.valid).toBe(false);
    expect(r.error).toBeUndefined();
    const s = summarizePunchingResults(r);
    expect(s.verdict).toBe('fail');
    expect(s.text).toContain('VEREDICTO GLOBAL: INCUMPLE');
  });

  it('error de validación del motor → invalid', () => {
    const s = summarizePunchingResults(calcPunching({ ...punchingDefaults, d: 0 }));
    expect(s.verdict).toBe('invalid');
    expect(s.text).toContain('CÁLCULO NO VÁLIDO');
  });

  it('modo cruceta → extra con la clase del UPN y el aviso del reparto a mano', () => {
    const s = summarizePunchingResults(calcPunching(CRUCETA));
    expect(s.text).toContain('Cruceta: UPN 160');
    expect(s.text).toContain('REPARTO de la cruceta lo verifica el ingeniero a mano');
  });
});
