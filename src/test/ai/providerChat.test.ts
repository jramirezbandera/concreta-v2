// Tests de los `chatRaw` de los 3 providers con los SDKs mockeados
// (vi.mock intercepta los dynamic import de '@anthropic-ai/sdk', 'openai' y
// '@google/genai'). Verifican la CONSTRUCCIÓN de la petición a partir de una
// ChatRequest de 3 turnos (user con imagen, assistant, user):
//   - Anthropic: messages con roles correctos, imagen solo en el turno user,
//     assistant como content string, max_tokens 3000, system en DOS bloques
//     (estable cacheado + volátil), schema convertido (sin type-arrays ni null
//     en enums), signal en options.
//   - OpenAI: input con roles, store:false, text.format json_schema strict con
//     name CHAT_FORMAT_NAME, schema con enums sin null y type-arrays intactos,
//     instructions = system completo y prompt_cache_key = req.cacheKey.
//   - Gemini: contents con role 'model' para assistant, responseJsonSchema
//     EXACTAMENTE el canónico (misma referencia, sin convertir),
//     systemInstruction (system completo) y abortSignal dentro de config.
// Y la CACHÉ DE PROMPT (describe final): el breakpoint de Anthropic cae al final
// del bloque estable y NUNCA dentro del volátil; el 2º breakpoint del historial
// solo existe si hay imágenes en la ventana.
// Las respuestas fake devuelven el envelope JSON para que el parse funcione.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chatSystemText, type AiImageAttachment, type ChatRequest } from '../../lib/ai/types';
import { CHAT_FORMAT_NAME } from '../../lib/ai/chatSchema';

const mocks = vi.hoisted(() => ({
  anthropicCreate: vi.fn(),
  openaiCreate: vi.fn(),
  geminiGenerate: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    static APIUserAbortError = class extends Error {};
    static APIConnectionError = class extends Error {};
    static APIError = class extends Error {};
    messages = { create: mocks.anthropicCreate };
  }
  return { default: MockAnthropic };
});

vi.mock('openai', () => {
  class MockOpenAI {
    static APIUserAbortError = class extends Error {};
    static APIConnectionError = class extends Error {};
    static APIError = class extends Error {};
    responses = { create: mocks.openaiCreate };
  }
  return { default: MockOpenAI };
});

vi.mock('@google/genai', () => {
  class MockApiError extends Error {
    status = 500;
  }
  class MockGoogleGenAI {
    models = { generateContent: mocks.geminiGenerate };
  }
  return {
    GoogleGenAI: MockGoogleGenAI,
    ApiError: MockApiError,
  };
});

import { chatRaw as anthropicChatRaw } from '../../lib/ai/providers/anthropic';
import { chatRaw as openaiChatRaw } from '../../lib/ai/providers/openai';
import { chatRaw as geminiChatRaw } from '../../lib/ai/providers/gemini';

const IMG: AiImageAttachment = { data: 'QkFTRTY0REFUQQ==', mediaType: 'image/png' };

/**
 * Schema canónico del envelope con el payload anidado en proposal.anyOf[0]
 * (type-arrays y null dentro de enum a profundidad, como el real).
 */
function makeCanonicalSchema(): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['reply', 'proposal'],
    properties: {
      reply: { type: 'string' },
      proposal: {
        anyOf: [
          {
            type: 'object',
            properties: {
              tipo: { type: ['string', 'null'], enum: ['IPE', 'HEA', null] },
              L_m: { type: ['number', 'null'] },
            },
          },
          { type: 'null' },
        ],
      },
    },
  };
}

const ENVELOPE = { reply: 'Hecho.', proposal: { tipo: 'IPE', L_m: 8 } };
const ENVELOPE_JSON = JSON.stringify(ENVELOPE);

/** Envelope JSON crudo del turno assistant (se reenvía verbatim). */
const ASSISTANT_RAW = '{"reply":"¿Qué luz tiene la viga?","proposal":null}';

const SYSTEM = {
  stable: 'REGLAS DE PRUEBA (idénticas turno a turno) — bloque cacheable.',
  volatile: 'ESTADO ACTUAL DEL MÓDULO: {"valores":{"L_m":8}}',
};

