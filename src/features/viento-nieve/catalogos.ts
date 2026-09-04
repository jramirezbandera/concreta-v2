/**
 * Las preguntas de obra del formulario, en lenguaje llano, y lo que significan
 * para el motor.
 *
 * Regla del capítulo: el usuario contesta «Pueblo, ciudad, polígono o bosque»
 * y nunca teclea «IV». Cada opción lleva su explicación para el modo Ayuda.
 */

import { PROVINCIAS, type Provincia } from '../../lib/acciones/provincias';
import type { ExposicionNieve, GradoAspereza } from '../../lib/acciones/tablasAE';

export interface Opcion<T extends string> {
  id: T;
  etiqueta: string;
  ayuda: string;
}

/** Tabla 3.4 / D.2, preguntada como «¿cómo es el entorno del edificio?». */
export const ASPEREZA_OPCIONES: Opcion<GradoAspereza>[] = [
  {
    id: 'IV',
    etiqueta: 'IV — Pueblo, ciudad, polígono o bosque',
    ayuda: 'Zona urbana en general, industrial o forestal. Es el caso habitual en edificación.',
  },
  {
    id: 'III',
    etiqueta: 'III — Campo con obstáculos sueltos',
    ayuda: 'Zona rural accidentada o llana con algunos obstáculos aislados: árboles, construcciones pequeñas.',
  },
  {
    id: 'II',
    etiqueta: 'II — Campo llano y despejado',
    ayuda: 'Terreno rural llano sin obstáculos ni arbolado de importancia. El viento llega casi sin frenar.',
  },
  {
    id: 'I',
    etiqueta: 'I — Borde del mar o de un lago',
    ayuda: 'Primera línea de costa o de un lago con al menos 5 km de agua en la dirección del viento. Es el entorno más expuesto.',
  },
  {
    id: 'V',
    etiqueta: 'V — Centro de una gran ciudad',
    ayuda: 'Centro de negocios con profusión de edificios en altura, que protegen unos a otros. Es el entorno menos expuesto.',
  },
];

export type QbModo = 'zona' | 'simplificado' | 'manual';

export const QB_MODO_OPCIONES: Opcion<QbModo>[] = [
  {
    id: 'zona',
    etiqueta: 'La de la zona eólica (Anejo D)',
    ayuda: '0,42, 0,45 o 0,52 kN/m² según la zona A, B o C del mapa D.1. Es el valor preciso que el DB recomienda.',
  },
  {
    id: 'simplificado',
    etiqueta: '0,5 kN/m² simplificado (art. 3.3.2)',
    ayuda: 'El DB admite 0,5 kN/m² en cualquier punto del territorio. Está del lado de la seguridad en las zonas A y B, y por debajo en la C.',
  },
  {
    id: 'manual',
    etiqueta: 'Un valor propio',
    ayuda: 'Para un estudio de viento o un dato empírico. Se imprime como «valor adoptado».',
  },
];

export const EXPOSICION_OPCIONES: Opcion<ExposicionNieve>[] = [
  { id: 'normal', etiqueta: 'Normal', ayuda: 'Ni protegida ni especialmente expuesta al viento.' },
  {
    id: 'protegida',
    etiqueta: 'Protegida del viento (−20 %)',
    ayuda: 'Rodeada de edificios más altos o de arbolado que frena el viento. La norma permite reducir la nieve un 20 % (art. 3.5.1-3).',
  },
  {
    id: 'expuesta',
    etiqueta: 'Muy expuesta al viento (+20 %)',
    ayuda: 'En un alto, en campo abierto o en primera línea. La norma obliga a aumentar la nieve un 20 % (art. 3.5.1-3).',
  },
];

export type LimahoyaUI = 'ninguna' | 'contrario' | 'mismoSentido';

export const LIMAHOYA_OPCIONES: Opcion<LimahoyaUI>[] = [
  { id: 'ninguna', etiqueta: 'No', ayuda: 'El faldón termina en un alero o en una limatesa: la nieve puede deslizar.' },
  {
    id: 'contrario',
    etiqueta: 'Sí, con el faldón de enfrente',
    ayuda: 'Los dos faldones bajan uno hacia el otro. En la banda de 2 m de la limahoya μ sube a 1 + β/30 (β = semisuma de inclinaciones), hasta 2,0.',
  },
  {
    id: 'mismoSentido',
    etiqueta: 'Sí, con otro faldón que sigue bajando',
    ayuda: 'El faldón de debajo baja en el mismo sentido: en la banda de 2 m se toma el μ de ese faldón inferior.',
  },
];

export type SkModo = 'auto' | 'manual';

export const SK_MODO_OPCIONES: Opcion<SkModo>[] = [
  {
    id: 'auto',
    etiqueta: 'Según la norma',
    ayuda: 'Tabla 3.8 si la obra está en la capital; si no, tabla E.2 por zona y altitud, interpolando.',
  },
  {
    id: 'manual',
    etiqueta: 'Un valor propio (ordenanza, datos empíricos)',
    ayuda: 'Por encima de las altitudes tabuladas la norma remite a la ordenanza municipal o a los datos disponibles (art. 3.5.2-3).',
  },
];

/** Las 52 provincias en orden alfabético, que es como se buscan en un desplegable. */
export const PROVINCIA_OPCIONES: readonly Provincia[] = [...PROVINCIAS].sort((a, b) =>
  a.nombre.localeCompare(b.nombre, 'es'),
);

/** Plantas con las que arranca un edificio nuevo: tres de 3 m. */
export const PLANTAS_INICIALES: { nombre: string; h: number }[] = [
  { nombre: 'Planta 1', h: 3 },
  { nombre: 'Planta 2', h: 6 },
  { nombre: 'Cubierta', h: 9 },
];

/** Altura que se le da a la siguiente planta al añadirla: la última más 3 m. */
export const ALTURA_PLANTA_TIPO = 3;
