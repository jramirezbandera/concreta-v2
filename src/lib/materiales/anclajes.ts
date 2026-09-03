/**
 * Longitudes de anclaje en prolongación recta y de solape.
 *
 * El Código Estructural trae DOS métodos y no dan lo mismo:
 *
 *  A) Anejo 19, apartados 8.4.2 a 8.4.4 (el de la EN 1992-1-1):
 *       fbd = 2,25·η1·η2·fctd          con fctd = fctk;0,05/γc
 *       lb,rqd = (ø/4)·(σsd/fbd)
 *
 *  B) Artículo 49.5.1.2 (simplificado, heredado de la EHE-08):
 *       lbI  = m·ø²   ≥ fyk·ø/20
 *       lbII = 1,4·m·ø² ≥ fyk·ø/14
 *
 * La tabla de anclajes del plano del usuario sale del método A, con los valores
 * TABULADOS de fctk;0,05 de la tabla A19.3.1 (1,8 para HA-25 y 2,0 para HA-30),
 * no con los calculados a partir de 0,30·fck^(2/3). Los 48 números del cuadro
 * (dos hormigones × dos posiciones × seis diámetros × anclaje y solape) se
 * reproducen exactamente así; con el método B ninguno cuadra. Está en el test
 * golden por si algún día alguien pregunta por qué no usamos el artículo 49.5.
 */

import { COEFICIENTE_M, FCTK_005, GAMMA_MATERIALES } from './tablasCE';

/** Adherencia buena (I) o deficiente (II), CE 49.5.1.1. */
export type PosicionAdherencia = 'I' | 'II';

export interface ParametrosAnclaje {
  /** Resistencia característica del hormigón, N/mm². */
  fck: number;
  /** Límite elástico del acero, N/mm². */
  fyk: number;
  /** Diámetro de la barra, mm. */
  phi: number;
  posicion: PosicionAdherencia;
  gammaC?: number;
  gammaS?: number;
  /**
   * Tensión de trabajo de la armadura, N/mm². Por defecto fyd: es lo que se
   * tabula en un plano, donde no se conoce σsd barra a barra.
   */
  sigmaSd?: number;
}

/** CE Anejo 19, 8.4.2 (2): η1, condiciones de adherencia. */
export function eta1(posicion: PosicionAdherencia): number {
  return posicion === 'I' ? 1.0 : 0.7;
}

/** CE Anejo 19, 8.4.2 (2): η2, efecto del diámetro. */
export function eta2(phi: number): number {
  return phi <= 32 ? 1.0 : (132 - phi) / 100;
}

/** Resistencia a tracción de cálculo, N/mm². Usa la tabla A19.3.1, no la fórmula. */
export function fctd(fck: number, gammaC: number = GAMMA_MATERIALES.hormigon.persistente): number {
  const fctk = FCTK_005[fck];
  if (fctk === undefined) {
    throw new Error(
      `fck = ${fck} N/mm² no está en la tabla A19.3.1. Use una de las clases resistentes tabuladas.`,
    );
  }
  return fctk / gammaC;
}

/** CE Anejo 19, expresión (8.2): tensión última de adherencia, N/mm². */
export function tensionAdherencia(
  fck: number,
  posicion: PosicionAdherencia,
  phi: number,
  gammaC: number = GAMMA_MATERIALES.hormigon.persistente,
): number {
  // La norma limita fctd al valor de un hormigón de fck = 60 por fragilidad.
  const fctdLimitado = Math.min(fctd(fck, gammaC), fctd(60, gammaC));
  return 2.25 * eta1(posicion) * eta2(phi) * fctdLimitado;
}

/** CE Anejo 19, expresión (8.3): longitud básica de anclaje, mm. */
export function longitudBasicaAnclaje(p: ParametrosAnclaje): number {
  const gammaC = p.gammaC ?? GAMMA_MATERIALES.hormigon.persistente;
  const gammaS = p.gammaS ?? GAMMA_MATERIALES.armaduraPasiva.persistente;
  const sigmaSd = p.sigmaSd ?? p.fyk / gammaS;
  return (p.phi / 4) * (sigmaSd / tensionAdherencia(p.fck, p.posicion, p.phi, gammaC));
}

