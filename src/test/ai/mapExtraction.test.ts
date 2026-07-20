// Tests de buildApplyPlan (src/lib/ai/mapExtraction.ts) — las 9 reglas
// normativas del plan T1.3: SI interno (L/Lcr en mm), rangos sin clamp,
// tipo+size contra catálogo, autorrelleno useCategory/qk, doble check de
// deflLimit, "Ya coincide" ante igualdad, nunca esfuerzos, formato
// before/after, labels españoles y notFound. Funciones puras, sin mocks.
// Al final, los guardarraíles de seguridad: el que RECHAZA (envolvente de qk) y
// el que MARCA (plan.risks, safety.ts + STEEL_SAFETY_RULES).
//
// current = steelBeamDefaults: IPE 300 · S275 · ss · L 6000 mm · Lcr 6000 mm
// · L/300 · characteristic · A1 · gk 1.0 · qk 2.0 · bTrib 3.0. system = 'si'.

import { describe, it, expect } from 'vitest';
import { buildApplyPlan, type ApplyPlan } from '../../lib/ai/mapExtraction';
import type { SteelBeamExtraction } from '../../lib/ai/types';
import { steelBeamDefaults, type SteelBeamInputs } from '../../data/defaults';
import { USE_CATEGORIES } from '../../lib/calculations/loadGen';

const SYSTEM = 'si' as const;
const ALREADY = 'Ya coincide con el valor actual';

/** Extraction todo-null + warnings vacíos, con overrides parciales. */
function makeExtraction(partial: Partial<SteelBeamExtraction> = {}): SteelBeamExtraction {
  return {
    tipo: null, size: null,
    tubo_h_mm: null, tubo_b_mm: null, tubo_t_mm: null,
    steel: null, beamType: null,
    L_m: null, Lcr_m: null, deflLimit: null, elsCombo: null,
    useCategory: null, gk_kNm2: null, qk_kNm2: null, bTrib_m: null,
    warnings: [],
    ...partial,
  };
}

function plan(partial: Partial<SteelBeamExtraction> = {}): ApplyPlan {
  return buildApplyPlan(makeExtraction(partial), steelBeamDefaults, SYSTEM);
}

const changeFor = (p: ApplyPlan, label: string) => p.changes.find((c) => c.label === label);
const skipFor = (p: ApplyPlan, label: string) => p.skipped.find((s) => s.label === label);
const catLabel = (v: string) => USE_CATEGORIES.find((c) => c.value === v)!.label;

/** Los 12 labels de la regla 9, en el orden del extraction. */
const ALL_LABELS = [
  'Tipo de perfil', 'Perfil', 'Acero', 'Tipo de viga', 'Luz L',
  'Long. pandeo Lcr', 'Límite de flecha', 'Combinación ELS',
  'Categoría de uso', 'Carga permanente gk', 'Sobrecarga qk', 'Ancho tributario',
];

describe('buildApplyPlan — Luz L (reglas 1, 2, 8)', () => {
  it('L_m 8 → fields.L = 8000 mm y change "6.00 m → 8.00 m"', () => {
    const p = plan({ L_m: 8 });
    expect(p.fields).toEqual({ L: 8000 });
    expect(p.changes).toHaveLength(1);
    expect(p.changes[0]).toEqual({
      field: 'L', label: 'Luz L', before: '6.00 m', after: '8.00 m', value: 8000,
    });
    expect(p.skipped).toEqual([]);
    expect(p.notFound).not.toContain('Luz L');
    expect(p.notFound).toHaveLength(11);
    expect(p.lcrExplicit).toBe(false);
  });

  it('L_m 0.2 (fuera de rango [0.5, 40]) → skipped con motivo legible, sin clamp', () => {
    const p = plan({ L_m: 0.2 });
    expect(p.fields).toEqual({});
    expect(p.changes).toEqual([]);
    expect(p.skipped).toHaveLength(1);
    expect(p.skipped[0].label).toBe('Luz L');
    expect(p.skipped[0].reason).toMatch(/fuera del rango/);
    expect(p.skipped[0].reason).toContain('0.5');
    expect(p.skipped[0].reason).toContain('40');
    // Se extrajo (no es null): no debe aparecer en notFound.
    expect(p.notFound).not.toContain('Luz L');
  });

  it('L_m 6 (igual al current tras redondear a mm) → skipped "Ya coincide"', () => {
    const p = plan({ L_m: 6 });
    expect(p.fields).toEqual({});
    expect(p.skipped).toEqual([{ label: 'Luz L', reason: ALREADY }]);
  });
});

