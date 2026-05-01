// FEM 2D — SteelBarInputs wrapper (Lane R5 V1.1)
//
// Projects DesignBar.steelSelection + bar geometry (L from FEM) into the shape
// expected by <SteelBeamsInputs hideLoads hideBeamType hideL>. The FEM envelope
// supplies MEd (from ELU), VEd (from ELU), Mser (from ELS-frec) — no user-input
// forces (Premise 10).
//
// `useCategory` is read-only derived from Q loads on this bar (Codex catch);
// for V1.1 the wrapper picks the first Q load's useCategory or falls back to
// 'B' silently (matches combinations.ts default). True per-load weighting in
// the adapter is V1.5 follow-up (TODOS).

import { useMemo } from 'react';
import type { LoadGenResult } from '../../../lib/calculations/loadGen';
import type { SteelBeamInputs, ElsCombo } from '../../../data/defaults';
import { SteelBeamsInputs } from '../../steel-beams/SteelBeamsInputs';
import { MAT } from '../presets';
import type {
  BarResult,
  DesignBar,
  DesignModel,
  Load,
  SteelSelection,
} from '../types';

interface Props {
  bar: DesignBar;
  setModel: (updater: (m: DesignModel) => DesignModel) => void;
  /** Solver result for this bar (envelope-derived MEd/VEd/Mser). */
  barResult: BarResult | undefined;
  /** Bar length in millimeters (from FEM geometry). */
  L_mm: number;
  /** Loads on this bar (used for useCategory derivation from first Q). */
  barLoads: Load[];
}

function deriveUseCategory(barLoads: Load[]): string {
  const firstQ = barLoads.find((l) => l.lc === 'Q' && l.useCategory);
  return firstQ?.useCategory ?? 'B';
}

export function SteelBarInputs({ bar, setModel, barResult, L_mm, barLoads }: Props) {
  const sel: SteelSelection = bar.steelSelection!;

  // Parse profileKey (e.g. 'steel_IPE240') → tipo + size for the standalone shape.
  const profile = MAT[sel.profileKey];
  const profileName = profile?.name ?? 'IPE 240';
  const m = /^([A-Z]+)\s*(\d+)/.exec(profileName);
  const tipo = (m?.[1] ?? 'IPE') as SteelBeamInputs['tipo'];
  const size = m?.[2] ? parseInt(m[2], 10) : 240;

  const derivedUseCategory = deriveUseCategory(barLoads);

  // Envelope-derived forces (worst absolute over ELU envelope for MEd/VEd, ELS-frec for Mser).
  const MEd  = barResult?.envelope?.ELU
    ? Math.max(...barResult.envelope.ELU.M.map(Math.abs), 0)
    : (barResult ? Math.max(...barResult.M.map(Math.abs), 0) : 0);
  const VEd  = barResult?.envelope?.ELU
    ? Math.max(...barResult.envelope.ELU.V.map(Math.abs), 0)
    : (barResult ? Math.max(...barResult.V.map(Math.abs), 0) : 0);
  const Mser = (() => {
    const env = barResult?.envelope?.[sel.elsCombo === 'quasi-permanent' ? 'ELS_cp' : 'ELS_frec'];
    return env ? Math.max(...env.M.map(Math.abs), 0) : 0;
  })();

  const state: SteelBeamInputs = useMemo(() => ({
    tipo,
    size,
    steel: sel.steel,
    beamType: sel.beamType,
    MEd,
    VEd,
    VEd_interaction: VEd, // V1.1: same as VEd; per-combination iteration is V1.5
    Lcr: L_mm,
    Mser,
    L: L_mm,
    deflLimit: sel.deflLimit,
    elsCombo: sel.elsCombo as ElsCombo,
    useCategory: derivedUseCategory,
    gk: 0,    // hidden in FEM embed
    qk: 0,    // hidden
    bTrib: 1, // hidden
  }), [tipo, size, sel, MEd, VEd, Mser, L_mm, derivedUseCategory]);

  // Synthetic loadGen so the (hidden) derivation block doesn't show '--'.
  const loadGen: LoadGenResult = useMemo(() => ({
    Gk_line: 0,
    Qk_line: 0,
    wEd: 0,
    wSer: 0,
    psi: 1,
    MEd,
    VEd,
    VEd_interaction: VEd,
    Mser,
  }), [MEd, VEd, Mser]);

  function setField(field: keyof SteelBeamInputs, value: SteelBeamInputs[keyof SteelBeamInputs]) {
    setModel((m) => ({
      ...m,
      bars: m.bars.map((b) => {
        if (b.id !== bar.id) return b;
        // Map back to SteelSelection.
        if (field === 'tipo' || field === 'size') {
          // Reconstruct profileKey from tipo + size (e.g. 'steel_IPE300').
          const newTipo  = field === 'tipo'  ? (value as string) : tipo;
          const newSize  = field === 'size'  ? (value as number) : size;
          return { ...b, steelSelection: { ...sel, profileKey: `steel_${newTipo}${newSize}` } };
        }
        if (field === 'steel')      return { ...b, steelSelection: { ...sel, steel: value as 'S275' | 'S355' } };
        if (field === 'deflLimit')  return { ...b, steelSelection: { ...sel, deflLimit: value as number } };
        if (field === 'elsCombo')   return { ...b, steelSelection: { ...sel, elsCombo: value as 'characteristic' | 'frequent' | 'quasi-permanent' } };
        // Forces, loads, beamType, L, useCategory: ignored (FEM-controlled).
        return b;
      }),
    }));
  }

  return (
    <SteelBeamsInputs
      state={state}
      setField={setField}
      displayLcr={L_mm}
      lcrIsAuto
      onLcrChange={() => { /* FEM owns Lcr — ignore */ }}
      loadGen={loadGen}
      hideLoads
      hideBeamType
      hideL
    />
  );
}