/**
 * CE Anejo 19, 8.4.4 (1): longitud mínima de anclaje cuando no se aplica
 * ninguna reducción por α. Se devuelve para poder avisar en la tabla, aunque
 * con los diámetros habituales nunca gobierna.
 */
export function longitudMinimaAnclaje(
  lbRqd: number,
  phi: number,
  esfuerzo: 'traccion' | 'compresion',
): number {
  const factor = esfuerzo === 'traccion' ? 0.3 : 0.6;
  return Math.max(factor * lbRqd, 10 * phi, 100);
}

/**
 * CE Anejo 19, 8.7.3: longitud de solape l0 = α6·lb,rqd (con α1..α5 = 1 en
 * prolongación recta y recubrimiento normal). α6 = 1,5 cuando se solapa más
 * del 50 % de las barras en la misma sección, que es el caso que se tabula en
 * plano.
 */
export function longitudSolape(p: ParametrosAnclaje, alpha6 = 1.5): number {
  return alpha6 * longitudBasicaAnclaje(p);
}

/** CE artículo 49.5.1.2: método simplificado. Se conserva para poder compararlo. */
export function longitudBasicaSimplificada(
  fck: number,
  acero: 'B400' | 'B500',
  phi: number,
  posicion: PosicionAdherencia,
): number {
  const fila =
    [...COEFICIENTE_M].reverse().find((f) => fck >= f.fck) ?? COEFICIENTE_M[0];
  const m = acero === 'B400' ? fila.B400 : fila.B500;
  const fyk = acero === 'B400' ? 400 : 500;
  return posicion === 'I'
    ? Math.max(m * phi * phi, (fyk * phi) / 20)
    : Math.max(1.4 * m * phi * phi, (fyk * phi) / 14);
}

/** cm redondeados, que es como se rotula en plano. */
const aCm = (mm: number): number => Math.round(mm / 10);

export interface TablaAnclajes {
  fck: number;
  fyk: number;
  diametros: number[];
  /** Longitudes de anclaje en prolongación recta, cm. */
  anclaje: Record<PosicionAdherencia, number[]>;
  /** Longitudes de solape, cm. */
  solape: Record<PosicionAdherencia, number[]>;
  alpha6: number;
}

/**
 * Las dos tablas que van al plano, en cm. El redondeo se hace sobre el valor
 * exacto en mm y de forma independiente para anclaje y solape: por eso HA-25
 * ø16 sale 64 cm de anclaje y 97 cm de solape, y no 96 (= 64·1,5).
 */
export function tablaAnclajes(
  fck: number,
  fyk: number,
  diametros: number[],
  alpha6 = 1.5,
): TablaAnclajes {
  const posiciones: PosicionAdherencia[] = ['I', 'II'];
  const anclaje = {} as Record<PosicionAdherencia, number[]>;
  const solape = {} as Record<PosicionAdherencia, number[]>;

  for (const posicion of posiciones) {
    anclaje[posicion] = diametros.map((phi) =>
      aCm(longitudBasicaAnclaje({ fck, fyk, phi, posicion })),
    );
    solape[posicion] = diametros.map((phi) =>
      aCm(longitudSolape({ fck, fyk, phi, posicion }, alpha6)),
    );
  }

  return { fck, fyk, diametros, anclaje, solape, alpha6 };
}

/** Las notas al pie que acompañan a la tabla en el plano. */
export const NOTAS_ANCLAJE = [
  'POSICIÓN I: adherencia buena, armaduras que forman un ángulo entre 45° y 90° con la horizontal, o que estén situadas en la mitad inferior de la sección o a una distancia igual o mayor a 30 cm de la cara superior de una capa de hormigonado.',
  'POSICIÓN II: adherencia deficiente, para las armaduras que no se encuentran en ninguno de los casos anteriores.',
  'Las longitudes de la tabla son para anclajes en prolongación recta. Si el anclaje se realiza en patilla, gancho o gancho en U, el valor se multiplicará por 0,7 para barras a tracción y por 1 para barras a compresión.',
  'Si no se indica nada en planos, se dispondrá una patilla mínima de 15 cm cuando la armadura acometa a extremos de elementos estructurales.',
  'El solape de las armaduras inferiores se realizará en las zonas sobre los pilares, y las armaduras superiores se solaparán en las zonas de centro de vano.',
];
