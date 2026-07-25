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
 *
 * MEMORIA DE VALORES, no solo de claves (fix 2026-07-25). El mismo registro
 * alimenta el gate anti-ruido de safety.ts, y ahí una clave no basta: la tarjeta
 * pendiente se fusiona y se re-planifica cada turno, así que una primera
 * introducción legítima acababa marcada en rojo por el simple hecho de haber
 * pasado por un turno anterior. Se guarda el PRIMER valor de cada clave y
 * `establishedKeys` solo da por establecido lo que el hilo ha MOVIDO desde
 * entonces (ver esa función).
 *
 * ERRORES DE LA PROPUESTA ANTERIOR (fix 2026-07-20). SÍNTOMA: un rechazo del
 * validador (p. ej. el veto en bloque del FEM 2D) solo se pintaba en la
 * ProposalCard; el modelo no lo veía nunca — su regla "si una propuesta se
 * descartó, corrígela" era letra muerta y, peor, `pendientes_de_aplicar` le
 * presentaba el payload rechazado como acordado: bucle sin salida (reenvía lo
 * mismo → mismo veto). ARREGLO: los `skipped` del plan pendiente cuyo motivo
 * NO es el skip benigno compartido ("Ya coincide con el valor actual", texto
 * idéntico en los 18 adapters) se realimentan como `errores_propuesta_anterior`
 * y sus claves (skip.field, cuando el adapter la informa) salen de
 * `pendientes_de_aplicar`. Genérico por el motivo; el filtrado de pendientes
 * requiere `field` (hoy: fem2d, femAnalysis, mapExtraction).
 */
import type { AiSkippedField } from './modules/types';

/** Claves del payload que no son campos del formulario. */
const META_KEYS = new Set(['warnings', 'notes']);

/**
 * Skip benigno compartido: el valor propuesto ya coincide con el actual. Es el
 * ÚNICO motivo de skip que no es un rechazo; todos los adapters usan
 * literalmente este texto (const ALREADY local en cada uno).
 */
const BENIGN_SKIP = 'Ya coincide con el valor actual';

/** Skips del plan que son RECHAZOS reales (motivo distinto del benigno). */
export function rejectedSkips(
  skipped: ReadonlyArray<AiSkippedField>,
): AiSkippedField[] {
  return skipped.filter((s) => !s.reason.startsWith(BENIGN_SKIP));
}

/**
 * Memoria del hilo: PRIMER valor que el modelo propuso para cada clave de
 * campo. Se registra aunque el valor luego se descarte (skip/rango): que el
 * modelo haya tratado el campo en la conversación es lo que cuenta como
 * "confirmado en este hilo"; una corrección posterior viaja por la regla 5.
 *
 * Sus CLAVES alimentan `decorateSnapshot` (salen de `sin_confirmar` para que el
 * modelo no re-pregunte) y el gate anti-ruido de safety.ts a través de
 * `establishedKeys`, que es quien usa los VALORES.
 *
 * PRIMERO GANA (`if (!into.has(key))`): la línea base de una clave es el valor
 * con el que el hilo la puso sobre la mesa, y no se mueve mientras el hilo dure.
 * Si cada turno la sobrescribiera, un riesgo ya detectado desaparecería en el
 * turno siguiente —la propuesta arrastrada pasaría a ser su propia línea base— y
 * la tarjeta acumulada se aplicaría sin la fila roja que sí tuvo al nacer.
 */
export function collectThreadValues(proposal: unknown, into: Map<string, unknown>): void {
  if (typeof proposal !== 'object' || proposal === null || Array.isArray(proposal)) return;
  for (const [key, value] of Object.entries(proposal)) {
    if (META_KEYS.has(key)) continue;
    if (value === null || value === undefined) continue;
    if (!into.has(key)) into.set(key, value);
  }
}

/** Igualdad estructural de dos valores de payload (JSON plano: escalares, arrays, objetos). */
function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => sameValue(x, b[i]));
  }
  const objA = typeof a === 'object' && a !== null && !Array.isArray(a);
  const objB = typeof b === 'object' && b !== null && !Array.isArray(b);
  if (objA && objB) {
    const ra = a as Record<string, unknown>;
    const rb = b as Record<string, unknown>;
    const ka = Object.keys(ra);
    return (
      ka.length === Object.keys(rb).length &&
      ka.every((k) => k in rb && sameValue(ra[k], rb[k]))
    );
  }
  return false;
}

