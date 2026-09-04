/**
 * Tablas del DB SE-AE (CTE, texto de abril de 2009) para viento y nieve,
 * transcritas literalmente del PDF de codigotecnico.org. Entre paréntesis, la
 * página del PDF donde está cada una.
 *
 * Regla del capítulo, la misma que en `materiales/tablasCE.ts`: aquí NO se
 * calcula nada. Sólo viven los números de la norma y su referencia; toda la
 * lógica está en `viento.ts` y `nieve.ts`, para que una discrepancia con un
 * cuadro real se pueda localizar en un sitio o en otro, nunca en los dos.
 *
 * Advertencia de transcripción: en la tabla 3.8 del PDF oficial la columna
 * derecha está MAL COMPUESTA. El nombre «SanSebastián/Donostia» ocupa dos
 * líneas y empuja los nombres de debajo una fila, pero los números se quedan
 * donde estaban: leída tal cual, Santander sale a 1.000 m con 0,7 y Sevilla a
 * 1.090 m con 0,9, que son Segovia y Soria. Aquí cada capital lleva los
 * números de la fila que le corresponde (Santander 0 / 0,3; Segovia 1.000 /
 * 0,7; Soria 1.090 / 0,9…), y el cruce con la tabla E.2 lo confirma capital a
 * capital (test `provincias`).
 */

// ── Viento ──────────────────────────────────────────────────────────────────

export type ZonaEolica = 'A' | 'B' | 'C';

/**
 * Anejo D.1-4 (p. 27): velocidad básica de la figura D.1 y presión dinámica
 * «respectivamente de 0,42, 0,45 y 0,52 kN/m² para las zonas A, B y C».
 *
 * qb se guarda tal cual lo escribe la norma, no como 0,5·δ·vb² (que daría
 * 0,4225 / 0,4556 / 0,5256): lo que va a la memoria es lo que se puede leer en
 * el DB. La fórmula D.1 vive en `viento.ts` para quien quiera el valor fino.
 */
export const ZONAS_EOLICAS: Record<ZonaEolica, { vb: number; qb: number }> = {
  A: { vb: 26, qb: 0.42 },
  B: { vb: 27, qb: 0.45 },
  C: { vb: 29, qb: 0.52 },
};

/** Anejo D.1-3 (p. 27): densidad del aire, kg/m³. */
export const DENSIDAD_AIRE = 1.25;

/** Art. 3.3.2-1 (p. 11): «como valor en cualquier punto del territorio español, puede adoptarse 0,5 kN/m²». */
export const QB_SIMPLIFICADO = 0.5;

export type GradoAspereza = 'I' | 'II' | 'III' | 'IV' | 'V';

export const ORDEN_ASPEREZAS: GradoAspereza[] = ['I', 'II', 'III', 'IV', 'V'];

/**
 * Tabla D.2 (p. 28): coeficientes k, L y Z de cada tipo de entorno para la
 * fórmula D.2 del coeficiente de exposición. Las descripciones son las de la
 * tabla 3.4 (p. 12), que es donde el usuario las reconoce.
 */
export const ASPEREZAS: Record<
  GradoAspereza,
  { k: number; L: number; Z: number; corta: string; descripcion: string }
> = {
  I: {
    k: 0.156, L: 0.003, Z: 1.0,
    corta: 'Borde del mar o de un lago',
    descripcion: 'Borde del mar o de un lago, con una superficie de agua en la dirección del viento de al menos 5 km de longitud.',
  },
  II: {
    k: 0.17, L: 0.01, Z: 1.0,
    corta: 'Terreno rural llano',
    descripcion: 'Terreno rural llano sin obstáculos ni arbolado de importancia.',
  },
  III: {
    k: 0.19, L: 0.05, Z: 2.0,
    corta: 'Zona rural accidentada',
    descripcion: 'Zona rural accidentada o llana con algunos obstáculos aislados, como árboles o construcciones pequeñas.',
  },
  IV: {
    k: 0.22, L: 0.3, Z: 5.0,
    corta: 'Zona urbana, industrial o forestal',
    descripcion: 'Zona urbana en general, industrial o forestal.',
  },
  V: {
    k: 0.24, L: 1.0, Z: 10.0,
    corta: 'Centro de negocios de una gran ciudad',
    descripcion: 'Centro de negocios de grandes ciudades, con profusión de edificios en altura.',
  },
};

