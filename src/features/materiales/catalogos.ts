/**
 * Las preguntas de obra del formulario, y lo que significan para el motor.
 *
 * Aquí se cumple la regla del módulo: el usuario elige «Muro contra el terreno,
 * con cara vista» y nunca teclea XC2. Cada situación traduce esa frase a la
 * `SituacionElemento` que entiende `src/lib/materiales/derive.ts` y trae su
 * propia explicación para el modo Ayuda.
 *
 * Por qué «enterrado» está partido en dos: en el cuadro real de ABAYALDE los
 * muros se endurecen a XS1 con el modificador de costa y la cimentación no.
 * La diferencia es tener o no caras al aire libre, así que es una pregunta de
 * obra, no una casilla técnica escondida.
 */

import { TIMBER_GRADES, type TimberSubtype, type TimberType } from '../../data/timberGrades';
import { CONSISTENCIAS } from '../../lib/materiales/tablasCE';
import type {
  Consistencia,
  SituacionElemento,
  SituacionMadera,
  TipoMadera,
} from '../../lib/materiales/types';

// ── Hormigón ────────────────────────────────────────────────────────────────

export type SituacionId =
  | 'interior_seco'
  | 'interior_humedo'
  | 'enterrado'
  | 'muro_terreno'
  | 'exterior_protegido'
  | 'exterior_lluvia'
  | 'marino'
  | 'piscina'
  | 'deposito'
  | 'aparcamiento'
  | 'limpieza';

export interface OpcionSituacion {
  /** Lo que lee el usuario en el desplegable. */
  etiqueta: string;
  /** Explicación del modo Ayuda: por qué esa situación lleva a esa clase. */
  ayuda: string;
  /** Lo que se le pasa al motor. `null` = fila libre (hormigón de limpieza). */
  situacion: SituacionElemento | null;
  contraTerreno?: boolean;
  expuestoAireExterior?: boolean;
  hidrofugo?: boolean;
}

export const SITUACIONES: Record<SituacionId, OpcionSituacion> = {
  interior_seco: {
    etiqueta: 'Interior, seco',
    ayuda: 'Dentro del edificio, con humedad del aire baja. La armadura apenas se carbonata: es el ambiente menos exigente.',
    situacion: { ubicacion: 'interior_seco' },
  },
  interior_humedo: {
    etiqueta: 'Interior húmedo (garaje, sótano ventilado)',
    ayuda: 'Recinto cerrado pero con humedad media o alta. Sube un escalón respecto al interior seco.',
    situacion: { ubicacion: 'interior_humedo' },
  },
  enterrado: {
    etiqueta: 'Enterrado, sin caras vistas (zapatas, encepados)',
    ayuda: 'El terreno mantiene humedad constante. Además, hormigonado contra el terreno el recubrimiento sube a 70 mm salvo que haya hormigón de limpieza.',
    situacion: { ubicacion: 'enterrado' },
    contraTerreno: true,
  },
  muro_terreno: {
    etiqueta: 'Muro contra el terreno, con cara vista',
    ayuda: 'Como el anterior, pero una cara queda al aire libre. Es la que recoge el aerosol marino si la obra está en la costa.',
    situacion: { ubicacion: 'enterrado' },
    contraTerreno: true,
    expuestoAireExterior: true,
  },
  exterior_protegido: {
    etiqueta: 'Exterior, protegido de la lluvia',
    ayuda: 'Al aire libre pero sin recibir agua directamente: soportales, patios cubiertos.',
    situacion: { ubicacion: 'exterior_protegido' },
    expuestoAireExterior: true,
  },
  exterior_lluvia: {
    etiqueta: 'Exterior, a la lluvia',
    ayuda: 'Ciclos de mojado y secado. Es el ambiente exterior habitual en fachada y cubierta.',
    situacion: { ubicacion: 'exterior_lluvia' },
    expuestoAireExterior: true,
  },
  marino: {
    etiqueta: 'Junto al mar (a menos de 5 km de la costa)',
    ayuda: 'Los cloruros del aire salino atacan la armadura aunque el elemento no toque el agua. Marque esta opción sólo para elementos concretos; para toda la obra, use el interruptor «obra en la costa».',
    situacion: { ubicacion: 'exterior_lluvia', marino: 'aereo' },
    expuestoAireExterior: true,
  },
  piscina: {
    etiqueta: 'Vaso de piscina',
    ayuda: 'Agua clorada en contacto permanente. Lleva además hormigón hidrófugo por estanqueidad.',
    situacion: { ubicacion: 'enterrado', cloruros: 'piscina' },
    hidrofugo: true,
  },
  deposito: {
    etiqueta: 'Aljibe o depósito de agua',
    ayuda: 'Contacto permanente con agua no agresiva, más hormigón hidrófugo para que no rezume.',
    situacion: { ubicacion: 'enterrado' },
    hidrofugo: true,
  },
  aparcamiento: {
    etiqueta: 'Losa de aparcamiento',
    ayuda: 'Los coches entran con sales de deshielo y agua del exterior: es un ambiente de cloruros, no un interior cualquiera.',
    situacion: { ubicacion: 'interior_humedo', cloruros: 'salpicaduras' },
  },
  limpieza: {
    etiqueta: 'Hormigón de limpieza',
    ayuda: 'No es estructural: regulariza el fondo de la excavación. El Código Estructural sólo admite una tipificación, HL-150/C/TM.',
    situacion: null,
  },
};