describe('buildApplyPlan — tipo + size contra catálogo (regla 3)', () => {
  it("tipo 'HEB' + size 200 → ambos aplicados (HEB 200 existe)", () => {
    const p = plan({ tipo: 'HEB', size: 200 });
    expect(p.fields).toEqual({ tipo: 'HEB', size: 200 });
    expect(changeFor(p, 'Tipo de perfil')).toMatchObject({
      field: 'tipo', before: 'IPE', after: 'HEB', value: 'HEB',
    });
    expect(changeFor(p, 'Perfil')).toMatchObject({
      field: 'size', before: 'IPE 300', after: 'HEB 200', value: 200,
    });
    expect(p.skipped).toEqual([]);
  });

  it("tipo 'HEB' + size 305 → tipo aplicado; size skipped por catálogo (contra el tipo NUEVO)", () => {
    const p = plan({ tipo: 'HEB', size: 305 });
    // El tipo SÍ se aplica aunque el size no exista.
    expect(p.fields).toEqual({ tipo: 'HEB' });
    expect(changeFor(p, 'Tipo de perfil')).toMatchObject({ before: 'IPE', after: 'HEB' });
    // El size se valida contra el tipoEfectivo (HEB, el extraído), no el actual.
    expect(skipFor(p, 'Perfil')).toEqual({
      label: 'Perfil', reason: 'HEB 305 no existe en el catálogo',
    });
    expect(p.fields.size).toBeUndefined();
    expect(p.notFound).not.toContain('Perfil');
  });

  it("tipo 'IPE' solo (igual al actual, regla 6) → skipped \"Ya coincide\", NO change", () => {
    const p = plan({ tipo: 'IPE' });
    expect(p.fields).toEqual({});
    expect(p.changes).toEqual([]);
    expect(p.skipped).toEqual([{ label: 'Tipo de perfil', reason: ALREADY }]);
  });

  it('size 200 sin tipo → se valida contra el tipo actual (IPE 200 existe) y se aplica', () => {
    const p = plan({ size: 200 });
    expect(p.fields).toEqual({ size: 200 });
    expect(changeFor(p, 'Perfil')).toMatchObject({
      field: 'size', before: 'IPE 300', after: 'IPE 200', value: 200,
    });
  });

  it('size 305 sin tipo → skipped "IPE 305 no existe en el catálogo"', () => {
    const p = plan({ size: 305 });
    expect(p.fields).toEqual({});
    expect(skipFor(p, 'Perfil')).toEqual({
      label: 'Perfil', reason: 'IPE 305 no existe en el catálogo',
    });
  });

  it("familia de cajón '2UPN' + size 200 (existe en el catálogo UPN) → aplicado", () => {
    const p = plan({ tipo: '2UPN', size: 200 });
    expect(p.fields).toEqual({ tipo: '2UPN', size: 200 });
    expect(changeFor(p, 'Perfil')).toMatchObject({ after: '2UPN 200', value: 200 });
  });
});

