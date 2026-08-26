// NCSE-02 · cadena de fuerzas del método simplificado de cálculo.
//
//   emplazamiento (cap. 2)  ->  S, ac, T_A, T_B
//   estructura (art. 3.7.2) ->  T_F, número de modos, T_i
//   amortiguamiento (2.5)   ->  nu, beta
//   fuerzas (art. 3.7.3)    ->  Phi_ik, eta_ik, s_ik, F_ik
//   cortantes (art. 3.7.4)  ->  V_ik, SRSS -> V_k, F_k, reparto f_kj
//   torsión (art. 3.7.5)    ->  gamma_a
//   direccional (art. 3.4)  ->  ocho casos con signo
//
// Las puertas de aplicabilidad viven en applicability.ts y se comprueban ANTES
// de llegar aquí. Este fichero da por supuesto que la Norma es de aplicación y
// que el método simplificado es válido para el edificio.
//
// ─────────────────────────────────────────────────────────────────────────────
// UNIDADES: ab y ac son múltiplos de g, adimensionales
// ─────────────────────────────────────────────────────────────────────────────
// `ab = 0,23` significa 0,23 g. La expresión del art. 3.7.3 se escribe
// `s_ik = (ac/g)·alpha_i·beta·eta_ik` porque en el texto ac aparece como
// "0,24 g"; guardando el múltiplo adimensional, esa división es la identidad y
// AQUÍ NO SE DIVIDE POR NADA. Dividir otra vez es exactamente el fallo de
// `Sismo_ISA.xlsx` (celda Q12), que deja S un 2,69% alta.
//
// Corolario útil: g no aparece en ninguna parte de la cadena. `eta_ik` es
// invariante al factor de escala de las masas (numerador y denominador escalan
// igual), así que se trabaja con P_k en kN de principio a fin y nunca hace
// falta convertir a kg. Menos conversiones, menos sitios donde equivocarse.

import type {
  AvisoNorma,
  CasoDireccional,
  CategoriaMasa,
  DireccionInput,
  DireccionResult,
  EmplazamientoInput,
  EmplazamientoResult,
  ElementoResistente,
  Estrato,
  Importancia,
  ModoResult,
  PlantaInput,
  PlantaResuelta,
  RepartoElemento,
  RepartoPlanta,
  SeismicInput,
  SeismicResult,
  SistemaEstructural,
  TipoTerreno,
} from "./types";

// ── Constantes y tablas ──────────────────────────────────────────────────────

/** Art. 2.4. Coeficiente del terreno por tipo. */
export const COEF_TERRENO: Record<TipoTerreno, number> = {
  I: 1.0,
  II: 1.3,
  III: 1.6,
  IV: 2.0,
};

/** Art. 1.2.2 / 2.2. Coeficiente de riesgo. */
export const COEF_RIESGO: Record<Importancia, number> = {
  moderada: 1.0,
  normal: 1.0,
  especial: 1.3,
};

/** Art. 2.4: la ponderación de C se hace en los 30 m superiores. */
export const ESPESOR_PONDERACION = 30;

/**
 * Art. 3.2. Fracción de cada carga que cuenta como MASA sísmica.
 *
 * NO confundir con el psi_2 del CTE. Estas fracciones deciden qué masa se
 * sacude; el art. 3.4 decide qué gravedad actúa a la vez que el sismo, y ahí la
 * variable desfavorable entra ENTERA (1,0·G + 1,0·Q). Aplicar 0,5·Q en las dos
 * es el error natural, y no lo delata ningún número raro.
 */
export const FRACCION_MASA: Record<CategoriaMasa, number> = {
  permanente: 1.0,
  tabiqueria: 1.0,
  "uso-almacen": 1.0,
  agua: 1.0,
  "uso-publico": 0.6,
  "uso-aglomeracion": 0.6,
  "uso-residencial": 0.5,
  "nieve-persistente": 0.5,
};

/**
 * Art. 3.7.2.2, última frase: "para el resto de los edificios de hasta cuatro
 * plantas puede tomarse T_F = 0,3 segundos". Es un "puede", no un "debe": se
 * ofrece como opción explícita, nunca se aplica solo.
 */
export const TF_OTROS_HASTA_4_PLANTAS = 0.3;

/** Art. 3.7.5. Coeficiente del término de torsión. */
const COEF_TORSION = 0.6;

// ── Emplazamiento (cap. 2) ───────────────────────────────────────────────────

