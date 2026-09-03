/**
 * Tablas del CTE DB SE-M (Madera), transcritas del Documento Básico vigente.
 *
 * Ojo con la frontera: el DB SE-M **no** publica la durabilidad natural ni la
 * impregnabilidad por especie — remite a UNE-EN 350 y UNE-EN 460 (apartado
 * 3.2.3.5). Esos datos viven aquí en un bloque aparte y marcado, porque su
 * fuente no es el DB y no puede citarse como si lo fuera en una memoria.
 */

import type { ClaseServicio, ClaseUso, SituacionMadera, TipoMadera } from './types';

// ── DB SE-M tabla 2.3 — coeficientes parciales de seguridad del material ────

/** Situaciones persistentes y transitorias. */
export const GAMMA_M_MADERA: Record<TipoMadera, number> = {
  maciza: 1.3,
  laminada: 1.25,
  microlaminada: 1.2,
  tablero_contrachapado: 1.2,
  tablero_virutas: 1.2,
  tablero_particulas: 1.3,
  tablero_fibras: 1.3,
};

/** DB SE-M tabla 2.3 — uniones y placas clavo, para el bloque de herrajes. */
export const GAMMA_M_UNIONES = 1.3;
export const GAMMA_M_PLACAS_CLAVO = 1.25;

/** DB SE-M tabla 2.3, última fila: situaciones extraordinarias (incendio incluido). */
export const GAMMA_M_EXTRAORDINARIA = 1.0;

export const ETIQUETA_TIPO_MADERA: Record<TipoMadera, string> = {
  maciza: 'Madera maciza (aserrada)',
  laminada: 'Madera laminada encolada',
  microlaminada: 'Madera microlaminada',
  tablero_contrachapado: 'Tablero contrachapado',
  tablero_virutas: 'Tablero de virutas orientadas',
  tablero_particulas: 'Tablero de partículas',
  tablero_fibras: 'Tablero de fibras',
};

// ── DB SE-M 2.2.2.2 — clases de servicio ────────────────────────────────────

export const DESCRIPCION_CLASE_SERVICIO: Record<ClaseServicio, string> = {
  1: 'Humedad del aire que sólo excede el 65 % unas pocas semanas al año (a 20 ± 2 °C). Humedad de equilibrio media que no excede el 12 %: estructuras en ambiente interior.',
  2: 'Humedad del aire que sólo excede el 85 % unas pocas semanas al año (a 20 ± 2 °C). Humedad de equilibrio media que no excede el 20 %: estructuras a cubierto pero abiertas al exterior, y piscinas cubiertas.',
  3: 'Condiciones que conducen a humedad superior a la de la clase 2. Humedad de equilibrio media que excede el 20 %: estructuras al exterior sin cubrir.',
};

// ── DB SE-M 3.2.1.2 — clases de uso ─────────────────────────────────────────

export const DESCRIPCION_CLASE_USO: Record<ClaseUso, string> = {
  '1': 'A cubierto, protegido de la intemperie y no expuesto a la humedad; contenido de humedad menor que el 20 %. Ejemplo: vigas o pilares en el interior de edificios.',
  '2': 'A cubierto y protegido de la intemperie, pero con contenido de humedad ocasionalmente mayor que el 20 %. Ejemplo: estructura de una piscina cubierta.',
  '3.1': 'Al exterior, por encima del suelo y protegido por medidas de diseño (albardilla, piezas de sacrificio); la humedad puede superar ocasionalmente el 20 %.',
  '3.2': 'Al exterior, por encima del suelo y no protegido; la humedad supera frecuentemente el 20 %.',
  '4': 'En contacto con el suelo o con agua dulce; la humedad supera permanentemente el 20 %.',
  '5': 'Permanentemente en contacto con agua salada.',
};

// ── DB SE-M tabla 3.1 — elección del tipo de protección ─────────────────────

export interface ProteccionMadera {
  /** Nivel de penetración según UNE-EN 351-1:2008. */
  nivel: string;
  exigencia: string;
  /** Nota al pie de la tabla 3.1 que aplica a esa clase de uso. */
  nota?: string;
}

export const PROTECCION_POR_CLASE_USO: Record<ClaseUso, ProteccionMadera> = {
  '1': {
    nivel: 'NP1',
    exigencia: 'Sin exigencias específicas. Todas las caras tratadas.',
    nota: 'Se recomienda un tratamiento superficial con un producto insecticida.',
  },
  '2': {
    nivel: 'NP1',
    exigencia: 'Sin exigencias específicas. Todas las caras tratadas.',
    nota: 'El elemento de madera deberá recibir un tratamiento superficial con un producto insecticida y fungicida.',
  },
  '3.1': {
    nivel: 'NP2',
    exigencia: 'Al menos 3 mm en la albura de todas las caras de la pieza.',
  },
  '3.2': {
    nivel: 'NP3',
    exigencia: 'Al menos 6 mm en la albura de todas las caras de la pieza. Todas las caras tratadas.',
    nota: 'Las maderas no durables naturalmente deberán ser impregnables (clase 1 de UNE-EN 350:2016).',
  },
  '4': {
    nivel: 'NP4 / NP5',
    exigencia:
      'NP4: al menos 25 mm en todas las caras (sólo madera de sección circular). NP5: penetración total en la albura, todas las caras tratadas.',
    nota: 'Las maderas no durables naturalmente deberán ser impregnables (clase 1 de UNE-EN 350:2016).',
  },
  '5': {
    nivel: 'NP6',
    exigencia: 'Penetración total en la albura y al menos 6 mm en la madera de duramen expuesta.',
    nota: 'Las maderas no durables naturalmente deberán ser impregnables (clase 1 de UNE-EN 350:2016).',
  },
};

