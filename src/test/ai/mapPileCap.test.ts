// Tests del adapter pile-cap (src/lib/ai/modules/pileCap.ts, ola 1): gate `n`
// (2|3|4) con la trampa "n=2 no admite Mx", momentos CON SIGNO (sin valor
// absoluto, a diferencia de zapatas), catálogos por módulo (fck 20–50 sin
// HA-12/16, fyk solo 400/500, Ø de tirante del catálogo), rangos sin clamp,
// notFound completo, snapshot y reglas de seguridad (R_adm invertida).
// Funciones puras, sin mocks.
//
// current = pileCapDefaults: n=2 · d_p=220 · s=1200 · h_enc=800 · b_col=h_col=400
// · HA-25 · B500 · cover 60 · Ø12 · N_Ed=300 · Mx=My=0 · R_adm=250. system='si'.

import { describe, it, expect } from 'vitest';
import {
  pileCapAdapter,
  summarizePileCapResults,
  N2_MX_SKIP_REASON,
  N2_MX_PENDING_WARNING,
} from '../../lib/ai/modules/pileCap';
import type { AiApplyPlan } from '../../lib/ai/modules/types';
import { AiError } from '../../lib/ai/types';
import { pileCapDefaults, type PileCapInputs } from '../../data/defaults';
import { calcPileCap } from '../../lib/calculations/pileCap';

const SYSTEM = 'si' as const;
const ALREADY = 'Ya coincide con el valor actual';

interface Payload {
  n: number | null;
  d_p_mm: number | null; s_mm: number | null; h_enc_mm: number | null;
  b_col_mm: number | null; h_col_mm: number | null;
  fck_MPa: number | null; fyk_MPa: number | null;
  cover_mm: number | null; phi_tie_mm: number | null;
  N_Ed_kN: number | null; Mx_kNm: number | null; My_kNm: number | null; R_adm_kN: number | null;
  warnings: string[];
}

function makePayload(partial: Partial<Payload> = {}): Payload {
  return {
    n: null,
    d_p_mm: null, s_mm: null, h_enc_mm: null, b_col_mm: null, h_col_mm: null,
    fck_MPa: null, fyk_MPa: null, cover_mm: null, phi_tie_mm: null,
    N_Ed_kN: null, Mx_kNm: null, My_kNm: null, R_adm_kN: null,
    warnings: [],
    ...partial,
  };
}

function plan(
  partial: Partial<Payload> = {},
  current: PileCapInputs = pileCapDefaults,
): AiApplyPlan<PileCapInputs> {
  return pileCapAdapter.buildPlan(makePayload(partial), current, SYSTEM);
}

const changeFor = (p: AiApplyPlan<PileCapInputs>, label: string) =>
  p.changes.find((c) => c.label === label);
const skipFor = (p: AiApplyPlan<PileCapInputs>, label: string) =>
  p.skipped.find((s) => s.label === label);
const riskFor = (p: AiApplyPlan<PileCapInputs>, field: string) =>
  p.risks.find((r) => r.field === field);

describe('pileCap adapter — parseo defensivo', () => {
  it('payload no-objeto → AiError bad-response', () => {
    expect(() => pileCapAdapter.buildPlan('nope', pileCapDefaults, SYSTEM)).toThrow(AiError);
    expect(() => pileCapAdapter.buildPlan(null, pileCapDefaults, SYSTEM)).toThrow(AiError);
    expect(() => pileCapAdapter.buildPlan([1, 2], pileCapDefaults, SYSTEM)).toThrow(AiError);
  });

  it('campo con tipo incorrecto → null (no aplica, no revienta)', () => {
    const p = pileCapAdapter.buildPlan(
      { n: '4', N_Ed_kN: 'mucho', warnings: 'x' }, pileCapDefaults, SYSTEM,
    );
    expect(p.fields).toEqual({});
    expect(p.warnings).toEqual([]);
  });
});

describe('pileCap adapter — gate n', () => {
  it('n fuera de {2,3,4} → skip con motivo', () => {
    const p = plan({ n: 5 });
    expect(skipFor(p, 'Nº de micropilotes')?.reason).toContain('2, 3 ó 4');
    expect(p.fields.n).toBeUndefined();
  });

  it('n = actual → skip ALREADY', () => {
    expect(skipFor(plan({ n: 2 }), 'Nº de micropilotes')?.reason).toBe(ALREADY);
  });

  it('n nuevo → change con las dos etiquetas', () => {
    const c = changeFor(plan({ n: 4 }), 'Nº de micropilotes');
    expect(c).toMatchObject({ field: 'n', before: '2 micropilotes', after: '4 micropilotes' });
    expect(plan({ n: 4 }).fields.n).toBe(4);
  });
});