export const ORDEN_SITUACIONES: SituacionId[] = [
  'interior_seco',
  'interior_humedo',
  'enterrado',
  'muro_terreno',
  'exterior_protegido',
  'exterior_lluvia',
  'marino',
  'aparcamiento',
  'piscina',
  'deposito',
  'limpieza',
];

export interface PresetHormigon {
  situacion: SituacionId;
  consistencia: Consistencia;
  fck: number;
  /** Pilar, viga o forjado: el CE 33.5 les prescribe consistencia fluida. */
  prescripcionFluida?: boolean;
}

/**
 * Nombres que el estudio escribe una y otra vez. Elegir uno rellena la fila
 * entera; escribir cualquier otro nombre deja la situación en blanco, que es
 * el hueco rojo que hay que resolver.
 */
export const PRESETS_HORMIGON: Record<string, PresetHormigon> = {
  'Cimentación': { situacion: 'enterrado', consistencia: 'blanda', fck: 30 },
  'Enanos de cimentación': { situacion: 'enterrado', consistencia: 'blanda', fck: 30 },
  'Muros de sótano': { situacion: 'muro_terreno', consistencia: 'blanda', fck: 30 },
  'Muros de contención': { situacion: 'muro_terreno', consistencia: 'blanda', fck: 30 },
  'Forjados': { situacion: 'interior_seco', consistencia: 'fluida', fck: 30, prescripcionFluida: true },
  'Pilares': { situacion: 'interior_seco', consistencia: 'fluida', fck: 30, prescripcionFluida: true },
  'Vigas': { situacion: 'interior_seco', consistencia: 'fluida', fck: 30, prescripcionFluida: true },
  'Losa de escalera': { situacion: 'interior_seco', consistencia: 'fluida', fck: 30, prescripcionFluida: true },
  'Vaso de piscina': { situacion: 'piscina', consistencia: 'fluida', fck: 30 },
  'Aljibe / depósito de agua': { situacion: 'deposito', consistencia: 'fluida', fck: 30 },
  'Losa de aparcamiento': { situacion: 'aparcamiento', consistencia: 'fluida', fck: 30 },
  'Estructura exterior (intemperie)': { situacion: 'exterior_lluvia', consistencia: 'blanda', fck: 30 },
  'Hormigón de limpieza': { situacion: 'limpieza', consistencia: 'blanda', fck: 15 },
};

/** Resistencias que ofrece el desplegable. La durabilidad puede subirla sola. */
export const FCK_OPCIONES = [25, 30, 35, 40];

/**
 * Las cinco clases de la tabla 33.5.a, no dos. El asentamiento va en la
 * etiqueta porque es lo que se pide en central: nadie encarga «blanda», se
 * encarga un cono. Cuál conviene lo dice el motor con los avisos del 33.5.
 */
export const CONSISTENCIA_OPCIONES: { id: Consistencia; etiqueta: string }[] = (
  ['seca', 'plastica', 'blanda', 'fluida', 'liquida'] as Consistencia[]
).map((id) => ({
  id,
  etiqueta: `${CONSISTENCIAS[id].etiqueta} (${CONSISTENCIAS[id].asentamiento})`,
}));

// ── Madera ──────────────────────────────────────────────────────────────────

export type SituacionMaderaId =
  | 'interior'
  | 'interior_humedo'
  | 'cubierto'
  | 'cubierta_no_ventilada'
  | 'exterior_protegido'
  | 'exterior'
  | 'suelo';

