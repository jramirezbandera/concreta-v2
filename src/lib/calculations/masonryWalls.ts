// Masonry walls (DB-SE-F) — motor de cálculo puro
//
// Comprobación de muros de carga de fábrica en edificación rehabilitada,
// multi-planta, considerando huecos (puertas/ventanas) con dinteles que
// transmiten reacciones a los machones laterales.
//
// Comprobaciones (DB-SE-F):
//   §5.2    Compresión excéntrica (N_Ed ≤ N_Rd = Φ · f_d · A) — verificada
//           en cabeza Y en pie del machón; η = max(η_cabeza, η_pie).
//   §5.2.4  Pandeo (esbeltez λ = h_ef / t)
//   §5.4    Concentración bajo apoyo de viga puntual (β depende de a/h)
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

/**
 * CTE DB-SE-F Tabla 4.8 — Coeficientes parciales γ_M para fábricas según
 * categoría de control de ejecución (I extenso / II normal / III reducido)
 * y clase de ejecución (A / B):
 *
 *                       │  Clase A  │  Clase B
 *   ──────────────────────┼───────────┼──────────
 *   Categoría I  (extenso)│    1.7    │    2.2
 *   Categoría II (normal) │    2.0    │    2.5     ← default usual rehabilitación
 *   Categoría III (reduc.)│    2.5    │    3.0
 *
 * El usuario suele rehabilitar muros antiguos sin ensayos previos, lo que
 * encaja con Categoría II + Ejecución B → γ_M = 2.5.
 */
export type CategoriaControl = 'I' | 'II' | 'III';
export type ClaseEjecucion = 'A' | 'B';

export const GAMMA_M_TABLA: Record<CategoriaControl, Record<ClaseEjecucion, number>> = {
  I:   { A: 1.7, B: 2.2 },
  II:  { A: 2.0, B: 2.5 },
  III: { A: 2.5, B: 3.0 },
};

export const CATEGORIA_LABELS: Record<CategoriaControl, string> = {
  I:   'I — Control extenso (ensayos)',
  II:  'II — Control normal',
  III: 'III — Control reducido',
};

export const EJECUCION_LABELS: Record<ClaseEjecucion, string> = {
  A: 'A — Cualificada',
  B: 'B — No cualificada',
};

export function lookupGammaM(cat: CategoriaControl, ejec: ClaseEjecucion): number {
  return GAMMA_M_TABLA[cat][ejec];
}

/**
 * Devuelve la celda de Tabla 4.8 que coincide con el γM actual, o null si
 * el valor no está en la tabla (modo personalizado). Usado por la UI para
 * presentar el selector pre-seleccionado en la celda correcta.
 */
export function findGammaMCell(gM: number): { cat: CategoriaControl; ejec: ClaseEjecucion } | null {
  for (const cat of ['I', 'II', 'III'] as CategoriaControl[]) {
    for (const ejec of ['A', 'B'] as ClaseEjecucion[]) {
      if (Math.abs(GAMMA_M_TABLA[cat][ejec] - gM) < 0.01) return { cat, ejec };
    }
  }
  return null;
}

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
  /** Coeficiente de altura efectiva ρ_n (DB-SE-F §5.2.4). Opcional; default
   *  según topología: 0.75 plantas con muro encima (doble arriostramiento),
   *  1.0 cubierta (cabeza libre). */
  rho_n?: number;
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
  N_Ed: number;        // axil cálculo (mayorado) en cabeza, kN
  N_Ed_pie: number;    // axil en pie = N_Ed + peso propio del muro de la planta (γG mayorado)
  N_lineal: number;    // contribución lineal directa (sobre el ancho del propio machón)
  N_puntual: number;   // contribución de cargas puntuales sobre el machón
  N_dinteles: number;  // contribución de reacciones de dinteles vecinos (con asimetría P)
  N_Rd: number;        // axil resistente, kN
  eta: number;         // utilización compresión excéntrica = max(eta_cabeza, eta_pie)
  eta_cabeza: number;
  eta_pie: number;
  sigma_top: number;   // N/mm²
  sigma_bottom: number;// N/mm²
  /** Compatibilidad con UI antigua: alias de sigma_top. */
  sigma: number;
  Phi: number;
  etaConc: number;     // utilización concentración bajo apoyo (β variable §5.4)
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
  /** Reacción en apoyo izquierdo (kN), respeta posición de cargas puntuales. */
  R_izq: number;
  /** Reacción en apoyo derecho (kN). */
  R_dch: number;
  /** Promedio de R_izq y R_dch — preservado para compatibilidad y para el
   *  panel "info dintel" cuando solo importa la magnitud. */
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