/**
 * Tabla 3.4 (p. 12): coeficiente de exposición ce tabulado por altura. El
 * motor NO la usa —calcula ce con la fórmula del Anejo D.2, decisión D-VN3—;
 * está aquí porque es la prueba de que la fórmula está bien implementada: la
 * tabla es la fórmula redondeada a un decimal.
 */
export const ALTURAS_TABLA_3_4 = [3, 6, 9, 12, 15, 18, 24, 30];

export const TABLA_3_4: Record<GradoAspereza, number[]> = {
  I:   [2.4, 2.7, 3.0, 3.1, 3.3, 3.4, 3.5, 3.7],
  II:  [2.1, 2.5, 2.7, 2.9, 3.0, 3.1, 3.3, 3.5],
  III: [1.6, 2.0, 2.3, 2.5, 2.6, 2.7, 2.9, 3.1],
  IV:  [1.3, 1.4, 1.7, 1.9, 2.1, 2.2, 2.4, 2.6],
  V:   [1.2, 1.2, 1.2, 1.4, 1.5, 1.6, 1.9, 2.0],
};

/** Art. 3.3.2-1 (p. 11): en edificios urbanos de hasta 8 plantas puede tomarse ce = 2,0 constante. */
export const CE_URBANO_HASTA_8_PLANTAS = 2.0;

/** Anejo D.2-1 (p. 28): la fórmula vale para alturas z no mayores de 200 m. */
export const Z_MAX_ANEJO_D = 200;

/** Art. 3.3.1-2 (p. 11): el DB no es aplicable por encima de 2.000 m de altitud. */
export const ALTITUD_MAX_VIENTO = 2000;

/** Art. 3.3.1-3 (p. 11): el DB no cubre construcciones de esbeltez superior a 6. */
export const ESBELTEZ_MAX = 6;

/**
 * Tabla 3.5 (p. 12): coeficiente eólico global de edificios de pisos según la
 * esbeltez en el plano paralelo al viento. La primera columna es «< 0,25» y la
 * última «≥ 5,00»: fuera de ese rango se toma el extremo.
 */
export const TABLA_3_5 = {
  esbeltez: [0.25, 0.5, 0.75, 1.0, 1.25, 5.0],
  cp: [0.7, 0.7, 0.8, 0.8, 0.8, 0.8],
  cs: [-0.3, -0.4, -0.4, -0.5, -0.6, -0.7],
};

/** Art. 3.3.2-2 (p. 11): excentricidad en planta del 5 % de la dimensión máxima perpendicular al viento. */
export const EXCENTRICIDAD_VIENTO = 0.05;

// ── Nieve ───────────────────────────────────────────────────────────────────

export type ZonaInvernal = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const ZONAS_INVERNALES: ZonaInvernal[] = [1, 2, 3, 4, 5, 6, 7];

/** Altitudes (m) de las filas de la tabla E.2. */
export const ALTITUDES_TABLA_E2 = [0, 200, 400, 500, 600, 700, 800, 900, 1000, 1200, 1400, 1600, 1800, 2200];

/**
 * Tabla E.2 (p. 46): sobrecarga de nieve en un terreno horizontal, kN/m², por
 * zona de clima invernal (figura E.2) y altitud. `null` = guion en la tabla:
 * altitud no tabulada para esa zona (art. 3.5.2-3: ordenanza municipal o datos
 * empíricos).
 */
