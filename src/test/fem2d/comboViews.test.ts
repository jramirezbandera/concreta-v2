// FEM 2D — buildComboViews (selector de combinaciones) [T6]
//
// El selector no pinta envolventes: pinta ESTADOS auditables. Estos tests fijan
// el contrato de `checks.comboViews` (lo que ve el usuario) y de las claves de
// `checks.envelopes` (lo que dibuja el lienzo), que son cosas DISTINTAS (C3):
//   - la LISTA se deduplica por firma (una env:ELU colapsada se traga su elu:<LC>);
//   - las CLAVES se materializan TODAS, siempre (una clave ausente = figura en
//     blanco silenciosa que jsdom no ve).
//
// buildComboViews no se exporta a propósito (la copia en español vive en la UI);
// se prueba a través del pipeline real, que además ejerce analysis.loadCases
// (peso propio ∪ cargas) y la detección de madera.

import { describe, expect, it } from 'vitest';
import {
  beamColumn,
  fem2dModel,
  node2d,
  nodeLoad,
  support2d,
} from '../../features/fem2d/builder';
import { analyzeFem2D } from '../../features/fem2d/pipeline';
import type { Fem2DComboView } from '../../features/fem2d/checks';
import type { Fem2DLoad, TimberSection } from '../../features/fem2d/types';

// Voladizo horizontal empotrado: geometría mínima con N (carga Fx) y M (carga Fy).
// El rol/material no afecta a las vistas (son de modelo) ni a las envolventes
// (son geométricas), así que un IPE por defecto basta salvo el caso de madera.
function cantilever(loads: Fem2DLoad[], opts: { selfWeight?: boolean; timber?: TimberSection } = {}) {
  return fem2dModel({
    nodes: [node2d('n1', 0, 0), node2d('n2', 6, 0)],
    members: [beamColumn('m1', 'n1', 'n2', opts.timber ? { timberSection: opts.timber } : {})],
    supports: [support2d('n1', 'fixed')],
    loads,
    selfWeight: opts.selfWeight ?? false,
  });
}

const ids = (views: Fem2DComboView[]) => views.map((v) => v.id);
const byId = (views: Fem2DComboView[], id: string) => views.find((v) => v.id === id);

const G = nodeLoad('g', 'n2', { lc: 'G', Fy: -10 });
const Q_B = nodeLoad('q', 'n2', { lc: 'Q', useCategory: 'B', Fy: -8 });
const W = nodeLoad('w', 'n2', { lc: 'W', Fx: 5 });

describe('comboViews — canonicalización de la LISTA', () => {
  it('0 variables → env colapsadas; els_cp FUERA de la lista pero clave presente', () => {
    const r = analyzeFem2D(cantilever([G]));
    expect(r.ok).toBe(true);
    const v = r.checks!.comboViews;
    // env:ELU + env:ELS_c colapsadas + la hipótesis G. els_cp comparte firma con
    // env:ELS_c ({G:1}) y sale de la lista.
    expect(ids(v)).toEqual(['env:ELU', 'env:ELS_c', 'lc:G']);
    expect(byId(v, 'env:ELU')!.collapsed).toBe(true);
    expect(byId(v, 'env:ELS_c')!.collapsed).toBe(true);
    // Pero su clave sigue materializada (criterio 11) — y el alias heredado.
    expect(r.checks!.envelopes.m1['els_cp']).toBeDefined();
    expect(r.checks!.envelopes.m1.ELS_cp).toBeDefined();
  });

  it('1 variable (G+Q) → elu:<LC> y els_c:<LC> deduplicadas de la lista', () => {
    const r = analyzeFem2D(cantilever([G, Q_B]));
    expect(r.ok).toBe(true);
    const v = r.checks!.comboViews;
    // Un solo combo ELU {1.35·G + 1.5·Q}: env:ELU (colapsada) se traga elu:Q.
    // Idem env:ELS_c ↔ els_c:Q. els_cp ({G:1, Q:0.3}) sobrevive (firma distinta).
    expect(ids(v)).toEqual(['env:ELU', 'env:ELS_c', 'els_cp', 'lc:G', 'lc:Q']);
    expect(byId(v, 'env:ELU')!.collapsed).toBe(true);
    expect(byId(v, 'elu:Q')).toBeUndefined();
    expect(byId(v, 'els_c:Q')).toBeUndefined();
  });

  it('≥2 variables (G+Q+W) → juego completo, envolventes NO colapsadas', () => {
    const r = analyzeFem2D(cantilever([G, Q_B, W]));
    expect(r.ok).toBe(true);
    const v = r.checks!.comboViews;
    expect(ids(v)).toEqual([
      'env:ELU', 'env:ELS_c',
      'elu:Q', 'elu:W',
      'els_c:Q', 'els_c:W',
      'els_cp',
      'lc:G', 'lc:Q', 'lc:W',
    ]);
    expect(byId(v, 'env:ELU')!.collapsed).toBe(false);
    expect(byId(v, 'env:ELS_c')!.collapsed).toBe(false);
  });
});

