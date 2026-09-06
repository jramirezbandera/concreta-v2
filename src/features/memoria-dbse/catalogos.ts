/**
 * Las preguntas en lenguaje de obra y las explicaciones del modo Ayuda de cada
 * campo residual de la ficha, más los desplegables que no salen de ninguna
 * tabla de norma. Las etiquetas de los HUECOS (las que van en la cola de
 * «Siguiente hueco» y en el contador) viven en `lib/memoria/ensamblar.ts`;
 * aquí lo que se enseña al lado del campo.
 */

import type { GeotecniaCampo } from '../../lib/memoria/estado';

export interface Ayuda {
  /** La pregunta, como se haría en obra. */
  etiqueta: string;
  /** El tooltip ⓘ. */
  ayuda?: string;
  /** Dos líneas, sólo con el modo Ayuda encendido. */
  nota?: string;
  /** Lo que se enseña en la caja vacía. */
  placeholder?: string;
}

export const OBRA: Record<'denominacion' | 'uso', Ayuda> = {
  denominacion: {
    etiqueta: 'Nombre de la obra',
    ayuda: 'Va en el nombre del fichero («Memoria DB SE — {obra}») y en el título del documento.',
    placeholder: 'Edificio de 12 viviendas en…',
  },
  uso: {
    etiqueta: '¿Para qué es el edificio?',
    ayuda: 'El uso principal, en una o dos palabras. Encabeza la clasificación de la construcción en la tabla sísmica: «Edificio de viviendas (construcción de normal importancia)».',
    placeholder: 'Edificio de viviendas',
  },
};

export const ESTRUCTURA: Record<'descripcionSistema' | 'tipoEstructuraSismo' | 'sobrecargaTerreno', Ayuda> = {
  descripcionSistema: {
    etiqueta: '¿Cómo es la estructura?',
    ayuda: 'Es el apartado 3.1.5.1 «Descripción del sistema estructural». Dos o tres frases: qué forjados, qué soportes, qué hay bajo rasante.',
    nota: 'Ejemplo: «Pórticos de hormigón armado con vigas planas y forjado reticular de 30 cm; bajo rasante, losa y muros de sótano».',
    placeholder: 'Pórticos de hormigón armado con vigas planas y forjados reticulares de 30 cm de canto…',
  },
  tipoEstructuraSismo: {
    etiqueta: 'Tipo de estructura (tabla sísmica)',
    ayuda: 'En blanco, se toma del sistema estructural que declara el módulo de sismo. Escríbalo sólo si quiere otra redacción («Mixta: pórticos de hormigón y paredes de carga»).',
  },
  sobrecargaTerreno: {
    etiqueta: 'Sobrecarga en el terreno (kN/m²)',
    ayuda: 'La que se aplica en el trasdós de los muros y en la coronación de taludes; 10 kN/m² es lo habitual en edificación.',
  },
};

export const JUNTAS: Record<'existen' | 'numero' | 'separacionMax' | 'termicasConsideradas', Ayuda> = {
  existen: {
    etiqueta: '¿Hay juntas de dilatación?',
    ayuda: 'Con juntas a menos de 40 m el DB SE-AE permite no considerar las acciones térmicas en estructuras habituales de pilares y vigas (art. 3.4.1).',
  },
  numero: { etiqueta: 'Cuántas', ayuda: 'Las que parten el edificio en bloques independientes.' },
  separacionMax: { etiqueta: 'Separación máxima (m)', ayuda: 'La mayor distancia entre juntas, o entre una junta y el extremo del edificio.' },
  termicasConsideradas: {
    etiqueta: '¿Se han considerado las acciones térmicas y reológicas en el cálculo?',
    ayuda: 'Si no hay juntas, o están a más de 40 m, lo normal es que sí. Con juntas a menos de 40 m, la ficha cita a Calavera (60-90 m aceptables en hormigón armado).',
  },
};

export const GEOTECNIA: Record<GeotecniaCampo, Ayuda> = {
  empresa: { etiqueta: '¿Quién hizo el estudio geotécnico?', ayuda: 'Empresa y dirección, tal como figura en el informe.', placeholder: 'Empresa, calle, ciudad, teléfono' },
  autores: { etiqueta: 'Quién lo firma', ayuda: 'Nombre del autor o autores del informe.', placeholder: 'Nombre y apellidos' },
  titulacion: { etiqueta: 'Su titulación', placeholder: 'Ingeniero de Caminos, Geólogo…' },
  sondeos: { etiqueta: 'Sondeos y ensayos', ayuda: 'Cuántos sondeos, de qué tipo, y qué ensayos: penetrómetros, presiómetros, calicatas.', placeholder: '3 sondeos a rotación de 12 m y 2 penetrómetros DPSH' },
  descripcionTerrenos: {
    etiqueta: 'Cómo es el terreno',
    ayuda: 'Los estratos encontrados con su potencia, de arriba abajo, como los describe el informe.',
    placeholder: 'Relleno de 0 a 1,5 m; arenas limosas de 1,5 a 6 m; arcillas en el fondo',
  },
  cotaCimentacion: { etiqueta: 'Cota de cimentación', placeholder: '−1,80 m, o «variable (ver planos)»' },
  estratoApoyo: { etiqueta: 'Estrato sobre el que se cimenta', placeholder: 'Arenas limosas' },
  nivelFreatico: { etiqueta: 'Nivel freático', placeholder: 'No detectado hasta 12 m, o «a 6,9 m de profundidad»' },
  tensionAdmisible: { etiqueta: 'Tensión admisible', ayuda: 'Con las unidades del informe: 2,0 kg/cm², 200 kPa…', placeholder: '2,0 kg/cm²' },
  pesoEspecifico: { etiqueta: 'Peso específico del terreno', placeholder: 'γ = 18 kN/m³' },
  anguloRozamiento: { etiqueta: 'Ángulo de rozamiento interno', placeholder: 'φ = 30º' },
  empujeReposo: { etiqueta: 'Coeficiente de empuje en reposo', placeholder: 'K0 = 1 − sen φ = 0,50' },
  balasto: { etiqueta: 'Coeficiente de balasto', placeholder: '1.150 t/m³, o «no aplica»' },
};

