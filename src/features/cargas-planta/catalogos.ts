/**
 * Las preguntas de obra del formulario, en lenguaje llano, y lo que significan
 * para el motor.
 *
 * Regla del capítulo: el usuario contesta «Viviendas» o «Garaje» y nunca
 * teclea «A1» ni «E»; el código va al lado, traducido. Cada opción lleva su
 * explicación para el modo Ayuda. Los números de los catálogos vienen de
 * `tablasCargas.ts`, nunca se escriben aquí.
 */

import { TIPOLOGIAS } from '../../data/forjadoTipologias';
import type { TipoForjado } from '../../lib/acciones/cargas';
import {
  ALTURA_LIBRE_C5,
  DENSIDAD_RELLENOS,
  TABIQUERIA,
  TABLA_3_1,
  TABLA_C5_CERRAMIENTOS,
  TABLA_C5_CUBIERTAS,
  TABLA_C5_SOLADOS,
  type CategoriaUso,
  type FamiliaPsi,
  type FilaTabla31,
} from '../../lib/acciones/tablasCargas';

export interface Opcion<T extends string> {
  id: T;
  etiqueta: string;
  ayuda: string;
  /**
   * Nombre corto para la celda de la tabla, donde no cabe la etiqueta entera.
   * La etiqueta larga sigue siendo la del desplegable abierto y la ayuda.
   */
  corta?: string;
}

const kNm2 = (v: number) => `${String(v).replace('.', ',')} kN/m²`;
const kNm = (v: number) => `${String(v).replace('.', ',')} kN/m`;
/** El alzado sale de una división por 3 m: se redondea o salen quince decimales. */
const kNm2Alzado = (v: number) => `${v.toFixed(2).replace('.', ',')} kN/m²`;
const num = (v: number) => String(v).replace('.', ',');
const q = (fila: FilaTabla31) => kNm2(TABLA_3_1[fila].uniforme);

/** Tabla 3.1, preguntada como «¿Para qué se usa esta planta?». */
export const USO_OPCIONES: Opcion<CategoriaUso | 'otro'>[] = [
  { id: 'A1', etiqueta: 'Viviendas, habitaciones de hotel u hospital — A1', ayuda: `${TABLA_3_1.A1.descripcion}: ${q('A1')} (tabla 3.1). Es el caso habitual en edificación residencial.`, corta: 'Viviendas' },
  { id: 'A2', etiqueta: 'Trasteros — A2', ayuda: `${TABLA_3_1.A2.descripcion}: ${q('A2')} (tabla 3.1).`, corta: 'Trasteros' },
  { id: 'B', etiqueta: 'Oficinas y despachos — B', ayuda: `${TABLA_3_1.B.descripcion}: ${q('B')} (tabla 3.1).`, corta: 'Oficinas' },
  { id: 'C1', etiqueta: 'Cafeterías, restaurantes, aulas (mesas y sillas) — C1', ayuda: `${TABLA_3_1.C1.descripcion}: ${q('C1')} (tabla 3.1).`, corta: 'Mesas y sillas' },
  { id: 'C2', etiqueta: 'Salones de actos, iglesias, cines (asientos fijos) — C2', ayuda: `${TABLA_3_1.C2.descripcion}: ${q('C2')} (tabla 3.1).`, corta: 'Asientos fijos' },
  { id: 'C3', etiqueta: 'Vestíbulos, pasillos y zonas de paso públicas — C3', ayuda: `${TABLA_3_1.C3.descripcion}: ${q('C3')} (tabla 3.1).`, corta: 'Vestíbulos y pasos' },
  { id: 'C4', etiqueta: 'Gimnasios y salas de actividades físicas — C4', ayuda: `${TABLA_3_1.C4.descripcion}: ${q('C4')} (tabla 3.1).`, corta: 'Gimnasios' },
  { id: 'C5', etiqueta: 'Salas de conciertos, estadios, aglomeraciones — C5', ayuda: `${TABLA_3_1.C5.descripcion}: ${q('C5')} (tabla 3.1).`, corta: 'Aglomeración' },
  { id: 'D1', etiqueta: 'Locales comerciales — D1', ayuda: `${TABLA_3_1.D1.descripcion}: ${q('D1')} (tabla 3.1).`, corta: 'Locales comerciales' },
  { id: 'D2', etiqueta: 'Supermercados y grandes superficies — D2', ayuda: `${TABLA_3_1.D2.descripcion}: ${q('D2')} (tabla 3.1).`, corta: 'Grandes superficies' },
  { id: 'E', etiqueta: 'Garaje de vehículos ligeros — E', ayuda: `${TABLA_3_1.E.descripcion}: ${q('E')} y una carga concentrada de ${TABLA_3_1.E.concentrada} kN (tabla 3.1).`, corta: 'Garaje' },
  { id: 'F', etiqueta: 'Terraza transitable privada — F', ayuda: `${TABLA_3_1.F.descripcion}: ${q('F')} (tabla 3.1). Si el acceso es público, la sobrecarga es la de la zona desde la que se accede (nota 2); en todo caso los coeficientes ψ son los de ese uso.`, corta: 'Terraza privada' },
  { id: 'G', etiqueta: 'Cubierta no transitable (sólo conservación) — G', ayuda: `${q('G1')} hasta 20º de inclinación, nada a partir de 40º e interpolado entre medias; ${q('G1ligera')} si es una cubierta ligera sobre correas sin forjado (tabla 3.1, notas 3 y 5). No es concomitante con la nieve ni con el viento (nota 7).`, corta: 'Sólo conservación' },
  { id: 'otro', etiqueta: 'Otro uso: un valor propio', ayuda: 'Almacenes, bibliotecas, equipos pesados, centros de transformación, helipuertos: la norma remite al suministrador o a la propiedad y obliga a consignar el valor adoptado en la memoria (art. 3.1-2 y 3.1.1-5).', corta: 'Valor propio' },
];

