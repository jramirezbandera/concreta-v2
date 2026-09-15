/**
 * Los cuadros de plano de TODA la obra, reunidos sin abrir ningún módulo.
 *
 * Nace de una queja de uso: los cuadros que van al plano se calculan en cuatro
 * módulos —materiales, viento y nieve, cargas por planta e incendio— y había
 * que entrar en los cuatro y bajar cuatro ficheros para llevarlos al CAD. Desde
 * el panel de la obra se piden todos de una vez, y bajan en UN .dxf y UN .xlsx.
 *
 * La regla de quién entra: el módulo que está RELLENADO, que es lo que dice su
 * propio `estaConfigurado()`. Ni los valores de partida ni el caso de ejemplo
 * son de esta obra, y un cuadro de partida en el plano es peor que no tenerlo.
 * Lo mismo que el panel de la obra ya usa para decir «con los valores de
 * partida»: un módulo no está relleno por haber sido abierto.
 *
 * No hay aquí ni una regla de composición de cuadros: cada `plano.ts` de cada
 * módulo ensambla el suyo, EL MISMO que exporta ese módulo por su cuenta. Es la
 * razón de existir de esos cuatro ficheros; si el ensamblado se volviera a
 * escribir aquí, el plano de la obra y el plano del módulo divergirían el día
 * que se tocara uno de los dos.
 *
 * El orden es el del capítulo en la barra lateral —materiales, viento y nieve,
 * cargas, incendio—, no el de terminación: en el plano los cuadros se leen
 * siempre en el mismo orden y no puede depender de por dónde se empezó.
 *
 * El nombre de la columna y su ruta salen del registro de módulos, que es el
 * que pone los nombres de la barra lateral: son los que el usuario ya tiene
 * aprendidos. Escribirlos aquí a mano, además de repetirlos, rotulaba la
 * columna de incendio «RESISTENCIA AL FUEGO» justo encima de un cuadro
 * titulado «RESISTENCIA AL FUEGO (SEGÚN DB SI 6)»: la misma frase dos veces
 * seguidas, que es lo que el rótulo venía a evitar.
 */

import type { Block } from '../memoria/model';
import { getModuleByKey } from '../../data/moduleRegistry';
import { cuadroDePlanoGuardado as cuadroMateriales } from '../../features/materiales/plano';
import { cuadroDePlanoGuardado as cuadroVientoNieve } from '../../features/viento-nieve/plano';
import { cuadroDePlanoGuardado as cuadroCargasPlanta } from '../../features/cargas-planta/plano';
import { cuadroDePlanoGuardado as cuadroIncendio } from '../../features/incendio/plano';

/** Una pestaña del libro de Excel, igual que la que exporta el módulo. */
export interface SeccionCuadro {
  nombre: string;
  blocks: Block[];
}

export interface CuadroDeObra {
  /** La clave del módulo, la misma de `CLAVES_PROYECTO` y del icono. */
  modulo: string;
  /** Cómo se llama en el plano: el rótulo de la columna del DXF. */
  etiqueta: string;
  /** Adónde lleva la fila al pincharla. */
  ruta: string;
  /** El cuadro entero, para el DXF. */
  blocks: Block[];
  /** El mismo cuadro repartido en pestañas, para el Excel. */
  secciones: SeccionCuadro[];
}

interface Fuente {
  modulo: string;
  leer: () => { blocks: Block[]; secciones: SeccionCuadro[] } | null;
}

const FUENTES: Fuente[] = [
  { modulo: 'concreta-materiales', leer: cuadroMateriales },
  { modulo: 'concreta-viento-nieve', leer: cuadroVientoNieve },
  { modulo: 'concreta-cargas-planta', leer: cuadroCargasPlanta },
  { modulo: 'concreta-incendio', leer: cuadroIncendio },
];

/** Cuántos módulos tienen cuadro de plano, para decir «3 de 4». */
export const TOTAL_CUADROS = FUENTES.length;

/**
 * Los cuadros que hoy tiene esta obra, en orden. Un módulo relleno cuyo cuadro
 * sale vacío —incendio sin exigencias ni sectores— tampoco entra: una columna
 * con un rótulo y nada debajo no es un cuadro.
 *
 * Se lee todo de localStorage en cada llamada, sin cachear: el módulo puede
 * haber cambiado en otra pestaña, y un cuadro viejo en el plano no se nota
 * hasta que está en obra.
 */
export function cuadrosDeLaObra(): CuadroDeObra[] {
  const cuadros: CuadroDeObra[] = [];
  for (const f of FUENTES) {
    let leido: { blocks: Block[]; secciones: SeccionCuadro[] } | null = null;
    try {
      leido = f.leer();
    } catch (e) {
      // Un estado guardado que ya no normaliza —un `.concreta` de otra versión,
      // un almacén a medio escribir— no puede tumbar la exportación de los
      // otros tres cuadros. Se dice por consola y se sigue.
      console.error(`No se ha podido leer el cuadro de plano de ${f.modulo}:`, e);
    }
    if (!leido || leido.blocks.length === 0) continue;
    const entrada = getModuleByKey(f.modulo);
    cuadros.push({
      modulo: f.modulo,
      etiqueta: entrada?.label ?? f.modulo,
      ruta: entrada?.route ?? '/obra',
      blocks: leido.blocks,
      secciones: leido.secciones.filter((s) => s.blocks.length > 0),
    });
  }
  return cuadros;
}
