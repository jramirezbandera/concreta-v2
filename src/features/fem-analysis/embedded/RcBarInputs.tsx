// FEM 2D — RcBarInputs wrapper (Lane R5 V1.1)
//
// Projects DesignBar.rcSection + vano_armado + apoyo_armado into the shape
// expected by <RCBeamsInputs hideSolicitations hideSectionTabs>. The wrapper:
//   - Builds a synthetic RCBeamInputs state object from the bar.
//   - Routes setField calls back to bar.rcSection / bar.vano_armado /
//     bar.apoyo_armado depending on the field prefix.
//   - Provides envelope-derived solicitations as placeholder values (hidden,
//     but RCBeamInputs requires the keys to exist).
//
// Chrome contract (Codex final pass + design review):
//   The wrapper renders <RCBeamsInputs> directly, NO outer card/border/padding.
//   Avoids "cards in cards" AI-slop pattern (DESIGN.md prohibition).

import { useMemo } from 'react';
import type { RCBeamInputs } from '../../../data/defaults';
import { RCBeamsInputs } from '../../rc-beams/RCBeamsInputs';
import type { ArmadoHA, BarResult, DesignBar, DesignModel, RcSection } from '../types';

interface Props {
  bar: DesignBar;
  setModel: (updater: (m: DesignModel) => DesignModel) => void;
  activeSection: 'vano' | 'apoyo';
  setActiveSection: (s: 'vano' | 'apoyo') => void;
  /** Solver result for this bar (used for envelope-derived placeholder Md/VEd). */
  barResult: BarResult | undefined;
}

const DEFAULT_ARMADO: ArmadoHA = {
  tens_nBars: 4, tens_barDiam: 16,
  comp_nBars: 2, comp_barDiam: 12,
  stirrupDiam: 8, stirrupSpacing: 150, stirrupLegs: 2,
};

export function RcBarInputs({ bar, setModel, activeSection, setActiveSection, barResult }: Props) {
  const sec: RcSection = bar.rcSection!;
  const vano = bar.vano_armado ?? DEFAULT_ARMADO;
  const apoyo = bar.apoyo_armado ?? DEFAULT_ARMADO;

  // Project to RCBeamInputs shape. Geometry: cm → mm. Solicitations: from envelope.
  const state: RCBeamInputs = useMemo(() => {
    const Mmax = barResult ? Math.max(...barResult.M.map(Math.abs), 0) : 0;
    const Vmax = barResult ? Math.max(...barResult.V.map(Math.abs), 0) : 0;
    return {
      b: sec.b * 10,                 // cm → mm
      h: sec.h * 10,                 // cm → mm
      cover: sec.cover,              // already mm
      fck: sec.fck,
      fyk: sec.fyk,
      exposureClass: sec.exposureClass,
      // FEM uses CTE Tabla 3.1 codes (A1/B/...); standalone module accepts both
      // via PSI2_MAP fallback. Adapter translates via psi2Custom for FEM context.
      loadType: sec.loadType,
      psi2Custom: 0.3,

      vano_Md: Mmax,
      vano_VEd: Vmax,
      vano_M_G: Mmax / 1.35,         // rough split for hidden field
      vano_M_Q: 0,
      vano_bot_nBars: vano.tens_nBars,
      vano_bot_barDiam: vano.tens_barDiam,
      vano_top_nBars: vano.comp_nBars,
      vano_top_barDiam: vano.comp_barDiam,
      vano_stirrupDiam: vano.stirrupDiam,
      vano_stirrupSpacing: vano.stirrupSpacing,
      vano_stirrupLegs: vano.stirrupLegs,

      apoyo_Md: Mmax,
      apoyo_VEd: Vmax,
      apoyo_M_G: Mmax / 1.35,
      apoyo_M_Q: 0,
      apoyo_top_nBars: apoyo.tens_nBars,
      apoyo_top_barDiam: apoyo.tens_barDiam,
      apoyo_bot_nBars: apoyo.comp_nBars,
      apoyo_bot_barDiam: apoyo.comp_barDiam,
      apoyo_stirrupDiam: apoyo.stirrupDiam,
      apoyo_stirrupSpacing: apoyo.stirrupSpacing,
      apoyo_stirrupLegs: apoyo.stirrupLegs,
    };
  }, [sec, vano, apoyo, barResult]);

  function setField(field: string, value: RCBeamInputs[keyof RCBeamInputs]) {
    setModel((m) => ({
      ...m,
      bars: m.bars.map((b) => {
        if (b.id !== bar.id) return b;
        // Route by field prefix.
        if (field.startsWith('vano_')) {
          return { ...b, vano_armado: routeArmadoUpdate(vano, field, value as number, 'vano') };
        }
        if (field.startsWith('apoyo_')) {
          return { ...b, apoyo_armado: routeArmadoUpdate(apoyo, field, value as number, 'apoyo') };
        }
        // Section-level: b/h need mm → cm conversion.
        if (field === 'b' || field === 'h') {
          return { ...b, rcSection: { ...sec, [field]: (value as number) / 10 } };
        }
        if (field === 'cover' || field === 'fck' || field === 'fyk') {
          return { ...b, rcSection: { ...sec, [field]: value as number } };
        }
        if (field === 'exposureClass' || field === 'loadType') {
          return { ...b, rcSection: { ...sec, [field]: value as string } };
        }
        // psi2Custom: only meaningful for standalone module's loadType='custom'.
        // FEM's adapter computes psi2 from per-load categories — ignore here.
        return b;
      }),
    }));
  }

  return (
    <RCBeamsInputs
      state={state}
      section={activeSection}
      setSection={setActiveSection}
      setField={setField}
      hideSolicitations
      hideSectionTabs
      showBothArmados
    />
  );
}

function routeArmadoUpdate(
  base: ArmadoHA,
  field: string,
  value: number,
  prefix: 'vano' | 'apoyo',
): ArmadoHA {
  // The standalone module uses field names like vano_bot_nBars (tension at vano
  // = bottom for sagging) and apoyo_top_nBars (tension at apoyo = top for hogging).
  // Map back to ArmadoHA's tens/comp neutral naming.
  const isVano = prefix === 'vano';
  const tensFlag = isVano ? 'bot' : 'top';
  const compFlag = isVano ? 'top' : 'bot';
  if (field === `${prefix}_${tensFlag}_nBars`)   return { ...base, tens_nBars: value };
  if (field === `${prefix}_${tensFlag}_barDiam`) return { ...base, tens_barDiam: value };
  if (field === `${prefix}_${compFlag}_nBars`)   return { ...base, comp_nBars: value };
  if (field === `${prefix}_${compFlag}_barDiam`) return { ...base, comp_barDiam: value };
  if (field === `${prefix}_stirrupDiam`)         return { ...base, stirrupDiam: value };
  if (field === `${prefix}_stirrupSpacing`)      return { ...base, stirrupSpacing: value };
  if (field === `${prefix}_stirrupLegs`)         return { ...base, stirrupLegs: value };
  return base;
}
