import { AiError, type ChatEnvelope, type SteelBeamExtraction } from './types';

// Listas permitidas (espejo del JSON Schema de schema.ts).
const TIPOS = ['IPE', 'HEA', 'HEB', 'IPN', '2UPN', 'SHS', 'RHS', 'CHS'] as const;
const STEELS = ['S275', 'S355'] as const;
const BEAM_TYPES = ['ss', 'cantilever', 'fp', 'ff'] as const;
const DEFL_LIMITS = [250, 300, 400, 500, 600] as const;
const ELS_COMBOS = ['characteristic', 'frequent', 'quasi-permanent'] as const;
const USE_CATEGORY_CODES = ['A1', 'A2', 'B', 'C1', 'C2', 'C3', 'D1', 'E1', 'G1'] as const;

/** número finito o null (NaN/Infinity/tipo incorrecto → null, defensivo). */
function finiteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** valor dentro de la lista permitida o null. */
function oneOf<T extends string | number>(v: unknown, allowed: readonly T[]): T | null {
  return (allowed as readonly unknown[]).includes(v) ? (v as T) : null;
}

/**
 * Normaliza el JSON crudo del LLM a SteelBeamExtraction.
 * - raw no-objeto → throw AiError('bad-response')
 * - Campo con tipo incorrecto o número no finito → null (defensivo, no throw)
 * - Enum fuera de lista → null
 * - warnings: filtra a strings; si falta o no es array → []
 */
export function parseExtraction(raw: unknown): SteelBeamExtraction {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new AiError('bad-response', 'La respuesta del modelo no es un objeto JSON.');
  }
  const r = raw as Record<string, unknown>;
  return {
    tipo: oneOf(r.tipo, TIPOS),
    size: finiteNumber(r.size),
    tubo_h_mm: finiteNumber(r.tubo_h_mm),
    tubo_b_mm: finiteNumber(r.tubo_b_mm),
    tubo_t_mm: finiteNumber(r.tubo_t_mm),
    steel: oneOf(r.steel, STEELS),
    beamType: oneOf(r.beamType, BEAM_TYPES),
    L_m: finiteNumber(r.L_m),
    Lcr_m: finiteNumber(r.Lcr_m),
    deflLimit: oneOf(r.deflLimit, DEFL_LIMITS),
    elsCombo: oneOf(r.elsCombo, ELS_COMBOS),
    useCategory: oneOf(r.useCategory, USE_CATEGORY_CODES),
    gk_kNm2: finiteNumber(r.gk_kNm2),
    qk_kNm2: finiteNumber(r.qk_kNm2),
    bTrib_m: finiteNumber(r.bTrib_m),
    warnings: Array.isArray(r.warnings)
      ? r.warnings.filter((w): w is string => typeof w === 'string')
      : [],
  };
}

/**
 * Normaliza el envelope conversacional crudo del LLM a ChatEnvelope.
 * - raw no-objeto → throw AiError('bad-response')
 * - `reply` no-string → throw AiError('bad-response')
 * - `proposal` ausente/undefined → null
 * - `proposal` NO se valida más aquí (lo hace adapter.buildPlan).
 */
export function parseChatEnvelope(raw: unknown): ChatEnvelope {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new AiError('bad-response', 'La respuesta del modelo no es un objeto JSON.');
  }
  const r = raw as Record<string, unknown>;
  if (typeof r.reply !== 'string') {
    throw new AiError('bad-response', 'La respuesta del modelo no contiene un campo "reply" de texto.');
  }
  return { reply: r.reply, proposal: r.proposal === undefined ? null : r.proposal };
}