describe('comboViews — hipótesis simples (analysis.loadCases)', () => {
  it('sólo peso propio → lc:G presente aunque no haya ninguna carga en model.loads', () => {
    const r = analyzeFem2D(cantilever([], { selfWeight: true }));
    expect(r.ok).toBe(true);
    const v = r.checks!.comboViews;
    // El peso propio se inyecta en decompose, no en model.loads: la hipótesis G
    // sale de analysis.loadCases, no de un recálculo a mano.
    expect(ids(v)).toEqual(['env:ELU', 'env:ELS_c', 'lc:G']);
  });

  it('sin cargas ni peso propio → 2 entradas (sólo envolventes)', () => {
    const r = analyzeFem2D(cantilever([], { selfWeight: false }));
    expect(r.ok).toBe(true);
    const v = r.checks!.comboViews;
    expect(ids(v)).toEqual(['env:ELU', 'env:ELS_c']);
  });

  it('G+W → els_cp y lc:G AMBAS en la lista (exención de hipótesis)', () => {
    const r = analyzeFem2D(cantilever([G, W]));
    expect(r.ok).toBe(true);
    const v = r.checks!.comboViews;
    // ψ2(W)=0 ⇒ els_cp resuelve a {G:1, W:0}, misma firma que la hipótesis G.
    // No es un duplicado que mienta: "la cuasi-permanente no ve el viento" y "así
    // responde el modelo sólo a permanentes" son dos verdades. Las hipótesis van
    // exentas de la deduplicación, así que ambas sobreviven.
    expect(ids(v)).toContain('els_cp');
    expect(ids(v)).toContain('lc:G');
    expect(ids(v)).toContain('lc:W');
  });
});

describe('comboViews — madera y principales', () => {
  it('madera → eluperm:G (grupo ELU, 1.35·G) con principal null', () => {
    const timber: TimberSection = { gradeId: 'C24', b: 100, h: 240, serviceClass: 1 };
    const r = analyzeFem2D(cantilever([G, Q_B], { timber }));
    expect(r.ok).toBe(true);
    const v = r.checks!.comboViews;
    const perm = byId(v, 'eluperm:G');
    expect(perm).toBeDefined();
    expect(perm!.group).toBe('ELU');
    expect(perm!.principal).toBeNull();
    expect(perm!.forceFactorSets).toEqual([{ G: 1.35 }]);
    // La clave se materializa en la envolvente de la barra.
    expect(r.checks!.envelopes.m1['eluperm:G']).toBeDefined();
  });

  it('acero (no madera) → SIN eluperm:G', () => {
    const r = analyzeFem2D(cantilever([G, Q_B]));
    expect(r.ok).toBe(true);
    expect(byId(r.checks!.comboViews, 'eluperm:G')).toBeUndefined();
  });

  it('E1 (ψ0=1.0): elu:S lleva Q y S a 1.5, pero su principal es S (no el factor)', () => {
    const Q_E1 = nodeLoad('q', 'n2', { lc: 'Q', useCategory: 'E1', Fy: -8 });
    const S = nodeLoad('s', 'n2', { lc: 'S', Fy: -6 });
    const r = analyzeFem2D(cantilever([G, Q_E1, S]));
    expect(r.ok).toBe(true);
    const v = r.checks!.comboViews;
    const eluS = byId(v, 'elu:S');
    const eluQ = byId(v, 'elu:Q');
    expect(eluS!.principal).toBe('S');
    expect(eluQ!.principal).toBe('Q');
    // El combo S-principal tiene DOS hipótesis a 1.5 (Q simultánea con ψ0=1.0):
    // la desambiguación no viene del factor, viene de `principal`.
    const f = eluS!.forceFactorSets[0];
    expect(f.S).toBeCloseTo(1.5);
    expect(f.Q).toBeCloseTo(1.5);
  });
});

