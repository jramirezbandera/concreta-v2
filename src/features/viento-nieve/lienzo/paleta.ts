/**
 * Colores y escalas de los dibujos de Viento y nieve.
 *
 * Todo por `var(--color-*)`: los dibujos siguen al tema como el resto de la
 * app y no hay modo PDF que pida literales (el módulo exporta Word y Excel).
 * La presión (hacia dentro) va en naranja —token propio, `--color-chart-
 * presion`— y la succión (hacia fuera) en el acento, con la intensidad en la
 * transparencia. Los colores de estado quedan para el estado: nunca para el
 * mapa de presiones (DESIGN.md).
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
  fondo: 'var(--color-bg-canvas)',
  superficie: 'var(--color-bg-surface)',
} as const;

/** Un color a un tanto por ciento de opacidad sobre lo que haya debajo. */
export function mezcla(color: string, porcentaje: number): string {
  return `color-mix(in srgb, ${color} ${Math.round(porcentaje)}%, transparent)`;
}

const ALFA_MIN = 12;
const ALFA_MAX = 50;

/** Relleno de una zona en presión: más opaco cuanto más empuja, con `maximo` como tope de la escala. */
export function rellenoPresion(valor: number, maximo: number): string {
  const t = maximo > 0 ? Math.min(1, Math.abs(valor) / maximo) : 0;
  return mezcla(COLOR.presion, ALFA_MIN + (ALFA_MAX - ALFA_MIN) * t);
}

/** Relleno de una zona en succión: misma escala, en el acento. */
export function rellenoSuccion(valor: number, maximo: number): string {
  const t = maximo > 0 ? Math.min(1, Math.abs(valor) / maximo) : 0;
  return mezcla(COLOR.succion, ALFA_MIN + (ALFA_MAX - ALFA_MIN) * t);
}

/**
 * Relleno de una zona con sus dos posibilidades: manda el signo que domina en
 * valor absoluto (a 40º casi todo empuja; a 5º casi todo levanta).
 */
export function rellenoZona(succion: number | null, presion: number | null, maximo: number): string {
  const s = succion ?? 0;
  const p = presion ?? 0;
  return p >= Math.abs(s) ? rellenoPresion(p, maximo) : rellenoSuccion(s, maximo);
}

/** Fuente de los rótulos: la mono de la app, heredada por los `<text>` del dibujo. */
export const FUENTE_MONO = 'var(--font-mono)';
export const FUENTE_SANS = 'var(--font-sans)';

/** Número con coma decimal, como en toda la interfaz. */
export const dec = (v: number, n: number): string => v.toFixed(n).replace('.', ',');
