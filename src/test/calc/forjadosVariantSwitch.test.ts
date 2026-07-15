// variantSwitchPatch — el patch atómico del cambio de variante de forjados
// (reticular ↔ maciza). Extraído del componente (saneamiento pre-IA 2026-07-13)
// para que UI y asistente IA compartan la misma fuente de verdad.
// Run: bun test src/test/calc/forjadosVariantSwitch.test.ts

import { describe, expect, it } from 'vitest';
import { forjadosDefaults, type ForjadosInputs } from '../../data/defaults';
import { tipologiaPatch, variantSwitchPatch } from '../../data/forjadoTipologias';

/** Estado "sucio": el usuario ha tocado armado de AMBAS variantes y geometría. */
function dirtyState(): ForjadosInputs {
  return {
    ...forjadosDefaults,
    variant: 'reticular',
    tipologia: 'custom',
    h: 400, hFlange: 100, bWeb: 150, intereje: 900,
    base_inf_nBars: 3, base_inf_barDiam: 20,
    refuerzo_apoyo_sup_nBars: 4, refuerzo_apoyo_sup_barDiam: 20,
    base_inf_phi_mac: 16, base_inf_s_mac: 100,
    refuerzo_vano_inf_phi_mac: 12, refuerzo_vano_inf_s_mac: 150,
  };
}

describe('variantSwitchPatch', () => {
  it('misma variante → patch vacío (no-op)', () => {
    expect(variantSwitchPatch(dirtyState(), 'reticular')).toEqual({});
    expect(variantSwitchPatch({ ...forjadosDefaults, variant: 'maciza' }, 'maciza')).toEqual({});
  });

  it('reticular → maciza: variant + los 16 campos de armado a defaults', () => {
    const patch = variantSwitchPatch(dirtyState(), 'maciza');
    expect(patch.variant).toBe('maciza');
    // Armado de ambas variantes reseteado a fábrica
    expect(patch.base_inf_nBars).toBe(forjadosDefaults.base_inf_nBars);
    expect(patch.base_inf_barDiam).toBe(forjadosDefaults.base_inf_barDiam);
    expect(patch.refuerzo_apoyo_sup_nBars).toBe(forjadosDefaults.refuerzo_apoyo_sup_nBars);
    expect(patch.base_inf_phi_mac).toBe(forjadosDefaults.base_inf_phi_mac);
    expect(patch.base_inf_s_mac).toBe(forjadosDefaults.base_inf_s_mac);
    expect(patch.refuerzo_vano_inf_phi_mac).toBe(forjadosDefaults.refuerzo_vano_inf_phi_mac);
    // 1 (variant) + 16 campos de armado; el canto h se CONSERVA al pasar a maciza
    expect(Object.keys(patch)).toHaveLength(17);
    expect(patch.h).toBeUndefined();
    expect(patch.tipologia).toBeUndefined();
  });

  it('maciza → reticular: además re-aplica el preset de tipología por defecto', () => {
    const state: ForjadosInputs = { ...dirtyState(), variant: 'maciza' };
    const patch = variantSwitchPatch(state, 'reticular');
    expect(patch.variant).toBe('reticular');
    expect(patch.tipologia).toBe(forjadosDefaults.tipologia);
    expect(patch.h).toBe(forjadosDefaults.h);
    expect(patch.hFlange).toBe(forjadosDefaults.hFlange);
    expect(patch.bWeb).toBe(forjadosDefaults.bWeb);
    expect(patch.intereje).toBe(forjadosDefaults.intereje);
    // 1 (variant) + 16 armado + 5 geometría/tipología
    expect(Object.keys(patch)).toHaveLength(22);
  });

  it('el patch NO toca campos ajenos al cambio (esfuerzos, materiales, luz)', () => {
    const patch = variantSwitchPatch(dirtyState(), 'maciza');
    for (const k of ['vano_Md', 'apoyo_Md', 'VEd', 'fck', 'fyk', 'cover',
                     'exposureClass', 'spanLength', 'tipoVano', 'stirrupsEnabled'] as const) {
      expect(patch[k], `patch no debe incluir ${k}`).toBeUndefined();
    }
  });

  it('aplicado sobre el estado, deja el armado exactamente como de fábrica', () => {
    const next: ForjadosInputs = { ...dirtyState(), ...variantSwitchPatch(dirtyState(), 'maciza') };
    expect(next.variant).toBe('maciza');
    expect(next.base_inf_phi_mac).toBe(forjadosDefaults.base_inf_phi_mac);
    expect(next.refuerzo_apoyo_sup_barDiam).toBe(forjadosDefaults.refuerzo_apoyo_sup_barDiam);
    // Lo no-armado sobrevive
    expect(next.h).toBe(400);
    expect(next.spanLength).toBe(dirtyState().spanLength);
  });
});

// tipologiaPatch — el otro gate atómico del módulo (ola 2). Sin él, un
// setField('tipologia', …) suelto dejaría la geometría del preset anterior.
describe('tipologiaPatch', () => {
  it('una tipología comercial arrastra su geometría completa', () => {
    expect(tipologiaPatch('35+10')).toEqual({
      tipologia: '35+10', h: 450, hFlange: 100, bWeb: 120, intereje: 820,
    });
  });

  it('"custom" escribe SOLO la clave: la geometría se desbloquea y la conserva el usuario', () => {
    expect(tipologiaPatch('custom')).toEqual({ tipologia: 'custom' });
  });

  it('aplicado sobre un estado a medida, la geometría pasa a ser la del preset', () => {
    const next: ForjadosInputs = { ...dirtyState(), ...tipologiaPatch('25+5') };
    expect(next.tipologia).toBe('25+5');
    expect(next.h).toBe(300);
    expect(next.hFlange).toBe(50);
    // El armado NO se toca: eso solo lo hace el cambio de variante.
    expect(next.base_inf_nBars).toBe(3);
  });
});