/** Estado degenerado: el motor abandona el cálculo y devuelve el motivo. */
export interface EdificioInvalid {
  invalid: true;
  reason: string;
  field?: 'fk' | 't' | 'L' | 'gamma_M' | 'plantas';
  /** Sugerencia concreta de cómo arreglar el problema. Permite que el banner
   *  de la UI no solo diga "selecciona otra" sino "Prueba fb=10 con fm=5
   *  (fk=4 N/mm²)". Útil para usuarios que no dominan Tabla 4.4. */
  fix?: string;
}

export type EdificioResult =
  | { invalid: false; plantas: PlantaResult[] }
  | EdificioInvalid;

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
 * β para concentración bajo apoyo, DB-SE-F §5.4 — aproximación lineal del
 * incremento de capacidad por confinamiento triaxial alrededor del apoyo.
 *
 *   β = 1 + 0.3 · (a / h)   acotado entre [1.0, 1.5]
 *
 * donde `a` es la distancia desde el centro del apoyo al borde más próximo
 * del muro y `h` es la altura del muro (proxy razonable de la "profundidad
 * disponible" para la difusión de tensiones). Una carga centrada da β
 * próximo al máximo; una carga al borde del muro da β=1 (sin confinamiento).
 *
 * Esto reemplaza el β=1.5 hardcoded anterior, que era el caso más favorable
 * y subestimaba sistemáticamente η_concentración para cargas cercanas al
 * borde o al hueco.
 */
export function betaConcentracion(x_carga: number, L_muro: number, H_planta: number): number {
  const a = Math.min(x_carga, Math.max(0, L_muro - x_carga));
  const ratio = H_planta > 0 ? a / H_planta : 0;
  return Math.max(1.0, Math.min(1.5, 1 + 0.3 * ratio));
}

/**
 * Calcula los machones (franjas verticales entre/alrededor de huecos) para una
 * planta. Une los intervalos x de TODOS los huecos y construye los espacios
 * libres a lo largo del ancho del muro. Cada machón va de suelo a techo.
 *
 * Clamps de robustez: huecos con `x + w > L` se truncan a L; huecos con `x < 0`
 * se anclan a 0.
 */
export function getMachonesPlanta(plantaHuecos: Hueco[], L: number): MachonRaw[] {
  const intervalos = plantaHuecos
    .map((h) => ({ x1: Math.max(0, h.x), x2: Math.min(L, h.x + h.w) }))
    .filter((c) => c.x2 > c.x1)
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

/**
 * Detecta huecos solapados en una planta. El motor mergea silenciosamente
 * intervalos solapados en `getMachonesPlanta`, lo que es estable
 * matemáticamente pero engañoso para el usuario: ve dos huecos en el SVG y
 * cree que son dos elementos independientes con dos dinteles, mientras que el
 * cálculo trata su unión como un único hueco con un solo dintel.
 *
 * Devuelve pares de IDs de huecos que se solapan o tocan (tolerancia 1 mm).
 * Se lee desde el panel de inputs para mostrar un warning amber.
 */
export function detectarHuecosSolapados(huecos: Hueco[]): { a: string; b: string }[] {
  const pairs: { a: string; b: string }[] = [];
  const sorted = [...huecos].sort((p, q) => p.x - q.x);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      // Solape en X: a.x..a.x+w vs b.x..b.x+w
      if (b.x < a.x + a.w - 1) {
        // Si ambos son ventana, comprobar también solape en Y
        if (a.tipo === 'ventana' && b.tipo === 'ventana') {
          const aY1 = a.y;
          const aY2 = a.y + a.h;
          const bY1 = b.y;
          const bY2 = b.y + b.h;
          if (bY1 < aY2 - 1 && aY1 < bY2 - 1) pairs.push({ a: a.id, b: b.id });
        } else {
          // Cualquier puerta solapando con cualquier otro hueco siempre es
          // problemático (la puerta va de 0 a H, ocupa toda la altura).
          pairs.push({ a: a.id, b: b.id });
        }
      }
    }
  }
  return pairs;
}

