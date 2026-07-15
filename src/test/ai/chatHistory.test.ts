// Tests de buildChatTurns (src/lib/ai/chatHistory.ts) — plan T1.1.
// Contrato: ítems 'error' se excluyen; user → {role:'user', text, images};
// assistant → {role:'assistant', text: rawEnvelope} (verbatim, NO reply);
// ventana de MAX_HISTORY_TURNS podada SIEMPRE por pares desde el principio
// (primer turno user + alternancia estricta — restricción dura de Anthropic);
// cupo MAX_REQUEST_IMAGES podando imágenes del turno MÁS ANTIGUO hacia
// delante, conservando el texto y añadiendo IMAGE_OMITTED_MARKER.
// Función pura: sin mocks.

import { describe, it, expect } from 'vitest';
import {
  MAX_HISTORY_TURNS,
  MAX_REQUEST_IMAGES,
  IMAGE_OMITTED_MARKER,
  buildChatTurns,
  type ChatItemLike,
} from '../../lib/ai/chatHistory';
import type { AiImageAttachment, ChatTurn } from '../../lib/ai/types';

const img = (id: string): AiImageAttachment => ({ data: `b64-${id}`, mediaType: 'image/png' });
const user = (text: string, images?: AiImageAttachment[]): ChatItemLike => ({ kind: 'user', text, images });
const assistant = (rawEnvelope: string): ChatItemLike => ({
  kind: 'assistant',
  reply: 'texto renderizado en la UI (NO debe viajar)',
  rawEnvelope,
});
const errorItem = (): ChatItemLike => ({ kind: 'error' });

/** Hilo alterno u0,a0,u1,a1,… con `pairs` pares + turno user final opcional. */
function thread(pairs: number, withTrailingUser: boolean): ChatItemLike[] {
  const items: ChatItemLike[] = [];
  for (let i = 0; i < pairs; i++) {
    items.push(user(`u${i}`), assistant(`{"reply":"a${i}","proposal":null}`));
  }
  if (withTrailingUser) items.push(user(`u${pairs}`));
  return items;
}

function expectStrictAlternationFromUser(turns: ChatTurn[]): void {
  expect(turns.length).toBeGreaterThan(0);
  expect(turns[0].role).toBe('user');
  for (let i = 1; i < turns.length; i++) {
    expect(turns[i].role).not.toBe(turns[i - 1].role);
  }
}

describe('buildChatTurns — hilo corto (sin poda)', () => {
  it('convierte ítems a turnos idénticos: user con texto+imágenes, assistant con rawEnvelope', () => {
    const foto = img('viga');
    const raw = '{"reply":"Anotado.","proposal":{"L_m":8}}';
    const items = [user('Viga de 8 m', [foto]), assistant(raw), user('¿Y el perfil?')];
    expect(buildChatTurns(items)).toEqual([
      { role: 'user', text: 'Viga de 8 m', images: [foto] },
      { role: 'assistant', text: raw },
      { role: 'user', text: '¿Y el perfil?' },
    ]);
  });

  it('assistant reenvía rawEnvelope VERBATIM, nunca el reply de la UI', () => {
    const raw = '{"reply":"hola","proposal":null}';
    const [, turnAssistant] = buildChatTurns([user('hola'), assistant(raw), user('sigue')]);
    expect(turnAssistant.text).toBe(raw);
    expect(turnAssistant.text).not.toContain('texto renderizado en la UI');
  });

  it('turno user sin imágenes no lleva la propiedad images', () => {
    const [turno] = buildChatTurns([user('solo texto')]);
    expect(turno).toEqual({ role: 'user', text: 'solo texto' });
    expect('images' in turno).toBe(false);
  });
});

describe('buildChatTurns — ítems error excluidos sin romper alternancia', () => {
  it('un error tras un turno user (Reintentar reutilizó el user) desaparece de la request', () => {
    // UI tras: envío → error → Reintentar (reutiliza u1) → éxito → nuevo envío.
    const items = [
      user('u0'), assistant('{"reply":"a0","proposal":null}'),
      user('u1'), errorItem(), assistant('{"reply":"a1","proposal":null}'),
      user('u2'),
    ];
    const turns = buildChatTurns(items);
    expect(turns.map((t) => t.role)).toEqual(['user', 'assistant', 'user', 'assistant', 'user']);
    expect(turns.map((t) => t.text)).toEqual([
      'u0', '{"reply":"a0","proposal":null}', 'u1', '{"reply":"a1","proposal":null}', 'u2',
    ]);
    expectStrictAlternationFromUser(turns);
  });

  it('varios errores intercalados quedan fuera y la alternancia se mantiene', () => {
    const items = [
      user('u0'), errorItem(), assistant('{"reply":"a0","proposal":null}'),
      user('u1'), errorItem(), errorItem(), assistant('{"reply":"a1","proposal":null}'),
      user('u2'),
    ];
    const turns = buildChatTurns(items);
    expect(turns).toHaveLength(5);
    expectStrictAlternationFromUser(turns);
  });
});

