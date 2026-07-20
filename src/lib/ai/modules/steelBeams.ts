/**
 * Adapter del módulo steel-beams para el chat conversacional (Fase 1).
 * Reutiliza intactos el schema canónico (schema.ts), el parseo defensivo
 * (validate.ts) y el mapper de Fase 0 (mapExtraction.ts); solo añade el
 * snapshot del estado en unidades humanas y las reglas de prompt del módulo.
 */
import { steelBeamDefaults, type SteelBeamInputs } from '../../../data/defaults';
import type { SteelBeamResult } from '../../calculations/steelBeams';
import { buildApplyPlan } from '../mapExtraction';
import { summarizeCalcResults, type AiResultsSummary } from '../resultsSummary';
import { STEEL_BEAM_EXTRACTION_SCHEMA, STEEL_PROMPT_RULES } from '../schema';
import { parseExtraction } from '../validate';
import type { AiModuleAdapter } from './types';

// Texto de ejemplo del composer (idéntico al placeholder de AiFillModal).
const PLACEHOLDER_EXAMPLE =
  'Ej.: Viga biapoyada de 8 m de luz en un forjado de oficinas, ancho tributario 4 m, ' +
  'carga permanente adicional 2 kN/m², perfil IPE en acero S275, límite de flecha L/400.';

/**
 * Tabla clave-de-payload → lectura de estado. El orden fija el de `valores` y,
 * por tanto, el de `sin_confirmar` (determinista). La mayoría de campos son una
 * lectura directa de UN campo de estado (`simple`); las dimensiones de tubo se
 * leen del juego chs_x o rhs_x según la familia vigente (origen condicional).
 */
interface SnapField {
  key: string;                                   // clave del payload (unidad humana)
  get: (c: SteelBeamInputs) => string | number;  // valor en unidad humana
  isDefault: (c: SteelBeamInputs) => boolean;    // sigue en el default del módulo
}

/** Campo mapeado 1:1 a un estado, con conversión opcional a unidad humana. */
function simple(key: string, state: keyof SteelBeamInputs, toHuman?: (v: number) => number): SnapField {
  return {
    key,
    get: (c) => {
      const raw = c[state];
      return toHuman && typeof raw === 'number' ? toHuman(raw) : (raw as string | number);
    },
    isDefault: (c) => c[state] === steelBeamDefaults[state],
  };
}

const isCHS = (c: SteelBeamInputs) => c.tipo === 'CHS';

const SNAPSHOT_FIELDS: readonly SnapField[] = [
  simple('tipo', 'tipo'),
  simple('size', 'size'),
  // Dimensiones de tubo: CHS lee chs_D/chs_t; SHS/RHS leen rhs_h/rhs_t (rhs_b
  // solo tiene sentido en RHS). Inertes en perfiles abiertos (van a sin_confirmar).
  { key: 'tubo_h_mm', get: (c) => (isCHS(c) ? c.chs_D : c.rhs_h), isDefault: (c) => (isCHS(c) ? c.chs_D === steelBeamDefaults.chs_D : c.rhs_h === steelBeamDefaults.rhs_h) },
  { key: 'tubo_b_mm', get: (c) => c.rhs_b, isDefault: (c) => c.rhs_b === steelBeamDefaults.rhs_b },
  { key: 'tubo_t_mm', get: (c) => (isCHS(c) ? c.chs_t : c.rhs_t), isDefault: (c) => (isCHS(c) ? c.chs_t === steelBeamDefaults.chs_t : c.rhs_t === steelBeamDefaults.rhs_t) },
  simple('steel', 'steel'),
  simple('beamType', 'beamType'),
  simple('L_m', 'L', (v) => v / 1000),
  simple('Lcr_m', 'Lcr', (v) => v / 1000),
  simple('deflLimit', 'deflLimit'),
  simple('elsCombo', 'elsCombo'),
  simple('useCategory', 'useCategory'),
  simple('gk_kNm2', 'gk'),
  simple('qk_kNm2', 'qk'),
  simple('bTrib_m', 'bTrib'),
];

/**
 * Estado → `{valores, sin_confirmar}` (contrato común a los 3 adapters).
 * `sin_confirmar` lista las claves cuyo valor de ESTADO sigue siendo el default
 * del módulo (nadie las ha tocado): se compara el valor interno, no el humano,
 * para no depender del redondeo de la conversión.
 */
function buildSnapshot(c: SteelBeamInputs): string {
  const valores: Record<string, string | number> = {};
  const sinConfirmar: string[] = [];
  for (const f of SNAPSHOT_FIELDS) {
    valores[f.key] = f.get(c);
    if (f.isDefault(c)) sinConfirmar.push(f.key);
  }
  return JSON.stringify({ valores, sin_confirmar: sinConfirmar });
}

/**
 * Labels españoles de los valores posibles de `SteelBeamResult['governing']`
 * (steelBeams.ts:58). `class4` solo aparece en resultados no válidos (el
 * summarizer delega antes de llegar aquí), pero el Record exhaustivo obliga
 * a cubrirlo y protege ante ids nuevos del motor.
 */
const GOVERNING_ES: Record<SteelBeamResult['governing'], string> = {
  bending: 'Flexión',
  shear: 'Cortante',
  interaction: 'Interacción M-V',
  ltb: 'Pandeo lateral torsional',
  deflection: 'Flecha',
  class4: 'Sección clase 4',
};

/**
 * Resumen de resultados para el prompt del chat (Fase 2).
 * Delegación pura en el serializador genérico; si el cálculo es válido añade
 * la comprobación dominante (governing/utilization NO están en checks).
 */
export function summarizeSteelBeamResults(r: SteelBeamResult): AiResultsSummary {
  if (r.error != null || !r.valid) return summarizeCalcResults(r);
  return summarizeCalcResults(r, [
    `Comprobación dominante: ${GOVERNING_ES[r.governing]} (η=${Math.round(r.utilization * 100)}%)`,
  ]);
}

export const steelBeamsAdapter: AiModuleAdapter<SteelBeamInputs> = {
  id: 'steel-beams',
  label: 'Vigas de acero',
  payloadSchema: STEEL_BEAM_EXTRACTION_SCHEMA,     // schema.ts — INTACTO
  promptRules: STEEL_PROMPT_RULES,
  placeholder: PLACEHOLDER_EXAMPLE,
  snapshot: buildSnapshot,
  buildPlan: (payload, current, system, confirmed) => {
    const x = parseExtraction(payload);            // validate.ts
    // mapExtraction.ts produce el plan; `notes` desapareció del payload (el
    // presupuesto de uniones lo ocupan las dimensiones de tubo, y `reply` ya
    // cubre el comentario conversacional) → AiApplyPlan.notes queda undefined.
    return buildApplyPlan(x, current, system, confirmed);
  },
};