/** Art. 2.4. Media ponderada de C en los 30 m superiores. */
export function coefTerrenoPonderado(estratos: Estrato[]): number {
  if (estratos.length === 0) return COEF_TERRENO.I;
  let restante = ESPESOR_PONDERACION;
  let acumulado = 0;
  for (const e of estratos) {
    if (restante <= 0) break;
    const tramo = Math.min(Math.max(e.espesor, 0), restante);
    acumulado += e.C * tramo;
    restante -= tramo;
  }
  // Si el perfil no llega a 30 m, el último estrato se prolonga: dejar el hueco
  // a cero daría un C artificialmente bajo, que es el lado inseguro.
  if (restante > 0) acumulado += estratos[estratos.length - 1].C * restante;
  return acumulado / ESPESOR_PONDERACION;
}

/**
 * Art. 2.2. Coeficiente de amplificación del terreno, por tramos.
 *
 * `rho·ab` va en unidades de g. Ojo con el tramo intermedio: cuando C > 1,25 el
 * factor (1 − C/1,25) es NEGATIVO, así que el término corrector RESTA. Una
 * implementación que se equivoque de unidades ahí no falla ruidosamente: cambia
 * el signo de la corrección y sigue devolviendo un número creíble.
 */
export function amplificacionTerreno(C: number, rho: number, ab: number): number {
  const rab = rho * ab;
  if (rab <= 0.1) return C / 1.25;
  if (rab < 0.4) return C / 1.25 + 3.33 * (rab - 0.1) * (1 - C / 1.25);
  return 1.0;
}

export function resolverEmplazamiento(
  input: EmplazamientoInput,
): EmplazamientoResult {
  const { ab, K, importancia } = input;
  const rho = COEF_RIESGO[importancia];
  const C = Array.isArray(input.terreno)
    ? coefTerrenoPonderado(input.terreno)
    : COEF_TERRENO[input.terreno];
  const S = amplificacionTerreno(C, rho, ab);
  return {
    ab,
    K,
    rho,
    C,
    S,
    ac: S * rho * ab,
    TA: (K * C) / 10,
    TB: (K * C) / 2.5,
  };
}

// ── Masas (art. 3.2) ─────────────────────────────────────────────────────────

/** Peso sísmico de una planta [kN]. `P` explícito manda sobre el asistente. */
export function pesoSismicoPlanta(planta: PlantaInput): number {
  if (planta.P !== undefined) return planta.P;
  const area = planta.area ?? 0;
  const componentes = planta.componentes ?? [];
  let q = 0;
  for (const c of componentes) {
    if (c.excluida) continue;
    q += FRACCION_MASA[c.categoria] * c.q;
  }
  return area * q;
}

export function resolverPlantas(plantas: PlantaInput[]): PlantaResuelta[] {
  return plantas.map((p) => ({ h: p.h, P: pesoSismicoPlanta(p) }));
}

// ── Período fundamental (art. 3.7.2.2) ───────────────────────────────────────

/**
 * Las cinco expresiones. Devuelve `null` cuando el sistema no tiene expresión
 * tabulada: entonces hace falta un T_F del proyectista (art. 3.6.2.3.2) o la
 * opción de TF_OTROS_HASTA_4_PLANTAS. Nunca se inventa un valor.
 *
 * `L` y `B` se miden EN EL SENTIDO DE LA OSCILACIÓN, así que T_F es por
 * dirección en tres de las cinco expresiones.
 */
export function periodoFundamental(
  sistema: SistemaEstructural,
  geom: { n: number; H: number; L: number; B: number },
): number | null {
  const { n, H, L, B } = geom;
  switch (sistema) {
    case "fabrica":
      // (1) TF = 0,06·H·sqrt(H/(2L+H))/sqrt(L)
      if (!(L > 0) || !(H > 0)) return null;
      return (0.06 * H * Math.sqrt(H / (2 * L + H))) / Math.sqrt(L);
    case "porticos-ha":
      // (2) TF = 0,09·n
      return 0.09 * n;
    case "porticos-ha-pantallas":
      // (3) TF = 0,07·n·sqrt(H/(B+H))
      if (!(B + H > 0)) return null;
      return 0.07 * n * Math.sqrt(H / (B + H));
    case "porticos-acero":
      // (4) TF = 0,11·n
      return 0.11 * n;
    case "acero-triangulado":
      // (5) TF = 0,085·n·sqrt(H/(B+H))
      if (!(B + H > 0)) return null;
      return 0.085 * n * Math.sqrt(H / (B + H));
    default:
      return null;
  }
}

/** Art. 3.7.2.1. */
export function numeroModos(TF: number): 1 | 2 | 3 {
  if (TF <= 0.75) return 1;
  if (TF <= 1.25) return 2;
  return 3;
}

