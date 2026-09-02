// Tests del adapter rc-columns (src/lib/ai/modules/rcColumns.ts) — reglas
// del plan T2.3: trampa sectionType (gating por forma efectiva, con
// sectionType+D_mm juntos ambos aplican), catálogos fck/fyk/diámetros,
// rangos sin clamp, L en m SIN conversión, β solo numérico, Nd negativo →
// tracción no soportada, MEd negativo → abs + warning, jamás title/phiEf,
// notFound por labels, snapshot {valores, sin_confirmar} (claves del payload +
// las que siguen en su default) y parseo defensivo (payload no-objeto →
// AiError). Funciones puras, sin mocks.
//
// Incluye además el summarizer de resultados (Fase 2 — T2.3):
// summarizeRCColumnResults con el motor REAL (calcRCColumn), sin fixtures
// sintéticos: defaults ok, fallo por axil, fork circular e invalid().
//
// current = rcColumnDefaults: rectangular 300×300 · cover 30 · L 3.5 m ·
// β 1 · HA-25 · B500 · 4Ø16 esquina · cercos Ø6/150 · Nd 500 · MEdy 30 ·
// MEdz 10 · (D 350, anillo 6Ø16). system = 'si'.

import { describe, it, expect } from 'vitest';
import { rcColumnsAdapter, summarizeRCColumnResults } from '../../lib/ai/modules/rcColumns';
import type { AiApplyPlan } from '../../lib/ai/modules/types';
import { AiError } from '../../lib/ai/types';
import { calcRCColumn } from '../../lib/calculations/rcColumns';
import { overallStatus } from '../../lib/calculations/checkFormat';
import { rcColumnDefaults, type RCColumnInputs } from '../../data/defaults';

const SYSTEM = 'si' as const;
const ALREADY = 'Ya coincide con el valor actual';

/** Payload todo-null + warnings vacíos, con overrides parciales (Record laxo
 *  para poder inyectar valores inválidos sin casts). */
function makePayload(partial: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sectionType: null, b_mm: null, h_mm: null, D_mm: null, cover_mm: null,
    L_m: null, beta: null, fck_MPa: null, fyk_MPa: null,
    cornerBarDiam_mm: null, nBarsX: null, barDiamX_mm: null,
    nBarsY: null, barDiamY_mm: null, nBarsCirc: null, circBarDiam_mm: null,
    stirrupDiam_mm: null, stirrupSpacing_mm: null,
    Nd_kN: null, MEdy_kNm: null, MEdz_kNm: null,
    warnings: [],
    ...partial,
  };
}

function plan(
  partial: Record<string, unknown> = {},
  current: RCColumnInputs = rcColumnDefaults,
): AiApplyPlan<RCColumnInputs> {
  return rcColumnsAdapter.buildPlan(makePayload(partial), current, SYSTEM);
}

const changeFor = (p: AiApplyPlan<RCColumnInputs>, label: string) =>
  p.changes.find((c) => c.label === label);
const skipFor = (p: AiApplyPlan<RCColumnInputs>, label: string) =>
  p.skipped.find((s) => s.label === label);

/** Las 21 claves del payload, en el orden del schema (= orden del snapshot). */
const ALL_KEYS = [
  'sectionType', 'b_mm', 'h_mm', 'D_mm', 'cover_mm', 'L_m', 'beta',
  'fck_MPa', 'fyk_MPa', 'cornerBarDiam_mm', 'nBarsX', 'barDiamX_mm',
  'nBarsY', 'barDiamY_mm', 'nBarsCirc', 'circBarDiam_mm',
  'stirrupDiam_mm', 'stirrupSpacing_mm', 'Nd_kN', 'MEdy_kNm', 'MEdz_kNm',
];

/** Snapshot del contrato congelado: {valores, sin_confirmar}. */
interface Snap {
  valores: Record<string, unknown>;
  sin_confirmar: string[];
}

const parseSnap = (c: RCColumnInputs): Snap =>
  JSON.parse(rcColumnsAdapter.snapshot(c)) as Snap;