/** Para un uso adoptado: con qué fila de la tabla 4.2 van sus ψ. */
export const FAMILIA_PSI_OPCIONES: Opcion<FamiliaPsi>[] = [
  { id: 'A', etiqueta: 'Como las zonas residenciales (A)', ayuda: 'ψ0 = 0,7 · ψ1 = 0,5 · ψ2 = 0,3.' },
  { id: 'B', etiqueta: 'Como las zonas administrativas (B)', ayuda: 'ψ0 = 0,7 · ψ1 = 0,5 · ψ2 = 0,3.' },
  { id: 'C', etiqueta: 'Como las zonas destinadas al público (C)', ayuda: 'ψ0 = 0,7 · ψ1 = 0,7 · ψ2 = 0,6.' },
  { id: 'D', etiqueta: 'Como las zonas comerciales (D)', ayuda: 'ψ0 = 0,7 · ψ1 = 0,7 · ψ2 = 0,6.' },
  { id: 'E', etiqueta: 'Como las zonas de tráfico y aparcamiento (E)', ayuda: 'ψ0 = 0,7 · ψ1 = 0,7 · ψ2 = 0,6.' },
  { id: 'G', etiqueta: 'Como las cubiertas de mantenimiento (G)', ayuda: 'ψ0 = ψ1 = ψ2 = 0.' },
];

