// FEM 2D — UI state (T10, parametric-first module)
//
// The module has NO free editor (D8): the whole model is a template id + that
// template's parameter set. This holds ONE parameter set per template so the
// user can switch topologies without losing what they entered in each — the
// segmented template selector flips `templateId`, the forms edit
// `params[templateId]`, and the canvas/results always render the ACTIVE one.
//
// selfWeight is lifted to a single UI toggle (every generator emits
// selfWeight:true; this lets the user turn member self-weight off globally
// without re-plumbing each template's params).
//
// This module is PURE (no React, no DOM) so the build+validate path is unit
// testable and the quarantine lint stays happy (no fem-analysis import).

import {
  FEM2D_TEMPLATES,
  type GableParams,
  type MultistoryParams,
  type PortalFrameParams,
  type PrattTrussParams,
} from './templates';
import type { Fem2DModel, Fem2DTemplateId } from './types';

/** Parameter set for every template, keyed by template id. */
export interface Fem2DParamsMap {
  'pratt-truss': PrattTrussParams;
  'portal-frame': PortalFrameParams;
  'multistory': MultistoryParams;
  'gable': GableParams;
}

export interface Fem2DUiState {
  /** Active topology (drives which params[...] the forms/canvas use). */
  templateId: Fem2DTemplateId;
  /** Global member self-weight toggle (overrides the template's selfWeight). */
  selfWeight: boolean;
  params: Fem2DParamsMap;
}

/** Ordered template metadata for the selector (name + one-liner from the registry). */
export const TEMPLATE_ORDER: Fem2DTemplateId[] = [
  'portal-frame',
  'gable',
  'multistory',
  'pratt-truss',
];

/** Fresh defaults (each template's `defaults()` returns a new object per call). */
export function fem2dUiDefaults(): Fem2DUiState {
  return {
    templateId: 'portal-frame',
    selfWeight: true,
    params: {
      'pratt-truss': FEM2D_TEMPLATES['pratt-truss'].defaults(),
      'portal-frame': FEM2D_TEMPLATES['portal-frame'].defaults(),
      'multistory': FEM2D_TEMPLATES['multistory'].defaults(),
      'gable': FEM2D_TEMPLATES['gable'].defaults(),
    },
  };
}

/** Validate the ACTIVE template's params (typed dispatch — the union index
 *  can't prove params/templateId are aligned, so switch narrows it). */
export function validateActive(state: Fem2DUiState): string[] {
  switch (state.templateId) {
    case 'pratt-truss':
      return FEM2D_TEMPLATES['pratt-truss'].validate(state.params['pratt-truss']);
    case 'portal-frame':
      return FEM2D_TEMPLATES['portal-frame'].validate(state.params['portal-frame']);
    case 'multistory':
      return FEM2D_TEMPLATES['multistory'].validate(state.params['multistory']);
    case 'gable':
      return FEM2D_TEMPLATES['gable'].validate(state.params['gable']);
  }
}

export interface BuildFromStateResult {
  /** Built model, or null when the active params fail validation. */
  model: Fem2DModel | null;
  /** Validation messages (empty when model is non-null). */
  errors: string[];
}

/** Build the Fem2DModel for the active template + apply the self-weight toggle.
 *  Same typed-dispatch pattern as validateActive. */
export function buildModelFromState(state: Fem2DUiState): BuildFromStateResult {
  const errors = validateActive(state);
  if (errors.length > 0) return { model: null, errors };

  let model: Fem2DModel;
  switch (state.templateId) {
    case 'pratt-truss':
      model = FEM2D_TEMPLATES['pratt-truss'].build(state.params['pratt-truss']);
      break;
    case 'portal-frame':
      model = FEM2D_TEMPLATES['portal-frame'].build(state.params['portal-frame']);
      break;
    case 'multistory':
      model = FEM2D_TEMPLATES['multistory'].build(state.params['multistory']);
      break;
    case 'gable':
      model = FEM2D_TEMPLATES['gable'].build(state.params['gable']);
      break;
  }
  if (!state.selfWeight) model = { ...model, selfWeight: false };
  return { model, errors: [] };
}
