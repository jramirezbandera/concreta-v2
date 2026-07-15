// Tests del adapter rc-beams (src/lib/ai/modules/rcBeams.ts, ola 2):
// gate de `mode` (los campos de apoyo NO existen para el usuario en modo simple),
// conversión de la luz m → mm, normalización de esfuerzos a magnitud (el motor
// combina Ms = |M_G + ψ₂·M_Q| y unos signos mezclados se cancelarían), ordinales
// calibrados (wkMax de la exposición, K de la Tabla 7.4N, ψ₂ de la categoría), y
// el resumen BICÉFALO — que refleja lo que el usuario VE.
//
// current = rcBeamDefaults: simple · 300×500 · rec. 30 · HA-25 B500S · XC1 ·
// residencial · L=6 m · biapoyada · vano Md=85/VEd=65 · apoyo Md=65/VEd=65.

import { describe, it, expect } from 'vitest';
import {
  rcBeamsAdapter,
  summarizeRcBeamResults,
  APOYO_SIMPLE_REASON,
} from '../../lib/ai/modules/rcBeams';
import type { AiApplyPlan } from '../../lib/ai/modules/types';
import { AiError } from '../../lib/ai/types';
import { rcBeamDefaults, type RCBeamInputs } from '../../data/defaults';
import { calcRCBeam } from '../../lib/calculations/rcBeams';

const SYSTEM = 'si' as const;
const ALREADY = 'Ya coincide con el valor actual';

type Payload = Record<string, unknown>;

function plan(
  partial: Payload = {},
  current: RCBeamInputs = rcBeamDefaults,
): AiApplyPlan<RCBeamInputs> {
  return rcBeamsAdapter.buildPlan({ warnings: [], ...partial }, current, SYSTEM);
}

const changeFor = (p: AiApplyPlan<RCBeamInputs>, label: string) =>
  p.changes.find((c) => c.label === label);
const skipFor = (p: AiApplyPlan<RCBeamInputs>, label: string) =>
  p.skipped.find((s) => s.label === label);
const riskFor = (p: AiApplyPlan<RCBeamInputs>, field: string) =>
  p.risks.find((r) => r.field === field);

describe('rcBeams adapter — parseo defensivo', () => {
  it('payload no-objeto → AiError', () => {
    expect(() => rcBeamsAdapter.buildPlan([], rcBeamDefaults, SYSTEM)).toThrow(AiError);
  });

  it('campo con tipo incorrecto → null (no aplica)', () => {
    const p = rcBeamsAdapter.buildPlan({ b_mm: '300', mode: 7 }, rcBeamDefaults, SYSTEM);
    expect(p.fields.b).toBeUndefined();
    expect(p.fields.mode).toBeUndefined();
  });
});

describe('rcBeams adapter — geometría, materiales y catálogos', () => {
  it('la luz va en metros y se guarda en mm', () => {
    const p = plan({ L_m: 8 });
    expect(p.fields.L).toBe(8000);
    expect(changeFor(p, 'Luz L')).toMatchObject({ before: '6 m', after: '8 m' });
  });

  it('L = 0 se aplica (desactiva la esbeltez), no se salta', () => {
    expect(plan({ L_m: 0 }).fields.L).toBe(0);
  });

  it('fck fuera del catálogo → skip', () => {
    expect(skipFor(plan({ fck_MPa: 27 }), 'Hormigón fck')?.reason).toContain('no está en el catálogo');
  });

  it('fyk 600 SÍ está en el catálogo de vigas (a diferencia de zapatas)', () => {
    expect(plan({ fyk_MPa: 600 }).fields.fyk).toBe(600);
  });

  it('clase de exposición desconocida → skip', () => {
    expect(skipFor(plan({ exposureClass: 'XS3' }), 'Clase de exposición')?.reason).toContain('no disponible');
  });

  it('Ø de cerco > 16 → skip (el panel solo ofrece hasta Ø16)', () => {
    expect(skipFor(plan({ vano_stirrupDiam_mm: 20 }), 'Vano — Ø cerco')?.reason).toContain('catálogo');
  });

  it('recubrimiento fuera de rango → skip, nunca se recorta', () => {
    const p = plan({ cover_mm: 5 });
    expect(skipFor(p, 'Recubrimiento')?.reason).toContain('fuera del rango');
    expect(p.fields.cover).toBeUndefined();
  });

  it('valor igual al actual → skip ALREADY (nunca se aplica en silencio)', () => {
    expect(skipFor(plan({ b_mm: 300 }), 'Ancho b')?.reason).toBe(ALREADY);
  });
});

