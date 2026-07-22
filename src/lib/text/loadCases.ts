/**
 * Nombres de las hipótesis de carga (CTE DB-SE-AE) para la INTERFAZ.
 *
 * Fuente única de la copia de UI que hoy está repetida a mano en varios sitios
 * del FEM 2D: el `<option>` del desplegable de hipótesis y el texto de ayuda de
 * su fila (Fem2DInspector, ToolPalette2D).
 *
 * NO va en `labels.ts`: aquel catálogo tipa magnitudes físicas
 * (`{sym, descLong, descShort, unit, quantity, ref}`); una hipótesis de carga no
 * tiene unidad ni símbolo distinto de su código de una letra, así que meterla ahí
 * deformaría el catálogo.
 *
 * NO es la fuente de los `description` de los esquemas de IA
 * (`lib/ai/modules/femAnalysis.ts`, `lib/ai/modules/fem2d.ts`): esos son texto de
 * *prompt*, no copia de interfaz. Se versionan con el prompt, no con la UI —
 * derivarlos de aquí acoplaría la ingeniería de prompt a un retoque de UI en dos
 * adaptadores ya calibrados en vivo. Repetición de texto no es repetición de
 * concepto: se dejan escritos a mano a propósito (eng-review D2/2B).
 */

import type { LoadCase } from '../frame-core/types';

/**
 * Nombre completo de cada hipótesis, para el `<option>` del desplegable.
 * `Record<LoadCase, …>` garantiza en compilación que ninguna hipótesis se queda
 * sin nombre: añadir una `LoadCase` nueva sin entrada aquí es un error de tipos.
 */
export const LC_LABELS: Record<LoadCase, string> = {
  G: 'Cargas permanentes',
  Q: 'Sobrecarga de uso',
  W: 'Viento',
  S: 'Nieve',
  E: 'Sismo',
};

/**
 * Etiqueta del `<option>`: `"Q · Sobrecarga de uso"`. El código de una letra sale
 * de la propia `LoadCase` (es también el badge de la lista y la clave de color del
 * lienzo), así que no se duplica en `LC_LABELS`. El separador vive aquí, en un solo
 * sitio, para que los dos desplegables de hipótesis no lo escriban cada uno.
 */
export function lcOptionLabel(lc: LoadCase): string {
  return `${lc} · ${LC_LABELS[lc]}`;
}

/**
 * Texto de ayuda de la fila «Hipótesis». Enumera los códigos y recuerda el punto
 * normativo que un ingeniero necesita ver: los valores se introducen sin mayorar y
 * es el programa quien aplica γ y ψ. Cadena única: hoy está repetida verbatim en el
 * `help=` del Inspector y el `title=` de la paleta.
 */
export const LC_HELP =
  'G permanente · Q sobrecarga de uso · W viento · S nieve · E sismo. ' +
  'Valores característicos sin mayorar (el programa aplica γ y ψ).';