describe('buildApplyPlan — tubos SHS/RHS/CHS (regla 5b)', () => {
  it('RHS + las tres dimensiones → tipo + rhs_h/rhs_b/rhs_t (size no aplica)', () => {
    const p = plan({ tipo: 'RHS', tubo_h_mm: 200, tubo_b_mm: 120, tubo_t_mm: 10 });
    expect(p.fields).toEqual({ tipo: 'RHS', rhs_h: 200, rhs_b: 120, rhs_t: 10 });
    expect(changeFor(p, 'Dimensión del tubo')).toMatchObject({ field: 'rhs_h', after: '200 mm', value: 200 });
    expect(changeFor(p, 'Ancho del tubo')).toMatchObject({ field: 'rhs_b', after: '120 mm', value: 120 });
    expect(changeFor(p, 'Espesor del tubo')).toMatchObject({ field: 'rhs_t', after: '10 mm', value: 10 });
  });

  it('SHS: tubo_h/tubo_t → rhs_h/rhs_t; el ancho (tubo_b) se descarta con motivo', () => {
    const p = plan({ tipo: 'SHS', tubo_h_mm: 160, tubo_b_mm: 160, tubo_t_mm: 6 });
    expect(p.fields).toEqual({ tipo: 'SHS', rhs_h: 160, rhs_t: 6 });
    expect(p.fields.rhs_b).toBeUndefined();
    expect(skipFor(p, 'Ancho del tubo')?.reason).toContain('solo se usa con RHS');
  });

  it('CHS: tubo_h → chs_D, tubo_t → chs_t; ancho descartado', () => {
    const p = plan({ tipo: 'CHS', tubo_h_mm: 219.1, tubo_b_mm: 219.1, tubo_t_mm: 10 });
    expect(p.fields).toEqual({ tipo: 'CHS', chs_D: 219.1, chs_t: 10 });
    expect(skipFor(p, 'Ancho del tubo')).toBeDefined();
  });

  it("size propuesto sobre un tubo → skipped (los tubos no usan «size»)", () => {
    const p = plan({ tipo: 'SHS', size: 160, tubo_h_mm: 160, tubo_t_mm: 6 });
    expect(p.fields.size).toBeUndefined();
    expect(skipFor(p, 'Perfil')?.reason).toContain('no usan «size»');
  });

  it('dimensiones de tubo sobre un perfil ABIERTO (IPE) → descartadas, no aplicadas', () => {
    const p = plan({ tubo_h_mm: 200, tubo_t_mm: 8 });   // tipo actual = IPE
    expect(p.fields).toEqual({});
    expect(skipFor(p, 'Dimensión del tubo')?.reason).toContain('solo se usan con las familias SHS, RHS o CHS');
    expect(skipFor(p, 'Espesor del tubo')).toBeDefined();
    // Los campos de tubo NUNCA entran en notFound (no son "dato pendiente").
    expect(p.notFound).not.toContain('Dimensión del tubo');
    expect(p.notFound).not.toContain('Ancho del tubo');
    expect(p.notFound).not.toContain('Espesor del tubo');
  });

  it('dimensión de tubo fuera de rango → skipped con motivo de rango', () => {
    const p = plan({ tipo: 'RHS', tubo_t_mm: 0.2 });
    expect(p.fields.rhs_t).toBeUndefined();
    expect(skipFor(p, 'Espesor del tubo')?.reason).toContain('fuera del rango admisible');
  });
});

describe('buildApplyPlan — useCategory / qk (regla 4)', () => {
  it("useCategory 'B' sin qk → categoría aplicada + qk canónico 3.0 propuesto (autorrelleno UI)", () => {
    const p = plan({ useCategory: 'B' });
    expect(p.fields).toEqual({ useCategory: 'B', qk: 3 });
    expect(changeFor(p, 'Categoría de uso')).toMatchObject({
      field: 'useCategory', before: catLabel('A1'), after: catLabel('B'), value: 'B',
    });
    expect(changeFor(p, 'Sobrecarga qk')).toMatchObject({
      field: 'qk', before: '2.00 kN/m²', after: '3.00 kN/m²', value: 3,
    });
    expect(p.warnings).toEqual([]);
    // El mapper resolvió el qk (aunque el LLM no lo dio): no va a notFound.
    expect(p.notFound).not.toContain('Sobrecarga qk');
  });

  it("useCategory 'B' + qk 4.5 (distinto del canónico) → 'custom' + qk extraído + warning", () => {
    const p = plan({ useCategory: 'B', qk_kNm2: 4.5 });
    expect(p.fields).toEqual({ useCategory: 'custom', qk: 4.5 });
    expect(changeFor(p, 'Categoría de uso')).toMatchObject({
      after: catLabel('custom'), value: 'custom',
    });
    expect(changeFor(p, 'Sobrecarga qk')).toMatchObject({ after: '4.50 kN/m²', value: 4.5 });
    expect(p.warnings).toHaveLength(1);
    expect(p.warnings[0]).toMatch(/no coincide/);
    expect(p.warnings[0]).toMatch(/personalizada/);
  });

  it("useCategory 'B' + qk 3.01 (coincidente ±0.01) → categoría B con su qk CANÓNICO (3.0, no 3.01), sin warning", () => {
    const p = plan({ useCategory: 'B', qk_kNm2: 3.01 });
    expect(p.fields).toEqual({ useCategory: 'B', qk: 3 });
    expect(changeFor(p, 'Sobrecarga qk')).toMatchObject({ after: '3.00 kN/m²', value: 3 });
    expect(p.warnings).toEqual([]);
  });

  it("solo qk 4.5 → 'custom' + qk; 'Categoría de uso' NO aparece en notFound (la resolvió el mapper)", () => {
    const p = plan({ qk_kNm2: 4.5 });
    expect(p.fields).toEqual({ useCategory: 'custom', qk: 4.5 });
    expect(changeFor(p, 'Categoría de uso')).toMatchObject({
      before: catLabel('A1'), after: catLabel('custom'), value: 'custom',
    });
    expect(p.notFound).not.toContain('Categoría de uso');
    expect(p.notFound).not.toContain('Sobrecarga qk');
    expect(p.warnings).toEqual([]);
  });

  it("useCategory 'B' + qk 60 (fuera de rango) → qk skipped por rango Y categoría aplicada con qk canónico", () => {
    const p = plan({ useCategory: 'B', qk_kNm2: 60 });
    // El qk extraído se descarta por rango…
    expect(skipFor(p, 'Sobrecarga qk')).toBeDefined();
    expect(skipFor(p, 'Sobrecarga qk')!.reason).toMatch(/fuera del rango/);
    // …pero la categoría se aplica con su qk canónico (como si el LLM no hubiera dado qk).
    expect(p.fields).toEqual({ useCategory: 'B', qk: 3 });
    expect(changeFor(p, 'Sobrecarga qk')).toMatchObject({ after: '3.00 kN/m²', value: 3 });
  });

  it("useCategory 'A1' (igual al current, con qk canónico = current.qk) → ambos skipped \"Ya coincide\"", () => {
    const p = plan({ useCategory: 'A1' });
    expect(p.fields).toEqual({});
    expect(p.changes).toEqual([]);
    expect(skipFor(p, 'Categoría de uso')).toEqual({ label: 'Categoría de uso', reason: ALREADY });
    expect(skipFor(p, 'Sobrecarga qk')).toEqual({ label: 'Sobrecarga qk', reason: ALREADY });
  });
});