describe('pileCap adapter — trampa n=2 con Mx ≠ 0', () => {
  it('Mx ≠ 0 con n=2 vigente → skip de Mx con el motivo estático', () => {
    const p = plan({ Mx_kNm: 40 });
    expect(skipFor(p, 'Momento Mx')?.reason).toBe(N2_MX_SKIP_REASON);
    expect(p.fields.Mx_Ed).toBeUndefined();
  });

  it('Mx ≠ 0 se APLICA si la propuesta trae n=4 (se evalúa el n FINAL)', () => {
    const p = plan({ n: 4, Mx_kNm: 40 });
    expect(p.fields.n).toBe(4);
    expect(p.fields.Mx_Ed).toBe(40);
    expect(skipFor(p, 'Momento Mx')).toBeUndefined();
  });

  it('Mx = 0 con n=2 → no salta la trampa (ya coincide con el actual)', () => {
    expect(skipFor(plan({ Mx_kNm: 0 }), 'Momento Mx')?.reason).toBe(ALREADY);
  });

  it('proponer n=2 sobre un estado con Mx ≠ 0 → warning (no hay campo que saltar)', () => {
    const current: PileCapInputs = { ...pileCapDefaults, n: 4, Mx_Ed: 30 };
    const p = plan({ n: 2 }, current);
    expect(p.fields.n).toBe(2);
    expect(p.warnings).toContain(N2_MX_PENDING_WARNING);
  });

  it('n=2 + Mx=0 explícito sobre estado con Mx ≠ 0 → aplica el 0, sin warning', () => {
    const current: PileCapInputs = { ...pileCapDefaults, n: 4, Mx_Ed: 30 };
    const p = plan({ n: 2, Mx_kNm: 0 }, current);
    expect(p.fields.Mx_Ed).toBe(0);
    expect(p.warnings).not.toContain(N2_MX_PENDING_WARNING);
  });
});

describe('pileCap adapter — momentos CON SIGNO', () => {
  it('My negativo se aplica tal cual (el signo entra en Navier)', () => {
    const p = plan({ My_kNm: -45 });
    expect(p.fields.My_Ed).toBe(-45);
    expect(p.warnings).toEqual([]);
  });

  it('|M| > 20000 kNm → skip por rango', () => {
    expect(skipFor(plan({ My_kNm: -25000 }), 'Momento My')?.reason).toContain('fuera del rango');
  });
});

describe('pileCap adapter — geometría (mm, sin conversión)', () => {
  it('aplica mm redondeados a entero', () => {
    const p = plan({ h_enc_mm: 900.4, d_p_mm: 250 });
    expect(p.fields.h_enc).toBe(900);
    expect(p.fields.d_p).toBe(250);
    expect(changeFor(p, 'Canto del encepado')).toMatchObject({ before: '800 mm', after: '900 mm' });
  });

  it('fuera de rango → skip sin clamp', () => {
    const p = plan({ h_enc_mm: 50, b_col_mm: 5000 });
    expect(skipFor(p, 'Canto del encepado')?.reason).toContain('fuera del rango');
    expect(skipFor(p, 'Ancho de pilar b')?.reason).toContain('fuera del rango');
    expect(p.fields.h_enc).toBeUndefined();
    expect(p.fields.b_col).toBeUndefined();
  });
});

describe('pileCap adapter — catálogos', () => {
  it('fck < 20 (HA-16) → skip: el motor exige 20–50 MPa', () => {
    expect(skipFor(plan({ fck_MPa: 16 }), 'Hormigón fck')?.reason).toContain('no está en el catálogo');
  });

  it('fck del catálogo → change', () => {
    expect(plan({ fck_MPa: 30 }).fields.fck).toBe(30);
  });

  it('fyk 600 → skip (este módulo solo admite 400/500)', () => {
    expect(skipFor(plan({ fyk_MPa: 600 }), 'Acero fyk')?.reason).toContain('solo 400 o 500');
  });

  it('Ø de tirante fuera del catálogo → skip', () => {
    expect(skipFor(plan({ phi_tie_mm: 14 }), 'Diámetro del tirante')?.reason).toContain('catálogo');
    expect(plan({ phi_tie_mm: 20 }).fields.phi_tie).toBe(20);
  });
});

