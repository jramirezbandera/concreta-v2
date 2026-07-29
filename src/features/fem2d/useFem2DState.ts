// FEM 2D — model-centric state (v2): history + persistence + hydration.
//
// The editor's persisted state IS the Fem2DModel (it already carries
// templateId provenance and selfWeight — no wrapper). Editing goes through
// useHistoryState (shared undo/redo, cap 50); every committed mutation is one
// immutable snapshot = one undo step. resetModel (new structure / hydration)
// clears history — those aren't user edits.
//
// Hydration priority at mount: URL (?model=, v2 model or v1 parametric link)
// > localStorage v2 > portal-frame template defaults (the model is NEVER null,
// so all hooks and the solver stay simple). First run has no URL and no stored
// blob: it still seeds the portal frame, but flags `startedEmpty` so the shell
// shows the template landing over the (unshown, unpersisted) seed — the same
// entry experience as FEM 1D. The seed is only persisted once the user actually
// picks/edits/AI-fills a model (the reference changes), so a reload with an
// untouched landing re-opens the landing.
// Schema: MODULE_SCHEMA_VERSIONS['fem2d'] = '2' — a version mismatch discards
// the stored blob (v1 stored parametric UI state, incompatible shape).

import { useCallback, useEffect, useRef, useState } from 'react';
import { getModuleSchemaVersion } from '../../data/moduleRegistry';
import { useHistoryState } from '../../hooks/useHistoryState';
import { validateModel2DBasic } from './builder';
import { decodeShareStringDetailed, isPlausibleModel, normalizeLegacyModel } from './serialize';
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

function loadFromStorage(): { model: Fem2DModel; migrated: boolean } | null {
  try {
    if (localStorage.getItem(VERSION_KEY) !== SCHEMA) return null;
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isPlausibleModel(parsed)) return null;
    // El blob guardado tiene el mismo shape que los enlaces: mismo normalizador
    // de la Fase 2 (rol/elementType antiguos → campos nuevos).
    const normalized = normalizeLegacyModel(parsed as Fem2DModel);
    // Same gate as share links: never hydrate a degenerate model.
    if (validateModel2DBasic(normalized.model).some((e) => e.severity === 'fail')) return null;
    return normalized;
  } catch {
    return null;
  }
}

function loadFromUrl(): { model: Fem2DModel; migrated: boolean } | null {
  if (typeof window === 'undefined') return null;
  try {
    const param = new URLSearchParams(window.location.search).get('model');
    if (!param) return null;
    return decodeShareStringDetailed(param); // v2 models (pre/post Fase 2) AND v1 parametric links
  } catch {
    return null;
  }
}

/** Hydrated model plus whether it came from a real source (URL/storage) or is
 *  just the first-run seed (→ the shell opens the template landing), plus the
 *  Fase-2 migration flag (→ non-dismissable banner). */
function loadInitialWithSource(): { model: Fem2DModel; fromSaved: boolean; migrated: boolean } {
  const fromUrl = loadFromUrl();
  if (fromUrl) return { model: fromUrl.model, fromSaved: true, migrated: fromUrl.migrated };
  const fromStorage = loadFromStorage();
  if (fromStorage) return { model: fromStorage.model, fromSaved: true, migrated: fromStorage.migrated };
  return { model: seedModel(), fromSaved: false, migrated: false };
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
  /** True on first run (no URL, no stored model): show the template landing. */
  startedEmpty: boolean;
  /** True cuando la hidratación migró un modelo del esquema anterior a la
   *  Fase 2 (rol de barra): la shell muestra el banner no descartable.
   *  Describe la procedencia del modelo ACTUAL, no de la sesión: elegir una
   *  plantilla o una estructura nueva (resetModel) lo apaga — el modelo pasa a
   *  ser 100% del esquema nuevo. Las ediciones normales (setModel) lo
   *  conservan: el recordatorio de revisar HA/flecha sigue vigente mientras el
   *  contenido migrado siga ahí. */
  migratedFromLegacy: boolean;
}

export function useFem2DState(): Fem2DModelStore {
  // Resolve the hydration source exactly once (lazy useState initializer runs
  // on mount only) so `startedEmpty` is stable and the persist guard can
  // compare against the seed reference.
  const [initial] = useState(loadInitialWithSource);

  const h = useHistoryState<Fem2DModel>(() => initial.model);
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
    // Don't persist the untouched landing seed: while the user sits on the
    // template screen (first run + model still the seed reference), keep
    // localStorage empty so a reload re-opens the landing. Any pick/edit/AI
    // replaces the reference and persistence resumes.
    if (!initial.fromSaved && model === initial.model) return;
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
  }, [model, initial]);

  // Estado (no const del montaje): el banner de migración cae cuando el modelo
  // se reemplaza ENTERO — antes se quedaba pegado toda la sesión y salía sobre
  // una plantilla recién elegida, que estampa el esquema nuevo por definición.
  const [migrated, setMigrated] = useState(initial.migrated);
  const resetModel = useCallback((next: Fem2DModel) => {
    setMigrated(false);
    h.reset(next);
  }, [h]);

  return {
    model,
    setModel: h.set,
    resetModel,
    undo: h.undo,
    redo: h.redo,
    canUndo: h.canUndo,
    canRedo: h.canRedo,
    startedEmpty: !initial.fromSaved,
    migratedFromLegacy: migrated,
  };
}
