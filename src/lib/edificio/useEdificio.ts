import { useSyncExternalStore } from 'react';
import { instantaneaEdificio, suscribirEdificio, type Edificio } from './index';

const enServidor = () => null;

/**
 * El edificio de la obra. Se re-renderiza al escribirlo desde esta pestaña
 * (Cargas por planta) o desde otra (`storage`). La instantánea es estable
 * mientras lo guardado no cambie, así que sirve como dependencia de efectos.
 * `null` = nadie lo ha escrito todavía: quien lo lea decide si enseña el de
 * arranque (`edificioInicial()`) o remite a Cargas por planta.
 */
export function useEdificio(): Edificio | null {
  return useSyncExternalStore(suscribirEdificio, instantaneaEdificio, enServidor);
}
