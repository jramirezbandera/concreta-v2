/** Clases compartidas por los campos de la columna de datos: un solo sitio para que las cajas sean iguales en las cinco secciones. */

export const INPUT =
  'w-full min-w-0 rounded border border-border-main bg-bg-primary px-2 py-1 text-[12px] text-text-primary focus:border-accent focus:outline-none';

export const BOTON_MENOR = 'rounded border border-border-main bg-bg-elevated px-2.5 py-1 text-[11.5px] text-text-secondary hover:text-text-primary';

/** Tinte de un hueco sin resolver: bloquea publicar y exportar. */
export const HUECO = { background: 'color-mix(in srgb, var(--color-state-fail) 8%, transparent)' } as const;

/** Tinte de la fila seleccionada (la que está resaltada en el dibujo). */
export const SELECCION = {
  background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)',
  outline: '1px solid color-mix(in srgb, var(--color-accent) 35%, transparent)',
} as const;
