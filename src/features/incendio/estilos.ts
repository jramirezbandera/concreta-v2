/** Clases compartidas por los tableros del módulo. */

export const INPUT =
  'w-full min-w-0 rounded border border-border-main bg-bg-primary px-2 py-1 text-[12px] text-text-primary focus:border-accent focus:outline-none';

export const TH = 'px-2 pb-1 text-left text-[10px] font-semibold uppercase text-text-disabled';

export const ROTULO = 'pb-1.5 text-[11px] text-text-secondary';

export const AYUDA = 'text-[11px] leading-snug text-text-disabled';

/** El fondo de una fila a medio rellenar. */
export const FONDO_HUECO = {
  background: 'color-mix(in srgb, var(--color-state-fail) 8%, transparent)',
} as const;

/** Lo derivado se enseña en el color del acento, para distinguirlo de lo tecleado. */
export const DERIVADO = 'font-mono text-[12px] text-accent';
