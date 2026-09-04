/**
 * Interpolación lineal sobre tablas de la norma.
 *
 * Decisión D-VN2 (2026-09-04): entre dos casillas se interpola linealmente,
 * tanto en la esbeltez de la tabla 3.5 como en la altitud de la E.2. Es lo que
 * hace la macro `interpo` de la hoja vientoCTE del estudio y lo que autoriza el
 * Anejo D.3-2 («en todas las tablas puede interpolarse linealmente»).
 *
 * Fuera del rango tabulado se devuelve el extremo: la 3.5 rotula sus columnas
 * de borde «< 0,25» y «≥ 5,00», así que acotar ES la regla de la tabla, no un
 * apaño.
 */
export function interpolar(x: number, xs: readonly number[], ys: readonly number[]): number {
  if (xs.length === 0 || xs.length !== ys.length) {
    throw new Error('interpolar: las abscisas y las ordenadas no casan');
  }
  if (x <= xs[0]) return ys[0];
  const n = xs.length;
  if (x >= xs[n - 1]) return ys[n - 1];
  let i = 1;
  while (xs[i] < x) i++;
  const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
  return ys[i - 1] + t * (ys[i] - ys[i - 1]);
}