/** «¿Qué forjado tiene?», con el peso propio que propondrá la app. */
export const FORJADO_OPCIONES: Opcion<TipoForjado>[] = [
  { id: 'reticular', etiqueta: 'Reticular (casetones)', ayuda: 'Forjado bidireccional de nervios y casetones. La tabla C.5 da 4 kN/m² por debajo de 30 cm y 5 por debajo de 35; si tiene el peso del programa o del fabricante, tecléelo.', corta: 'Reticular' },
  { id: 'losa', etiqueta: 'Losa maciza', ayuda: 'Hormigón armado macizo: 25 kN/m³ por el canto (tabla C.1). Una losa de 30 cm pesa 7,5 kN/m².', corta: 'Losa maciza' },
  { id: 'unidireccional', etiqueta: 'Unidireccional (viguetas y bovedillas)', ayuda: 'Viguetas con bovedillas y capa de compresión. La tabla C.5 da 3 kN/m² hasta 5 m de luz y canto menor de 28 cm, y 4 por debajo de 30 cm.', corta: 'Unidireccional' },
  { id: 'chapa', etiqueta: 'Chapa colaborante', ayuda: 'Chapa grecada con capa de hormigón. La tabla C.5 da 2 kN/m² por debajo de 12 cm; para cantos mayores teclee el peso del fabricante.', corta: 'Chapa' },
  { id: 'solera', etiqueta: 'Solera sobre terreno', ayuda: 'Losa de hormigón apoyada en el terreno: 25 kN/m³ por el canto. Una solera de 30 cm pesa 7,5 kN/m².', corta: 'Solera' },
  { id: 'madera', etiqueta: 'Madera (viguetas y tablero)', ayuda: 'La norma no da un valor: teclee el peso propio de viguetas y tablero.', corta: 'Madera' },
  { id: 'otro', etiqueta: 'Otro o existente', ayuda: 'Un forjado existente o de otro tipo: teclee su peso propio.', corta: 'Otro o existente' },
];

/** Canto con el que arranca cada tipo, cm. */
export const CANTO_INICIAL: Record<TipoForjado, number> = {
  reticular: 30,
  losa: 25,
  unidireccional: 30,
  chapa: 12,
  solera: 20,
  madera: 0,
  otro: 0,
};

/** Los cantos habituales del reticular, de las tipologías del módulo Forjados (mm → cm). */
export const CANTOS_RETICULAR: number[] = [...new Set(TIPOLOGIAS.map((t) => t.h / 10))].sort((a, b) => a - b);

export interface EntradaCatalogo {
  id: string;
  etiqueta: string;
  /** kN/m² (o kN/m en los lineales). null = se teclea. */
  valor: number | null;
  /** kN/m³: el valor es este por el espesor tecleado. */
  porEspesor: number | null;
  ayuda: string;
}

/** «¿Qué hay encima del forjado?»: tabla C.5 y art. 2.1-3. */
export const CATALOGO_PERMANENTES: EntradaCatalogo[] = [
  { id: 'solado', etiqueta: 'Solado cerámico, de madera o hidráulico', valor: TABLA_C5_SOLADOS.plaston.peso, porEspesor: null, ayuda: `${TABLA_C5_SOLADOS.plaston.descripcion} (tabla C.5).` },
  { id: 'solado-ligero', etiqueta: 'Moqueta o lámina pegada', valor: TABLA_C5_SOLADOS.lamina.peso, porEspesor: null, ayuda: `${TABLA_C5_SOLADOS.lamina.descripcion} (tabla C.5).` },
  { id: 'solado-piedra', etiqueta: 'Placas de piedra o peldañeado', valor: TABLA_C5_SOLADOS.piedra.peso, porEspesor: null, ayuda: `${TABLA_C5_SOLADOS.piedra.descripcion} (tabla C.5).` },
  { id: 'tabiqueria', etiqueta: 'Tabiquería', valor: TABIQUERIA.viviendas, porEspesor: null, ayuda: `En viviendas basta considerar ${kNm2(TABIQUERIA.viviendas)} de superficie construida (art. 2.1-3). Tabiques de más de ${kNm2(TABIQUERIA.max)} de alzado no se asimilan a carga uniforme.` },
  { id: 'cubierta-plana', etiqueta: 'Cubierta plana con impermeabilización vista', valor: TABLA_C5_CUBIERTAS.planaVista.peso, porEspesor: null, ayuda: `${TABLA_C5_CUBIERTAS.planaVista.descripcion} (tabla C.5).` },
  { id: 'cubierta-grava', etiqueta: 'Cubierta plana invertida o a la catalana con grava', valor: TABLA_C5_CUBIERTAS.planaGrava.peso, porEspesor: null, ayuda: `${TABLA_C5_CUBIERTAS.planaGrava.descripcion} (tabla C.5).` },
  { id: 'cubierta-teja', etiqueta: 'Faldones de teja, placas o pizarra', valor: TABLA_C5_CUBIERTAS.faldonesTeja.peso, porEspesor: null, ayuda: `${TABLA_C5_CUBIERTAS.faldonesTeja.descripcion} (tabla C.5, en proyección horizontal).` },
  { id: 'cubierta-palomeros', etiqueta: 'Teja sobre tableros y tabiques palomeros', valor: TABLA_C5_CUBIERTAS.tejaPalomeros.peso, porEspesor: null, ayuda: `${TABLA_C5_CUBIERTAS.tejaPalomeros.descripcion} (tabla C.5).` },
  { id: 'cubierta-ligera', etiqueta: 'Faldones de chapa, tablero o paneles ligeros', valor: TABLA_C5_CUBIERTAS.faldonesLigeros.peso, porEspesor: null, ayuda: `${TABLA_C5_CUBIERTAS.faldonesLigeros.descripcion} (tabla C.5).` },
  { id: 'agua', etiqueta: 'Agua (piscina, aljibe)', valor: null, porEspesor: DENSIDAD_RELLENOS.agua, ayuda: `${DENSIDAD_RELLENOS.agua} kN/m³ por la lámina de agua (tabla C.5). Un vaso de 1,6 m son 16 kN/m².` },
  { id: 'tierra', etiqueta: 'Tierra de jardinera, con drenaje', valor: null, porEspesor: DENSIDAD_RELLENOS.tierra, ayuda: `${DENSIDAD_RELLENOS.tierra} kN/m³ por el espesor de tierra, incluido el material de drenaje (tabla C.5).` },
  { id: 'otro', etiqueta: 'Otra carga permanente', valor: null, porEspesor: null, ayuda: 'Falsos techos, instalaciones colgadas, bancadas, recrecidos: teclee su peso.' },
];

