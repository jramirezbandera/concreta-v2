// Masonry walls (DB-SE-F) — motor de cálculo puro
//
// Comprobación de muros de carga de fábrica en edificación rehabilitada,
// multi-planta, considerando huecos (puertas/ventanas) con dinteles que
// transmiten reacciones a los machones laterales.
//
// Comprobaciones (DB-SE-F):
//   §5.2    Compresión excéntrica (N_Ed ≤ N_Rd = Φ · f_d · A)
//   §5.2.4  Pandeo (esbeltez λ = h_ef / t)
//   §5.4    Concentración bajo apoyo de viga puntual
//
// Resistencia característica f_k según Tabla 4.4 (combinación pieza fb +
// mortero fm) o introducida directamente por el usuario en modo "personalizada".
// Resistencia de cálculo f_d = f_k / γ_M.
//
// Combinación ELU: q_d = γ_G · G_k + γ_Q · Q_k. El motor mayora internamente
// y los inputs son siempre características (sin mayorar).

// ── Tabla 4.4 DB-SE-F ─────────────────────────────────────────────────────

export type PiezaTipo =
  | 'macizo_junta_delgada'
  | 'macizo'
  | 'perforado'
  | 'bloque_aligerado'
  | 'bloque_hueco';

interface PiezaDef {
  label: string;
  gamma: number; // peso específico kN/m³
  data: Record<number, Record<number, number | null>>; // fb → fm → fk
}

export const TABLA_4_4: Record<PiezaTipo, PiezaDef> = {
  macizo_junta_delgada: {
    label: 'Ladrillo macizo (junta delgada)',
    gamma: 18,
    data: {
      5:  { 2.5: null, 5: null },
      10: { 5: 3, 7.5: 3 },
      15: { 7.5: 3, 10: 3 },
      20: { 10: 3, 15: 3 },
      25: { 15: 3 },
    },
  },
  macizo: {
    label: 'Ladrillo macizo',
    gamma: 18,
    data: {
      5:  { 2.5: 2, 5: 2 },
      10: { 5: 4, 7.5: 4 },
      15: { 7.5: 6, 10: 6 },
      20: { 10: 8, 15: 8 },
      25: { 15: 10 },
    },
  },
  perforado: {
    label: 'Ladrillo perforado',
    gamma: 15,
    data: {
      5:  { 2.5: 2, 5: 2 },
      10: { 5: 4, 7.5: 4 },
      15: { 7.5: 5, 10: 6 },
      20: { 10: 7, 15: 8 },
      25: { 15: 9 },
    },
  },
  bloque_aligerado: {
    label: 'Bloques aligerados',
    gamma: 14,
    data: {
      5:  { 2.5: 2, 5: 2 },
      10: { 5: 3, 7.5: 4 },
      15: { 7.5: 5, 10: 5 },
      20: { 10: 6, 15: 7 },
      25: { 15: 8 },
    },
  },
  bloque_hueco: {
    label: 'Bloques huecos',
    gamma: 12,
    data: {
      5:  { 2.5: 1, 5: 2 },
      10: { 5: 2, 7.5: 3 },
      15: { 7.5: 3, 10: 4 },
      20: { 10: 4, 15: 5 },
      25: { 15: 6 },
    },
  },
};

export const FB_VALUES = [5, 10, 15, 20, 25] as const;

export const FM_PARA_FB: Record<number, number[]> = {
  5: [2.5, 5],
  10: [5, 7.5],
  15: [7.5, 10],
  20: [10, 15],
  25: [15],
};

export function lookupFk(pieza: PiezaTipo, fb: number, fm: number): number | null {
  const t = TABLA_4_4[pieza];
  if (!t) return null;
  const row = t.data[fb];
  if (!row) return null;
  const v = row[fm];
  return v == null ? null : v;
}

export const GAMMA_M_DEFAULT = 2.5; // categoría control normal · §4.6.7

// ── Tipos del modelo ──────────────────────────────────────────────────────

export type FabricaModo = 'tabla' | 'custom';

