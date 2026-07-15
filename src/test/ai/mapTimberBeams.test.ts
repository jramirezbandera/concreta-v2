// Tests del adapter timber-beams (src/lib/ai/modules/timberBeams.ts, ola 1):
// cargas LINEALES kN/m (el módulo no tiene ancho tributario), invariante h ≥ b
// del motor (todo-o-nada sobre el estado combinado), gates (loadType='custom' →
// psi2Custom; R0 → exposedFaces), beamType como DATO con nivel calibrado por el
// coeficiente de MEd de BEAM_CASES, isSystem (ksys=1.10) como riesgo, y el mapeo
// de filas informativas al resumen.
//
// current = timberBeamDefaults: C24 · 150×400 · ss · L=5 · gk=2 · qk=3 · SC1 ·
// media duración · residencial · R0 · 3 caras · isSystem=false · ordinaria.

import { describe, it, expect } from 'vitest';
import {
  timberBeamsAdapter,
  summarizeTimberBeamResults,
  FIRE_GATE_REASON,
  PSI2_GATE_REASON,
  SECTION_SHAPE_REASON,
} from '../../lib/ai/modules/timberBeams';
import type { AiApplyPlan } from '../../lib/ai/modules/types';
import { AiError } from '../../lib/ai/types';
import { timberBeamDefaults, type TimberBeamInputs } from '../../data/defaults';
import { calcTimberBeam } from '../../lib/calculations/timberBeams';

const SYSTEM = 'si' as const;
const ALREADY = 'Ya coincide con el valor actual';

interface Payload {
  gradeId: string | null;
  b_mm: number | null; h_mm: number | null; beamType: string | null; L_m: number | null;
  gk_kNm: number | null; qk_kNm: number | null;
  serviceClass: number | null; loadDuration: string | null;
  loadType: string | null; psi2Custom: number | null;
  fireResistance: string | null; exposedFaces: number | null;
  isSystem: boolean | null; partitionType: string | null;
  warnings: string[];
}

function makePayload(partial: Partial<Payload> = {}): Payload {
  return {
    gradeId: null, b_mm: null, h_mm: null, beamType: null, L_m: null,
    gk_kNm: null, qk_kNm: null,
    serviceClass: null, loadDuration: null, loadType: null, psi2Custom: null,
    fireResistance: null, exposedFaces: null, isSystem: null, partitionType: null,
    warnings: [],
    ...partial,
  };
}

function plan(
  partial: Partial<Payload> = {},
  current: TimberBeamInputs = timberBeamDefaults,
): AiApplyPlan<TimberBeamInputs> {
  return timberBeamsAdapter.buildPlan(makePayload(partial), current, SYSTEM);
}

const changeFor = (p: AiApplyPlan<TimberBeamInputs>, label: string) =>
  p.changes.find((c) => c.label === label);
const skipFor = (p: AiApplyPlan<TimberBeamInputs>, label: string) =>
  p.skipped.find((s) => s.label === label);
const riskFor = (p: AiApplyPlan<TimberBeamInputs>, field: string) =>
  p.risks.find((r) => r.field === field);

describe('timberBeams adapter — parseo defensivo', () => {
  it('payload no-objeto → AiError', () => {
    expect(() => timberBeamsAdapter.buildPlan([], timberBeamDefaults, SYSTEM)).toThrow(AiError);
  });

  it('isSystem con tipo incorrecto → null (no aplica)', () => {
    const p = timberBeamsAdapter.buildPlan({ isSystem: 'true' }, timberBeamDefaults, SYSTEM);
    expect(p.fields.isSystem).toBeUndefined();
  });
});

describe('timberBeams adapter — cargas lineales kN/m', () => {
  it('aplica gk/qk en kN/m sin conversión', () => {
    const p = plan({ gk_kNm: 4.5, qk_kNm: 2 });
    expect(p.fields).toMatchObject({ gk: 4.5, qk: 2 });
    expect(changeFor(p, 'Carga permanente gk')?.after).toContain('4.5');
  });

  it('carga negativa → skip (el motor la rechaza)', () => {
    expect(skipFor(plan({ qk_kNm: -1 }), 'Sobrecarga qk')?.reason).toContain('fuera del rango');
  });

  it('carga igual a la actual → skip ALREADY (nunca se aplica en silencio)', () => {
    expect(skipFor(plan({ gk_kNm: 2 }), 'Carga permanente gk')?.reason).toBe(ALREADY);
  });

  it('el warning de conversión kN/m² × ancho tributario se conserva', () => {
    const p = plan({ gk_kNm: 1.5, warnings: ['2.5 kN/m² × 0.60 m de intereje = 1.5 kN/m'] });
    expect(p.warnings).toContain('2.5 kN/m² × 0.60 m de intereje = 1.5 kN/m');
  });
});

