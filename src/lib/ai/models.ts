import type { AiProviderId } from './types';

/** IDs fijos, gama media. anthropic VERIFICADO. openai/gemini: rellenar tras WebSearch (T1.1), anotar fecha+fuente. */
export const AI_MODELS: Record<AiProviderId, string> = {
  anthropic: 'claude-sonnet-5',
  // Verificado 2026-07-12. GPT-5.6 Terra: modelo mainline de gama media de la familia GPT-5.6
  // (GA en la API desde 2026-07-09; Sol=flagship, Terra=equilibrio inteligencia/coste, Luna=alto volumen).
  // Soporta visión (entrada de imágenes) y structured outputs (json_schema strict).
  // Fuentes: https://developers.openai.com/api/docs/models/gpt-5.6-terra · https://openai.com/index/gpt-5-6/
  openai: 'gpt-5.6-terra',
  // Verificado 2026-07-12. Gemini 3.5 Flash: generación vigente "Flash", GA/estable; entrada de
  // imágenes y structured output vía responseJsonSchema/responseSchema en GenerateContentConfig.
  // Fuentes: https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.5 · https://ai.google.dev/gemini-api/docs/models
  gemini: 'gemini-3.5-flash',
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
