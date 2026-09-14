/**
 * Tiempo equivalente de exposición al fuego — Anejo B del CTE DB SI.
 *
 * La vía del SI 6 § 3.1.b: en vez de la clase de la tabla 3.1, se declara el
 * tiempo que la estructura tiene que aguantar la curva normalizada, calculado
 * con la geometría del sector y su carga de fuego. Casi siempre sale menos que
 * la tabla, que es todo el interés: la tabla no sabe si el sector tiene diez
 * metros de ventana o ninguno, ni si hay rociadores.
 *
 * Sale en MINUTOS EXACTOS, no en clases. El ejemplo del propio anejo da 96,23,
 * y eso se declara como R 97: redondear a R 120 se come casi todo lo que se ha
 * ganado calculándolo.
 *
 * ORÁCULO: la hoja del estudio, `incendio ejemplos/Tiempo equivalente
 * exposición fuego.xls`, que reproduce este anejo y cuyo caso cierra al último
 * decimal. Es golden PARCIAL: se aparta en tres cosas y aquí se hace lo que
 * dice la norma, no lo que hace la hoja. Están marcadas abajo con «LA HOJA».
 */

import { interpolar } from '../acciones/interp';

// ── B.2 · Curva normalizada tiempo-temperatura ──────────────────────────────

/**
 * θg = 20 + 345·log10(8t + 1) [ºC], con t en minutos (UNE EN 1363-1).
 *
 * No entra en el tiempo equivalente; es la curva contra la que se mide todo lo
 * demás, y se dibuja para que se vea de qué se está hablando.
 */
export function temperaturaNormalizada(minutos: number): number {
  if (minutos <= 0) return 20;
  return 20 + 345 * Math.log10(8 * minutos + 1);
}

// ── B.3 · Coeficiente de ventilación ────────────────────────────────────────

/** Los límites que la norma le pone a `αv`, y que la hoja del estudio también aplica. */
export const ALFA_V_MIN = 0.025;
export const ALFA_V_MAX = 0.25;

/** Suelo de `wf` en la (B.3). LA HOJA NO LO APLICA. */
export const WF_MIN = 0.5;

/** Límites del coeficiente de aberturas `O`, para la (B.6) y para el acero sin proteger. */
export const O_MIN = 0.02;
export const O_MAX = 0.2;

/** Por debajo de esta superficie, y sin huecos en techo, cabe la (B.6). */
export const AF_SECTOR_PEQUENO = 100;

export interface EntradaVentilacion {
  /** m². Superficie construida del sector. */
  af: number;
  /** m². Aberturas en fachada. */
  av: number;
  /** m². Aberturas en techo. */
  ah: number;
  /** m. Altura del sector de incendio. */
  h: number;
  /** m². Superficie total de la envolvente, sólo para la (B.6) y para `O`. */
  at?: number | null;
  /** m. Altura promedio de los huecos verticales, sólo para `O`. */
  hHuecos?: number | null;
}

export interface Ventilacion {
  /** El coeficiente de la (B.3) o de la (B.6). `null` si no se puede calcular. */
  wf: number | null;
  alfaV: number;
  /** `true` si `αv` ha topado con alguno de sus límites. */
  alfaVAcotada: boolean;
  alfaH: number;
  bv: number;
  /** Coeficiente de aberturas. `null` sin `At` ni altura de huecos. */
  o: number | null;
  /** `true` si `O` ha topado. */
  oAcotado: boolean;
  /** Qué fórmula se ha usado. */
  formula: 'B.3' | 'B.6';
  avisos: string[];
}

/**
 * Coeficiente de aberturas `O = Av·√h / At`, acotado entre 0,02 y 0,20.
 *
 * Hace falta para dos cosas: la (B.6) de los sectores pequeños y el `kc` del
 * acero sin proteger. `null` cuando falta la envolvente o la altura de huecos.
 */
export function coeficienteAberturas(
  av: number,
  hHuecos: number | null | undefined,
  at: number | null | undefined,
): { o: number | null; acotado: boolean } {
  if (!at || at <= 0 || !hHuecos || hHuecos <= 0 || av < 0) return { o: null, acotado: false };
  const bruto = (av * Math.sqrt(hHuecos)) / at;
  const o = Math.min(O_MAX, Math.max(O_MIN, bruto));
  return { o, acotado: o !== bruto };
}

/**
 * El coeficiente de ventilación.
 *
 *   wf = (6/H)^0,3 · [0,62 + 90(0,4 − αv)⁴ / (1 + bv·αh)] ≥ 0,5      (B.3)
 *   bv = 12,5(1 + 10αv − αv²) ≥ 10                                    (B.5)
 *
 * Para sectores de menos de 100 m² sin huecos en techo, la norma admite la
 * (B.6): wf = O^(−1/2)·Af/At. Se usa cuando se dan las dos condiciones y hay
 * envolvente con la que calcular `O`; si no, se sigue por la (B.3).
 */
