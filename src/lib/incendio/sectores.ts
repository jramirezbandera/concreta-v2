/**
 * De los sectores tecleados a la R que se declara.
 *
 * Un sector de incendio se describe con tres cosas —qué uso tiene, si está
 * bajo rasante y qué plantas abarca— y de ahí sale su R por la tabla 3.1. Los
 * otros dos casos que el DB SI trata aparte entran por la misma puerta: las
 * zonas de riesgo especial (tabla 3.2) y las reglas sueltas del § 3.2 al § 4.2,
 * que no están tabuladas.
 *
 * La R derivada SIEMPRE se puede pisar. Cuando se pisa, el documento lo dice:
 * una memoria firmada tiene que distinguir lo que sale de la tabla de lo que
 * decidió el proyectista.
 */

import {
  REGLAS_SUELTAS,
  TABLA_3_1,
  TABLA_3_2,
  rExigida,
  rRiesgoEspecial,
  type ExigenciaDerivada,
  type NivelRiesgo,
  type UsoDbSi,
} from './tabla31';

/**
 * Qué es este sector, en una sola cadena.
 *
 * Plana y no un objeto discriminado a propósito: es el `value` de un solo
 * `<select>` con tres grupos, y la lectura defensiva de un estado guardado se
 * reduce a comprobar que la cadena sigue existiendo.
 *
 *   `uso:administrativo` · `riesgo:bajo` · `regla:cubiertaLigera` · `''` sin elegir
 */
export type ClaseSector = string;

export const claseUso = (u: UsoDbSi): ClaseSector => `uso:${u}`;
export const claseRiesgo = (n: NivelRiesgo): ClaseSector => `riesgo:${n}`;
export const claseRegla = (id: string): ClaseSector => `regla:${id}`;

const NIVELES: readonly NivelRiesgo[] = ['bajo', 'medio', 'alto'];

/** Todas las clases válidas, para validar lo guardado y pintar el desplegable. */
export function clasesValidas(usos: readonly UsoDbSi[]): ClaseSector[] {
  return [
    ...usos.map(claseUso),
    ...NIVELES.map(claseRiesgo),
    ...REGLAS_SUELTAS.map((r) => claseRegla(r.id)),
  ];
}

export interface SectorEntrada {
  id: string;
  nombre: string;
  clase: ClaseSector;
  /** ¿Está bajo rasante? Se propone desde sus plantas y se puede corregir. */
  sotano: boolean;
  /** Llamada (4) de la tabla 3.1. */
  robotizado: boolean;
  /** Llamada (2) de la tabla 3.1. */
  adosada: boolean;
  /** Excepción de la llamada (1) de la tabla 3.2. */
  bajoCubiertaSinRiesgo: boolean;
  /** Pisa la R derivada. `null` = se declara la de la tabla. */
  minutosManual: number | null;
}

export interface SectorResuelto {
  id: string;
  nombre: string;
  /** La R que se declara. `null` = no hay nada que declarar todavía. */
  minutos: number | null;
  /** La que daba la tabla, aunque se haya pisado. */
  derivada: number | null;
  /** De dónde sale, tal como entra en el documento. */
  referencia: string;
  /** El proyectista pisó la tabla. */
  aMano: boolean;
  /** El § 3 dice expresamente que a esto no se le exige resistencia al fuego. */
  sinExigencia: boolean;
  avisos: string[];
  /** Fila a medio rellenar: bloquea exportar y publicar. */
  hueco: boolean;
}

function derivar(
  s: SectorEntrada,
  alturaEvacuacion: number | null,
  rDeLaPlanta: number | null,
): { r: ExigenciaDerivada; sinExigencia: boolean } | null {
  const [tipo, resto] = s.clase.split(':');
  // Se comprueba que lo guardado siga existiendo. `normalizarSectores` ya lo
  // filtra al leer, pero esta función es pública y pura: una clase de otra
  // versión del esquema tiene que salir por la puerta de los huecos, no por
  // una excepción en pleno render.
  if (tipo === 'uso') {
    if (!(resto in TABLA_3_1)) return null;
    return {
      r: rExigida({
        uso: resto as UsoDbSi,
        bajoRasante: s.sotano,
        alturaEvacuacion,
        robotizado: s.robotizado,
        adosada: s.adosada,
      }),
      sinExigencia: false,
    };
  }
  if (tipo === 'riesgo') {
    if (!(resto in TABLA_3_2)) return null;
    return {
      r: rRiesgoEspecial(resto as NivelRiesgo, rDeLaPlanta, s.bajoCubiertaSinRiesgo),
      sinExigencia: false,
    };
  }
  if (tipo === 'regla') {
    const regla = REGLAS_SUELTAS.find((x) => x.id === resto);
    if (!regla) return null;
    return {
      r: { minutos: regla.minutos, referencia: regla.referencia, avisos: [] },
      // Una regla sin minutos NO es un hueco: es que la norma no exige nada.
      sinExigencia: regla.minutos === null,
    };
  }
  return null;
}

/**
 * Resuelve todos los sectores.
 *
 * En dos pasadas, por la llamada (1) de la tabla 3.2: una zona de riesgo
 * especial no puede pedir menos que la estructura portante de su planta, así
 * que primero se resuelven los sectores de uso y luego las zonas de riesgo
 * contra la mayor R de los que comparten situación. Es una aproximación —la
 * norma habla de LA planta, y aquí se mira todo lo que está a ese lado de la
 * rasante— y se queda del lado de la seguridad.
 */
export function resolverSectores(
  sectores: readonly SectorEntrada[],
  alturaEvacuacion: number | null,
): SectorResuelto[] {
  const deUso = sectores.filter((s) => s.clase.startsWith('uso:'));
  const rPorSituacion = (sotano: boolean): number | null => {
    const rs = deUso
      .filter((s) => s.sotano === sotano)
      .map((s) => derivar(s, alturaEvacuacion, null)?.r.minutos ?? null)
      .filter((m): m is number => m !== null);
    return rs.length > 0 ? Math.max(...rs) : null;
  };

  return sectores.map((s) => {
    const nombre = s.nombre.trim();
    if (s.clase === '') {
      return {
        id: s.id,
        nombre,
        minutos: null,
        derivada: null,
        referencia: '',
        aMano: false,
        sinExigencia: false,
        avisos: [],
        hueco: true,
      };
    }

    const d = derivar(s, alturaEvacuacion, rPorSituacion(s.sotano));
    if (!d) {
      return {
        id: s.id,
        nombre,
        minutos: null,
        derivada: null,
        referencia: '',
        aMano: false,
        sinExigencia: false,
        avisos: ['No se reconoce lo que es este sector.'],
        hueco: true,
      };
    }

    const derivada = d.r.minutos;
    const aMano = s.minutosManual !== null;
    const minutos = aMano ? s.minutosManual : derivada;
    const avisos = [...d.r.avisos];

    if (aMano && derivada !== null && s.minutosManual !== derivada) {
      avisos.push(
        `Declarado R ${s.minutosManual} a mano; la ${d.r.referencia} daba R ${derivada}.`,
      );
    }

    return {
      id: s.id,
      nombre,
      minutos,
      derivada,
      referencia: aMano ? 'declarado por el proyectista' : d.r.referencia,
      aMano,
      sinExigencia: d.sinExigencia && !aMano,
      avisos,
      // Sin nombre no se puede imprimir; sin R tampoco, salvo que la norma
      // diga expresamente que a eso no se le exige nada.
      hueco: nombre === '' || (minutos === null && !d.sinExigencia),
    };
  });
}