// Contrato de cargas: qk es la acción variable ENVOLVENTE (la más desfavorable
// de uso/nieve/viento), no la última mencionada. El guardarraíl rechaza el qk
// que CONTRADICE la categoría en vigor (por debajo de su sobrecarga de tabla) —
// el caso real: la nieve de Málaga (0.20) escrita encima de la sobrecarga de
// mantenimiento de cubierta G1 (1.00), que la envuelve y sigue gobernando.
describe('buildApplyPlan — guardarraíl de envolvente qk (contrato de cargas)', () => {
  const withCurrent = (partial: Partial<SteelBeamExtraction>, current: SteelBeamInputs) =>
    buildApplyPlan(makeExtraction(partial), current, SYSTEM);

  it("G1 + qk 0.20 (nieve sobre la sobrecarga de mantenimiento) → G1 con su qk 1.0; el 0.20 NUNCA se aplica", () => {
    const p = plan({ useCategory: 'G1', qk_kNm2: 0.2 });
    expect(p.fields).toEqual({ useCategory: 'G1', qk: 1 });
    expect(changeFor(p, 'Sobrecarga qk')).toMatchObject({ after: '1.00 kN/m²', value: 1 });
    // NO cae en la rama "categoría + qk distinto → personalizada" (esa aplicaba el 0.20):
    expect(p.fields.useCategory).not.toBe('custom');
    const aviso = p.warnings.find((w) => w.startsWith('Aviso de seguridad:'));
    expect(aviso).toBeDefined();
    expect(aviso).toContain('0.20');
    expect(aviso).toContain('1.00');
    expect(aviso).toMatch(/envolvente/);
  });

  it('qk 0.20 sin categoría, con G1 ya en el estado → qk no aplicado (skipped con motivo) + aviso', () => {
    const current: SteelBeamInputs = { ...steelBeamDefaults, useCategory: 'G1', qk: 1 };
    const p = withCurrent({ qk_kNm2: 0.2 }, current);
    expect(p.fields).toEqual({});
    expect(changeFor(p, 'Sobrecarga qk')).toBeUndefined();
    expect(skipFor(p, 'Sobrecarga qk')!.reason).toMatch(/MÁS DESFAVORABLE/);
    expect(p.warnings.some((w) => w.startsWith('Aviso de seguridad:'))).toBe(true);
    // se extrajo (no es null): tampoco puede colarse en notFound
    expect(p.notFound).not.toContain('Sobrecarga qk');
  });

  it("categoría 'Personalizada' en el estado → sin qk de tabla que contradecir: 0.20 se aplica (escape del usuario)", () => {
    const current: SteelBeamInputs = { ...steelBeamDefaults, useCategory: 'custom', qk: 1 };
    const p = withCurrent({ qk_kNm2: 0.2 }, current);
    expect(p.fields).toEqual({ qk: 0.2 });
    expect(changeFor(p, 'Sobrecarga qk')).toMatchObject({ after: '0.20 kN/m²', value: 0.2 });
    expect(p.warnings).toEqual([]);
  });

  it('una acción variable MAYOR sí gobierna: G1 + qk 1.5 → personalizada con 1.5 (sin aviso)', () => {
    const p = plan({ useCategory: 'G1', qk_kNm2: 1.5 });
    expect(p.fields).toEqual({ useCategory: 'custom', qk: 1.5 });
    expect(p.warnings.some((w) => w.startsWith('Aviso de seguridad:'))).toBe(false);
  });

  it('bajar qk por un cambio legítimo de categoría (A1 2.0 → G1 1.0) no dispara el aviso', () => {
    const p = plan({ useCategory: 'G1' });
    expect(p.fields).toEqual({ useCategory: 'G1', qk: 1 });
    expect(p.warnings).toEqual([]);
  });

  it('qk por debajo de la categoría por defecto A1 (2.0) también se rechaza: hay que nombrar la categoría', () => {
    const p = plan({ qk_kNm2: 0.2 });
    expect(p.fields).toEqual({});
    expect(skipFor(p, 'Sobrecarga qk')).toBeDefined();
    expect(p.warnings.some((w) => w.startsWith('Aviso de seguridad:'))).toBe(true);
  });
});

