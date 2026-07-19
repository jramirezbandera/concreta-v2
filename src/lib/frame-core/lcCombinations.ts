// frame-core — LC-level combinations helper  [moved from
// features/fem-analysis/lcCombinations.ts — Lane B extraction, D12]
//
// Builds CTE Tabla 4.2 multi-principal combinations at the *LC* (load-case)
// granularity, not per-load. The solvers produce per-LC samples (G/Q/W/S/E
// aggregated), so combinations operate at the same granularity. True per-load
// granularity is V1.5 work (would require per-load solver samples).
//
// Multi-principal pattern (CTE DB-SE 4.3.2):
//   - ELU:      γG·G + γQ·X_principal + γQ·Σ(ψ0·X_simultaneous)  one combo per
//                                                                  variable LC.
//   - ELS-frec: 1·G + ψ1·X_principal + Σ(ψ2·X_simultaneous)        idem.
//   - ELS-cp:   1·G + Σ(ψ2·X_j)                                    single combo.
//
// Used by:
//   - fem-analysis/solveDesignModel: worst-of envelope per combination group.
//   - fem-analysis/adapters/steelBeams: iterates ELU combinations per-bar.
//   - fem2d checks phase (T5/T6): the 2D check path runs the REAL
//     multi-principal set (eng-review mandatory fix — never the summed bucket).

import { getPsi } from './combinations';
import type { CaseTaggedLoad, LoadCase } from './types';

const ELU_GAMMA_G = 1.35;
const ELU_GAMMA_VAR = 1.5;

export type LcFactors = Partial<Record<LoadCase, number>>;

export interface LcCombinations {
  /** ELU multi-principal: one combo per variable LC. At least 1 combo. */
  ELU: LcFactors[];
  /** ELS-característica multi-principal: G + X_principal + Σ ψ0·X_sim.
   *  Default for deflection limits per CTE DB-SE 4.3.2.3. */
  ELS_c: LcFactors[];
  /** ELS-frec multi-principal: G + ψ1·X_principal + Σ ψ2·X_sim. */
  ELS_frec: LcFactors[];
  /** ELS-cuasiperm: single combo (no principal, ψ2 to all variables). */
  ELS_cp: LcFactors;
}

/**
 * Build LC-level combinations from case-tagged loads. Representative load per
 * LC (first encountered) drives ψ for that group — V1.1 limitation when loads
 * of the same LC carry different categories. Future V1.5 with per-load samples
 * would be fully granular.
 */
export function buildLcCombinations(loads: CaseTaggedLoad[]): LcCombinations {
  const var_lcs = Array.from(
    new Set(loads.filter((l) => l.lc !== 'G').map((l) => l.lc)),
  );
  // First load per LC (used to derive ψ for the group).
  const repByLc: Partial<Record<LoadCase, CaseTaggedLoad>> = {};
  for (const l of loads) {
    if (!repByLc[l.lc]) repByLc[l.lc] = l;
  }
  const psi0 = (lc: LoadCase) => repByLc[lc] ? getPsi(repByLc[lc]!).psi0 : 0;
  const psi1 = (lc: LoadCase) => repByLc[lc] ? getPsi(repByLc[lc]!).psi1 : 0;
  const psi2 = (lc: LoadCase) => repByLc[lc] ? getPsi(repByLc[lc]!).psi2 : 0;

  const ELU: LcFactors[] = [];
  if (var_lcs.length === 0) {
    ELU.push({ G: ELU_GAMMA_G });
  } else {
    for (const principal of var_lcs) {
      const f: LcFactors = { G: ELU_GAMMA_G, [principal]: ELU_GAMMA_VAR };
      for (const sim of var_lcs) {
        if (sim === principal) continue;
        f[sim] = ELU_GAMMA_VAR * psi0(sim);
      }
      ELU.push(f);
    }
  }

  // ELS-característica multi-principal (γG=1, γQ=1 for principal, ψ0 for sim)
  const ELS_c: LcFactors[] = [];
  if (var_lcs.length === 0) {
    ELS_c.push({ G: 1 });
  } else {
    for (const principal of var_lcs) {
      const f: LcFactors = { G: 1, [principal]: 1 };
      for (const sim of var_lcs) {
        if (sim === principal) continue;
        f[sim] = psi0(sim);
      }
      ELS_c.push(f);
    }
  }

  const ELS_frec: LcFactors[] = [];
  if (var_lcs.length === 0) {
    ELS_frec.push({ G: 1 });
  } else {
    for (const principal of var_lcs) {
      const f: LcFactors = { G: 1, [principal]: psi1(principal) };
      for (const sim of var_lcs) {
        if (sim === principal) continue;
        f[sim] = psi2(sim);
      }
      ELS_frec.push(f);
    }
  }

  const ELS_cp: LcFactors = { G: 1 };
  for (const lc of var_lcs) ELS_cp[lc] = psi2(lc);

  return { ELU, ELS_c, ELS_frec, ELS_cp };
}
