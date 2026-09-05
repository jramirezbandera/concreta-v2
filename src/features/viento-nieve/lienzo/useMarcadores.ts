/**
 * Ids de los marcadores y patrones de un lienzo (`<Marcadores id={id} />`
 * los declara). Un `useId` por lienzo, sin los dos puntos que React mete en
 * el id y que un `url(#…)` no admite.
 */

import { useId } from 'react';
import type { Punta } from './Marcadores';

export function useMarcadores() {
  const id = useId().replace(/:/g, '');
  return {
    id,
    punta: (p: Punta) => `url(#${id}-${p})`,
    suelo: `url(#${id}-suelo)`,
    nieve: `url(#${id}-nieve)`,
  };
}
