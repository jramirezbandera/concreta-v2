/**
 * La resistencia al fuego que el DB SI 6 le exige a la estructura.
 *
 * Transcrito de la sección SI 6 del CTE DB SI (edición del Ministerio de
 * Vivienda y Agenda Urbana), apartados 3 y 4: la tabla 3.1, la tabla 3.2 y las
 * reglas sueltas del § 3.2 a § 4.2, que no están tabuladas y se olvidan.
 *
 * Lo que este módulo NO hace es decidir por el proyectista: devuelve la R que
 * sale de la tabla y de dónde sale, y la propuesta se puede pisar. La R la fija
 * el proyecto de incendios, y este módulo la deduce para que no haya que ir a
 * buscarla —que es distinto de firmarla—.
 */

import { bandaDeAltura, type BandaAltura } from './altura';

// ── Los usos de la tabla 3.1 ────────────────────────────────────────────────

export type UsoDbSi =
  | 'viviendaUnifamiliar'
  | 'residencialVivienda'
  | 'residencialPublico'
  | 'docente'
  | 'administrativo'
  | 'comercial'
  | 'publicaConcurrencia'
  | 'hospitalario'
  | 'aparcamientoExclusivo'
  | 'aparcamientoBajoOtroUso';

export const USOS_DB_SI: readonly { id: UsoDbSi; etiqueta: string; ayuda?: string }[] = [
  { id: 'viviendaUnifamiliar', etiqueta: 'Vivienda unifamiliar' },
  { id: 'residencialVivienda', etiqueta: 'Residencial Vivienda' },
  { id: 'residencialPublico', etiqueta: 'Residencial Público', ayuda: 'Hoteles, hostales, residencias.' },
  { id: 'docente', etiqueta: 'Docente' },
  { id: 'administrativo', etiqueta: 'Administrativo', ayuda: 'Oficinas.' },
  { id: 'comercial', etiqueta: 'Comercial' },
  { id: 'publicaConcurrencia', etiqueta: 'Pública concurrencia' },
  { id: 'hospitalario', etiqueta: 'Hospitalario' },
  {
    id: 'aparcamientoExclusivo',
    etiqueta: 'Aparcamiento (edificio exclusivo o sobre otro uso)',
    ayuda: 'R 90 tanto en sótano como sobre rasante: su fila de la tabla no depende de la altura.',
  },
  {
    id: 'aparcamientoBajoOtroUso',
    etiqueta: 'Aparcamiento (bajo un uso distinto)',
    ayuda: 'R 120, y R 180 si es un aparcamiento robotizado.',
  },
];

export const ETIQUETA_USO: Record<UsoDbSi, string> = Object.fromEntries(
  USOS_DB_SI.map((u) => [u.id, u.etiqueta]),
) as Record<UsoDbSi, string>;

/**
 * Las cuatro columnas de la tabla 3.1. `null` es la raya de la tabla: el caso
 * no está contemplado, no es «sin exigencia».
 */
interface FilaTabla31 {
  sotano: number | null;
  h15: number | null;
  h28: number | null;
  mas28: number | null;
}

/**
 * Tabla 3.1 — Resistencia al fuego suficiente de los elementos estructurales.
 *
 * Las dos filas de aparcamiento valen lo mismo en las cuatro columnas: la
 * norma las imprime como una celda que cruza toda la fila.
 */
export const TABLA_3_1: Record<UsoDbSi, FilaTabla31> = {
  viviendaUnifamiliar: { sotano: 30, h15: 30, h28: null, mas28: null },
  residencialVivienda: { sotano: 120, h15: 60, h28: 90, mas28: 120 },
  residencialPublico: { sotano: 120, h15: 60, h28: 90, mas28: 120 },
  docente: { sotano: 120, h15: 60, h28: 90, mas28: 120 },
  administrativo: { sotano: 120, h15: 60, h28: 90, mas28: 120 },
  comercial: { sotano: 120, h15: 90, h28: 120, mas28: 180 },
  publicaConcurrencia: { sotano: 120, h15: 90, h28: 120, mas28: 180 },
  hospitalario: { sotano: 120, h15: 90, h28: 120, mas28: 180 },
  aparcamientoExclusivo: { sotano: 90, h15: 90, h28: 90, mas28: 90 },
  aparcamientoBajoOtroUso: { sotano: 120, h15: 120, h28: 120, mas28: 120 },
};

