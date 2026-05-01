// FEM 2D — RC beam adapter
//
// Bridges the FEM solver output to the existing calcRCBeam check engine.
// For each design bar with material='rc', this adapter:
//
//   1. Combines per-load-case samples into ELU = 1.35·G + 1.5·var and
//      ELS-c = 1·G + 1·var envelopes (V1 simplification: var = Q+W+S+E).
//   2. Rolls up the envelope per design bar (handles mid-bar splits where
//      multiple analysis elements share the same designBarId).
//   3. Splits the per-bar envelope into vano + apoyo regions:
//        vano  = [0.25·L, 0.75·L]
//        apoyo = [0, 0.15·L] ∪ [0.85·L, L]
//   4. Reads max |M+| from vano (sagging side), max |M-| from apoyo (hogging).
//      For shear: takes max |V| within EACH region (post-Codex correction —
//      the original "V at the location of M_max" formula is unconservative
//      because midspan |V| is typically near zero while the actual governing
//      shear occurs elsewhere in the region).
//   5. Constructs a full RCBeamInputs object with cm→mm conversion + the
//      user's vano_armado / apoyo_armado.
//   6. Calls calcRCBeam and returns its RCBeamResult plus the envelope used.
//
// Returns 'pending' when armado is not yet set — the user has the bar but
// hasn't entered rebar layout in the panel.

import { calcRCBeam } from '../../../lib/calculations/rcBeams';
import { getPsiRow, USE_CATEGORIES } from '../../../lib/calculations/loadGen';
import type { RCBeamInputs } from '../../../data/defaults';
import type {
  ArmadoHA,
  DesignBar,
  RcSection,
  SolverElementResult,
} from '../types';
import { cmToMm } from './units';

// ── Envelope geometry ──────────────────────────────────────────────────────

const VANO_FROM = 0.25;
const VANO_TO = 0.75;
const APOYO_TO = 0.15;
const APOYO_FROM = 0.85;

// Combination factors — V1 (single 'var' bucket).
const ELU_GAMMA_G = 1.35;
const ELU_GAMMA_VAR = 1.5;

// ── Public API ─────────────────────────────────────────────────────────────

export interface RcBarEnvelope {
  /** Total bar length (sum of analysis-element lengths under this designBar). */
  L: number;
  /** Vano (positive bending region) ELU peaks. */
  vano_Md_ELU: number;          // signed; positive sagging dominant in vano
  vano_VEd_ELU: number;         // |V| max within the vano region
  vano_x_at_Md: number;         // x_global where ELU vano M peaks (relative to bar i-end)
  vano_M_G: number;             // M_G at x_at_Md (for ELS-c fisuración split)
  vano_M_Q: number;             // M_var at x_at_Md
  /** Apoyo (negative bending region) ELU peaks. */
  apoyo_Md_ELU: number;         // signed; negative hogging typical
  apoyo_VEd_ELU: number;
  apoyo_x_at_Md: number;
  apoyo_M_G: number;
  apoyo_M_Q: number;
}

export interface AdaptResult {
  /** 'pending' when armado is not yet provided. The envelope is still computed. */
  status: 'ok' | 'pending';
  envelope: RcBarEnvelope;
  /** RCBeamInputs constructed from the envelope + user armado. Undefined when status='pending'. */
  inputs?: RCBeamInputs;
  /** calcRCBeam output. Undefined when status='pending' (no inputs to check). */
  result?: ReturnType<typeof calcRCBeam>;
}

/**
 * Adapt one design bar (HA) to a calcRCBeam call. Pass the design bar plus
 * the SolverElementResult entries that belong to it (filter by designBarId
 * upstream, or pass them all and the adapter will filter).
 */
export function adaptRcBar(
  bar: DesignBar,
  allElements: SolverElementResult[],
): AdaptResult {
  if (bar.material !== 'rc' || !bar.rcSection) {
    throw new Error(`adaptRcBar called with non-RC bar ${bar.id}`);
  }
  const elements = allElements.filter((e) => e.designBarId === bar.id);
  if (elements.length === 0) {
    return {
      status: 'pending',
      envelope: zeroEnvelope(0),
    };
  }

  const envelope = computeEnvelope(elements);

  // If the user hasn't entered armado yet for either region, return pending.
  if (!bar.vano_armado || !bar.apoyo_armado) {
    return { status: 'pending', envelope };
  }

  const inputs = buildRcBeamInputs(bar.rcSection, envelope, bar.vano_armado, bar.apoyo_armado);
  const result = calcRCBeam(inputs);
  return { status: 'ok', envelope, inputs, result };
}

