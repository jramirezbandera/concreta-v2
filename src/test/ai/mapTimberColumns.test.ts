// Tests del adapter timber-columns (src/lib/ai/modules/timberColumns.ts, ola 1):
// catálogo de clases resistentes (sin GL36h), β del selector (0.5/0.7/1/2),
// esfuerzos YA MAYORADOS, gate de fuego (R0 → exposedFaces/etaFi inertes),
// NIVELES ORDINALES calibrados con kmod (Tabla 3.1 EC5) y con los minutos de R,
// y el mapeo de las filas informativas (neutral con status 'ok') al resumen.
//
// current = timberColumnDefaults: C24 · 160×160 · L=3 · βy=βz=1.0 · Nd=80 ·
// Vd=5 · Md=3 · eje fuerte · SC1 · media duración · R0 · 4 caras · ηfi=0.65.

import { describe, it, expect } from 'vitest';
import {
  timberColumnsAdapter,
  summarizeTimberColumnResults,
  FIRE_GATE_REASON,
} from '../../lib/ai/modules/timberColumns';
import type { AiApplyPlan } from '../../lib/ai/modules/types';
import { AiError } from '../../lib/ai/types';
import { timberColumnDefaults, type TimberColumnInputs } from '../../data/defaults';
import { calcTimberColumn } from '../../lib/calculations/timberColumns';

const SYSTEM = 'si' as const;
const ALREADY = 'Ya coincide con el valor actual';

interface Payload {
  gradeId: string | null;
  b_mm: number | null; h_mm: number | null; L_m: number | null;
  beta_y: number | null; beta_z: number | null;
  Nd_kN: number | null; Vd_kN: number | null; Md_kNm: number | null;
  momentAxis: string | null;
  serviceClass: number | null; loadDuration: string | null;
  fireResistance: string | null; exposedFaces: number | null; etaFi: number | null;
  warnings: string[];
}

function makePayload(partial: Partial<Payload> = {}): Payload {
  return {
    gradeId: null, b_mm: null, h_mm: null, L_m: null,
    beta_y: null, beta_z: null,
    Nd_kN: null, Vd_kN: null, Md_kNm: null, momentAxis: null,
    serviceClass: null, loadDuration: null,
    fireResistance: null, exposedFaces: null, etaFi: null,
    warnings: [],
    ...partial,
  };
}

function plan(
  partial: Partial<Payload> = {},
  current: TimberColumnInputs = timberColumnDefaults,
): AiApplyPlan<TimberColumnInputs> {
  return timberColumnsAdapter.buildPlan(makePayload(partial), current, SYSTEM);
}

const changeFor = (p: AiApplyPlan<TimberColumnInputs>, label: string) =>
  p.changes.find((c) => c.label === label);
const skipFor = (p: AiApplyPlan<TimberColumnInputs>, label: string) =>
  p.skipped.find((s) => s.label === label);
const riskFor = (p: AiApplyPlan<TimberColumnInputs>, field: string) =>
  p.risks.find((r) => r.field === field);

describe('timberColumns adapter — parseo defensivo', () => {
  it('payload no-objeto → AiError', () => {
    expect(() => timberColumnsAdapter.buildPlan(42, timberColumnDefaults, SYSTEM)).toThrow(AiError);
  });

  it('tipos incorrectos → null (sin aplicar)', () => {
    const p = timberColumnsAdapter.buildPlan(
      { gradeId: 24, Nd_kN: '80' }, timberColumnDefaults, SYSTEM,
    );
    expect(p.fields).toEqual({});
  });
});

describe('timberColumns adapter — catálogos', () => {
  it('GL36h no existe (fix #108) → skip con motivo', () => {
    const p = plan({ gradeId: 'GL36h' });
    expect(skipFor(p, 'Clase resistente')?.reason).toContain('no existe en el catálogo');
    expect(p.fields.gradeId).toBeUndefined();
  });

  it('GL28h sí existe → change', () => {
    expect(plan({ gradeId: 'GL28h' }).fields.gradeId).toBe('GL28h');
  });

  it('β fuera del selector (0.85) → skip', () => {
    expect(skipFor(plan({ beta_y: 0.85 }), 'Coef. pandeo βy (eje fuerte)')?.reason)
      .toContain('0.5, 0.7, 1.0, 2.0');
  });

  it('β = 2.0 (ménsula) → change formateado', () => {
    expect(changeFor(plan({ beta_z: 2.0 }), 'Coef. pandeo βz (eje débil)'))
      .toMatchObject({ before: '1.00', after: '2.00' });
  });

  it('clase de servicio y duración fuera de catálogo → skip', () => {
    expect(skipFor(plan({ serviceClass: 4 }), 'Clase de servicio')?.reason).toContain('inexistente');
    expect(skipFor(plan({ loadDuration: 'eterna' }), 'Duración de la carga')?.reason).toContain('desconocida');
  });
});

