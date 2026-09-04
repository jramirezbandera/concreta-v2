/**
 * Las 52 provincias y ciudades autónomas con su zona eólica (figura D.1 del DB
 * SE-AE) y su zona de clima invernal (figura E.2), más la capital de la tabla
 * 3.8.
 *
 * Las dos figuras son MAPAS, no tablas: la norma no asigna zonas por provincia
 * y las líneas cruzan muchas de ellas. Lo que va aquí es la zona de la CAPITAL,
 * y `frontera` es el aviso, en lenguaje llano, de qué parte de la provincia
 * cae en la otra zona. El módulo lo enseña y deja cambiar la zona; nunca la
 * esconde.
 *
 * Cómo se fijó cada zona (2026-09-04):
 *  - Clima invernal: cruce de la tabla 3.8 (altitud y sk de cada capital) con
 *    la E.2 (sk por zona y altitud). Un test lo comprueba fila a fila. Donde
 *    dos zonas dan el mismo sk (Vitoria, Pamplona, Guadalajara…) decide el
 *    mapa y el oráculo externo.
 *  - Zona eólica: lectura del mapa D.1 rasterizado, contrastada con la tabla
 *    de los 50 municipios más poblados de normatia.com (test `provincias`).
 *    Melilla no lleva rótulo en el mapa: se toma A como la costa vecina y se
 *    avisa.
 *
 * El código INE de dos dígitos es la clave: es lo que llevan los municipios del
 * dataset de sismo y lo que el contexto de obra puede heredar.
 */

import { TABLA_3_8, type CapitalNieve, type ZonaEolica, type ZonaInvernal } from './tablasAE';

export interface Provincia {
  /** Código INE de la provincia, dos dígitos. */
  ine: string;
  nombre: string;
  zonaEolica: ZonaEolica;
  zonaInvernal: ZonaInvernal;
  /** Capital según la tabla 3.8, con altitud y sk. */
  capital: CapitalNieve;
  /** Qué parte de la provincia cae en otra zona. Ausente = la zona vale para toda la provincia. */
  frontera?: { eolica?: string; invernal?: string };
}

type Fila = [ine: string, nombre: string, eolica: ZonaEolica, invernal: ZonaInvernal, frontera?: Provincia['frontera']];

