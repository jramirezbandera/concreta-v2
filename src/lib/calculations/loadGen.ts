import { type SteelBeamInputs, type ElsCombo } from '../../data/defaults';
import { BEAM_CASES } from './beamCases';

export const GAMMA_G = 1.35;
export const GAMMA_Q = 1.50;

/** ψ factors per use category — CTE DB-SE-AE Tabla 4.2 */
const PSI_VALUES: Record<string, { psi0: number; psi1: number; psi2: number }> = {
  A1:     { psi0: 0.7, psi1: 0.5, psi2: 0.3 },
  A2:     { psi0: 0.7, psi1: 0.5, psi2: 0.3 },
  B:      { psi0: 0.7, psi1: 0.5, psi2: 0.3 },
  C1:     { psi0: 0.7, psi1: 0.7, psi2: 0.6 },
  C2:     { psi0: 0.7, psi1: 0.7, psi2: 0.6 },
  C3:     { psi0: 0.7, psi1: 0.7, psi2: 0.6 },
  D1:     { psi0: 0.7, psi1: 0.7, psi2: 0.6 },
  E1:     { psi0: 1.0, psi1: 0.9, psi2: 0.8 },
  G1:     { psi0: 0.7, psi1: 0.5, psi2: 0.3 },
  custom: { psi0: 0.7, psi1: 0.5, psi2: 0.3 },
};

/** Returns the ψ multiplier applied to Qk for the given ELS combination. */
export function getPsiForCategory(useCategory: string, combo: ElsCombo): number {
  const row = PSI_VALUES[useCategory] ?? PSI_VALUES['custom'];
  if (combo === 'characteristic')   return 1.0;
  if (combo === 'frequent')         return row.psi1;
  /* quasi-permanent */             return row.psi2;
}

/** Returns the full ψ row (ψ0, ψ1, ψ2) for a category. */
export function getPsiRow(useCategory: string): { psi0: number; psi1: number; psi2: number } {
  return PSI_VALUES[useCategory] ?? PSI_VALUES['custom'];
}

export interface LoadGenResult {
  Gk_line: number;        // kN/m
  Qk_line: number;        // kN/m
  wEd: number;            // kN/m (ELU fundamental combination)
  wSer: number;           // kN/m (ELS combination, psi-weighted)
  psi: number;            // ψ coefficient applied to Qk in wSer
  MEd: number;            // kNm
  VEd: number;            // kN
  VEd_interaction: number;// kN (at critical M section, beam-type specific)
  Mser: number;           // kNm
}

export function deriveFromLoads(inp: SteelBeamInputs): LoadGenResult {
  const L_m = inp.L / 1000;  // mm → m
  const Gk_line = inp.gk * inp.bTrib;
  const Qk_line = inp.qk * inp.bTrib;
  const wEd  = GAMMA_G * Gk_line + GAMMA_Q * Qk_line;
  const psi  = getPsiForCategory(inp.useCategory, inp.elsCombo ?? 'characteristic');
  const wSer = Gk_line + psi * Qk_line;
  const spec = BEAM_CASES[inp.beamType];
  return {
    Gk_line,
    Qk_line,
    wEd,
    wSer,
    psi,
    MEd:             spec.MEd(wEd, L_m),
    VEd:             spec.VEd(wEd, L_m),
    VEd_interaction: spec.VEd_interaction(wEd, L_m),
    Mser:            spec.MEd(wSer, L_m),
  };
}