describe('timberColumns adapter — esfuerzos y geometría', () => {
  it('esfuerzos negativos → skip (el motor los rechaza)', () => {
    expect(skipFor(plan({ Md_kNm: -5 }), 'Momento de cálculo Md')?.reason).toContain('fuera del rango');
  });

  it('sección en mm y altura en m, sin conversión', () => {
    const p = plan({ b_mm: 200, h_mm: 300, L_m: 4.5 });
    expect(p.fields).toMatchObject({ b: 200, h: 300, L: 4.5 });
    expect(changeFor(p, 'Canto de sección h')).toMatchObject({ before: '160 mm', after: '300 mm' });
    expect(changeFor(p, 'Altura del pilar L')).toMatchObject({ before: '3.00 m', after: '4.50 m' });
  });

  it('valor igual al actual → ALREADY', () => {
    expect(skipFor(plan({ Nd_kN: 80 }), 'Axil de cálculo Nd')?.reason).toBe(ALREADY);
  });
});

describe('timberColumns adapter — gate de fuego', () => {
  it('con R0 vigente y sin proponer R>0, exposedFaces y etaFi se saltan', () => {
    const p = plan({ exposedFaces: 3, etaFi: 0.5 });
    expect(skipFor(p, 'Caras expuestas al fuego')?.reason).toBe(FIRE_GATE_REASON);
    expect(skipFor(p, 'Factor de carga en incendio η_fi')?.reason).toBe(FIRE_GATE_REASON);
    expect(p.fields.exposedFaces).toBeUndefined();
    expect(p.fields.etaFi).toBeUndefined();
  });

  it('proponer R60 en el mismo turno abre el gate', () => {
    const p = plan({ fireResistance: 'R60', exposedFaces: 3, etaFi: 0.7 });
    expect(p.fields.fireResistance).toBe('R60');
    expect(p.fields.exposedFaces).toBe(3);
    expect(p.fields.etaFi).toBe(0.7);
  });

  it('con R90 vigente, etaFi fuera de 0–1 → skip por rango', () => {
    const current: TimberColumnInputs = { ...timberColumnDefaults, fireResistance: 'R90' };
    expect(skipFor(plan({ etaFi: 1.4 }, current), 'Factor de carga en incendio η_fi')?.reason)
      .toContain('fuera del rango');
  });
});