// ── Envelope computation ────────────────────────────────────────────────────

function zeroEnvelope(L: number): RcBarEnvelope {
  return {
    L,
    vano_Md_ELU: 0, vano_VEd_ELU: 0, vano_x_at_Md: 0, vano_M_G: 0, vano_M_Q: 0,
    apoyo_Md_ELU: 0, apoyo_VEd_ELU: 0, apoyo_x_at_Md: 0, apoyo_M_G: 0, apoyo_M_Q: 0,
  };
}

interface FlatSample { x: number; M_G: number; M_var: number; V_G: number; V_var: number }

/**
 * Build the bar-level x-axis by concatenating each element's local x samples
 * with its cumulative offset (sum of lengths of preceding elements that
 * belong to the same design bar). Then for each sample compute G and var
 * combined values from the per-load-case samples.
 */
function computeEnvelope(elements: SolverElementResult[]): RcBarEnvelope {
  // Determine total bar length (sum of element lengths).
  const L = elements.reduce((s, e) => s + e.L, 0);

  // Flatten samples to [x_global_along_bar, M_G, M_var, V_G, V_var].
  const flat: FlatSample[] = [];
  let xOffset = 0;
  for (const e of elements) {
    const xs = e.samples.xs;
    const M_G_arr = e.samples.M.G ?? new Array<number>(xs.length).fill(0);
    const V_G_arr = e.samples.V.G ?? new Array<number>(xs.length).fill(0);
    // Sum every variable-bucket case into a single M_var / V_var array.
    const sumOver = ['Q', 'W', 'S', 'E'] as const;
    const M_var_arr = new Array<number>(xs.length).fill(0);
    const V_var_arr = new Array<number>(xs.length).fill(0);
    for (const lc of sumOver) {
      const Ma = e.samples.M[lc];
      const Va = e.samples.V[lc];
      if (Ma) for (let i = 0; i < xs.length; i++) M_var_arr[i] += Ma[i];
      if (Va) for (let i = 0; i < xs.length; i++) V_var_arr[i] += Va[i];
    }
    for (let i = 0; i < xs.length; i++) {
      flat.push({
        x: xOffset + xs[i],
        M_G: M_G_arr[i],
        M_var: M_var_arr[i],
        V_G: V_G_arr[i],
        V_var: V_var_arr[i],
      });
    }
    xOffset += e.L;
  }

  if (flat.length === 0) return zeroEnvelope(L);

  // Filter into vano and apoyo regions.
  const vanoLow = VANO_FROM * L;
  const vanoHigh = VANO_TO * L;
  const apoyoTo = APOYO_TO * L;
  const apoyoFrom = APOYO_FROM * L;

  const vano = flat.filter((s) => s.x >= vanoLow && s.x <= vanoHigh);
  const apoyo = flat.filter((s) => s.x <= apoyoTo || s.x >= apoyoFrom);

  // Vano: pick sample that maximizes M_ELU = 1.35·M_G + 1.5·M_var (signed,
  // positive sagging). Take max value (most positive). Fall back to first
  // sample if vano is empty (shouldn't happen for any reasonable bar).
  const vanoBest = vano.length > 0 ? pickMax(vano, ELU_GAMMA_G, ELU_GAMMA_VAR) : flat[0];
  // Apoyo: pick sample that MAXIMIZES |M_ELU| (we want the worst hogging or
  // sagging — typically the most negative for continuous beams).
  const apoyoBest = apoyo.length > 0 ? pickMaxAbs(apoyo, ELU_GAMMA_G, ELU_GAMMA_VAR) : flat[0];

  // Shear: max |V_ELU| within each REGION (post-Codex correction).
  const vanoVabs = vano.length > 0
    ? Math.max(...vano.map((s) => Math.abs(ELU_GAMMA_G * s.V_G + ELU_GAMMA_VAR * s.V_var)))
    : 0;
  const apoyoVabs = apoyo.length > 0
    ? Math.max(...apoyo.map((s) => Math.abs(ELU_GAMMA_G * s.V_G + ELU_GAMMA_VAR * s.V_var)))
    : 0;

  return {
    L,
    vano_Md_ELU: ELU_GAMMA_G * vanoBest.M_G + ELU_GAMMA_VAR * vanoBest.M_var,
    vano_VEd_ELU: vanoVabs,
    vano_x_at_Md: vanoBest.x,
    vano_M_G: vanoBest.M_G,
    vano_M_Q: vanoBest.M_var,
    apoyo_Md_ELU: ELU_GAMMA_G * apoyoBest.M_G + ELU_GAMMA_VAR * apoyoBest.M_var,
    apoyo_VEd_ELU: apoyoVabs,
    apoyo_x_at_Md: apoyoBest.x,
    apoyo_M_G: apoyoBest.M_G,
    apoyo_M_Q: apoyoBest.M_var,
  };
}

