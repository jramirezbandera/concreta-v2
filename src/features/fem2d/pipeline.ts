// FEM 2D — pipeline (single entry point: design model → solved bundle)
//
// Mirrors the 1D solveDesignModel gate structure:
//   1. validateModel2DBasic — reject degenerate models before decompose.
//   2. decompose2D          — design → analysis (splits, load resolution).
//   3. solveAnalysis2D      — direct-stiffness solve per load case.
//   4. checkFem2D           — (analyzeFem2D only) role-routed member checks
//                             on REAL multi-principal combinations + αcr.
// Fail-severity errors at any stage stop the pipeline (never solve on a
// degenerate model — the "plausible but wrong PDF" guard).

import { validateModel2DBasic } from './builder';
import { checkFem2D, type Fem2DCheckBundle } from './checks';
import { decompose2D } from './decompose';
import { solveAnalysis2D, type Solve2DOptions, type Solve2DResultBundle } from './solver2d';
import type { Analysis2DModel } from './analysis';
import type { Fem2DModel, ModelError } from './types';

export interface Fem2DPipelineResult extends Solve2DResultBundle {
  /** True when every stage ran without fail-severity errors. */
  ok: boolean;
}

export interface Fem2DAnalysisResult extends Fem2DPipelineResult {
  /** Member verdicts + envelopes + αcr. Null when the solve failed. */
  checks: Fem2DCheckBundle | null;
}

function emptyResult(errors: ModelError[]): Fem2DPipelineResult {
  return { ok: false, elements: [], reactions: [], reactionsByLc: {}, displacementsByLc: {}, errors };
}

function runPipeline(
  model: Fem2DModel,
  opts: Solve2DOptions,
): { result: Fem2DPipelineResult; analysis: Analysis2DModel | null } {
  const errors: ModelError[] = validateModel2DBasic(model);
  if (errors.some((e) => e.severity === 'fail')) {
    return { result: emptyResult(errors), analysis: null };
  }

  const { analysis, errors: decomposeErrors } = decompose2D(model);
  errors.push(...decomposeErrors);
  if (errors.some((e) => e.severity === 'fail')) {
    return { result: emptyResult(errors), analysis: null };
  }

  const bundle = solveAnalysis2D(analysis, opts);
  const all = [...errors, ...bundle.errors];
  return {
    result: { ...bundle, errors: all, ok: !all.some((e) => e.severity === 'fail') },
    analysis,
  };
}

export function solveFem2D(model: Fem2DModel, opts: Solve2DOptions = {}): Fem2DPipelineResult {
  return runPipeline(model, opts).result;
}

/** Full analysis: solve + member checks. What the UI phase consumes. */
export function analyzeFem2D(model: Fem2DModel, opts: Solve2DOptions = {}): Fem2DAnalysisResult {
  const { result, analysis } = runPipeline(model, opts);
  if (!result.ok || !analysis) return { ...result, checks: null };
  const checks = checkFem2D(model, analysis, result);
  return {
    ...result,
    errors: [...result.errors, ...checks.errors],
    checks,
  };
}
