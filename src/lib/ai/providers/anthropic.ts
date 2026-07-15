/**
 * Provider Anthropic (Claude) — chat conversacional con structured output.
 *
 * El SDK se carga con dynamic import para que quede en el chunk `ai-vendor`
 * (code splitting, fuera del precache PWA; ver vite.config.ts).
 *
 * Structured output verificado contra los tipos de @anthropic-ai/sdk@0.111.0
 * (node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts):
 * - `MessageCreateParams.output_config?: OutputConfig` con
 *   `format?: { type: 'json_schema'; schema: { [key: string]: unknown } }`
 *   (el parámetro deprecado `output_format` NO se usa).
 * - `MessageParam` (línea 807): `content: string | Array<ContentBlockParam>`,
 *   `role: 'user' | 'assistant' | 'system'` → los turnos assistant van como
 *   string y los user como array de bloques imagen+texto.
 * - `thinking: { type: 'disabled' }` es miembro válido de `ThinkingConfigParam`
 *   y está aceptado en claude-sonnet-5.
 * - NO se envían `temperature` ni `top_p` (400 en Sonnet 5).
 */
import { AiError, aiErrorKindFromStatus, type ProviderChatFn } from '../types';
import { exceedsAnthropicUnionLimit, toAnthropicSchema } from './schemaConvert';

type AnthropicSdkClass = (typeof import('@anthropic-ai/sdk'))['default'];

/** Mensaje de error sin la API key: elimina cualquier aparición accidental. */
function withoutKey(message: string, apiKey: string): string {
  return apiKey.length > 0 ? message.split(apiKey).join('[key oculta]') : message;
}

/**
 * Normaliza cualquier error del SDK/navegador a AiError.
 * Nunca interpola la apiKey en los mensajes.
 */
function toAiError(
  err: unknown,
  apiKey: string,
  signal: AbortSignal | undefined,
  Anthropic: AnthropicSdkClass,
): AiError {
  if (err instanceof AiError) return err;

  // Cancelación: signal abortado o AbortError del SDK/navegador.
  if (
    signal?.aborted === true ||
    err instanceof Anthropic.APIUserAbortError ||
    (err instanceof Error && err.name === 'AbortError')
  ) {
    return new AiError('aborted', 'Petición cancelada.');
  }

  // Error de conexión (sin status HTTP) → network.
  if (err instanceof Anthropic.APIConnectionError) {
    return new AiError('network', withoutKey(err.message, apiKey));
  }

  // Error de la API (o cualquier instancia con .status numérico) → por status.
  const status =
    typeof err === 'object' && err !== null && typeof (err as { status?: unknown }).status === 'number'
      ? (err as { status: number }).status
      : undefined;
  if (err instanceof Anthropic.APIError || status !== undefined) {
    const message = err instanceof Error ? err.message : `Error HTTP ${String(status)} de la API de Anthropic.`;
    return new AiError(aiErrorKindFromStatus(status), withoutKey(message, apiKey));
  }

  return new AiError(
    'unknown',
    err instanceof Error ? withoutKey(err.message, apiKey) : 'Error inesperado en la petición a Anthropic.',
  );
}

/** Primer bloque de texto del mensaje → JSON parseado; sin bloque o JSON inválido → AiError('bad-response'). */
function parseJsonFromContent(content: ReadonlyArray<{ type: string; text?: string }>): unknown {
  for (const block of content) {
    if (block.type === 'text' && typeof block.text === 'string') {
      try {
        return JSON.parse(block.text) as unknown;
      } catch {
        throw new AiError('bad-response', 'La respuesta del modelo no es JSON válido.');
      }
    }
  }
  throw new AiError('bad-response', 'La respuesta del modelo no contiene ningún bloque de texto.');
}

/**
 * Turno de chat conversacional: system y schema llegan en la request (no se
 * importa schema.ts). Turnos user → array de bloques imagen (base64) + texto;
 * turnos assistant → content string (el envelope JSON crudo, verbatim).
 */
export const chatRaw: ProviderChatFn = async (req, apiKey, model) => {
  // Tope DURO de Anthropic: >16 parámetros con unión → 400 «exponential
  // compilation cost» (o, si las uniones se disfrazan de opcionales, un cuelgue
  // de ~90 s). Se corta ANTES de importar el SDK y llamar, con un error claro.
  // Es defensa en profundidad: el modal ya deshabilita el envío en este caso
  // (exceedsAnthropicUnionLimit), pero así ninguna otra vía puede colgar la app.
  if (exceedsAnthropicUnionLimit(req.schema)) {
    throw new AiError(
      'schema-too-large',
      'Este módulo tiene más de 16 campos y Anthropic (Claude) no puede procesarlo. Cambia a OpenAI o Google (Gemini) para usar el asistente aquí.',
    );
  }
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  try {
    // CACHÉ DE PROMPT (ver ChatSystem en ../types): el system va como DOS bloques
    // y el breakpoint (`cache_control`) marca el final del estable. A partir del
    // 2º turno esos ~4.200 tokens de reglas se leen de caché a 0,1× su precio;
    // el bloque volátil (estado + resultados) queda fuera y se paga entero, que
    // es justo lo que se pretende: es lo único que cambia.
    const system = [
      { type: 'text' as const, text: req.system.stable, cache_control: { type: 'ephemeral' as const } },
      { type: 'text' as const, text: req.system.volatile },
    ];

    // 2º breakpoint SOLO si hay imágenes en la ventana: se marca el último bloque
    // del último turno, con lo que el historial entero (imágenes incluidas) entra
    // en la caché. Una captura son 1.500–4.500 tokens que hoy se reenvían íntegros
    // en cada turno, así que ahí el ahorro es grande. Ojo: solo acierta mientras el
    // bloque volátil no cambie —la caché es un prefijo y el volátil va antes—, es
    // decir en los turnos de conversación pura; al aplicar una propuesta cambia el
    // estado y toca reescribir. Sin imágenes NO se pone: el historial de texto es
    // pequeño y el recargo por escribir caché (1,25×) se comería el ahorro.
    const hasImages = req.turns.some((t) => (t.images?.length ?? 0) > 0);
    const lastIndex = req.turns.length - 1;

    const messages = req.turns.map((turn, i) => {
      if (turn.role === 'assistant') {
        return { role: 'assistant' as const, content: turn.text };
      }
      const cacheHere = hasImages && i === lastIndex;
      return {
        role: 'user' as const,
        content: [
          ...(turn.images ?? []).map((img) => ({
            type: 'image' as const,
            source: {
              type: 'base64' as const,
              media_type: img.mediaType,
              data: img.data,
            },
          })),
          cacheHere
            ? { type: 'text' as const, text: turn.text, cache_control: { type: 'ephemeral' as const } }
            : { type: 'text' as const, text: turn.text },
        ],
      };
    });

    const msg = await client.messages.create(
      {
        model,
        max_tokens: 3000,
        thinking: { type: 'disabled' },
        system,
        output_config: {
          format: { type: 'json_schema', schema: toAnthropicSchema(req.schema) },
        },
        messages,
      },
      { signal: req.signal },
    );
    return parseJsonFromContent(msg.content);
  } catch (err) {
    throw toAiError(err, apiKey, req.signal, Anthropic);
  }
};
