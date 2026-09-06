/**
 * Colores y helpers de los lienzos SVG de la app.
 *
 * Todo por `var(--color-*)`: los dibujos siguen al tema como el resto de la
 * interfaz. Aquí vive lo que sirve a cualquier módulo; lo propio de un mapa de
 * presiones, de un diagrama de esfuerzos o de una sección de carga se queda en
 * su módulo (ver `features/viento-nieve/lienzo/paleta.ts`).
 *
 * Los colores de estado (ok, warn, fail) son para el ESTADO: nunca para
 * codificar magnitudes en el dibujo (DESIGN.md).
 */

export const COLOR = {
  presion: 'var(--color-chart-presion)',
  succion: 'var(--color-accent)',
  accent: 'var(--color-accent)',
  seccion: 'var(--color-chart-section)',
  cota: 'var(--color-chart-dim)',
  cotaTexto: 'var(--color-chart-dim-text)',
  rotulo: 'var(--color-chart-label)',
  secundario: 'var(--color-text-secondary)',
  atenuado: 'var(--color-text-disabled)',
  borde: 'var(--color-border-main)',
  fallo: 'var(--color-state-fail)',
  aviso: 'var(--color-state-warn)',
  fondo: 'var(--color-bg-canvas)',
  superficie: 'var(--color-bg-surface)',
  elevado: 'var(--color-bg-elevated)',
} as const;

/** Un color a un tanto por ciento de opacidad sobre lo que haya debajo. */
export function mezcla(color: string, porcentaje: number): string {
  return `color-mix(in srgb, ${color} ${Math.round(porcentaje)}%, transparent)`;
}

/** Fuente de los rótulos: las de la app, heredadas por los `<text>` del dibujo. */
export const FUENTE_MONO = 'var(--font-mono)';
export const FUENTE_SANS = 'var(--font-sans)';

/** Número con coma decimal, como en toda la interfaz. */
export const dec = (v: number, n: number): string => v.toFixed(n).replace('.', ',');