export function ventilacion(e: EntradaVentilacion): Ventilacion {
  const avisos: string[] = [];
  const { o, acotado: oAcotado } = coeficienteAberturas(e.av, e.hHuecos, e.at);

  const alfaVBruto = e.af > 0 ? e.av / e.af : 0;
  const alfaV = Math.min(ALFA_V_MAX, Math.max(ALFA_V_MIN, alfaVBruto));
  const alfaVAcotada = alfaV !== alfaVBruto;
  const alfaH = e.af > 0 ? e.ah / e.af : 0;

  if (alfaVAcotada) {
    avisos.push(
      `La relación de huecos en fachada sale ${alfaVBruto.toFixed(4).replace('.', ',')} y la (B.4) la acota entre 0,025 y 0,25: se toma ${alfaV.toFixed(3).replace('.', ',')}.`,
    );
  }

  // (B.5), con su propio suelo.
  const bv = Math.max(10, 12.5 * (1 + 10 * alfaV - alfaV * alfaV));

  // (B.6), sólo donde la norma la admite.
  if (e.af > 0 && e.af < AF_SECTOR_PEQUENO && e.ah === 0 && o !== null && e.at && e.at > 0) {
    const wf = Math.max(WF_MIN, (1 / Math.sqrt(o)) * (e.af / e.at));
    avisos.push(
      `Sector de menos de ${AF_SECTOR_PEQUENO} m² sin huecos en techo: se usa la (B.6), wf = O^(−1/2)·Af/At.`,
    );
    return { wf, alfaV, alfaVAcotada, alfaH, bv, o, oAcotado, formula: 'B.6', avisos };
  }

  if (e.h <= 0) {
    avisos.push('Sin la altura del sector no se puede calcular el coeficiente de ventilación.');
    return { wf: null, alfaV, alfaVAcotada, alfaH, bv, o, oAcotado, formula: 'B.3', avisos };
  }

  const bruto =
    Math.pow(6 / e.h, 0.3) * (0.62 + (90 * Math.pow(0.4 - alfaV, 4)) / (1 + bv * alfaH));

  // LA HOJA no aplica este suelo. La (B.3) lo escribe («≥ 0,5») y aquí se
  // respeta: sin él, un sector muy ventilado daría un te,d irrealmente corto.
  const wf = Math.max(WF_MIN, bruto);
  if (wf !== bruto) {
    avisos.push(
      `El coeficiente de ventilación sale ${bruto.toFixed(3).replace('.', ',')} y la (B.3) no admite menos de 0,5: se toma 0,5.`,
    );
  }

  return { wf, alfaV, alfaVAcotada, alfaH, bv, o, oAcotado, formula: 'B.3', avisos };
}

// ── B.3 · Tabla B.1, coeficiente de corrección por material ─────────────────

export type MaterialSeccion = 'hormigon' | 'aceroProtegido' | 'aceroSinProteger';

export const ETIQUETA_MATERIAL: Record<MaterialSeccion, string> = {
  hormigon: 'Hormigón armado',
  aceroProtegido: 'Acero protegido',
  aceroSinProteger: 'Acero sin proteger',
};

/**
 * Tabla B.1. El acero sin proteger no tiene un valor fijo: vale 13,7·O, así que
 * necesita el coeficiente de aberturas y con él la envolvente del sector.
 */
export function coeficienteMaterial(
  material: MaterialSeccion,
  o: number | null,
): { kc: number | null; aviso: string | null } {
  if (material !== 'aceroSinProteger') return { kc: 1, aviso: null };
  if (o === null) {
    return {
      kc: null,
      aviso:
        'El acero sin proteger lleva kc = 13,7·O (tabla B.1), y para el coeficiente de aberturas hacen falta la superficie de la envolvente del sector y la altura media de los huecos.',
    };
  }
  return { kc: 13.7 * o, aviso: null };
}

// ── B.4 · Valor de cálculo de la densidad de carga de fuego ─────────────────

/** Tabla B.2 — riesgo de iniciación por el tamaño del sector. Se interpola. */
const TABLA_B2_AF = [20, 25, 250, 2500, 5000, 10000] as const;
const TABLA_B2_DQ1 = [1.0, 1.1, 1.5, 1.9, 2.0, 2.13] as const;