/**
 * Claves que la memoria del hilo da por ESTABLECIDAS frente a la propuesta que
 * se va a planificar — es lo que recibe `buildPlan` como `confirmed` y lo que
 * abre la segunda vía del gate anti-ruido (safety.ts).
 *
 * FALSO POSITIVO QUE CIERRA (2026-07-25). La tarjeta pendiente se FUSIONA con la
 * propuesta de cada turno nuevo y el plan se reconstruye entero, así que un valor
 * introducido por PRIMERA vez en el turno 1 —sin fila roja, gate cerrado: nadie
 * lo había fijado— volvía a evaluarse en el turno 2… pero ahora su propia clave
 * ya estaba en la memoria del hilo, el gate se abría y la primera introducción
 * salía marcada como "este cambio reduce la seguridad", con checkbox de
 * confirmación, en todos los turnos siguientes. Ocurría en CUALQUIER hilo de
 * varios turnos con tarjeta viva, que es el modo guiado entero.
 *
 * La corrección: la memoria del hilo solo establece una clave cuando el valor que
 * se propone AHORA difiere del que el hilo puso sobre la mesa. Arrastrar el mismo
 * valor turno tras turno no es un cambio y no vuelve a juzgarse; MOVERLO sí —de
 * ahí que la fuga 1 de la auditoría (el pilar existente de 30×30 que el modelo
 * engorda a 40×40 tras confirmarlo) siga cerrada.
 *
 * Una clave que la propuesta no toca (`null`/ausente: ya aplicada, o de un turno
 * anterior) sigue establecida — quitarla desprotegería lo ya acordado.
 */
export function establishedKeys(
  threadValues: ReadonlyMap<string, unknown>,
  proposal: unknown,
): Set<string> {
  const proposed =
    typeof proposal === 'object' && proposal !== null && !Array.isArray(proposal)
      ? (proposal as Record<string, unknown>)
      : {};
  const out = new Set<string>();
  for (const [key, baseline] of threadValues) {
    const now = proposed[key];
    // Mismo valor que la línea base ⇒ re-planificación del mismo dato, no cambio.
    if (now !== null && now !== undefined && sameValue(now, baseline)) continue;
    out.add(key);
  }
  return out;
}

/**
 * Snapshot del adapter + memoria de la conversación → snapshot decorado:
 * - `pendientes_de_aplicar`: claves no-null de la propuesta acumulada viva
 *   (solo si hay alguna) — valores ya acordados que el usuario aún no aplicó.
 *   Una clave RECHAZADA por el plan (skip con `field` y motivo no benigno) NO
 *   es un acuerdo: se retira de pendientes.
 * - `errores_propuesta_anterior`: motivos de los skips-rechazo del plan
 *   pendiente (solo si hay alguno) — es lo que permite al modelo corregir en
 *   el turno siguiente en vez de reenviar lo mismo.
 * - `sin_confirmar` filtrado: fuera lo pendiente y lo confirmado en el hilo.
 * Sin nada que decorar devuelve el JSON ORIGINAL byte-idéntico (los tests de
 * integración asertan el snapshot literal del adapter). JSON inesperado →
 * passthrough defensivo, nunca lanza.
 */
export function decorateSnapshot(
  snapshotJson: string,
  pendingPayload: unknown,
  confirmedKeys: ReadonlySet<string>,
  lastPlanSkipped: ReadonlyArray<AiSkippedField> = [],
): string {
  const rejections = rejectedSkips(lastPlanSkipped);
  const rejectedKeys = new Set(
    rejections
      .map((r) => r.field)
      .filter((f): f is string => typeof f === 'string'),
  );
  const pendientes: Record<string, unknown> = {};
  if (typeof pendingPayload === 'object' && pendingPayload !== null && !Array.isArray(pendingPayload)) {
    for (const [key, value] of Object.entries(pendingPayload)) {
      if (META_KEYS.has(key) || rejectedKeys.has(key)) continue;
      if (value !== null && value !== undefined) pendientes[key] = value;
    }
  }
  const pendingKeys = Object.keys(pendientes);
  if (pendingKeys.length === 0 && confirmedKeys.size === 0 && rejections.length === 0) {
    return snapshotJson;
  }

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
  if (rejections.length > 0) {
    out.errores_propuesta_anterior = rejections.map(
      (r) => `${r.field ?? r.label}: ${r.reason}`,
    );
  }
  return JSON.stringify(out);
}
