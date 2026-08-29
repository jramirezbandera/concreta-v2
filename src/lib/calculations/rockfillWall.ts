// Muro de escollera colocada / gaviones — muro de gravedad sin armadura.
// Guía para el proyecto y la ejecución de muros de escollera en obras de
// carretera (Ministerio de Fomento, 2006) + CTE DB-SE-C + NCSE-02/NCSP-07.
// Todos los cálculos por metro de muro (1 m).
//
// Modelo:
//  - Empuje activo por Coulomb (Müller-Breslau) sobre un PLANO VIRTUAL VERTICAL
//    situado en el punto más retrasado del muro (trasdós de coronación o talón
//    del cimiento). El terreno comprendido entre el trasdós real (inclinado o
//    escalonado) y ese plano se trata como peso estabilizador solidario con el
//    muro. Se descartó aplicar Coulomb sobre el plano inclinado real: la
//    formulación con λ≠0 no es reproducible contra el ejemplo de referencia de
//    2005 (Recomendaciones 1998, formulación propia) y el método del plano
//    virtual es el estándar de la Guía de cimentaciones.
//  - Comprobación HILADA A HILADA (estabilidad local, Guía 2006 §4.2.2.4): en
//    cada corte z se comprueba el deslizamiento piedra sobre piedra en el plano
//    contrainclinado de las hiladas y el vuelco parcial (excentricidad).
//  - Comprobación de SÓLIDO RÍGIDO en la base: vuelco, deslizamiento en el
//    plano de apoyo contrainclinado (ejes n-t) y tensión con ancho equivalente
//    de Meyerhof b' = B − 2·|e|.
//  - Sismo: Mononobe-Okabe pseudoestático (misma convención que el módulo de
//    muros de contención: θ = atan(kh/(1−kv)), empuje escalado por (1−kv)).
//
// Guía escolleras Fomento 2006 §2.2/§2.3 — criterios geométricos
// Guía escolleras Fomento 2006 §4.1     — parámetros geomecánicos (γap, φ)
// Guía escolleras Fomento 2006 §4.2     — modos de fallo
// CTE DB-SE-C §4.4 / Tabla 2.1          — estabilidad de la cimentación
// NCSE-02 / NCSP-07                     — acción sísmica

import {
  type RockfillWallInputs,
  type RockfillLitologia,
} from '../../data/defaults';
import { makeCheck, makeCheckQty, makeCheckNeutral, toStatus, type CheckRow } from './types';

export type { CheckRow } from './types';

const GAMMA_W = 10;    // kN/m³ — peso específico del agua
// Factor de movilización del empuje pasivo (misma justificación que en el
// módulo de muros de contención: CTE DB-SE-C §6.3.2 / EC7 §9.5.3).
const PASSIVE_MOBILIZATION = 0.5;
const N_INTERVALS = 50;          // cortes de hilada en escollera (paridad con la hoja del usuario)
const GAMMA_R_HILADA = 1.5;      // coef. seguridad deslizamiento entre hiladas
const GAMMA_R_HILADA_SEIS = 1.1; // ídem, situación sísmica
const GAMMA_V_HILADA = 2.0;      // coef. seguridad vuelco parcial (e ≤ b/(2·γv))
const ALPHA_3H1V = Math.atan(1 / 3) * 180 / Math.PI;  // 18.43° — contrainclinación de referencia

/** Ángulo de rozamiento básico φb por litología — Guía 2006 tabla 4.2 (punto
 *  medio del rango; el proyectista puede afinar con el modo 'directo'). */
export const PHI_B_LITOLOGIA: Record<RockfillLitologia, number> = {
  granito: 40.5,
  gneis: 41.5,
  cuarcita: 39.5,
  basalto: 40.5,
  riolita: 41.5,
  granodiorita: 41.5,
  caliza: 39.5,
  conglomerado: 40.0,
  arenisca: 38.5,
};

/**
 * Coeficiente de empuje activo de Coulomb (Müller-Breslau) para plano de empuje
 * VERTICAL, con rozamiento muro-terreno δ y terreno inclinado β.
 * Casos reducidos: δ=β=0 → Rankine tan²(45−φ/2); β=0 → fórmula del módulo de
 * muros de contención. Verificado contra la hoja del usuario (KAE = 0.3218517
 * para φ=28, δ=18, β=0).
 */
export function kaCoulomb(phiDeg: number, deltaDeg: number, betaDeg: number): number {
  const p = (phiDeg * Math.PI) / 180;
  const d = (deltaDeg * Math.PI) / 180;
  const b = (betaDeg * Math.PI) / 180;
  const rad = (Math.sin(p + d) * Math.sin(p - b)) / (Math.cos(d) * Math.cos(b));
  const den = Math.cos(d) * Math.pow(1 + Math.sqrt(Math.max(rad, 0)), 2);
  return (Math.cos(p) * Math.cos(p)) / Math.max(den, 1e-12);
}

/**
 * Coeficiente activo sísmico de Mononobe-Okabe para plano vertical y ángulo
 * sísmico θ (rad). Misma convención que el módulo de muros de contención
 * (θ = atan(kh/(1−kv)); el factor (1−kv) se aplica fuera, sobre el empuje).
 * Con θ=0 degenera exactamente en kaCoulomb.
 */