export interface OpcionSituacionMadera {
  etiqueta: string;
  ayuda: string;
  situacion: SituacionMadera;
}

export const SITUACIONES_MADERA: Record<SituacionMaderaId, OpcionSituacionMadera> = {
  interior: {
    etiqueta: 'Interior calefactado',
    ayuda: 'Seco y estable todo el año. Clase de servicio 1 y clase de uso 1: basta un insecticida superficial.',
    situacion: 'interior',
  },
  interior_humedo: {
    etiqueta: 'Interior húmedo (piscina cubierta)',
    ayuda: 'Humedad ambiental alta con condensaciones ocasionales. Clase de servicio 2 y clase de uso 2.',
    situacion: 'interior_humedo',
  },
  cubierto: {
    etiqueta: 'A cubierto, abierto al exterior o bajo cubierta ventilada',
    ayuda:
      'No se moja, pero respira el aire de fuera. Es el caso habitual de las cubiertas de madera, siempre que estén ventiladas o lleven lámina impermeabilizante; si no, elija la opción siguiente (DB SE-M tabla 3.1, nota 3).',
    situacion: 'cubierto_abierto',
  },
  cubierta_no_ventilada: {
    etiqueta: 'Bajo cubierta no ventilada y sin lámina, o con condensaciones',
    ayuda:
      'El DB SE-M manda a clase de uso 3.1 la madera de cubiertas no ventiladas sin lámina impermeabilizante, y la de interiores con puntos de condensación que el diseño no evita. El tratamiento sube a NP2.',
    situacion: 'cubierta_no_ventilada',
  },
  exterior_protegido: {
    etiqueta: 'Al exterior, protegido (albardilla, pieza de sacrificio)',
    ayuda: 'Sobre el suelo y con medidas de diseño que impiden la exposición directa. Clase de uso 3.1.',
    situacion: 'exterior_protegido',
  },
  exterior: {
    etiqueta: 'Al exterior, sin proteger',
    ayuda: 'Se moja y se seca. Clase de servicio 3 y clase de uso 3.2: el tratamiento pasa a autoclave.',
    situacion: 'exterior_descubierto',
  },
  suelo: {
    etiqueta: 'En contacto con el suelo o con agua dulce',
    ayuda: 'Humedad permanente. Clase de uso 4, el caso más agresivo para la madera.',
    situacion: 'contacto_suelo',
  },
};

export const ORDEN_SITUACIONES_MADERA: SituacionMaderaId[] = [
  'interior',
  'interior_humedo',
  'cubierto',
  'cubierta_no_ventilada',
  'exterior_protegido',
  'exterior',
  'suelo',
];

/**
 * Las clases resistentes salen de `src/data/timberGrades.ts`, el mismo catálogo
 * que usan los módulos de vigas y pilares de madera. Antes había aquí una lista
 * corta escrita a mano (C18/C24/C27/C30) que no coincidía con la del resto de
 * la aplicación: un pilar calculado en C14 no se podía declarar en el cuadro.
 *
 * Allí van todas en un mismo desplegable; aquí el tipo ya está elegido en su
 * propia columna, así que sólo se ofrece el subconjunto que le toca, separado
 * en coníferas (C) y frondosas (D) como en las tablas E.1 y E.2 del DB SE-M.
 */
const clasesDe = (type: TimberType, subtype?: TimberSubtype): string[] =>
  TIMBER_GRADES.filter((g) => g.type === type && (!subtype || g.subtype === subtype)).map(
    (g) => g.id,
  );

export interface TipoMaderaOpcion {
  id: TipoMadera;
  etiqueta: string;
  /** Los optgroup del desplegable. */
  grupos: { etiqueta: string; clases: string[] }[];
  /** Todas las clases del tipo, para validar. */
  clases: string[];
  /** La que se adopta al cambiar de tipo si la anterior no existe en el nuevo. */
  porDefecto: string;
}

const tipoMadera = (
  id: TipoMadera,
  etiqueta: string,
  grupos: { etiqueta: string; clases: string[] }[],
  porDefecto: string,
): TipoMaderaOpcion => ({
  id,
  etiqueta,
  grupos,
  clases: grupos.flatMap((g) => g.clases),
  porDefecto,
});