describe('buildApplyPlan — deflLimit (regla 5, doble check defensivo)', () => {
  it('deflLimit 350 forzado con cast → skipped, nunca aplicado', () => {
    const p = plan({ deflLimit: 350 as unknown as SteelBeamExtraction['deflLimit'] });
    expect(p.fields).toEqual({});
    expect(p.changes).toEqual([]);
    expect(p.skipped).toHaveLength(1);
    expect(p.skipped[0].label).toBe('Límite de flecha');
    expect(p.skipped[0].reason).toContain('L/350');
  });

  it('deflLimit 400 válido → change "L/300 → L/400" (formato regla 8)', () => {
    const p = plan({ deflLimit: 400 });
    expect(p.fields).toEqual({ deflLimit: 400 });
    expect(p.changes[0]).toMatchObject({
      field: 'deflLimit', label: 'Límite de flecha', before: 'L/300', after: 'L/400', value: 400,
    });
  });
});

describe('buildApplyPlan — Lcr explícita', () => {
  it('Lcr_m 2 → fields.Lcr = 2000 mm y lcrExplicit = true', () => {
    const p = plan({ Lcr_m: 2 });
    expect(p.fields).toEqual({ Lcr: 2000 });
    expect(p.lcrExplicit).toBe(true);
    expect(changeFor(p, 'Long. pandeo Lcr')).toMatchObject({
      field: 'Lcr', before: '6.00 m', after: '2.00 m', value: 2000,
    });
  });

  it('Lcr_m ausente → lcrExplicit = false', () => {
    expect(plan({ L_m: 8 }).lcrExplicit).toBe(false);
    expect(plan().lcrExplicit).toBe(false);
  });

  it('Lcr_m 6 (igual al current) → skipped y lcrExplicit = false', () => {
    const p = plan({ Lcr_m: 6 });
    expect(p.fields).toEqual({});
    expect(skipFor(p, 'Long. pandeo Lcr')).toEqual({ label: 'Long. pandeo Lcr', reason: ALREADY });
    expect(p.lcrExplicit).toBe(false);
  });
});

describe('buildApplyPlan — igualdad con el actual (regla 6)', () => {
  it('extraction espejo del current → 0 changes, todo skipped "Ya coincide", notFound vacío', () => {
    const p = plan({
      tipo: 'IPE', size: 300, steel: 'S275', beamType: 'ss',
      L_m: 6, Lcr_m: 6, deflLimit: 300, elsCombo: 'characteristic',
      useCategory: 'A1', gk_kNm2: 1.0, bTrib_m: 3.0,
      // qk null: el canónico de A1 (2.0) coincide con current.qk → skipped también.
    });
    expect(p.fields).toEqual({});
    expect(p.changes).toEqual([]);
    expect(p.skipped).toHaveLength(12);
    for (const s of p.skipped) expect(s.reason).toBe(ALREADY);
    expect(p.notFound).toEqual([]);
    expect(p.lcrExplicit).toBe(false);
  });
});

describe('buildApplyPlan — extraction todo-null (regla 9)', () => {
  it('fields y changes vacíos; notFound = exactamente los 12 labels en orden', () => {
    const p = plan();
    expect(p.fields).toEqual({});
    expect(p.changes).toEqual([]);
    expect(p.skipped).toEqual([]);
    expect(p.notFound).toEqual(ALL_LABELS);
    expect(p.warnings).toEqual([]);
    expect(p.lcrExplicit).toBe(false);
  });
});

