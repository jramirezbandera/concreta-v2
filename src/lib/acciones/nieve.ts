/**
 * Carga de nieve sobre cubiertas (DB SE-AE art. 3.5 y Anejo E).
 *
 *   qn = μ · sk                                                      (3.2)
 *   pd = (1 − μ) · L · sk         descarga del faldón                (3.4)
 *   pa = min(μi, 1) · pd          acumulación en la discontinuidad   (3.5)
 *   pn = k · μ² · sk              hielo en voladizos, > 1.000 m      (3.3)
 *
 * sk sale de la tabla 3.8 si la obra está en la capital, y si no de la E.2 por
 * zona de clima invernal y altitud, interpolando linealmente entre filas
 * (D-VN2). El coeficiente de forma μ va faldón a faldón con las reglas del
 * 3.5.3; la acumulación del 3.5.4 entra en la v1 porque el estudio la usa.
 *
 * Ninguna función de este fichero contiene un número de la norma: todos vienen
 * de `tablasAE.ts`.
 */

import { interpolar } from './interp';
import {
  ALTITUDES_TABLA_E2,
  ANCHO_ACUMULACION,
  FACTOR_EXPOSICION_NIEVE,
  HIELO_VOLADIZOS,
  MU_FALDON,
  MU_LIMAHOYA,
  NIEVE_PLANA_SIMPLIFICADA,
  TABLA_E2,
  type ExposicionNieve,
  type ZonaInvernal,
} from './tablasAE';

// ── Entrada ─────────────────────────────────────────────────────────────────

export type Limahoya =
  /** El faldón de enfrente está inclinado en sentido contrario (3.5.3-3b). */
  | { tipo: 'contrario'; inclinacionOtro: number }
  /** El faldón siguiente baja en el mismo sentido (3.5.3-3a): manda su inclinación. */
  | { tipo: 'mismoSentido'; inclinacionInferior: number };

export interface FaldonInput {
  id?: string;
  nombre?: string;
  /** Inclinación del faldón, grados sexagesimales. 0 = cubierta plana. */
  inclinacion: number;
  /** Petos, limatesas o cualquier cosa que impida deslizar la nieve → μ = 1 (3.5.3-2). */
  impedimento?: boolean;
  /** Proyección horizontal media de la línea de máxima pendiente, m. Sólo para la acumulación (3.5.4). */
  L?: number;
  /** Si el faldón limita por abajo con una limahoya. */
  limahoya?: Limahoya;
  /** Si el faldón tiene voladizos, para la carga de hielo por encima de 1.000 m. */
  voladizo?: boolean;
}

export interface NieveInput {
  zona: ZonaInvernal;
  /** Altitud del emplazamiento, m. */
  altitud: number;
  /** sk de la tabla 3.8 cuando la obra está en la capital. Manda sobre la E.2. */
  skCapital?: number;
  /** sk tecleado (ordenanza municipal, datos empíricos). Manda sobre todo. */
  skManual?: number;
  exposicion: ExposicionNieve;
  faldones: FaldonInput[];
}

// ── Salida ──────────────────────────────────────────────────────────────────

export type OrigenSk = 'manual' | 'tabla3.8' | 'anejoE';

export interface FaldonResuelto {
  id?: string;
  nombre: string;
  inclinacion: number;
  /** Coeficiente de forma del faldón. */
  mu: number;
  /** μ · sk (con el factor de exposición), kN/m². */
  qn: number;
  /** Hipótesis asimétrica: μ/2 en la parte favorable (3.5.3-4), kN/m². */
  qnAsimetrica: number;
  /** Banda de 2 m junto a la limahoya con su μ propio. */
  limahoya?: { mu: number; qn: number; ancho: number };
  /** Descarga del faldón y carga lineal en la discontinuidad de abajo. */
  acumulacion?: { pd: number; pa: number; ancho: number };
  /** Carga lineal de hielo en el borde del voladizo, kN/m. */
  hielo?: number;
}

export interface NieveResultado {
  /** Sobrecarga sobre terreno horizontal, kN/m². `null` si la altitud no está tabulada. */
  sk: number | null;
  skOrigen: OrigenSk;
  factorExposicion: number;
  /** sk × factor de exposición: lo que multiplica a μ. */
  skEfectiva: number | null;
  faldones: FaldonResuelto[];
  notas: string[];
  avisos: string[];
  errores: string[];
}

// ── Piezas ──────────────────────────────────────────────────────────────────

/**
 * Tabla E.2 interpolada en altitud. `null` si la altitud queda por encima de lo
 * tabulado para esa zona (guion en la tabla): art. 3.5.2-3.
 */
export function cargaNieveTerreno(zona: ZonaInvernal, altitud: number): number | null {
  const fila = TABLA_E2[zona];
  const xs: number[] = [];
  const ys: number[] = [];
  fila.forEach((sk, i) => {
    if (sk !== null) {
      xs.push(ALTITUDES_TABLA_E2[i]);
      ys.push(sk);
    }
  });
  if (altitud > xs[xs.length - 1]) return null;
  return interpolar(altitud, xs, ys);
}

/** Art. 3.5.3-2: μ del faldón por su inclinación, o 1 si algo impide deslizar. */
export function coeficienteForma(inclinacion: number, impedimento = false): number {
  if (impedimento) return 1;
  return interpolar(inclinacion, [MU_FALDON.inclinacionMu1, MU_FALDON.inclinacionMu0], [1, 0]);
}