export const CIMENTACION: Record<'descripcion' | 'material', Ayuda> = {
  descripcion: {
    etiqueta: '¿Cómo es la cimentación?',
    ayuda: 'Una frase: «Zapatas aisladas arriostradas», «Losa de cimentación», «Pilotes prefabricados con encepados».',
    placeholder: 'Zapatas aisladas y corridas, arriostradas',
  },
  material: { etiqueta: 'Material', placeholder: 'Hormigón armado.' },
};

export const CONTENCIONES: Record<'existen' | 'descripcion' | 'material', Ayuda> = {
  existen: { etiqueta: '¿Hay muros de contención o de sótano?', ayuda: 'Si los hay, la ficha lleva el bloque «Sistema de contenciones» del 3.1.3.' },
  descripcion: {
    etiqueta: '¿Cómo son?',
    placeholder: 'Muros de hormigón armado a una cara, con empuje al reposo y colaboración de los forjados',
  },
  material: { etiqueta: 'Material', placeholder: 'Hormigón armado.' },
};

export const FORJADO: Record<'intereje' | 'anchoNervio' | 'capaCompresion' | 'pieza', Ayuda> = {
  intereje: { etiqueta: 'Intereje (cm)', ayuda: 'Distancia entre ejes de nervios o viguetas.' },
  anchoNervio: { etiqueta: 'Ancho del nervio (cm)' },
  capaCompresion: { etiqueta: 'Capa de compresión (cm)' },
  pieza: { etiqueta: 'Pieza de entrevigado', ayuda: 'Bovedilla o casetón: de qué es. En reticular, «casetón recuperable» cambia el texto del apartado.' },
};

/** Las piezas de entrevigado que se ofrecen; se puede escribir otra. */
export const PIEZAS_FORJADO = ['Hormigón', 'Cerámica', 'Poliestireno expandido', 'Casetón recuperable', 'Casetón perdido de hormigón'];

export const FABRICA: Record<'procede' | 'pieza' | 'fb' | 'fm' | 'categoriaControl' | 'claseEjecucion', Ayuda> = {
  procede: {
    etiqueta: '¿Hay muros de fábrica con función estructural?',
    ayuda: 'Ladrillo o bloque que soporta cargas (muros de carga, arriostramiento). Los cerramientos no estructurales no cuentan. Es el único apartado que no se deduce de otro módulo.',
  },
  pieza: { etiqueta: 'Tipo de pieza', ayuda: 'Las cinco familias de la tabla 4.4 del DB SE-F.' },
  fb: { etiqueta: 'Resistencia de las piezas, fb (N/mm²)', ayuda: 'Resistencia normalizada a compresión de la pieza, la que declara el fabricante.' },
  fm: { etiqueta: 'Resistencia del mortero, fm (N/mm²)', ayuda: 'M5 es 5 N/mm², M7,5 es 7,5…' },
  categoriaControl: { etiqueta: 'Control de fabricación de las piezas', ayuda: 'Categoría I, con ensayos; II, control normal; III, reducido (DB SE-F 4.6.7).' },
  claseEjecucion: { etiqueta: 'Clase de ejecución', ayuda: 'A, ejecución cualificada; B, no cualificada. Con la categoría de control fija el γM de la tabla 4.8.' },
};

/** Usos habituales para el desplegable del nombre del edificio; se puede escribir otro. */
export const USOS_SUGERIDOS = ['Edificio de viviendas', 'Vivienda unifamiliar', 'Edificio de oficinas', 'Nave industrial', 'Edificio docente', 'Edificio sanitario', 'Aparcamiento', 'Local comercial'];

export const ESTUDIO_AYUDA =
  'Lo que no cambia entre obras del despacho: el programa de cálculo, los límites de flecha, la redacción del método. Se edita aquí una vez y no vuelve a preguntar.';

/** Qué toma la ficha de cada publicación, para el modo Ayuda del panel de fuentes. */
export const QUE_TOMA: Record<'materiales' | 'vientoNieve' | 'cargasPlanta' | 'sismo', string> = {
  materiales: 'Hormigones por elemento (3.1.5.4 y durabilidad), aceros, madera, vida útil y niveles de control; y si proceden el acero (3.1.7) y la madera (3.1.9).',
  vientoNieve: 'La zona eólica, la velocidad básica y la presión dinámica, y la nieve. Es opcional: sin publicar, la zona sale de la provincia.',
  cargasPlanta: 'La tabla de cargas por niveles (3.1.2), el estado de cargas (3.1.5.3) y las tipologías de forjado (3.1.6).',
  sismo: 'La tabla sísmica entera (3.1.4): ab, K, ρ, C, S, ac, método, modos, ductilidad; o el motivo de la exención.',
};