export function kadMononobeOkabe(
  phiDeg: number, deltaDeg: number, betaDeg: number, theta: number,
): number {
  const p = (phiDeg * Math.PI) / 180;
  const d = (deltaDeg * Math.PI) / 180;
  const b = (betaDeg * Math.PI) / 180;
  const phi_e = Math.max(p - theta, 0);
  const cdt = Math.cos(d + theta);
  const rad = (Math.sin(p + d) * Math.sin(Math.max(p - b - theta, 0))) /
    Math.max(cdt * Math.cos(b), 1e-9);
  const den = Math.cos(theta) * cdt * Math.pow(1 + Math.sqrt(Math.max(rad, 0)), 2);
  return (Math.cos(phi_e) * Math.cos(phi_e)) / Math.max(den, 1e-12);
}

/**
 * Ángulo de rozamiento interno de la escollera colocada — Guía 2006 §4.1.3:
 * φ = φb + Δφe − Δφn, con Δφn = φn·log10(σn/pa) ≥ 0 (φn = 7°, pa = 0.1 MPa).
 * σn en kPa. No requiere iteración: σn no depende de φ del muro (φ solo entra
 * en el lado resistente de las comprobaciones entre hiladas).
 */
export function phiEscolleraGuia(
  phiB: number, dPhiE: number, sigmaN_kPa: number,
): { phi: number; dPhiN: number } {
  const dPhiN = sigmaN_kPa > 0 ? Math.max(7 * Math.log10(sigmaN_kPa / 100), 0) : 0;
  return { phi: Math.max(phiB + dPhiE - dPhiN, 0), dPhiN };
}

/** Fila de cajas de gaviones (coordenadas x desde la punta de la puntera). */
export interface RockfillRowBox {
  zTop: number;
  zBot: number;
  w: number;
  xFront: number;
  xBack: number;
}

/** Geometría derivada que consumen el SVG y el PDF (evita duplicar la lógica). */
export interface RockfillGeometry {
  x0: number;
  xT: number;
  hz: number;
  H: number;          // altura efectiva del cuerpo (gaviones: nRows·hCaja)
  bBase: number;
  B: number;
  xPlane: number;     // x del plano virtual de empuje
  xb0: number;        // x del trasdós en coronación
  mIntra: number;
  mTras: number;
  rows?: RockfillRowBox[];
}

export interface CourseCutPoint {
  z: number;          // profundidad del corte desde coronación (m)
  b: number;          // ancho de contacto de la hilada/junta (m)
  N: number;          // fuerza normal-vertical sobre el corte (kN/m)
  Q: number;          // fuerza horizontal sobre el corte (kN/m)
  M: number;          // momento neto respecto al centro del corte (kN·m/m, + hacia intradós)
  e: number;          // excentricidad de la resultante (m, + hacia intradós)
  utilSlide: number;  // índice deslizamiento entre hiladas (γR incluido, ≤ 1)
  utilOvert: number;  // índice vuelco parcial (γv incluido, ≤ 1)
  utilSlideSeis?: number;
}

export interface RockfillWallResult {
  valid: boolean;
  error?: string;
  // Coeficientes
  Ka: number;
  KAD?: number;               // solo con kh > 0
  Kp?: number;                // Rankine, solo con usePassive
  kh_derived: number;
  kv_derived: number;
  // Material del muro
  phiEff: number;             // φ del material del muro empleado (°)
  phiPP: number;              // ángulo de rozamiento entre hiladas empleado (°)
  dPhiN?: number;             // solo modo 'guia'
  sigmaN?: number;            // kPa, solo modo 'guia'
  // Geometría derivada
  B: number;                  // ancho del cimiento (m)
  bBase: number;              // ancho del cuerpo en su base (m)
  H_total: number;            // altura total cuerpo + cimiento (m)
  nRows?: number;             // gaviones: nº de filas
  H_eff?: number;             // gaviones: altura efectiva nRows·hCaja (m)
  // Acciones
  Ea: number;                 // empuje activo del relleno (resultante, kN/m)
  EAH_total: number;          // componente horizontal total incl. agua (kN/m)
  Ev: number;                 // componente vertical del empuje (kN/m)
  EW?: number;                // empuje hidrostático (kN/m)
  Ep?: number;                // resistencia pasiva movilizada (kN/m)
  EpHeight?: number;          // m
  W_muro: number;             // peso del cuerpo (kN/m)
  W_cimiento: number;         // peso del cimiento (kN/m)
  W_relleno: number;          // terreno solidario entre trasdós real y plano virtual (kN/m)
  ΣV: number;                 // kN/m
  // Base
  e: number;                  // excentricidad (m, + hacia puntera)
  bEq: number;                // ancho equivalente de Meyerhof (m)
  sigma_ref: number;          // tensión de referencia ΣV/b' (kPa)
  sigma_max: number;          // tensión de borde máxima (kPa, distribución trapezoidal)
  sigma_min: number;          // tensión de borde mínima (kPa)
  FS_vuelco: number;
  FS_desliz: number;
  FS_vuelco_seis?: number;
  FS_desliz_seis?: number;
  seismicUnstable?: boolean;
  // Hiladas
  courses: CourseCutPoint[];
  worstSlide: { z: number; util: number };
  worstOvert: { z: number; util: number };
  worstSlideSeis?: { z: number; util: number };
  geom: RockfillGeometry;
  checks: CheckRow[];
}

function invalid(error: string): RockfillWallResult {
  return {
    valid: false, error,
    Ka: 0, kh_derived: 0, kv_derived: 0,
    phiEff: 0, phiPP: 0,
    B: 0, bBase: 0, H_total: 0,
    Ea: 0, EAH_total: 0, Ev: 0,
    W_muro: 0, W_cimiento: 0, W_relleno: 0, ΣV: 0,
    e: 0, bEq: 0, sigma_ref: 0, sigma_max: 0, sigma_min: 0,
    FS_vuelco: 0, FS_desliz: 0,
    courses: [], worstSlide: { z: 0, util: 0 }, worstOvert: { z: 0, util: 0 },
    geom: { x0: 0, xT: 0, hz: 0, H: 0, bBase: 0, B: 0, xPlane: 0, xb0: 0, mIntra: 0, mTras: 0 },
    checks: [],
  };
}

