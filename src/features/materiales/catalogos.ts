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
  'Forjados': { situacion: 'interior_seco', consistencia: 'fluida', fck: 30 },
  'Pilares': { situacion: 'interior_seco', consistencia: 'fluida', fck: 30 },
  'Vigas': { situacion: 'interior_seco', consistencia: 'fluida', fck: 30 },
  'Losa de escalera': { situacion: 'interior_seco', consistencia: 'fluida', fck: 30 },
  'Vaso de piscina': { situacion: 'piscina', consistencia: 'fluida', fck: 30 },
  'Aljibe / depósito de agua': { situacion: 'deposito', consistencia: 'fluida', fck: 30 },
  'Losa de aparcamiento': { situacion: 'aparcamiento', consistencia: 'fluida', fck: 30 },
  'Estructura exterior (intemperie)': { situacion: 'exterior_lluvia', consistencia: 'blanda', fck: 30 },
  'Hormigón de limpieza': { situacion: 'limpieza', consistencia: 'blanda', fck: 15 },
};

/** Resistencias que ofrece el desplegable. La durabilidad puede subirla sola. */
export const FCK_OPCIONES = [25, 30, 35, 40];

export const CONSISTENCIA_OPCIONES: { id: Consistencia; etiqueta: string }[] = [
  { id: 'blanda', etiqueta: 'Blanda' },
  { id: 'fluida', etiqueta: 'Fluida' },
];

// ── Madera ──────────────────────────────────────────────────────────────────

export type SituacionMaderaId =
  | 'interior'
  | 'interior_humedo'
  | 'cubierto'
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
    etiqueta: 'A cubierto, abierto al exterior (cobertizo, visera)',
    ayuda: 'No se moja, pero respira el aire de fuera. Es el caso habitual de las cubiertas de madera.',
    situacion: 'cubierto_abierto',
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
  'exterior_protegido',
  'exterior',
  'suelo',
];

export const TIPOS_MADERA: { id: TipoMadera; etiqueta: string; clases: string[] }[] = [
  { id: 'maciza', etiqueta: 'Aserrada', clases: ['C18', 'C24', 'C27', 'C30'] },
  { id: 'laminada', etiqueta: 'Laminada encolada', clases: ['GL24h', 'GL28h', 'GL32h'] },
];

/** DB SE-M Anejo D: la clase resistente de las láminas que sostiene cada GL. */
export const LAMINAS_POR_GL: Record<string, string> = {
  GL24h: 'T14',
  GL28h: 'T18',
  GL32h: 'T22',
};

export const ESPECIES = ['Pinus sylvestris', 'Pinus pinaster', 'Pinus radiata', 'Pinus nigra'];

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

export const CATEGORIA_USO_OPCIONES = [
  { id: 'SC1', etiqueta: 'SC1 — cargas tranquilas (edificación)' },
  { id: 'SC2', etiqueta: 'SC2 — fatiga: puentes grúa, vibraciones' },
] as const;

export const CATEGORIA_EJECUCION_OPCIONES = [
  { id: 'PC1', etiqueta: 'PC1 — sin soldadura estructural en obra' },
  { id: 'PC2', etiqueta: 'PC2 — con soldadura estructural en obra' },
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