/** T_i = T_F/(2i−1). Los períodos difieren siempre más de un 10%, que es lo que
 *  el art. 3.6.2.4 exige para poder combinar por SRSS. */
export function periodoModo(TF: number, i: number): number {
  return TF / (2 * i - 1);
}

// ── Amortiguamiento y ductilidad ─────────────────────────────────────────────

/** Art. 2.5. nu = (5/Omega)^0,4, con Omega en %. */
export function factorAmortiguamiento(omega: number): number {
  if (!(omega > 0)) return 1;
  return Math.pow(5 / omega, 0.4);
}

/** Art. 3.7.3.1. beta = nu/mu. */
export function coefRespuesta(nu: number, mu: number): number {
  if (!(mu > 0)) return nu;
  return nu / mu;
}

// ═════════════════════════════════════════════════════════════════════════════
// LAS DOS ALPHAS. No son la misma función y no se pueden intercambiar.
// ═════════════════════════════════════════════════════════════════════════════
//
//   art. 2.3    espectro elástico. Es el que se DIBUJA.
//   art. 3.7.3  coeficiente de las FUERZAS estáticas equivalentes.
//
// Por encima de T_A las dos son idénticas, incluso algebraicamente en la rama
// descendente: T_B = K·C/2,5 implica 2,5·(T_B/T) = K·C/T. La única diferencia
// está POR DEBAJO DE T_A, donde el elástico baja por la rama ascendente y el de
// las fuerzas se queda en 2,5.
//
// Y no es un caso raro: muerde en fábrica achaparrada, en el modo fundamental,
// como régimen habitual. Con H = 12 m y L = 20 m sale T_F = 0,077 s frente a un
// T_A = 0,13 s, y usar el elástico daría fuerzas un 24% BAJAS.
//
// Por eso son dos funciones separadas y no una con un parámetro: un booleano
// invita a pasar el valor equivocado.

/** Art. 2.3. Espectro normalizado de respuesta elástica. Para dibujar. */
export function elasticSpectrum(T: number, TA: number, TB: number): number {
  if (!(TA > 0) || !(TB > 0)) return 0;
  if (T < TA) return 1 + (1.5 * T) / TA;
  if (T <= TB) return 2.5;
  return (2.5 * TB) / T;
}

/** Art. 3.7.3. alpha_i de las fuerzas. NO tiene rama ascendente. */
export function staticForceAlpha(Ti: number, TB: number): number {
  if (!(TB > 0)) return 0;
  if (Ti <= TB) return 2.5;
  return (2.5 * TB) / Ti;
}

// ── Fuerzas sísmicas (art. 3.7.3) ────────────────────────────────────────────

/** Phi_ik = sen[(2i−1)·pi·h_k/(2H)]. Expresión "aproximada" según la Norma. */
export function formaModal(i: number, hk: number, H: number): number {
  if (!(H > 0)) return 0;
  return Math.sin(((2 * i - 1) * Math.PI * hk) / (2 * H));
}

/**
 * eta_ik = Phi_ik · SUM(P_r·Phi_ir) / SUM(P_r·Phi_ir²).
 *
 * Invariante al factor de escala de P: numerador y denominador escalan igual.
 * Da lo mismo trabajar en kN o en kg, y por eso g no aparece en la cadena.
 */
export function factorDistribucion(Phi: number[], P: number[]): number[] {
  let num = 0;
  let den = 0;
  for (let r = 0; r < Phi.length; r++) {
    num += P[r] * Phi[r];
    den += P[r] * Phi[r] * Phi[r];
  }
  if (!(Math.abs(den) > 0)) return Phi.map(() => 0);
  return Phi.map((f) => (f * num) / den);
}

/** Fracción de la masa total movilizada por el modo. */
export function participacionModal(Phi: number[], P: number[]): number {
  let num = 0;
  let den = 0;
  let total = 0;
  for (let r = 0; r < Phi.length; r++) {
    num += P[r] * Phi[r];
    den += P[r] * Phi[r] * Phi[r];
    total += P[r];
  }
  if (!(Math.abs(den) > 0) || !(total > 0)) return 0;
  return (num * num) / (den * total);
}

