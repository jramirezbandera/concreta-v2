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
 * Tabla clave-de-payload → clave-de-estado (+ conversión a unidad humana).
 * El orden fija el de `valores` y, por tanto, el de `sin_confirmar` (determinista).
 */
const SNAPSHOT_FIELDS: ReadonlyArray<{
  readonly key: string;                       // clave del payload (unidad humana)
  readonly state: keyof SteelBeamInputs;      // clave del estado (unidad interna)
  readonly toHuman?: (v: number) => number;   // solo cuando la unidad difiere
}> = [
  { key: 'tipo', state: 'tipo' },
  { key: 'size', state: 'size' },
  { key: 'steel', state: 'steel' },
  { key: 'beamType', state: 'beamType' },
  { key: 'L_m', state: 'L', toHuman: (v) => v / 1000 },
  { key: 'Lcr_m', state: 'Lcr', toHuman: (v) => v / 1000 },
  { key: 'deflLimit', state: 'deflLimit' },
  { key: 'elsCombo', state: 'elsCombo' },
  { key: 'useCategory', state: 'useCategory' },
  { key: 'gk_kNm2', state: 'gk' },
  { key: 'qk_kNm2', state: 'qk' },
  { key: 'bTrib_m', state: 'bTrib' },
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
  for (const { key, state, toHuman } of SNAPSHOT_FIELDS) {
    const raw = c[state];
    valores[key] = toHuman && typeof raw === 'number' ? toHuman(raw) : raw;
    if (raw === steelBeamDefaults[state]) sinConfirmar.push(key);
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
    const x = parseExtraction(payload);            // validate.ts — INTACTO
    // mapExtraction.ts — INTACTO salvo el paso de `confirmed` al gate anti-ruido
    return { ...buildApplyPlan(x, current, system, confirmed), notes: x.notes };
  },
};