export interface Hueco {
  id: string;
  x: number;       // mm desde el origen
  y: number;       // mm desde la base de la planta (alféizar). Ignorado si tipo='puerta'
  w: number;       // mm
  h: number;       // mm. Si tipo='puerta', el hueco va de 0 a h (llega al forjado)
  tipo: 'puerta' | 'ventana';
}

export interface Puntual {
  id: string;
  x: number;       // mm desde el origen
  P_G: number;     // kN, característica (permanente)
  P_Q: number;     // kN, característica (variable)
  b_apoyo: number; // mm — ancho de apoyo bajo carga puntual
}

export interface Planta {
  id: string;
  nombre: string;
  H: number;        // mm — altura libre del muro
  q_G: number;      // kN/m — carga lineal del forjado, característica permanente
  q_Q: number;      // kN/m — carga lineal del forjado, característica variable
  e_apoyo: number;  // mm — penetración de apoyo del forjado
  a_apoyo: number;  // mm — longitud del apoyo del forjado
  huecos: Hueco[];
  puntuales: Puntual[];
}

export interface MasonryWallState {
  fabricaModo: FabricaModo;
  // Modo tabla
  pieza: PiezaTipo;
  fb: number;
  fm: number;
  // Modo custom
  fk_custom: number;
  gamma_custom: number;
  gamma_M: number;
  // Coeficientes parciales acciones (DB-SE 4.2.4)
  gamma_G: number;
  gamma_Q: number;
  // Geometría global
  L: number;       // mm — longitud del muro
  t: number;       // mm — espesor
  plantas: Planta[];
}

export interface FabricaResuelta {
  modo: FabricaModo;
  label: string;
  fk: number | null;
  gamma: number;   // peso específico kN/m³
  gamma_M: number;
  ref: string;
  valida?: boolean;
}

export interface MachonRaw {
  id: string;
  x1: number;
  x2: number;
  ancho: number;
}

export interface MachonResult extends MachonRaw {
  N_Ed: number;        // axil cálculo (mayorado), kN
  N_lineal: number;    // contribución lineal directa
  N_puntual: number;   // contribución de cargas puntuales sobre el machón
  N_dinteles: number;  // contribución de reacciones de dinteles vecinos
  N_Rd: number;        // axil resistente, kN
  eta: number;         // utilización compresión excéntrica
  sigma: number;       // tensión cabeza N/mm²
  sigma_top: number;
  sigma_bottom: number;
  Phi: number;
  etaConc: number;     // utilización concentración bajo apoyo
  etaMax: number;
  status: 'ok' | 'warn' | 'fail';
  A: number;           // mm²
  P_directos: Puntual[];
  f_d: number;
}

export interface DintelResult {
  id: string;
  x_centro: number;
  x1: number;
  x2: number;
  luz: number;
  q_dintel: number;
  g_propio: number;
  h_muro_sobre: number;
  N_total_dintel: number;
  R_apoyo: number;
  M_Ed: number;
  V_Ed: number;
  P_sobre_hueco: number;
}

export interface PlantaResult extends Planta {
  index: number;
  machones: MachonResult[];
  dinteles: DintelResult[];
  q_planta: number;
  e_apoyo: number;
  e_cabeza: number;
  e_pie: number;
  e_total: number;
  e_min: number;
  e_a: number;
  k_reparto: number;
  rho_n: number;
  h_ef: number;
  lambda: number;
  Phi: number;
  f_d: number;
}

// ── Funciones puras del cálculo ───────────────────────────────────────────

export function resolverFabrica(state: MasonryWallState): FabricaResuelta {
  if (state.fabricaModo === 'custom') {
    return {
      modo: 'custom',
      label: 'Personalizada',
      fk: state.fk_custom,
      gamma: state.gamma_custom,
      gamma_M: state.gamma_M,
      ref: 'Personalizada',
    };
  }
  const t = TABLA_4_4[state.pieza];
  const fk = lookupFk(state.pieza, state.fb, state.fm);
  return {
    modo: 'tabla',
    label: t.label,
    fk,
    gamma: t.gamma,
    gamma_M: state.gamma_M,
    ref: 'Tabla 4.4',
    valida: fk != null,
  };
}

export function eMin(t: number): number {
  return Math.max(0.05 * t, 20);
}