/** Request de 3 turnos CON imagen en el primero (el caso con 2º breakpoint). */
function makeReq(): ChatRequest {
  return {
    system: SYSTEM,
    schema: makeCanonicalSchema(),
    turns: [
      { role: 'user', text: 'Viga IPE con plano adjunto', images: [IMG] },
      { role: 'assistant', text: ASSISTANT_RAW },
      { role: 'user', text: 'La luz es de 8 m' },
    ],
    cacheKey: 'concreta-steel-beams',
    signal: new AbortController().signal,
  };
}

/** La misma request pero SIN imágenes: no debe llevar breakpoint en el historial. */
function makeReqSinImagenes(): ChatRequest {
  return { ...makeReq(), turns: [{ role: 'user', text: 'La luz es de 8 m' }] };
}

/** Walker recursivo: recoge TODOS los nodos-objeto del árbol (properties, items, ramas anyOf). */
function collectNodes(node: unknown, acc: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(node)) {
    for (const item of node) collectNodes(item, acc);
    return acc;
  }
  if (typeof node !== 'object' || node === null) return acc;
  const record = node as Record<string, unknown>;
  acc.push(record);
  if (typeof record.properties === 'object' && record.properties !== null) {
    for (const value of Object.values(record.properties)) collectNodes(value, acc);
  }
  collectNodes(record.items, acc);
  collectNodes(record.anyOf, acc);
  return acc;
}

/** Nodo `tipo` del payload anidado (schema.properties.proposal.anyOf[0].properties.tipo). */
function nestedTipo(schema: Record<string, unknown>): Record<string, unknown> {
  const proposal = (schema.properties as Record<string, Record<string, unknown>>).proposal;
  const payload = (proposal.anyOf as Record<string, unknown>[])[0];
  return (payload.properties as Record<string, Record<string, unknown>>).tipo;
}

beforeEach(() => {
  mocks.anthropicCreate.mockReset();
  mocks.openaiCreate.mockReset();
  mocks.geminiGenerate.mockReset();
});

describe('anthropic.chatRaw', () => {
  it('construye messages desde los turnos y parsea el primer bloque de texto', async () => {
    mocks.anthropicCreate.mockResolvedValueOnce({ content: [{ type: 'text', text: ENVELOPE_JSON }] });
    const req = makeReq();

    const raw = await anthropicChatRaw(req, 'sk-ant-test', 'claude-sonnet-5');

    expect(raw).toEqual(ENVELOPE);
    expect(mocks.anthropicCreate).toHaveBeenCalledTimes(1);
    const [body, options] = mocks.anthropicCreate.mock.calls[0] as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(body.model).toBe('claude-sonnet-5');
    expect(body.max_tokens).toBe(3000);
    expect(body.thinking).toEqual({ type: 'disabled' });
    expect(options.signal).toBe(req.signal);

    const messages = body.messages as Record<string, unknown>[];
    expect(messages).toHaveLength(3);
    // Turno user con imagen → bloques imagen (base64) + texto.
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: IMG.data } },
      { type: 'text', text: 'Viga IPE con plano adjunto' },
    ]);
    // Turno assistant → content string (envelope verbatim), sin bloques.
    expect(messages[1]).toEqual({ role: 'assistant', content: ASSISTANT_RAW });
    // Último turno user: bloque de texto (con el breakpoint de caché del
    // historial, porque esta request lleva imagen — ver describe de caché).
    expect(messages[2].role).toBe('user');
    expect(messages[2].content).toEqual([
      { type: 'text', text: 'La luz es de 8 m', cache_control: { type: 'ephemeral' } },
    ]);
  });

  it('envía el schema convertido en output_config (sin type-arrays ni null en enums)', async () => {
    mocks.anthropicCreate.mockResolvedValueOnce({ content: [{ type: 'text', text: ENVELOPE_JSON }] });
    const req = makeReq();

    await anthropicChatRaw(req, 'sk-ant-test', 'claude-sonnet-5');

    const [body] = mocks.anthropicCreate.mock.calls[0] as [Record<string, unknown>];
    const outputConfig = body.output_config as { format: { type: string; schema: Record<string, unknown> } };
    expect(outputConfig.format.type).toBe('json_schema');
    for (const node of collectNodes(outputConfig.format.schema)) {
      expect(Array.isArray(node.type)).toBe(false);
      if (Array.isArray(node.enum)) {
        expect(node.enum).not.toContain(null);
      }
    }
    // El payload anidado quedó convertido a anyOf...
    expect(nestedTipo(outputConfig.format.schema)).toEqual({
      anyOf: [{ type: 'string', enum: ['IPE', 'HEA'] }, { type: 'null' }],
    });
    // ...y el canónico de la request NO se mutó.
    expect(nestedTipo(req.schema)).toEqual({ type: ['string', 'null'], enum: ['IPE', 'HEA', null] });
  });

  it('lanza schema-too-large SIN llamar al SDK cuando el schema supera 16 uniones', async () => {
    // 17 campos anulables → 17 uniones > 16: Anthropic daría 400 (o colgaría si
    // se disfrazasen de opcionales). El guard corta antes de importar/llamar.
    const properties: Record<string, unknown> = {};
    for (let i = 0; i < 17; i++) properties[`f${i}`] = { type: ['number', 'null'] };
    const bigSchema = { type: 'object', additionalProperties: false, properties };
    const req = { ...makeReq(), schema: bigSchema };

    await expect(anthropicChatRaw(req, 'sk-ant-test', 'claude-sonnet-5')).rejects.toMatchObject({
      kind: 'schema-too-large',
    });
    expect(mocks.anthropicCreate).not.toHaveBeenCalled();
  });
});