function mayorarLineal(pl: Planta, gG: number, gQ: number): number {
  return gG * (pl.q_G || 0) + gQ * (pl.q_Q || 0);
}
function mayorarPuntual(p: Puntual, gG: number, gQ: number): number {
  return gG * (p.P_G || 0) + gQ * (p.P_Q || 0);
}

/**
 * Validación de entrada — catalan los datos degenerados que producirían NaN
 * o Infinity downstream. El motor para aquí y la UI muestra el mensaje en
 * lugar de números sin sentido.
 */
/**
 * Sugiere una combinación válida de Tabla 4.4 para una pieza dada, escogiendo
 * la celda con menor (fb·fm) entre las válidas. Devuelve null si la pieza no
 * tiene ninguna combinación válida (caso muy raro). Usado por el banner de
 * validación para no dejar al usuario solo ante la tabla.
 */
function sugerirFbFm(pieza: PiezaTipo): { fb: number; fm: number; fk: number } | null {
  const t = TABLA_4_4[pieza];
  if (!t) return null;
  let best: { fb: number; fm: number; fk: number } | null = null;
  for (const fb of FB_VALUES) {
    const row = t.data[fb];
    if (!row) continue;
    for (const fmStr of Object.keys(row)) {
      const fm = parseFloat(fmStr);
      const fk = row[fm];
      if (fk == null) continue;
      if (!best || fb * fm < best.fb * best.fm) best = { fb, fm, fk };
    }
  }
  return best;
}

function validateState(state: MasonryWallState, fab: FabricaResuelta): EdificioInvalid | null {
  if (state.plantas.length === 0) {
    return {
      invalid: true,
      reason: 'Define al menos una planta del edificio.',
      field: 'plantas',
      fix: 'Pulsa "+ Añadir planta" en el panel izquierdo.',
    };
  }
  if (state.t < 50) {
    return {
      invalid: true,
      reason: `Espesor t = ${state.t} mm < 50 mm. Demasiado fino para un muro de carga.`,
      field: 't',
      fix: 'Para fábrica tradicional usa t ≥ 12 cm (1 pie de ladrillo macizo es típicamente 24 cm).',
    };
  }
  if (state.L < 200) {
    return {
      invalid: true,
      reason: `Longitud L = ${state.L} mm < 200 mm. Comprueba la geometría.`,
      field: 'L',
      fix: 'Un muro de carga de fábrica típico tiene L ≥ 1 m.',
    };
  }
  if (state.gamma_M <= 0) {
    return {
      invalid: true,
      reason: `γ_M = ${state.gamma_M} no es válido (debe ser > 0).`,
      field: 'gamma_M',
      fix: 'Valor por defecto: γ_M = 2.5 (categoría control normal, §4.6.7).',
    };
  }
  if (!fab.fk || fab.fk <= 0) {
    if (fab.modo === 'tabla') {
      const sugerencia = sugerirFbFm(state.pieza);
      const fix = sugerencia
        ? `Prueba fb = ${sugerencia.fb} N/mm² con fm = ${sugerencia.fm} N/mm² → f_k = ${sugerencia.fk} N/mm².`
        : 'Cambia el tipo de pieza o pasa a modo "Personalizada".';
      return {
        invalid: true,
        reason: `Combinación de pieza, fb y fm no aplicable según Tabla 4.4 DB-SE-F.`,
        field: 'fk',
        fix,
      };
    }
    return {
      invalid: true,
      reason: `f_k = ${fab.fk ?? 0} no es válido (debe ser > 0).`,
      field: 'fk',
      fix: 'Introduce un valor de f_k coherente con el ensayo o la documentación de la fábrica.',
    };
  }
  return null;
}

