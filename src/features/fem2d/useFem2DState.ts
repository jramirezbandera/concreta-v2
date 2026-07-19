// FEM 2D — model-centric state (v2): history + persistence + hydration.
//
// The editor's persisted state IS the Fem2DModel (it already carries
// templateId provenance and selfWeight — no wrapper). Editing goes through
// useHistoryState (shared undo/redo, cap 50); every committed mutation is one
// immutable snapshot = one undo step. resetModel (new structure / hydration)
// clears history — those aren't user edits.
//
// Hydration priority at mount: URL (?model=, v2 model or v1 parametric link)
// > localStorage v2 > portal-frame template defaults (the model is NEVER null;
// there is no landing screen — first run seeds the default portal frame).
// Schema: MODULE_SCHEMA_VERSIONS['fem2d'] = '2' — a version mismatch discards
// the stored blob (v1 stored parametric UI state, incompatible shape).

import { useCallback, useEffect, useRef } from 'react';
import { getModuleSchemaVersion } from '../../data/moduleRegistry';
import { useHistoryState } from '../../hooks/useHistoryState';
import { validateModel2DBasic } from './builder';
import { decodeShareString, isPlausibleModel } from './serialize';
import { FEM2D_TEMPLATES } from './templates';
import type { Fem2DModel } from './types';

// Re-export so the shell wires "Copiar enlace" without importing serialize directly.
export { buildShareUrl } from './serialize';

const LS_KEY = 'concreta-fem2d';
const VERSION_KEY = `${LS_KEY}-v`;
const SCHEMA = getModuleSchemaVersion('fem2d');

/** Default seed: the portal-frame template with its FTUX-green defaults. */
export function seedModel(): Fem2DModel {
  return FEM2D_TEMPLATES['portal-frame'].build(FEM2D_TEMPLATES['portal-frame'].defaults());
}

function loadFromStorage(): Fem2DModel | null {
  try {
    if (localStorage.getItem(VERSION_KEY) !== SCHEMA) return null;
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isPlausibleModel(parsed)) return null;
    // Same gate as share links: never hydrate a degenerate model.
    if (validateModel2DBasic(parsed).some((e) => e.severity === 'fail')) return null;
    return parsed;
  } catch {
    return null;
  }
}

function loadFromUrl(): Fem2DModel | null {
  if (typeof window === 'undefined') return null;
  try {
    const param = new URLSearchParams(window.location.search).get('model');
    if (!param) return null;
    return decodeShareString(param); // handles v2 models AND v1 parametric links
  } catch {
    return null;
  }
}

function loadInitial(): Fem2DModel {
  return loadFromUrl() ?? loadFromStorage() ?? seedModel();
}

export interface Fem2DModelStore {
  /** Never null — first run seeds the default portal frame. */
  model: Fem2DModel;
  /** One committed mutation = one undo step (same-reference return = no-op). */
  setModel: (updater: (m: Fem2DModel) => Fem2DModel) => void;
  /** Replace the model AND clear history (new structure, not a user edit). */
  resetModel: (next: Fem2DModel) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useFem2DState(): Fem2DModelStore {
  const h = useHistoryState<Fem2DModel>(loadInitial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Strip ?model= after the mount-time hydration so the URL stays clean
  // (mirrors slope/FEM 1D). replaceState keeps the nav history untouched.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (url.searchParams.has('model')) {
      url.searchParams.delete('model');
      window.history.replaceState(window.history.state, '', url.toString());
    }
  }, []);

  // Persist (debounced) on every model change.
  const model = h.value!;
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(model));
        localStorage.setItem(VERSION_KEY, SCHEMA);
      } catch {
        /* storage unavailable — ignore */
      }
    }, 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [model]);

  const resetModel = useCallback((next: Fem2DModel) => h.reset(next), [h]);

  return {
    model,
    setModel: h.set,
    resetModel,
    undo: h.undo,
    redo: h.redo,
    canUndo: h.canUndo,
    canRedo: h.canRedo,
  };
}
