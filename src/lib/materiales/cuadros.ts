/**
 * Del estado derivado a los cuadros.
 *
 * `Block[]` es la frontera testeable del capítulo Memorias: un array plano de
 * bloques que luego pintan tres renderers distintos (React en vivo, .docx y
 * .pdf) sin que ninguno tenga que volver a decidir qué dice el documento. Aquí
 * sólo se compone y se formatea; los números ya vienen resueltos de `derive.ts`.
 *
 * El mismo estado produce DOS cuadros de hormigón: el de PLANO (una fila por
 * localización) y el de MEMORIA (transpuesto, una fila por propiedad). Son los
 * dos formatos que aparecen en los proyectos reales del estudio.
 *
 * Nota de ubicación: cuando exista el módulo de la ficha DB SE, el tipo `Block`
 * se moverá a `src/lib/memoria/model.ts` y este fichero lo importará. Vive aquí
 * porque el cuadro de materiales es el primer módulo que lo necesita.
 */

import { NOTAS_ANCLAJE, tablaAnclajes } from './anclajes';
import {
  CONSISTENCIAS,
  FYK_ACERO_PASIVO,
  FYK_MALLA,
  FY_ACERO_ESTRUCTURAL,
  GAMMA_MATERIALES,
} from './tablasCE';
import {
  DURABILIDAD_ESPECIES,
  DURABILIDAD_EXIGIDA_EN460,
  ETIQUETA_TIPO_MADERA,
  GAMMA_M_EXTRAORDINARIA,
  GAMMA_M_MADERA,
} from './tablasMadera';
import type {
  DerivacionAcero,
  DerivacionHormigon,
  DerivacionMadera,
  MallaElectrosoldada,
  NivelControlHormigon,
  AceroEstructural,
  AceroPasivo,
} from './types';

// ── Modelo de bloques ───────────────────────────────────────────────────────

export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'kvTable'; caption?: string; rows: [string, string][] }
  | { kind: 'table'; caption?: string; head: string[]; rows: string[][] }
  | { kind: 'notes'; items: string[] };

// ── Formato ─────────────────────────────────────────────────────────────────

/** Números a la española: coma decimal. */
export function num(valor: number, decimales = 0): string {
  return valor.toFixed(decimales).replace('.', ',');
}

const GUION = '-';

const ETIQUETA_NIVEL_CONTROL: Record<NivelControlHormigon, string> = {
  estadistico: 'Estadístico',
  indirecto: 'Indirecto',
  '100_por_100': '100 por 100',
};

/** «1,5/1,3»: persistente/accidental, como lo rotula el estudio. */
function gammaDoble(g: { persistente: number; accidental: number }, decimales = 1): string {
  return `${num(g.persistente, decimales)}/${num(g.accidental, decimales)}`;
}

/** (*), (**), (***)… en orden de aparición. */
function marcador(indice: number): string {
  return `(${'*'.repeat(indice + 1)})`;
}

/**
 * La celda del recubrimiento. Guion tanto para el hormigón en masa (0, no hay
 * armadura) como para el recubrimiento indeterminado (`null`, la norma no lo
 * tabula): en el segundo caso la nota que lo explica va pegada a esta celda.
 */
function recubrimiento(cnom: number | null, unidad = ' mm'): string {
  return cnom !== null && cnom > 0 ? `${cnom}${unidad}` : GUION;
}

/**
 * Recoge las notas de todos los elementos, les asigna marcador y devuelve un
 * buscador por elemento y columna. Dos elementos con la misma nota comparten
 * marcador, que es como se hace en un plano.
 */
function recopilarNotas(derivaciones: DerivacionHormigon[]) {
  const textos: string[] = [];
  const porElemento = new Map<string, { localizacion: string; recubrimiento: string }>();

  for (const d of derivaciones) {
    const marcas = { localizacion: '', recubrimiento: '' };
    for (const nota of d.notas) {
      let i = textos.indexOf(nota.texto);
      if (i === -1) {
        textos.push(nota.texto);
        i = textos.length - 1;
      }
      marcas[nota.columna] += ` ${marcador(i)}`;
    }
    porElemento.set(d.elemento.id, marcas);
  }

  return {
    items: textos.map((t, i) => `${marcador(i)} ${t}`),
    marca: (id: string, columna: 'localizacion' | 'recubrimiento') =>
      porElemento.get(id)?.[columna] ?? '',
  };
}