/** Art. 3.5.3-3b: μ en la limahoya entre dos faldones contrarios, según la semisuma β de sus inclinaciones. */
export function coeficienteFormaLimahoya(inclinacion: number, inclinacionOtro: number): number {
  const beta = (inclinacion + inclinacionOtro) / 2;
  return Math.min(MU_LIMAHOYA.max, 1 + beta / MU_LIMAHOYA.beta);
}

/** Art. 3.5.4: descarga del faldón pd y acumulación pa en la discontinuidad de abajo. */
export function acumulacion(mu: number, L: number, sk: number, muDiscontinuidad = 1): { pd: number; pa: number } {
  const pd = (1 - mu) * L * sk;
  return { pd, pa: Math.min(muDiscontinuidad, 1) * pd };
}

/** Art. 3.5.1-4: carga lineal de hielo en el borde de un voladizo, kN/m. */
export function cargaHielo(mu: number, sk: number): number {
  return HIELO_VOLADIZOS.k * mu * mu * sk;
}

// ── Cálculo ─────────────────────────────────────────────────────────────────

function resolverSk(input: NieveInput): { sk: number | null; origen: OrigenSk } {
  if (input.skManual !== undefined) return { sk: input.skManual, origen: 'manual' };
  if (input.skCapital !== undefined) return { sk: input.skCapital, origen: 'tabla3.8' };
  return { sk: cargaNieveTerreno(input.zona, input.altitud), origen: 'anejoE' };
}

export function calcularNieve(input: NieveInput): NieveResultado {
  const errores: string[] = [];
  const avisos: string[] = [];
  const notas: string[] = [];

  const { sk, origen } = resolverSk(input);
  if (sk === null) {
    errores.push(
      `La zona ${input.zona} no está tabulada a ${input.altitud} m en la tabla E.2: la carga de nieve la fija la ordenanza municipal o los datos empíricos disponibles (art. 3.5.2-3).`,
    );
  } else if (sk < 0) {
    errores.push('La sobrecarga de nieve no puede ser negativa.');
  }

  const factorExposicion = FACTOR_EXPOSICION_NIEVE[input.exposicion];
  const skEfectiva = sk === null ? null : sk * factorExposicion;
  if (input.exposicion === 'protegida') {
    notas.push('Construcción protegida de la acción del viento: carga de nieve reducida un 20 % (art. 3.5.1-3).');
  } else if (input.exposicion === 'expuesta') {
    notas.push('Emplazamiento fuertemente expuesto: carga de nieve aumentada un 20 % (art. 3.5.1-3).');
  }

  const hielo = input.altitud > HIELO_VOLADIZOS.altitudMin;
  let descarganSinL = false;
  const faldones: FaldonResuelto[] = input.faldones.map((f, i) => {
    const nombre = f.nombre ?? `Faldón ${i + 1}`;
    if (f.inclinacion < 0 || f.inclinacion >= 90) {
      errores.push(`«${nombre}»: la inclinación tiene que estar entre 0º y 90º.`);
    }
    const mu = coeficienteForma(f.inclinacion, f.impedimento);
    const s = skEfectiva ?? 0;
    const resuelto: FaldonResuelto = {
      ...(f.id !== undefined ? { id: f.id } : {}),
      nombre,
      inclinacion: f.inclinacion,
      mu,
      qn: mu * s,
      qnAsimetrica: (mu / 2) * s,
    };
    if (f.limahoya) {
      const muL =
        f.limahoya.tipo === 'contrario'
          ? coeficienteFormaLimahoya(f.inclinacion, f.limahoya.inclinacionOtro)
          : coeficienteForma(f.limahoya.inclinacionInferior, f.impedimento);
      resuelto.limahoya = { mu: muL, qn: muL * s, ancho: ANCHO_ACUMULACION };
    }
    if (mu < 1) {
      if (f.L === undefined) {
        descarganSinL = true;
      } else {
        if (f.L <= 0) errores.push(`«${nombre}»: la proyección horizontal L tiene que ser mayor que cero.`);
        const { pd, pa } = acumulacion(mu, f.L, s, resuelto.limahoya?.mu ?? 1);
        resuelto.acumulacion = { pd, pa, ancho: ANCHO_ACUMULACION };
      }
    }
    if (hielo && f.voladizo) resuelto.hielo = cargaHielo(mu, s);
    return resuelto;
  });

  if (faldones.length === 0) errores.push('Hace falta al menos un faldón.');

  if (descarganSinL) {
    avisos.push('Hay faldones que descargan nieve aguas abajo (μ < 1): indica su proyección horizontal L si hay limahoyas o cambios de nivel donde acumular (art. 3.5.4).');
  }
  if (hielo) {
    notas.push(`Por encima de ${HIELO_VOLADIZOS.altitudMin} m, los voladizos llevan además la carga lineal de hielo pn = ${HIELO_VOLADIZOS.k}·μ²·sk (art. 3.5.1-4).`);
  }
  if (input.altitud < NIEVE_PLANA_SIMPLIFICADA.altitudMax) {
    notas.push(
      `En cubiertas planas de edificios de pisos por debajo de ${NIEVE_PLANA_SIMPLIFICADA.altitudMax} m basta considerar ${NIEVE_PLANA_SIMPLIFICADA.carga.toFixed(1).replace('.', ',')} kN/m² (art. 3.5.1-1).`,
    );
  }
  notas.push('Distribución asimétrica: coeficiente de forma reducido a la mitad en las partes donde la nieve es favorable (art. 3.5.3-4).');

  return { sk, skOrigen: origen, factorExposicion, skEfectiva, faldones, notas, avisos, errores };
}
