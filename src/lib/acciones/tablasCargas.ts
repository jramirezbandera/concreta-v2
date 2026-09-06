/**
 * Tablas del DB SE-AE (CTE, texto de abril de 2009) para las cargas
 * gravitatorias por planta, y las dos del DB SE que las acompañan (γ y ψ),
 * transcritas literalmente de los PDF de codigotecnico.org. Entre paréntesis,
 * la página del PDF donde está cada una.
 *
 * Regla del capítulo, la misma que en `tablasAE.ts`: aquí NO se calcula nada.
 * Sólo viven los números de la norma y su referencia; toda la lógica está en
 * `cargas.ts`, para que una discrepancia con un cuadro real se pueda localizar
 * en un sitio o en otro, nunca en los dos.
 */

// ── Sobrecarga de uso (art. 3.1) ────────────────────────────────────────────

/** Las categorías de uso que se le preguntan al usuario. G se resuelve en G1/G2 por la inclinación. */
export type CategoriaUso = 'A1' | 'A2' | 'B' | 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'D1' | 'D2' | 'E' | 'F' | 'G';

export const CATEGORIAS_USO: readonly CategoriaUso[] = ['A1', 'A2', 'B', 'C1', 'C2', 'C3', 'C4', 'C5', 'D1', 'D2', 'E', 'F', 'G'];

/** Las quince filas de la tabla 3.1 tal como las escribe la norma. */
export type FilaTabla31 = Exclude<CategoriaUso, 'G'> | 'G1' | 'G1ligera' | 'G2';

export interface FilaSobrecarga {
  /** Carga uniforme, kN/m². */
  uniforme: number;
  /** Carga concentrada, kN. */
  concentrada: number;
  /** Texto literal de la subcategoría en la tabla. */
  descripcion: string;
  /** Lo que se pone al lado del código en los cuadros: «A1 — viviendas». */
  corta: string;
}

/**
 * Tabla 3.1 (p. 5): valores característicos de las sobrecargas de uso. Las
 * notas que afectan al valor están en `cargas.ts`: (2) F pública toma el uso
 * desde el que se accede, (3) G entre 20º y 40º interpola, (5) cubierta ligera
 * = cerramiento de ≤ 1 kN/m², (7) G no concomitante con otras variables.
 */
export const TABLA_3_1: Record<FilaTabla31, FilaSobrecarga> = {
  A1: { uniforme: 2, concentrada: 2, descripcion: 'Viviendas y zonas de habitaciones en hospitales y hoteles', corta: 'viviendas' },
  A2: { uniforme: 3, concentrada: 2, descripcion: 'Trasteros', corta: 'trasteros' },
  B: { uniforme: 2, concentrada: 2, descripcion: 'Zonas administrativas', corta: 'oficinas' },
  C1: { uniforme: 3, concentrada: 4, descripcion: 'Zonas con mesas y sillas', corta: 'mesas y sillas' },
  C2: { uniforme: 4, concentrada: 4, descripcion: 'Zonas con asientos fijos', corta: 'asientos fijos' },
  C3: {
    uniforme: 5,
    concentrada: 4,
    descripcion: 'Zonas sin obstáculos que impidan el libre movimiento de las personas como vestíbulos de edificios públicos, administrativos, hoteles; salas de exposición en museos; etc.',
    corta: 'vestíbulos y zonas de paso',
  },
  C4: { uniforme: 5, concentrada: 7, descripcion: 'Zonas destinadas a gimnasio u actividades físicas', corta: 'gimnasios' },
  C5: { uniforme: 5, concentrada: 4, descripcion: 'Zonas de aglomeración (salas de conciertos, estadios, etc.)', corta: 'aglomeración' },
  D1: { uniforme: 5, concentrada: 4, descripcion: 'Locales comerciales', corta: 'locales comerciales' },
  D2: { uniforme: 5, concentrada: 7, descripcion: 'Supermercados, hipermercados o grandes superficies', corta: 'grandes superficies' },
  E: { uniforme: 2, concentrada: 20, descripcion: 'Zonas de tráfico y de aparcamiento para vehículos ligeros (peso total < 30 kN)', corta: 'aparcamiento' },
  F: { uniforme: 1, concentrada: 2, descripcion: 'Cubiertas transitables accesibles sólo privadamente', corta: 'cubierta transitable privada' },
  G1: { uniforme: 1, concentrada: 2, descripcion: 'Cubiertas con inclinación inferior a 20º, accesibles únicamente para conservación', corta: 'cubierta no transitable' },
  G1ligera: { uniforme: 0.4, concentrada: 1, descripcion: 'Cubiertas ligeras sobre correas (sin forjado), accesibles únicamente para conservación', corta: 'cubierta ligera sobre correas' },
  G2: { uniforme: 0, concentrada: 2, descripcion: 'Cubiertas con inclinación superior a 40º, accesibles únicamente para conservación', corta: 'cubierta inclinada > 40º' },
};