// ── Cuadro de hormigón para PLANO ───────────────────────────────────────────

export interface FilaLibre {
  /** Filas que no se derivan: el hormigón de limpieza y masa se prescriben tal cual. */
  nombre: string;
  tipificacion: string;
  /** Texto de la columna «Nivel de control». */
  nivelControl: string;
}

export function cuadroHormigonPlano(
  derivaciones: DerivacionHormigon[],
  filasLibres: FilaLibre[] = [],
): Block[] {
  const notas = recopilarNotas(derivaciones);
  const gammaC = gammaDoble(GAMMA_MATERIALES.hormigon);

  const filas = derivaciones.map((d) => [
    d.elemento.nombre + notas.marca(d.elemento.id, 'localizacion'),
    d.tipificacion,
    `${num(d.fcd, 1)} N/mm²`,
    d.cementoMin !== null ? `${d.cementoMin} kg` : GUION,
    d.acMax !== null ? num(d.acMax, 2) : GUION,
    recubrimiento(d.cnom) + notas.marca(d.elemento.id, 'recubrimiento'),
    ETIQUETA_NIVEL_CONTROL[d.elemento.nivelControl ?? 'estadistico'],
    gammaC,
  ]);

  for (const libre of filasLibres) {
    filas.push([libre.nombre, libre.tipificacion, GUION, GUION, GUION, GUION, libre.nivelControl, '']);
  }

  const blocks: Block[] = [
    { kind: 'heading', level: 2, text: 'HORMIGÓN (CÓDIGO ESTRUCTURAL)' },
    {
      kind: 'table',
      head: [
        'Localización',
        'Tipificación',
        'Resistencia de cálculo',
        'Mín. contenido de cemento',
        'Máx. relación A/C',
        'Valor nominal recubrimientos',
        'Nivel de control',
        'γc',
      ],
      rows: filas,
    },
  ];

  // El encabezado dice «nominal», pero en obra eso se lee como «el
  // recubrimiento» y el margen por control de ejecución queda invisible. Se
  // declara: es la diferencia entre 20 y 30 mm en un XC2 corriente.
  const deltas = [
    ...new Set(derivaciones.filter((d) => d.cnom !== null && d.cnom > 0).map((d) => d.deltaCdev)),
  ];
  if (deltas.length === 1) {
    notas.items.push(
      `Los recubrimientos son NOMINALES: al mínimo exigido por el ambiente se le ha sumado el margen por control de ejecución Δcdev = ${deltas[0]} mm (CE tabla 43.4.1).`,
    );
  }

  if (notas.items.length) blocks.push({ kind: 'notes', items: notas.items });
  return blocks;
}

// ── Cuadro de hormigón para MEMORIA (transpuesto) ───────────────────────────

