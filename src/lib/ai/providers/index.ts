import { AiError } from '../types';
import type { AiProviderId, ChatEnvelope, ChatRequest, ProviderChatFn } from '../types';
import { AI_MODELS } from '../models';
import { parseChatEnvelope } from '../validate';

/**
 * Dispatcher de proveedores de IA: turno de chat conversacional.
 *
 * Cada rama del switch usa un dynamic import LITERAL (nunca `import(variable)`):
 * es imprescindible para que Vite genere un chunk separado por proveedor
 * (code splitting; los SDKs quedan fuera del bundle principal y del precache PWA).
 *
 * Solo el import está envuelto en try/catch: un fallo al cargar el chunk
 * (p.ej. offline y no cacheado) se traduce a AiError('network'). Los errores de
 * `chatRaw` (ya normalizados a AiError por cada proveedor) y de
 * `parseChatEnvelope` (AiError 'bad-response') suben sin capturar.
 */
export async function runChatTurn(
  provider: AiProviderId,
  apiKey: string,
  req: ChatRequest,
): Promise<ChatEnvelope> {
  let mod: { chatRaw: ProviderChatFn };
  try {
    switch (provider) {
      case 'anthropic':
        mod = await import('./anthropic');
        break;
      case 'openai':
        mod = await import('./openai');
        break;
      case 'gemini':
        mod = await import('./gemini');
        break;
      default: {
        const exhaustive: never = provider;
        throw new AiError('unknown', `Proveedor de IA no soportado: ${String(exhaustive)}`);
      }
    }
  } catch (err) {
    if (err instanceof AiError) throw err; // rama default (exhaustividad), no un fallo de import
    throw new AiError('network', 'No se pudo cargar el módulo del proveedor (¿sin conexión?)');
  }
  const raw = await mod.chatRaw(req, apiKey, AI_MODELS[provider]);
  return parseChatEnvelope(raw);
}
