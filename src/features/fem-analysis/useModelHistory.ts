// Undo/redo history for the FEM 1D DesignModel.
//
// The generic machinery lives in src/hooks/useHistoryState (extracted so the
// FEM 2D editor can share it without importing from this feature — quarantine).
// This wrapper keeps the historical 1D API shape (model/setModel/resetModel)
// so index.tsx and its tests don't change.

import { useHistoryState } from '../../hooks/useHistoryState';
import type { DesignModel } from './types';

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
  const h = useHistoryState<DesignModel>(initial);
  return {
    model: h.value,
    setModel: h.set,
    resetModel: h.reset,
    undo: h.undo,
    redo: h.redo,
    canUndo: h.canUndo,
    canRedo: h.canRedo,
  };
}