export function cuadroHormigonMemoria(derivaciones: DerivacionHormigon[]): Block[] {
  const notas = recopilarNotas(derivaciones);

  const propiedades: [string, (d: DerivacionHormigon) => string][] = [
    ['Tipificación', (d) => d.tipificacion],
    ['Resistencia característica fck (N/mm²)', (d) => String(d.fckAdoptada)],
    ['Consistencia', (d) => CONSISTENCIAS[d.elemento.consistencia].etiqueta],
    ['Tamaño máximo del árido (mm)', (d) => String(d.elemento.tamMaxArido)],
    ['Tipo de exposición', (d) => d.clases.join(' + ')],
    ['Contenido mínimo de cemento (kg/m³)', (d) => (d.cementoMin !== null ? String(d.cementoMin) : GUION)],
    ['Máxima relación agua/cemento', (d) => (d.acMax !== null ? num(d.acMax, 2) : GUION)],
    [
      'Recubrimiento nominal de las armaduras (mm)',
      (d) => recubrimiento(d.cnom, '') + notas.marca(d.elemento.id, 'recubrimiento'),
    ],
  ];

  const blocks: Block[] = [
    { kind: 'heading', level: 2, text: 'Elementos de hormigón armado' },
    {
      kind: 'paragraph',
      text: 'En la tabla siguiente se define el hormigón a disponer en los distintos elementos estructurales de la obra:',
    },
    {
      kind: 'table',
      head: [
        'ELEMENTO ESTRUCTURAL',
        ...derivaciones.map((d) => d.elemento.nombre.toUpperCase() + notas.marca(d.elemento.id, 'localizacion')),
      ],
      rows: propiedades.map(([etiqueta, valor]) => [etiqueta, ...derivaciones.map(valor)]),
    },
  ];

  if (notas.items.length) blocks.push({ kind: 'notes', items: notas.items });
  return blocks;
}

// ── Cuadro de aceros ────────────────────────────────────────────────────────

export interface EntradaCuadroAcero {
  aceroPasivo: AceroPasivo;
  malla?: MallaElectrosoldada | null;
  aceroEstructural?: AceroEstructural | null;
  nivelControl?: string;
}

/**
 * Las tres filas del cuadro real: corrugado, mallazo y acero estructural. La
 * resistencia de cálculo se redondea a entero, que es como se rotula:
 * 500/1,15 = 435 y 275/1,05 = 262 N/mm².
 */
export function cuadroAceros(entrada: EntradaCuadroAcero): Block[] {
  const nivelControl = entrada.nivelControl ?? 'Normal';
  const filas: string[][] = [];

  const fyd = (fyk: number, gamma: number) => `${num(Math.round(fyk / gamma))} N/mm²`;

  filas.push([
    'Corrugado para armar',
    etiquetaAceroPasivo(entrada.aceroPasivo),
    fyd(FYK_ACERO_PASIVO[entrada.aceroPasivo], GAMMA_MATERIALES.armaduraPasiva.persistente),
    nivelControl,
    gammaDoble(GAMMA_MATERIALES.armaduraPasiva, 2),
  ]);

  if (entrada.malla) {
    filas.push([
      'Mallazo',
      entrada.malla,
      fyd(FYK_MALLA[entrada.malla], GAMMA_MATERIALES.armaduraPasiva.persistente),
      nivelControl,
      gammaDoble(GAMMA_MATERIALES.armaduraPasiva, 2),
    ]);
  }

  if (entrada.aceroEstructural) {
    filas.push([
      'Acero estructural',
      etiquetaAceroEstructural(entrada.aceroEstructural),
      fyd(FY_ACERO_ESTRUCTURAL[entrada.aceroEstructural], GAMMA_MATERIALES.aceroEstructural.persistente),
      nivelControl,
      gammaDoble(GAMMA_MATERIALES.aceroEstructural, 2),
    ]);
  }

  return [
    { kind: 'heading', level: 2, text: 'ACERO (SEGÚN CÓDIGO ESTRUCTURAL / DB-SE-A)' },
    {
      kind: 'table',
      head: ['Localización', 'Designación', 'Resistencia de cálculo', 'Nivel de control', 'γs'],
      rows: filas,
    },
  ];
}

/** «B500SD» se rotula «B 500 SD» en el cuadro. */
function etiquetaAceroPasivo(acero: AceroPasivo): string {
  const m = /^B(\d{3})(S|SD)$/.exec(acero);
  return m ? `B ${m[1]} ${m[2]}` : acero;
}

/** «S275JR» se rotula «S275 JR». */
function etiquetaAceroEstructural(acero: AceroEstructural): string {
  const m = /^(S\d{3})(\w+)$/.exec(acero);
  return m ? `${m[1]} ${m[2]}` : acero;
}

// ── Bloque de acero estructural (clase de ejecución + elementos) ────────────