// Nombres idénticos a los que usaba `features/seismic-ncse02/hazard.ts`: los
// tests de sismo y los enlaces compartidos los llevan escritos.
const FILAS: Fila[] = [
  ['01', 'Álava', 'C', 2, { eolica: 'La Rioja alavesa, al sur, está en zona B.', invernal: 'La zona 1 empieza al norte de Vitoria; el valle de Ayala es zona 1.' }],
  ['02', 'Albacete', 'A', 5, { invernal: 'El sureste (Hellín, Sierra del Segura) entra en la zona 6.' }],
  ['03', 'Alicante', 'B', 5, { eolica: 'El interior (Alcoi, Villena, Elda) está en zona A.', invernal: 'La Vega Baja (Orihuela, Torrevieja) está en zona 6.' }],
  ['04', 'Almería', 'A', 6],
  ['05', 'Ávila', 'A', 3, { eolica: 'El norte (Arévalo) linda con la zona B.', invernal: 'El sur de Gredos (Arenas de San Pedro) está en zona 4.' }],
  ['06', 'Badajoz', 'B', 4, { eolica: 'El este (Don Benito, Castuera) está en zona A.', invernal: 'El sur (Zafra, Llerena) linda con la zona 6.' }],
  ['07', 'Baleares', 'C', 5],
  ['08', 'Barcelona', 'C', 2],
  ['09', 'Burgos', 'B', 3, { eolica: 'El norte (Miranda de Ebro, Merindades) está en zona C.', invernal: 'El norte (Merindades) está en zona 1.' }],
  ['10', 'Cáceres', 'B', 4, { eolica: 'El este (Plasencia, Navalmoral) está en zona A.', invernal: 'La sierra del norte (Hurdes, Gredos) linda con la zona 3.' }],
  ['11', 'Cádiz', 'C', 6, { eolica: 'El noreste (Sierra de Cádiz, Olvera) está en zona B.' }],
  ['12', 'Castellón', 'A', 5, { eolica: 'El norte (Vinaròs, Morella) está en zona C.', invernal: 'El norte (Morella, els Ports) está en zona 2.' }],
  ['13', 'Ciudad Real', 'A', 4, { invernal: 'El sur (Sierra Morena) está en zona 6.' }],
  ['14', 'Córdoba', 'A', 6, { invernal: 'El norte (Los Pedroches, Pozoblanco) está en zona 4.' }],
  ['15', 'A Coruña', 'C', 1],
  ['16', 'Cuenca', 'A', 5, { invernal: 'El oeste (Tarancón) está en zona 4.' }],
  ['17', 'Girona', 'C', 2],
  ['18', 'Granada', 'A', 6],
  ['19', 'Guadalajara', 'A', 4, { eolica: 'El nordeste (Molina de Aragón) linda con la zona B.', invernal: 'El norte (Sigüenza, Molina de Aragón) está en zona 3 o 2.' }],
  ['20', 'Gipuzkoa', 'C', 1],
  ['21', 'Huelva', 'B', 6, { eolica: 'El este linda con la zona A.', invernal: 'La Sierra de Aracena linda con la zona 4.' }],
  ['22', 'Huesca', 'C', 2, { eolica: 'El sur (Monzón, Fraga) está en zona B.' }],
  ['23', 'Jaén', 'A', 6, { invernal: 'El norte (Sierra Morena) linda con la zona 4.' }],
  ['24', 'León', 'B', 1, { eolica: 'La montaña del norte está en zona C.', invernal: 'El sur (Tierra de Campos, Sahagún) está en zona 3.' }],
  ['25', 'Lleida', 'C', 2, { eolica: 'El sur (Les Garrigues) linda con la zona B.' }],
  ['26', 'La Rioja', 'B', 2, { eolica: 'El norte linda con la zona C.', invernal: 'El oeste (Haro, Santo Domingo) linda con la zona 3.' }],
  ['27', 'Lugo', 'C', 1, { eolica: 'El sur (Monforte, Chantada) está en zona B.' }],
  ['28', 'Madrid', 'A', 4, { invernal: 'La sierra (norte) está en zona 3.' }],
  ['29', 'Málaga', 'A', 6, { eolica: 'El oeste (Estepona, Campo de Gibraltar) está en zona C.' }],
  ['30', 'Murcia', 'B', 6, { eolica: 'El interior (Caravaca, Jumilla, Yecla) está en zona A.', invernal: 'El norte (Jumilla, Yecla) está en zona 5.' }],
  ['31', 'Navarra', 'C', 2, { eolica: 'La Ribera (Tudela) está en zona B.', invernal: 'El norte (montaña) está en zona 1.' }],
  ['32', 'Ourense', 'B', 1, { eolica: 'El norte linda con la zona C.' }],
  ['33', 'Asturias', 'C', 1],
  ['34', 'Palencia', 'B', 3, { invernal: 'La montaña palentina (norte) está en zona 1.' }],
  ['35', 'Las Palmas', 'C', 7],
  ['36', 'Pontevedra', 'B', 1, { eolica: 'El norte (Ría de Arousa) linda con la zona C.' }],
  ['37', 'Salamanca', 'A', 3, { eolica: 'El norte y el oeste lindan con la zona B.' }],
  ['38', 'Santa Cruz de Tenerife', 'C', 7],
  ['39', 'Cantabria', 'C', 1],
  ['40', 'Segovia', 'A', 3, { eolica: 'El norte linda con la zona B.', invernal: 'La sierra del sur linda con la zona 4.' }],
  ['41', 'Sevilla', 'A', 6, { eolica: 'El oeste (Aljarafe) y el sur (marismas) están en zona B.' }],
  ['42', 'Soria', 'B', 3, { eolica: 'El sur linda con la zona A.', invernal: 'El este (Ágreda) está en zona 2.' }],
  ['43', 'Tarragona', 'C', 2, { eolica: 'El interior (Terra Alta) linda con la zona B.', invernal: 'Las Terres de l\'Ebre lindan con la zona 5.' }],
  ['44', 'Teruel', 'A', 5, { eolica: 'El este (Bajo Aragón, Alcañiz) está en zona C.', invernal: 'El norte (Alcañiz) está en zona 2.' }],
  ['45', 'Toledo', 'A', 4, { eolica: 'El oeste (Talavera) linda con la zona B.' }],
  ['46', 'Valencia', 'A', 5],
  ['47', 'Valladolid', 'A', 3, { eolica: 'El norte linda con la zona B.' }],
  ['48', 'Bizkaia', 'C', 1],
  ['49', 'Zamora', 'B', 3, { eolica: 'El sur linda con la zona A.', invernal: 'Sanabria (noroeste) está en zona 1.' }],
  ['50', 'Zaragoza', 'B', 2, { eolica: 'El nordeste (Cinco Villas, Monegros) está en zona C.' }],
  ['51', 'Ceuta', 'C', 6],
  ['52', 'Melilla', 'A', 6, { eolica: 'El mapa D.1 no rotula Melilla: se toma la zona A de la costa mediterránea vecina. Confírmalo.' }],
];

export const PROVINCIAS: readonly Provincia[] = FILAS.map(([ine, nombre, zonaEolica, zonaInvernal, frontera]) => ({
  ine,
  nombre,
  zonaEolica,
  zonaInvernal,
  capital: TABLA_3_8[ine],
  ...(frontera ? { frontera } : {}),
}));

const POR_INE = new Map(PROVINCIAS.map((p) => [p.ine, p]));

/** Provincia por su código INE de dos dígitos (o por los dos primeros de un municipio). */
export function provinciaPorIne(ine: string): Provincia | undefined {
  return POR_INE.get(ine.slice(0, 2));
}

/** Nombre de la provincia de un código INE. Cadena vacía si el prefijo no existe. */
export function provinciaDe(ine: string): string {
  return provinciaPorIne(ine)?.nombre ?? '';
}