/** Los 21 labels del payload, en el orden del schema. */
const ALL_LABELS = [
  'Forma de la sección', 'Ancho b', 'Canto h', 'Diámetro D',
  'Recubrimiento mecánico', 'Longitud L', 'Coeficiente de pandeo β',
  'Hormigón fck', 'Acero fyk', 'Ø barras de esquina',
  'Barras intermedias cara X', 'Ø intermedias cara X',
  'Barras intermedias cara Y', 'Ø intermedias cara Y',
  'Nº barras del anillo', 'Ø barras del anillo',
  'Ø cercos', 'Separación de cercos',
  'Axil Nd', 'Momento MEd,y', 'Momento MEd,z',
];

describe('rcColumnsAdapter — trampa sectionType (gating por forma efectiva)', () => {
  it('D_mm 400 con current rectangular (sin sectionType) → skip, nunca conmuta la forma', () => {
    const p = plan({ D_mm: 400 });
    expect(p.fields).toEqual({});
    expect(p.changes).toEqual([]);
    expect(skipFor(p, 'Diámetro D')).toBeDefined();
    expect(skipFor(p, 'Diámetro D')!.reason).toMatch(/circular/);
    expect(skipFor(p, 'Diámetro D')!.reason).toMatch(/rectangular/);
    // Se extrajo (no es null): no debe aparecer en notFound.
    expect(p.notFound).not.toContain('Diámetro D');
  });

  it("b_mm/h_mm con sectionType 'circular' → ambos skip; el cambio de forma sí aplica", () => {
    const p = plan({ sectionType: 'circular', b_mm: 350, h_mm: 400 });
    expect(p.fields).toEqual({ sectionType: 'circular' });
    expect(changeFor(p, 'Forma de la sección')).toEqual({
      field: 'sectionType', label: 'Forma de la sección', before: 'Rectangular', after: 'Circular',
    });
    expect(skipFor(p, 'Ancho b')!.reason).toMatch(/rectangular/);
    expect(skipFor(p, 'Canto h')!.reason).toMatch(/rectangular/);
  });

  it("sectionType 'circular' + D_mm 400 juntos → AMBOS en changes", () => {
    const p = plan({ sectionType: 'circular', D_mm: 400 });
    expect(p.fields).toEqual({ sectionType: 'circular', D: 400 });
    expect(p.changes).toHaveLength(2);
    expect(changeFor(p, 'Forma de la sección')).toMatchObject({ before: 'Rectangular', after: 'Circular' });
    expect(changeFor(p, 'Diámetro D')).toMatchObject({ field: 'D', before: '350 mm', after: '400 mm' });
    expect(p.skipped).toEqual([]);
  });

  it("sectionType 'rectangular' con current rectangular → skip \"Ya coincide\"", () => {
    const p = plan({ sectionType: 'rectangular' });
    expect(p.fields).toEqual({});
    expect(p.skipped).toEqual([{ label: 'Forma de la sección', reason: ALREADY }]);
  });

  it('nBarsCirc/circBarDiam_mm con forma efectiva rectangular → skip', () => {
    const p = plan({ nBarsCirc: 8, circBarDiam_mm: 20 });
    expect(p.fields).toEqual({});
    expect(skipFor(p, 'Nº barras del anillo')!.reason).toMatch(/circular/);
    expect(skipFor(p, 'Ø barras del anillo')!.reason).toMatch(/circular/);
  });

  it('current circular (sin sectionType en payload): D_mm aplica y b_mm se descarta', () => {
    const circCurrent: RCColumnInputs = { ...rcColumnDefaults, sectionType: 'circular' };
    const p = plan({ D_mm: 450, b_mm: 350 }, circCurrent);
    expect(p.fields).toEqual({ D: 450 });
    expect(changeFor(p, 'Diámetro D')).toMatchObject({ before: '350 mm', after: '450 mm' });
    expect(skipFor(p, 'Ancho b')!.reason).toMatch(/circular/);
  });
});

