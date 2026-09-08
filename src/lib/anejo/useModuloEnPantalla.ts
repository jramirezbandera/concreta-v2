/**
 * Qué módulo está en pantalla, dicho por la ruta, y su adaptador del anejo.
 *
 * El modal de previsualización del PDF es UN componente compartido por veinte
 * módulos, y ninguno le dice quién es: con esto no hace falta tocar veinte
 * `index.tsx` para que «Guardar en el anejo» sepa qué pieza está guardando. La
 * ruta es unívoca por módulo (`moduleRegistry.route`) y el test
 * `src/test/anejo/useModuloEnPantalla.test.tsx` comprueba que cada ruta del
 * registro resuelve a su adaptador.
 *
 * Fuera de un router (tests que montan el modal suelto) devuelve `null`, y el
 * botón no aparece. Se lee el contexto de react-router directamente en vez de
 * llamar a `useLocation`, que lanza sin router: así no hay hook condicional.
 */

import { useContext } from 'react';
import { UNSAFE_LocationContext } from 'react-router';
import { moduleRegistry } from '../../data/moduleRegistry';
import { buscarAdaptador } from './modules';
import type { AdaptadorAnejo } from './types';

/** El adaptador del módulo cuya ruta es `pathname`, o `null` si la ruta no es de un módulo. */
export function adaptadorDeRuta(pathname: string): AdaptadorAnejo | null {
  const limpia = pathname.replace(/\/+$/, '') || '/';
  const entrada = moduleRegistry.find((m) => m.route === limpia);
  return entrada ? (buscarAdaptador(entrada.key) ?? null) : null;
}

export function useModuloEnPantalla(): AdaptadorAnejo | null {
  const contexto = useContext(UNSAFE_LocationContext);
  const ruta = contexto?.location.pathname ?? null;
  return ruta === null ? null : adaptadorDeRuta(ruta);
}