describe('buildApplyPlan — warnings y regla 7', () => {
  it('los warnings del LLM se propagan tal cual a plan.warnings', () => {
    const p = plan({ warnings: ['convertí kp/m² a kN/m²', 'el enunciado daba MEd directamente'] });
    expect(p.warnings).toEqual(['convertí kp/m² a kN/m²', 'el enunciado daba MEd directamente']);
  });

  it('warnings del LLM van ANTES que los del mapper', () => {
    const p = plan({ warnings: ['aviso del LLM'], useCategory: 'B', qk_kNm2: 4.5 });
    expect(p.warnings).toHaveLength(2);
    expect(p.warnings[0]).toBe('aviso del LLM');
    expect(p.warnings[1]).toMatch(/personalizada/);
  });

  it('NUNCA produce MEd/VEd/VEd_interaction/Mser/title, ni con extraction completo (regla 7)', () => {
    const p = plan({
      tipo: 'HEB', size: 200, steel: 'S355', beamType: 'cantilever',
      L_m: 8, Lcr_m: 2, deflLimit: 400, elsCombo: 'frequent',
      useCategory: 'B', gk_kNm2: 2.5, qk_kNm2: 4.5, bTrib_m: 4,
    });
    const allowed = new Set([
      'tipo', 'size', 'steel', 'beamType', 'L', 'Lcr', 'deflLimit',
      'elsCombo', 'useCategory', 'gk', 'qk', 'bTrib',
    ]);
    for (const k of Object.keys(p.fields)) expect(allowed.has(k), `campo inesperado: ${k}`).toBe(true);
    expect(p.fields).not.toHaveProperty('MEd');
    expect(p.fields).not.toHaveProperty('VEd');
    expect(p.fields).not.toHaveProperty('VEd_interaction');
    expect(p.fields).not.toHaveProperty('Mser');
    expect(p.fields).not.toHaveProperty('title');
    // Con todo extraído y distinto: 12 changes, nada en notFound.
    expect(p.changes).toHaveLength(12);
    expect(p.notFound).toEqual([]);
  });
});

describe('buildApplyPlan — formato y redondeos (reglas 1 y 8)', () => {
  it('gk se redondea a 2 decimales y se formatea con formatQuantity (SI)', () => {
    const p = plan({ gk_kNm2: 2.456 });
    expect(p.fields).toEqual({ gk: 2.46 });
    expect(changeFor(p, 'Carga permanente gk')).toMatchObject({
      field: 'gk', before: '1.00 kN/m²', after: '2.46 kN/m²', value: 2.46,
    });
  });

  it('bTrib en m con 2 decimales, sin redondeo del valor interno', () => {
    const p = plan({ bTrib_m: 4.125 });
    expect(p.fields).toEqual({ bTrib: 4.125 });
    expect(changeFor(p, 'Ancho tributario')).toMatchObject({
      field: 'bTrib', before: '3.00 m', after: '4.13 m', value: 4.125,
    });
  });

  it('beamType y elsCombo usan los labels españoles de la regla 8', () => {
    const p = plan({ beamType: 'cantilever', elsCombo: 'frequent' });
    expect(changeFor(p, 'Tipo de viga')).toMatchObject({
      before: 'Biarticulada', after: 'Ménsula', value: 'cantilever',
    });
    expect(changeFor(p, 'Combinación ELS')).toMatchObject({
      before: 'Característica', after: 'Frecuente', value: 'frequent',
    });
  });

  it('gk fuera de rango [0, 50] → skipped, sin clamp', () => {
    const p = plan({ gk_kNm2: -1 });
    expect(p.fields).toEqual({});
    expect(skipFor(p, 'Carga permanente gk')!.reason).toMatch(/fuera del rango/);
  });
});