/** Un modo completo: Phi, eta, s, F y V. */
export function calcularModo(
  i: number,
  TF: number,
  plantas: PlantaResuelta[],
  H: number,
  ac: number,
  beta: number,
  TB: number,
): ModoResult {
  const T = periodoModo(TF, i);
  // AQUÍ es donde muerde la trampa. Cambiar esta llamada por elasticSpectrum
  // debe romper el test de extremo a extremo de la fábrica achaparrada.
  const alpha = staticForceAlpha(T, TB);
  const P = plantas.map((p) => p.P);
  const Phi = plantas.map((p) => formaModal(i, p.h, H));
  const eta = factorDistribucion(Phi, P);
  // ac ya es adimensional (múltiplo de g): no se divide por nada.
  const s = eta.map((e) => ac * alpha * beta * e);
  const F = s.map((sk, k) => sk * P[k]);
  const V = F.map((_, k) => F.slice(k).reduce((a, b) => a + b, 0));
  return {
    i,
    T,
    alpha,
    Phi,
    eta,
    s,
    F,
    V,
    participacion: participacionModal(Phi, P),
  };
}

// ── Cortantes y combinación modal (art. 3.7.4) ───────────────────────────────

/** SRSS de los cortantes de planta. Admitido por el art. 3.6.2.4. */
export function combinarSRSS(Vporwodo: number[][]): number[] {
  if (Vporwodo.length === 0) return [];
  const n = Vporwodo[0].length;
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    let acc = 0;
    for (const V of Vporwodo) acc += V[k] * V[k];
    out.push(Math.sqrt(acc));
  }
  return out;
}

/**
 * F_k = V_k − V_(k+1), con V_(n+1) = 0 por definición.
 *
 * Puede salir NEGATIVA en plantas altas con 2 o 3 modos: el SRSS destruye el
 * signo y el perfil combinado no tiene por qué ser monótono. Es un resultado
 * legítimo del método y NO se recorta a cero.
 */
export function fuerzasPorPlanta(Vk: number[]): number[] {
  return Vk.map((v, k) => v - (k + 1 < Vk.length ? Vk[k + 1] : 0));
}

// ── Torsión y reparto (art. 3.7.5 y 3.7.4) ───────────────────────────────────

/** Distancia entre los dos elementos más extremos [m]. */
export function longitudExtrema(elementos: ElementoResistente[]): number {
  if (elementos.length < 2) return 0;
  const xs = elementos.map((e) => e.x);
  return Math.max(...xs) - Math.min(...xs);
}

/**
 * gamma_a = 1 + 0,6·|x|/L_e.
 *
 * Es el ÚNICO sitio donde se aplica el valor absoluto de x. El estado guarda el
 * signo, que hace falta para situar el centro de torsión y para el requisito
 * (6) del art. 3.5.1.
 */
export function gammaTorsion(x: number, Le: number): number {
  if (!(Le > 0)) return 1;
  return 1 + (COEF_TORSION * Math.abs(x)) / Le;
}

/**
 * f_kj = gamma_a(x_j) · F_k · k_kj / SUM_j(k_kj).
 *
 * La suma de f_kj SUPERA F_k: gamma_a amplifica, no redistribuye. Es lo que
 * dice la Norma y conviene que el PDF lo haga constar, porque al verlo por
 * primera vez parece un error de suma.
 */
export function repartoPorElemento(
  Fk: number,
  elementos: ElementoResistente[],
  Le: number,
): RepartoElemento[] {
  const sumK = elementos.reduce((a, e) => a + e.k, 0);
  return elementos.map((e) => {
    // Guardas: sin elementos o con rigideces nulas no hay reparto posible.
    const cuota = sumK > 0 ? e.k / sumK : 0;
    const fBase = Fk * cuota;
    const gamma = gammaTorsion(e.x, Le);
    return { id: e.id, x: e.x, k: e.k, fBase, gamma, f: fBase * gamma };
  });
}

// ── Combinación direccional (art. 3.4) ───────────────────────────────────────

/**
 * OCHO casos, con signo. No cuatro.
 *
 * El sismo es reversible, así que el signo de la dirección principal también se
 * recorre: una acción que descarga un pilar y otra que lo carga no producen el
 * mismo efecto al combinarse con la gravedad. Una envolvente sin signo sirve
 * para presentar cortantes de planta y para nada más.
 */
export function combinacionesDireccionales(
  Vx: number,
  Vy: number,
): CasoDireccional[] {
  const casos: CasoDireccional[] = [];
  let n = 1;
  for (const principal of ["x", "y"] as const) {
    for (const sPrin of [1, -1]) {
      for (const sSec of [1, -1]) {
        const fx = principal === "x" ? sPrin : 0.3 * sSec;
        const fy = principal === "x" ? 0.3 * sSec : sPrin;
        casos.push({ id: "E" + n++, fx, fy, Vx: fx * Vx, Vy: fy * Vy });
      }
    }
  }
  return casos;
}

