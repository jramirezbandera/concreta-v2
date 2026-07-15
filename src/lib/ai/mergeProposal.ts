/**
 * Fusión genérica de propuestas pendientes del chat IA (acumulación de turnos).
 * Cada turno con datos produce una tarjeta de propuesta; si la anterior no se
 * aplicó, la nueva se fusiona con ella ANTES de construir el plan, para que
 * los datos ya extraídos no se pierdan. Opera sobre los payloads crudos de
 * `proposal` (objetos planos con claves del módulo, todo nullable, más
 * `warnings: string[]`), sin conocer el módulo concreto.
 */

/** Objeto plano (mismo criterio que validate.ts: objeto, no null, no array). */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Array filtrado a strings; cualquier otra cosa (ausente, null, no-array) → []. */
function stringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((w): w is string => typeof w === 'string') : [];
}

/**
 * Fusiona la propuesta pendiente (no aplicada) con la entrante.
 * - Si `incoming` no es un objeto plano → se devuelve `incoming` tal cual
 *   (preserva el camino de error de buildPlan).
 * - Si `pending` no es un objeto plano → se devuelve `incoming` tal cual.
 * - Por clave (unión de ambas): gana el valor de `incoming` si es !== null y
 *   !== undefined; si no, se arrastra el de `pending`; claves solo en pending
 *   se arrastran.
 * - `warnings`: caso especial — unión de ambos arrays (pendientes primero,
 *   entrantes después) filtrada a strings y sin duplicados.
 * - Devuelve SIEMPRE un objeto nuevo; no muta ninguno de los dos.
 */
export function mergeProposalPayloads(pending: unknown, incoming: unknown): unknown {
  if (!isPlainObject(incoming)) return incoming;
  if (!isPlainObject(pending)) return incoming;

  const merged: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(pending), ...Object.keys(incoming)]);
  for (const key of keys) {
    if (key === 'warnings') continue; // caso especial, abajo
    const inc = incoming[key];
    if (inc !== null && inc !== undefined) {
      merged[key] = inc; // incoming gana (false/0/'' incluidos)
    } else if (key in pending) {
      merged[key] = pending[key]; // se arrastra la pendiente
    } else {
      merged[key] = inc; // solo en incoming con null/undefined → se conserva
    }
  }
  if ('warnings' in pending || 'warnings' in incoming) {
    merged.warnings = [
      ...new Set([...stringArray(pending.warnings), ...stringArray(incoming.warnings)]),
    ];
  }
  return merged;
}