export function cuadroAceroEstructural(
  derivacion: DerivacionAcero,
  vidaUtilAnios: number,
): Block[] {
  return [
    {
      kind: 'heading',
      level: 2,
      text: 'ELEMENTOS ESTRUCTURALES DE ACERO: ESPECIFICACIONES SEGÚN «CÓDIGO ESTRUCTURAL»',
    },
    {
      kind: 'kvTable',
      rows: [
        ['Vida útil nominal del edificio', `${vidaUtilAnios} AÑOS`],
        ['Nivel de riesgo', derivacion.nivelRiesgo],
        ['Categoría de uso', derivacion.categoriaUso],
        ['Categoría de ejecución', derivacion.categoriaEjecucion],
        ['Clase de Ejecución', String(derivacion.claseEjecucion)],
      ],
    },
    {
      kind: 'table',
      head: [
        'Elemento estructural',
        'Tipo de acero',
        'Medios de unión',
        'Características de los medios',
        'Clase de exposición',
        'Sistema de protección',
        'Características del sistema',
      ],
      rows: derivacion.elementos.map((e) => [
        e.nombre,
        etiquetaAceroEstructural(e.designacion),
        e.union === 'soldadura' ? 'SOLDADURA' : 'ATORNILLADO',
        e.caracteristicasUnion,
        e.corrosividad,
        e.proteccion === 'galvanizado' ? 'GALVANIZADO' : e.proteccion === 'pintura' ? 'PINTURA' : '—',
        e.caracteristicasProteccion,
      ]),
    },
  ];
}

// ── Cuadros de madera ───────────────────────────────────────────────────────

const ROMANO: Record<number, string> = { 1: 'I', 2: 'II', 3: 'III' };

export function cuadroMadera(derivaciones: DerivacionMadera[]): Block[] {
  const propiedades: [string, (d: DerivacionMadera) => string][] = [
    ['Clase de servicio', (d) => ROMANO[d.claseServicio]],
    ['Tipo de madera', (d) => ETIQUETA_TIPO_MADERA[d.grupo.tipo]],
    ['Clase resistente', (d) => d.grupo.claseResistente],
    ['Especie', (d) => d.grupo.especie ?? GUION],
    ['Calidad', (d) => d.calidad ?? GUION],
    ['Clase resistente de las láminas', (d) => d.grupo.claseLaminas ?? GUION],
  ];

  return [
    { kind: 'heading', level: 2, text: 'MADERA' },
    {
      kind: 'table',
      head: ['', ...derivaciones.map((d) => d.grupo.nombre)],
      rows: propiedades.map(([etiqueta, valor]) => [etiqueta, ...derivaciones.map(valor)]),
    },
  ];
}

export function cuadroDurabilidadMadera(derivaciones: DerivacionMadera[]): Block[] {
  const filas = derivaciones.map((d) => {
    const especie = d.grupo.especie ? DURABILIDAD_ESPECIES[d.grupo.especie] : undefined;
    return [
      d.grupo.nombre,
      d.grupo.especie ?? GUION,
      d.claseUso,
      especie?.durabilidadDuramen ?? GUION,
      String(DURABILIDAD_EXIGIDA_EN460[d.claseUso]),
      especie?.impregnabilidadAlbura ?? GUION,
      especie?.impregnabilidadDuramen ?? GUION,
    ];
  });

  const notas = [
    ...new Set(derivaciones.flatMap((d) => d.notas)),
    'Durabilidad natural e impregnabilidad según UNE-EN 350-2; durabilidad exigida según UNE-EN 460. El DB SE-M remite a estas normas (apartado 3.2.3) sin transcribirlas.',
  ];

  return [
    { kind: 'heading', level: 2, text: 'DURABILIDAD MADERA' },
    {
      kind: 'table',
      head: [
        'Elemento',
        'Especie',
        'Clase de uso (UNE-EN 351-1 y DB SE-M)',
        'Durabilidad natural frente a hongos, duramen (UNE-EN 350-2)',
        'Durabilidad exigida (UNE-EN 460)',
        'Impregnabilidad albura (UNE-EN 350-2)',
        'Impregnabilidad duramen (UNE-EN 350-2)',
      ],
      rows: filas,
    },
    { kind: 'notes', items: notas },
  ];
}

