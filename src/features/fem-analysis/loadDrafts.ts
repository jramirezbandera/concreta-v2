// FEM 1D — la carga ARMADA en la paleta: qué colocará el próximo clic.
//
// Fichero aparte de la paleta (y no dentro de ella) porque lo consumen tres
// sitios: la paleta que lo edita, el shell que lo guarda y el lienzo que crea
// la carga con esos valores. Espejo de lo que el FEM 2D tiene en modelOps.ts.

import type { LoadDraft } from '../../components/ui/ToolPalette';
import type { ToolId } from './types';

/** Herramientas de la familia «Cargas». Sin horizontales: la tira es vertical. */
export type LoadToolId = Extract<ToolId, 'load-dist' | 'load-point'>;

export type LoadDrafts = Record<LoadToolId, LoadDraft>;

export const isLoadTool = (t: ToolId): t is LoadToolId =>
  t === 'load-dist' || t === 'load-point';

/**
 * Valores de arranque. Son los que el editor colocaba antes a fuego (15 kN/m
 * la distribuida, 10 kN la puntual); la diferencia es que ahora se ven y se
 * pueden cambiar ANTES de soltarlas, en vez de corregirlas después en el
 * panel.
 */
export const DEFAULT_LOAD_DRAFTS: LoadDrafts = {
  'load-dist': { magnitude: 15, lc: 'G' },
  'load-point': { magnitude: 10, lc: 'G' },
};
