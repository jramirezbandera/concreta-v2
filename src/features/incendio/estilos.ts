/** Clases compartidas por los tableros del módulo. */

export const INPUT =
  'w-full min-w-0 rounded border border-border-main bg-bg-primary px-2 py-1 text-[12px] text-text-primary focus:border-accent focus:outline-none';

export const TH = 'px-2 pb-1 text-left text-[10px] font-semibold uppercase text-text-disabled';

/**
 * Los mismos, con el aire lateral recortado, para la tabla de plantas.
 *
 * La columna de datos mide 348 px y la tabla del edificio tiene seis columnas:
 * con 8 px a cada lado de cada celda se van 96 px sólo en aire y la casilla de
 * la altura se queda sin sitio —«3,45» se leía «3,4», recortado por el borde
 * del campo, que es peor que un número que falta porque parece un número—.
 *
 * Se construyen a partir de los de arriba y no se escriben enteros para que no
 * haya dos definiciones que mantener; el `px-1.5` aparece literal aquí, que es
 * lo que Tailwind necesita para generarlo.
 */
export const INPUT_ESTRECHO = INPUT.replace('px-2', 'px-1.5');
export const TH_ESTRECHO = TH.replace('px-2', 'px-1.5');

export const ROTULO = 'pb-1.5 text-[11px] text-text-secondary';

export const AYUDA = 'text-[11px] leading-snug text-text-disabled';

/** El fondo de una fila a medio rellenar. */
export const FONDO_HUECO = {
  background: 'color-mix(in srgb, var(--color-state-fail) 8%, transparent)',
} as const;

/** Lo derivado se enseña en el color del acento, para distinguirlo de lo tecleado. */
export const DERIVADO = 'font-mono text-[12px] text-accent';
