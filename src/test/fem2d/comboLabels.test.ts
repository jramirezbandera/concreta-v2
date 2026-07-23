// FEM 2D — derivación de copia del selector (comboLabels). Fija que la etiqueta
// usa formatCombo verbatim y que el aviso cubre los 5 casos de la premisa 2.

import { describe, expect, it } from 'vitest';
import { comboOptionLabel, comboOptgroupLabel, comboNotice } from '../../features/fem2d/comboLabels';
import type { Fem2DComboView } from '../../features/fem2d/checks';
import type { LcFactors } from '../../lib/frame-core/lcCombinations';

function view(p: Partial<Fem2DComboView> & Pick<Fem2DComboView, 'id' | 'group'>): Fem2DComboView {
  const f: LcFactors[] = p.forceFactorSets ?? [{ G: 1.35 }];
  return {
    isEnvelope: false, collapsed: false, principal: null, lc: null,
    forceFactorSets: f, dispFactorSets: f, scaleRef: 'env:ELU',
    ...p,
  };
}

describe('comboOptionLabel', () => {
  it('envolvente real → "Envolvente ELU/ELS característica" (sin fórmula)', () => {
    expect(comboOptionLabel(view({ id: 'env:ELU', group: 'envelope', isEnvelope: true }))).toBe('Envolvente ELU');
    expect(comboOptionLabel(view({ id: 'env:ELS_c', group: 'envelope', isEnvelope: true }))).toBe(
      'Envolvente ELS característica',
    );
  });

  it('envolvente COLAPSADA → "<tipo> · <fórmula>" con formatCombo verbatim', () => {
    const v = view({ id: 'env:ELU', group: 'envelope', isEnvelope: true, collapsed: true, forceFactorSets: [{ G: 1.35, Q: 1.5 }] });
    expect(comboOptionLabel(v)).toBe('ELU · 1.35·G + 1.50·Q');
  });

  it('combinación ELU/ELS/cp → prefijo de tipo conservado (para el select cerrado)', () => {
    expect(comboOptionLabel(view({ id: 'elu:W', group: 'ELU', principal: 'W', forceFactorSets: [{ G: 1.35, W: 1.5, Q: 1.05 }] }))).toBe(
      'ELU · 1.35·G + 1.05·Q + 1.50·W',
    );
    expect(comboOptionLabel(view({ id: 'els_c:Q', group: 'ELS', principal: 'Q', forceFactorSets: [{ G: 1, Q: 1 }] }))).toBe(
      'ELS característica · 1.00·G + 1.00·Q',
    );
    expect(comboOptionLabel(view({ id: 'els_cp', group: 'ELS', forceFactorSets: [{ G: 1, Q: 0.3 }] }))).toBe(
      'ELS cuasi-permanente · 1.00·G + 0.30·Q',
    );
  });

  it('hipótesis simple → nombre completo (LC_LABELS), no la letra suelta', () => {
    expect(comboOptionLabel(view({ id: 'lc:G', group: 'hypothesis', lc: 'G' }))).toBe('G · Cargas permanentes');
    expect(comboOptionLabel(view({ id: 'lc:Q', group: 'hypothesis', lc: 'Q' }))).toBe('Q · Sobrecarga de uso');
  });
});

describe('comboOptgroupLabel', () => {
  it('envolvente real arriba; colapsada baja a Combinaciones', () => {
    expect(comboOptgroupLabel(view({ id: 'env:ELU', group: 'envelope', isEnvelope: true }))).toBe('Envolventes');
    expect(comboOptgroupLabel(view({ id: 'env:ELU', group: 'envelope', isEnvelope: true, collapsed: true }))).toBe(
      'Combinaciones ELU',
    );
    expect(comboOptgroupLabel(view({ id: 'env:ELS_c', group: 'envelope', isEnvelope: true, collapsed: true }))).toBe(
      'Combinaciones ELS',
    );
  });

  it('elu:* / els_c:* / els_cp / eluperm:G → su grupo; lc:* → Hipótesis simples', () => {
    expect(comboOptgroupLabel(view({ id: 'elu:Q', group: 'ELU' }))).toBe('Combinaciones ELU');
    expect(comboOptgroupLabel(view({ id: 'eluperm:G', group: 'ELU' }))).toBe('Combinaciones ELU');
    expect(comboOptgroupLabel(view({ id: 'els_cp', group: 'ELS' }))).toBe('Combinaciones ELS');
    expect(comboOptgroupLabel(view({ id: 'lc:W', group: 'hypothesis', lc: 'W' }))).toBe('Hipótesis simples');
  });
});

describe('comboNotice — los 5 casos', () => {
  it('envolvente real → null', () => {
    expect(comboNotice(view({ id: 'env:ELU', group: 'envelope', isEnvelope: true }))).toBeNull();
  });
  it('envolvente colapsada → "es también la envolvente"', () => {
    expect(comboNotice(view({ id: 'env:ELU', group: 'envelope', isEnvelope: true, collapsed: true }))).toContain(
      'es también la envolvente',
    );
  });
  it('combinación → "el veredicto sigue siendo el de los chequeos"', () => {
    expect(comboNotice(view({ id: 'elu:Q', group: 'ELU', principal: 'Q' }))).toContain('el veredicto sigue siendo');
  });
  it('eluperm:G → aviso propio de duración permanente', () => {
    expect(comboNotice(view({ id: 'eluperm:G', group: 'ELU' }))).toContain('Duración permanente');
  });
  it('hipótesis → "sin mayorar (γ = 1)"', () => {
    expect(comboNotice(view({ id: 'lc:G', group: 'hypothesis', lc: 'G' }))).toContain('sin mayorar');
  });
});