/** Peso y momento estático (∫γ·x·dA) de una franja de cuña de terreno de ancho
 *  lineal w(ζ) = w0 + m·ζ entre el trasdós y el plano virtual (x = xPlane),
 *  integrada en [z1, z2] con peso específico γ. */
function wedgeSlice(
  xPlane: number, w0: number, m: number, z1: number, z2: number, gamma: number,
): { W: number; Mx: number; My: number } {
  if (z2 <= z1) return { W: 0, Mx: 0, My: 0 };
  const A  = (z: number) => w0 * z + m * z * z / 2;
  const I2 = (z: number) => w0 * w0 * z + w0 * m * z * z + m * m * z * z * z / 3;
  const Iy = (z: number) => w0 * z * z / 2 + m * z * z * z / 3;   // ∫w·ζ dζ
  const area = A(z2) - A(z1);
  const sx   = xPlane * area - (I2(z2) - I2(z1)) / 2;             // ∫w·(xPlane − w/2)dζ
  const sy   = Iy(z2) - Iy(z1);                                    // profundidad desde coronación
  return { W: gamma * area, Mx: gamma * sx, My: gamma * sy };
}

export function calcRockfillWall(inp: RockfillWallInputs): RockfillWallResult {
  // ── 0. Validación ────────────────────────────────────────────────────────
  const isGavion = inp.wallType === 'gaviones';
  if (inp.H <= 0)  return invalid('H debe ser > 0');
  if (inp.a <= 0)  return invalid('El ancho de coronación debe ser > 0');
  if (inp.hz <= 0) return invalid('El canto del cimiento debe ser > 0');
  if (inp.x0 < 0 || inp.xT < 0) return invalid('Los vuelos del cimiento no pueden ser negativos');
  if (inp.df < 0)  return invalid('El empotramiento frontal no puede ser negativo');
  if (!isGavion && (inp.mIntra < 0 || inp.mTras < 0))
    return invalid('Los taludes del cuerpo no pueden ser negativos');
  if (isGavion && inp.hCaja <= 0) return invalid('La altura de caja debe ser > 0');
  if (isGavion && inp.stepCaja < 0) return invalid('El escalón entre filas no puede ser negativo');
  if (inp.gammaAp <= 0 || inp.gammaSuelo <= 0)
    return invalid('Los pesos específicos deben ser > 0');
  if (inp.alphaHiladas < 0 || inp.alphaHiladas >= 45 || inp.alphaBatter < 0 || inp.alphaBatter >= 45)
    return invalid('Contrainclinación de hiladas fuera de rango (0–45°)');
  if (inp.alphaBase < 0 || inp.alphaBase >= 45)
    return invalid('Contrainclinación de la base fuera de rango (0–45°)');

  // ── 1. Geometría del cuerpo ──────────────────────────────────────────────
  // Coordenada x desde la punta de la puntera del cimiento, positiva hacia el
  // relleno. Coordenada z desde coronación, hacia abajo.
  const x0 = inp.x0;
  const xT = inp.xT;
  const hz = inp.hz;

  let H = inp.H;
  let nRows: number | undefined;
  const rows: RockfillRowBox[] = [];
  let bBase: number;
  let xb0: number;                       // x del trasdós en coronación
  const c = inp.mIntra - inp.mTras;      // crecimiento del ancho hacia abajo (escollera)

  if (isGavion) {
    nRows = Math.max(1, Math.round(inp.H / inp.hCaja));
    if (nRows > 100) return invalid('Demasiadas filas de cajas (máx. 100)');
    H = nRows * inp.hCaja;
    bBase = inp.a + (nRows - 1) * inp.stepCaja;
    const tanB = Math.tan((inp.alphaBatter * Math.PI) / 180);
    for (let i = 1; i <= nRows; i++) {
      const zTop = (i - 1) * inp.hCaja;
      const zBot = i * inp.hCaja;
      const w = inp.a + (i - 1) * inp.stepCaja;
      // Desfase por contrainclinación global: las filas superiores se retranquean
      // hacia el relleno; la fila inferior queda enrasada con el vuelo x0.
      const shift = tanB * (H - zBot);
      const xFront = inp.stepAlign === 'front'
        ? x0 + shift
        : x0 + bBase - w + shift;
      rows.push({ zTop, zBot, w, xFront, xBack: xFront + w });
    }
    xb0 = rows[0].xBack;
  } else {
    bBase = inp.a + c * H;
    if (bBase <= 0) return invalid('El trasdós no puede cruzar el intradós (ancho en base ≤ 0)');
    xb0 = x0 + inp.mIntra * H + inp.a;
  }

  const B = x0 + bBase + xT;
  if (B <= 0) return invalid('Anchura del cimiento debe ser > 0');
  const H_total = H + hz;
  const hwEff = (inp.hasWater as boolean) ? Math.max(inp.hw, 0) : H_total + 1;
  const dEmb = inp.df + hz;

  // Plano virtual de empuje: por el punto más retrasado del conjunto muro+cimiento.
  const xPlane = isGavion
    ? Math.max(B, ...rows.map((r) => r.xBack))
    : Math.max(B, xb0);

  // ── 1b. Coeficientes sísmicos (NCSP-07 / NCSE-02) ────────────────────────
  const kh = inp.S * inp.Ab;
  const kv = kh / 2;

  // ── 2. Coeficientes de empuje ────────────────────────────────────────────
  if (inp.beta >= inp.phiRelleno)
    return invalid('El talud del terreno β debe ser menor que φ del relleno');
  const Ka = kaCoulomb(inp.phiRelleno, inp.delta, inp.beta);
  const delta_r = (inp.delta * Math.PI) / 180;
  const cos_d = Math.cos(delta_r);
  const sin_d = Math.sin(delta_r);
  const phiRelleno_r = (inp.phiRelleno * Math.PI) / 180;
  const sin_phi = Math.sin(phiRelleno_r);
  const Kp_rankine = (1 + sin_phi) / Math.max(1 - sin_phi, 1e-9);
  const usePassive = inp.usePassive === true && dEmb > 0;

  const gamma_sub = inp.gammaSat - GAMMA_W;

  // Ley de empujes sobre el plano virtual por encima de un corte a profundidad
  // z (activo Coulomb + hidrostático). Devuelve componentes y momento
  // volcador respecto al corte (brazos por componente, patrón del módulo de
  // muros de contención).
  const press = (z: number, K: number, Ksub: number) => {
    const h_d = Math.min(hwEff, z);
    const h_w = z - h_d;
    const E_dry  = 0.5 * K * inp.gammaSuelo * h_d * h_d;
    const E_q    = K * inp.q * z;
    const E_rect = K * inp.gammaSuelo * h_d * h_w;
    const E_tri  = 0.5 * Ksub * gamma_sub * h_w * h_w;
    const Esoil  = E_dry + E_q + E_rect + E_tri;
    const EW     = 0.5 * GAMMA_W * h_w * h_w;
    const Eh     = Esoil * cos_d + EW;
    const Ev     = Esoil * sin_d;
    const Mo = E_dry * cos_d * (h_w + h_d / 3)
             + E_q * cos_d * (z / 2)
             + E_rect * cos_d * (h_w / 2)
             + E_tri * cos_d * (h_w / 3)
             + EW * (h_w / 3);
    return { Esoil, Eh, Ev, EW, Mo, h_w };
  };

  // ── 3. Pesos y centroides ────────────────────────────────────────────────
  // Cuerpo del muro por encima de un corte z: peso W, momento estático en x
  // (Mx = ∫γ·x·dA) y en profundidad (My = ∫γ·ζ·dA, ζ desde coronación).
  const wallAbove = (z: number): { W: number; Mx: number; My: number } => {
    if (isGavion) {
      let W = 0, Mx = 0, My = 0;
      for (const r of rows) {
        if (r.zBot > z + 1e-9) break;
        const Wr = inp.gammaAp * r.w * (r.zBot - r.zTop);
        W += Wr;
        Mx += Wr * (r.xFront + r.w / 2);
        My += Wr * (r.zTop + r.zBot) / 2;
      }
      return { W, Mx, My };
    }
    // Trapecio continuo: b(ζ) = a + c·ζ; xmid(ζ) = K + s·ζ.
    const K = x0 + inp.mIntra * H + inp.a / 2;
    const s = c / 2 - inp.mIntra;
    const A  = inp.a * z + c * z * z / 2;
    const Sx = K * inp.a * z + (K * c + s * inp.a) * z * z / 2 + s * c * z * z * z / 3;
    const Sy = inp.a * z * z / 2 + c * z * z * z / 3;
    return { W: inp.gammaAp * A, Mx: inp.gammaAp * Sx, My: inp.gammaAp * Sy };
  };

  // Cuña de terreno solidaria (entre trasdós real y plano virtual) por encima
  // de un corte z, con partición seco/saturado en hwEff.
  const wedgeAbove = (z: number): { W: number; Mx: number; My: number } => {
    let W = 0, Mx = 0, My = 0;
    const addSlice = (xp: number, w0: number, m: number, z1: number, z2: number, zOff: number) => {
      // zOff: origen local de la ley w(ζ) respecto a coronación
      const zw = Math.min(Math.max(hwEff - zOff, z1), z2);
      const dry = wedgeSlice(xp, w0, m, z1, Math.max(zw, z1), inp.gammaSuelo);
      const wet = wedgeSlice(xp, w0, m, Math.max(zw, z1), z2, inp.gammaSat);
      W += dry.W + wet.W;
      Mx += dry.Mx + wet.Mx;
      // My local (ζ desde el arranque de la franja) + traslado al origen en coronación
      My += dry.My + wet.My + zOff * (dry.W + wet.W);
    };
    if (isGavion) {
      for (const r of rows) {
        if (r.zTop >= z - 1e-9) break;
        const zBot = Math.min(r.zBot, z);
        const wWedge = Math.max(xPlane - r.xBack, 0);
        if (wWedge > 0) addSlice(xPlane, wWedge, 0, 0, zBot - r.zTop, r.zTop);
      }
    } else {
      // Cuerpo: w(ζ) = (xPlane − xb0) + mTras·ζ
      addSlice(xPlane, xPlane - xb0, inp.mTras, 0, Math.min(z, H), 0);
    }
    // Tramo del cimiento (solo interviene en la base, z = H_total)
    if (z > H + 1e-9) {
      const wF = Math.max(xPlane - B, 0);
      if (wF > 0) addSlice(xPlane, wF, 0, 0, Math.min(z, H_total) - H, H);
    }
    return { W, Mx, My };
  };

  // ── 4. Empuje estático total y fuerzas en la base ────────────────────────
  const pT = press(H_total, Ka, Ka);
  const Ea = pT.Esoil;
  const Ev = pT.Ev;
  const EW_total = pT.EW;
  const EAH_total = pT.Eh;
  const h_wet_total = pT.h_w;

  const wallT  = wallAbove(H);
  const wedgeT = wedgeAbove(H_total);
  const W_muro     = wallT.W;
  const W_cimiento = inp.gammaAp * B * hz;
  const W_relleno  = wedgeT.W;
  // Sobrecarga sobre la franja de terreno solidario (favorable → se excluye de
  // estabilidad con γQ,fav = 0; se mantiene para tensiones, patrón del módulo
  // de muros de contención).
  const wQ = Math.max(xPlane - xb0, 0);
  const W_q = inp.q * wQ;
  const x_q = xPlane - wQ / 2;

  // Subpresión con NF sobre la base (misma hipótesis que el módulo donante).
  const U_uplift = GAMMA_W * h_wet_total * B;

  const Ep = usePassive
    ? PASSIVE_MOBILIZATION * 0.5 * Kp_rankine * inp.gammaSuelo * dEmb * dEmb
    : 0;
  const arm_Ep = dEmb / 3;

  const ΣV = W_muro + W_cimiento + W_relleno + W_q + Ev - U_uplift;
  if (ΣV <= 0) return invalid('Empuje hidrostático mayor que el peso total — el muro levanta');

  const Mr = wallT.Mx + wedgeT.Mx
           + W_cimiento * (B / 2)
           + W_q * x_q
           + Ev * xPlane
           - U_uplift * (B / 2)
           + Ep * arm_Ep;
  const Mo = pT.Mo;

  // ── 5. Estabilidad de sólido rígido en la base ───────────────────────────
  const ΣV_estab = ΣV - W_q;
  const Mr_estab = Mr - W_q * x_q;
  const FS_vuelco = Mo > 0 ? Mr_estab / Mo : Infinity;

  // Deslizamiento en el plano de apoyo contrainclinado α_base (ejes n-t):
  // la componente del peso a favor del plano se resta de la acción, la normal
  // aumenta con el empuje. Con contrainclinación suficiente el muro es
  // autoestable (T ≤ 0 → FS = ∞).
  const ab = (inp.alphaBase * Math.PI) / 180;
  const slideFS = (Hdrive: number, V: number): number => {
    const T  = Hdrive * Math.cos(ab) - V * Math.sin(ab);
    if (T <= 0) return Infinity;
    const Nn = V * Math.cos(ab) + Hdrive * Math.sin(ab);
    return (Nn * inp.muBase + Ep * Math.cos(ab)) / T;
  };
  const FS_desliz = EAH_total > 0 ? slideFS(EAH_total, ΣV_estab) : Infinity;

  // Excentricidad (con signo, + hacia puntera) y tensiones.
  const e = B / 2 - (Mr - Mo) / ΣV;
  const eAbs = Math.abs(e);
  const bEq = Math.max(B - 2 * eAbs, 0);
  const sigma_ref = bEq > 0 ? ΣV / bEq : Infinity;   // Meyerhof (proyección horizontal)

  // Distribución de borde trapezoidal/triangular (para diagrama y σmin).
  let sigma_toe: number;
  let sigma_heel: number;
  if (eAbs <= B / 6) {
    sigma_toe  = (ΣV / B) * (1 + 6 * e / B);
    sigma_heel = (ΣV / B) * (1 - 6 * e / B);
  } else {
    const a_eff = 3 * (B / 2 - eAbs);
    const peak = a_eff > 0 ? 2 * ΣV / a_eff : Infinity;
    sigma_toe  = e >= 0 ? peak : 0;
    sigma_heel = e >= 0 ? 0 : peak;
  }
  const sigma_max = Math.max(sigma_toe, sigma_heel);
  const sigma_min = eAbs <= B / 6 ? Math.min(sigma_toe, sigma_heel) : 0;
  const exceedsBoundary = eAbs >= B / 3;

  // ── 6. φ del material del muro (Guía 2006 §4.1.3) ────────────────────────
  let phiEff: number;
  let dPhiN: number | undefined;
  let sigmaN: number | undefined;
  if (inp.phiMode === 'guia') {
    sigmaN = sigma_max;
    const r = phiEscolleraGuia(PHI_B_LITOLOGIA[inp.litologia], inp.dPhiE, sigmaN);
    phiEff = r.phi;
    dPhiN = r.dPhiN;
  } else {
    phiEff = inp.phi;
  }
  if (phiEff <= 0) return invalid('φ del material del muro debe ser > 0');
  // Rozamiento entre hiladas: tan(⅔·φ) por defecto (práctica conservadora de
  // la hoja del usuario); con contacto mejorado (bloques trabados/recebados)
  // se admite el φ completo.
  const phiPP = (inp.contactoMejorado ? 1 : 2 / 3) * phiEff;
  const tanPP = Math.tan((phiPP * Math.PI) / 180);

  // ── 7. Sismo M-O (coeficientes y magnitudes de base) ─────────────────────
  let KAD: number | undefined;
  let KAD_sub = 0;
  let seismicUnstable = false;
  let FS_vuelco_seis: number | undefined;
  let FS_desliz_seis: number | undefined;
  let theta = 0;

  if (kh > 0) {
    theta = Math.atan(kh / (1 - kv));
    seismicUnstable = phiRelleno_r - (inp.beta * Math.PI) / 180 - theta < 0;
    const theta_sub = h_wet_total > 0
      ? Math.atan((inp.gammaSat / Math.max(gamma_sub, 1e-9)) * kh / (1 - kv))
      : theta;
    KAD = kadMononobeOkabe(inp.phiRelleno, inp.delta, inp.beta, theta);
    KAD_sub = kadMononobeOkabe(inp.phiRelleno, inp.delta, inp.beta, theta_sub);

    const pS = press(H_total, KAD, KAD_sub);
    const fv = 1 - kv;
    const EAD_soil = pS.Esoil * fv;
    const EAH_soil_seis = pS.Esoil * fv * cos_d;
    const EAV_seis = EAD_soil * sin_d;
    const ΔEAD_H = EAH_soil_seis - Ea * cos_d;
    // Westergaard (EC8-5 §E.7): resultante a 0.4·h_wet sobre la base.
    const EW_dyn = (7 / 12) * kh * GAMMA_W * h_wet_total * h_wet_total;
    const EAH_seis = EAH_soil_seis + EW_total + EW_dyn;

    // Inercias del muro + cimiento + terreno solidario (alturas sobre la base).
    const yWall  = wallT.W > 0 ? hz + (H - wallT.My / wallT.W) : 0;
    const yWedge = wedgeT.W > 0 ? H_total - wedgeT.My / wedgeT.W : 0;
    const W_masa = W_muro + W_cimiento + W_relleno;
    const F_inercia = kh * W_masa;
    const M_inercia = kh * (W_muro * yWall + W_cimiento * (hz / 2) + W_relleno * yWedge);

    // Momento volcador sísmico: estático + incremento dinámico a 0.6·H (Seed &
    // Whitman) + Westergaard a 0.4·h_wet + inercias. (El módulo donante omite
    // el momento de Westergaard; aquí se incluye por estar del lado seguro.)
    const Mo_seis = Mo + ΔEAD_H * 0.6 * H_total + EW_dyn * 0.4 * h_wet_total + M_inercia;
    const ΣV_seis = W_masa * fv + EAV_seis - U_uplift;
    const Mr_seis = (wallT.Mx + wedgeT.Mx + W_cimiento * (B / 2)) * fv
                  + EAV_seis * xPlane
                  - U_uplift * (B / 2)
                  + Ep * arm_Ep;

    FS_vuelco_seis = Mo_seis > 0 ? Mr_seis / Mo_seis : Infinity;
    const H_seis = EAH_seis + F_inercia;
    FS_desliz_seis = H_seis > 0 ? slideFS(H_seis, ΣV_seis) : Infinity;
  }

  // ── 8. Comprobación hilada a hilada (estabilidad local) ──────────────────
  // Cortes: escollera → 50 intervalos + corte en hw; gaviones → juntas entre
  // filas. En cada corte, deslizamiento piedra sobre piedra en el plano
  // contrainclinado y vuelco parcial por excentricidad.
  const alphaPlane = ((isGavion ? inp.alphaBatter : inp.alphaHiladas) * Math.PI) / 180;
  const cosA = Math.cos(alphaPlane);
  const sinA = Math.sin(alphaPlane);

  let cuts: number[];
  if (isGavion) {
    cuts = rows.map((r) => r.zBot);
  } else {
    cuts = [];
    for (let k = 1; k <= N_INTERVALS; k++) cuts.push((k * H) / N_INTERVALS);
    if (hwEff > 0 && hwEff < H) cuts.push(hwEff);
    cuts.sort((u, v) => u - v);
    cuts = cuts.filter((z, i) => i === 0 || z - cuts[i - 1] > 1e-9);
  }

  const cutSection = (z: number): { b: number; xc: number } => {
    if (isGavion) {
      const j = Math.min(Math.round(z / inp.hCaja), rows.length) - 1;
      const r = rows[Math.max(j, 0)];
      return { b: r.w, xc: r.xFront + r.w / 2 };
    }
    const b = inp.a + c * z;
    const xc = x0 + inp.mIntra * (H - z) + b / 2;
    return { b, xc };
  };

  const courses: CourseCutPoint[] = [];
  const worstSlide = { z: 0, util: 0 };
  const worstOvert = { z: 0, util: 0 };
  const worstSlideSeis = { z: 0, util: 0 };

  for (const z of cuts) {
    const { b, xc } = cutSection(z);
    if (b <= 0) continue;
    const wall = wallAbove(z);
    const wedge = wedgeAbove(z);
    const p = press(z, Ka, Ka);
    const N = wall.W + wedge.W + p.Ev;
    const Q = p.Eh;
    if (N <= 0) continue;

    // Momentos respecto al borde de intradós del corte (x_fe = xc − b/2):
    // estabilizadores los pesos y Ev en el plano; volcador la ley de empujes.
    const x_fe = xc - b / 2;
    const M_stab = (wall.Mx - wall.W * x_fe) + (wedge.Mx - wedge.W * x_fe)
                 + p.Ev * (xPlane - x_fe);
    const x_R = x_fe + (M_stab - p.Mo) / N;
    const eCut = xc - x_R;                       // + hacia intradós
    const utilOvert = Math.abs(eCut) / (b / (2 * GAMMA_V_HILADA));

    const T  = Q * cosA - N * sinA;
    const Nn = N * cosA + Q * sinA;
    const utilSlide = T > 0 ? (GAMMA_R_HILADA * T) / Math.max(Nn * tanPP, 1e-9) : 0;

    let utilSlideSeis: number | undefined;
    if (kh > 0 && KAD !== undefined) {
      const pSz = press(z, KAD, KAD_sub);
      const fv = 1 - kv;
      const EWdynZ = (7 / 12) * kh * GAMMA_W * pSz.h_w * pSz.h_w;
      const Wz = wall.W + wedge.W;
      const Qs = pSz.Esoil * fv * cos_d + pSz.EW + EWdynZ + kh * Wz;
      const Ns = Wz * fv + pSz.Esoil * fv * sin_d;
      const Ts  = Qs * cosA - Ns * sinA;
      const Nns = Ns * cosA + Qs * sinA;
      utilSlideSeis = Ts > 0 ? (GAMMA_R_HILADA_SEIS * Ts) / Math.max(Nns * tanPP, 1e-9) : 0;
      if (utilSlideSeis > worstSlideSeis.util) {
        worstSlideSeis.util = utilSlideSeis;
        worstSlideSeis.z = z;
      }
    }

    if (utilSlide > worstSlide.util) { worstSlide.util = utilSlide; worstSlide.z = z; }
    if (utilOvert > worstOvert.util) { worstOvert.util = utilOvert; worstOvert.z = z; }
    courses.push({ z, b, N, Q, M: eCut * N, e: eCut, utilSlide, utilOvert, utilSlideSeis });
  }

  // ── 9. Checks ────────────────────────────────────────────────────────────
  const checks: CheckRow[] = [];
  const guiaRef = 'Guía escolleras Fomento 2006';

  // Prescripciones geométricas de la Guía: criterios binarios cumple/no cumple
  // (no gradientes de utilización — en el valor normativo exacto deben dar
  // 'ok', no rozar el 100%). Tolerancia relativa 0.1% para absorber redondeos
  // de entrada (18.43° vs atan(1/3) = 18.4349°, 0.33 vs 1/3).
  const GEOM_EPS = 1 + 1e-3;
  const geomCheck = (
    id: string, description: string, ok: boolean,
    valueStr: string, limitStr: string, article: string,
  ): CheckRow => ({
    id, description, value: valueStr, limit: limitStr,
    utilization: ok ? 0 : 1.5,
    status: ok ? 'ok' : 'fail',
    article,
  });

  if (!isGavion) {
    const aMin = H < 5 ? 1.5 : 2.0;
    checks.push(geomCheck(
      'geom-coronacion', 'Ancho mínimo de coronación',
      inp.a * GEOM_EPS >= aMin,
      `a = ${inp.a.toFixed(2)} m`, `≥ ${aMin.toFixed(2)} m${H < 5 ? ' (H < 5 m)' : ''}`,
      `${guiaRef} §2.3`,
    ));
    checks.push(geomCheck(
      'geom-intrados', 'Talud del intradós no más vertical que 1H:3V',
      inp.mIntra * GEOM_EPS >= 1 / 3,
      `${inp.mIntra.toFixed(2)}H:1V`, '≥ 0.33H:1V',
      `${guiaRef} §2.3`,
    ));
    checks.push(geomCheck(
      'geom-hiladas', 'Contrainclinación de hiladas hacia el trasdós',
      inp.alphaHiladas * GEOM_EPS >= ALPHA_3H1V,
      `α = ${inp.alphaHiladas.toFixed(1)}°`, `≥ ${ALPHA_3H1V.toFixed(1)}° (3H:1V)`,
      `${guiaRef} §2.3`,
    ));
  } else {
    checks.push(makeCheckNeutral(
      'geom-filas',
      `Cuerpo de ${nRows} filas de cajas de ${inp.hCaja.toFixed(2)} m (H efectiva = ${H.toFixed(2)} m)`,
      `${nRows} FILAS`,
      `${guiaRef} §2.3`,
    ));
  }
  checks.push(geomCheck(
    'geom-cimiento', 'Profundidad mínima del cimiento',
    hz * GEOM_EPS >= 1.0,
    `hz = ${hz.toFixed(2)} m`, '≥ 1.00 m',
    `${guiaRef} §2.2`,
  ));

  if (inp.phiMode === 'guia' && dPhiN !== undefined) {
    checks.push(makeCheckNeutral(
      'phi-escollera',
      `φ escollera = φb + Δφe − Δφn = ${PHI_B_LITOLOGIA[inp.litologia].toFixed(1)} + ${inp.dPhiE.toFixed(1)} − ${dPhiN.toFixed(1)}`,
      `φ = ${phiEff.toFixed(1)}°`,
      `${guiaRef} §4.1.3`,
    ));
  }

  // Estabilidad local (peor hilada/junta)
  const zSlideStr = worstSlide.util > 0 ? ` (z = ${worstSlide.z.toFixed(2)} m)` : '';
  checks.push({
    id: 'hilada-deslizamiento',
    description: isGavion
      ? 'Deslizamiento entre filas de cajas (peor junta)'
      : 'Deslizamiento piedra sobre piedra (peor hilada)',
    value: `I = ${worstSlide.util.toFixed(2)}${zSlideStr}`,
    limit: `≤ 1.00 (γR = ${GAMMA_R_HILADA.toFixed(1)}, tan ${phiPP.toFixed(1)}°)`,
    utilization: worstSlide.util,
    status: toStatus(worstSlide.util),
    article: `${guiaRef} §4.2.2.4`,
  });
  const zOvertStr = worstOvert.util > 0 ? ` (z = ${worstOvert.z.toFixed(2)} m)` : '';
  checks.push({
    id: 'hilada-vuelco',
    description: isGavion
      ? 'Vuelco parcial entre filas (e ≤ b/4, peor junta)'
      : 'Vuelco parcial entre hiladas (e ≤ b/4, peor hilada)',
    value: `I = ${worstOvert.util.toFixed(2)}${zOvertStr}`,
    limit: `≤ 1.00 (γv = ${GAMMA_V_HILADA.toFixed(1)})`,
    utilization: worstOvert.util,
    status: toStatus(worstOvert.util),
    article: `${guiaRef} §4.2.2.4`,
  });

  // Sólido rígido en la base
  const epSuffix = usePassive ? ' (con Ep)' : '';
  checks.push(makeCheck(
    'vuelco', `Estabilidad al vuelco${epSuffix}`,
    2.0, FS_vuelco,
    `FS = ${isFinite(FS_vuelco) ? FS_vuelco.toFixed(2) : '∞'}`, '≥ 2.00',
    'CTE DB-SE-C Tabla 2.1',
  ));
  checks.push(makeCheck(
    'deslizamiento', `Estabilidad al deslizamiento en el plano de apoyo${epSuffix}`,
    1.5, FS_desliz,
    `FS = ${isFinite(FS_desliz) ? FS_desliz.toFixed(2) : '∞'}`, '≥ 1.50',
    'CTE DB-SE-C §4.4.2',
  ));
  checks.push(makeCheck(
    'excentricidad', 'Resultante en tercio central (|e| ≤ B/6)',
    eAbs, B / 6,
    `e = ${e.toFixed(3)} m`, `B/6 = ${(B / 6).toFixed(3)} m`,
    'CTE DB-SE-C §4.4.3',
  ));
  checks.push(makeCheckQty(
    'sigma-max', "Tensión de referencia (Meyerhof, b' = B − 2e)",
    sigma_ref, inp.sigmaAdm,
    'soilPressure', 'CTE DB-SE-C §4.4.4',
  ));
  const sigmaMinFail = exceedsBoundary || sigma_min < 0;
  checks.push({
    id: 'sigma-min',
    description: 'Sin tensión negativa en la base (sin levantamiento)',
    valueNum: sigma_min,
    valueQty: 'soilPressure',
    limitStr: '≥ 0',
    utilization: sigmaMinFail ? 1.5 : 0,
    status: sigmaMinFail ? 'fail' : 'ok',
    article: 'CTE DB-SE-C §4.4.4',
  });

  // Estabilidad global — remite al módulo de Taludes (equilibrio límite).
  checks.push(makeCheckNeutral(
    'estabilidad-global',
    'Estabilidad global del conjunto — verificar con el módulo Taludes (equilibrio límite)',
    'VER TALUDES',
    `${guiaRef} §4.2.2.3 / CTE DB-SE-C Tabla 2.1`,
  ));

  // Sísmicos
  if (kh > 0) {
    checks.push(makeCheck(
      'vuelco-sismico', `Estabilidad al vuelco (sísmica)${epSuffix}`,
      1.1, FS_vuelco_seis ?? 0,
      `FS = ${FS_vuelco_seis !== undefined && isFinite(FS_vuelco_seis) ? FS_vuelco_seis.toFixed(2) : '∞'}`,
      '≥ 1.10',
      'NCSE-02 / NCSP-07',
    ));
    checks.push(makeCheck(
      'deslizamiento-sismico', `Estabilidad al deslizamiento (sísmico)${epSuffix}`,
      1.1, FS_desliz_seis ?? 0,
      `FS = ${FS_desliz_seis !== undefined && isFinite(FS_desliz_seis) ? FS_desliz_seis.toFixed(2) : '∞'}`,
      '≥ 1.10',
      'NCSE-02 / NCSP-07',
    ));
    const zSeisStr = worstSlideSeis.util > 0 ? ` (z = ${worstSlideSeis.z.toFixed(2)} m)` : '';
    checks.push({
      id: 'hilada-deslizamiento-sismico',
      description: isGavion
        ? 'Deslizamiento entre filas de cajas (sísmico, peor junta)'
        : 'Deslizamiento piedra sobre piedra (sísmico, peor hilada)',
      value: `I = ${worstSlideSeis.util.toFixed(2)}${zSeisStr}`,
      limit: `≤ 1.00 (γR = ${GAMMA_R_HILADA_SEIS.toFixed(1)})`,
      utilization: worstSlideSeis.util,
      status: toStatus(worstSlideSeis.util),
      article: 'NCSE-02 / NCSP-07',
    });
  }

  return {
    valid: true,
    Ka,
    KAD,
    Kp: usePassive ? Kp_rankine : undefined,
    kh_derived: kh,
    kv_derived: kv,
    phiEff,
    phiPP,
    dPhiN,
    sigmaN,
    B,
    bBase,
    H_total,
    nRows,
    H_eff: isGavion ? H : undefined,
    Ea,
    EAH_total,
    Ev,
    EW: h_wet_total > 0 ? EW_total : undefined,
    Ep: usePassive ? Ep : undefined,
    EpHeight: usePassive ? dEmb : undefined,
    W_muro,
    W_cimiento,
    W_relleno,
    ΣV,
    e,
    bEq,
    sigma_ref,
    sigma_max,
    sigma_min,
    FS_vuelco,
    FS_desliz,
    FS_vuelco_seis,
    FS_desliz_seis,
    seismicUnstable: seismicUnstable || undefined,
    courses,
    worstSlide,
    worstOvert,
    worstSlideSeis: kh > 0 ? worstSlideSeis : undefined,
    geom: {
      x0, xT, hz, H, bBase, B, xPlane, xb0,
      mIntra: isGavion ? 0 : inp.mIntra,
      mTras: isGavion ? 0 : inp.mTras,
      rows: isGavion ? rows : undefined,
    },
    checks,
  };
}