describe('rcColumnsAdapter — catálogos', () => {
  it('fck 28 → skip por catálogo, sin clamp', () => {
    const p = plan({ fck_MPa: 28 });
    expect(p.fields).toEqual({});
    expect(skipFor(p, 'Hormigón fck')!.reason).toMatch(/catálogo/);
    expect(skipFor(p, 'Hormigón fck')!.reason).toContain('28');
    expect(p.notFound).not.toContain('Hormigón fck');
  });

  it('fck 30 → aplicado con formato MPa', () => {
    const p = plan({ fck_MPa: 30 });
    expect(p.fields).toEqual({ fck: 30 });
    expect(changeFor(p, 'Hormigón fck')).toMatchObject({ field: 'fck', before: '25 MPa', after: '30 MPa' });
  });

  it('fyk 450 → skip por catálogo; fyk 400 → aplicado (600 es válido en pilares)', () => {
    const bad = plan({ fyk_MPa: 450 });
    expect(bad.fields).toEqual({});
    expect(skipFor(bad, 'Acero fyk')!.reason).toMatch(/catálogo/);

    const ok = plan({ fyk_MPa: 400 });
    expect(ok.fields).toEqual({ fyk: 400 });

    const b600 = plan({ fyk_MPa: 600 });
    expect(b600.fields).toEqual({ fyk: 600 });
  });

  it('cornerBarDiam_mm 14 (no comercial) y stirrupDiam_mm 14 (no ofrecido) → skip', () => {
    const p = plan({ cornerBarDiam_mm: 14, stirrupDiam_mm: 14 });
    expect(p.fields).toEqual({});
    expect(skipFor(p, 'Ø barras de esquina')!.reason).toMatch(/catálogo/);
    expect(skipFor(p, 'Ø cercos')!.reason).toMatch(/catálogo/);
  });

  it('stirrupDiam_mm 8 → aplicado con formato Ø', () => {
    const p = plan({ stirrupDiam_mm: 8 });
    expect(p.fields).toEqual({ stirrupDiam: 8 });
    expect(changeFor(p, 'Ø cercos')).toMatchObject({ before: 'Ø6', after: 'Ø8' });
  });
});

describe('rcColumnsAdapter — L en m (¡sin conversión!) y rangos', () => {
  it('L_m 3.5 (igual al default) → skip "Ya coincide"', () => {
    const p = plan({ L_m: 3.5 });
    expect(p.fields).toEqual({});
    expect(p.skipped).toEqual([{ label: 'Longitud L', reason: ALREADY }]);
  });

  it('L_m 25 (fuera de rango [0.5, 20]) → skip con motivo legible, sin clamp', () => {
    const p = plan({ L_m: 25 });
    expect(p.fields).toEqual({});
    expect(skipFor(p, 'Longitud L')!.reason).toMatch(/fuera del rango/);
    expect(skipFor(p, 'Longitud L')!.reason).toContain('0.5');
    expect(skipFor(p, 'Longitud L')!.reason).toContain('20');
  });

  it('L_m 4.2 → fields.L = 4.2 en METROS, directo (estado ya en m)', () => {
    const p = plan({ L_m: 4.2 });
    expect(p.fields).toEqual({ L: 4.2 });
    expect(changeFor(p, 'Longitud L')).toEqual({
      field: 'L', label: 'Longitud L', before: '3.50 m', after: '4.20 m',
    });
  });

  it('cover_mm 5 y stirrupSpacing_mm 30 → skip por rango; b_mm 2500 → skip por rango', () => {
    const p = plan({ cover_mm: 5, stirrupSpacing_mm: 30, b_mm: 2500 });
    expect(p.fields).toEqual({});
    expect(skipFor(p, 'Recubrimiento mecánico')!.reason).toMatch(/fuera del rango/);
    expect(skipFor(p, 'Separación de cercos')!.reason).toMatch(/fuera del rango/);
    expect(skipFor(p, 'Ancho b')!.reason).toMatch(/fuera del rango/);
  });

  it('b_mm 350 + cover_mm 35 → aplicados en mm internos', () => {
    const p = plan({ b_mm: 350, cover_mm: 35 });
    expect(p.fields).toEqual({ b: 350, cover: 35 });
    expect(changeFor(p, 'Ancho b')).toMatchObject({ before: '300 mm', after: '350 mm' });
  });
});