describe('openai.chatRaw', () => {
  it('construye input desde los turnos, con store:false y format strict', async () => {
    mocks.openaiCreate.mockResolvedValueOnce({ output_text: ENVELOPE_JSON });
    const req = makeReq();

    const raw = await openaiChatRaw(req, 'sk-openai-test', 'gpt-5.6-terra');

    expect(raw).toEqual(ENVELOPE);
    expect(mocks.openaiCreate).toHaveBeenCalledTimes(1);
    const [body, options] = mocks.openaiCreate.mock.calls[0] as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(body.model).toBe('gpt-5.6-terra');
    expect(body.instructions).toBe(chatSystemText(req.system));
    expect(body.store).toBe(false);
    expect(options.signal).toBe(req.signal);

    const format = (body.text as { format: Record<string, unknown> }).format;
    expect(format.type).toBe('json_schema');
    expect(format.name).toBe(CHAT_FORMAT_NAME);
    expect(format.strict).toBe(true);

    const input = body.input as Record<string, unknown>[];
    expect(input).toHaveLength(3);
    // Turno user con imagen → input_image (data URL, detail auto) + input_text.
    expect(input[0].role).toBe('user');
    expect(input[0].content).toEqual([
      { type: 'input_image', detail: 'auto', image_url: `data:image/png;base64,${IMG.data}` },
      { type: 'input_text', text: 'Viga IPE con plano adjunto' },
    ]);
    // Turno assistant → content string (envelope verbatim).
    expect(input[1]).toEqual({ role: 'assistant', content: ASSISTANT_RAW });
    // Turno user sin imágenes → solo input_text.
    expect(input[2].role).toBe('user');
    expect(input[2].content).toEqual([{ type: 'input_text', text: 'La luz es de 8 m' }]);
  });

  it('envía el schema con enums sin null y type-arrays conservados', async () => {
    mocks.openaiCreate.mockResolvedValueOnce({ output_text: ENVELOPE_JSON });
    const req = makeReq();

    await openaiChatRaw(req, 'sk-openai-test', 'gpt-5.6-terra');

    const [body] = mocks.openaiCreate.mock.calls[0] as [Record<string, unknown>];
    const schema = (body.text as { format: { schema: Record<string, unknown> } }).format.schema;
    for (const node of collectNodes(schema)) {
      if (Array.isArray(node.enum)) {
        expect(node.enum).not.toContain(null);
      }
    }
    // type-array del payload anidado CONSERVADO, enum filtrado.
    expect(nestedTipo(schema)).toEqual({ type: ['string', 'null'], enum: ['IPE', 'HEA'] });
    // El canónico de la request NO se mutó.
    expect(nestedTipo(req.schema)).toEqual({ type: ['string', 'null'], enum: ['IPE', 'HEA', null] });
  });
});