describe('buildChatTurns — ventana deslizante por pares', () => {
  it('hilo dentro de la ventana → sin poda', () => {
    const items = thread(5, true); // 11 turnos ≤ 12
    expect(buildChatTurns(items)).toHaveLength(11);
  });

  it('>12 turnos (impar, último user) → poda por pares: primer turno user y alternancia estricta', () => {
    const items = thread(7, true); // 15 turnos: u0..a6 + u7
    const turns = buildChatTurns(items);
    // exceso 3 → se podan 2 pares (4 turnos) para no dejar un assistant primero
    expect(turns).toHaveLength(11);
    expect(turns.length).toBeLessThanOrEqual(MAX_HISTORY_TURNS);
    expectStrictAlternationFromUser(turns);
    expect(turns[0].text).toBe('u2');            // los más antiguos (u0/a0, u1/a1) fuera
    expect(turns.at(-1)).toEqual({ role: 'user', text: 'u7' }); // los recientes intactos
    expect(turns.at(-1)!.role).toBe('user');
  });

  it('exceso par → ventana exacta de MAX_HISTORY_TURNS empezando en user', () => {
    const items = thread(7, false); // 14 turnos: u0..a6
    const turns = buildChatTurns(items);
    expect(turns).toHaveLength(MAX_HISTORY_TURNS); // 12
    expectStrictAlternationFromUser(turns);
    expect(turns[0].text).toBe('u1'); // el par (u0,a0) fuera — NUNCA queda un assistant primero
  });

  it('los errores se excluyen ANTES de aplicar la ventana (no consumen hueco)', () => {
    const items = [errorItem(), ...thread(6, true)]; // 13 turnos reales + 1 error
    const turns = buildChatTurns(items);
    expect(turns).toHaveLength(11); // exceso 1 → se poda 1 par completo
    expectStrictAlternationFromUser(turns);
    expect(turns[0].text).toBe('u1');
  });
});

describe('buildChatTurns — cupo de imágenes con marcador', () => {
  it('≤6 imágenes en total → todas viajan, sin marcador', () => {
    const items = [
      user('u0', [img('a'), img('b'), img('c')]),
      assistant('{"reply":"a0","proposal":null}'),
      user('u1', [img('d'), img('e'), img('f')]),
    ];
    const turns = buildChatTurns(items);
    expect(turns[0].images).toHaveLength(3);
    expect(turns[2].images).toHaveLength(3);
    expect(turns.some((t) => t.text.includes(IMAGE_OMITTED_MARKER))).toBe(false);
  });

  it('>6 imágenes → poda parcial del turno MÁS ANTIGUO: conserva texto + marcador y el resto de sus imágenes', () => {
    const items = [
      user('u0', [img('a'), img('b'), img('c')]),
      assistant('{"reply":"a0","proposal":null}'),
      user('u1', [img('d'), img('e'), img('f')]),
      assistant('{"reply":"a1","proposal":null}'),
      user('u2', [img('g'), img('h')]),
    ];
    // total 8 → sobran 2: salen las 2 más antiguas de u0
    const turns = buildChatTurns(items);
    expect(turns[0].text).toBe(`u0\n${IMAGE_OMITTED_MARKER}`);
    expect(turns[0].images).toEqual([img('c')]);
    // los turnos recientes quedan intactos, sin marcador:
    expect(turns[2]).toEqual({ role: 'user', text: 'u1', images: [img('d'), img('e'), img('f')] });
    expect(turns[4]).toEqual({ role: 'user', text: 'u2', images: [img('g'), img('h')] });
    // el cupo total se respeta:
    const total = turns.reduce((n, t) => n + (t.images?.length ?? 0), 0);
    expect(total).toBe(MAX_REQUEST_IMAGES);
  });

  it('la poda puede vaciar el turno más antiguo y continuar hacia delante', () => {
    const items = [
      user('u0', [img('a')]),
      assistant('{"reply":"a0","proposal":null}'),
      user('u1', [img('b'), img('c')]),
      assistant('{"reply":"a1","proposal":null}'),
      user('u2', [img('d'), img('e'), img('f'), img('g'), img('h')]),
    ];
    // total 8 → sobran 2: u0 pierde su única imagen; u1 pierde la más antigua (b)
    const turns = buildChatTurns(items);
    expect(turns[0]).toEqual({ role: 'user', text: `u0\n${IMAGE_OMITTED_MARKER}` });
    expect(turns[0].images).toBeUndefined();
    expect(turns[2].text).toBe(`u1\n${IMAGE_OMITTED_MARKER}`);
    expect(turns[2].images).toEqual([img('c')]);
    expect(turns[4].images).toHaveLength(5); // el turno más reciente, intacto
    expect(turns[4].text).toBe('u2');
  });

  it('turno podado con texto vacío → el text queda solo con el marcador', () => {
    const items = [
      user('', [img('a')]),
      assistant('{"reply":"a0","proposal":null}'),
      user('u1', [img('b'), img('c'), img('d'), img('e'), img('f'), img('g')]),
    ];
    const turns = buildChatTurns(items);
    expect(turns[0]).toEqual({ role: 'user', text: IMAGE_OMITTED_MARKER });
  });

  it('no muta los ítems de entrada (la UI conserva sus imágenes)', () => {
    const imagenes = [img('a'), img('b'), img('c'), img('d')];
    const items = [
      user('u0', imagenes),
      assistant('{"reply":"a0","proposal":null}'),
      user('u1', [img('e'), img('f'), img('g')]),
    ];
    buildChatTurns(items);
    expect(imagenes).toHaveLength(4);
    expect(items[0].images).toBe(imagenes);
    expect(items[0].text).toBe('u0');
  });
});

describe('constantes del contrato', () => {
  it('valores congelados del plan', () => {
    expect(MAX_HISTORY_TURNS).toBe(12);
    expect(MAX_REQUEST_IMAGES).toBe(6);
    expect(IMAGE_OMITTED_MARKER).toBe('[imagen adjunta omitida por longitud de la conversación]');
  });
});
