// FEM 1D — SteelBarInputs wrapper (Lane R5 V1.1)
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
import {
  STEEL_FAMILIES as SECTION_FAMILIES,
  familyOfKey,
  nearestInFamily,
  steelEntriesByFamily,
  type SteelFamily,
} from '../../../lib/sections';
import { parseProfileKey } from '../adapters/steelBeams';
import type {
  BarResult,
  DesignBar,
  DesignModel,
  Load,
  SteelSelection,
} from '../types';

/** Familias ofertadas en barras 1D (flexión): todas menos los angulares L. */
const BAR_FAMILIES: readonly SteelFamily[] = SECTION_FAMILIES.filter((f) => f !== 'L');

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

  // Profile fields via the unified registry (same mapping the check adapter
  // uses — the panel and the check can't disagree on what profile this is).
  const profileFields = useMemo(() => parseProfileKey(sel.profileKey), [sel.profileKey]);

  // Lcr efectiva: el override manual vive en SteelSelection.Lcr (METROS,
  // persiste con el modelo); sin override, auto = luz de la barra — el mismo
  // fallback que aplica adaptSteelBar al comprobar.
  const lcrMm = sel.Lcr != null ? Math.round(sel.Lcr * 1000) : L_mm;

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
    title: '',        // metadato de documento; las barras FEM no llevan título propio
    ...profileFields,
    steel: sel.steel,
    beamType: sel.beamType,
    MEd,
    VEd,
    VEd_interaction: VEd, // V1.1: same as VEd; per-combination iteration is V1.5
    Lcr: lcrMm,
    Mser,
    L: L_mm,
    deflLimit: sel.deflLimit,
    elsCombo: sel.elsCombo as ElsCombo,
    useCategory: derivedUseCategory,
    gk: 0,    // hidden in FEM embed
    qk: 0,    // hidden
    bTrib: 1, // hidden
  }), [profileFields, sel, MEd, VEd, Mser, L_mm, lcrMm, derivedUseCategory]);

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

  function setProfileKey(key: string) {
    setModel((m) => ({
      ...m,
      bars: m.bars.map((b) => (b.id === bar.id ? { ...b, steelSelection: { ...sel, profileKey: key } } : b)),
    }));
  }

  function setField(field: keyof SteelBeamInputs, value: SteelBeamInputs[keyof SteelBeamInputs]) {
    setModel((m) => ({
      ...m,
      bars: m.bars.map((b) => {
        if (b.id !== bar.id) return b;
        // Map back to SteelSelection. Profile selection now goes through the
        // catalog-keyed familia+tamaño selects (setProfileKey) — the standalone
        // profile block is hidden (hideProfile), so tipo/size/dims never land here.
        if (field === 'steel')      return { ...b, steelSelection: { ...sel, steel: value as 'S275' | 'S355' } };
        if (field === 'deflLimit')  return { ...b, steelSelection: { ...sel, deflLimit: value as number } };
        if (field === 'elsCombo')   return { ...b, steelSelection: { ...sel, elsCombo: value as 'characteristic' | 'frequent' | 'quasi-permanent' } };
        // Forces, loads, beamType, L, useCategory: ignored (FEM-controlled).
        return b;
      }),
    }));
  }

  // Lcr manual → SteelSelection.Lcr en METROS (adaptSteelBar lo multiplica
  // ×1000 al comprobar). Volver a teclear la luz (±5 mm, la misma tolerancia
  // del módulo standalone) borra el override y el badge vuelve a "auto".
  function handleLcrChange(valMm: number) {
    const manual = Math.abs(valMm - L_mm) > 5;
    setModel((m) => ({
      ...m,
      bars: m.bars.map((b) => {
        if (b.id !== bar.id) return b;
        const next: SteelSelection = { ...sel };
        if (manual) next.Lcr = valMm / 1000;
        else delete next.Lcr;
        return { ...b, steelSelection: next };
      }),
    }));
  }

  // Familia + tamaño (claves del catálogo unificado — mismo patrón que el
  // inspector de FEM 2D; las dimensiones libres de tubo no mapean a una clave,
  // así que aquí SIEMPRE se elige de catálogo).
  const currentFamily = familyOfKey(sel.profileKey);
  const famOptions = currentFamily && !BAR_FAMILIES.includes(currentFamily)
    ? [currentFamily, ...BAR_FAMILIES]
    : BAR_FAMILIES;
  const fam = currentFamily ?? BAR_FAMILIES[0];
  const selectClass =
    'flex-1 min-w-0 bg-bg-primary border border-border-main rounded px-2 py-1 text-[12px] font-mono text-text-primary outline-none hover:border-accent/40 focus:border-accent transition-colors';

  return (
    <>
      <div className="flex items-center justify-between py-0.75 gap-2">
        <span className="text-[13px] text-text-secondary whitespace-nowrap shrink-0">Perfil</span>
        <div className="flex gap-1.5 min-w-0 flex-1 justify-end">
          <select
            value={fam}
            onChange={(e) => setProfileKey(nearestInFamily(e.target.value as SteelFamily, sel.profileKey).key)}
            className={selectClass}
            aria-label="Familia de perfil"
          >
            {famOptions.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
          <select
            value={sel.profileKey}
            onChange={(e) => setProfileKey(e.target.value)}
            className={selectClass}
            aria-label="Tamaño del perfil"
          >
            {steelEntriesByFamily(fam).map((en) => (
              <option key={en.key} value={en.key}>{en.sizeLabel}</option>
            ))}
          </select>
        </div>
      </div>
      <SteelBeamsInputs
        state={state}
        setField={setField}
        displayLcr={lcrMm}
        lcrIsAuto={sel.Lcr == null}
        onLcrChange={handleLcrChange}
        loadGen={loadGen}
        hideLoads
        hideBeamType
        hideL
        hideProfile
      />
    </>
  );
}