// ── DB SE-M tabla 3.2 — protección mínima frente a la corrosión de herrajes ─

export const PROTECCION_HERRAJES: Record<ClaseServicio, string> = {
  1: 'Ninguna (salvo grapas y placas dentadas: Fe/Zn 12c).',
  2: 'Fe/Zn 12c en clavos y tirafondos d ≤ 4 mm, grapas, placas dentadas y chapas ≤ 3 mm.',
  3: 'Fe/Zn 25c en general; acero inoxidable en grapas y placas dentadas.',
};

// ── Derivación de la situación de obra ──────────────────────────────────────

/**
 * De la pregunta de obra salen a la vez la clase de servicio (DB SE-M 2.2.2.2,
 * que gobierna kmod y kdef) y la clase de uso (DB SE-M 3.2.1.2, que gobierna el
 * tratamiento). Son conceptos distintos y el cuadro real lleva los dos.
 */
export const SITUACION_MADERA: Record<
  SituacionMadera,
  { claseServicio: ClaseServicio; claseUso: ClaseUso; etiqueta: string }
> = {
  interior: {
    claseServicio: 1,
    claseUso: '1',
    etiqueta: 'Interior de edificio, protegido de la intemperie',
  },
  interior_humedo: {
    claseServicio: 2,
    claseUso: '2',
    etiqueta: 'Interior con humedad elevada o condensaciones ocasionales (piscina cubierta)',
  },
  cubierto_abierto: {
    claseServicio: 2,
    claseUso: '2',
    etiqueta: 'A cubierto pero abierto al exterior (cobertizo, visera)',
  },
  exterior_protegido: {
    claseServicio: 3,
    claseUso: '3.1',
    etiqueta: 'Al exterior, sobre el suelo, protegido por albardilla o piezas de sacrificio',
  },
  exterior_descubierto: {
    claseServicio: 3,
    claseUso: '3.2',
    etiqueta: 'Al exterior, sobre el suelo y sin proteger',
  },
  contacto_suelo: {
    claseServicio: 3,
    claseUso: '4',
    etiqueta: 'En contacto con el suelo o con agua dulce',
  },
  agua_salada: {
    claseServicio: 3,
    claseUso: '5',
    etiqueta: 'Permanentemente en contacto con agua salada',
  },
};

// ── FUERA DEL DB SE-M: UNE-EN 350 y UNE-EN 460 ──────────────────────────────
// El DB SE-M 3.2.3 remite a estas normas sin transcribirlas. Los cuadros de
// durabilidad de un plano las necesitan, así que van aquí, separadas y
// etiquetadas: en la memoria se citan como UNE-EN, nunca como DB SE-M.

export interface DurabilidadEspecie {
  /** Nombre comercial. */
  nombre: string;
  /** Nombre botánico. */
  botanico: string;
  /** Durabilidad natural del duramen frente a hongos, UNE-EN 350-2 (1 = muy durable … 5 = no durable). */
  durabilidadDuramen: string;
  /** Impregnabilidad UNE-EN 350-2 (1 = impregnable … 4 = no impregnable). */
  impregnabilidadAlbura: string;
  impregnabilidadDuramen: string;
}

export const DURABILIDAD_ESPECIES: Record<string, DurabilidadEspecie> = {
  'Pinus sylvestris': {
    nombre: 'Pino silvestre',
    botanico: 'Pinus sylvestris L.',
    durabilidadDuramen: '3-4',
    impregnabilidadAlbura: '1',
    impregnabilidadDuramen: '4',
  },
  'Pinus pinaster': {
    nombre: 'Pino pinaster',
    botanico: 'Pinus pinaster Ait.',
    durabilidadDuramen: '3-4',
    impregnabilidadAlbura: '1',
    impregnabilidadDuramen: '4',
  },
  'Pinus radiata': {
    nombre: 'Pino insignis',
    botanico: 'Pinus radiata D. Don.',
    durabilidadDuramen: '4-5',
    impregnabilidadAlbura: '1',
    impregnabilidadDuramen: '2',
  },
  'Pinus nigra': {
    nombre: 'Pino laricio',
    botanico: 'Pinus nigra Arnold.',
    durabilidadDuramen: '3-4',
    impregnabilidadAlbura: '1',
    impregnabilidadDuramen: '4',
  },
};

/**
 * UNE-EN 460:1995 — clase de durabilidad natural suficiente, sin tratamiento,
 * para cada clase de uso. Es el número que el cuadro de durabilidad llama
 * «EXIGIDA»: si la durabilidad natural de la especie es igual o menor (más
 * durable) que este valor, no hace falta tratamiento por durabilidad.
 */
export const DURABILIDAD_EXIGIDA_EN460: Record<ClaseUso, number> = {
  '1': 5,
  '2': 5,
  '3.1': 4,
  '3.2': 4,
  '4': 2,
  '5': 2,
};
