// Tests de parseExtraction (src/lib/ai/validate.ts) — normalización DEFENSIVA
// del JSON crudo del LLM a SteelBeamExtraction. Contrato (plan T1.3):
//   - raw no-objeto → throw AiError('bad-response')
//   - campo con tipo incorrecto o número no finito → null (no throw)
//   - enum fuera de lista → null
//   - warnings: filtra a strings; si falta o no es array → []
// Funciones puras: sin mocks de red ni de módulos.

import { describe, it, expect } from 'vitest';
import { parseExtraction } from '../../lib/ai/validate';
import { AiError } from '../../lib/ai/types';

/** Raw completo y válido, con la forma exacta que promete el JSON Schema. */
const VALID_RAW = {
  tipo: 'HEB',
  size: 200,
  tubo_h_mm: null,
  tubo_b_mm: null,
  tubo_t_mm: null,
  steel: 'S355',
  beamType: 'cantilever',
  L_m: 8,
  Lcr_m: 2.5,
  deflLimit: 400,
  elsCombo: 'frequent',
  useCategory: 'B',
  gk_kNm2: 2.5,
  qk_kNm2: 3,
  bTrib_m: 4,
  warnings: ['unidades convertidas de kp/m² a kN/m²'],
};

/** Ejecuta parseExtraction y devuelve el kind del AiError lanzado (o null si no lanza). */
function thrownKind(raw: unknown): string | null {
  try {
    parseExtraction(raw);
    return null;
  } catch (e) {
    return e instanceof AiError ? e.kind : `no-AiError: ${String(e)}`;
  }
}

describe('parseExtraction — raw válido', () => {
  it('un objeto completo y válido pasa con todos los campos intactos', () => {
    expect(parseExtraction(VALID_RAW)).toEqual(VALID_RAW);
  });

  it('todos los campos null (schema todo-null) pasan como null', () => {
    const allNull = {
      tipo: null, size: null,
      tubo_h_mm: null, tubo_b_mm: null, tubo_t_mm: null,
      steel: null, beamType: null,
      L_m: null, Lcr_m: null, deflLimit: null, elsCombo: null,
      useCategory: null, gk_kNm2: null, qk_kNm2: null, bTrib_m: null,
      warnings: [],
    };
    expect(parseExtraction(allNull)).toEqual(allNull);
  });
});

describe('parseExtraction — raw no-objeto → AiError bad-response', () => {
  it.each([
    ['string', 'no soy un objeto'],
    ['null', null],
    ['número', 42],
    ['array', [1, 2, 3]],
    ['undefined', undefined],
    ['boolean', true],
  ])('raw %s lanza AiError con kind bad-response', (_name, raw) => {
    expect(() => parseExtraction(raw)).toThrow(AiError);
    expect(thrownKind(raw)).toBe('bad-response');
  });
});

describe('parseExtraction — campos defensivos (null, nunca throw)', () => {
  it('campo numérico con tipo erróneo (L_m: "ocho") → null, resto intacto', () => {
    const out = parseExtraction({ ...VALID_RAW, L_m: 'ocho' });
    expect(out.L_m).toBeNull();
    expect(out.tipo).toBe('HEB');
    expect(out.size).toBe(200);
    expect(out.qk_kNm2).toBe(3);
  });

  it('enum fuera de lista (tipo: "UPN") → null', () => {
    expect(parseExtraction({ ...VALID_RAW, tipo: 'UPN' }).tipo).toBeNull();
  });

  it('otros enums fuera de lista → null (steel, beamType, elsCombo, deflLimit)', () => {
    const out = parseExtraction({
      ...VALID_RAW,
      steel: 'S235',
      beamType: 'fixed',
      elsCombo: 'rare',
      deflLimit: 350,
    });
    expect(out.steel).toBeNull();
    expect(out.beamType).toBeNull();
    expect(out.elsCombo).toBeNull();
    expect(out.deflLimit).toBeNull();
  });

  it("useCategory 'custom' NO es válido en la extracción (lo decide el mapper) → null", () => {
    expect(parseExtraction({ ...VALID_RAW, useCategory: 'custom' }).useCategory).toBeNull();
  });

  it('deflLimit como string "400" → null (enum numérico estricto)', () => {
    expect(parseExtraction({ ...VALID_RAW, deflLimit: '400' }).deflLimit).toBeNull();
  });

  it('números no finitos (NaN / Infinity / -Infinity) → null', () => {
    const out = parseExtraction({
      ...VALID_RAW,
      L_m: Number.NaN,
      gk_kNm2: Number.POSITIVE_INFINITY,
      size: Number.NEGATIVE_INFINITY,
    });
    expect(out.L_m).toBeNull();
    expect(out.gk_kNm2).toBeNull();
    expect(out.size).toBeNull();
  });

  it('dimensiones de tubo no-numéricas → null (defensivo)', () => {
    const out = parseExtraction({ ...VALID_RAW, tubo_h_mm: '150', tubo_t_mm: Number.NaN, tubo_b_mm: 100 });
    expect(out.tubo_h_mm).toBeNull();   // string → null
    expect(out.tubo_t_mm).toBeNull();   // NaN → null
    expect(out.tubo_b_mm).toBe(100);    // número finito pasa
  });

  it('familias tubulares (SHS/RHS/CHS) y el cajón 2UPN pasan el enum de tipo', () => {
    for (const t of ['SHS', 'RHS', 'CHS', '2UPN']) {
      expect(parseExtraction({ ...VALID_RAW, tipo: t }).tipo).toBe(t);
    }
  });
});

describe('parseExtraction — warnings', () => {
  it('warnings ausente → []', () => {
    const { warnings: _omitted, ...sinWarnings } = VALID_RAW;
    expect(parseExtraction(sinWarnings).warnings).toEqual([]);
  });

  it('warnings no-array (string) → []', () => {
    expect(parseExtraction({ ...VALID_RAW, warnings: 'un aviso suelto' }).warnings).toEqual([]);
  });

  it('warnings con elementos no-string → se filtran, quedan solo los strings', () => {
    const out = parseExtraction({
      ...VALID_RAW,
      warnings: [1, 'aviso válido', null, { msg: 'objeto' }, 'otro aviso', false],
    });
    expect(out.warnings).toEqual(['aviso válido', 'otro aviso']);
  });
});
