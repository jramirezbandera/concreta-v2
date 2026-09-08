import { useSyncExternalStore } from 'react';
import { instantaneaAnejo, suscribirAnejo, type AnejoFile } from './index';

const VACIO: AnejoFile = { v: 1, piezas: [] };
const enServidor = () => VACIO;

/**
 * El índice del anejo de la obra abierta. Se re-renderiza al guardar, quitar,
 * reordenar o incluir una pieza, desde esta pestaña o desde otra (`storage`).
 * La instantánea es estable mientras el índice no cambie, así que sirve como
 * dependencia de efectos.
 */
export function useAnejo(): AnejoFile {
  return useSyncExternalStore(suscribirAnejo, instantaneaAnejo, enServidor);
}