describe('gemini.chatRaw', () => {
  it('construye contents con role model para assistant y el schema canónico SIN convertir', async () => {
    mocks.geminiGenerate.mockResolvedValueOnce({ text: ENVELOPE_JSON });
    const req = makeReq();

    const raw = await geminiChatRaw(req, 'AIza-test', 'gemini-3.1-flash-lite');

    expect(raw).toEqual(ENVELOPE);
    expect(mocks.geminiGenerate).toHaveBeenCalledTimes(1);
    const [params] = mocks.geminiGenerate.mock.calls[0] as [Record<string, unknown>];
    expect(params.model).toBe('gemini-3.1-flash-lite');

    const contents = params.contents as Record<string, unknown>[];
    expect(contents).toHaveLength(3);
    // Turno user con imagen → parts inlineData + texto.
    expect(contents[0]).toEqual({
      role: 'user',
      parts: [
        { inlineData: { mimeType: 'image/png', data: IMG.data } },
        { text: 'Viga IPE con plano adjunto' },
      ],
    });
    // Turno assistant → role 'model' con el envelope verbatim como texto.
    expect(contents[1]).toEqual({ role: 'model', parts: [{ text: ASSISTANT_RAW }] });
    expect(contents[2]).toEqual({ role: 'user', parts: [{ text: 'La luz es de 8 m' }] });

    const config = params.config as Record<string, unknown>;
    expect(config.systemInstruction).toBe(chatSystemText(req.system));
    expect(config.responseMimeType).toBe('application/json');
    // EXACTAMENTE el schema canónico: misma referencia, sin conversión alguna.
    expect(config.responseJsonSchema).toBe(req.schema);
    expect(nestedTipo(config.responseJsonSchema as Record<string, unknown>)).toEqual({
      type: ['string', 'null'],
      enum: ['IPE', 'HEA', null],
    });
    expect(config.abortSignal).toBe(req.signal);
  });
});

// ── Caché de prompt ──────────────────────────────────────────────────────────
// La caché de los tres proveedores es un PREFIJO byte a byte: solo se reutiliza
// el tramo inicial que llega idéntico. De ahí el system partido (ChatSystem):
// las reglas (~4.200 tokens, iguales todos los turnos) delante y cacheadas; el
// estado y los resultados detrás, fuera de la caché. Si el breakpoint cayera
// DESPUÉS del volátil, cada turno escribiría una entrada nueva (a 1,25×) que no
// se leería jamás: sería más caro que no cachear.

describe('caché de prompt — anthropic (breakpoints explícitos)', () => {
  it('manda el system en DOS bloques y marca SOLO el estable', async () => {
    mocks.anthropicCreate.mockResolvedValueOnce({ content: [{ type: 'text', text: ENVELOPE_JSON }] });
    const req = makeReq();

    await anthropicChatRaw(req, 'sk-ant-test', 'claude-sonnet-5');

    const [body] = mocks.anthropicCreate.mock.calls[0] as [Record<string, unknown>];
    expect(body.system).toEqual([
      { type: 'text', text: SYSTEM.stable, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: SYSTEM.volatile },
    ]);
  });

  it('el bloque volátil NO lleva cache_control (se reescribiría en cada turno sin leerse nunca)', async () => {
    mocks.anthropicCreate.mockResolvedValueOnce({ content: [{ type: 'text', text: ENVELOPE_JSON }] });

    await anthropicChatRaw(makeReq(), 'sk-ant-test', 'claude-sonnet-5');

    const [body] = mocks.anthropicCreate.mock.calls[0] as [Record<string, unknown>];
    const blocks = body.system as Record<string, unknown>[];
    expect(blocks[1].cache_control).toBeUndefined();
    // Y el corte no pierde ni añade texto respecto al prompt completo:
    expect(blocks.map((b) => b.text).join('\n\n')).toBe(chatSystemText(SYSTEM));
  });

  it('con imágenes en la ventana: 2º breakpoint en el último bloque del último turno', async () => {
    mocks.anthropicCreate.mockResolvedValueOnce({ content: [{ type: 'text', text: ENVELOPE_JSON }] });

    await anthropicChatRaw(makeReq(), 'sk-ant-test', 'claude-sonnet-5');

    const [body] = mocks.anthropicCreate.mock.calls[0] as [Record<string, unknown>];
    const messages = body.messages as { role: string; content: unknown }[];
    const last = messages[messages.length - 1].content as Record<string, unknown>[];
    expect(last[last.length - 1].cache_control).toEqual({ type: 'ephemeral' });
    // El turno intermedio (assistant) sigue siendo un string, sin bloques.
    expect(messages[1].content).toBe(ASSISTANT_RAW);
  });

  it('sin imágenes: NINGÚN mensaje lleva breakpoint (el recargo de escritura no compensa)', async () => {
    mocks.anthropicCreate.mockResolvedValueOnce({ content: [{ type: 'text', text: ENVELOPE_JSON }] });

    await anthropicChatRaw(makeReqSinImagenes(), 'sk-ant-test', 'claude-sonnet-5');

    const [body] = mocks.anthropicCreate.mock.calls[0] as [Record<string, unknown>];
    const messages = body.messages as { content: unknown }[];
    for (const m of messages) {
      if (!Array.isArray(m.content)) continue;
      for (const block of m.content as Record<string, unknown>[]) {
        expect(block.cache_control).toBeUndefined();
      }
    }
    // El breakpoint del system sigue ahí: es el que da el ahorro de siempre.
    expect((body.system as Record<string, unknown>[])[0].cache_control).toEqual({ type: 'ephemeral' });
  });
});

