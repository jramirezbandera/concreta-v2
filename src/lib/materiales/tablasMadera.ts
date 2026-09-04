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
  // DB SE-M tabla 3.1, nota (3): «Los elementos situados en cubiertas
  // ventiladas se asignarán a la clase 2. En cubiertas no ventiladas, se
  // asignarán a la clase 3.1, salvo que se incorpore una lámina de
  // impermeabilización, en cuyo caso se asignarán a la clase 2. Asimismo, se
  // considerarán de clase 3.1 aquellos casos en los que en el interior de
  // edificaciones exista riesgo de generación de puntos de condensación no
  // evitables mediante medidas de diseño y evacuación de vapor de agua». La
  // clase de servicio sigue siendo la 2: el elemento está a cubierto.
  cubierta_no_ventilada: {
    claseServicio: 2,
    claseUso: '3.1',
    etiqueta:
      'Bajo cubierta no ventilada sin lámina impermeabilizante, o interior con condensaciones no evitables',
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

/**
 * Fuente: UNE-EN 350-2:1995, tal como la reproduce el anexo I de «Madera en el
 * exterior: tratamientos y conservación» (AITIM / ADEPAP, 2024) y la ficha de
 * especie del Grupo Gámiz para el radiata. La norma no está en local, así que
 * cada fila dice de dónde sale. Silvestre y pinaster coinciden además con el
 * cuadro de durabilidad del estudio, salvo la impregnabilidad del duramen del
 * silvestre, que el cuadro escribe «4» y la norma da «3-4».
 *
 * El laricio no aparece en esas tablas: sus valores vienen de la ficha de AEIM
 * («medianamente durable a poco durable»; albura impregnable, duramen no
 * impregnable), traducida a las clases de la EN 350-2. Es la fila menos
 * respaldada de las cuatro.
 */
export const DURABILIDAD_ESPECIES: Record<string, DurabilidadEspecie> = {
  'Pinus sylvestris': {
    nombre: 'Pino silvestre',
    botanico: 'Pinus sylvestris L.',
    durabilidadDuramen: '3-4',
    impregnabilidadAlbura: '1',
    impregnabilidadDuramen: '3-4',
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
    impregnabilidadDuramen: '2-3',
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
 * UNE-EN 460:1995, tabla 2 — clase de durabilidad natural del duramen que
 * basta, sin tratamiento, para cada clase de uso. Es el número que el cuadro
 * de durabilidad llama «EXIGIDA»: si la durabilidad natural de la especie es
 * igual o menor (más durable) que este valor, no hace falta tratar.
 *
 * La tabla de la norma cruza clase de uso con clase de durabilidad y marca
 * cada casilla con «o» (basta), «(o)» (basta en general), «(o)-(x)» (puede
 * bastar según especie y uso), «(x)» (tratamiento aconsejable) o «x»
 * (tratamiento necesario). Aquí se toma como suficiente hasta «(o)», que es
 * la lectura del cuadro del estudio para las clases 1 y 2 (ambas → 5):
 *
 *   uso 1 → 5 · uso 2 → 5 · uso 3 → 3 · uso 4 → 2 · uso 5 → 1
 *
 * Las de las clases 3, 4 y 5 no se han podido cotejar con la norma en papel
 * (ni la EN 460 ni la EN 350:2016 que la sustituye están en local); antes
 * decían 4, 2 y 2, que daban por suficiente una madera «poco durable» al
 * exterior y una «durable» en agua salada, y eso la tabla no lo dice.
 */
export const DURABILIDAD_EXIGIDA_EN460: Record<ClaseUso, number> = {
  '1': 5,
  '2': 5,
  '3.1': 3,
  '3.2': 3,
  '4': 2,
  '5': 1,
};

// ── DB SE-M anejo C — asignación de clase resistente a la madera aserrada ────

/**
 * Tabla C.1 del DB SE-M, íntegra. Da la vuelta a lo que uno espera: no dice qué
 * clase alcanza una calidad, sino qué CALIDAD hace falta para llegar a una clase
 * resistente, para una especie y una procedencia concretas.
 *
 * Por eso está aquí: la calidad de un cuadro de materiales no es un dato que se
 * teclee —antes se escribía «ME-1» fijo en todas las filas—, sino la consecuencia
 * de haber calculado la pieza en, pongamos, C27. Y al revés: hay combinaciones
 * que sencillamente no existen. Un pino silvestre español clasificado visualmente
 * no pasa de C27; pedirle C30 obliga a otra procedencia o a clasificación
 * mecánica, y eso hay que decirlo en el cuadro y no descubrirlo en obra.
 *
 * La tabla es «informativa y no exhaustiva» según el propio DB, y es una
 * selección de la UNE-EN 1912:2012 y la UNE 56544:2011.
 */
export interface AsignacionClaseResistente {
  norma: string;
  /** Nombre botánico, la misma clave que DURABILIDAD_ESPECIES. */
  especie: string;
  procedencia: string;
  /** Clase resistente → calidad visual que la produce. */
  clases: Record<string, string>;
}

export const ASIGNACION_CLASE_RESISTENTE: AsignacionClaseResistente[] = [
  // UNE 56544:2011 — coníferas españolas. ME = Madera Estructural; MEG, gruesa
  // escuadría (b > 70 mm), que es una calidad aparte y no una ME-1 de más canto.
  { norma: 'UNE 56544:2011', especie: 'Pinus sylvestris', procedencia: 'España',
    clases: { C18: 'ME-2', C22: 'MEG', C27: 'ME-1' } },
  { norma: 'UNE 56544:2011', especie: 'Pinus pinaster', procedencia: 'España',
    clases: { C18: 'ME-2', C24: 'ME-1' } },
  { norma: 'UNE 56544:2011', especie: 'Pinus radiata', procedencia: 'España',
    clases: { C18: 'ME-2', C24: 'ME-1' } },
  { norma: 'UNE 56544:2011', especie: 'Pinus nigra', procedencia: 'España',
    clases: { C18: 'ME-2', C22: 'MEG', C30: 'ME-1' } },

  // NF B 52.001-4 — Francia.
  { norma: 'NF B 52.001-4', especie: 'Abies alba', procedencia: 'Francia',
    clases: { C22: 'ST-III', C24: 'ST-II', C30: 'ST-I' } },
  { norma: 'NF B 52.001-4', especie: 'Picea abies', procedencia: 'Francia',
    clases: { C22: 'ST-III', C24: 'ST-II', C30: 'ST-I' } },
  { norma: 'NF B 52.001-4', especie: 'Pseudotsuga menziesii', procedencia: 'Francia',
    clases: { C22: 'ST-III', C24: 'ST-II' } },
  { norma: 'NF B 52.001-4', especie: 'Pinus pinaster', procedencia: 'Francia',
    clases: { C18: 'ST-III', C24: 'ST-II' } },

  // DIN 4074 — Europa Central, Norte y Este.
  { norma: 'DIN 4074', especie: 'Abies alba', procedencia: 'Europa: Central, N y E',
    clases: { C16: 'S7', C24: 'S10', C30: 'S13' } },
  { norma: 'DIN 4074', especie: 'Picea abies', procedencia: 'Europa: Central, N y E',
    clases: { C16: 'S7', C24: 'S10', C30: 'S13' } },
  { norma: 'DIN 4074', especie: 'Pinus sylvestris', procedencia: 'Europa: Central, N y E',
    clases: { C16: 'S7', C24: 'S10', C30: 'S13' } },

  // INSTA 142 — Europa Norte y Nordeste.
  { norma: 'INSTA 142', especie: 'Abies alba', procedencia: 'Europa: N y NE',
    clases: { C14: 'T0', C18: 'T1', C24: 'T2', C30: 'T3' } },
  { norma: 'INSTA 142', especie: 'Picea abies', procedencia: 'Europa: N y NE',
    clases: { C14: 'T0', C18: 'T1', C24: 'T2', C30: 'T3' } },
  { norma: 'INSTA 142', especie: 'Pinus sylvestris', procedencia: 'Europa: N y NE',
    clases: { C14: 'T0', C18: 'T1', C24: 'T2', C30: 'T3' } },

  // BS 4978 — Reino Unido.
  { norma: 'BS 4978', especie: 'Abies alba', procedencia: 'Reino Unido',
    clases: { C16: 'GS', C24: 'SS' } },
  { norma: 'BS 4978', especie: 'Pinus sylvestris', procedencia: 'Reino Unido',
    clases: { C16: 'GS', C24: 'SS' } },

  // BS 5756 — frondosas tropicales.
  { norma: 'BS 5756', especie: 'Milicia excelsa', procedencia: 'África',
    clases: { D40: 'HS' } },
  { norma: 'BS 5756', especie: 'Eucalyptus marginata', procedencia: 'Australia',
    clases: { D40: 'HS' } },
  { norma: 'BS 5756', especie: 'Tectona grandis', procedencia: 'África y Asia SE',
    clases: { D40: 'HS' } },
];

/**
 * UNE 56546:2013 §7 — las calidades de las dos frondosas estructurales
 * españolas. La norma las define y tabula sus valores característicos (anejo A),
 * pero la asignación de clase resistente la hace la UNE-EN 1912 y NO figura en
 * la tabla C.1 del DB SE-M. Se guarda lo que sí está establecido —el nombre de
 * la calidad y su límite de escuadría— y el motor dice que la clase hay que
 * tomarla de la UNE-EN 1912.
 */
export const CALIDADES_FRONDOSA_ESPANOLA: Record<string, { calidad: string; alcance: string }[]> = {
  'Eucalyptus globulus': [{ calidad: 'MEF', alcance: 'secciones b ≤ 60 mm y h ≤ 200 mm' }],
  'Castanea sativa': [
    { calidad: 'MEF', alcance: 'pequeña escuadría, b ≤ 70 mm' },
    { calidad: 'MEF-G', alcance: 'gran escuadría, b > 70 mm; sección ≤ 140 × 140 mm' },
  ],
};

/** Lo que sale de buscar una especie y una clase resistente en la tabla C.1. */
export interface CalidadVisual {
  /** La calidad si la pareja existe con procedencia española. */
  calidad?: string;
  norma?: string;
  procedencia?: string;
  /**
   * Cuando la pareja exacta no existe pero la misma especie y procedencia sí
   * alcanzan una clase superior: la calidad que la da. Pedir C24 a un pino
   * silvestre español se resuelve con ME-1, que es C27 y la cubre.
   */
  superior?: { clase: string; calidad: string; norma: string; procedencia: string };
  /** Otras procedencias que sí alcanzan esa clase, para poder sugerirlas. */
  alternativas: { norma: string; procedencia: string; calidad: string }[];
  /** Las clases que la especie sí alcanza en España, para el mensaje de error. */
  clasesEnEspana: string[];
  /** La especie no está en la tabla: no se puede decir nada. */
  desconocida: boolean;
}

/** «C24» → { letra: 'C', n: 24 }. Sólo aserrada: coníferas (C) y frondosas (D). */
function numeroClase(clase: string): { letra: string; n: number } | null {
  const m = /^([CD])(\d+)$/.exec(clase);
  return m ? { letra: m[1], n: Number(m[2]) } : null;
}

export function calidadVisual(especie: string, claseResistente: string): CalidadVisual {
  const filas = ASIGNACION_CLASE_RESISTENTE.filter((f) => f.especie === especie);
  if (filas.length === 0) {
    return { alternativas: [], clasesEnEspana: [], desconocida: true };
  }

  // España primero: es la procedencia por defecto de una obra española. Si la
  // especie no se clasifica aquí (el iroko, la teca), vale su única fila.
  const nacional = filas.find((f) => f.procedencia === 'España');
  const preferida = nacional ?? (filas.length === 1 ? filas[0] : undefined);

  const alternativas = filas
    .filter((f) => f !== preferida && f.clases[claseResistente])
    .map((f) => ({ norma: f.norma, procedencia: f.procedencia, calidad: f.clases[claseResistente] }));

  const calidad = preferida?.clases[claseResistente];

  // Sin pareja exacta, la clase tabulada inmediatamente superior de la misma
  // fila cubre la pedida (misma letra: una C no se cubre con una D).
  let superior: CalidadVisual['superior'];
  const pedida = numeroClase(claseResistente);
  if (!calidad && preferida && pedida) {
    const candidata = Object.entries(preferida.clases)
      .map(([clase, cal]) => ({ clase, calidad: cal, n: numeroClase(clase) }))
      .filter((c) => c.n !== null && c.n.letra === pedida.letra && c.n.n > pedida.n)
      .sort((a, b) => a.n!.n - b.n!.n)[0];
    if (candidata) {
      superior = {
        clase: candidata.clase,
        calidad: candidata.calidad,
        norma: preferida.norma,
        procedencia: preferida.procedencia,
      };
    }
  }

  return {
    calidad,
    norma: calidad ? preferida?.norma : undefined,
    procedencia: calidad ? preferida?.procedencia : undefined,
    superior,
    alternativas,
    clasesEnEspana: preferida ? Object.keys(preferida.clases) : [],
    desconocida: false,
  };
}