describe('rcColumnsAdapter — β solo numérico explícito', () => {
  it('beta 0.7 numérico → aplicado', () => {
    const p = plan({ beta: 0.7 });
    expect(p.fields).toEqual({ beta: 0.7 });
    expect(changeFor(p, 'Coeficiente de pandeo β')).toEqual({
      field: 'beta', label: 'Coeficiente de pandeo β', before: '1.00', after: '0.70',
    });
  });

  it('beta 4.5 → skip por rango [0.5, 4]; beta 1 → "Ya coincide"', () => {
    const fuera = plan({ beta: 4.5 });
    expect(fuera.fields).toEqual({});
    expect(skipFor(fuera, 'Coeficiente de pandeo β')!.reason).toMatch(/fuera del rango/);

    const igual = plan({ beta: 1 });
    expect(igual.skipped).toEqual([{ label: 'Coeficiente de pandeo β', reason: ALREADY }]);
  });

  it("beta no numérico ('biempotrado') → null defensivo → notFound, jamás aplicado", () => {
    const p = plan({ beta: 'biempotrado' });
    expect(p.fields).toEqual({});
    expect(p.changes).toEqual([]);
    expect(p.skipped).toEqual([]);
    expect(p.notFound).toContain('Coeficiente de pandeo β');
  });
});

describe('rcColumnsAdapter — esfuerzos (inputs directos del módulo)', () => {
  it('Nd_kN -100 → skip "tracción no soportada"', () => {
    const p = plan({ Nd_kN: -100 });
    expect(p.fields).toEqual({});
    expect(skipFor(p, 'Axil Nd')!.reason).toMatch(/tracción no soportada/);
    expect(p.warnings).toEqual([]);
  });

  it('Nd_kN 1200 → aplicado con formatQuantity; Nd_kN 25000 → skip por rango', () => {
    const ok = plan({ Nd_kN: 1200 });
    expect(ok.fields).toEqual({ Nd: 1200 });
    expect(changeFor(ok, 'Axil Nd')).toMatchObject({ field: 'Nd', before: '500.00 kN', after: '1200.00 kN' });

    const fuera = plan({ Nd_kN: 25000 });
    expect(fuera.fields).toEqual({});
    expect(skipFor(fuera, 'Axil Nd')!.reason).toMatch(/fuera del rango/);
  });

  it('MEdy_kNm -45 → fields.MEdy = 45 (valor absoluto) + warning', () => {
    const p = plan({ MEdy_kNm: -45 });
    expect(p.fields).toEqual({ MEdy: 45 });
    expect(changeFor(p, 'Momento MEd,y')).toMatchObject({ field: 'MEdy', before: '30.00 kNm', after: '45.00 kNm' });
    expect(p.warnings).toHaveLength(1);
    expect(p.warnings[0]).toMatch(/valor absoluto/);
    expect(p.warnings[0]).toContain('-45');
  });

  it('MEdz_kNm 6000 → skip por rango [0, 5000]; MEdz_kNm 10 (igual al current) → "Ya coincide"', () => {
    const fuera = plan({ MEdz_kNm: 6000 });
    expect(fuera.fields).toEqual({});
    expect(skipFor(fuera, 'Momento MEd,z')!.reason).toMatch(/fuera del rango/);

    const igual = plan({ MEdz_kNm: 10 });
    expect(igual.skipped).toEqual([{ label: 'Momento MEd,z', reason: ALREADY }]);
  });
});