// ── Una dirección completa ───────────────────────────────────────────────────

export function calcularDireccion(
  dir: DireccionInput,
  estructura: SeismicInput["estructura"],
  plantas: PlantaResuelta[],
  emp: EmplazamientoResult,
  beta: number,
): DireccionResult {
  const avisos: AvisoNorma[] = [];
  const { sistema, n, H, nModos: nModosForzado } = estructura;

  const TFCalculado = periodoFundamental(sistema, {
    n,
    H,
    L: dir.L,
    B: dir.B,
  });
  const TFManual = dir.TFManual !== undefined;
  const TF = dir.TFManual ?? TFCalculado ?? 0;

  if (!TFManual && TFCalculado === null) {
    avisos.push({
      id: "sin-expresion-tf",
      articulo: "3.7.2.2",
      severidad: "bloqueo",
      texto:
        "El sistema estructural elegido no tiene expresión de T_F en el art. " +
        "3.7.2.2. Introduzca T_F a mano (art. 3.6.2.3.2) o, si el edificio no " +
        "pasa de cuatro plantas, tome T_F = 0,3 s.",
    });
  }

  const nModos = nModosForzado ?? numeroModos(TF);
  const modos: ModoResult[] = [];
  for (let i = 1; i <= nModos; i++) {
    modos.push(calcularModo(i, TF, plantas, H, emp.ac, beta, emp.TB));
  }

  const Vk = combinarSRSS(modos.map((m) => m.V));
  const Fk = fuerzasPorPlanta(Vk);
  const Le = longitudExtrema(dir.elementos);

  if (dir.elementos.length === 0) {
    avisos.push({
      id: "sin-elementos",
      articulo: "3.7.4",
      severidad: "aviso",
      texto:
        "No se han definido elementos resistentes en esta dirección: no hay " +
        "reparto de las fuerzas de planta.",
    });
  } else if (Le === 0) {
    avisos.push({
      id: "le-nulo",
      articulo: "3.7.5",
      severidad: "aviso",
      texto:
        "Todos los elementos resistentes están en la misma coordenada, o sólo " +
        "hay uno: L_e = 0 y no se aplica el coeficiente de torsión gamma_a.",
    });
  }
  if (dir.elementos.length > 0 && dir.elementos.reduce((a, e) => a + e.k, 0) <= 0) {
    avisos.push({
      id: "rigidez-nula",
      articulo: "3.7.4",
      severidad: "aviso",
      texto:
        "La suma de rigideces de la dirección es cero: no se puede repartir la " +
        "fuerza de planta entre los elementos.",
    });
  }
  if (Fk.some((f) => f < 0)) {
    avisos.push({
      id: "fk-negativa",
      articulo: "3.7.4",
      severidad: "info",
      texto:
        "Alguna fuerza de planta sale negativa. Es un resultado legítimo del " +
        "SRSS, que destruye el signo de los modos: el perfil combinado no " +
        "tiene por qué ser monótono.",
    });
  }

  const reparto: RepartoPlanta[] = Fk.map((f, k) => ({
    k: k + 1,
    Fk: f,
    elementos: repartoPorElemento(f, dir.elementos, Le),
  }));

  return {
    TF,
    TFManual,
    nModos,
    modos,
    Vk,
    Fk,
    cortanteBasal: Vk.length > 0 ? Vk[0] : 0,
    participacionTotal: modos.reduce((a, m) => a + m.participacion, 0),
    Le,
    reparto,
    avisos,
  };
}

// ── Cadena completa ──────────────────────────────────────────────────────────

export function calcularSismo(input: SeismicInput): SeismicResult {
  const emp = resolverEmplazamiento(input.emplazamiento);
  const nu = factorAmortiguamiento(input.estructura.omega);
  const beta = coefRespuesta(nu, input.estructura.mu);

  // Orden ascendente por altura: k = 1 es la planta más baja sobre rasante y
  // toda la cadena (Phi, V_ik acumulado, F_k) depende de ese orden.
  const plantas = resolverPlantas(input.plantas).sort((a, b) => a.h - b.h);
  const pesoSismico = plantas.reduce((a, p) => a + p.P, 0);

  const x = calcularDireccion(input.x, input.estructura, plantas, emp, beta);
  const y = calcularDireccion(input.y, input.estructura, plantas, emp, beta);

  return {
    emplazamiento: emp,
    nu,
    beta,
    plantas,
    pesoSismico,
    x,
    y,
    direccionales: combinacionesDireccionales(x.cortanteBasal, y.cortanteBasal),
    avisos: [...x.avisos, ...y.avisos],
  };
}
