/**
 * Catálogos de pantalla del módulo de incendio.
 */

/**
 * Las clases normalizadas de resistencia al fuego, que son las que se piden en
 * obra y las que tabulan los anejos C a F del DB SI.
 *
 * OJO: son las opciones del desplegable, NO el dominio del dato. Desde que el
 * módulo calcula el tiempo equivalente del Anejo B, la R exigida puede ser
 * cualquier número entero de minutos —el DB SI 6 §3.1.b dice «soporta dicha
 * acción durante el tiempo equivalente», y ése sale en 97 minutos, no en 120—.
 * Por eso `normalizarExigencias` acepta cualquier entero positivo y la tabla
 * enseña el valor que haya aunque no esté en esta lista.
 */
export const RESISTENCIA_FUEGO_OPCIONES = [30, 60, 90, 120, 180, 240] as const;