/**
 * Una carga que apoya en línea sobre vigas y bordes de forjado.
 *
 * Un MURO se teclea como muro: peso por m² de alzado y altura real, y la carga
 * por metro sale de multiplicarlos. La tabla C.5 da sus cerramientos en kN/m
 * «para una altura libre del orden de 3,0 m», así que el peso por m² de alzado
 * es ese valor dividido por esos 3 m; con la altura de verdad de la planta el
 * número deja de ser el de un edificio cualquiera. Lo que no es un muro —una
 * barandilla— se teclea directamente en kN/m.
 */
export interface EntradaLineal {
  id: string;
  etiqueta: string;
  /** kN/m tecleados tal cual. null = la carga sale del alzado por la altura. */
  valor: number | null;
  /** kN/m² de alzado. null = no es un muro. */
  alzado: number | null;
  /** Altura con la que arranca, m. Va con `alzado`. */
  altura: number | null;
  ayuda: string;
}

/** El kN/m de la tabla C.5 pasado a kN/m² de alzado. */
const porAlzado = (pesoC5: number) => pesoC5 / ALTURA_LIBRE_C5;

/** «¿Qué carga apoya en línea?»: muros, cerramientos y petos, tabla C.5 y práctica del estudio. */
export const CATALOGO_LINEALES: EntradaLineal[] = [
  { id: 'fachada', etiqueta: 'Cerramiento de fachada', valor: null, alzado: porAlzado(TABLA_C5_CERRAMIENTOS.hojaExterior.peso), altura: ALTURA_LIBRE_C5, ayuda: `${TABLA_C5_CERRAMIENTOS.hojaExterior.descripcion}: la tabla C.5 le da ${kNm(TABLA_C5_CERRAMIENTOS.hojaExterior.peso)} para una altura libre del orden de ${num(ALTURA_LIBRE_C5)} m, o sea ${kNm2Alzado(porAlzado(TABLA_C5_CERRAMIENTOS.hojaExterior.peso))} de alzado. Ponga la altura real de la planta.` },
  { id: 'tabicon', etiqueta: 'Tabicón u hoja simple de ladrillo', valor: null, alzado: porAlzado(TABLA_C5_CERRAMIENTOS.tabicon.peso), altura: ALTURA_LIBRE_C5, ayuda: `${TABLA_C5_CERRAMIENTOS.tabicon.descripcion}: ${kNm(TABLA_C5_CERRAMIENTOS.tabicon.peso)} a ${num(ALTURA_LIBRE_C5)} m de altura libre (tabla C.5), o sea ${kNm2Alzado(porAlzado(TABLA_C5_CERRAMIENTOS.tabicon.peso))} de alzado.` },
  { id: 'tabique', etiqueta: 'Tabique simple', valor: null, alzado: porAlzado(TABLA_C5_CERRAMIENTOS.tabique.peso), altura: ALTURA_LIBRE_C5, ayuda: `${TABLA_C5_CERRAMIENTOS.tabique.descripcion}: ${kNm(TABLA_C5_CERRAMIENTOS.tabique.peso)} a ${num(ALTURA_LIBRE_C5)} m de altura libre (tabla C.5), o sea ${kNm2Alzado(porAlzado(TABLA_C5_CERRAMIENTOS.tabique.peso))} de alzado.` },
  { id: 'vidrio', etiqueta: 'Cerramiento de vidrio', valor: null, alzado: porAlzado(4), altura: ALTURA_LIBRE_C5, ayuda: 'Muro cortina o carpintería acristalada de suelo a techo. El valor habitual del estudio son 4 kN/m para unos 3 m; comprueba el del fabricante.' },
  { id: 'muro', etiqueta: 'Otro muro o cerramiento', valor: null, alzado: 0, altura: ALTURA_LIBRE_C5, ayuda: 'Teclee el peso por m² de alzado del muro (el de su fábrica, con el revestimiento) y su altura; la carga por metro sale de multiplicarlos.' },
  { id: 'peto', etiqueta: 'Peto de cubierta', valor: null, alzado: 5, altura: 1, ayuda: 'Peto de fábrica: el valor habitual del estudio son 5 kN/m para un metro de alto. Suba la altura y la carga sube con ella.' },
  { id: 'barandilla', etiqueta: 'Barandilla', valor: 1, alzado: null, altura: null, ayuda: 'Peso propio de la barandilla, en kN/m: no se mide por alzado. La acción horizontal sobre ella (tabla 3.3) no entra aquí.' },
  { id: 'otro', etiqueta: 'Otra carga lineal', valor: null, alzado: null, altura: null, ayuda: 'Teclee la carga por metro.' },
];

