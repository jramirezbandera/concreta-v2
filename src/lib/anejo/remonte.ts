/**
 * Volver a montar el módulo que hay en pantalla.
 *
 * Hace falta porque los módulos leen el almacén UNA vez, en el inicializador de
 * `useState`: escribirles las claves con el módulo montado no cambia nada de lo
 * que se ve. Al abrir una pieza desde el anejo eso no importa —se navega, y
 * navegar monta de cero—, pero saltar de la V-3 a la V-4 desde el desplegable
 * del propio módulo no cambia de ruta, y ahí no hay montaje.
 *
 * Es un contador, y el `<Outlet />` de `AppShell` lo lleva como `key`: subirlo
 * tira la ruta activa y la vuelve a montar.
 *
 * Por qué un acto explícito y no el propio vínculo: el vínculo también se fija
 * al GUARDAR, y remontar ahí se llevaría por delante el modal de
 * previsualización desde el que se acaba de guardar. Remontar se pide cuando se
 * quiere, no se deduce del estado.
 *
 * No se persiste: tras una recarga el módulo monta de cero de todos modos.
 */

import { useSyncExternalStore } from 'react';

let generacion = 0;
const oyentes = new Set<() => void>();

/** Tira el módulo en pantalla y lo vuelve a montar, con lo que haya en el almacén. */
export function pedirRemonte(): void {
  generacion += 1;
  for (const fn of oyentes) fn();
}

export function suscribirRemonte(fn: () => void): () => void {
  oyentes.add(fn);
  return () => {
    oyentes.delete(fn);
  };
}

export function instantaneaRemonte(): number {
  return generacion;
}

const enServidor = () => 0;

export function useRemonte(): number {
  return useSyncExternalStore(suscribirRemonte, instantaneaRemonte, enServidor);
}

/** Sólo para tests: deja el contador como estaba al arrancar. */
export function _reiniciarRemonteParaTests(): void {
  generacion = 0;
  oyentes.clear();
}