describe('rcBeams adapter — gate del modo (la sección de apoyo)', () => {
  it('en modo simple, los campos de apoyo se saltan con motivo', () => {
    const p = plan({ apoyo_Md_kNm: 90, apoyo_top_nBars: 5 });
    expect(skipFor(p, 'Apoyo — Md')?.reason).toBe(APOYO_SIMPLE_REASON);
    expect(skipFor(p, 'Apoyo — nº barras superiores')?.reason).toBe(APOYO_SIMPLE_REASON);
    expect(p.fields.apoyo_Md).toBeUndefined();
    expect(p.fields.apoyo_top_nBars).toBeUndefined();
  });

  it('proponer mode="portico" en el MISMO turno abre el gate', () => {
    const p = plan({ mode: 'portico', apoyo_Md_kNm: 90 });
    expect(p.fields.mode).toBe('portico');
    expect(p.fields.apoyo_Md).toBe(90);
  });

  it('con el estado ya en pórtico, los campos de apoyo se aplican', () => {
    const current: RCBeamInputs = { ...rcBeamDefaults, mode: 'portico' };
    expect(plan({ apoyo_VEd_kN: 120 }, current).fields.apoyo_VEd).toBe(120);
  });

  it('los campos de VANO se aplican siempre', () => {
    expect(plan({ vano_Md_kNm: 100 }).fields.vano_Md).toBe(100);
  });
});

describe('rcBeams adapter — esfuerzos como magnitud', () => {
  it('un momento negativo se guarda como magnitud y avisa', () => {
    const current: RCBeamInputs = { ...rcBeamDefaults, mode: 'portico' };
    const p = plan({ apoyo_Md_kNm: -90 }, current);
    expect(p.fields.apoyo_Md).toBe(90);
    expect(p.warnings.some((w) => w.includes('magnitud'))).toBe(true);
  });

  it('M_G / M_Q también se normalizan (Ms = |M_G + ψ₂·M_Q| se cancelaría)', () => {
    const p = plan({ vano_M_G_kNm: -50, vano_M_Q_kNm: -25 });
    expect(p.fields.vano_M_G).toBe(50);
    expect(p.fields.vano_M_Q).toBe(25);
  });
});

describe('rcBeams adapter — gate de ψ₂', () => {
  it('psi2Custom sin categoría "custom" → skip', () => {
    expect(skipFor(plan({ psi2Custom: 0.5 }), 'ψ₂ personalizado')?.reason).toContain('custom');
  });

  it('loadType="custom" en el mismo turno abre el gate', () => {
    const p = plan({ loadType: 'custom', psi2Custom: 0.6 });
    expect(p.fields.loadType).toBe('custom');
    expect(p.fields.psi2Custom).toBe(0.6);
  });
});

describe('rcBeams adapter — reglas de seguridad', () => {
  it('rebajar un momento de cálculo fijado → riesgo', () => {
    const current: RCBeamInputs = { ...rcBeamDefaults, vano_Md: 120 };
    expect(riskFor(plan({ vano_Md_kNm: 60 }, current), 'vano_Md')?.why).toContain('análisis');
  });

  it('acortar la luz → riesgo (la fija la geometría del edificio)', () => {
    const current: RCBeamInputs = { ...rcBeamDefaults, L: 8000 };
    expect(riskFor(plan({ L_m: 5 }, current), 'L')).toBeDefined();
  });

  it('bajar la clase de exposición a XC1 → riesgo (wk pasa de 0.30 a 0.40 mm)', () => {
    const current: RCBeamInputs = { ...rcBeamDefaults, exposureClass: 'XC3' };
    expect(riskFor(plan({ exposureClass: 'XC1' }, current), 'exposureClass')?.why).toContain('0.40');
  });

  it('XC4 → XC2 NO es riesgo: el motor les da el MISMO wk (0.30 mm)', () => {
    const current: RCBeamInputs = { ...rcBeamDefaults, exposureClass: 'XC4' };
    expect(plan({ exposureClass: 'XC2' }, current).risks).toEqual([]);
  });

  it('declarar un sistema estructural de K mayor → riesgo (relaja el límite L/d)', () => {
    const current: RCBeamInputs = { ...rcBeamDefaults, structSystem: 'cantilever' };
    expect(riskFor(plan({ structSystem: 'interior' }, current), 'structSystem')?.why).toContain('esbeltez');
  });

  it('volver al modo simple desde pórtico → riesgo (oculta el apoyo)', () => {
    const current: RCBeamInputs = { ...rcBeamDefaults, mode: 'portico' };
    expect(riskFor(plan({ mode: 'simple' }, current), 'mode')?.why).toContain('OCULTA');
  });

  it('pasar de simple a pórtico NO es riesgo (muestra MÁS comprobaciones)', () => {
    expect(plan({ mode: 'portico' }).risks).toEqual([]);
  });

  it('bajar ψ₂ vía categoría (aparcamiento → cubierta) → riesgo', () => {
    // El riesgo vive sobre el ψ₂ EFECTIVO (fuga 2), no sobre `loadType`: así cubre
    // también `{loadType:'custom', psi2Custom:0}`, que el ordinal dejaba pasar
    // porque 'custom' no tenía nivel (su valor lo decide psi2Custom).
    const current: RCBeamInputs = { ...rcBeamDefaults, loadType: 'parking' };
    expect(riskFor(plan({ loadType: 'roof' }, current), 'psi2_efectivo')).toBeDefined();
  });

  it('subir la sección o el armado NUNCA es riesgo', () => {
    const current: RCBeamInputs = { ...rcBeamDefaults, h: 550 };
    expect(plan({ h_mm: 700, vano_bot_nBars: 6, fck_MPa: 35 }, current).risks).toEqual([]);
  });
});

