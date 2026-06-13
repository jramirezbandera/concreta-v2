import { useEffect, useMemo, useRef, useState } from 'react';
import type { DesignModel, SolveResult } from './types';

// Lazy wrapper around solveDesignModel: the solver + its transitive deps
// (femSolver, autoDecompose, combinations, lcCombinations, invariants,
// adapters/*) ship as a separate chunk so visiting /analisis/fem doesn't pay
// the solver download up front. The chunk import starts on mount.
//
// While the chunk loads, `result.status === 'pending'`. Once it lands the
// solver runs synchronously thereafter — no per-edit latency penalty.
//
// PDF export needs a real result (the "PDF export never disabled" rule means
// the button is always clickable). `ensureSolver()` returns a Promise that
// resolves to the solver function — callers await it before exporting.

type SolverFn = (model: DesignModel) => SolveResult;

const NEUTRAL_RESULT: SolveResult = {
  status: 'neutral',
  maxEta: 0,
  perBar: {},
  reactions: [],
  errors: [],
  elements: [],
};

const PENDING_RESULT: SolveResult = {
  status: 'pending',
  maxEta: 0,
  perBar: {},
  reactions: [],
  errors: [],
  elements: [],
};

let solverPromise: Promise<SolverFn> | null = null;
function loadSolver(): Promise<SolverFn> {
  if (!solverPromise) {
    solverPromise = import('./solveDesignModel').then((m) => m.solveDesignModel);
  }
  return solverPromise;
}

export interface LazyDesignSolver {
  result: SolveResult;
  solverReady: boolean;
  ensureSolver: () => Promise<SolverFn>;
}

export function useLazyDesignSolver(model: DesignModel | null): LazyDesignSolver {
  const [solver, setSolver] = useState<SolverFn | null>(null);
  const solverRef = useRef<SolverFn | null>(null);
  // eslint-disable-next-line react-hooks/refs -- keep a ref to the latest solver for use inside stable callbacks
  solverRef.current = solver;

  useEffect(() => {
    let cancelled = false;
    loadSolver().then((fn) => {
      if (!cancelled) setSolver(() => fn);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const result = useMemo<SolveResult>(() => {
    if (!model) return NEUTRAL_RESULT;
    if (!solver) return PENDING_RESULT;
    return solver(model);
  }, [model, solver]);

  return {
    result,
    solverReady: solver !== null,
    ensureSolver: loadSolver,
  };
}