describe('pileCap adapter — notFound y warnings', () => {
  it('payload vacío → notFound con las 14 claves y sin cambios', () => {
    const p = plan();
    expect(p.changes).toEqual([]);
    expect(p.notFound).toHaveLength(14);
    expect(p.notFound[0]).toBe('Nº de micropilotes');
  });

  it('los warnings del modelo se conservan', () => {
    const p = plan({ h_enc_mm: 900, warnings: ['Canto convertido de 90 cm a 900 mm.'] });
    expect(p.warnings).toContain('Canto convertido de 90 cm a 900 mm.');
  });
});

describe('pileCap adapter — reglas de seguridad', () => {
  it('bajar N_Ed sobre un valor ya fijado → riesgo', () => {
    const current: PileCapInputs = { ...pileCapDefaults, N_Ed: 800 };
    const p = plan({ N_Ed_kN: 400 }, current);
    expect(riskFor(p, 'N_Ed')?.why).toContain('análisis de la estructura');
  });

  it('bajar N_Ed desde el DEFAULT no salta (gate anti-ruido: se está rellenando)', () => {
    expect(plan({ N_Ed_kN: 200 }).risks).toEqual([]);
  });

  it('SUBIR R_adm sobre un valor ya fijado → riesgo (lowerIsSafer)', () => {
    const current: PileCapInputs = { ...pileCapDefaults, R_adm: 200 };
    const p = plan({ R_adm_kN: 400 }, current);
    expect(riskFor(p, 'R_adm')?.why).toContain('estudio geotécnico');
  });

  it('subir R_adm NO es riesgo si sigue en su default (gate anti-ruido)', () => {
    expect(plan({ R_adm_kN: 400 }).risks).toEqual([]);
  });

  it('reducir la MAGNITUD del momento es riesgo; cambiar solo el signo NO', () => {
    const current: PileCapInputs = { ...pileCapDefaults, n: 4, My_Ed: 60 };
    expect(riskFor(plan({ My_kNm: 20 }, current), 'My_Ed')).toBeDefined();
    expect(riskFor(plan({ My_kNm: -60 }, current), 'My_Ed')).toBeUndefined();
  });

  it('bajar el recubrimiento sobre un valor fijado → riesgo (inflaría el canto útil)', () => {
    const current: PileCapInputs = { ...pileCapDefaults, cover: 70 };
    expect(riskFor(plan({ cover_mm: 40 }, current), 'cover')?.why).toContain('durabilidad');
  });

  it('agrandar el encepado (canto, separación) NUNCA es riesgo: es la vía legítima', () => {
    const current: PileCapInputs = { ...pileCapDefaults, h_enc: 700, s: 1000 };
    expect(plan({ h_enc_mm: 1000, s_mm: 1500 }, current).risks).toEqual([]);
  });
});

describe('pileCap adapter — snapshot', () => {
  it('defaults → todas las claves en sin_confirmar', () => {
    const snap = JSON.parse(pileCapAdapter.snapshot(pileCapDefaults));
    expect(snap.valores.n).toBe(2);
    expect(snap.valores.h_enc_mm).toBe(800);
    expect(snap.valores.R_adm_kN).toBe(250);
    expect(snap.sin_confirmar).toHaveLength(14);
  });

  it('un valor tocado sale de sin_confirmar', () => {
    const snap = JSON.parse(pileCapAdapter.snapshot({ ...pileCapDefaults, N_Ed: 750 }));
    expect(snap.valores.N_Ed_kN).toBe(750);
    expect(snap.sin_confirmar).not.toContain('N_Ed_kN');
    expect(snap.sin_confirmar).toContain('n');
  });
});

describe('pileCap adapter — resumen de resultados', () => {
  it('cálculo válido → veredicto + extras (R_max y ángulo de biela)', () => {
    const r = calcPileCap(pileCapDefaults);
    const s = summarizePileCapResults(r);
    expect(s.verdict).not.toBe('invalid');
    expect(s.text).toContain('VEREDICTO GLOBAL');
    expect(s.text).toContain('Reacción máxima R_max');
    expect(s.text).toContain('Ángulo de biela θ');
  });

  it('error del motor (n=2 con Mx≠0) → invalid, discriminado por error != null', () => {
    const r = calcPileCap({ ...pileCapDefaults, Mx_Ed: 50 });
    const s = summarizePileCapResults(r);
    expect(s.verdict).toBe('invalid');
    expect(s.text).toContain('CÁLCULO NO VÁLIDO');
  });

  it('micropilote a tracción → aviso en los extras', () => {
    const r = calcPileCap({ ...pileCapDefaults, n: 4, N_Ed: 200, My_Ed: 400 });
    expect(r.R_min).toBeLessThan(0);
    expect(summarizePileCapResults(r).text).toContain('TRACCIÓN');
  });
});
