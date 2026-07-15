// Serializador genérico de resultados de cálculo → texto para el prompt del
// chat IA (Fase 2, plan T2.1). Función pura, sin React: recibe un resultado
// con `checks: CheckRow[]` (los 3 motores con chat cumplen la forma
// CalcResultLike) y produce el bloque "RESULTADOS DEL CÁLCULO ACTUAL" que
// buildChatSystemPrompt inyecta como 4º argumento.
//
// Formato (contrato congelado del plan):
//   VEREDICTO GLOBAL: INCUMPLE (2 de 12 comprobaciones fallan)
//   - [INCUMPLE] Vuelco dir. x (FS ≥ 2.0): FS = 1.62 | límite: ≥ 2.00 | η=124% — CTE DB-SE-C 4.4.2
//   - [CUMPLE] σmax ≤ σadm: 178.3 kPa | límite: 200.0 kPa | η=89% — CTE DB-SE-C 4.4.1
//   - Informativas: Clasificación sección = CLASE 2 · Flexión dir. x = rígida · …
//   <extraLines, una por línea>
//
// Reglas: valores SIEMPRE en SI (checkValueStr(c,'si')) — el prompt entero
// habla SI-humano y así los tests son deterministas; segmento de valor/límite
// omitido si su string queda vacío; η solo con utilization finita (casos
// reales: NaN en rc-columns, Infinity en bearing de zapatas); checks neutral
// agregados en UNA línea para no inflar tokens. Discriminador de cálculo no
// válido = `error != null` (NUNCA `valid`, que diverge entre módulos: en
// zapatas valid = !overall_fail).

import type { CheckRow, CheckStatus } from '../calculations/types';
import { checkValueStr, checkLimitStr, overallStatus } from '../calculations/checkFormat';

export type AiVerdict = 'ok' | 'warn' | 'fail' | 'invalid';

export interface AiResultsSummary {
  verdict: AiVerdict;
  text: string;
}

export interface CalcResultLike {
  valid: boolean;
  error?: string;
  checks: CheckRow[];
}

type ActiveStatus = Exclude<CheckStatus, 'neutral'>;

/** Etiquetas del prompt — palabras completas, NO el "ADVERT." de la UI. */
const STATUS_PREFIX: Record<ActiveStatus, string> = {
  ok: 'CUMPLE',
  warn: 'ADVERTENCIA',
  fail: 'INCUMPLE',
};

function isActive(c: CheckRow): c is CheckRow & { status: ActiveStatus } {
  return c.status !== 'neutral';
}

/** Primera línea del veredicto; N/M solo sobre checks activos (no neutral). */
function verdictHeadline(status: ActiveStatus, actives: readonly CheckRow[]): string {
  switch (status) {
    case 'ok':
      return 'CUMPLE (todas las comprobaciones cumplen)';
    case 'warn':
      return 'CUMPLE CON ADVERTENCIAS (alguna comprobación con margen < 5%)';
    case 'fail': {
      const failing = actives.filter((c) => c.status === 'fail').length;
      return `INCUMPLE (${failing} de ${actives.length} comprobaciones fallan)`;
    }
  }
}

/**
 * `- [CUMPLE|ADVERTENCIA|INCUMPLE] {desc}: {valor} | límite: {límite} | η=NN% — {article}`
 * Los dos puntos tras la descripción solo aparecen si hay valor; con valor
 * vacío los segmentos restantes se encadenan con ` | ` directamente. η se
 * redondea al entero (Math.round) y solo se emite con utilization finita.
 */
function activeCheckLine(c: CheckRow & { status: ActiveStatus }): string {
  const value = checkValueStr(c, 'si');
  const limit = checkLimitStr(c, 'si');
  const segments: string[] = [];
  if (value !== '') segments.push(value);
  if (limit !== '') segments.push(`límite: ${limit}`);
  if (Number.isFinite(c.utilization)) segments.push(`η=${Math.round(c.utilization * 100)}%`);

  let line = `- [${STATUS_PREFIX[c.status]}] ${c.description}`;
  if (segments.length > 0) {
    line += value !== '' ? `: ${segments.join(' | ')}` : ` | ${segments.join(' | ')}`;
  }
  if (c.article !== '') line += ` — ${c.article}`;
  return line;
}

/** Entrada de la línea agregada de informativas: `{desc} = {valor-o-tag}`. */
function neutralEntry(c: CheckRow): string {
  const value = checkValueStr(c, 'si');
  return `${c.description} = ${value !== '' ? value : (c.tag ?? '')}`;
}

/**
 * Serializa un resultado de cálculo al texto del bloque de resultados del
 * prompt. `extraLines` (líneas por módulo, p.ej. "Comprobación dominante: …")
 * se añaden al final tal cual, una por línea.
 */
export function summarizeCalcResults(
  result: CalcResultLike,
  extraLines?: readonly string[],
): AiResultsSummary {
  const actives = result.checks.filter(isActive);
  const neutrals = result.checks.filter((c) => !isActive(c));

  const lines: string[] = [];
  let verdict: AiVerdict;

  if (result.error != null) {
    verdict = 'invalid';
    lines.push(`CÁLCULO NO VÁLIDO: ${result.error}`);
  } else {
    const status = overallStatus(result.checks);
    verdict = status;
    lines.push(`VEREDICTO GLOBAL: ${verdictHeadline(status, actives)}`);
  }

  for (const c of actives) lines.push(activeCheckLine(c));
  if (neutrals.length > 0) {
    lines.push(`- Informativas: ${neutrals.map(neutralEntry).join(' · ')}`);
  }
  if (extraLines) lines.push(...extraLines);

  return { verdict, text: lines.join('\n') };
}