describe('timberBeams adapter — invariante h ≥ b (todo-o-nada)', () => {
  it('sección con h < b → se saltan AMBAS dimensiones (no media sección)', () => {
    const p = plan({ b_mm: 300, h_mm: 200 });
    expect(skipFor(p, 'Ancho de sección b')?.reason).toBe(SECTION_SHAPE_REASON);
    expect(skipFor(p, 'Canto de sección h')?.reason).toBe(SECTION_SHAPE_REASON);
    expect(p.fields.b).toBeUndefined();
    expect(p.fields.h).toBeUndefined();
  });

  it('b propuesto que supera el h VIGENTE → skip (se evalúa el combinado)', () => {
    const p = plan({ b_mm: 500 }); // h vigente = 400
    expect(skipFor(p, 'Ancho de sección b')?.reason).toBe(SECTION_SHAPE_REASON);
  });

  it('subir el canto (la vía legítima) se aplica', () => {
    const p = plan({ h_mm: 500 });
    expect(p.fields.h).toBe(500);
    expect(changeFor(p, 'Canto de sección h')).toMatchObject({ before: '400 mm', after: '500 mm' });
  });
});

describe('timberBeams adapter — beamType', () => {
  it('tipo desconocido → skip', () => {
    expect(skipFor(plan({ beamType: 'apoyada' }), 'Tipo de viga')?.reason).toContain('desconocido');
  });

  it('ménsula → change con la etiqueta de BEAM_CASES', () => {
    const c = changeFor(plan({ beamType: 'cantilever' }), 'Tipo de viga');
    expect(c).toMatchObject({ before: 'Articulada–Articulada', after: 'Ménsula' });
  });
});

describe('timberBeams adapter — gates', () => {
  it('psi2Custom sin categoría "custom" → skip', () => {
    expect(skipFor(plan({ psi2Custom: 0.5 }), 'ψ₂ personalizado')?.reason).toBe(PSI2_GATE_REASON);
  });

  it('loadType="custom" en el mismo turno abre el gate de psi2Custom', () => {
    const p = plan({ loadType: 'custom', psi2Custom: 0.6 });
    expect(p.fields.loadType).toBe('custom');
    expect(p.fields.psi2Custom).toBe(0.6);
  });

  it('exposedFaces con R0 → skip; con R60 propuesto → se aplica', () => {
    expect(skipFor(plan({ exposedFaces: 4 }), 'Caras expuestas al fuego')?.reason).toBe(FIRE_GATE_REASON);
    const p = plan({ fireResistance: 'R60', exposedFaces: 4 });
    expect(p.fields.exposedFaces).toBe(4);
  });
});