// Guardarraíles de seguridad — DOS capas independientes y complementarias:
//
//  1. El guardarraíl de ENVOLVENTE de qk (arriba, en mapExtraction) RECHAZA: un
//     qk por debajo de la sobrecarga de la categoría en vigor es una
//     contradicción interna comprobable, así que no se aplica y se avisa.
//  2. El detector genérico (safety.ts + STEEL_SAFETY_RULES) MARCA en
//     plan.risks cualquier propuesta que rebaje un DATO del problema (gk, qk,
//     bTrib, L, Lcr) o relaje un CRITERIO (deflLimit) ya CONFIRMADO. No bloquea:
//     el bloqueo (confirmación explícita) vive en la ProposalCard.
//
// El perfil, el acero y demás variables de DISEÑO no tienen regla: subirlos es
// la salida legítima cuando el cálculo no cumple y avisar ahí sería ruido.
//
// GATE ANTI-RUIDO: si el valor vigente es el de fábrica, nadie lo fijó → el
// usuario está APORTANDO su dato, no debilitando uno establecido → sin riesgo.
//
// Unidades: L y Lcr viven en mm en el estado (el payload del modelo usa metros);
// gk/qk en kN/m². risks.before/after son los MISMOS strings formateados del change.
describe('buildApplyPlan — guardarraíles de seguridad (plan.risks)', () => {
  const withCurrent = (partial: Partial<SteelBeamExtraction>, current: SteelBeamInputs) =>
    buildApplyPlan(makeExtraction(partial), current, SYSTEM);

  // EL INCIDENTE REAL: cubierta de mantenimiento G1 con qk 1.0 (CONFIRMADO: el
  // default es 2.0) y el modelo escribe encima la nieve de Málaga (0.20 kN/m²).
  // La capa que RECHAZA sigue intacta: ese qk nunca llega al formulario.
  it('INCIDENTE: G1 confirmada (qk 1.0) + qk 0.20 (nieve) → NO se aplica, "Aviso de seguridad:" en warnings', () => {
    const current: SteelBeamInputs = { ...steelBeamDefaults, useCategory: 'G1', qk: 1.0 };
    const p = withCurrent({ qk_kNm2: 0.2 }, current);

    expect(p.fields).toEqual({});
    expect(p.changes).toEqual([]);
    expect(changeFor(p, 'Sobrecarga qk')).toBeUndefined();
    expect(skipFor(p, 'Sobrecarga qk')!.reason).toMatch(/MÁS DESFAVORABLE/);

    const aviso = p.warnings.find((w) => w.startsWith('Aviso de seguridad:'));
    expect(aviso).toBeDefined();
    expect(aviso).toContain('0.20');   // el qk propuesto
    expect(aviso).toContain('1.00');   // la sobrecarga de G1, que sigue gobernando

    // La capa 1 cortó el cambio antes de que existiera: sin change no hay riesgo
    // que marcar. Las dos capas no se pisan ni avisan por duplicado.
    expect(p.risks).toEqual([]);
  });

  // La otra mitad del reparto: con categoría 'Personalizada' NO hay qk de tabla
  // que contradecir, así que la capa 1 no tiene nada que rechazar (el usuario
  // eligió ese escape a propósito). La capa 2 sí marca la rebaja de un qk ya
  // establecido. Sin este caso, la regla de qk de STEEL_SAFETY_RULES sería
  // inalcanzable: el guardarraíl de envolvente corta antes en todas las demás rutas.
  it('bajar un qk CONFIRMADO con categoría Personalizada (5.0 → 1.0) → riesgo (la capa 1 no aplica aquí)', () => {
    const current: SteelBeamInputs = { ...steelBeamDefaults, useCategory: 'custom', qk: 5.0 };
    const p = withCurrent({ qk_kNm2: 1.0 }, current);

    expect(p.fields).toEqual({ qk: 1 });                                     // se aplica…
    expect(p.warnings.some((w) => w.startsWith('Aviso de seguridad:'))).toBe(false); // …sin rechazo
    expect(p.risks).toHaveLength(1);                                          // …pero marcado
    expect(p.risks[0]).toMatchObject({
      field: 'qk', label: 'Sobrecarga qk', before: '5.00 kN/m²', after: '1.00 kN/m²',
    });
    expect(p.risks[0].why).toMatch(/ENVOLVENTE/);
  });

  it('bajar un gk CONFIRMADO (4.0 → 2.0) → 1 riesgo en gk, y el cambio SÍ se aplica (marcar ≠ bloquear)', () => {
    const p = withCurrent({ gk_kNm2: 2.0 }, { ...steelBeamDefaults, gk: 4.0 });

    // Los riesgos MARCAN: el plan sigue siendo aplicable (bloquear es cosa de la UI).
    expect(p.fields).toEqual({ gk: 2 });
    const change = changeFor(p, 'Carga permanente gk')!;
    expect(change).toMatchObject({
      field: 'gk', before: '4.00 kN/m²', after: '2.00 kN/m²', value: 2,
    });

    expect(p.risks).toHaveLength(1);
    expect(p.risks[0]).toMatchObject({
      field: 'gk',
      label: 'Carga permanente gk',
      before: change.before,   // mismos strings formateados que el change
      after: change.after,
    });
    expect(p.risks[0].why).toMatch(/ACUMULAN/);   // por qué gk no es variable de diseño
  });

  it('GATE ANTI-RUIDO: con el estado en DEFAULTS, bajar gk (1.0 → 0.5) NO genera riesgo', () => {
    const p = plan({ gk_kNm2: 0.5 });
    // El cambio se aplica igual…
    expect(p.fields).toEqual({ gk: 0.5 });
    expect(changeFor(p, 'Carga permanente gk')).toMatchObject({
      before: '1.00 kN/m²', after: '0.50 kN/m²',
    });
    // …pero nadie había fijado gk: el usuario está aportando su dato, no debilitando uno establecido.
    expect(p.risks).toEqual([]);
  });

  it('relajar el límite de flecha CONFIRMADO (L/400 → L/250) → riesgo; endurecerlo (L/250 → L/400) → ninguno', () => {
    const relajar = withCurrent({ deflLimit: 250 }, { ...steelBeamDefaults, deflLimit: 400 });
    expect(relajar.fields).toEqual({ deflLimit: 250 });
    expect(relajar.risks).toHaveLength(1);
    expect(relajar.risks[0]).toMatchObject({
      field: 'deflLimit', label: 'Límite de flecha', before: 'L/400', after: 'L/250',
    });

    // 250 también es un valor confirmado (≠ default 300): el gate deja pasar la
    // comprobación y aun así no hay riesgo, porque L/400 es MÁS estricto.
    const endurecer = withCurrent({ deflLimit: 400 }, { ...steelBeamDefaults, deflLimit: 250 });
    expect(endurecer.fields).toEqual({ deflLimit: 400 });
    expect(endurecer.risks).toEqual([]);
  });

  it('bajar la luz L confirmada (8 m → 6 m) → riesgo (el estado guarda mm; el payload, metros)', () => {
    const p = withCurrent({ L_m: 6 }, { ...steelBeamDefaults, L: 8000, Lcr: 8000 });
    expect(p.fields).toEqual({ L: 6000 });
    expect(p.risks).toHaveLength(1);
    expect(p.risks[0]).toMatchObject({
      field: 'L', label: 'Luz L', before: '8.00 m', after: '6.00 m',
    });
  });

  it('bajar el ancho tributario confirmado (5.0 m → 3.5 m) → riesgo', () => {
    const p = withCurrent({ bTrib_m: 3.5 }, { ...steelBeamDefaults, bTrib: 5.0 });
    expect(p.fields).toEqual({ bTrib: 3.5 });
    expect(p.risks).toHaveLength(1);
    expect(p.risks[0]).toMatchObject({
      field: 'bTrib', label: 'Ancho tributario', before: '5.00 m', after: '3.50 m',
    });
  });

  it('acortar la Lcr confirmada (8 m → 3 m) → riesgo (subiría artificialmente la resistencia a LTB)', () => {
    const p = withCurrent({ Lcr_m: 3 }, { ...steelBeamDefaults, L: 8000, Lcr: 8000 });
    expect(p.fields).toEqual({ Lcr: 3000 });
    expect(p.lcrExplicit).toBe(true);
    expect(p.risks).toHaveLength(1);
    expect(p.risks[0]).toMatchObject({
      field: 'Lcr', label: 'Long. pandeo Lcr', before: '8.00 m', after: '3.00 m',
    });
  });

  // Contraprueba del principio: no sobre-avisamos. El perfil y el acero son
  // variables de DISEÑO (resistencia) y no tienen regla, así que ni siquiera
  // sobre un size CONFIRMADO (200 ≠ default 300) se marca nada.
  it('subir el perfil (IPE 200 confirmado → IPE 400) y el acero (S275 → S355) → SIN riesgo', () => {
    const p = withCurrent({ size: 400, steel: 'S355' }, { ...steelBeamDefaults, size: 200 });
    expect(p.fields).toEqual({ size: 400, steel: 'S355' });
    expect(p.changes).toHaveLength(2);
    expect(p.risks).toEqual([]);
  });

  it('combinado: sube el perfil Y baja un gk confirmado → exactamente 1 riesgo (solo gk)', () => {
    const p = withCurrent({ size: 400, gk_kNm2: 2.0 }, { ...steelBeamDefaults, gk: 4.0 });
    expect(p.fields).toEqual({ size: 400, gk: 2 });
    expect(p.changes).toHaveLength(2);   // los dos cambios se proponen…
    expect(p.risks).toHaveLength(1);     // …pero solo uno reduce la seguridad
    expect(p.risks[0].field).toBe('gk');
  });
});
