/** Clases compartidas por los campos de la ficha: las mismas cajas que Cargas por planta y Viento y nieve. */

export const INPUT =
  'w-full min-w-0 rounded border border-border-main bg-bg-primary px-2 py-1 text-[12px] text-text-primary focus:border-accent focus:outline-none';

/** Una caja suelta, con su ancho decidido por quien la usa. */
export const INPUT_SUELTO =
  'rounded border border-border-main bg-bg-primary px-2 py-1 text-[12px] text-text-primary focus:border-accent focus:outline-none';

/** Un área de texto: la descripción del sistema estructural, los estratos del terreno. */
export const AREA = INPUT + ' min-h-[64px] resize-y leading-snug';

export const BOTON_MENOR = 'rounded border border-border-main bg-bg-elevated px-2.5 py-1 text-[11.5px] text-text-secondary hover:text-text-primary';

export const BOTON_ACENTO = 'rounded border border-accent/40 bg-accent/15 px-2.5 py-1 text-[11.5px] text-accent hover:bg-accent/25';

/** El botón «Confirmar» de un dato heredado: pequeño, ámbar, al lado de la etiqueta. */
export const BOTON_CONFIRMAR =
  'rounded border border-state-warn/50 bg-transparent px-1.5 py-0 text-[10.5px] leading-[18px] text-state-warn hover:bg-state-warn/10';

/** La rejilla de campos de una sección: dos columnas en ancho, una en estrecho. */
export const REJILLA = 'grid grid-cols-1 gap-x-4 gap-y-2.5 md:grid-cols-2';

/** Un campo que ocupa las dos columnas (las descripciones largas). */
export const ANCHO = 'md:col-span-2';
