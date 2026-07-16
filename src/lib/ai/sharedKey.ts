import type { AiProviderId } from './types';

/**
 * Clave Gemini COMPARTIDA para que quien no trae su propia API key pueda usar
 * el asistente desde el primer momento (BYOK sigue disponible y SIEMPRE tiene
 * prioridad — ver AiSettingsProvider.activeKey).
 *
 * La clave NO vive en el código: llega por la variable de entorno
 * VITE_AI_SHARED_GEMINI_KEY, que se inyecta al COMPILAR:
 *   - Producción (GitHub Pages): un Secret del repo → el workflow
 *     .github/workflows/deploy.yml lo pasa a `vite build` → la clave queda
 *     horneada en el bundle SERVIDO (es una clave de cliente: pública por
 *     necesidad, cualquiera la ve en el JS descargado) pero NUNCA en el
 *     repositorio ni en el historial de git.
 *   - Desarrollo local: `.env.local` (gitignored por `*.local`).
 *   - Tests: `.env.test` (valor ficticio, versionado).
 * Sin la variable, SHARED_GEMINI_KEY queda vacía y la clave compartida se
 * desactiva: el módulo vuelve a ser BYOK puro.
 *
 * ⚠️ El proyecto de Google de esta clave NO debe tener facturación (peor caso
 * 429, nunca cargo). Rotación: cambia el Secret del repo y vuelve a desplegar;
 * al ser un fallback en tiempo de lectura, ningún usuario se queda con la vieja.
 */
export const SHARED_GEMINI_KEY = (
  (import.meta.env as Record<string, string | undefined>).VITE_AI_SHARED_GEMINI_KEY ?? ''
).trim();

/**
 * Clave compartida para `provider`, o null si no hay ninguna. Solo Gemini la
 * tiene (Anthropic/OpenAI siguen siendo BYOK puro).
 */
export function sharedKeyFor(provider: AiProviderId): string | null {
  if (provider === 'gemini' && SHARED_GEMINI_KEY !== '') return SHARED_GEMINI_KEY;
  return null;
}
