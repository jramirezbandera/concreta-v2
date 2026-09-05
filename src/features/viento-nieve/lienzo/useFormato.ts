/**
 * Números del dibujo en el sistema de unidades de la app (kN o kg, kN/m² o
 * kg/m²), con coma decimal como el resto de la interfaz.
 */

import { toDisplay } from '../../../lib/units/convert';
import { getPrecision, getUnitLabel } from '../../../lib/units/format';
import type { Quantity } from '../../../lib/units/types';
import { useUnitSystem } from '../../../lib/units/useUnitSystem';

export function useFormato() {
  const { system } = useUnitSystem();
  const con = (q: Quantity, decimales?: number) => (valor: number) =>
    toDisplay(valor, q, system)
      .toFixed(decimales ?? getPrecision(q, system))
      .replace('.', ',');
  return {
    /** Fuerza, kN → unidades de pantalla, un decimal. */
    fuerza: con('force', 1),
    presion: con('areaLoad'),
    lineal: con('linearLoad'),
    uF: getUnitLabel('force', system),
    uQ: getUnitLabel('areaLoad', system),
    uL: getUnitLabel('linearLoad', system),
  };
}