/** Tabla 3.1, nota 3 (p. 5): entre 20º y 40º la sobrecarga G se interpola linealmente entre G1 y G2. */
export const INCLINACION_G = { g1Max: 20, g2Min: 40 };

/** Tabla 3.1, nota 5 (p. 5): cubierta ligera es la que tiene un cerramiento de no más de 1 kN/m². */
export const CUBIERTA_LIGERA_MAX = 1;

/** Art. 3.1.1-3 (p. 6): en portales, mesetas y escaleras de las zonas de categorías A y B, +1 kN/m². */
export const INCREMENTO_ESCALERAS = 1;
export const CATEGORIAS_CON_INCREMENTO: readonly CategoriaUso[] = ['A1', 'A2', 'B'];

/** Art. 3.1.1-4 (p. 6): balcones volados, carga lineal en el borde, kN/m. */
export const BORDE_BALCON = 2;

/** Art. 3.1.1-6 (p. 6): porches, aceras y espacios de tránsito sobre elementos portantes, kN/m². */
export const PORCHES = { privado: 1, publico: 3 };

// ── Peso propio (art. 2.1 y Anejo C) ────────────────────────────────────────

/**
 * Art. 2.1-3 (p. 3): tabiques ordinarios de no más de 1,2 kN/m² de alzado y
 * distribución homogénea → carga uniforme equivalente; «en viviendas bastará
 * considerar como peso propio de la tabiquería una carga de 1,0 kN por cada m²
 * de superficie construida».
 */
export const TABIQUERIA = { max: 1.2, viviendas: 1.0 };

/** Tabla C.1 (p. 18): hormigón armado, kN/m³. */
export const DENSIDAD_HORMIGON = 25;

export interface TramoForjado {
  /** Grueso total por debajo del cual vale el peso, m (la tabla dice «< 0,30 m»). */
  gruesoMax: number;
  /** kN/m². */
  peso: number;
  descripcion: string;
}

/**
 * Tabla C.5 (p. 19), bloque «Forjados». La losa maciza está en `LOSA_C5`: la
 * tabla la da a 0,20 m (5 kN/m²), que es la densidad de la C.1 por el canto,
 * y así es como se calcula para cualquier canto.
 */
export const TABLA_C5_FORJADOS = {
  chapa: [{ gruesoMax: 0.12, peso: 2, descripcion: 'Chapa grecada con capa de hormigón; grueso total < 0,12 m' }],
  unidireccional: [
    { gruesoMax: 0.28, peso: 3, descripcion: 'Forjado unidireccional, luces de hasta 5 m; grueso total < 0,28 m' },
    { gruesoMax: 0.3, peso: 4, descripcion: 'Forjado uni o bidireccional; grueso total < 0,30 m' },
  ],
  reticular: [
    { gruesoMax: 0.3, peso: 4, descripcion: 'Forjado uni o bidireccional; grueso total < 0,30 m' },
    { gruesoMax: 0.35, peso: 5, descripcion: 'Forjado bidireccional, grueso total < 0,35 m' },
  ],
} satisfies Record<string, TramoForjado[]>;

/** Tabla C.5 (p. 19): «Losa maciza de hormigón, grueso total 0,20 m → 5». */
export const LOSA_C5 = { grueso: 0.2, peso: 5 };

/** Tabla C.5 (p. 19), «Cerramientos y particiones (para una altura libre del orden de 3,0 m) incluso enlucido», kN/m. */
export const ALTURA_LIBRE_C5 = 3.0;
export const TABLA_C5_CERRAMIENTOS = {
  tabique: { gruesoMax: 0.09, peso: 3, descripcion: 'Tablero o tabique simple; grueso total < 0,09 m' },
  tabicon: { gruesoMax: 0.14, peso: 5, descripcion: 'Tabicón u hoja simple de albañilería; grueso total < 0,14 m' },
  hojaExterior: { gruesoMax: 0.25, peso: 7, descripcion: 'Hoja de albañilería exterior y tabique interior; grueso total < 0,25 m' },
};

