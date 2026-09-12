import { useSyncExternalStore } from 'react';
import { instantaneaObra, suscribirObra, type Obra } from './index';

const enServidor = () => null;

/**
 * La obra abierta. Se re-renderiza al cambiarla desde esta pestaña (el diálogo
 * de obra, el menú) o desde otra (`storage`). La instantánea es estable
 * mientras la obra guardada no cambie, así que sirve como dependencia de
 * efectos.
 */
export function useObra(): Obra | null {
  return useSyncExternalStore(suscribirObra, instantaneaObra, enServidor);
}