/**
 * Cálculo completo del edificio.
 *
 * Pipeline en dos pasadas:
 *   1) Pre-pasada: cálculo de q_top[i] (axil acumulado en cabeza) + e_apoyo[i]
 *      + k_reparto[i] para cada planta. Necesario porque e_pie de planta i
 *      depende del forjado de planta i-1 (cruza fronteras).
 *   2) Pasada principal: machones + dinteles + comprobaciones por planta.
 *
 * Devuelve `EdificioResult` que es bien `{invalid, reason}` o
 * `{plantas: PlantaResult[]}`. La UI debe ramificar.
 */
export function calcularEdificio(state: MasonryWallState): EdificioResult {
  const fab = resolverFabrica(state);
  const guard = validateState(state, fab);
  if (guard) return guard;

  const { plantas, L, t } = state;
  const gG = state.gamma_G ?? 1.35;
  const gQ = state.gamma_Q ?? 1.50;
  // Ya hemos validado fab.fk arriba — el `!` está garantizado por el guard.
  const fk = fab.fk!;
  const f_d = fk / fab.gamma_M;
  const e_min = eMin(t);
  const peso_propio = fab.gamma;

  const n = plantas.length;

  // Pre-pasada: q_top, e_apoyo y k_reparto por planta.
  const q_top: number[] = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    const arriba = i + 1 < n
      ? q_top[i + 1] + gG * peso_propio * (t / 1000) * (plantas[i + 1].H / 1000)
      : 0;
    q_top[i] = arriba + mayorarLineal(plantas[i], gG, gQ);
  }
  const e_apoyo_arr: number[] = plantas.map((pl) =>
    pl.e_apoyo > 0 ? pl.e_apoyo : eApoyoForjado(t, pl.a_apoyo),
  );
  const k_reparto_arr: number[] = plantas.map((pl, i) => {
    const H_sup = i + 1 < n ? plantas[i + 1].H : 0;
    return repartoMomento(pl.H, H_sup);
  });

  return {
    invalid: false,
    plantas: plantas.map((pl, i) => {
      const machonesRaw = getMachonesPlanta(pl.huecos, L);
      const q_planta = q_top[i];
      const esCubierta = i === n - 1;

      // === DINTELES ===
      const dinteles: DintelResult[] = pl.huecos.map((h) => {
        const w_m = h.w / 1000;
        const esPuerta = h.tipo === 'puerta';
        const h_muro_sobre = esPuerta ? 0 : Math.max(0, pl.H - (h.y + h.h));
        const g_propio = gG * peso_propio * (t / 1000) * (h_muro_sobre / 1000);
        const q_dintel = q_planta + g_propio;

        // Cargas puntuales que caen sobre el hueco con sus posiciones para
        // distribución asimétrica de reacción (OV-6).
        const puntualesEnHueco = pl.puntuales.filter((p) => p.x >= h.x && p.x <= h.x + h.w);
        const P_sobre_hueco = puntualesEnHueco.reduce((s, p) => s + mayorarPuntual(p, gG, gQ), 0);

        // Reacciones del dintel: UDL siempre 50/50; puntuales reparto por brazo.
        let R_izq = (q_dintel * w_m) / 2;
        let R_dch = (q_dintel * w_m) / 2;
        for (const p of puntualesEnHueco) {
          const a_local = p.x - h.x;          // mm desde apoyo izq
          const Pd = mayorarPuntual(p, gG, gQ);
          R_izq += Pd * (h.w - a_local) / h.w;
          R_dch += Pd * a_local / h.w;
        }
        const N_total_dintel = q_dintel * w_m + P_sobre_hueco;
        const M_Ed = q_dintel * w_m * w_m / 8 + P_sobre_hueco * w_m / 4;
        const V_Ed = Math.max(R_izq, R_dch);
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
          R_izq,
          R_dch,
          R_apoyo: (R_izq + R_dch) / 2,
          M_Ed,
          V_Ed,
          P_sobre_hueco,
        };
      });

      // Asignar reacciones de dinteles a los machones adyacentes.
      // OV-2 fix: cuando el hueco toca el borde del muro (x≈0 o x+w≈L), el
      // apoyo "huérfano" se redirige al machón válido del otro lado o al más
      // cercano por distancia, en lugar de perderse silenciosamente.
      const reaccionesPorMachon: Record<string, number> = {};
      const tol = 5; // mm — tolerancia generosa para input rounding
      const asignar = (mid: string | undefined, R: number) => {
        if (!mid) return;
        reaccionesPorMachon[mid] = (reaccionesPorMachon[mid] || 0) + R;
      };
      const machonAt = (xObjetivo: number, esApoyoIzq: boolean): MachonRaw | undefined => {
        // Borde derecho de un machón coincide con apoyo izq del dintel.
        const exact = machonesRaw.find((mc) =>
          Math.abs((esApoyoIzq ? mc.x2 : mc.x1) - xObjetivo) < tol,
        );
        if (exact) return exact;
        // Fallback: machón más cercano por distancia mínima al borde objetivo.
        if (machonesRaw.length === 0) return undefined;
        return machonesRaw.reduce((best, mc) => {
          const dBest = Math.min(Math.abs(best.x1 - xObjetivo), Math.abs(best.x2 - xObjetivo));
          const dMc = Math.min(Math.abs(mc.x1 - xObjetivo), Math.abs(mc.x2 - xObjetivo));
          return dMc < dBest ? mc : best;
        }, machonesRaw[0]);
      };
      dinteles.forEach((d) => {
        const m_izq = machonAt(d.x1, true);
        const m_dch = machonAt(d.x2, false);
        if (!m_izq && !m_dch) return; // no hay machones — caso degenerado
        if (!m_izq && m_dch) {
          // Apoyo izquierdo huérfano (hueco en x≈0): toda la carga al derecho.
          asignar(m_dch.id, d.R_izq + d.R_dch);
        } else if (m_izq && !m_dch) {
          asignar(m_izq.id, d.R_izq + d.R_dch);
        } else {
          asignar(m_izq!.id, d.R_izq);
          asignar(m_dch!.id, d.R_dch);
        }
      });

      const e_apoyo = e_apoyo_arr[i];
      const k_reparto = k_reparto_arr[i];

      // OV-4: Cubierta — sin muro encima, k_reparto=1 implica que el momento
      // del forjado se repartiría todo a este muro. ρ_n captura el resto: con
      // cabeza menos restringida usamos ρ_n=1.0. Mantenemos k=1 por
      // consistencia con CTE (repartomomento entre dos muros conectados,
      // único muro recibe el 100%).
      const e_cabeza = Math.max(e_apoyo * k_reparto, e_min);

      // OV-7: e_pie de planta `i` depende del forjado en su pie, que es el
      // techo de planta i-1. La cuota que va al muro superior (planta i) es
      // (1 − k_reparto[i-1]) del e_apoyo de planta i-1.
      const e_pie = i > 0
        ? Math.max(e_apoyo_arr[i - 1] * (1 - k_reparto_arr[i - 1]), e_min)
        : e_min;

      // OV-5: ρ_n configurable por planta. Default según topología: 0.75
      // plantas con muro encima (doble arriostramiento), 1.0 cubierta (cabeza
      // menos restringida).
      const rho_n_default = esCubierta ? 1.0 : 0.75;
      const rho_n = pl.rho_n ?? rho_n_default;
      const h_ef = rho_n * pl.H;
      const lambda = h_ef / t;

      const e_m = 0.6 * Math.max(e_cabeza, e_pie) + 0.4 * Math.min(e_cabeza, e_pie);
      const e_a = h_ef / 450;
      const e_total = Math.max(e_m + e_a, e_min);

      // OV-8: Φ unificado — fórmula CTE EC-6 §6.1.2.2 acoplada (no producto
      // separable). La forma usada aquí es la versión simplificada CTE:
      //   Φ = (1 − 2·e_total/t) · (1 − A1·(λ−10))   para λ > 10
      //   con A1 = 1/30 (≈ pendiente de reducción por esbeltez)
      // Es coherente con la antigua phi_e · phi_l pero el clamp se aplica al
      // producto, no a cada factor por separado — esto evita la "doble
      // reducción" optimista cuando ambos términos son pequeños.
      const phi_unif = (1 - 2 * e_total / t) * (lambda > 10 ? Math.max(0, 1 - (lambda - 10) / 30) : 1.0);
      const Phi = Math.max(0.05, phi_unif);

      const machones: MachonResult[] = machonesRaw.map((m) => {
        const N_lineal = q_planta * (m.ancho / 1000);
        const P_directos = pl.puntuales.filter((p) => p.x >= m.x1 && p.x <= m.x2);
        const N_puntual = P_directos.reduce((s, p) => s + mayorarPuntual(p, gG, gQ), 0);
        const N_dinteles = reaccionesPorMachon[m.id] || 0;
        const N_Ed = N_lineal + N_puntual + N_dinteles;

        // OV-1: peso propio del muro de la planta sobre el propio machón —
        // permanente, mayorado por γG. Se añade a N_Ed_pie para verificar la
        // sección al pie del muro (donde típicamente es máxima).
        const peso_machon = gG * peso_propio * (m.ancho / 1000) * (t / 1000) * (pl.H / 1000);
        const N_Ed_pie = N_Ed + peso_machon;

        const A = m.ancho * t;
        const N_Rd = (Phi * f_d * A) / 1000;
        const eta_cabeza = N_Rd > 0 ? N_Ed / N_Rd : 99;
        const eta_pie = N_Rd > 0 ? N_Ed_pie / N_Rd : 99;
        const eta = Math.max(eta_cabeza, eta_pie);
        const sigma_top = (N_Ed * 1000) / A;
        const sigma_bottom = (N_Ed_pie * 1000) / A;

        // OV-3: β variable según posición de la carga puntual (§5.4).
        let etaConc = 0;
        if (P_directos.length && f_d > 0) {
          const peor = P_directos.reduce<{ s: number; eta: number }>((acc, p) => {
            const Pd = mayorarPuntual(p, gG, gQ);
            const sigmaLoc = (Pd * 1000) / (p.b_apoyo * t);
            const beta = betaConcentracion(p.x, L, pl.H);
            const etaLocal = sigmaLoc / (beta * f_d);
            return etaLocal > acc.eta ? { s: sigmaLoc, eta: etaLocal } : acc;
          }, { s: 0, eta: 0 });
          etaConc = peor.eta;
        }

        const etaMax = Math.max(eta, etaConc);
        let status: 'ok' | 'warn' | 'fail' = 'ok';
        if (etaMax >= 1.0) status = 'fail';
        else if (etaMax >= 0.8) status = 'warn';

        return {
          ...m,
          N_Ed,
          N_Ed_pie,
          N_lineal,
          N_puntual,
          N_dinteles,
          N_Rd,
          eta,
          eta_cabeza,
          eta_pie,
          sigma_top,
          sigma_bottom,
          sigma: sigma_top,
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
    }),
  };
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
