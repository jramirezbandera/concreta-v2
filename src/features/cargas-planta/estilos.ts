/** Clases compartidas por la tabla y la ficha: un solo sitio para que las celdas sean iguales en todas partes. */

/** Caja de texto o desplegable dentro de una celda. */
export const INPUT =
  'w-full min-w-0 rounded border border-border-main bg-bg-primary px-1.5 py-0.5 text-[12px] text-text-primary focus:border-accent focus:outline-none';

/** El mismo, con aire, para la ficha (donde el campo ocupa toda la columna). */
export const INPUT_ANCHO =
  'w-full min-w-0 rounded border border-border-main bg-bg-primary px-2 py-1 text-[12px] text-text-primary focus:border-accent focus:outline-none';

/** El mismo sin ancho: lo pone quien lo usa (la barra de la obra, en una fila). */
export const INPUT_SUELTO =
  'min-w-0 rounded border border-border-main bg-bg-primary px-2 py-1 text-[12px] text-text-primary focus:border-accent focus:outline-none';

export const BOTON_MENOR =
  'inline-flex items-center gap-1 rounded border border-border-main bg-bg-elevated px-2 py-0.5 text-[11.5px] text-text-secondary hover:text-text-primary';

/** Cabecera de columna. Las derivadas van en acento: es el código de color del módulo. */
export const TH = 'border-b border-border-main px-1.5 pb-1 align-bottom text-left text-[9.5px] font-semibold uppercase text-text-disabled';
export const TH_NUM = `${TH} text-right`;
export const TH_DER = `${TH} text-right text-accent`;

/** Cabecera de grupo: la pregunta en lenguaje de obra que manda sobre varias columnas. */
export const TH_GRUPO =
  'px-1.5 pb-0.5 pt-1 text-left align-bottom font-mono text-[9.5px] uppercase text-text-disabled border-l border-border-sub';

export const TD = 'border-b border-border-sub px-1.5 py-1 align-middle';
export const TD_NUM = `${TD} text-right`;

/** Tinte de la fila abierta, la que está resaltada en la sección. */
export const SELECCION = { background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)' } as const;

/**
 * La columna qd es lo que se lleva al programa de cálculo, así que se queda
 * pegada al borde derecho: con muchas cargas encima la tabla scrollea, y esa
 * es justo la columna que no puede irse de la vista. Fondo opaco (el tinte va
 * encima) para que las celdas que pasan por debajo no se transparenten.
 */
export const COLUMNA_QD = {
  position: 'sticky' as const,
  right: 0,
  background: 'linear-gradient(color-mix(in srgb, var(--color-accent) 5%, transparent), color-mix(in srgb, var(--color-accent) 5%, transparent)), var(--color-bg-primary)',
  boxShadow: 'inset 1px 0 0 var(--color-border-sub)',
};
export const COLUMNA_QD_SEL = {
  ...COLUMNA_QD,
  background: 'linear-gradient(color-mix(in srgb, var(--color-accent) 14%, transparent), color-mix(in srgb, var(--color-accent) 14%, transparent)), var(--color-bg-primary)',
};
/** La cabecera de qd, pegada igual. */
export const TH_QD_STICKY = {
  position: 'sticky' as const,
  right: 0,
  background: 'var(--color-bg-primary)',
  boxShadow: 'inset 1px 0 0 var(--color-border-sub)',
};