describe('timberColumns adapter — reglas de seguridad (ordinales calibrados)', () => {
  it('acortar la duración de la carga (permanente → instantánea) sube kmod → riesgo', () => {
    const current: TimberColumnInputs = { ...timberColumnDefaults, loadDuration: 'permanent' };
    const p = plan({ loadDuration: 'instantaneous' }, current);
    expect(riskFor(p, 'loadDuration')?.why).toContain('kmod');
  });

  it('alargar la duración (media → permanente) NO es riesgo: es conservador', () => {
    const current: TimberColumnInputs = { ...timberColumnDefaults, loadDuration: 'short' };
    expect(plan({ loadDuration: 'permanent' }, current).risks).toEqual([]);
  });

  it('bajar la clase de servicio 3 → 1 sube kmod → riesgo', () => {
    const current: TimberColumnInputs = { ...timberColumnDefaults, serviceClass: 3 };
    expect(riskFor(plan({ serviceClass: 1 }, current), 'serviceClass')).toBeDefined();
  });

  it('SC2 → SC1 NO es riesgo: comparten kmod exacto en pilares (kdef solo afecta a vigas)', () => {
    const current: TimberColumnInputs = { ...timberColumnDefaults, serviceClass: 2 };
    expect(plan({ serviceClass: 1 }, current).risks).toEqual([]);
  });

  it('rebajar el R exigido (R90 → R30) → riesgo', () => {
    const current: TimberColumnInputs = { ...timberColumnDefaults, fireResistance: 'R90' };
    expect(riskFor(plan({ fireResistance: 'R30' }, current), 'fireResistance')?.why).toContain('CTE DB-SI');
  });

  it('PUNTO CIEGO documentado: 4 → 3 caras expuestas no salta (4 es el default)', () => {
    // exposedFaces vale por defecto 4 (el lado conservador), así que rebajarlo
    // es indistinguible de rellenar el formulario y el gate anti-ruido lo deja
    // pasar. Mismo caso que β=1.0 en pilares o duration='long' en micropilotes.
    const current: TimberColumnInputs = { ...timberColumnDefaults, fireResistance: 'R60' };
    expect(riskFor(plan({ exposedFaces: 3 }, current), 'exposedFaces')).toBeUndefined();
  });

  it('rebajar β sobre un valor fijado → riesgo; subirlo no', () => {
    const current: TimberColumnInputs = { ...timberColumnDefaults, beta_y: 2.0 };
    expect(riskFor(plan({ beta_y: 0.5 }, current), 'beta_y')).toBeDefined();
    expect(plan({ beta_y: 2.0 }, { ...timberColumnDefaults, beta_y: 0.7 }).risks).toEqual([]);
  });

  it('subir la clase resistente o la sección NUNCA es riesgo (es la vía legítima)', () => {
    const current: TimberColumnInputs = { ...timberColumnDefaults, b: 200, h: 200 };
    expect(plan({ gradeId: 'GL32h', b_mm: 240, h_mm: 240 }, current).risks).toEqual([]);
  });

  it('bajar Nd desde el default no salta (gate anti-ruido)', () => {
    expect(plan({ Nd_kN: 40 }).risks).toEqual([]);
  });
});

describe('timberColumns adapter — snapshot', () => {
  it('defaults → 15 claves sin confirmar', () => {
    const snap = JSON.parse(timberColumnsAdapter.snapshot(timberColumnDefaults));
    expect(snap.valores.gradeId).toBe('C24');
    expect(snap.valores.L_m).toBe(3.0);
    expect(snap.valores.fireResistance).toBe('R0');
    expect(snap.sin_confirmar).toHaveLength(15);
  });

  it('un campo tocado sale de sin_confirmar', () => {
    const snap = JSON.parse(timberColumnsAdapter.snapshot({ ...timberColumnDefaults, Md: 12 }));
    expect(snap.valores.Md_kNm).toBe(12);
    expect(snap.sin_confirmar).not.toContain('Md_kNm');
  });
});

describe('timberColumns adapter — resumen de resultados', () => {
  it('las filas informativas NO cuentan como comprobaciones (neutral, no CUMPLE)', () => {
    const r = calcTimberColumn(timberColumnDefaults);
    const s = summarizeTimberColumnResults(r);
    // 'ELU — Estado Límite Último' es una cabecera neutral: va en Informativas.
    expect(s.text).toContain('- Informativas:');
    expect(s.text).toContain('ELU — Estado Límite Último');
    expect(s.text).not.toContain('[CUMPLE] ELU — Estado Límite Último');
  });

  it('cálculo válido → veredicto + extras (kmod, pandeo)', () => {
    const s = summarizeTimberColumnResults(calcTimberColumn(timberColumnDefaults));
    expect(s.verdict).not.toBe('invalid');
    expect(s.text).toContain('Factores del material: kmod');
    expect(s.text).toContain('λrel,y');
    expect(s.text).not.toContain('Incendio R');
  });

  it('con fuego activo → extra con la sección residual', () => {
    const s = summarizeTimberColumnResults(
      calcTimberColumn({ ...timberColumnDefaults, fireResistance: 'R60' }),
    );
    expect(s.text).toContain('Incendio R60');
    expect(s.text).toContain('sección residual');
  });

  it('clase resistente inexistente → invalid (error != null)', () => {
    const s = summarizeTimberColumnResults(
      calcTimberColumn({ ...timberColumnDefaults, gradeId: 'C99' }),
    );
    expect(s.verdict).toBe('invalid');
    expect(s.text).toContain('CÁLCULO NO VÁLIDO');
  });
});