describe('rcColumnsAdapter — todo-null y warnings', () => {
  it('payload todo-null → fields/changes/skipped vacíos; notFound = los 21 labels en orden', () => {
    const p = plan();
    expect(p.fields).toEqual({});
    expect(p.changes).toEqual([]);
    expect(p.skipped).toEqual([]);
    expect(p.notFound).toEqual(ALL_LABELS);
    expect(p.warnings).toEqual([]);
  });

  it('los warnings del payload se propagan tal cual, ANTES que los del mapper', () => {
    const p = plan({ warnings: ['convertí cm a mm', 'el eje del momento era dudoso'], MEdy_kNm: -45 });
    expect(p.warnings).toHaveLength(3);
    expect(p.warnings[0]).toBe('convertí cm a mm');
    expect(p.warnings[1]).toBe('el eje del momento era dudoso');
    expect(p.warnings[2]).toMatch(/valor absoluto/);
  });

  it('NUNCA produce title/phiEf ni derivados (Lk), ni con payload completo', () => {
    const p = plan({
      sectionType: 'rectangular', b_mm: 400, h_mm: 500, cover_mm: 35,
      L_m: 4, beta: 0.7, fck_MPa: 30, fyk_MPa: 400,
      cornerBarDiam_mm: 20, nBarsX: 2, barDiamX_mm: 16, nBarsY: 1, barDiamY_mm: 16,
      stirrupDiam_mm: 8, stirrupSpacing_mm: 200,
      Nd_kN: 1200, MEdy_kNm: 60, MEdz_kNm: 25,
    });
    const allowed = new Set([
      'sectionType', 'b', 'h', 'D', 'cover', 'L', 'beta', 'fck', 'fyk',
      'cornerBarDiam', 'nBarsX', 'barDiamX', 'nBarsY', 'barDiamY',
      'nBarsCirc', 'circBarDiam', 'stirrupDiam', 'stirrupSpacing',
      'Nd', 'MEdy', 'MEdz',
    ]);
    for (const k of Object.keys(p.fields)) expect(allowed.has(k), `campo inesperado: ${k}`).toBe(true);
    expect(p.fields).not.toHaveProperty('title');
    expect(p.fields).not.toHaveProperty('phiEf');
    // Con todo extraído, distinto y válido: 17 changes (D/nBarsCirc/circBarDiam
    // van a null por ser payload rectangular), nada en notFound de lo aplicado.
    expect(p.changes).toHaveLength(17);
    expect(p.notFound).toEqual(['Diámetro D', 'Nº barras del anillo', 'Ø barras del anillo']);
  });
});

describe('rcColumnsAdapter — parseo defensivo del payload', () => {
  it("payload no-objeto ('hola', null, array) → AiError('bad-response')", () => {
    for (const bad of ['hola', null, [1, 2, 3], 42]) {
      let err: unknown;
      try {
        rcColumnsAdapter.buildPlan(bad, rcColumnDefaults, SYSTEM);
      } catch (e) {
        err = e;
      }
      expect(err, `payload: ${JSON.stringify(bad)}`).toBeInstanceOf(AiError);
      expect((err as AiError).kind).toBe('bad-response');
    }
  });

  it('tipos inválidos → null defensivo (notFound), sin throw; warnings no-array → []', () => {
    const p = plan({ b_mm: '350', Nd_kN: Number.NaN, sectionType: 'ovalada', warnings: 'no soy un array' });
    expect(p.fields).toEqual({});
    expect(p.warnings).toEqual([]);
    expect(p.notFound).toContain('Ancho b');
    expect(p.notFound).toContain('Axil Nd');
    expect(p.notFound).toContain('Forma de la sección');
  });

  it('campos ausentes (payload {} salvo throw-guard) → tratados como null', () => {
    const p = rcColumnsAdapter.buildPlan({}, rcColumnDefaults, SYSTEM);
    expect(p.fields).toEqual({});
    expect(p.notFound).toEqual(ALL_LABELS);
  });
});

