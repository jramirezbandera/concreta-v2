import { type SteelBeamInputs } from '../../data/defaults';

export const GAMMA_G = 1.35;
export const GAMMA_Q = 1.50;

export interface LoadGenResult {
  Gk_line: number;  // kN/m
  Qk_line: number;  // kN/m
  wEd: number;      // kN/m (ELU fundamental combination)
  wSer: number;     // kN/m (ELS characteristic combination)
  MEd: number;      // kNm
  VEd: number;      // kN
  Mser: number;     // kNm
}

export function deriveFromLoads(inp: SteelBeamInputs): LoadGenResult {
  const L_m = inp.L / 1000;  // mm → m
  const Gk_line = inp.gk * inp.bTrib;
  const Qk_line = inp.qk * inp.bTrib;
  const wEd = GAMMA_G * Gk_line + GAMMA_Q * Qk_line;
  const wSer = Gk_line + Qk_line;
  return {
    Gk_line,
    Qk_line,
    wEd,
    wSer,
    MEd:  (wEd  * L_m ** 2) / 8,
    VEd:  (wEd  * L_m) / 2,
    Mser: (wSer * L_m ** 2) / 8,
  };
}
