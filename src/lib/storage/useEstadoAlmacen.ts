import { useSyncExternalStore } from 'react';
import { estadoAlmacen, suscribirAlmacen, type EstadoAlmacen } from './seguro';

/** Estado del almacén (`lib/storage/seguro`) como fuente externa: se re-renderiza al fallar o al recuperarse. */
export function useEstadoAlmacen(): EstadoAlmacen {
  return useSyncExternalStore(suscribirAlmacen, estadoAlmacen, estadoAlmacen);
}