/** Los usos a los que la llamada (3) les sube el sótano a R 180 por encima de 28 m. */
const CON_LLAMADA_3: readonly UsoDbSi[] = ['comercial', 'publicaConcurrencia', 'hospitalario'];

export interface EntradaTabla31 {
  uso: UsoDbSi;
  /** `true` si la planta del sector está bajo rasante. */
  bajoRasante: boolean;
  /** m. Altura de evacuación del edificio. `null` = sin saberla. */
  alturaEvacuacion: number | null;
  /** Llamada (4): aparcamiento robotizado. */
  robotizado?: boolean;
  /** Llamada (2): vivienda unifamiliar agrupada o adosada, con estructura común. */
  adosada?: boolean;
}

export interface ExigenciaDerivada {
  /** Minutos de R. `null` cuando la tabla no da un valor para ese caso. */
  minutos: number | null;
  /** De dónde sale, tal como se escribe en el documento. */
  referencia: string;
  /** Lo que hay que advertirle al proyectista antes de firmarlo. */
  avisos: string[];
}

/**
 * La R de la tabla 3.1 para un sector.
 *
 * Nota (1) de la tabla, que no se puede automatizar y por eso se avisa: la R de
 * un SUELO que separa sectores es función del uso del sector INFERIOR, no del
 * de arriba. Al declarar sector por sector, un forjado que hace de techo de
 * aparcamiento y suelo de viviendas le toca la del aparcamiento.
 */
export function rExigida(e: EntradaTabla31): ExigenciaDerivada {
  const avisos: string[] = [];
  let uso = e.uso;

  // Llamada (2): en unifamiliares agrupadas o adosadas, la estructura COMÚN va
  // como Residencial Vivienda, que exige bastante más que el R 30 de la fila.
  if (uso === 'viviendaUnifamiliar' && e.adosada) {
    uso = 'residencialVivienda';
    avisos.push(
      'Vivienda unifamiliar agrupada o adosada: los elementos de la estructura común llevan la resistencia exigible a Residencial Vivienda (llamada 2 de la tabla 3.1).',
    );
  }

  const fila = TABLA_3_1[uso];

  if (e.bajoRasante) {
    let minutos = fila.sotano;
    let referencia = `tabla 3.1 del DB SI 6, ${ETIQUETA_USO[uso]}, plantas de sótano`;
    // Llamada (3).
    if (
      minutos !== null &&
      CON_LLAMADA_3.includes(uso) &&
      e.alturaEvacuacion !== null &&
      e.alturaEvacuacion > 28
    ) {
      minutos = 180;
      referencia += ' (llamada 3: R 180 por superar el edificio los 28 m de altura de evacuación)';
    }
    // Llamada (4).
    if (uso === 'aparcamientoBajoOtroUso' && e.robotizado) {
      minutos = 180;
      referencia += ' (llamada 4: aparcamiento robotizado)';
    }
    if (minutos === null) {
      avisos.push('La tabla 3.1 no contempla este caso en plantas de sótano.');
    }
    return { minutos, referencia, avisos };
  }

  // Sobre rasante: hace falta la altura de evacuación.
  if (e.alturaEvacuacion === null) {
    avisos.push('Sin la altura de evacuación del edificio no se puede entrar en la tabla 3.1.');
    return { minutos: null, referencia: 'tabla 3.1 del DB SI 6', avisos };
  }

  const banda: BandaAltura = bandaDeAltura(e.alturaEvacuacion);
  const rotulo: Record<BandaAltura, string> = {
    h15: 'altura de evacuación ≤ 15 m',
    h28: 'altura de evacuación ≤ 28 m',
    mas28: 'altura de evacuación > 28 m',
  };
  let minutos = fila[banda];
  let referencia = `tabla 3.1 del DB SI 6, ${ETIQUETA_USO[uso]}, ${rotulo[banda]}`;

  if (uso === 'aparcamientoBajoOtroUso' && e.robotizado) {
    minutos = 180;
    referencia += ' (llamada 4: aparcamiento robotizado)';
  }

  if (minutos === null) {
    avisos.push(
      `La tabla 3.1 no contempla ${ETIQUETA_USO[uso]} con ${rotulo[banda]}: revise el uso del sector.`,
    );
  }
  return { minutos, referencia, avisos };
}