export const TIPOS_MADERA: TipoMaderaOpcion[] = [
  tipoMadera(
    'maciza',
    'Aserrada',
    [
      { etiqueta: 'Conífera y chopo', clases: clasesDe('sawn', 'softwood') },
      { etiqueta: 'Frondosa', clases: clasesDe('sawn', 'hardwood') },
    ],
    'C24',
  ),
  tipoMadera(
    'laminada',
    'Laminada encolada',
    [{ etiqueta: 'Laminada encolada homogénea', clases: clasesDe('glulam') }],
    'GL24h',
  ),
];

/**
 * DB SE-M tabla D.2: «correspondencias conocidas entre las clases resistentes
 * de la madera laminada encolada y las clases resistentes de la madera aserrada
 * con las que se fabrican las láminas». Son clases C, no T: aquí ponía T14/T18/
 * T22, que es la nomenclatura de láminas traccionadas de la EN 14080 y no lo
 * que declara el DB SE-M. GL30h no figura en la tabla —es explícitamente no
 * exhaustiva— y sale con guion en el cuadro.
 */
export const LAMINAS_POR_GL: Record<string, string> = {
  GL24h: 'C24',
  GL28h: 'C30',
  GL32h: 'C40',
};

/**
 * Las especies que contempla el propio DB SE-M: tabla C.3 del anejo C, la
 * relación de las citadas en la tabla C.1 de asignación de clase resistente.
 * Se guarda el nombre botánico —es la clave de DURABILIDAD_ESPECIES— y se
 * enseña el común, que es como se pide la madera en el almacén.
 *
 * Las cuatro primeras son las clasificables en España por la UNE 56544:2011;
 * el resto entran por la norma de clasificación de su procedencia.
 */
export const ESPECIES: { id: string; etiqueta: string }[] = [
  { id: 'Pinus sylvestris', etiqueta: 'Pino silvestre (Pinus sylvestris)' },
  { id: 'Pinus pinaster', etiqueta: 'Pino pinaster (Pinus pinaster)' },
  { id: 'Pinus radiata', etiqueta: 'Pino insignis (Pinus radiata)' },
  { id: 'Pinus nigra', etiqueta: 'Pino laricio (Pinus nigra)' },
  // Frondosas españolas de la UNE 56546:2013, que la tabla C.3 no recoge
  // porque es posterior. Son las dos únicas con norma de clasificación visual
  // propia en España.
  { id: 'Eucalyptus globulus', etiqueta: 'Eucalipto (Eucalyptus globulus)' },
  { id: 'Castanea sativa', etiqueta: 'Castaño (Castanea sativa)' },
  { id: 'Picea abies', etiqueta: 'Falso abeto o abeto rojo (Picea abies)' },
  { id: 'Abies alba', etiqueta: 'Abeto (Abies alba)' },
  { id: 'Pseudotsuga menziesii', etiqueta: 'Pino Oregón (Pseudotsuga menziesii)' },
  { id: 'Populus sp.', etiqueta: 'Chopo (Populus sp.)' },
  { id: 'Milicia excelsa', etiqueta: 'Iroko (Milicia excelsa)' },
  { id: 'Eucalyptus marginata', etiqueta: 'Jarrah (Eucalyptus marginata)' },
  { id: 'Tectona grandis', etiqueta: 'Teca (Tectona grandis)' },
];

export interface PresetMadera {
  situacion: SituacionMaderaId;
  tipo: TipoMadera;
  claseResistente: string;
  especie: string;
}

export const PRESETS_MADERA: Record<string, PresetMadera> = {
  'Vigas y pilares': {
    situacion: 'cubierto',
    tipo: 'laminada',
    claseResistente: 'GL24h',
    especie: 'Pinus sylvestris',
  },
  'Correas y riostras': {
    situacion: 'cubierto',
    tipo: 'maciza',
    claseResistente: 'C24',
    especie: 'Pinus pinaster',
  },
  'Viguetas de forjado': {
    situacion: 'interior',
    tipo: 'maciza',
    claseResistente: 'C24',
    especie: 'Pinus sylvestris',
  },
  'Pérgola / exterior': {
    situacion: 'exterior',
    tipo: 'maciza',
    claseResistente: 'C24',
    especie: 'Pinus pinaster',
  },
};

// ── Acero estructural ───────────────────────────────────────────────────────