describe('comboViews — orden estable e invariantes', () => {
  it('orden de emisión = LC_ORDER, no el orden de inserción de las cargas', () => {
    // Mismo pórtico físico, cargas metidas en orden distinto.
    const rWQ = analyzeFem2D(cantilever([G, W, Q_B]));
    const rQW = analyzeFem2D(cantilever([G, Q_B, W]));
    const eluIds = (r: ReturnType<typeof analyzeFem2D>) =>
      r.checks!.comboViews.filter((v) => v.id.startsWith('elu:')).map((v) => v.id);
    // Q antes que W en ambos (LC_ORDER), pese al orden de dibujo.
    expect(eluIds(rWQ)).toEqual(['elu:Q', 'elu:W']);
    expect(eluIds(rQW)).toEqual(['elu:Q', 'elu:W']);
  });

  it('INVARIANTE de composición: max|elu:*| punto a punto === env:ELU', () => {
    const r = analyzeFem2D(cantilever([G, Q_B, W]));
    expect(r.ok).toBe(true);
    const env = r.checks!.envelopes.m1;
    const eluKeys = r.checks!.comboViews
      .filter((v) => v.id.startsWith('elu:')) // excluye eluperm:G (acero: no existe)
      .map((v) => v.id);
    expect(eluKeys.length).toBeGreaterThanOrEqual(2); // si no, la canonicalización colapsa y el criterio queda vacío
    for (const field of ['N', 'V', 'M'] as const) {
      const envArr = env['env:ELU']![field];
      for (let i = 0; i < envArr.length; i++) {
        const maxAbs = Math.max(...eluKeys.map((k) => Math.abs(env[k]![field][i])));
        expect(maxAbs).toBeCloseTo(Math.abs(envArr[i]), 8);
      }
    }
  });

  it('IDENTIDAD de alias: envelopes.ELU === envelopes[env:ELU] (mismo objeto), toda barra', () => {
    const r = analyzeFem2D(cantilever([G, Q_B, W]));
    expect(r.ok).toBe(true);
    for (const m of Object.values(r.checks!.envelopes)) {
      expect(m.ELU).toBe(m['env:ELU']);
      expect(m.ELS_c).toBe(m['env:ELS_c']);
      expect(m.ELS_cp).toBe(m['els_cp']);
    }
  });

  it('TODAS las claves candidatas materializadas aunque la vista salga de la lista', () => {
    // 1 variable: elu:Q y els_c:Q NO están en comboViews (deduplicadas)...
    const r = analyzeFem2D(cantilever([G, Q_B]));
    expect(r.ok).toBe(true);
    expect(byId(r.checks!.comboViews, 'elu:Q')).toBeUndefined();
    expect(byId(r.checks!.comboViews, 'els_c:Q')).toBeUndefined();
    // ...pero sus claves SÍ están en la envolvente (criterio 11).
    expect(r.checks!.envelopes.m1['elu:Q']).toBeDefined();
    expect(r.checks!.envelopes.m1['els_c:Q']).toBeDefined();
  });
});