export function eApoyoForjado(t: number, a: number): number {
  return Math.max(0, t / 2 - a / 3);
}

export function repartoMomento(H_inf: number, H_sup: number): number {
  if (!H_sup || H_sup <= 0) return 1;
  const k_inf = 1 / H_inf;
  const k_sup = 1 / H_sup;
  return k_inf / (k_inf + k_sup);
}

/**
 * Calcula los machones (franjas verticales entre/alrededor de huecos) para una
 * planta. Une los intervalos x de TODOS los huecos y construye los espacios
 * libres a lo largo del ancho del muro. Cada machón va de suelo a techo.
 */
export function getMachonesPlanta(plantaHuecos: Hueco[], L: number): MachonRaw[] {
  const intervalos = plantaHuecos
    .map((h) => ({ x1: h.x, x2: h.x + h.w }))
    .sort((a, b) => a.x1 - b.x1);

  const merged: { x1: number; x2: number }[] = [];
  intervalos.forEach((c) => {
    const last = merged[merged.length - 1];
    if (last && c.x1 <= last.x2) last.x2 = Math.max(last.x2, c.x2);
    else merged.push({ ...c });
  });

  const machones: { x1: number; x2: number }[] = [];
  let cursor = 0;
  merged.forEach((c) => {
    if (c.x1 > cursor) machones.push({ x1: cursor, x2: c.x1 });
    cursor = c.x2;
  });
  if (cursor < L) machones.push({ x1: cursor, x2: L });

  return machones.map((m, i) => ({
    id: `M${i + 1}`,
    x1: m.x1,
    x2: m.x2,
    ancho: m.x2 - m.x1,
  }));
}

function mayorarLineal(pl: Planta, gG: number, gQ: number): number {
  return gG * (pl.q_G || 0) + gQ * (pl.q_Q || 0);
}
function mayorarPuntual(p: Puntual, gG: number, gQ: number): number {
  return gG * (p.P_G || 0) + gQ * (p.P_Q || 0);
}

/**
 * Cálculo completo del edificio. Devuelve por cada planta sus machones con su
 * axil de cálculo, resistencia, utilización η, y el desglose por contribuciones
 * (carga directa + reacciones de dinteles + cargas puntuales).
 */