// ── Razonamiento ─────────────────────────────────────────────────────────────
// Los tres providers piden el MÍNIMO razonamiento posible: los tokens de
// pensamiento se facturan como SALIDA aunque no se vean, y la tarea (extracción
// estructurada con un prompt muy explícito) no los necesita. Anthropic lo apaga
// (`thinking: disabled`), OpenAI también (`effort: 'none'`) y Gemini lo baja al
// suelo (MINIMAL: en 3.x no se puede apagar).

describe('razonamiento — se pide el mínimo en los 3 providers', () => {
  it('anthropic: thinking disabled', async () => {
    mocks.anthropicCreate.mockResolvedValueOnce({ content: [{ type: 'text', text: ENVELOPE_JSON }] });

    await anthropicChatRaw(makeReq(), 'sk-ant-test', 'claude-sonnet-5');

    const [body] = mocks.anthropicCreate.mock.calls[0] as [Record<string, unknown>];
    expect(body.thinking).toEqual({ type: 'disabled' });
  });

  it("openai: reasoning effort 'none' (los tokens de razonamiento se facturan como salida)", async () => {
    mocks.openaiCreate.mockResolvedValueOnce({ output_text: ENVELOPE_JSON });

    await openaiChatRaw(makeReq(), 'sk-openai-test', 'gpt-5.6-terra');

    const [body] = mocks.openaiCreate.mock.calls[0] as [Record<string, unknown>];
    expect(body.reasoning).toEqual({ effort: 'none' });
  });

  it('gemini: thinkingBudget 0 (2.5 apaga el razonamiento), y NUNCA junto a thinkingLevel (sería un 400)', async () => {
    mocks.geminiGenerate.mockResolvedValueOnce({ text: ENVELOPE_JSON });

    await geminiChatRaw(makeReq(), 'AIza-test', 'gemini-3.1-flash-lite');

    const [params] = mocks.geminiGenerate.mock.calls[0] as [Record<string, unknown>];
    const config = params.config as Record<string, unknown>;
    const thinking = config.thinkingConfig as Record<string, unknown>;
    expect(thinking.thinkingBudget).toBe(0);
    expect(thinking.thinkingLevel).toBeUndefined();
  });
});

describe('caché de prompt — openai y gemini (implícita)', () => {
  it('openai manda prompt_cache_key (sin ella GPT-5.6 no acierta de forma fiable)', async () => {
    mocks.openaiCreate.mockResolvedValueOnce({ output_text: ENVELOPE_JSON });
    const req = makeReq();

    await openaiChatRaw(req, 'sk-openai-test', 'gpt-5.6-terra');

    const [body] = mocks.openaiCreate.mock.calls[0] as [Record<string, unknown>];
    expect(body.prompt_cache_key).toBe('concreta-steel-beams');
    // Y el prefijo estable va DELANTE: es lo que OpenAI cachea solo.
    expect((body.instructions as string).startsWith(SYSTEM.stable)).toBe(true);
  });

  it('gemini no lleva parámetro de caché, pero el prefijo estable va delante', async () => {
    mocks.geminiGenerate.mockResolvedValueOnce({ text: ENVELOPE_JSON });

    await geminiChatRaw(makeReq(), 'AIza-test', 'gemini-3.1-flash-lite');

    const [params] = mocks.geminiGenerate.mock.calls[0] as [Record<string, unknown>];
    const config = params.config as Record<string, unknown>;
    expect((config.systemInstruction as string).startsWith(SYSTEM.stable)).toBe(true);
    expect(config.systemInstruction as string).toContain(SYSTEM.volatile);
  });
});
