// Tests del dispatcher de proveedores (src/lib/ai/providers/index.ts).
// Los 3 módulos de proveedor van mockeados con vi.mock (intercepta también los
// dynamic import LITERALES del switch); cada mock exporta {chatRaw}.
// Verifica, para runChatTurn:
//   - dispatch correcto: solo el módulo del proveedor elegido recibe la llamada
//   - el modelo pasado es AI_MODELS[provider] (3er argumento)
//   - el raw del proveedor pasa por parseChatEnvelope
//   - un AiError lanzado por el proveedor se propaga con su kind intacto

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChatRequest, ProviderChatFn } from '../../lib/ai/types';

const mocks = vi.hoisted(() => ({
  chat: {
    anthropic: vi.fn<ProviderChatFn>(),
    openai: vi.fn<ProviderChatFn>(),
    gemini: vi.fn<ProviderChatFn>(),
  },
}));

vi.mock('../../lib/ai/providers/anthropic', () => ({
  chatRaw: mocks.chat.anthropic,
}));
vi.mock('../../lib/ai/providers/openai', () => ({
  chatRaw: mocks.chat.openai,
}));
vi.mock('../../lib/ai/providers/gemini', () => ({
  chatRaw: mocks.chat.gemini,
}));

import { runChatTurn } from '../../lib/ai/providers';
import { AI_MODELS } from '../../lib/ai/models';
import { AiError, type AiProviderId } from '../../lib/ai/types';

const CHAT_REQ: ChatRequest = {
  system: { stable: 'reglas de prueba (bloque cacheable)', volatile: 'estado de prueba' },
  schema: { type: 'object', properties: {} },
  turns: [{ role: 'user', text: 'Viga HEB 200 de 8 m' }],
  cacheKey: 'concreta-steel-beams',
};

/** Envelope crudo válido tal y como lo devuelve el structured output. */
const VALID_ENVELOPE_RAW = { reply: 'ok', proposal: null };

const PROVIDERS: readonly AiProviderId[] = ['anthropic', 'openai', 'gemini'];

/** Ejecuta y devuelve el error rechazado (o null si resuelve). */
async function rejectedWith(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (e: unknown) => e,
  );
}

beforeEach(() => {
  for (const provider of PROVIDERS) {
    mocks.chat[provider].mockReset();
  }
});

describe('runChatTurn — dispatch por proveedor', () => {
  it.each(PROVIDERS)(
    "'%s': llama SOLO a su chatRaw, con (req, apiKey, AI_MODELS[provider])",
    async (provider) => {
      mocks.chat[provider].mockResolvedValueOnce(VALID_ENVELOPE_RAW);

      const envelope = await runChatTurn(provider, 'sk-test-123', CHAT_REQ);

      expect(mocks.chat[provider]).toHaveBeenCalledTimes(1);
      expect(mocks.chat[provider]).toHaveBeenCalledWith(CHAT_REQ, 'sk-test-123', AI_MODELS[provider]);
      for (const other of PROVIDERS.filter((p) => p !== provider)) {
        expect(mocks.chat[other]).not.toHaveBeenCalled();
      }
      expect(envelope).toEqual({ reply: 'ok', proposal: null });
    },
  );
});

describe('runChatTurn — el raw pasa por parseChatEnvelope', () => {
  it('raw válido con proposal → envelope con el payload crudo intacto', async () => {
    mocks.chat.anthropic.mockResolvedValueOnce({ reply: 'Datos leídos.', proposal: { L_m: 8 } });
    const envelope = await runChatTurn('anthropic', 'sk-test', CHAT_REQ);
    expect(envelope).toEqual({ reply: 'Datos leídos.', proposal: { L_m: 8 } });
  });

  it("reply no-string → AiError 'bad-response'", async () => {
    mocks.chat.openai.mockResolvedValueOnce({ reply: 42, proposal: null });
    const err = await rejectedWith(runChatTurn('openai', 'sk-test', CHAT_REQ));
    expect(err).toBeInstanceOf(AiError);
    expect((err as AiError).kind).toBe('bad-response');
  });

  it("raw no-objeto → AiError 'bad-response'", async () => {
    mocks.chat.gemini.mockResolvedValueOnce('no soy un envelope');
    const err = await rejectedWith(runChatTurn('gemini', 'sk-test', CHAT_REQ));
    expect(err).toBeInstanceOf(AiError);
    expect((err as AiError).kind).toBe('bad-response');
  });

  it('proposal ausente → null', async () => {
    mocks.chat.gemini.mockResolvedValueOnce({ reply: 'Solo conversación.' });
    const envelope = await runChatTurn('gemini', 'sk-test', CHAT_REQ);
    expect(envelope).toEqual({ reply: 'Solo conversación.', proposal: null });
  });
});

describe('runChatTurn — propagación de AiError del proveedor', () => {
  it("AiError('rate-limit') del chatRaw sube con su kind y mensaje intactos", async () => {
    mocks.chat.anthropic.mockRejectedValueOnce(new AiError('rate-limit', 'HTTP 429'));
    const err = await rejectedWith(runChatTurn('anthropic', 'sk-test', CHAT_REQ));
    expect(err).toBeInstanceOf(AiError);
    expect((err as AiError).kind).toBe('rate-limit');
    expect((err as AiError).message).toBe('HTTP 429');
  });
});