export function calcularEdificio(state: MasonryWallState): PlantaResult[] {
  const { plantas, L, t } = state;
  const gG = state.gamma_G ?? 1.35;
  const gQ = state.gamma_Q ?? 1.50;
  const fab = resolverFabrica(state);
  const fk = fab.fk || 0;
  const f_d = fk / fab.gamma_M;
  const e_min = eMin(t);
  const peso_propio = fab.gamma;

  const n = plantas.length;

  // Carga lineal en cabeza de cada planta (acumulada de arriba a abajo).
  // El peso propio del muro de la planta superior se suma como permanente.
  const q_top: number[] = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    const arriba = i + 1 < n
      ? q_top[i + 1] + gG * peso_propio * (t / 1000) * (plantas[i + 1].H / 1000)
      : 0;
    q_top[i] = arriba + mayorarLineal(plantas[i], gG, gQ);
  }

  return plantas.map((pl, i) => {
    const machonesRaw = getMachonesPlanta(pl.huecos, L);
    const q_planta = q_top[i];

    // Dinteles: para cada hueco calculamos la carga sobre el dintel y la
    // reacción que envía a los machones laterales.
    const dinteles: DintelResult[] = pl.huecos.map((h) => {
      const w_m = h.w / 1000;
      const esPuerta = h.tipo === 'puerta';
      const h_muro_sobre = esPuerta ? 0 : Math.max(0, pl.H - (h.y + h.h));
      // Peso propio del muro sobre el dintel (kN/m): permanente, mayorado.
      const g_propio = gG * peso_propio * (t / 1000) * (h_muro_sobre / 1000);
      const P_sobre_hueco = pl.puntuales
        .filter((p) => p.x >= h.x && p.x <= h.x + h.w)
        .reduce((s, p) => s + mayorarPuntual(p, gG, gQ), 0);
      const q_dintel = q_planta + g_propio;
      const N_total_dintel = q_dintel * w_m + P_sobre_hueco;
      const R_apoyo = N_total_dintel / 2;
      const M_Ed = q_dintel * w_m * w_m / 8 + P_sobre_hueco * w_m / 4;
      const V_Ed = R_apoyo;
      return {
        id: h.id,
        x_centro: h.x + h.w / 2,
        x1: h.x,
        x2: h.x + h.w,
        luz: h.w,
        q_dintel,
        g_propio,
        h_muro_sobre,
        N_total_dintel,
        R_apoyo,
        M_Ed,
        V_Ed,
        P_sobre_hueco,
      };
    });

    // Asignar reacciones de dinteles a los machones adyacentes (apoyo del
    // dintel coincide con el borde del machón vecino).
    const reaccionesPorMachon: Record<string, number> = {};
    dinteles.forEach((d) => {
      const m_izq = machonesRaw.find((mc) => Math.abs(mc.x2 - d.x1) < 0.5);
      const m_dch = machonesRaw.find((mc) => Math.abs(mc.x1 - d.x2) < 0.5);
      if (m_izq) reaccionesPorMachon[m_izq.id] = (reaccionesPorMachon[m_izq.id] || 0) + d.R_apoyo;
      if (m_dch) reaccionesPorMachon[m_dch.id] = (reaccionesPorMachon[m_dch.id] || 0) + d.R_apoyo;
    });

    const e_apoyo = pl.e_apoyo > 0 ? pl.e_apoyo : eApoyoForjado(t, pl.a_apoyo);
    const H_sup = i + 1 < n ? plantas[i + 1].H : 0;
    const k_reparto = repartoMomento(pl.H, H_sup);
    const e_cabeza = Math.max(e_apoyo * k_reparto, e_min);
    const e_pie = i > 0 ? Math.max(e_apoyo * (1 - k_reparto), e_min) : e_min;

    // ρ_n = 0.75 si planta intermedia o cubierta sobre planta inferior; 1.0
    // sólo si la cubierta no tiene muro encima — aquí simplificamos: cubierta
    // (última planta) usa 1.0; el resto (incluida PB con planta encima) 0.75.
    const rho_n = i === n - 1 ? 1.0 : 0.75;
    const h_ef = rho_n * pl.H;
    const lambda = h_ef / t;

    const e_m = 0.6 * Math.max(e_cabeza, e_pie) + 0.4 * Math.min(e_cabeza, e_pie);
    const e_a = h_ef / 450;
    const e_total = Math.max(e_m + e_a, e_min);

    const phi_e = Math.max(0.05, 1 - 2 * e_total / t);
    const phi_l = lambda > 10 ? Math.max(0.1, 1 - (lambda - 10) / 30) : 1.0;
    const Phi = phi_e * phi_l;

    const machones: MachonResult[] = machonesRaw.map((m) => {
      const N_lineal = q_planta * (m.ancho / 1000);
      const P_directos = pl.puntuales.filter((p) => p.x >= m.x1 && p.x <= m.x2);
      const N_puntual = P_directos.reduce((s, p) => s + mayorarPuntual(p, gG, gQ), 0);
      const N_dinteles = reaccionesPorMachon[m.id] || 0;
      const N_Ed = N_lineal + N_puntual + N_dinteles;

      const A = m.ancho * t;
      const N_Rd = (Phi * f_d * A) / 1000;
      const eta = N_Rd > 0 ? N_Ed / N_Rd : 99;
      const sigma = (N_Ed * 1000) / A;
      const peso_machon = gG * peso_propio * (m.ancho / 1000) * (t / 1000) * (pl.H / 1000);
      const sigma_top = sigma;
      const sigma_bottom = ((N_Ed + peso_machon) * 1000) / A;

      let etaConc = 0;
      if (P_directos.length && f_d > 0) {
        const peor = P_directos.reduce<{ s: number; p: Puntual | null }>((acc, p) => {
          const Pd = mayorarPuntual(p, gG, gQ);
          const s = (Pd * 1000) / (p.b_apoyo * t);
          return s > acc.s ? { s, p } : acc;
        }, { s: 0, p: null });
        const beta = 1.5;
        etaConc = peor.s / (beta * f_d);
      }

      const etaMax = Math.max(eta, etaConc);
      let status: 'ok' | 'warn' | 'fail' = 'ok';
      if (etaMax >= 1.0) status = 'fail';
      else if (etaMax >= 0.8) status = 'warn';

      return {
        ...m,
        N_Ed,
        N_lineal,
        N_puntual,
        N_dinteles,
        N_Rd,
        eta,
        sigma,
        sigma_top,
        sigma_bottom,
        Phi,
        etaConc,
        etaMax,
        status,
        A,
        P_directos,
        f_d,
      };
    });

    return {
      ...pl,
      index: i,
      machones,
      dinteles,
      q_planta,
      e_apoyo,
      e_cabeza,
      e_pie,
      e_total,
      e_min,
      e_a,
      k_reparto,
      rho_n,
      h_ef,
      lambda,
      Phi,
      f_d,
    };
  });
}