export const NIVEL_RIESGO_OPCIONES = [
  { id: 'CC1', etiqueta: 'CC1 — poca gente cerca: naves, almacenes' },
  { id: 'CC2', etiqueta: 'CC2 — edificios normales: viviendas, oficinas' },
  { id: 'CC3', etiqueta: 'CC3 — mucha ocupación: auditorios, hospitales' },
] as const;

/** CE 91.2.2.1. */
export const CATEGORIA_USO_OPCIONES = [
  { id: 'SC1', etiqueta: 'SC1 — cargas casi estáticas (edificación)' },
  {
    id: 'SC2',
    etiqueta: 'SC2 — fatiga o vibraciones (puentes grúa, maquinaria) o uniones con ductilidad sísmica',
  },
] as const;

/**
 * CE 91.2.2.2. Ojo: PC2 no es sólo «soldar en obra». Soldar acero S355 o
 * superior es PC2 aunque se haga en taller, y eso el motor lo comprueba solo
 * con el acero del perfil y las uniones de las filas (`deriveAcero`).
 */
export const CATEGORIA_EJECUCION_OPCIONES = [
  { id: 'PC1', etiqueta: 'PC1 — sin soldaduras, o soldadas en taller con acero por debajo de S355' },
  {
    id: 'PC2',
    etiqueta: 'PC2 — soldadura en S355 o superior, en obra de elementos principales, tratamiento térmico o huecos con boca de lobo',
  },
] as const;

/**
 * DB SI 6, tabla 3.1: la resistencia al fuego exigida a la estructura depende
 * del uso y de la altura de evacuación, y la fija el proyecto de incendios. El
 * cuadro sólo la imprime si se ha indicado; antes decía «R30» en toda obra.
 */
export const RESISTENCIA_FUEGO_OPCIONES = [30, 60, 90, 120, 180, 240] as const;

/** CE tabla 27.1.b, resumida para el desplegable: lo dice el informe geotécnico. */
export const TERRENO_OPCIONES = [
  { id: 'ninguna', etiqueta: 'Terreno no agresivo' },
  { id: 'debil', etiqueta: 'Terreno débilmente agresivo (XA1)' },
  { id: 'moderada', etiqueta: 'Terreno moderadamente agresivo (XA2)' },
  { id: 'alta', etiqueta: 'Terreno altamente agresivo (XA3)' },
] as const;

/**
 * CE tabla 43.4.1 en lenguaje de obra. «Otros casos», que es el literal de la
 * norma, no le dice nada a quien rellena el perfil; el margen sí.
 */
export const CONTROL_EJECUCION_OPCIONES = [
  { id: 'normal', etiqueta: 'Normal, obra corriente (+10 mm de recubrimiento)' },
  { id: 'in_situ_intenso', etiqueta: 'In situ con control intenso (+5 mm)' },
  { id: 'prefabricado_intenso', etiqueta: 'Prefabricado con control intenso (+0 mm)' },
] as const;

export const CORROSIVIDAD_OPCIONES = [
  { id: 'C1', etiqueta: 'C1 — interior seco y limpio' },
  { id: 'C2', etiqueta: 'C2 — interior sin calefacción, rural' },
  { id: 'C3', etiqueta: 'C3 — urbano o industrial, costa poco salina' },
  { id: 'C4', etiqueta: 'C4 — industrial o costero, salinidad moderada' },
  { id: 'C5', etiqueta: 'C5 — junto al mar o industria agresiva' },
] as const;

/** Lo que se suele prescribir para cada clase de corrosividad. Es un default, no norma. */
export const PROTECCION_SUGERIDA: Record<string, { proteccion: 'pintura' | 'galvanizado'; detalle: string }> = {
  C1: { proteccion: 'pintura', detalle: 'Doble capa' },
  C2: { proteccion: 'pintura', detalle: 'Doble capa' },
  C3: { proteccion: 'galvanizado', detalle: 'En fábrica' },
  C4: { proteccion: 'galvanizado', detalle: 'En fábrica' },
  C5: { proteccion: 'galvanizado', detalle: 'Dúplex: galvanizado + pintura' },
};

export const EXPLICACION_EXC: Record<number, string> = {
  1: 'EXC1: control mínimo, sólo para elementos de poca responsabilidad.',
  2: 'EXC2 es la habitual en edificación: control estándar de soldaduras y tolerancias. Va al plano y al pliego.',
  3: 'EXC3: control reforzado — ensayos no destructivos de soldaduras y trazabilidad completa.',
  4: 'EXC4: el máximo, reservado a estructuras singulares.',
};
