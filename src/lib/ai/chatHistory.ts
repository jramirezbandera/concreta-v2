/**
 * Construcción de los turnos de request a partir del hilo de la UI (Fase 1 — chat).
 * La UI conserva TODOS los ítems; aquí solo se recorta lo que viaja en cada
 * petición: ventana deslizante de turnos (podada por pares para garantizar la
 * alternancia estricta user/assistant que exige Anthropic) y cupo total de
 * imágenes (podadas del turno más antiguo hacia delante, con marcador).
 *
 * Las imágenes NO caducan con la ventana de turnos: las de los turnos podados
 * se re-adjuntan al primer turno user superviviente (con marcador de arrastre),
 * de modo que solo el cupo MAX_REQUEST_IMAGES las poda — siempre las más
 * antiguas primero. Sin esto, el croquis del primer mensaje desaparecía en
 * cuanto la entrevista superaba la ventana y el modelo respondía "no tengo
 * acceso al dibujo" (bucle FEM 2D del 2026-07-21).
 * Función PURA: sin estado, sin mutación de la entrada.
 */
import type { AiImageAttachment, ChatTurn } from './types';

export const MAX_HISTORY_TURNS = 12;    // ventana deslizante por DEFECTO (6 pares); un adapter puede pedir más vía historyTurns
export const MAX_REQUEST_IMAGES = 6;    // total por petición; se podan del turno MÁS ANTIGUO
export const IMAGE_OMITTED_MARKER = '[imagen adjunta omitida por longitud de la conversación]';
export const IMAGES_CARRIED_MARKER =
  '[las primeras imágenes de este mensaje proceden de mensajes anteriores de la conversación, re-adjuntadas para que sigan visibles]';

/**
 * Forma mínima ESTRUCTURAL de un ítem del hilo de la UI (`ChatItem` del modal
 * es asignable). Mantiene esta función pura y testeable sin importar la UI.
 */
export interface ChatItemLike {
  kind: 'user' | 'assistant' | 'error';
  text?: string;
  images?: AiImageAttachment[];
  reply?: string;
  rawEnvelope?: string;
}

/**
 * Convierte los ítems de la UI en los turnos de la request:
 * - Ítems `kind:'error'` se EXCLUYEN (no rompen la alternancia: tras un error,
 *   Reintentar reutiliza el último turno user — nunca hay dos user seguidos).
 * - user → { role:'user', text, images } · assistant → { role:'assistant',
 *   text: rawEnvelope } (el envelope JSON crudo se reenvía verbatim).
 * - Ventana de `maxTurns` (default MAX_HISTORY_TURNS) podando SIEMPRE por
 *   pares (user+assistant) desde el principio → alternancia estricta y primer
 *   turno user.
 * - ANCLAJE de imágenes: las imágenes de los turnos que caen de la ventana se
 *   re-adjuntan (en su orden) DELANTE de las del primer turno user
 *   superviviente, cuyo texto se prefija con IMAGES_CARRIED_MARKER. Así la
 *   antigüedad global se conserva y el cupo del paso siguiente sigue podando
 *   "las más antiguas primero".
 * - Cupo MAX_REQUEST_IMAGES por request: se podan imágenes del turno más
 *   antiguo hacia delante; un turno podado conserva su texto y añade
 *   IMAGE_OMITTED_MARKER en línea aparte al final. Un turno puede llevar ambos
 *   marcadores (arrastró imágenes y el cupo se las podó): el de omisión manda.
 */
export function buildChatTurns(
  items: ReadonlyArray<ChatItemLike>,
  maxTurns: number = MAX_HISTORY_TURNS,
): ChatTurn[] {
  // 1) Excluir errores y mapear a turnos.
  const mapped: ChatTurn[] = [];
  for (const item of items) {
    if (item.kind === 'error') continue;
    if (item.kind === 'user') {
      const turn: ChatTurn = { role: 'user', text: item.text ?? '' };
      if (item.images && item.images.length > 0) turn.images = [...item.images];
      mapped.push(turn);
    } else {
      mapped.push({ role: 'assistant', text: item.rawEnvelope ?? '' });
    }
  }

  // 2) Ventana deslizante: podar por PARES completos desde el principio.
  //    Al eliminar siempre un número par de turnos de una secuencia alterna
  //    que empieza en user, el primer turno restante sigue siendo user.
  let turns = mapped;
  if (turns.length > maxTurns) {
    const excess = turns.length - maxTurns;
    const drop = excess % 2 === 0 ? excess : excess + 1;
    // Anclaje: las imágenes de los turnos podados sobreviven a la ventana.
    // Solo el cupo de imágenes (paso 3) decide si caben — al ir DELANTE del
    // primer turno, siguen siendo "las más antiguas" y salen primero.
    const carried = turns.slice(0, drop).flatMap((t) => t.images ?? []);
    turns = turns.slice(drop);
    if (carried.length > 0 && turns[0]?.role === 'user') {
      const first = turns[0];
      const text =
        first.text === '' ? IMAGES_CARRIED_MARKER : `${IMAGES_CARRIED_MARKER}\n${first.text}`;
      turns = [
        { role: 'user', text, images: [...carried, ...(first.images ?? [])] },
        ...turns.slice(1),
      ];
    }
  }

  // 3) Cupo total de imágenes: podar del turno MÁS ANTIGUO hacia delante.
  const totalImages = turns.reduce((n, t) => n + (t.images?.length ?? 0), 0);
  if (totalImages > MAX_REQUEST_IMAGES) {
    let toDrop = totalImages - MAX_REQUEST_IMAGES;
    turns = turns.map((turn) => {
      if (toDrop <= 0 || !turn.images || turn.images.length === 0) return turn;
      const drop = Math.min(toDrop, turn.images.length);
      toDrop -= drop;
      const kept = turn.images.slice(drop); // las más antiguas del turno salen primero
      const text = turn.text === '' ? IMAGE_OMITTED_MARKER : `${turn.text}\n${IMAGE_OMITTED_MARKER}`;
      return kept.length > 0 ? { role: turn.role, text, images: kept } : { role: turn.role, text };
    });
  }

  return turns;
}
