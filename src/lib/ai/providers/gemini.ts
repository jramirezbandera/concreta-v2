/**
 * Proveedor Gemini (Google) — chat conversacional con structured output.
 *
 * El SDK `@google/genai` se carga con dynamic import DENTRO de la función
 * para que Vite lo separe en su propio chunk (excluido del precache PWA).
 *
 * Verificado contra los tipos de `@google/genai@2.11.0`
 * (node_modules/@google/genai/dist/genai.d.ts):
 * - `GenerateContentConfig` acepta `responseJsonSchema` (JSON Schema estándar,
 *   admite `type` array y `null` en enums) y `abortSignal`, por lo que se pasa
 *   el schema canónico tal cual, sin conversión a formato OpenAPI
 *   (`responseSchema`).
 * - `Content` (línea 1887): `{ parts?: Part[]; role?: string }` con roles
 *   'user' | 'model' → los turnos assistant del chat se mapean a 'model'.
 */

import { AiError, aiErrorKindFromStatus, chatSystemText } from '../types';
import type { ProviderChatFn } from '../types';

type GeminiApiErrorClass = (typeof import('@google/genai'))['ApiError'];

/** Extrae un status HTTP numérico de un error del SDK (ApiError.status o error.code). */
function numericStatus(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const rec = err as Record<string, unknown>;
  if (typeof rec.status === 'number') return rec.status;
  if (typeof rec.code === 'number') return rec.code;
  return undefined;
}

/** Elimina la apiKey del texto por si el SDK la incluyera en algún mensaje de error. */
function scrub(message: string, apiKey: string): string {
  return apiKey ? message.split(apiKey).join('[redactada]') : message;
}

/**
 * Normaliza cualquier error del SDK/fetch a AiError.
 * Nunca interpola la apiKey en los mensajes.
 */
function toAiError(
  err: unknown,
  apiKey: string,
  signal: AbortSignal | undefined,
  ApiError: GeminiApiErrorClass,
): AiError {
  if (err instanceof AiError) return err;
  if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
    return new AiError('aborted', 'Petición a Gemini cancelada.');
  }
  if (err instanceof ApiError) {
    return new AiError(
      aiErrorKindFromStatus(err.status),
      scrub(`Gemini API (HTTP ${err.status}): ${err.message}`, apiKey),
    );
  }
  const status = numericStatus(err);
  if (status !== undefined) {
    return new AiError(
      aiErrorKindFromStatus(status),
      scrub(`Gemini API (HTTP ${status}): ${err instanceof Error ? err.message : 'error'}`, apiKey),
    );
  }
  if (err instanceof TypeError) {
    // fetch falla sin status (offline, DNS, CORS...) → TypeError.
    return new AiError('network', 'No se pudo conectar con la API de Gemini.');
  }
  return new AiError(
    'unknown',
    scrub(`Error inesperado llamando a Gemini: ${err instanceof Error ? err.message : String(err)}`, apiKey),
  );
}

/** `response.text` → JSON parseado; vacío o JSON inválido → AiError('bad-response'). */
function parseJsonText(text: string | undefined): unknown {
  if (text === undefined || text.trim() === '') {
    throw new AiError('bad-response', 'Gemini devolvió una respuesta vacía.');
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AiError('bad-response', 'Gemini devolvió una respuesta que no es JSON válido.');
  }
}

/**
 * Turno de chat conversacional: system y schema llegan en la request (no se
 * usa schema.ts). Gemini acepta el schema canónico SIN convertir en
 * `responseJsonSchema`. Turnos assistant → role 'model'; turnos user → parts
 * con imágenes `inlineData` + texto.
 */
export const chatRaw: ProviderChatFn = async (req, apiKey, model) => {
  let GoogleGenAI: (typeof import('@google/genai'))['GoogleGenAI'];
  let ApiError: (typeof import('@google/genai'))['ApiError'];
  let ThinkingLevel: (typeof import('@google/genai'))['ThinkingLevel'];
  try {
    ({ GoogleGenAI, ApiError, ThinkingLevel } = await import('@google/genai'));
  } catch {
    throw new AiError('network', 'No se pudo cargar el SDK de Gemini (¿sin conexión?).');
  }

  const ai = new GoogleGenAI({ apiKey });

  let text: string | undefined;
  try {
    const response = await ai.models.generateContent({
      model,
      contents: req.turns.map((turn) => ({
        role: turn.role === 'assistant' ? 'model' : 'user',
        parts: [
          ...(turn.images ?? []).map((img) => ({
            inlineData: { mimeType: img.mediaType, data: img.data },
          })),
          { text: turn.text },
        ],
      })),
      config: {
        // CACHÉ DE PROMPT: en Gemini es IMPLÍCITA y automática (2.5+), sin
        // parámetro ni breakpoint: cachea sola el prefijo común de la petición
        // —systemInstruction incluido— si supera el umbral del modelo (4.096
        // tokens en 3.5 Flash, que nuestro bloque estable sobrepasa). Lo único
        // que hay que hacer es NO meter nada variable delante: por eso el
        // system va estable-primero (ver ChatSystem en ../types).
        systemInstruction: chatSystemText(req.system),
        // RAZONAMIENTO AL MÍNIMO — el equivalente más cercano al `thinking:
        // disabled` de Anthropic. En Gemini 3.x el pensamiento NO se puede
        // apagar (a diferencia de 2.5, donde `thinkingBudget: 0` lo desactivaba):
        // MINIMAL es el suelo. Importa porque esos tokens se facturan como SALIDA
        // ($9/M en 3.5 Flash) aunque no se vean, y la tarea es extracción guiada
        // por un prompt muy explícito, no razonamiento abierto.
        // OJO: `thinkingLevel` y el antiguo `thinkingBudget` son EXCLUYENTES —
        // mandar los dos es un 400.
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        responseMimeType: 'application/json',
        responseJsonSchema: req.schema,
        abortSignal: req.signal,
      },
    });
    text = response.text;
  } catch (err) {
    throw toAiError(err, apiKey, req.signal, ApiError);
  }
  return parseJsonText(text);
};