export const TABLA_E2: Record<ZonaInvernal, (number | null)[]> = {
  1: [0.3, 0.5, 0.6, 0.7, 0.9, 1.0, 1.2, 1.4, 1.7, 2.3, 3.2, 4.3, null, null],
  2: [0.4, 0.5, 0.6, 0.7, 0.9, 1.0, 1.1, 1.3, 1.5, 2.0, 2.6, 3.5, 4.6, 8.0],
  3: [0.2, 0.2, 0.2, 0.3, 0.3, 0.4, 0.5, 0.6, 0.7, 1.1, 1.7, 2.6, 4.0, null],
  4: [0.2, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0, 1.2, 1.9, 3.0, 4.6, null, null],
  5: [0.2, 0.3, 0.4, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.3, 1.8, 2.5, null, null],
  6: [0.2, 0.2, 0.2, 0.3, 0.4, 0.5, 0.7, 0.9, 1.2, 2.0, 3.3, 5.5, 9.3, null],
  7: [0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, null],
};

export interface CapitalNieve {
  capital: string;
  /** Altitud de la capital según la tabla, m. */
  altitud: number;
  /** Sobrecarga de nieve sobre terreno horizontal, kN/m². */
  sk: number;
}

/**
 * Tabla 3.8 (p. 15): sobrecarga de nieve en capitales de provincia y ciudades
 * autónomas, por el código INE de la provincia. Ceuta y Melilla comparten fila
 * en la norma («Ceuta y Melilla»): aquí van las dos con el mismo valor.
 */
export const TABLA_3_8: Record<string, CapitalNieve> = {
  '01': { capital: 'Vitoria / Gasteiz', altitud: 520, sk: 0.7 },
  '02': { capital: 'Albacete', altitud: 690, sk: 0.6 },
  '03': { capital: 'Alicante / Alacant', altitud: 0, sk: 0.2 },
  '04': { capital: 'Almería', altitud: 0, sk: 0.2 },
  '05': { capital: 'Ávila', altitud: 1130, sk: 1.0 },
  '06': { capital: 'Badajoz', altitud: 180, sk: 0.2 },
  '07': { capital: 'Palma de Mallorca', altitud: 0, sk: 0.2 },
  '08': { capital: 'Barcelona', altitud: 0, sk: 0.4 },
  '09': { capital: 'Burgos', altitud: 860, sk: 0.6 },
  '10': { capital: 'Cáceres', altitud: 440, sk: 0.4 },
  '11': { capital: 'Cádiz', altitud: 0, sk: 0.2 },
  '12': { capital: 'Castellón', altitud: 0, sk: 0.2 },
  '13': { capital: 'Ciudad Real', altitud: 640, sk: 0.6 },
  '14': { capital: 'Córdoba', altitud: 100, sk: 0.2 },
  '15': { capital: 'Coruña / A Coruña', altitud: 0, sk: 0.3 },
  '16': { capital: 'Cuenca', altitud: 1010, sk: 1.0 },
  '17': { capital: 'Gerona / Girona', altitud: 70, sk: 0.4 },
  '18': { capital: 'Granada', altitud: 690, sk: 0.5 },
  '19': { capital: 'Guadalajara', altitud: 680, sk: 0.6 },
  '20': { capital: 'San Sebastián / Donostia', altitud: 0, sk: 0.3 },
  '21': { capital: 'Huelva', altitud: 0, sk: 0.2 },
  '22': { capital: 'Huesca', altitud: 470, sk: 0.7 },
  '23': { capital: 'Jaén', altitud: 570, sk: 0.4 },
  '24': { capital: 'León', altitud: 820, sk: 1.2 },
  '25': { capital: 'Lérida / Lleida', altitud: 150, sk: 0.5 },
  '26': { capital: 'Logroño', altitud: 380, sk: 0.6 },
  '27': { capital: 'Lugo', altitud: 470, sk: 0.7 },
  '28': { capital: 'Madrid', altitud: 660, sk: 0.6 },
  '29': { capital: 'Málaga', altitud: 0, sk: 0.2 },
  '30': { capital: 'Murcia', altitud: 40, sk: 0.2 },
  '31': { capital: 'Pamplona / Iruña', altitud: 450, sk: 0.7 },
  '32': { capital: 'Orense / Ourense', altitud: 130, sk: 0.4 },
  '33': { capital: 'Oviedo', altitud: 230, sk: 0.5 },
  '34': { capital: 'Palencia', altitud: 740, sk: 0.4 },
  '35': { capital: 'Las Palmas', altitud: 0, sk: 0.2 },
  '36': { capital: 'Pontevedra', altitud: 0, sk: 0.3 },
  '37': { capital: 'Salamanca', altitud: 780, sk: 0.5 },
  '38': { capital: 'Tenerife', altitud: 0, sk: 0.2 },
  '39': { capital: 'Santander', altitud: 0, sk: 0.3 },
  '40': { capital: 'Segovia', altitud: 1000, sk: 0.7 },
  '41': { capital: 'Sevilla', altitud: 10, sk: 0.2 },
  '42': { capital: 'Soria', altitud: 1090, sk: 0.9 },
  '43': { capital: 'Tarragona', altitud: 0, sk: 0.4 },
  '44': { capital: 'Teruel', altitud: 950, sk: 0.9 },
  '45': { capital: 'Toledo', altitud: 550, sk: 0.5 },
  '46': { capital: 'Valencia / València', altitud: 0, sk: 0.2 },
  '47': { capital: 'Valladolid', altitud: 690, sk: 0.4 },
  '48': { capital: 'Bilbao / Bilbo', altitud: 0, sk: 0.3 },
  '49': { capital: 'Zamora', altitud: 650, sk: 0.4 },
  '50': { capital: 'Zaragoza', altitud: 210, sk: 0.5 },
  '51': { capital: 'Ceuta', altitud: 0, sk: 0.2 },
  '52': { capital: 'Melilla', altitud: 0, sk: 0.2 },
};

