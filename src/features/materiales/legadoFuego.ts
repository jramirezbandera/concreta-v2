/**
 * El legado de fuego del cuadro de materiales, para que el módulo de incendio
 * lo adopte.
 *
 * Hasta el 2026-09-13 las exigencias de resistencia al fuego se tecleaban en el
 * cuadro de materiales y vivían en su `concreta-materiales-model`. Al mudarse a
 * `/acciones/incendio` había que traerlas: nadie debe perder la R que escribió
 * la semana pasada.
 *
 * Esto es UNA HOJA APARTE y no una función de `state.ts` a propósito: si
 * `features/incendio/state.ts` importara `features/materiales/state.ts`, se
 * llevaría por delante todo el motor de `lib/materiales` —derive, tablasCE,
 * tablasMadera, anclajes— al chunk de incendio. Es la misma doctrina que
 * `features/memoria-dbse/sobres.ts`, que escribe a mano las claves de los
 * sobres para no arrastrar los 116 KB de peligrosidad sísmica.
 *
 * Y es la excepción autorizada a la regla de `lib/pub` («un módulo NUNCA lee el
 * localStorage interno de otro»): no es un módulo espiando a otro, es materiales
 * entregando un dato que era suyo. Por eso el fichero vive aquí, en materiales,
 * y no en incendio.
 *
 * Las claves van como literales, no resueltas por `entradaDe()`: el guardia de
 * `src/test/obra/proyectoKeys.test.ts` clasifica cada argumento de `leerClave`,
 * y uno no resoluble caería en `dinamicosFuera`. El test de la migración asevera
 * que estos dos literales siguen coincidiendo con los de `state.ts`.
 */

import { AMBITO_TODA_LA_ESTRUCTURA } from '../../lib/incendio/exigencias';
import { leerClave } from '../../lib/storage/seguro';

const CLAVE = 'concreta-materiales-model';
const CLAVE_VERSION = 'concreta-materiales-model-version';

/** Lo que se puede adoptar: una R en minutos con su ámbito, ya resuelta. */
export interface ExigenciaLegada {
  ambito: string;
  minutos: number;
}

/** Las clases que el desplegable viejo dejaba elegir. Lo guardado no puede traer otra cosa. */
const MINUTOS_VALIDOS = [30, 60, 90, 120, 180, 240];

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function minutos(v: unknown): number | null {
  return typeof v === 'number' && MINUTOS_VALIDOS.includes(v) ? v : null;
}

/**
 * Las exigencias que dejó escritas el cuadro de materiales, de la generación
 * que sea. Han existido tres:
 *
 *   1. `resistenciaFuego`, un número suelto para toda la obra (hasta el 10-09-2026);
 *   2. `exigenciasFuego`, la lista con ámbito (hasta el 13-09-2026);
 *   3. `exigenciasFuegoLegado`, esa misma lista ya jubilada, que es como se
 *      vuelve a guardar desde que el módulo de incendio existe.
 *
 * Se leen las tres, porque un `.concreta` guardado hace meses puede traer
 * cualquiera de ellas. Devuelve sólo las resueltas: una fila a medio rellenar
 * no se adopta, se pierde, y es lo correcto —no dice nada—.
 */
export function leerExigenciasFuegoLegado(): ExigenciaLegada[] {
  try {
    // Un blob de otra versión de esquema no se lee: `cargarEstado` de
    // materiales lo descartaría entero, así que su fuego tampoco vale.
    if (leerClave(CLAVE_VERSION) !== '1') return [];
    const bruto: unknown = JSON.parse(leerClave(CLAVE) ?? 'null');
    if (!esObjeto(bruto)) return [];

    const lista = Array.isArray(bruto.exigenciasFuegoLegado)
      ? bruto.exigenciasFuegoLegado
      : Array.isArray(bruto.exigenciasFuego)
        ? bruto.exigenciasFuego
        : null;

    if (lista) {
      return lista
        .filter(esObjeto)
        .map((f) => ({
          ambito: typeof f.ambito === 'string' ? f.ambito.trim() : '',
          minutos: minutos(f.minutos),
        }))
        .filter((f): f is ExigenciaLegada => f.ambito !== '' && f.minutos !== null);
    }

    // La generación 1: una sola cifra para toda la obra. El ámbito con el que
    // entra es el mismo que usaba `normalizarFuego`, para que la nota salga
    // redactada exactamente igual que antes.
    const suelta = minutos(bruto.resistenciaFuego);
    return suelta === null ? [] : [{ ambito: AMBITO_TODA_LA_ESTRUCTURA, minutos: suelta }];
  } catch {
    return [];
  }
}