describe('timberBeams adapter — reglas de seguridad', () => {
  it('rebajar gk sobre un valor fijado → riesgo', () => {
    const current: TimberBeamInputs = { ...timberBeamDefaults, gk: 5 };
    expect(riskFor(plan({ gk_kNm: 1 }, current), 'gk')?.why).toContain('composición real del forjado');
  });

  it('acortar la luz → riesgo (la fija la geometría del edificio)', () => {
    const current: TimberBeamInputs = { ...timberBeamDefaults, L: 6 };
    expect(riskFor(plan({ L_m: 4 }, current), 'L')).toBeDefined();
  });

  it('declarar biempotrada una viga en ménsula → riesgo (rebaja MEd sin tocar la obra)', () => {
    // El riesgo del esquema estático vive ahora sobre las tres demandas que mueve
    // (M, V y flecha), no sobre un ordinal de `beamType`: aquel se construía con MEd
    // y EMPATABA ss con fp (los dos wL²/8), aunque la flecha de fp es un 59% menor —
    // y en madera la flecha es quien dimensiona. Ver lib/ai/beamScheme.ts.
    const current: TimberBeamInputs = { ...timberBeamDefaults, beamType: 'cantilever' };
    const p = plan({ beamType: 'ff' }, current);
    expect(p.risks.map((r) => r.field)).toEqual([
      'esquema_MEd', 'esquema_cortante', 'esquema_flecha',
    ]);
    expect(riskFor(p, 'esquema_MEd')?.why).toContain('CONSTRUIDA');
  });

  it('ss → cantilever NO es riesgo (la ménsula es más exigente)', () => {
    const current: TimberBeamInputs = { ...timberBeamDefaults, beamType: 'fp' };
    expect(plan({ beamType: 'cantilever' }, current).risks).toEqual([]);
  });

  it('activar el reparto de sistema (ksys=1.10) → riesgo incluso desde el default (alwaysCheck)', () => {
    expect(riskFor(plan({ isSystem: true }), 'isSystem')?.why).toContain('ksys');
  });

  it('desactivar el reparto de sistema NO es riesgo (vuelve al lado seguro)', () => {
    const current: TimberBeamInputs = { ...timberBeamDefaults, isSystem: true };
    expect(plan({ isSystem: false }, current).risks).toEqual([]);
  });

  it('relajar la tabiquería (frágil → sin tabiques) → riesgo del límite de flecha', () => {
    const current: TimberBeamInputs = { ...timberBeamDefaults, partitionType: 'fragile' };
    expect(riskFor(plan({ partitionType: 'none' }, current), 'partitionType')?.why).toContain('L/500');
  });

  it('endurecer la tabiquería (ordinaria → frágil) NO es riesgo', () => {
    expect(plan({ partitionType: 'fragile' }).risks).toEqual([]);
  });

  it('bajar ψ₂ vía categoría (almacenamiento → cubierta) → riesgo', () => {
    // El riesgo vive sobre el ψ₂ EFECTIVO (fuga 2), no sobre `loadType`: así cubre
    // también `{loadType:'custom'}` a secas, que caía de 0.80 a 0.30 sin aviso.
    const current: TimberBeamInputs = { ...timberBeamDefaults, loadType: 'storage' };
    expect(riskFor(plan({ loadType: 'roof' }, current), 'psi2_efectivo')).toBeDefined();
  });

  it('subir clase resistente / canto NUNCA es riesgo', () => {
    const current: TimberBeamInputs = { ...timberBeamDefaults, h: 450 };
    expect(plan({ gradeId: 'GL28h', h_mm: 550 }, current).risks).toEqual([]);
  });
});

describe('timberBeams adapter — snapshot', () => {
  it('defaults → 15 claves sin confirmar, beamType incluido', () => {
    const snap = JSON.parse(timberBeamsAdapter.snapshot(timberBeamDefaults));
    expect(snap.valores.beamType).toBe('ss');
    expect(snap.valores.gk_kNm).toBe(2);
    expect(snap.valores.isSystem).toBe(false);
    expect(snap.sin_confirmar).toHaveLength(15);
  });

  it('carga tocada → sale de sin_confirmar', () => {
    const snap = JSON.parse(timberBeamsAdapter.snapshot({ ...timberBeamDefaults, qk: 5 }));
    expect(snap.sin_confirmar).not.toContain('qk_kNm');
    expect(snap.sin_confirmar).toContain('gk_kNm');
  });
});

describe('timberBeams adapter — resumen de resultados', () => {
  it('cabeceras ELU/ELS van a Informativas, no cuentan como CUMPLE', () => {
    const s = summarizeTimberBeamResults(calcTimberBeam(timberBeamDefaults));
    expect(s.text).toContain('- Informativas:');
    expect(s.text).not.toContain('[CUMPLE] ELS — Estado Límite de Servicio');
  });

  it('extras: esfuerzos derivados, factores y flechas', () => {
    const s = summarizeTimberBeamResults(calcTimberBeam(timberBeamDefaults));
    expect(s.text).toContain('Esfuerzos derivados de las cargas: MEd');
    expect(s.text).toContain('kdef');
    expect(s.text).toContain('Flechas: activa');
  });

  it('con qk pequeña frente a gk, avisa de que gobierna la combinación solo-permanente', () => {
    const r = calcTimberBeam({ ...timberBeamDefaults, gk: 8, qk: 0.2 });
    expect(r.permGoverns).toBe(true);
    expect(summarizeTimberBeamResults(r).text).toContain('GOBIERNA la combinación solo-permanente');
  });

  it('sección con b > h → invalid (error != null)', () => {
    const s = summarizeTimberBeamResults(calcTimberBeam({ ...timberBeamDefaults, b: 500, h: 200 }));
    expect(s.verdict).toBe('invalid');
    expect(s.text).toContain('CÁLCULO NO VÁLIDO');
  });
});
