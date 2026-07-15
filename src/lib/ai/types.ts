export type AiProviderId = 'anthropic' | 'openai' | 'gemini';
export type AiImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface AiImageAttachment {
  /** Base64 puro, SIN prefijo "data:...;base64," */
  data: string;
  mediaType: AiImageMediaType;
}

/** Salida del LLM en unidades "humanas": longitudes en m, cargas en kN/m². Todo nullable. */
export interface SteelBeamExtraction {
  tipo: 'IPE' | 'HEA' | 'HEB' | 'IPN' | null;
  size: number | null;                       // canto nominal en mm (p.ej. 300)
  steel: 'S275' | 'S355' | null;
  beamType: 'ss' | 'cantilever' | 'fp' | 'ff' | null;
  L_m: number | null;
  Lcr_m: number | null;                      // SOLO si el enunciado la da explícitamente
  deflLimit: 250 | 300 | 400 | 500 | 600 | null;
  elsCombo: 'characteristic' | 'frequent' | 'quasi-permanent' | null;
  useCategory: 'A1' | 'A2' | 'B' | 'C1' | 'C2' | 'C3' | 'D1' | 'E1' | 'G1' | null; // 'custom' lo decide el mapper
  gk_kNm2: number | null;
  qk_kNm2: number | null;
  bTrib_m: number | null;
  warnings: string[];
  notes: string | null;
}

export type AiErrorKind =
  | 'invalid-key'
  | 'rate-limit'
  | 'network'
  | 'bad-response'
  | 'aborted'
  | 'schema-too-large'
  | 'unknown';

export class AiError extends Error {
  readonly kind: AiErrorKind;
  constructor(kind: AiErrorKind, message: string) {
    super(message);
    this.name = 'AiError';
    this.kind = kind;
  }
}

export function aiErrorKindFromStatus(status: number | undefined): AiErrorKind {
  if (status === 401 || status === 403) return 'invalid-key';
  if (status === 429) return 'rate-limit';
  if (status !== undefined && status >= 500) return 'network';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Chat conversacional (Fase 1) — contrato congelado del plan.
// ---------------------------------------------------------------------------

export interface ChatTurn {
  role: 'user' | 'assistant';
  /** user: texto del usuario · assistant: JSON crudo del envelope (reenviado verbatim). */
  text: string;
  images?: AiImageAttachment[];   // solo turnos user
}

/**
 * System prompt partido en dos bloques — el corte existe para la CACHÉ DE PROMPT.
 *
 * La caché de los tres proveedores es un PREFIJO: solo se reutiliza el tramo
 * inicial que llega byte a byte idéntico. Por eso todo lo que cambia por turno
 * (el estado del formulario y los resultados del cálculo) tiene que ir DESPUÉS
 * de lo que no cambia; si se colara antes, invalidaría la caché entera y el
 * ahorro sería cero.
 *
 * - `stable`: base + SOBRE LA APLICACIÓN + reglas del módulo + reglas de
 *   resultados. ~4.200 tokens IDÉNTICOS en todos los turnos del mismo módulo.
 *   Es el punto de corte de la caché (Anthropic lo marca con `cache_control`;
 *   OpenAI y Gemini lo detectan solos).
 * - `volatile`: estado + resultados. Cambia cada turno; nunca se cachea.
 *
 * Ver `buildChatSystemBlocks` (chatSchema.ts) — quien compone los dos bloques.
 */
export interface ChatSystem {
  stable: string;
  volatile: string;
}

/** Los dos bloques como un solo string (proveedores sin caché explícita). */
export function chatSystemText(system: ChatSystem): string {
  return `${system.stable}\n\n${system.volatile}`;
}

export interface ChatRequest {
  system: ChatSystem;                   // bloque estable (cacheable) + bloque volátil, POR TURNO
  schema: Record<string, unknown>;      // envelope canónico = buildChatSchema(adapter.payloadSchema)
  turns: ChatTurn[];                    // antiguo → nuevo; el último SIEMPRE 'user'; roles estrictamente alternos
  /**
   * Clave del prefijo cacheado, estable por módulo (`concreta-<idModulo>`).
   * Solo la usa OpenAI (`prompt_cache_key`): a partir de GPT-5.6 es lo que
   * enruta la petición a la máquina que tiene el prefijo caliente, así que sin
   * ella los aciertos de caché son erráticos. Anthropic y Gemini la ignoran.
   */
  cacheKey: string;
  signal?: AbortSignal;
}

export interface ChatEnvelope { reply: string; proposal: unknown; }   // proposal: null | payload crudo

export type ProviderChatFn = (req: ChatRequest, apiKey: string, model: string) => Promise<unknown>;

export const AI_ERROR_MESSAGES: Record<AiErrorKind, string> = {
  'invalid-key': 'La API key no es válida o no tiene permisos.',
  'rate-limit': 'Límite de peticiones alcanzado. Espera unos segundos y reintenta.',
  'network': 'Error de red o del servicio. Comprueba tu conexión.',
  'bad-response': 'El modelo devolvió una respuesta no interpretable.',
  'aborted': 'Petición cancelada.',
  'schema-too-large':
    'Anthropic (Claude) no admite este módulo porque tiene demasiados campos. Cambia a OpenAI o Google (Gemini) para usar el asistente aquí.',
  'unknown': 'Error inesperado.',
};
