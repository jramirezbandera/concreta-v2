/**
 * El vocabulario de los cinco estados del esquema de la obra: su palabra, su
 * marca, su color y su tinte, en UN solo sitio.
 *
 * Vive fuera de `FilaEstado.tsx` porque no todo el que necesita la palabra
 * pinta una fila: el raíl de lo que se entrega compone su propio rótulo
 * accesible y tiene que decir las MISMAS palabras. Y un fichero de componentes
 * no puede exportar funciones sin romper el refresco en caliente
 * (`react-refresh/only-export-components`).
 *
 * Nunca color solo: la marca va SIEMPRE con su palabra al lado, porque el
 * color no lo ve todo el mundo y un icono sin texto hay que aprendérselo.
 */

import { AlertTriangle, Check, Circle, X } from 'lucide-react';

export type EstadoFila = 'hecho' | 'falta' | 'revisar' | 'noProcede' | 'sinEmpezar';

/**
 * El tinte va con la opacidad `/10` sobre el color de estado, que es la receta
 * de insignia de la casa (`components/checks/index.tsx` y nueve sitios más).
 * `bg-tint-fail` NO vale: los `--color-tint-*` están declarados en `:root` y no
 * dentro de `@theme`, así que Tailwind v4 no fabrica esa utilidad y la clase no
 * pinta nada.
 */
export const ESTADOS = {
  hecho: { icono: Check, palabra: 'hecho', clase: 'text-state-ok', tinte: '' },
  falta: { icono: X, palabra: 'falta', clase: 'text-state-fail', tinte: 'bg-state-fail/10' },
  revisar: { icono: AlertTriangle, palabra: 'revíselo', clase: 'text-state-warn', tinte: 'bg-state-warn/10' },
  noProcede: { icono: Circle, palabra: 'no procede', clase: 'text-text-disabled', tinte: '' },
  sinEmpezar: { icono: Circle, palabra: 'sin empezar', clase: 'text-text-disabled', tinte: '' },
} as const;

/** La palabra de un estado, para quien componga su propio rótulo accesible. */
export function palabraDe(estado: EstadoFila): string {
  return ESTADOS[estado].palabra;
}

/**
 * Adónde lleva, dicho por lo que hay que HACER allí: quien oye «hecho, ir a
 * resolverlo» deja de fiarse de las dos mitades de la frase.
 */
export function destinoDe(estado: EstadoFila): string {
  return estado === 'falta' || estado === 'revisar' ? 'Ir a resolverlo' : 'Ir a verlo';
}
