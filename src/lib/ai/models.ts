import type { AiProviderId } from './types';

/** IDs fijos, gama media. anthropic VERIFICADO. openai/gemini: rellenar tras WebSearch (T1.1), anotar fecha+fuente. */
export const AI_MODELS: Record<AiProviderId, string> = {
  anthropic: 'claude-sonnet-5',
  // Verificado 2026-07-12. GPT-5.6 Terra: modelo mainline de gama media de la familia GPT-5.6
  // (GA en la API desde 2026-07-09; Sol=flagship, Terra=equilibrio inteligencia/coste, Luna=alto volumen).
  // Soporta visión (entrada de imágenes) y structured outputs (json_schema strict).
  // Fuentes: https://developers.openai.com/api/docs/models/gpt-5.6-terra · https://openai.com/index/gpt-5-6/
  openai: 'gpt-5.6-terra',
  // Gemini 3.1 Flash-Lite. Historia: el free tier de gemini-3.5-flash son solo 20
  // peticiones/DÍA por proyecto (RPD FreeTier, verificado en vivo con un 429), inviable
  // para la clave compartida. Bajamos a un modelo con free tier grande, pero la cuenta de
  // la clave es NUEVA y Google le veta gemini-2.5-flash / -lite y 2.0-* (404 "no longer
  // available to new users"); los únicos flash que responde son los -lite de generación
  // vigente. gemini-3.1-flash-lite (modelo FIJADO, no alias): 200 OK, structured output vía
  // responseJsonSchema y razonamiento apagable con thinkingBudget:0 (verificado: la
  // respuesta no trae thoughtsTokenCount). Es el tier "lite" (alto volumen, más cuota).
  // Fuentes: https://ai.google.dev/gemini-api/docs/models · https://ai.google.dev/gemini-api/docs/rate-limits
  gemini: 'gemini-3.1-flash-lite',
};

export const AI_PROVIDER_LABELS: Record<AiProviderId, string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI (GPT)',
  gemini: 'Google (Gemini)',
};

export const AI_PROVIDER_KEY_URLS: Record<AiProviderId, string> = {
  anthropic: 'https://platform.claude.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
  gemini: 'https://aistudio.google.com/apikey',
};
