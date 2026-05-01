// FEM 2D — Combinations module (CTE DB-SE Tabla 4.2)
//
// Produces weighted load combinations for ELU, ELS-frecuente and ELS-cuasiperm
// from a list of FEM loads. Each combination is a `WeightedSet` mapping loadId
// → factor. The solver applies the factors to per-LC samples and aggregates
// envelopes (worst per sample point across combinations).
//
// Multi-principal pattern (CTE DB-SE 4.3.2):
//   - ELU:      γG·G + γQ·X_principal + γQ·Σ(ψ0·X_simultaneous)  for each variable
//                                                                  as principal.
//   - ELS-frec: 1·G + ψ1·X_principal + Σ(ψ2·X_simultaneous)        idem.
//   - ELS-cp:   1·G + Σ(ψ2·X_j)                                    single combo.
//
// ψ table per LC (Tabla 4.2 CTE):
//   - G: factor 1.35 (ELU) or 1.0 (ELS) — no ψ ramifications.
//   - Q: ψ depends on `load.useCategory` (Tabla 3.1). Falls back to 'B' when
//        useCategory is undefined (data migration safe-default).
//   - W: ψ0=0.6, ψ1=0.5, ψ2=0       — viento (CTE A.4)
//   - S: ψ0=0.5, ψ1=0.2, ψ2=0       — nieve <1000m altitude (V1 assumption)
//   - E: ψ0=0,   ψ1=0,   ψ2=0       — sismo (treated as variable for V1)
//
// V1.1 limitation: snow assumed <1000m altitude. Higher altitudes (CTE Anejo E)
// have ψ0=0.7. Rare in vigas continuas residenciales/oficina (the V1 wedge).
//
//
// DATA FLOW
// ═══════════════════════════════════════════════════════════════════
//
//   model.loads ──┐
//                 ├──► buildCombinations(loads) ──► ModelCombinations
//   getPsi(load) ─┘                                  │
//                                                    ▼
//                              { ELU: WeightedSet[], ELS_frec: ..., ELS_cp }
//                                                    │
//                                                    ▼
//                              solveDesignModel iterates combinations,
//                              produces perBar[id].combinations[].samples,
//                              adapter consumes per-combination + envelopes.

import { getPsiRow } from '../../lib/calculations/loadGen';
import type { Load, LoadCase, UseCategoryCode } from './types';

// ── ψ table per LC ──────────────────────────────────────────────────────────

interface PsiRow { psi0: number; psi1: number; psi2: number; }

const PSI_LC_FIXED: Record<Exclude<LoadCase, 'G' | 'Q'>, PsiRow> = {
  W: { psi0: 0.6, psi1: 0.5, psi2: 0   },
  S: { psi0: 0.5, psi1: 0.2, psi2: 0   },
  E: { psi0: 0,   psi1: 0,   psi2: 0   },
};

/** ψ row for a load. Falls back to `fallback` for Q loads without category. */
export function getPsi(load: Load, fallback: UseCategoryCode = 'B'): PsiRow {
  if (load.lc === 'G') return { psi0: 1, psi1: 1, psi2: 1 }; // unused (G always full)
  if (load.lc === 'Q') {
    const cat = load.useCategory ?? fallback;
    return getPsiRow(cat);
  }
  return PSI_LC_FIXED[load.lc];
}

// ── Combination types ───────────────────────────────────────────────────────

const GAMMA_G_ELU = 1.35;
const GAMMA_VAR_ELU = 1.5;

export interface WeightedSet {
  name: string;
  /** Load id → multiplicative factor. Loads not in the map have factor 0. */
  factors: Record<string, number>;
}

export interface ModelCombinations {
  /** ELU multi-principal: one combo per variable as dominant. At least 1 combo
   *  (G-only when there are no variables). */
  ELU: WeightedSet[];
  /** ELS-frec multi-principal: one combo per variable as ψ1-dominant. */
  ELS_frec: WeightedSet[];
  /** ELS-cuasiperm: single combo, ψ2 to all variables. */
  ELS_cp: WeightedSet;
}

export interface BuildOpts {
  /** Default useCategory for Q loads without `load.useCategory`. Default 'B'. */
  fallbackUseCategory?: UseCategoryCode;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Build CTE Tabla 4.2 combinations from FEM loads.
 *
 * Algorithm:
 *   1. Split loads into G (permanent) and variable (Q/W/S/E).
 *   2. ELU: if no variables → `1.35·G`. Else: for each variable as principal,
 *      one combo with that variable γ=1.5 and others γ=1.5·ψ0.
 *   3. ELS-frec: idem with γ=1·G + ψ1·principal + ψ2·others.
 *   4. ELS-cp: single combo with 1·G + Σ(ψ2·variable).
 *
 * Effort: O(L²) where L is number of variable loads. Trivial for V1 (≤20 bars).
 */
export function buildCombinations(loads: Load[], opts: BuildOpts = {}): ModelCombinations {
  const fallback = opts.fallbackUseCategory ?? 'B';
  const G_loads = loads.filter((l) => l.lc === 'G');
  const var_loads = loads.filter((l) => l.lc !== 'G');

  // ELU
  const ELU: WeightedSet[] = [];
  if (var_loads.length === 0) {
    const factors: Record<string, number> = {};
    for (const l of G_loads) factors[l.id] = GAMMA_G_ELU;
    ELU.push({ name: 'ELU_G_only', factors });
  } else {
    for (const principal of var_loads) {
      const factors: Record<string, number> = {};
      for (const l of G_loads) factors[l.id] = GAMMA_G_ELU;
      factors[principal.id] = GAMMA_VAR_ELU;
      for (const sim of var_loads) {
        if (sim.id === principal.id) continue;
        const psi0 = getPsi(sim, fallback).psi0;
        factors[sim.id] = GAMMA_VAR_ELU * psi0;
      }
      ELU.push({ name: `ELU_${principal.id}_principal`, factors });
    }
  }

  // ELS-frecuente
  const ELS_frec: WeightedSet[] = [];
  if (var_loads.length === 0) {
    const factors: Record<string, number> = {};
    for (const l of G_loads) factors[l.id] = 1;
    ELS_frec.push({ name: 'ELS_frec_G_only', factors });
  } else {
    for (const principal of var_loads) {
      const factors: Record<string, number> = {};
      for (const l of G_loads) factors[l.id] = 1;
      factors[principal.id] = getPsi(principal, fallback).psi1;
      for (const sim of var_loads) {
        if (sim.id === principal.id) continue;
        factors[sim.id] = getPsi(sim, fallback).psi2;
      }
      ELS_frec.push({ name: `ELS_frec_${principal.id}_principal`, factors });
    }
  }

  // ELS-cuasipermanente — single combination
  const cp_factors: Record<string, number> = {};
  for (const l of G_loads) cp_factors[l.id] = 1;
  for (const v of var_loads) {
    cp_factors[v.id] = getPsi(v, fallback).psi2;
  }
  const ELS_cp: WeightedSet = { name: 'ELS_cuasiperm', factors: cp_factors };

  return { ELU, ELS_frec, ELS_cp };
}

/**
 * Number of Q-type loads without explicit `useCategory`. Used by hydration
 * (loadFromStorage / decodeShareString) to surface a toast when defaults were
 * applied (Codex final pass #2 fix — silent fallback was a trust bug).
 */
export function countQLoadsWithoutCategory(loads: Load[]): number {
  return loads.filter((l) => l.lc === 'Q' && !l.useCategory).length;
}