/**
 * Art. 3.5.1-1 (p. 14): «en cubiertas planas de edificios de pisos situados en
 * localidades de altitud inferior a 1.000 m, es suficiente considerar una
 * carga de nieve de 1,0 kN/m²».
 */
export const NIEVE_PLANA_SIMPLIFICADA = { carga: 1.0, altitudMax: 1000 };

export type ExposicionNieve = 'normal' | 'protegida' | 'expuesta';

/**
 * Art. 3.5.1-3 (p. 15): protegida de la acción del viento, −20 %; emplazamiento
 * fuertemente expuesto, +20 %.
 */
export const FACTOR_EXPOSICION_NIEVE: Record<ExposicionNieve, number> = {
  normal: 1.0,
  protegida: 0.8,
  expuesta: 1.2,
};

/** Art. 3.5.1-4 (p. 15): carga lineal de hielo en voladizos por encima de 1.000 m, pn = k·μ²·sk con k = 3 m. */
export const HIELO_VOLADIZOS = { altitudMin: 1000, k: 3 };

/** Art. 3.5.3-2 (p. 16): μ = 1 hasta 30º, μ = 0 desde 60º, lineal entre medias; con impedimento al deslizamiento, μ = 1. */
export const MU_FALDON = { inclinacionMu1: 30, inclinacionMu0: 60 };

/** Art. 3.5.3-3b (p. 16): limahoya entre faldones contrarios, μ = 1 + β/30 hasta 2,0 (β = semisuma de inclinaciones, > 30º → 2,0). */
export const MU_LIMAHOYA = { beta: 30, max: 2.0 };

/** Art. 3.5.3-3 y 3.5.4-2 (p. 16): anchura de 2 m para el μ de limahoya y para repartir la acumulación. */
export const ANCHO_ACUMULACION = 2.0;

/** Art. 3.5.2-4 (p. 15): peso específico de la nieve acumulada, kN/m³. */
export const DENSIDAD_NIEVE = { recienCaida: 1.2, prensada: 2.0, conGranizo: 4.0 };
