/**
 * Provider OpenAI (GPT) — chat conversacional con structured output.
 *
 * El SDK se carga con dynamic import para que quede en el chunk `ai-vendor`
 * (code splitting, fuera del precache PWA; ver vite.config.ts).
 *
 * Responses API verificada contra los tipos de openai@6.46.0
 * (node_modules/openai/resources/responses/responses.d.ts):
 * - `client.responses.create(body, options?)` con `RequestOptions.signal` (2º argumento).
 * - `ResponseCreateParams`: `instructions?: string`, `input?: string | ResponseInput`,
 *   `text?: { format?: ResponseFormatTextConfig }`.
 * - `ResponseFormatTextJSONSchemaConfig`: `{ type: 'json_schema'; name; schema; strict?: boolean }`.
 * - `EasyInputMessage` (línea 487): `content: string | ResponseInputMessageContentList`,
 *   `role: 'user' | 'assistant' | 'system' | 'developer'` → los turnos assistant
 *   van como string y los user como lista de bloques imagen+texto.
 * - Contenido de usuario: `ResponseInputText { type: 'input_text'; text }` y
 *   `ResponseInputImage { type: 'input_image'; detail (obligatorio); image_url?: string }`
 *   (data URL base64 admitida).
 * - `Response.output_text: string` agrega los bloques de texto de salida.
 */
import { AiError, aiErrorKindFromStatus, chatSystemText, type ProviderChatFn } from '../types';
import { CHAT_FORMAT_NAME } from '../chatSchema';
import { toOpenAiSchema } from './schemaConvert';

type OpenAiSdkClass = (typeof import('openai'))['default'];

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
  OpenAI: OpenAiSdkClass,
): AiError {
  if (err instanceof AiError) return err;

  // Cancelación: signal abortado o AbortError del SDK/navegador.
  if (
    signal?.aborted === true ||
    err instanceof OpenAI.APIUserAbortError ||
    (err instanceof Error && err.name === 'AbortError')
  ) {
    return new AiError('aborted', 'Petición cancelada.');
  }

  // Error de conexión (sin status HTTP) → network.
  if (err instanceof OpenAI.APIConnectionError) {
    return new AiError('network', withoutKey(err.message, apiKey));
  }

  // Error de la API (o cualquier instancia con .status numérico) → por status.
  const status =
    typeof err === 'object' && err !== null && typeof (err as { status?: unknown }).status === 'number'
      ? (err as { status: number }).status
      : undefined;
  if (err instanceof OpenAI.APIError || status !== undefined) {
    const message = err instanceof Error ? err.message : `Error HTTP ${String(status)} de la API de OpenAI.`;
    return new AiError(aiErrorKindFromStatus(status), withoutKey(message, apiKey));
  }

  return new AiError(
    'unknown',
    err instanceof Error ? withoutKey(err.message, apiKey) : 'Error inesperado en la petición a OpenAI.',
  );
}

/** `output_text` → JSON parseado; vacío o JSON inválido → AiError('bad-response'). */
function parseJsonFromOutputText(jsonText: string): unknown {
  if (jsonText === '') {
    throw new AiError('bad-response', 'La respuesta del modelo no contiene texto de salida.');
  }
  try {
    return JSON.parse(jsonText) as unknown;
  } catch {
    throw new AiError('bad-response', 'La respuesta del modelo no es JSON válido.');
  }
}

/**
 * Turno de chat conversacional: system y schema llegan en la request (no se
 * usa schema.ts). Turnos user → lista de `input_image` (data URL) + `input_text`;
 * turnos assistant → content string (el envelope JSON crudo, verbatim).
 */
export const chatRaw: ProviderChatFn = async (req, apiKey, model) => {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });

  try {
    const response = await client.responses.create(
      {
        model,
        // CACHÉ DE PROMPT: en OpenAI es AUTOMÁTICA a partir de 1.024 tokens y no
        // se marca ningún breakpoint — cachea sola el prefijo común más largo.
        // Por eso basta con reenviar el system entero: su tramo estable ya va
        // delante (ver ChatSystem en ../types) y el volátil, al final, solo
        // invalida lo que viene después de él.
        instructions: chatSystemText(req.system),
        // …pero desde GPT-5.6 el acierto de caché depende de que la petición
        // aterrice en la máquina que tiene ese prefijo caliente, y eso lo enruta
        // `prompt_cache_key`. Sin ella los aciertos son erráticos.
        prompt_cache_key: req.cacheKey,
        // RAZONAMIENTO DESACTIVADO — paridad con Anthropic (`thinking: disabled`).
        // Los modelos GPT-5.x razonan por defecto y esos tokens se facturan como
        // SALIDA ($15/M en Terra), aunque no se vean: pueden multiplicar por varias
        // veces el coste de un turno cuya respuesta útil son ~200 tokens. La tarea
        // aquí es extracción estructurada guiada por un prompt muy explícito, no
        // razonamiento abierto. 'none' es el único valor que lo apaga del todo
        // (verificado contra ReasoningEffort del SDK: none|minimal|low|…|max).
        reasoning: { effort: 'none' },
        // No almacenar la respuesta en OpenAI (BYOK; nota de privacidad del modal).
        store: false,
        text: {
          format: {
            type: 'json_schema',
            name: CHAT_FORMAT_NAME,
            strict: true,
            schema: toOpenAiSchema(req.schema),
          },
        },
        input: req.turns.map((turn) =>
          turn.role === 'assistant'
            ? { role: 'assistant' as const, content: turn.text }
            : {
                role: 'user' as const,
                content: [
                  ...(turn.images ?? []).map((img) => ({
                    type: 'input_image' as const,
                    detail: 'auto' as const,
                    image_url: `data:${img.mediaType};base64,${img.data}`,
                  })),
                  { type: 'input_text' as const, text: turn.text },
                ],
              },
        ),
      },
      { signal: req.signal },
    );
    return parseJsonFromOutputText(response.output_text);
  } catch (err) {
    throw toAiError(err, apiKey, req.signal, OpenAI);
  }
};