describe('rcColumnsAdapter — snapshot y superficie del adapter', () => {
  it('snapshot(rcColumnDefaults) → {valores, sin_confirmar}: valores con las MISMAS claves del payload y TODAS sin confirmar', () => {
    const snap = parseSnap(rcColumnDefaults);
    expect(Object.keys(snap)).toEqual(['valores', 'sin_confirmar']);
    expect(Object.keys(snap.valores)).toEqual(ALL_KEYS);
    expect(snap.valores).toMatchObject({
      sectionType: 'rectangular',
      b_mm: 300, h_mm: 300, D_mm: 350, cover_mm: 30,
      L_m: 3.5, beta: 1, fck_MPa: 25, fyk_MPa: 500,
      cornerBarDiam_mm: 16, nBarsX: 0, barDiamX_mm: 12, nBarsY: 0, barDiamY_mm: 12,
      nBarsCirc: 6, circBarDiam_mm: 16, stirrupDiam_mm: 6, stirrupSpacing_mm: 140,
      Nd_kN: 500, MEdy_kNm: 30, MEdz_kNm: 10,
    });
    // Formulario recién abierto: nadie ha tocado nada → todas las claves, en el orden de `valores`.
    expect(snap.sin_confirmar).toEqual(ALL_KEYS);
    // Jamás filtra title/phiEf al modelo.
    expect(snap.valores).not.toHaveProperty('title');
    expect(snap.valores).not.toHaveProperty('phiEf');
  });

  it('estado con b y Nd tocados → esas dos claves FUERA de sin_confirmar; el resto dentro', () => {
    const snap = parseSnap({ ...rcColumnDefaults, b: 400, Nd: 1500 });
    expect(snap.valores.b_mm).toBe(400);
    expect(snap.valores.Nd_kN).toBe(1500);
    expect(snap.sin_confirmar).not.toContain('b_mm');
    expect(snap.sin_confirmar).not.toContain('Nd_kN');
    expect(snap.sin_confirmar).toEqual(ALL_KEYS.filter((k) => k !== 'b_mm' && k !== 'Nd_kN'));
  });

  it('sin_confirmar se compara sobre el valor de ESTADO (sectionType circular tocado sale de la lista)', () => {
    const snap = parseSnap({ ...rcColumnDefaults, sectionType: 'circular', D: 450 });
    expect(snap.valores.sectionType).toBe('circular');
    expect(snap.valores.D_mm).toBe(450);
    expect(snap.sin_confirmar).toEqual(ALL_KEYS.filter((k) => k !== 'sectionType' && k !== 'D_mm'));
  });

  it('snapshot con opcionales ausentes (estado antiguo) → fallbacks rectangular/350/6/16, y cuentan como sin confirmar', () => {
    const legacy: RCColumnInputs = { ...rcColumnDefaults };
    delete legacy.sectionType;
    delete legacy.D;
    delete legacy.nBarsCirc;
    delete legacy.circBarDiam;
    const snap = parseSnap(legacy);
    expect(snap.valores.sectionType).toBe('rectangular');
    expect(snap.valores.D_mm).toBe(350);
    expect(snap.valores.nBarsCirc).toBe(6);
    expect(snap.valores.circBarDiam_mm).toBe(16);
    // El fallback coincide con el default → nadie los ha tocado.
    expect(snap.sin_confirmar).toEqual(ALL_KEYS);
  });

  it("id 'rc-columns' y payloadSchema canónico coherente (required = properties, con warnings)", () => {
    expect(rcColumnsAdapter.id).toBe('rc-columns');
    expect(rcColumnsAdapter.label.length).toBeGreaterThan(0);
    expect(rcColumnsAdapter.placeholder.length).toBeGreaterThan(0);
    expect(rcColumnsAdapter.promptRules).toMatch(/β/);
    const schema = rcColumnsAdapter.payloadSchema as {
      type: string;
      additionalProperties: boolean;
      required: string[];
      properties: Record<string, unknown>;
    };
    expect(schema.type).toBe('object');
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toContain('warnings');
    expect([...schema.required].sort()).toEqual(Object.keys(schema.properties).sort());
    // Enums con null (estilo canónico) en los catálogos.
    const fck = schema.properties.fck_MPa as { enum: unknown[] };
    expect(fck.enum).toContain(null);
    expect(fck.enum).toContain(25);
    expect(fck.enum).not.toContain(28);
  });
});

