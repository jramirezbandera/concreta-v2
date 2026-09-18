import { useSyncExternalStore } from 'react';
import { instantaneaAnejo, suscribirAnejo, type AnejoFile } from './index';
import { instantaneaVinculo, suscribirVinculo } from './vinculo';

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

const sinVinculo = () => null;

/**
 * Qué pieza tiene abierta el módulo, en crudo. Se re-renderiza al guardarla,
 * al abrir otra y al soltarla, desde esta pestaña o desde otra.
 *
 * El valor no se suele usar —quien lo necesita llama a `piezaAbierta`, que
 * además comprueba que la pieza siga en el índice—: lo que hace falta es que
 * el componente se entere de que ha cambiado, y eso es un almacén distinto del
 * índice del anejo.
 */
export function useVinculo(): string | null {
  return useSyncExternalStore(suscribirVinculo, instantaneaVinculo, sinVinculo);
}
