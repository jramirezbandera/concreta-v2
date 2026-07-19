// useHistoryState — generic undo/redo history over an immutable value.
//
// Extracted from features/fem-analysis/useModelHistory (verbatim body,
// DesignModel → T) so the FEM 2D editor can share it — features/fem2d must not
// import from features/fem-analysis (architectural quarantine); shared hooks
// live here. The 1D hook remains as a typed wrapper delegating to this one.
//
// API mirrors the plain { value, set } pair so callers don't change shape.
// Three exits beyond the basic setter:
//   - reset(next): replace the value AND clear history (use for preset pick,
//     back-to-landing, URL/storage hydration — these aren't user edits).
//   - undo() / redo(): step through past/future stacks.
//   - canUndo / canRedo: for button enabled-state.
//
// Cap history at MAX_HISTORY entries so a long edit session can't exhaust
// memory with cloned snapshots. `updater` returning the SAME reference is a
// no-op (no history entry) — mutations must be immutable snapshots.

import { useCallback, useRef, useState } from 'react';

const MAX_HISTORY = 50;

interface HistoryState<T> {
  past: T[];
  present: T | null;
  future: T[];
}

export interface HistoryStateApi<T> {
  value: T | null;
  set: (updater: (v: T) => T) => void;
  reset: (next: T | null) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useHistoryState<T>(initial: T | null | (() => T | null)): HistoryStateApi<T> {
  // Lazy initializer support (mirrors useState): hydration from URL/storage is
  // not free, so callers can defer it to first mount.
  const [state, setState] = useState<HistoryState<T>>(() => ({
    past: [],
    present: typeof initial === 'function' ? (initial as () => T | null)() : initial,
    future: [],
  }));

  const stateRef = useRef(state);
  // eslint-disable-next-line react-hooks/refs -- keep a ref to the latest state for use inside stable callbacks
  stateRef.current = state;

  const set = useCallback((updater: (v: T) => T) => {
    setState((s) => {
      if (!s.present) return s;
      const next = updater(s.present);
      if (next === s.present) return s;
      const past = [...s.past, s.present];
      if (past.length > MAX_HISTORY) past.shift();
      return { past, present: next, future: [] };
    });
  }, []);

  const reset = useCallback((next: T | null) => {
    setState({ past: [], present: next, future: [] });
  }, []);

  const undo = useCallback(() => {
    setState((s) => {
      if (s.past.length === 0 || !s.present) return s;
      const prev = s.past[s.past.length - 1];
      return {
        past: s.past.slice(0, -1),
        present: prev,
        future: [s.present, ...s.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setState((s) => {
      if (s.future.length === 0 || !s.present) return s;
      const next = s.future[0];
      return {
        past: [...s.past, s.present],
        present: next,
        future: s.future.slice(1),
      };
    });
  }, []);

  return {
    value: state.present,
    set,
    reset,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
