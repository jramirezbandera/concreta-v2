// FEM 1D — filas de comprobación de una barra para el panel de resultados.
//
// NO se usa `BarResult.checks`: ese resumen aplana el valor a string y pierde
// la unidad y el tipo (`String(c.value)` en solveDesignModel), así que una fila
// sacada de ahí se pintaría como un número desnudo y sin convertir al sistema
// de unidades activo. Las filas BUENAS son las del motor, que ya se conservan
// enteras en `rcResult`/`steelResult` para el embed — las mismas que ve el
// usuario al abrir la ficha, de modo que fila y ficha no pueden discrepar.
//
// Fichero aparte del panel por la regla de react-refresh (un módulo de
// componentes solo exporta componentes) y para que el PDF o el asistente
// puedan reutilizarlo sin arrastrar React.

import type { RCBeamResult } from '../../lib/calculations/rcBeams';
import type { SteelBeamResult } from '../../lib/calculations/steelBeams';
import type { CheckRow, CheckStatus } from '../../lib/calculations/types';
import type { BarResult, DesignBar, SolveResult } from './types';

/** Estado de barra o de modelo → estado de comprobación compartido.
 *  «Pendiente» y «sin motor» son ausencia de veredicto, no un veredicto
 *  neutro distinto: el badge y el ambiente los pintan igual. */
export const barStatusToCheck = (s: BarResult['status'] | SolveResult['status']): CheckStatus =>
  s === 'pending' || s === 'none' ? 'neutral' : s;

/** Prefija ids y descripciones cuando una barra de HA trae las dos regiones:
 *  vano y apoyo comparten los ids del motor y en una lista plana chocarían
 *  (misma key de React) y no se distinguirían. */
const region = (rows: CheckRow[], label: string, prefix: boolean): CheckRow[] =>
  rows.map((c) => ({
    ...c,
    id: `${label}:${c.id}`,
    description: prefix ? `${label} · ${c.description}` : c.description,
  }));

export function barCheckRows(bar: DesignBar, barResult: BarResult | undefined): CheckRow[] {
  if (!barResult) return [];

  if (bar.material === 'rc') {
    const res = barResult.rcResult as RCBeamResult | undefined;
    if (!res) return [];
    const vano = res.vano?.checks ?? [];
    const apoyo = res.apoyo?.checks ?? [];
    const both = vano.length > 0 && apoyo.length > 0;
    return [...region(vano, 'Vano', both), ...region(apoyo, 'Apoyo', both)];
  }

  const res = barResult.steelResult as SteelBeamResult | undefined;
  return res?.valid ? (res.checks ?? []) : [];
}
