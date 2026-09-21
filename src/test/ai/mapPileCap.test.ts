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
  PILE_CAP_APPLY_ORDER,
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
  barras_tirante_auto: boolean | null;
  n_bar_x_ud: number | null; n_bar_y_ud: number | null;
  N_Ed_kN: number | null; Mx_kNm: number | null; My_kNm: number | null; R_adm_kN: number | null;
  warnings: string[];
}

function makePayload(partial: Partial<Payload> = {}): Payload {
  return {
    n: null,
    d_p_mm: null, s_mm: null, h_enc_mm: null, b_col_mm: null, h_col_mm: null,
    fck_MPa: null, fyk_MPa: null, cover_mm: null, phi_tie_mm: null,
    barras_tirante_auto: null, n_bar_x_ud: null, n_bar_y_ud: null,
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
    expect(skipFor(p, 'Nº de micropilotes')?.reason).toContain('2, 3, 4 ó 6');
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
  it('payload vacío → notFound con las 17 claves y sin cambios', () => {
    const p = plan();
    expect(p.changes).toEqual([]);
    // 14 de siempre + las tres del nº de barras del tirante (2026-09-21)
    expect(p.notFound).toHaveLength(17);
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

// ── Nº de barras del tirante (2026-09-21) ───────────────────────────
//
// Quitar el aviso del tirante —que el automático deja pegado al 100 % por el
// redondeo— es justo lo que se le pide al asistente, así que puede tocarlo.
describe('pileCap adapter — barras del tirante', () => {
  const seis: PileCapInputs = {
    ...pileCapDefaults, n: 6, s: 1000, s_x: 1500, d_p: 185, h_enc: 900,
    N_Ed: 2250, R_adm: 422, fck: 30, phi_tie: 16, cover: 70, b_col: 300, h_col: 300,
  };

  it('proponer un número pasa el modo a mano sin tener que pedirlo', () => {
    const p = plan({ n_bar_y_ud: 8 }, seis);
    expect(p.fields.bars_auto).toBe(false);
    expect(p.fields.n_bar_y).toBe(8);
  });

  it('el sentido que no se propone se siembra con lo que ponía el automático', () => {
    const p = plan({ n_bar_y_ud: 8 }, seis);
    // Sin esto, x se quedaría con la semilla rancia del estado (4) y pedir más
    // armadura en y bajaría la de x sin que nadie lo dijera.
    expect(p.fields.n_bar_x).toBe(6);
    expect(p.changes.some((c) => c.field === 'n_bar_x' && c.before.includes('automático'))).toBe(true);
  });

  it('el mínimo se siembra con el resto de la propuesta ya aplicada', () => {
    // Ø20 en vez de Ø16: con más sección por barra el mínimo baja, y es ESE el
    // que hay que sembrar, no el del diámetro viejo.
    const conPhi = plan({ phi_tie_mm: 20, n_bar_y_ud: 6 }, seis).fields.n_bar_x;
    const sinPhi = plan({ n_bar_y_ud: 6 }, seis).fields.n_bar_x;
    expect(conPhi).toBeLessThan(sinPhi as number);
  });

  it('volver al automático', () => {
    const manual: PileCapInputs = { ...seis, bars_auto: false, n_bar_x: 9, n_bar_y: 9 };
    const p = plan({ barras_tirante_auto: true }, manual);
    expect(p.fields.bars_auto).toBe(true);
    expect(p.fields.n_bar_x).toBeUndefined();
  });

  it('pedir automático Y un número a la vez: manda el automático y se dice', () => {
    const manual: PileCapInputs = { ...seis, bars_auto: false, n_bar_x: 9, n_bar_y: 9 };
    const p = plan({ barras_tirante_auto: true, n_bar_x_ud: 9 }, manual);
    expect(p.fields.bars_auto).toBe(true);
    expect(p.fields.n_bar_x).toBeUndefined();
    expect(skipFor(p, 'Barras del tirante en x')?.reason).toContain('manda el automático');
  });

  it('fuera de rango → skip, y el otro sentido no se queda a medias', () => {
    const p = plan({ n_bar_x_ud: 0 }, seis);
    expect(skipFor(p, 'Barras del tirante en x')?.reason).toContain('rango');
    expect(p.fields.n_bar_x).toBe(6);        // sembrado con el automático
    expect(p.fields.bars_auto).toBe(false);
  });

  it('con 2 o 3 micropilotes no hay sentido y: se salta con motivo', () => {
    const p = plan({ n_bar_y_ud: 5 }, { ...pileCapDefaults, n: 2 });
    expect(skipFor(p, 'Barras del tirante en y')?.reason).toContain('un solo sentido');
    expect(p.fields.n_bar_y).toBeUndefined();
  });

  it('el mismo número que ya había a mano → ALREADY', () => {
    const manual: PileCapInputs = { ...seis, bars_auto: false, n_bar_x: 6, n_bar_y: 8 };
    const p = plan({ n_bar_x_ud: 6 }, manual);
    expect(skipFor(p, 'Barras del tirante en x')?.reason).toContain('Ya coincide');
  });

  it('poner barras NUNCA es un riesgo de seguridad: de más es el lado seguro y de menos se ve en rojo', () => {
    expect(plan({ n_bar_x_ud: 2, n_bar_y_ud: 2 }, seis).risks).toEqual([]);
  });
});

// ── La lista blanca del módulo ───────────────────────────────────
//
// `handleAiApply` recorre `PILE_CAP_APPLY_ORDER` y escribe sólo lo que esté en
// ella. Un campo que el mapper sepa proponer y que falte se cae SIN RUIDO: el
// usuario ve el cambio en el modal, lo confirma y el formulario no se entera.
// Pasó al añadir el nº de barras del tirante (2026-09-21).
describe('pileCap adapter — todo lo que el mapper propone se aplica', () => {
  it('ningún campo del plan queda fuera del orden de aplicación', () => {
    // Un payload que toca TODO lo que el mapper sabe escribir, sobre un estado
    // distinto en cada campo para que nada se salte por ALREADY.
    const current: PileCapInputs = {
      ...pileCapDefaults, n: 4, d_p: 200, s: 1100, h_enc: 750,
      b_col: 350, h_col: 350, fck: 25, fyk: 400, cover: 50, phi_tie: 12,
      N_Ed: 400, Mx_Ed: 10, My_Ed: 10, R_adm: 300,
      bars_auto: false, n_bar_x: 5, n_bar_y: 5,
    };
    const p = plan({
      n: 6, d_p_mm: 185, s_mm: 1000, h_enc_mm: 900,
      b_col_mm: 300, h_col_mm: 300, fck_MPa: 30, fyk_MPa: 500,
      cover_mm: 70, phi_tie_mm: 16,
      n_bar_x_ud: 7, n_bar_y_ud: 9,
      N_Ed_kN: 2250, Mx_kNm: 20, My_kNm: 20, R_adm_kN: 422,
    }, current);

    const escritos = Object.keys(p.fields) as (keyof PileCapInputs)[];
    expect(escritos.length).toBeGreaterThan(14);
    const fuera = escritos.filter((k) => !PILE_CAP_APPLY_ORDER.includes(k));
    expect(fuera).toEqual([]);
  });
});

describe('pileCap adapter — snapshot', () => {
  it('defaults → todas las claves en sin_confirmar', () => {
    const snap = JSON.parse(pileCapAdapter.snapshot(pileCapDefaults));
    expect(snap.valores.n).toBe(2);
    expect(snap.valores.h_enc_mm).toBe(800);
    expect(snap.valores.R_adm_kN).toBe(250);
    // 15, no 17: con el nº de barras en automático, `n_bar_x`/`n_bar_y` guardan
    // una semilla que nadie mira, así que van como null y no cuentan como «valor
    // sin confirmar» —no son un dato todavía—.
    expect(snap.sin_confirmar).toHaveLength(15);
    expect(snap.valores.barras_tirante_auto).toBe(true);
    expect(snap.valores.n_bar_x_ud).toBeNull();
    expect(snap.sin_confirmar).not.toContain('n_bar_x_ud');
  });

  it('con las barras a mano, el número SÍ viaja en el snapshot', () => {
    const snap = JSON.parse(pileCapAdapter.snapshot({
      ...pileCapDefaults, bars_auto: false, n_bar_x: 7, n_bar_y: 5,
    }));
    expect(snap.valores.barras_tirante_auto).toBe(false);
    expect(snap.valores.n_bar_x_ud).toBe(7);
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
