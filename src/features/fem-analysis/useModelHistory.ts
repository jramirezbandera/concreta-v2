// Undo/redo history for the FEM 2D DesignModel.
//
// API mirrors the existing { model, setModel } pair so callers don't change
// shape. Three exits beyond the basic setter:
//   - resetModel(next): replace the model AND clear history (use for preset
//     pick, back-to-landing, URL/storage hydration — these aren't user edits).
//   - undo() / redo(): step through past/future stacks.
//   - canUndo / canRedo: for button enabled-state.
//
// Cap history at MAX_HISTORY entries so a long edit session can't exhaust
// memory with cloned snapshots.

import { useCallback, useRef, useState } from 'react';
import type { DesignModel } from './types';

const MAX_HISTORY = 50;

interface HistoryState {
  past: DesignModel[];
  present: DesignModel | null;
  future: DesignModel[];
}

export interface ModelHistoryApi {
  model: DesignModel | null;
  setModel: (updater: (m: DesignModel) => DesignModel) => void;
  resetModel: (next: DesignModel | null) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useModelHistory(initial: DesignModel | null): ModelHistoryApi {
  const [state, setState] = useState<HistoryState>(() => ({
    past: [],
    present: initial,
    future: [],
  }));

  const stateRef = useRef(state);
  stateRef.current = state;

  const setModel = useCallback((updater: (m: DesignModel) => DesignModel) => {
    setState((s) => {
      if (!s.present) return s;
      const next = updater(s.present);
      if (next === s.present) return s;
      const past = [...s.past, s.present];
      if (past.length > MAX_HISTORY) past.shift();
      return { past, present: next, future: [] };
    });
  }, []);

  const resetModel = useCallback((next: DesignModel | null) => {
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
    model: state.present,
    setModel,
    resetModel,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