/**
 * Con lo que arranca el bloque de muros: los valores que el estudio viene
 * usando en su hoja de evaluación de cargas. No son de la norma —el terreno lo
 * dice el geotécnico—, sólo un punto de partida que se cambia encima.
 */
export const MUROS_INICIAL = { terreno: 'Terreno de relleno', phi: 30, gamma: 19, sobrecarga: 2 };

export type NieveModo = 'ninguna' | 'publicada' | 'manual';

export const NIEVE_MODO_OPCIONES: Opcion<NieveModo>[] = [
  { id: 'ninguna', etiqueta: 'Sin nieve', ayuda: 'La cubierta no lleva carga de nieve (o se trata fuera).' },
  { id: 'publicada', etiqueta: 'La que publica Viento y nieve', ayuda: 'Toma la carga de nieve qn del faldón elegido en el módulo Viento y nieve. Si aquel módulo vuelve a publicar, aquí aparece un aviso para actualizarla.' },
  { id: 'manual', etiqueta: 'Un valor propio', ayuda: 'Teclee la carga de nieve en proyección horizontal, kN/m².' },
];

/**
 * Plantas con las que arranca un edificio nuevo, de arriba abajo: es el orden
 * en que las dibuja la sección y en el que se lee un cuadro de acciones en el
 * plano. Las flechas de cada planta lo cambian.
 */
export const PLANTAS_INICIALES: { nombre: string; esCubierta: boolean }[] = [
  { nombre: 'Cubierta', esCubierta: true },
  { nombre: 'Planta Primera', esCubierta: false },
  { nombre: 'Planta Baja', esCubierta: false },
];

/** Lo que hay encima del forjado en una planta nueva, por tipo de planta. */
export const PERMANENTES_INICIALES = {
  planta: ['solado', 'tabiqueria'],
  cubierta: ['cubierta-grava'],
};