describe('rcBeams adapter — snapshot', () => {
  it('defaults → 33 claves sin confirmar; la luz va en metros', () => {
    const snap = JSON.parse(rcBeamsAdapter.snapshot(rcBeamDefaults));
    expect(snap.valores.L_m).toBe(6);
    expect(snap.valores.mode).toBe('simple');
    expect(snap.valores.title).toBeUndefined();
    expect(snap.sin_confirmar).toHaveLength(33);
  });

  it('un esfuerzo tocado sale de sin_confirmar', () => {
    const snap = JSON.parse(rcBeamsAdapter.snapshot({ ...rcBeamDefaults, vano_Md: 120 }));
    expect(snap.sin_confirmar).not.toContain('vano_Md_kNm');
    expect(snap.sin_confirmar).toContain('vano_VEd_kN');
  });
});

describe('rcBeams adapter — resumen bicéfalo', () => {
  it('modo simple → SOLO la sección de vano (es lo único que la app muestra)', () => {
    const s = summarizeRcBeamResults(calcRCBeam(rcBeamDefaults), 'simple');
    expect(s.text).not.toContain('Apoyo:');
    expect(s.text).toContain('Modo "sección simple"');
    expect(s.text).toContain('Vano (M+)');
  });

  it('modo pórtico → las dos secciones, con las filas prefijadas', () => {
    const state: RCBeamInputs = { ...rcBeamDefaults, mode: 'portico' };
    const s = summarizeRcBeamResults(calcRCBeam(state), 'portico');
    expect(s.text).toContain('Vano: ');
    expect(s.text).toContain('Apoyo: ');
    expect(s.text).toContain('Apoyo (M−)');
  });

  it('extras: canto útil, MRd, VRd, fisura y despiece', () => {
    const s = summarizeRcBeamResults(calcRCBeam(rcBeamDefaults), 'simple');
    expect(s.text).toContain('MRd =');
    expect(s.text).toContain('wk =');
    expect(s.text).toContain('armado:');
  });

  it('error global (fck imposible) → invalid', () => {
    const s = summarizeRcBeamResults(calcRCBeam({ ...rcBeamDefaults, fck: 5 }), 'simple');
    expect(s.verdict).toBe('invalid');
    expect(s.text).toContain('CÁLCULO NO VÁLIDO');
  });

  it('error de SECCIÓN (canto insuficiente) → invalid, aunque result.valid siga true', () => {
    const state: RCBeamInputs = { ...rcBeamDefaults, h: 40, cover: 30 };
    const r = calcRCBeam(state);
    expect(r.valid).toBe(true);          // el motor NO lo marca a nivel global…
    expect(r.vano.error).toBeDefined();  // …pero la sección visible no es válida
    const s = summarizeRcBeamResults(r, 'simple');
    expect(s.verdict).toBe('invalid');
    expect(s.text).toContain('Vano:');
  });

  it('una viga que incumple se resume como fail, no como invalid', () => {
    const s = summarizeRcBeamResults(calcRCBeam({ ...rcBeamDefaults, vano_Md: 900 }), 'simple');
    expect(s.verdict).toBe('fail');
    expect(s.text).toContain('VEREDICTO GLOBAL: INCUMPLE');
  });
});
