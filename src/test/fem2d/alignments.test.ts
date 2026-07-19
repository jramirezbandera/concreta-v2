// FEM 2D — axis alignments + chain-dimension semantics.
//
// User decision (2026-07-18): editing a cota moves THAT alignment entirely
// (all nodes sharing the coordinate), no cascade to other alignments.

import { describe, expect, it } from 'vitest';
import { computeAlignments, moveAlignmentGap } from '../../features/fem2d/alignments';
import { buildModelFromState, fem2dUiDefaults } from '../../features/fem2d/uiState';
import { FEM2D_TEMPLATES } from '../../features/fem2d/templates';
import { solveFem2D } from '../../features/fem2d/pipeline';
import type { Fem2DModel } from '../../features/fem2d/types';

function gable(): Fem2DModel {
  return buildModelFromState({ ...fem2dUiDefaults(), templateId: 'gable' }).model!;
}

function multistory(): Fem2DModel {
  // 2 vanos × 2 plantas → 3 alineaciones X y 3 niveles Y con varios nodos cada uno.
  const p = FEM2D_TEMPLATES.multistory.defaults();
  return FEM2D_TEMPLATES.multistory.build({ ...p, nBays: 2, nStories: 2, windStoryForces: [6, 10] });
}

describe('computeAlignments', () => {
  it('clusters exact coordinates per axis (gable: 3 X, 3 Y)', () => {
    const model = gable(); // n1(0,0) n2(0,3) n3(4,4.2) n4(8,3) n5(8,0)
    const ax = computeAlignments(model.nodes, 'x');
    expect(ax.map((a) => a.coord)).toEqual([0, 4, 8]);
    expect(ax[0].nodeIds.sort()).toEqual(['n1', 'n2']);
    expect(ax[1].nodeIds).toEqual(['n3']);

    const ay = computeAlignments(model.nodes, 'y');
    expect(ay.map((a) => a.coord)).toEqual([0, 3, 4.2]);
    expect(ay[1].nodeIds.sort()).toEqual(['n2', 'n4']);
  });

  it('absorbs sub-millimetre float noise into one alignment', () => {
    const model = gable();
    const noisy: Fem2DModel = {
      ...model,
      nodes: model.nodes.map((n) => (n.id === 'n4' ? { ...n, x: 8 + 4e-4 } : n)),
    };
    const ax = computeAlignments(noisy.nodes, 'x');
    expect(ax.length).toBe(3);
    expect(ax[2].nodeIds.sort()).toEqual(['n4', 'n5']);
  });
});

describe('moveAlignmentGap', () => {
  it('moves the whole alignment and ONLY that one (gable: right wall)', () => {
    const model = gable();
    // Gap 1: entre x=4 (cumbrera) y x=8 (muro derecho) → 4 m. Subirlo a 6 m
    // mueve n4 y n5 a x=10; la cumbrera y el muro izquierdo no se tocan.
    const res = moveAlignmentGap(model, 'x', 1, 6);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const byId = new Map(res.model.nodes.map((n) => [n.id, n]));
    expect(byId.get('n4')!.x).toBe(10);
    expect(byId.get('n5')!.x).toBe(10);
    expect(byId.get('n3')!.x).toBe(4);
    expect(byId.get('n1')!.x).toBe(0);
    expect(res.model.templateId).toBe('custom');
    // El modelo movido sigue resolviendo.
    expect(solveFem2D(res.model).ok).toBe(true);
  });

  it('re-slopes rafters when the eave LEVEL moves (Y chain), ridge stays', () => {
    const model = gable();
    // Gap 0 en Y: 0 → 3 (altura de alero). Subirlo a 3.8: n2 y n4 suben,
    // la cumbrera (4.2) no se mueve → faldones menos inclinados.
    const res = moveAlignmentGap(model, 'y', 0, 3.8);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const byId = new Map(res.model.nodes.map((n) => [n.id, n]));
    expect(byId.get('n2')!.y).toBeCloseTo(3.8, 9);
    expect(byId.get('n4')!.y).toBeCloseTo(3.8, 9);
    expect(byId.get('n3')!.y).toBe(4.2);
  });

  it('multistory: one storey height moves every node of that level', () => {
    const model = multistory();
    const before = computeAlignments(model.nodes, 'y');
    const levelNodes = before[1].nodeIds; // nivel 1 (3 pilares → 3 nodos)
    expect(levelNodes.length).toBe(3);

    const res = moveAlignmentGap(model, 'y', 0, 4.0); // planta 1: 3.2 → 4.0
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const byId = new Map(res.model.nodes.map((n) => [n.id, n]));
    for (const id of levelNodes) expect(byId.get(id)!.y).toBeCloseTo(4.0, 9);
    // El nivel 2 NO cambia (sin cascada): planta 2 se acorta.
    const after = computeAlignments(res.model.nodes, 'y');
    expect(after[2].coord).toBeCloseTo(6.4, 9);
  });

  it('rejects invading the far neighbour and sub-minimum gaps', () => {
    const model = gable();
    // Gap 0 en X: 0→4 (4 m). Ponerlo a 8.2 metería la cumbrera pasada la
    // alineación derecha (8) → rechazo.
    expect(moveAlignmentGap(model, 'x', 0, 8.2).ok).toBe(false);
    expect(moveAlignmentGap(model, 'x', 0, 0.01).ok).toBe(false);
    expect(moveAlignmentGap(model, 'x', 7, 3).ok).toBe(false); // gap inexistente
  });

  it('no-op when the gap does not change', () => {
    const model = gable();
    const res = moveAlignmentGap(model, 'x', 0, 4);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.model).toBe(model); // misma referencia → sin entrada de historia
  });
});