/** Tabla C.5 (p. 19), «Solados (incluyendo material de agarre)», kN/m². */
export const TABLA_C5_SOLADOS = {
  lamina: { gruesoMax: 0.03, peso: 0.5, descripcion: 'Lámina pegada o moqueta; grueso total < 0,03 m' },
  plaston: { gruesoMax: 0.08, peso: 1.0, descripcion: 'Pavimento de madera, cerámico o hidráulico sobre plastón; grueso total < 0,08 m' },
  piedra: { gruesoMax: 0.15, peso: 1.5, descripcion: 'Placas de piedra, o peldañeado; grueso total < 0,15 m' },
};

/** Tabla C.5 (p. 19), «Cubierta, sobre forjado (peso en proyección horizontal)», kN/m². */
export const TABLA_C5_CUBIERTAS = {
  faldonesLigeros: { peso: 1.0, descripcion: 'Faldones de chapa, tablero o paneles ligeros' },
  faldonesTeja: { peso: 2.0, descripcion: 'Faldones de placas, teja o pizarra' },
  tejaPalomeros: { peso: 3.0, descripcion: 'Faldones de teja sobre tableros y tabiques palomeros' },
  planaVista: { peso: 1.5, descripcion: 'Cubierta plana, recrecido, con impermeabilización vista protegida' },
  planaGrava: { peso: 2.5, descripcion: 'Cubierta plana, a la catalana o invertida con acabado de grava' },
};

/** Tabla C.5 (p. 20), «Rellenos», kN/m³: agua en aljibes o piscinas; terreno en jardineras incluyendo drenaje. */
export const DENSIDAD_RELLENOS = { agua: 10, tierra: 20 };

// ── DB SE: coeficientes parciales y de simultaneidad ────────────────────────

/** DB SE tabla 4.1 (p. 13): situación persistente o transitoria, efecto desfavorable, resistencia. */
export const GAMMA_DB_SE = { G: 1.35, Q: 1.5, A: 1.0 };

export interface Psi {
  psi0: number;
  psi1: number;
  psi2: number;
}

/** Con qué fila de la tabla 4.2 va cada sobrecarga. F no tiene fila: toma la del uso desde el que se accede (nota). */
export type FamiliaPsi = 'A' | 'B' | 'C' | 'D' | 'E' | 'G';

/**
 * DB SE tabla 4.2 (p. 14): coeficientes de simultaneidad. Las cubiertas
 * accesibles únicamente para mantenimiento (G) llevan ceros; la nieve cambia
 * a 1.000 m de altitud.
 */
export const TABLA_4_2_PSI: Record<FamiliaPsi | 'nieveBaja' | 'nieveAlta', Psi> = {
  A: { psi0: 0.7, psi1: 0.5, psi2: 0.3 },
  B: { psi0: 0.7, psi1: 0.5, psi2: 0.3 },
  C: { psi0: 0.7, psi1: 0.7, psi2: 0.6 },
  D: { psi0: 0.7, psi1: 0.7, psi2: 0.6 },
  E: { psi0: 0.7, psi1: 0.7, psi2: 0.6 },
  G: { psi0: 0, psi1: 0, psi2: 0 },
  nieveBaja: { psi0: 0.5, psi1: 0.2, psi2: 0 },
  nieveAlta: { psi0: 0.7, psi1: 0.5, psi2: 0.2 },
};

/** DB SE tabla 4.2 (p. 14): por encima de esta altitud la nieve toma la fila alta. */
export const ALTITUD_PSI_NIEVE = 1000;

/** Los rótulos de la tabla 4.2 para cada familia, como los escribe la norma. */
export const ROTULO_PSI: Record<FamiliaPsi | 'nieveBaja' | 'nieveAlta', string> = {
  A: 'Zonas residenciales (categoría A)',
  B: 'Zonas administrativas (categoría B)',
  C: 'Zonas destinadas al público (categoría C)',
  D: 'Zonas comerciales (categoría D)',
  E: 'Zonas de tráfico y aparcamiento de vehículos ligeros (categoría E)',
  G: 'Cubiertas accesibles únicamente para mantenimiento (categoría G)',
  nieveBaja: 'Nieve, altitud ≤ 1.000 m',
  nieveAlta: 'Nieve, altitud > 1.000 m',
};
