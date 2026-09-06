/**
 * Nombre del fichero descargado, común a todos los formatos de exportación.
 *
 * Vivía dentro de `src/lib/pdf/utils.ts` cuando el PDF era la única salida de la
 * app. El capítulo Memorias entrega además Word —y más adelante Excel y DXF del
 * cuadro de plano—, así que la función se muda aquí, a `src/lib/export/`, que es
 * el sitio neutro donde puede vivir sin arrastrar jsPDF. `src/lib/pdf/utils.ts`
 * la re-exporta para que los 71 puntos de llamada existentes no se toquen.
 */

/**
 * Slugify a user-entered element title into a filesystem-safe, lowercase,
 * hyphenated string. NFD-normalizes and strips combining diacritics (so accents
 * survive as their base letter), maps any run of non-alphanumeric characters to
 * a single hyphen, and trims edge hyphens. Returns `''` when the title has no
 * usable alphanumeric content (e.g. only symbols) — callers fall back to a
 * default filename via `titledFilename`.
 *
 *   "Dintel de ventana"   → "dintel-de-ventana"
 *   "Viga N.º 1 (P-baja)" → "viga-n-1-p-baja"
 *   "Ñoño & Cía"          → "nono-cia"
 *   "/// ??? ///"         → ""
 */
export function slugTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '') // strip combining diacritics (Mark, nonspacing)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')     // any non-alphanumeric run → single hyphen
    .replace(/^-+|-+$/g, '');        // trim leading/trailing hyphens
}

/**
 * Build the download filename from a user title. A non-empty slug yields
 * `<slug>.<extension>`; otherwise `fallback` (each module's dated default, e.g.
 * `concreta-viga-2026-07-08.pdf`). This is the SINGLE source of truth for the
 * download name — the export functions AND the TitlePromptModal preview both
 * call it, so the preview can never disagree with the actual file.
 *
 * `extension` va sin punto y por defecto es `'pdf'`: los 21 módulos que llaman
 * con dos argumentos siguen produciendo exactamente el mismo nombre que antes.
 */
export function titledFilename(title: string, fallback: string, extension = 'pdf'): string {
  const slug = slugTitle(title);
  return slug ? `${slug}.${extension}` : fallback;
}

/**
 * Nombres por defecto del cuadro de materiales cuando el usuario no teclea
 * título. Viven aquí, y no junto a cada exportador, porque los necesita el
 * `TitlePromptModal` para pintar la línea de previsualización: importarlos de
 * `lib/docx/materiales` metería la librería entera en el chunk del módulo y
 * mataría la carga perezosa.
 *
 * Uno por formato, porque cada vista tiene el suyo: la de memoria sale a Word y
 * la de plano a Excel (para capturar) y a DXF (para el CAD).
 */
export const MATERIALES_FALLBACK_DOCX = 'cuadro-de-materiales.docx';
export const MATERIALES_FALLBACK_XLSX = 'cuadro-de-materiales.xlsx';
export const MATERIALES_FALLBACK_DXF = 'cuadro-de-materiales.dxf';
export const MATERIALES_FALLBACK_PDF = 'cuadro-de-materiales.pdf';

/** Los de «Viento y nieve», con el mismo reparto: memoria a Word, plano a Excel. */
export const VIENTO_NIEVE_FALLBACK_DOCX = 'viento-y-nieve.docx';
export const VIENTO_NIEVE_FALLBACK_XLSX = 'viento-y-nieve.xlsx';

/**
 * Los de «Cargas por planta», con las cuatro salidas del cuadro de materiales:
 * la memoria a Word y a PDF, y el cuadro del plano a Excel y a DXF.
 */
export const CARGAS_PLANTA_FALLBACK_DOCX = 'cargas-por-planta.docx';
export const CARGAS_PLANTA_FALLBACK_XLSX = 'cargas-por-planta.xlsx';
export const CARGAS_PLANTA_FALLBACK_PDF = 'cargas-por-planta.pdf';
export const CARGAS_PLANTA_FALLBACK_DXF = 'cargas-por-planta.dxf';
