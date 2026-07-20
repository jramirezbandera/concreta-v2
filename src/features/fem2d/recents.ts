// FEM 2D — recientes (plantillas usadas recientemente).
//
// Paridad con el FEM 1D: la lista vive en la pantalla de plantillas y permite
// reabrir de un clic una plantilla que ya se ha usado en esta sesión/máquina.
// Como en 1D, una entrada guarda la PLANTILLA (no el modelo editado): reabrirla
// reconstruye la plantilla con sus defaults (buildTemplateWithDefaults). El eta
// registrado es solo el último veredicto conocido, informativo.
//
// Se registra al VOLVER al landing desde el editor (backToLanding): la
// estructura que dejas atrás pasa a "recientes". Dedup por templateId — reusar
// la misma plantilla solo refresca su marca de tiempo, no duplica filas.

import { FEM2D_TEMPLATES } from './templates';
import type { Fem2DTemplateId } from './types';

const RECENT_KEY = 'concreta-fem2d-recent';
const MAX_RECENT = 5;

export interface Fem2DRecentEntry {
  id: string;
  templateId: Fem2DTemplateId;
  ts: number;
  /** Último η máximo conocido (0–1). Informativo. */
  eta: number;
}

export function loadRecent(): Fem2DRecentEntry[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return [];
    // Descarta entradas de un esquema viejo o de plantillas ya inexistentes.
    return list.filter(
      (r): r is Fem2DRecentEntry =>
        !!r && typeof r === 'object'
        && typeof (r as Fem2DRecentEntry).templateId === 'string'
        && (r as Fem2DRecentEntry).templateId in FEM2D_TEMPLATES,
    );
  } catch {
    return [];
  }
}

export function pushRecent(templateId: Fem2DTemplateId, eta: number): void {
  try {
    const ts = Date.now();
    const next: Fem2DRecentEntry = { id: `${templateId}-${ts}`, templateId, ts, eta };
    const merged = [next, ...loadRecent().filter((r) => r.templateId !== templateId)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(merged));
  } catch {
    /* private mode / quota — ignore */
  }
}
