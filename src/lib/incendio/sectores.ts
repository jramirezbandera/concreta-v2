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
  KB_POR_DEFECTO,
  M_CELULOSICO,
  TABLA_B6,
  consecuenciasPorAltura,
  tiempoEquivalente,
  type ActividadB3,
  type ConsecuenciasB5,
  type MaterialSeccion,
  type MedidasActivas,
  type TiempoEquivalente,
  type UsoB6,
} from './anejoB';
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

/**
 * Lo que hace falta para el tiempo equivalente de un sector (Anejo B).
 *
 * Casi todo tiene propuesta: la actividad de la tabla B.3 y la carga de fuego
 * de la B.6 salen del uso que ya tiene el sector, y la fila de la B.5 sale de
 * la altura de evacuación del edificio. Lo que no se puede deducir de nada es
 * la GEOMETRÍA —superficie, huecos y altura del sector—, que es lo único que
 * hay que teclear sí o sí.
 */
export interface DatosAnejoB {
  /** m². Superficie construida del sector. */
  af: number | null;
  /** m². Aberturas en fachada. */
  av: number | null;
  /** m². Aberturas en techo. */
  ah: number;
  /** m. Altura del sector. */
  h: number | null;
  /** m². Envolvente del sector. Sólo para la (B.6) y para el acero sin proteger. */
  at: number | null;
  /** m. Altura media de los huecos verticales. Con `at`, da el coeficiente `O`. */
  hHuecos: number | null;
  /** Coeficiente de conversión de la envolvente; 0,07 salvo justificación. */
  kb: number;
  material: MaterialSeccion;
  /** MJ/m². Tecleado. `null` = el que da la tabla B.6 para `usoB6`. */
  qfkManual: number | null;
  /** `null` = el que propone el uso del sector. */
  usoB6: UsoB6 | null;
  /** Coeficiente de combustión. */
  m: number;
  /** `null` = la que propone el uso del sector. */
  actividad: ActividadB3 | null;
  medidas: MedidasActivas;
  /** `null` = la que propone la altura de evacuación. */
  consecuencias: ConsecuenciasB5 | null;
  /** Hospitales y edificios que no pueden quedar fuera de servicio: ×1,5. */
  criticidadAlta: boolean;
}

export function datosAnejoBIniciales(): DatosAnejoB {
  return {
    af: null,
    av: null,
    ah: 0,
    h: null,
    at: null,
    hHuecos: null,
    kb: KB_POR_DEFECTO,
    material: 'hormigon',
    qfkManual: null,
    usoB6: null,
    m: M_CELULOSICO,
    actividad: null,
    medidas: { deteccion: false, alarmaBomberos: false, extincion: false },
    consecuencias: null,
    criticidadAlta: false,
  };
}

/** Qué fila de la tabla B.3 le toca al uso del DB SI 6 de un sector. */
export function actividadDeUso(uso: UsoDbSi): ActividadB3 {
  switch (uso) {
    case 'comercial':
    case 'publicaConcurrencia':
    case 'hospitalario':
    case 'aparcamientoExclusivo':
    case 'aparcamientoBajoOtroUso':
      return 'comercialAparcamientoHospitalarioPublica';
    default:
      return 'viviendaAdministrativoResidencialDocente';
  }
}

/** Qué fila de la tabla B.6 le toca. La unifamiliar va con Residencial Vivienda. */
export function usoB6DeUso(uso: UsoDbSi): UsoB6 {
  switch (uso) {
    case 'comercial':
      return 'comercial';
    case 'viviendaUnifamiliar':
    case 'residencialVivienda':
      return 'residencialVivienda';
    case 'hospitalario':
    case 'residencialPublico':
      return 'hospitalarioResidencialPublico';
    case 'administrativo':
      return 'administrativo';
    case 'docente':
      return 'docente';
    case 'publicaConcurrencia':
      return 'publicaConcurrencia';
    default:
      return 'aparcamiento';
  }
}

/** Y qué fila de la B.3 le toca a una zona de riesgo especial. */
const ACTIVIDAD_RIESGO: Record<NivelRiesgo, ActividadB3> = {
  bajo: 'riesgoBajo',
  medio: 'riesgoMedio',
  alto: 'riesgoAlto',
};

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
  /**
   * Datos del Anejo B. `null` = este sector va por la tabla 3.1.
   *
   * Con ellos, el tiempo equivalente SUSTITUYE a la clase de la tabla: el
   * SI 6 § 3.1.b lo admite como alternativa, y se declara en minutos exactos.
   */
  anejoB: DatosAnejoB | null;
}

