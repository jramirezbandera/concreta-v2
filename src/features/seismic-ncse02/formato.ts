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

import { toDisplay } from '../../lib/units/convert';
import { getUnitLabel } from '../../lib/units/format';
import type { UnitSystem } from '../../lib/units/types';

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

// ── Sistema de unidades ──────────────────────────────────────────────────────
//
// El estado, el motor, el enlace compartido y el asistente viven SIEMPRE en kN
// y kN/m²: sólo la vista convierte. Estas cuatro funciones son la única puerta
// por la que el sistema técnico entra al módulo — pantalla, dibujos y PDF pasan
// por aquí, de modo que el papel enseña exactamente los números que el usuario
// vio.
//
// Los decimales cambian con el sistema a propósito: un cortante de 2277 kN se
// lee entero, pero sus 232,2 Tn perderían el primer decimal —que en toneladas
// ya es una cifra que se comprueba— si se redondeara igual.

/** Fuerza en kN → número en el sistema activo. 0 decimales en kN, 1 en Tn. */
export function fuerza(vKN: number, system: UnitSystem, nSi = 0, nTec = 1): string {
  return dec(toDisplay(vKN, 'force', system), system === 'si' ? nSi : nTec);
}

/** «kN» o «Tn», según el sistema activo. */
export function unidadFuerza(system: UnitSystem): string {
  return getUnitLabel('force', system);
}

/** Carga superficial en kN/m² → número en el sistema activo (kg/m² en técnico). */
export function cargaSup(vKNm2: number, system: UnitSystem, nSi = 2, nTec = 0): string {
  return dec(toDisplay(vKNm2, 'areaLoad', system), system === 'si' ? nSi : nTec);
}

/** «kN/m²» o «kg/m²», según el sistema activo. */
export function unidadCargaSup(system: UnitSystem): string {
  return getUnitLabel('areaLoad', system);
}