// ── Tabla 3.2: zonas de riesgo especial ─────────────────────────────────────

export type NivelRiesgo = 'bajo' | 'medio' | 'alto';

export const TABLA_3_2: Record<NivelRiesgo, number> = { bajo: 90, medio: 120, alto: 180 };

export const ETIQUETA_RIESGO: Record<NivelRiesgo, string> = {
  bajo: 'Riesgo especial bajo',
  medio: 'Riesgo especial medio',
  alto: 'Riesgo especial alto',
};

/**
 * La R de una zona de riesgo especial integrada en el edificio.
 *
 * Su llamada (1) dice que no será inferior a la de la estructura portante de la
 * planta, así que si se sabe la de la planta se toma la mayor de las dos. La
 * excepción —R 30 bajo cubierta no prevista para evacuación cuyo fallo no
 * comprometa otras plantas ni la compartimentación— se declara a mano.
 */
export function rRiesgoEspecial(
  nivel: NivelRiesgo,
  rDeLaPlanta: number | null,
  bajoCubiertaSinRiesgo = false,
): ExigenciaDerivada {
  const avisos: string[] = [];
  const tabla = TABLA_3_2[nivel];

  if (bajoCubiertaSinRiesgo) {
    return {
      minutos: 30,
      referencia:
        'tabla 3.2 del DB SI 6, llamada 1: zona bajo cubierta no prevista para evacuación cuyo fallo no compromete otras plantas ni la compartimentación',
      avisos,
    };
  }

  if (rDeLaPlanta !== null && rDeLaPlanta > tabla) {
    avisos.push(
      `La tabla 3.2 pide R ${tabla}, pero la llamada 1 no admite menos que la estructura portante de la planta (R ${rDeLaPlanta}).`,
    );
    return {
      minutos: rDeLaPlanta,
      referencia: `tabla 3.2 del DB SI 6, ${ETIQUETA_RIESGO[nivel].toLowerCase()}, elevada a la de la planta (llamada 1)`,
      avisos,
    };
  }

  return {
    minutos: tabla,
    referencia: `tabla 3.2 del DB SI 6, ${ETIQUETA_RIESGO[nivel].toLowerCase()}`,
    avisos,
  };
}

// ── Las reglas sueltas del § 3 y § 4 ────────────────────────────────────────

/**
 * Reglas que no están en ninguna tabla y por eso se pasan por alto. Cada una
 * deja una exigencia distinta de la que daría la 3.1 para ese mismo sitio.
 */
export const REGLAS_SUELTAS: readonly {
  id: string;
  etiqueta: string;
  minutos: number | null;
  referencia: string;
  ayuda: string;
}[] = [
  {
    id: 'cubiertaLigera',
    etiqueta: 'Cubierta ligera no prevista para evacuación',
    minutos: 30,
    referencia: 'DB SI 6 § 3.2',
    ayuda:
      'R 30 si su altura respecto de la rasante no excede de 28 m y su fallo no puede dañar a edificios próximos ni comprometer otras plantas o la compartimentación. Ligera = cerramiento de carga permanente ≤ 1 kN/m².',
  },
  {
    id: 'escaleraProtegida',
    etiqueta: 'Escalera o pasillo protegido',
    minutos: 30,
    referencia: 'DB SI 6 § 3.3',
    ayuda: 'Los elementos estructurales contenidos en su recinto, como mínimo R 30.',
  },
  {
    id: 'escaleraEspecialmenteProtegida',
    etiqueta: 'Escalera especialmente protegida',
    minutos: null,
    referencia: 'DB SI 6 § 3.3',
    ayuda: 'No se exige resistencia al fuego a sus elementos estructurales.',
  },
  {
    id: 'secundario',
    etiqueta: 'Elemento estructural secundario',
    minutos: null,
    referencia: 'DB SI 6 § 4.1',
    ayuda:
      'Entreplantas pequeñas, suelos o escaleras de construcción ligera cuyo colapso no daña a los ocupantes ni compromete la estabilidad global, la evacuación o la compartimentación: no precisan cumplir ninguna exigencia.',
  },
  {
    id: 'carpa',
    etiqueta: 'Estructura sustentante de carpa',
    minutos: 30,
    referencia: 'DB SI 6 § 4.2',
    ayuda: 'R 30, salvo que el elemento textil acredite lo que pide el § 4.2.',
  },
];