export interface CriticoResult extends MachonResult {
  planta: PlantaResult;
}

export function getCriticoEdificio(plantasCalc: PlantaResult[]): CriticoResult | null {
  let peor: CriticoResult | null = null;
  plantasCalc.forEach((pl) => {
    pl.machones.forEach((m) => {
      if (!peor || m.etaMax > peor.etaMax) peor = { ...m, planta: pl };
    });
  });
  return peor;
}

export type OverallVerdict = 'ok' | 'warn' | 'fail';
export interface OverallStatus {
  v: OverallVerdict;
  label: string;
  eta: number;
}

export function overallStatus(plantasCalc: PlantaResult[]): OverallStatus {
  let max = 0;
  plantasCalc.forEach((pl) => pl.machones.forEach((m) => { if (m.etaMax > max) max = m.etaMax; }));
  if (max >= 1.0) return { v: 'fail', label: 'INCUMPLE', eta: max };
  if (max >= 0.8) return { v: 'warn', label: 'REVISAR', eta: max };
  return { v: 'ok', label: 'CUMPLE', eta: max };
}

// ── Defaults ──────────────────────────────────────────────────────────────

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export function plantaTemplate(idx: number, esCubierta = false): Planta {
  return {
    id: uid('pl'),
    nombre: esCubierta ? 'Cubierta' : (idx === 0 ? 'Planta baja' : `Planta ${idx}`),
    H: 3000,
    q_G: esCubierta ? 5 : 8,
    q_Q: esCubierta ? 1 : 3,
    e_apoyo: 60,
    a_apoyo: 120,
    huecos: idx === 0
      ? [
          { id: uid('h'), x: 800,  y: 1900, w: 900,  h: 1100, tipo: 'ventana' },
          { id: uid('h'), x: 2500, y: 0,    w: 900,  h: 2050, tipo: 'puerta' },
          { id: uid('h'), x: 4400, y: 1900, w: 1000, h: 1100, tipo: 'ventana' },
        ]
      : esCubierta
        ? []
        : [
            { id: uid('h'), x: 800,  y: 1000, w: 900,  h: 1300, tipo: 'ventana' },
            { id: uid('h'), x: 2500, y: 1000, w: 900,  h: 1300, tipo: 'ventana' },
            { id: uid('h'), x: 4400, y: 1000, w: 1000, h: 1300, tipo: 'ventana' },
          ],
    puntuales: idx === 0
      ? [
          { id: uid('p'), x: 1900, P_G: 18, P_Q: 8, b_apoyo: 250 },
          { id: uid('p'), x: 4100, P_G: 15, P_Q: 6, b_apoyo: 250 },
        ]
      : [],
  };
}

export function defaultMasonryState(): MasonryWallState {
  return {
    fabricaModo: 'tabla',
    pieza: 'macizo',
    fb: 10,
    fm: 5,
    fk_custom: 5.0,
    gamma_custom: 18,
    gamma_M: GAMMA_M_DEFAULT,
    gamma_G: 1.35,
    gamma_Q: 1.50,
    L: 6000,
    t: 240,
    plantas: [
      plantaTemplate(0, false),
      plantaTemplate(1, false),
      plantaTemplate(2, false),
      plantaTemplate(3, true),
    ],
  };
}

export const newId = uid;