function pickMax(samples: FlatSample[], gG: number, gV: number): FlatSample {
  let best = samples[0];
  let bestVal = gG * best.M_G + gV * best.M_var;
  for (let i = 1; i < samples.length; i++) {
    const v = gG * samples[i].M_G + gV * samples[i].M_var;
    if (v > bestVal) { best = samples[i]; bestVal = v; }
  }
  return best;
}

function pickMaxAbs(samples: FlatSample[], gG: number, gV: number): FlatSample {
  let best = samples[0];
  let bestVal = Math.abs(gG * best.M_G + gV * best.M_var);
  for (let i = 1; i < samples.length; i++) {
    const v = Math.abs(gG * samples[i].M_G + gV * samples[i].M_var);
    if (v > bestVal) { best = samples[i]; bestVal = v; }
  }
  return best;
}

// ── RCBeamInputs construction ───────────────────────────────────────────────

function buildRcBeamInputs(
  section: RcSection,
  env: RcBarEnvelope,
  vanoArmado: ArmadoHA,
  apoyoArmado: ArmadoHA,
): RCBeamInputs {
  // FEM uses the same CTE DB-SE-AE Tabla 3.1 categories as steel-beams (A1,
  // A2, B, C1, C2, C3, D1, E1, G1). The legacy rcBeams calc engine still
  // expects 'residential|office|parking|roof|custom'. We translate by reading
  // ψ2 from the Tabla 4.2 row (single source of truth for ELU/ELS) and
  // injecting it via psi2Custom + loadType='custom'. This guarantees both
  // modules apply identical ψ2 for ELS quasi-permanent combinations.
  const isCteCategory = USE_CATEGORIES.some((c) => c.value === section.loadType);
  const engineLoadType = isCteCategory ? 'custom' : section.loadType;
  const psi2Custom = isCteCategory ? getPsiRow(section.loadType).psi2 : 0.3;

  return {
    b: cmToMm(section.b),
    h: cmToMm(section.h),
    cover: section.cover,
    fck: section.fck,
    fyk: section.fyk,
    exposureClass: section.exposureClass,
    loadType: engineLoadType,
    psi2Custom,

    // Vano — sagging region. Signed Md preserved (calcRCBeam uses absolute value internally).
    vano_Md: Math.abs(env.vano_Md_ELU),
    vano_VEd: env.vano_VEd_ELU,
    vano_M_G: Math.abs(env.vano_M_G),
    vano_M_Q: Math.abs(env.vano_M_Q),
    // Vano armado: tension on bottom (sagging), compression on top.
    vano_bot_nBars: vanoArmado.tens_nBars,
    vano_bot_barDiam: vanoArmado.tens_barDiam,
    vano_top_nBars: vanoArmado.comp_nBars,
    vano_top_barDiam: vanoArmado.comp_barDiam,
    vano_stirrupDiam: vanoArmado.stirrupDiam,
    vano_stirrupSpacing: vanoArmado.stirrupSpacing,
    vano_stirrupLegs: vanoArmado.stirrupLegs,

    // Apoyo — hogging region. Signed Md preserved as absolute (rcBeams uses |M|).
    apoyo_Md: Math.abs(env.apoyo_Md_ELU),
    apoyo_VEd: env.apoyo_VEd_ELU,
    apoyo_M_G: Math.abs(env.apoyo_M_G),
    apoyo_M_Q: Math.abs(env.apoyo_M_Q),
    // Apoyo armado: tension on top (hogging), compression on bottom.
    apoyo_top_nBars: apoyoArmado.tens_nBars,
    apoyo_top_barDiam: apoyoArmado.tens_barDiam,
    apoyo_bot_nBars: apoyoArmado.comp_nBars,
    apoyo_bot_barDiam: apoyoArmado.comp_barDiam,
    apoyo_stirrupDiam: apoyoArmado.stirrupDiam,
    apoyo_stirrupSpacing: apoyoArmado.stirrupSpacing,
    apoyo_stirrupLegs: apoyoArmado.stirrupLegs,
  };
}