// Guardarraíles de seguridad (src/lib/ai/safety.ts + RC_COLUMNS_SAFETY_RULES):
// los riesgos MARCAN, no bloquean — el cambio se aplica igual y el bloqueo vive
// en la UI (ProposalCard). En pilares son DATOS del problema (con regla) los
// esfuerzos (Nd/MEdy/MEdz), la longitud L, β y el recubrimiento; la sección, el
// armado y el hormigón son variables de DISEÑO (sin regla: subirlos es la salida
// legítima). El gate anti-ruido exige que el valor vigente NO sea el de fábrica.
describe('rcColumnsAdapter — guardarraíles de seguridad (risks)', () => {
  it('bajar el axil CONFIRMADO (Nd 900 → 600) → 1 riesgo en Nd; y el cambio SÍ se aplica (marca, no bloquea)', () => {
    const current: RCColumnInputs = { ...rcColumnDefaults, Nd: 900 };
    const p = plan({ Nd_kN: 600 }, current);

    // Los riesgos NO bloquean: el campo sigue en fields y en changes.
    expect(p.fields).toEqual({ Nd: 600 });
    const ch = changeFor(p, 'Axil Nd')!;
    expect(ch).toMatchObject({ field: 'Nd', before: '900.00 kN', after: '600.00 kN' });

    expect(p.risks).toHaveLength(1);
    expect(p.risks[0]).toMatchObject({
      field: 'Nd', label: 'Axil Nd', before: '900.00 kN', after: '600.00 kN',
    });
    // before/after son EXACTAMENTE los del change (formateados una sola vez).
    expect(p.risks[0].before).toBe(ch.before);
    expect(p.risks[0].after).toBe(ch.after);
    expect(p.risks[0].why).toMatch(/axil/i);
  });

  it('GATE ANTI-RUIDO: con el estado en DEFAULTS, bajar Nd (500 → 300) NO genera riesgo', () => {
    // Nd sigue en su valor de fábrica → nadie lo fijó → el usuario está
    // aportando el dato del enunciado, no debilitando uno ya establecido.
    const p = plan({ Nd_kN: 300 });
    expect(p.fields).toEqual({ Nd: 300 });
    expect(changeFor(p, 'Axil Nd')).toMatchObject({ before: '500.00 kN', after: '300.00 kN' });
    expect(p.risks).toEqual([]);
  });

  it('bajar β CONFIRMADO (2.0 → 0.7) → riesgo', () => {
    // OJO: el default de β es 1, así que un β=1 "confirmado" por el usuario es
    // indistinguible del de fábrica y el gate anti-ruido lo deja pasar sin aviso;
    // aquí se parte de β=2 (ménsula), que sí está fuera del default.
    const current: RCColumnInputs = { ...rcColumnDefaults, beta: 2 };
    const p = plan({ beta: 0.7 }, current);
    expect(p.fields).toEqual({ beta: 0.7 });
    expect(p.risks).toHaveLength(1);
    expect(p.risks[0]).toMatchObject({
      field: 'beta', label: 'Coeficiente de pandeo β', before: '2.00', after: '0.70',
    });
    expect(p.risks[0].why).toMatch(/pandeo/i);
  });

  it('bajar el recubrimiento CONFIRMADO (40 → 25 mm) → riesgo (lo fija la durabilidad, no la comprobación)', () => {
    const current: RCColumnInputs = { ...rcColumnDefaults, cover: 40 };
    const p = plan({ cover_mm: 25 }, current);
    expect(p.fields).toEqual({ cover: 25 });
    expect(p.risks).toHaveLength(1);
    expect(p.risks[0]).toMatchObject({
      field: 'cover', label: 'Recubrimiento mecánico', before: '40 mm', after: '25 mm',
    });
    expect(p.risks[0].why).toMatch(/durabilidad/i);
  });

  it('bajar L y los momentos CONFIRMADOS → un riesgo por campo, en el orden de changes', () => {
    const current: RCColumnInputs = { ...rcColumnDefaults, L: 5, MEdy: 60, MEdz: 25 };
    const p = plan({ L_m: 3, MEdy_kNm: 20, MEdz_kNm: 5 }, current);
    expect(p.fields).toEqual({ L: 3, MEdy: 20, MEdz: 5 });
    expect(p.risks.map((r) => r.field)).toEqual(['L', 'MEdy', 'MEdz']);
    expect(p.risks.map((r) => r.field)).toEqual(p.changes.map((c) => c.field));
    expect(p.risks[0]).toMatchObject({ before: '5.00 m', after: '3.00 m' });
    expect(p.risks[1]).toMatchObject({ before: '60.00 kNm', after: '20.00 kNm' });
    expect(p.risks[2]).toMatchObject({ before: '25.00 kNm', after: '5.00 kNm' });
  });

  it('SUBIR un esfuerzo confirmado (Nd 900 → 1200) → cambio sin riesgo (solo se marca la BAJADA)', () => {
    const current: RCColumnInputs = { ...rcColumnDefaults, Nd: 900 };
    const p = plan({ Nd_kN: 1200 }, current);
    expect(p.fields).toEqual({ Nd: 1200 });
    expect(p.risks).toEqual([]);
  });

  it('subir sección, armado y hormigón (variables de DISEÑO) → SIN riesgo, aunque el estado esté confirmado', () => {
    // La salida legítima cuando el pilar no cumple: más sección, más armadura,
    // mejor hormigón. Aquí NO se sobre-avisa (ninguno tiene regla de seguridad).
    const current: RCColumnInputs = {
      ...rcColumnDefaults, b: 350, h: 400, fck: 25, cornerBarDiam: 16, Nd: 900,
    };
    const p = plan({
      b_mm: 450, h_mm: 500, fck_MPa: 30,
      cornerBarDiam_mm: 20, nBarsX: 2, barDiamX_mm: 16, stirrupSpacing_mm: 100,
    }, current);
    expect(p.fields).toEqual({
      b: 450, h: 500, fck: 30, cornerBarDiam: 20, nBarsX: 2, barDiamX: 16, stirrupSpacing: 100,
    });
    expect(p.changes).toHaveLength(7);
    expect(p.risks).toEqual([]);
  });

  it('plan sin cambios peligrosos → risks = [] (campo SIEMPRE presente, nunca undefined)', () => {
    expect(plan().risks).toEqual([]);
    expect(plan({ fck_MPa: 30 }).risks).toEqual([]);
  });
});

