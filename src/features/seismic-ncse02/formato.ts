// Convención decimal del módulo de sismo. UNA, y en un solo sitio.
//
// ─────────────────────────────────────────────────────────────────────────────
// POR QUÉ ESTABA MEZCLADO Y POR QUÉ IMPORTA
// ─────────────────────────────────────────────────────────────────────────────
// El panel de resultados usaba `toLocaleString('es-ES')` para los kN y los
// porcentajes —coma decimal— y `toFixed()` para ab, C, S y los períodos —punto—.
// El resultado eran dos convenciones a dos centímetros: «α = 2,5» junto a
// «T_A 0.13 s», y un «0.23 g» debajo de un «2277 kN». En un documento que se
// adjunta a una memoria en español eso no es un detalle de estilo: quien copia
// un número a mano tiene que pararse a decidir si el punto era decimal o de
// millar, y en español es de millar.
//
// Aquí se resuelve una vez y lo usan pantalla, dibujos y PDF.

/** Decimal con coma y punto de millar, con `dec` decimales fijos. */
export function dec(v: number, n = 0): string {
  return Number.isFinite(v)
    ? v.toLocaleString('es-ES', { minimumFractionDigits: n, maximumFractionDigits: n })
    : '—';
}

/**
 * Decimal con los decimales que hagan falta para que lo mostrado SEA el valor.
 *
 * Se empieza por `n` y sólo se añaden si redondear ahí pierde información. Los
 * valores tabulados —que traen dos decimales— salen exactamente igual que con
 * `dec`; los que el usuario introduce a mano o salen de una media ponderada, no.
 */
export function decFiel(v: number, n: number, max = 6): string {
  if (!Number.isFinite(v)) return '—';
  for (let d = n; d < max; d++) {
    if (Math.abs(Number(v.toFixed(d)) - v) <= 1e-9) return dec(v, d);
  }
  return dec(v, max);
}

/** Porcentaje a partir de una fracción: `0,917` → «91,7 %». */
export function pct(v: number, n = 1): string {
  return `${dec(v * 100, n)} %`;
}

/**
 * Texto canónico de un campo EDITABLE: coma decimal y SIN punto de millar.
 *
 * La agrupación tiene que ir apagada. Un «1.234» en una caja de texto no se
 * puede volver a leer —el punto es de millar para quien lo escribió y decimal
 * para el parser— y el campo acabaría guardando 1,234 donde había 1234.
 */
export function textoEditable(v: number): string {
  return Number.isFinite(v)
    ? v.toLocaleString('es-ES', { maximumFractionDigits: 20, useGrouping: false })
    : '';
}