export interface SectorResuelto {
  id: string;
  nombre: string;
  /**
   * De qué lado de la rasante está, tal como se declaró. Se arrastra a la
   * salida porque la tabla 3.1 tiene columna aparte para el sótano: es lo que
   * permite a la sección del edificio poner cada R en su mitad del dibujo sin
   * volver a mirar el estado tecleado.
   */
  sotano: boolean;
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
  /** El tiempo equivalente, si el sector va por el Anejo B. */
  ted: TiempoEquivalente | null;
  /** La R que habría dado la tabla 3.1, cuando manda el tiempo equivalente. */
  deLaTabla: number | null;
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
 * El tiempo equivalente de un sector, si lo pide.
 *
 * La actividad, la carga de fuego y la fila de consecuencias tienen propuesta
 * —del uso del sector y de la altura del edificio—; lo que no se puede deducir
 * es la geometría, y sin ella no hay número.
 */
function tedDelSector(
  s: SectorEntrada,
  alturaEvacuacion: number | null,
  ascendente: number | null,
): { ted: TiempoEquivalente; avisos: string[] } | null {
  const b = s.anejoB;
  if (!b) return null;

  const [tipo, resto] = s.clase.split(':');
  const uso = tipo === 'uso' && resto in TABLA_3_1 ? (resto as UsoDbSi) : null;
  const nivel = tipo === 'riesgo' && resto in TABLA_3_2 ? (resto as NivelRiesgo) : null;

  const actividad =
    b.actividad ?? (nivel ? ACTIVIDAD_RIESGO[nivel] : uso ? actividadDeUso(uso) : null);
  const usoB6 = b.usoB6 ?? (uso ? usoB6DeUso(uso) : null);
  const qfk = b.qfkManual ?? (usoB6 ? TABLA_B6[usoB6] : null);
  const consecuencias = b.consecuencias ?? consecuenciasPorAltura(alturaEvacuacion, ascendente);

  const faltan: string[] = [];
  if (b.af === null || b.af <= 0) faltan.push('la superficie del sector');
  if (b.av === null || b.av < 0) faltan.push('la superficie de huecos en fachada');
  if (b.h === null || b.h <= 0) faltan.push('la altura del sector');
  if (qfk === null) faltan.push('la densidad de carga de fuego');
  if (actividad === null) faltan.push('la actividad de la tabla B.3');
  if (consecuencias === null) faltan.push('la fila de consecuencias de la tabla B.5');

  if (faltan.length > 0) {
    return {
      ted: {
        ted: null,
        declarado: null,
        kb: b.kb,
        kc: null,
        ventilacion: {
          wf: null, alfaV: 0, alfaVAcotada: false, alfaH: 0, bv: 0,
          o: null, oAcotado: false, formula: 'B.3', avisos: [],
        },
        carga: { qfd: 0, dq1: 0, dq2: 0, dn: 0, dc: 0 },
        avisos: [],
      },
      avisos: [
        `Para el tiempo equivalente de «${s.nombre.trim() || 'el sector sin nombre'}» falta ${faltan.join(', ')}.`,
      ],
    };
  }

  const ted = tiempoEquivalente({
    af: b.af as number,
    av: b.av as number,
    ah: b.ah,
    h: b.h as number,
    at: b.at,
    hHuecos: b.hHuecos,
    kb: b.kb,
    material: b.material,
    qfk: qfk as number,
    m: b.m,
    actividad: actividad as ActividadB3,
    medidas: b.medidas,
    consecuencias: consecuencias as ConsecuenciasB5,
    criticidadAlta: b.criticidadAlta,
  });
  return { ted, avisos: ted.avisos };
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
  ascendente: number | null = null,
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
        sotano: s.sotano,
        minutos: null,
        derivada: null,
        referencia: '',
        aMano: false,
        sinExigencia: false,
        avisos: [],
        hueco: true,
        ted: null,
        deLaTabla: null,
      };
    }

    const d = derivar(s, alturaEvacuacion, rPorSituacion(s.sotano));
    if (!d) {
      return {
        id: s.id,
        nombre,
        sotano: s.sotano,
        minutos: null,
        derivada: null,
        referencia: '',
        aMano: false,
        sinExigencia: false,
        avisos: ['No se reconoce lo que es este sector.'],
        hueco: true,
        ted: null,
        deLaTabla: null,
      };
    }

    const deLaTabla = d.r.minutos;
    const avisos = [...d.r.avisos];

    // El tiempo equivalente SUSTITUYE a la clase de la tabla (SI 6 § 3.1.b),
    // en minutos exactos. Por encima de él manda lo declarado a mano.
    const eq = tedDelSector(s, alturaEvacuacion, ascendente);
    if (eq) avisos.push(...eq.avisos);
    const porAnejoB = eq?.ted.declarado ?? null;

    const derivada = eq ? porAnejoB : deLaTabla;
    const referenciaDerivada = eq
      ? `tiempo equivalente de exposición al fuego del Anejo B del DB SI (SI 6 § 3.1.b)`
      : d.r.referencia;

    const aMano = s.minutosManual !== null;
    const minutos = aMano ? s.minutosManual : derivada;

    if (aMano && derivada !== null && s.minutosManual !== derivada) {
      avisos.push(
        `Declarado R ${s.minutosManual} a mano; ${eq ? 'el tiempo equivalente daba' : `la ${d.r.referencia} daba R`} ${derivada}.`,
      );
    }
    if (eq && porAnejoB !== null && deLaTabla !== null) {
      avisos.push(
        porAnejoB < deLaTabla
          ? `«${nombre || 'Sector sin nombre'}»: el tiempo equivalente da ${porAnejoB} min frente a los R ${deLaTabla} de la tabla 3.1. Se declara el tiempo equivalente, que es la vía del SI 6 § 3.1.b.`
          : `«${nombre || 'Sector sin nombre'}»: el tiempo equivalente da ${porAnejoB} min, MÁS que los R ${deLaTabla} de la tabla 3.1. Calcularlo no ha compensado aquí; puede declararse la clase de la tabla.`,
      );
    }

    return {
      id: s.id,
      nombre,
      sotano: s.sotano,
      minutos,
      derivada,
      referencia: aMano ? 'declarado por el proyectista' : referenciaDerivada,
      aMano,
      sinExigencia: d.sinExigencia && !aMano && !eq,
      avisos,
      // Sin nombre no se puede imprimir; sin R tampoco, salvo que la norma
      // diga expresamente que a eso no se le exige nada.
      hueco: nombre === '' || (minutos === null && !(d.sinExigencia && !eq)),
      ted: eq?.ted ?? null,
      deLaTabla,
    };
  });
}