// ── Coeficientes de minoración ──────────────────────────────────────────────

export interface MaterialesPresentes {
  maderaLaminada?: boolean;
  maderaMaciza?: boolean;
  aceroLaminado?: boolean;
  aceroDeArmar?: boolean;
  hormigon?: boolean;
}

/**
 * El cuadro de acciones lleva una tabla de coeficientes de minoración con
 * columna de INCENDIO, filtrada a los materiales realmente presentes en la
 * obra. En incendio todos valen 1,00 (situación extraordinaria).
 *
 * La resistencia al fuego exigida (R30, R60…) la fija el DB SI 6 según uso y
 * altura de evacuación, y es un dato de la obra: sólo se imprime si se ha
 * indicado. El oráculo decía «R30» y así salía en todos los documentos.
 */
export function cuadroCoeficientesMinoracion(
  presentes: MaterialesPresentes,
  resistenciaFuego: number | null = null,
): Block[] {
  const todos: [keyof MaterialesPresentes, string, number][] = [
    ['maderaLaminada', 'Madera laminada', GAMMA_M_MADERA.laminada],
    ['maderaMaciza', 'Madera maciza', GAMMA_M_MADERA.maciza],
    ['aceroLaminado', 'Acero laminado', GAMMA_MATERIALES.aceroEstructural.persistente],
    ['aceroDeArmar', 'Acero de armar', GAMMA_MATERIALES.armaduraPasiva.persistente],
    ['hormigon', 'Hormigón', GAMMA_MATERIALES.hormigon.persistente],
  ];

  const filas = todos
    .filter(([clave]) => presentes[clave])
    .map(([, etiqueta, gamma]) => [etiqueta, num(gamma, 2), num(GAMMA_M_EXTRAORDINARIA, 2)]);

  const items = ['Aplicable a los valores característicos.'];
  if (resistenciaFuego !== null) {
    items.push(`La estructura será R${resistenciaFuego} acorde al CTE DB SI.`);
  }

  return [
    { kind: 'heading', level: 2, text: 'COEFICIENTES DE MINORACIÓN' },
    { kind: 'table', head: ['Materiales', 'Ordinaria', 'Incendio'], rows: filas },
    { kind: 'notes', items },
  ];
}

// ── Cuadro de anclajes y solapes ────────────────────────────────────────────

export function cuadroAnclajes(
  hormigones: number[],
  fyk: number,
  diametros: number[],
  etiquetaAcero = 'B500SD',
): Block[] {
  const blocks: Block[] = [
    { kind: 'heading', level: 2, text: 'LONGITUDES DE ANCLAJE EN PROLONGACIÓN RECTA (CÓD-E)' },
  ];
  const cabecera = ['', ...diametros.map((d) => `Ø${d}`)];

  for (const fck of hormigones) {
    const t = tablaAnclajes(fck, fyk, diametros);
    blocks.push({
      kind: 'table',
      caption: `HA-${fck}/${etiquetaAcero}`,
      head: cabecera,
      rows: [
        ['Posición I', ...t.anclaje.I.map(String)],
        ['Posición II', ...t.anclaje.II.map(String)],
      ],
    });
  }

  blocks.push({ kind: 'heading', level: 2, text: 'LONGITUDES DE SOLAPE (CÓD-E)' });
  for (const fck of hormigones) {
    const t = tablaAnclajes(fck, fyk, diametros);
    blocks.push({
      kind: 'table',
      caption: `HA-${fck}/${etiquetaAcero}`,
      head: cabecera,
      rows: [
        ['Posición I', ...t.solape.I.map(String)],
        ['Posición II', ...t.solape.II.map(String)],
      ],
    });
  }

  blocks.push({ kind: 'paragraph', text: 'Longitudes en cm.' });
  blocks.push({ kind: 'notes', items: NOTAS_ANCLAJE });
  return blocks;
}