/**
 * δq1 por el tamaño del sector.
 *
 * LA HOJA interpola sólo entre (250; 1,50) y (2500; 1,90), que es el tramo en
 * el que caen casi todos los sectores de un edificio corriente —y por eso su
 * ejemplo coincide— pero se equivoca en los pequeños y en los muy grandes.
 * Aquí se interpola sobre la tabla entera; `interpolar` acota en los extremos,
 * que es justo lo que dicen sus filas «<20» y «>10 000».
 */
export function dq1(af: number): number {
  return interpolar(af, TABLA_B2_AF, TABLA_B2_DQ1);
}

/** Tabla B.3 — riesgo de iniciación por el uso o la actividad. */
export type ActividadB3 =
  | 'viviendaAdministrativoResidencialDocente'
  | 'comercialAparcamientoHospitalarioPublica'
  | 'riesgoBajo'
  | 'riesgoMedio'
  | 'riesgoAlto';

export const TABLA_B3: Record<ActividadB3, number> = {
  viviendaAdministrativoResidencialDocente: 1.0,
  comercialAparcamientoHospitalarioPublica: 1.25,
  riesgoBajo: 1.25,
  riesgoMedio: 1.4,
  riesgoAlto: 1.6,
};

export const ACTIVIDADES_B3: readonly { id: ActividadB3; etiqueta: string }[] = [
  { id: 'viviendaAdministrativoResidencialDocente', etiqueta: 'Vivienda, Administrativo, Residencial, Docente' },
  { id: 'comercialAparcamientoHospitalarioPublica', etiqueta: 'Comercial, Aparcamiento, Hospitalario, Pública concurrencia' },
  { id: 'riesgoBajo', etiqueta: 'Local de riesgo especial bajo' },
  { id: 'riesgoMedio', etiqueta: 'Local de riesgo especial medio' },
  { id: 'riesgoAlto', etiqueta: 'Local de riesgo especial alto' },
];

/** Tabla B.4 — las tres medidas activas voluntarias. δn es su PRODUCTO. */
export const TABLA_B4 = {
  deteccion: 0.87,
  alarmaBomberos: 0.87,
  extincion: 0.61,
} as const;

export interface MedidasActivas {
  deteccion: boolean;
  alarmaBomberos: boolean;
  extincion: boolean;
}

/**
 * δn = δn1 · δn2 · δn3, con los factores de las medidas que HAYA.
 *
 * LA HOJA lleva δn en una casilla suelta y en su ejemplo escribe 0,61, que es
 * sólo la extinción automática: con detección y alarma también instaladas
 * saldría 0,87 · 0,87 · 0,61 = 0,4617. El anejo dice «δn = δn,1·δn,2·δn,3», así
 * que aquí se multiplica lo marcado.
 */
export function dn(m: MedidasActivas): number {
  return (
    (m.deteccion ? TABLA_B4.deteccion : 1) *
    (m.alarmaBomberos ? TABLA_B4.alarmaBomberos : 1) *
    (m.extincion ? TABLA_B4.extincion : 1)
  );
}

/** Tabla B.5 — δc por las consecuencias del incendio, según la altura de evacuación. */
export type ConsecuenciasB5 = 'bajo15oAparcamiento' | 'entre15y28oBajoOtroUso' | 'masDe28';

export const TABLA_B5: Record<ConsecuenciasB5, number> = {
  bajo15oAparcamiento: 1.0,
  entre15y28oBajoOtroUso: 1.5,
  masDe28: 2.0,
};

export const CONSECUENCIAS_B5: readonly { id: ConsecuenciasB5; etiqueta: string }[] = [
  {
    id: 'bajo15oAparcamiento',
    etiqueta: 'Altura de evacuación descendente < 15 m, o aparcamiento de uso exclusivo',
  },
  {
    id: 'entre15y28oBajoOtroUso',
    etiqueta: 'Descendente entre 15 y 28 m, ascendente hasta 2,8 m, o aparcamiento bajo otros usos',
  },
  { id: 'masDe28', etiqueta: 'Descendente de más de 28 m, o ascendente de más de una planta' },
];

/**
 * La fila de la tabla B.5 que le toca a un edificio, a partir de lo que ya se
 * sabe de sus plantas. Es una PROPUESTA: la fila de en medio menciona también
 * los aparcamientos bajo otros usos, que no se deducen de la altura.
 */
export function consecuenciasPorAltura(
  descendente: number | null,
  ascendente: number | null,
): ConsecuenciasB5 | null {
  if (descendente === null) return null;
  if (descendente > 28) return 'masDe28';
  // «Ascendente de más de una planta» no se puede leer de un número solo; el
  // umbral de 2,8 m de la fila de en medio es lo que sí está escrito.
  if (ascendente !== null && ascendente > 2.8) return 'masDe28';
  if (descendente >= 15) return 'entre15y28oBajoOtroUso';
  if (ascendente !== null && ascendente > 0) return 'entre15y28oBajoOtroUso';
  return 'bajo15oAparcamiento';
}