describe('summarizeRCColumnResults — resumen de resultados (motor real)', () => {
  it('defaults (300×300, Nd 500) cumple → verdict ok coherente con overallStatus y armado al final', () => {
    const r = calcRCColumn(rcColumnDefaults);
    expect(r.valid).toBe(true);
    const s = summarizeRCColumnResults(r);
    expect(s.verdict).toBe(overallStatus(r.checks));
    expect(s.verdict).toBe('ok');
    expect(s.text).toContain('VEREDICTO GLOBAL: CUMPLE');
    // La línea extra del módulo va al final, con el despiece literal del motor.
    expect(r.rebarSchedule).toBe('4Ø16c (Ø6/c140)');
    expect(s.text.split('\n').at(-1)).toBe(`Armado resultante: ${r.rebarSchedule}`);
  });

  it('Nd = 20000 kN → verdict fail con [INCUMPLE] en nd-max y nm-y/z; el armado sigue presente (cálculo válido)', () => {
    const r = calcRCColumn({ ...rcColumnDefaults, Nd: 20000 });
    expect(r.valid).toBe(true);
    const s = summarizeRCColumnResults(r);
    expect(s.verdict).toBe('fail');
    expect(s.text).toContain('VEREDICTO GLOBAL: INCUMPLE');
    expect(s.text).toContain('[INCUMPLE] NEd ≤ NRd,max');
    expect(s.text).toContain('[INCUMPLE] MEd,tot,y');
    expect(s.text).toContain('[INCUMPLE] MEd,tot,z');
    expect(s.text.split('\n').at(-1)).toBe(`Armado resultante: ${r.rebarSchedule}`);
  });

  it('circular D 350 (fork calcRCColumnCirc) → verdict ok y armado del anillo 6Ø16', () => {
    const r = calcRCColumn({ ...rcColumnDefaults, sectionType: 'circular', D: 350 });
    expect(r.valid).toBe(true);
    expect(r.sectionType).toBe('circular');
    const s = summarizeRCColumnResults(r);
    expect(s.verdict).toBe(overallStatus(r.checks));
    expect(s.verdict).toBe('ok');
    expect(r.rebarSchedule).toBe('6Ø16 (Ø6/c140)');
    expect(s.text.split('\n').at(-1)).toBe(`Armado resultante: ${r.rebarSchedule}`);
  });

  it('Nd = 0 (< 1 kN dispara invalid()) → verdict invalid con "CÁLCULO NO VÁLIDO" y sin línea de armado', () => {
    const r = calcRCColumn({ ...rcColumnDefaults, Nd: 0 });
    expect(r.valid).toBe(false);
    expect(r.error).toBe('NEd debe ser ≥ 1 kN (módulo para flexocompresión)');
    const s = summarizeRCColumnResults(r);
    expect(s.verdict).toBe('invalid');
    expect(s.text).toContain('CÁLCULO NO VÁLIDO: NEd debe ser ≥ 1 kN');
    expect(s.text).not.toContain('Armado resultante');
  });
});
