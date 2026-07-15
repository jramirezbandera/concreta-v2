/**
 * Decoración del snapshot con la memoria de la conversación (fix 2026-07-13).
 *
 * SÍNTOMA: en el modo guiado el asistente re-preguntaba datos ya respondidos
 * (luz, ancho tributario, cargas) y "olvidaba" lo acordado. Dos causas, ambas
 * del snapshot — no del modelo:
 *
 * 1. `sin_confirmar` se calcula comparando el estado contra los defaults de
 *    fábrica, así que un valor confirmado por el usuario que COINCIDE con el
 *    default (bTrib 3.0, qk 2.0 en un salón A1…) nunca sale de la lista: no
 *    existía forma de registrar "confirmado". Y el prompt ordena preguntar todo
 *    lo que siga en `sin_confirmar` → bucle de re-preguntas.
 * 2. Las propuestas pendientes (no aplicadas) no se reflejan en el snapshot:
 *    el formulario sigue con el valor viejo, el snapshot lo lista como sin
 *    confirmar, y esa señal explícita le gana al historial del hilo.
 *
 * ARREGLO: el modal registra qué claves ha tratado el modelo en esta
 * conversación (toda clave no-null de cada proposal, aplicada o no) y decora el
 * snapshot por turno: añade `pendientes_de_aplicar` (la propuesta acumulada
 * viva) y retira de `sin_confirmar` lo pendiente y lo ya confirmado. El prompt
 * (chatSchema.ts) explica las tres claves y pide al modelo que incluya en
 * proposal los valores confirmados aunque coincidan con el actual — es lo que
 * alimenta este registro. Los adapters NO cambian: la decoración es genérica
 * sobre el contrato {valores, sin_confirmar}.
 */

/** Claves del payload que no son campos del formulario. */
const META_KEYS = new Set(['warnings', 'notes']);

/**
 * Añade a `into` las claves de campo con valor no-null de una proposal del
 * modelo. Se registran aunque el valor luego se descarte (skip/rango): que el
 * modelo haya tratado el campo en la conversación es lo que cuenta como
 * "confirmado en este hilo"; una corrección posterior viaja por la regla 5.
 */
export function collectConfirmedKeys(proposal: unknown, into: Set<string>): void {
  if (typeof proposal !== 'object' || proposal === null || Array.isArray(proposal)) return;
  for (const [key, value] of Object.entries(proposal)) {
    if (META_KEYS.has(key)) continue;
    if (value !== null && value !== undefined) into.add(key);
  }
}

/**
 * Snapshot del adapter + memoria de la conversación → snapshot decorado:
 * - `pendientes_de_aplicar`: claves no-null de la propuesta acumulada viva
 *   (solo si hay alguna) — valores ya acordados que el usuario aún no aplicó.
 * - `sin_confirmar` filtrado: fuera lo pendiente y lo confirmado en el hilo.
 * Sin nada que decorar devuelve el JSON ORIGINAL byte-idéntico (los tests de
 * integración asertan el snapshot literal del adapter). JSON inesperado →
 * passthrough defensivo, nunca lanza.
 */
export function decorateSnapshot(
  snapshotJson: string,
  pendingPayload: unknown,
  confirmedKeys: ReadonlySet<string>,
): string {
  const pendientes: Record<string, unknown> = {};
  if (typeof pendingPayload === 'object' && pendingPayload !== null && !Array.isArray(pendingPayload)) {
    for (const [key, value] of Object.entries(pendingPayload)) {
      if (META_KEYS.has(key)) continue;
      if (value !== null && value !== undefined) pendientes[key] = value;
    }
  }
  const pendingKeys = Object.keys(pendientes);
  if (pendingKeys.length === 0 && confirmedKeys.size === 0) return snapshotJson;

  let parsed: unknown;
  try {
    parsed = JSON.parse(snapshotJson) as unknown;
  } catch {
    return snapshotJson;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return snapshotJson;
  const snap = parsed as { valores?: unknown; sin_confirmar?: unknown };

  const sinConfirmar = Array.isArray(snap.sin_confirmar)
    ? snap.sin_confirmar.filter(
        (k): k is string =>
          typeof k === 'string' && !confirmedKeys.has(k) && !pendingKeys.includes(k),
      )
    : [];

  const out: Record<string, unknown> = { valores: snap.valores, sin_confirmar: sinConfirmar };
  if (pendingKeys.length > 0) out.pendientes_de_aplicar = pendientes;
  return JSON.stringify(out);
}