/** Tabla B.6 — densidad de carga de fuego variable característica, MJ/m². */
export type UsoB6 =
  | 'comercial'
  | 'residencialVivienda'
  | 'hospitalarioResidencialPublico'
  | 'administrativo'
  | 'docente'
  | 'publicaConcurrencia'
  | 'aparcamiento';

export const TABLA_B6: Record<UsoB6, number> = {
  comercial: 730,
  residencialVivienda: 650,
  hospitalarioResidencialPublico: 280,
  administrativo: 520,
  docente: 350,
  publicaConcurrencia: 365,
  aparcamiento: 280,
};

export const USOS_B6: readonly { id: UsoB6; etiqueta: string }[] = [
  { id: 'comercial', etiqueta: 'Comercial' },
  { id: 'residencialVivienda', etiqueta: 'Residencial Vivienda' },
  { id: 'hospitalarioResidencialPublico', etiqueta: 'Hospitalario / Residencial Público' },
  { id: 'administrativo', etiqueta: 'Administrativo' },
  { id: 'docente', etiqueta: 'Docente' },
  { id: 'publicaConcurrencia', etiqueta: 'Pública concurrencia (teatros, cines)' },
  { id: 'aparcamiento', etiqueta: 'Aparcamiento' },
];

/** Coeficiente de combustión: 0,8 si lo que arde es celulósico, 1 si no se sabe. */
export const M_CELULOSICO = 0.8;
export const M_DESCONOCIDO = 1;

export interface EntradaCargaFuego {
  /** MJ/m². Valor característico; de la tabla B.6 o tecleado. */
  qfk: number;
  /** Coeficiente de combustión. */
  m: number;
  /** m². Superficie del sector, para δq1. */
  af: number;
  actividad: ActividadB3;
  medidas: MedidasActivas;
  consecuencias: ConsecuenciasB5;
  /**
   * Edificio que no puede quedar fuera de servicio o con posible número
   * elevado de víctimas (hospitales): la tabla B.5 dice ×1,5.
   */
  criticidadAlta: boolean;
}

export interface CargaFuego {
  /** MJ/m². */
  qfd: number;
  dq1: number;
  dq2: number;
  dn: number;
  dc: number;
}

/** qf,d = qf,k · m · δq1 · δq2 · δn · δc  (B.7). */
export function cargaDeFuego(e: EntradaCargaFuego): CargaFuego {
  const a = dq1(e.af);
  const b = TABLA_B3[e.actividad];
  const n = dn(e.medidas);
  const c = TABLA_B5[e.consecuencias] * (e.criticidadAlta ? 1.5 : 1);
  return { qfd: e.qfk * e.m * a * b * n * c, dq1: a, dq2: b, dn: n, dc: c };
}

// ── El tiempo equivalente ───────────────────────────────────────────────────

export interface EntradaTiempoEquivalente extends EntradaVentilacion, Omit<EntradaCargaFuego, 'af'> {
  /** Coeficiente de conversión por las propiedades térmicas de la envolvente. */
  kb: number;
  material: MaterialSeccion;
}

export interface TiempoEquivalente {
  /** Minutos exactos. `null` si falta algo para cerrar la cuenta. */
  ted: number | null;
  /** Los mismos minutos redondeados al alza, que es lo que se declara. */
  declarado: number | null;
  kb: number;
  kc: number | null;
  ventilacion: Ventilacion;
  carga: CargaFuego;
  avisos: string[];
}

/** El valor de `kb` que el anejo admite sin más justificación. */
export const KB_POR_DEFECTO = 0.07;

/**
 * te,d = kb · wf · kc · qf,d  (B.2), en minutos.
 *
 * `kb` puede tomarse igual a 0,07; el anejo F de la UNE EN 1991-1-2 da valores
 * más precisos según las propiedades térmicas de la envolvente, y por eso se
 * deja teclear.
 */
export function tiempoEquivalente(e: EntradaTiempoEquivalente): TiempoEquivalente {
  const v = ventilacion(e);
  const carga = cargaDeFuego({ ...e, af: e.af });
  const { kc, aviso } = coeficienteMaterial(e.material, v.o);

  const avisos = [...v.avisos];
  if (aviso) avisos.push(aviso);

  const ted = v.wf === null || kc === null ? null : e.kb * v.wf * kc * carga.qfd;

  return {
    ted,
    declarado: ted === null ? null : Math.ceil(ted),
    kb: e.kb,
    kc,
    ventilacion: v,
    carga,
    avisos,
  };
}
