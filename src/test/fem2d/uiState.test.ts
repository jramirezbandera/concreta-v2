// FEM 2D — parametric draft state tests.
//
// uiState survives the free-editor era as the v1 share-link decoder and the
// tests' template-fixture builder: the default state builds a solvable model
// for EVERY template (green FTUX), invalid params gate the build, and the
// self-weight toggle reaches the model. Share-link serialization moved to
// serializeV2.test.ts (model-centric).

import { describe, expect, it } from 'vitest';
import {
  buildModelFromState,
  fem2dUiDefaults,
  TEMPLATE_ORDER,
  validateActive,
  type Fem2DUiState,
} from '../../features/fem2d/uiState';
import { analyzeFem2D } from '../../features/fem2d/pipeline';

function withTemplate(id: Fem2DUiState['templateId']): Fem2DUiState {
  return { ...fem2dUiDefaults(), templateId: id };
}

describe('fem2d uiState — build + validate', () => {
  it('default state builds a solvable, non-failing model for every template', () => {
    for (const id of TEMPLATE_ORDER) {
      const state = withTemplate(id);
      expect(validateActive(state)).toEqual([]);
      const { model, errors } = buildModelFromState(state);
      expect(errors).toEqual([]);
      expect(model).not.toBeNull();

      const result = analyzeFem2D(model!);
      expect(result.ok, `${id} should solve`).toBe(true);
      expect(result.checks, `${id} should have checks`).not.toBeNull();
      // FTUX target: default parameters open green (η < 1 → not 'fail').
      expect(result.checks!.status, `${id} verdict`).not.toBe('fail');
      expect(result.checks!.maxEta, `${id} η`).toBeLessThan(1);
    }
  });

  it('invalid active params gate the build (model null, errors surfaced)', () => {
    const state = withTemplate('portal-frame');
    state.params['portal-frame'] = { ...state.params['portal-frame'], span: 1 }; // < min 3
    const errors = validateActive(state);
    expect(errors.length).toBeGreaterThan(0);
    const built = buildModelFromState(state);
    expect(built.model).toBeNull();
    expect(built.errors).toEqual(errors);
  });

  it('multistory keeps windStoryForces aligned with nStories by default', () => {
    const state = withTemplate('multistory');
    expect(state.params.multistory.windStoryForces.length).toBe(state.params.multistory.nStories);
    expect(validateActive(state)).toEqual([]);
  });

  it('self-weight toggle reaches the built model', () => {
    const on = withTemplate('portal-frame');
    expect(buildModelFromState(on).model!.selfWeight).toBe(true);

    const off: Fem2DUiState = { ...on, selfWeight: false };
    expect(buildModelFromState(off).model!.selfWeight).toBe(false);
  });

  it('switching templates preserves each template\'s own params', () => {
    const state = fem2dUiDefaults();
    state.params.gable = { ...state.params.gable, span: 12 };
    // Selecting a different template must not touch the gable params.
    const switched: Fem2DUiState = { ...state, templateId: 'pratt-truss' };
    expect(switched.params.gable.span).toBe(12);
  });
});

