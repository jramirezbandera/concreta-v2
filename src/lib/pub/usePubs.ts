import { useSyncExternalStore } from 'react';
import { suscribirPubs, versionDePubs } from './index';

const enServidor = () => 0;

/**
 * Una marca que cambia cuando cambia cualquier publicación. No devuelve los
 * sobres: cada consumidor lee los suyos con `leerPublicacion`, que ya sabe qué
 * versiones quiere. Lo que esto da es el aviso de que hay que volver a leer.
 */
export function useVersionDePubs(): number {
  return useSyncExternalStore(suscribirPubs, versionDePubs, enServidor);
}
