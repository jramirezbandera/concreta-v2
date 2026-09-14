/**
 * Las plantas del edificio, leídas del sobre de «Cargas por planta».
 *
 * El DB SI 6 pide la altura de evacuación y saber qué plantas son de sótano, y
 * las plantas ya están tecleadas en otro módulo: repetirlas aquí sería pedirle
 * al proyectista que las escriba dos veces y que las dos listas discrepen a la
 * primera. Así que se leen de su sobre y NO se toca aquel módulo.
 *
 * Lo que aquel no tiene —porque no le hace falta para las cargas— es la altura
 * de cada planta y si está bajo rasante. Eso se teclea aquí, en `state.ts`, y
 * se pega a la planta publicada por su nombre.
 *
 * Se lee del sobre en cada render y no se copia: las plantas son la geometría
 * del edificio, y si cambian allí tienen que cambiar aquí. Lo que sí se guarda
 * son las anotaciones, que son de este módulo.
 *
 * Las claves van a mano y el tipo entra como TIPO, para no arrastrar el motor
 * de cargas al chunk de este módulo. Mismo criterio que `materialesPub.ts`, y
 * con el mismo test de guardia.
 */

import { leerPublicacion } from '../../lib/pub';
import type { PubCargasPlanta } from '../cargas-planta/state';

export const MODULO_CARGAS = 'cargas-planta';
export const PUB_VERSION_CARGAS = 1;

/** Una planta tal como llega del sobre, con lo poco que de ella nos interesa. */
export interface PlantaPublicada {
  nombre: string;
  esCubierta: boolean;
  /**
   * Las filas de la tabla 3.1 del DB SE-AE de sus zonas: de ahí sale la
   * ocupación. Cadenas y no un tipo cerrado, porque así viajan en el sobre y
   * porque «Cargas por planta» añade dos valores suyos —`G1-G2` para la
   * cubierta que interpola entre 20º y 40º, y `otro` para una sobrecarga
   * tecleada a mano—.
   */
  filas: string[];
  /**
   * Canto del forjado de la planta, en METROS. `null` cuando sus zonas no se
   * ponen de acuerdo —una planta puede llevar reticular de 30 en una zona y
   * losa de 25 en otra— o cuando no hay ninguno.
   *
   * Hace falta sólo si las alturas se teclean LIBRES: la subida de una planta a
   * la de encima es la libre más el canto del forjado de arriba. Tecleando
   * alturas totales no se usa.
   */
  canto: number | null;
  /** Las zonas traen cantos distintos: hay que elegir uno a mano. */
  cantosDistintos: boolean;
}

/**
 * Las filas del DB SE-AE que describen una cubierta accesible ÚNICAMENTE para
 * conservación. El Anejo A del DB SI llama a eso «zona de ocupación nula», y
 * dice que las plantas más altas que sólo tengan zonas así no cuentan para la
 * altura de evacuación.
 *
 * `F` —cubierta transitable accesible sólo privadamente— sí cuenta: es una
 * terraza, no una zona de mantenimiento.
 */
const FILAS_OCUPACION_NULA: readonly string[] = ['G1', 'G1ligera', 'G2', 'G1-G2'];

/**
 * ¿Cuenta esta planta para la altura de evacuación?
 *
 * Es una PROPUESTA, no un veredicto: sale de para qué se dimensionó el forjado,
 * que es lo que hay publicado. Sólo dice «no» cuando TODAS las zonas de la
 * planta son de conservación —basta una habitable para que cuente—.
 *
 * `otro` —sobrecarga tecleada a mano— cuenta: no se sabe para qué es, y dejar
 * fuera de la altura de evacuación una planta que sí se ocupa mete el edificio
 * en una columna más blanda de la tabla 3.1.
 *
 * El Anejo A también llama ocupación nula a los trasteros, y eso no se puede
 * deducir de la fila `A2`: ésas se corrigen a mano.
 */
export function cuentaParaEvacuacion(p: PlantaPublicada): boolean {
  if (p.filas.length === 0) return true;
  return !p.filas.every((f) => FILAS_OCUPACION_NULA.includes(f));
}

/**
 * Las plantas publicadas, DE ABAJO ARRIBA.
 *
 * El sobre las lista de arriba abajo (`PLANTAS_INICIALES` empieza por
 * «Cubierta»), y aquí interesa el orden contrario: las cotas se acumulan desde
 * la planta de salida hacia arriba.
 *
 * `null` cuando no hay nada utilizable. El filtro `configurado !== true` no es
 * celo: abrir «Cargas por planta» publica ya sus tres plantas de partida
 * —Cubierta, Planta Primera, Planta Baja—, y sin el filtro este módulo se
 * poblaría solo de plantas fantasma con pinta de tecleadas.
 */
export function plantasPublicadas(): PlantaPublicada[] | null {
  const sobre = leerPublicacion<PubCargasPlanta>(MODULO_CARGAS, PUB_VERSION_CARGAS);
  if (!sobre || sobre.configurado !== true || !sobre.datos) return null;
  const plantas = sobre.datos.plantas;
  if (!Array.isArray(plantas) || plantas.length === 0) return null;
  return [...plantas]
    .reverse()
    .map((p) => {
      // El canto viaja en centímetros en el sobre de cargas; aquí todo va en
      // metros, como las cotas.
      const cantos = [
        ...new Set(
          (p.zonas ?? [])
            .map((z) => z.forjado?.canto)
            .filter((c): c is number => typeof c === 'number' && Number.isFinite(c) && c > 0),
        ),
      ];
      return {
        nombre: p.nombre,
        esCubierta: p.esCubierta,
        filas: (p.zonas ?? []).map((z) => z.fila),
        canto: cantos.length === 1 ? cantos[0] / 100 : null,
        cantosDistintos: cantos.length > 1,
      };
    });
}
