import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { getModuleSchemaVersion } from '../data/moduleRegistry';

// Canonical state priority: URL query params > localStorage > hardcoded defaults
//
// Two debounce intervals (separate concerns):
//   50ms  — SVG/calc updates  (handled by the module via useMemo/useEffect)
//   300ms — localStorage + URL writes (handled here)

type Primitive = string | number | boolean;
// Loose internal record type used for dynamic key access in URL/storage helpers.
// The public hook takes a concrete `T` (each module's *Inputs interface) without
// requiring an index signature — the cast is contained to the dynamic-key paths.
type PrimitiveRecord = Record<string, Primitive>;

interface UseModuleStateReturn<T> {
  state: T;
  setField: <K extends keyof T>(field: K, value: T[K]) => void;
  reset: () => void;
}

// Per-key schema version (preferred over global localStorage.clear)
function getVersionKey(moduleKey: string) {
  return `${moduleKey}-version`;
}

function readLocalStorage<T>(moduleKey: string, defaults: T): T | null {
  try {
    const version = localStorage.getItem(getVersionKey(moduleKey));
    if (version !== getModuleSchemaVersion(moduleKey)) return null;
    const raw = localStorage.getItem(moduleKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<T>;
    // Merge with defaults so new fields added in future schema versions are present
    return { ...defaults, ...parsed };
  } catch {
    return null;
  }
}

function writeLocalStorage<T>(moduleKey: string, state: T): void {
  try {
    localStorage.setItem(moduleKey, JSON.stringify(state));
    localStorage.setItem(getVersionKey(moduleKey), getModuleSchemaVersion(moduleKey));
  } catch {
    // Storage full or private mode — silently ignore
  }
}

function clearLocalStorage(moduleKey: string): void {
  try {
    localStorage.removeItem(moduleKey);
    localStorage.removeItem(getVersionKey(moduleKey));
  } catch {
    // ignore
  }
}

// Parse URL params into state, coercing types from defaults
function parseUrlParams<T>(params: URLSearchParams, defaults: T): Partial<T> {
  const defaultsRec = defaults as unknown as PrimitiveRecord;
  const result: PrimitiveRecord = {};
  for (const [key, raw] of params.entries()) {
    if (!(key in defaultsRec)) continue;
    const defaultVal = defaultsRec[key];
    if (typeof defaultVal === 'number') {
      const n = Number(raw);
      if (!isNaN(n)) result[key] = n;
    } else if (typeof defaultVal === 'boolean') {
      result[key] = raw === 'true';
    } else {
      result[key] = raw;
    }
  }
  return result as Partial<T>;
}

// Serialize full state to URL-safe params for complete state persistence (shareable URLs)
function toUrlParams<T>(state: T): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(state as unknown as PrimitiveRecord)) {
    out[key] = String(val);
  }
  return out;
}

export function useModuleState<T>(moduleKey: string, defaults: T): UseModuleStateReturn<T> {
  const [searchParams, setSearchParams] = useSearchParams();
  const writeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Compute initial state once: URL > localStorage > defaults
  const [state, setState] = useState<T>(() => {
    const urlOverrides = parseUrlParams(searchParams, defaults);
    const hasUrlParams = Object.keys(urlOverrides).length > 0;

    if (hasUrlParams) {
      // URL params win for fields present in URL; missing fields fall through to localStorage/defaults
      const fromStorage = readLocalStorage(moduleKey, defaults);
      return { ...(fromStorage ?? defaults), ...urlOverrides };
    }

    const fromStorage = readLocalStorage(moduleKey, defaults);
    return fromStorage ?? defaults;
  });

  // Debounced write to localStorage + URL (300ms)
  const schedulePersist = useCallback(
    (nextState: T) => {
      if (writeTimerRef.current) clearTimeout(writeTimerRef.current);
      writeTimerRef.current = setTimeout(() => {
        writeLocalStorage(moduleKey, nextState);
        setSearchParams(toUrlParams(nextState), { replace: true });
      }, 300);
    },
    [moduleKey, setSearchParams],
  );

  const setField = useCallback(
    <K extends keyof T>(field: K, value: T[K]) => {
      setState((prev) => {
        const next = { ...prev, [field]: value };
        schedulePersist(next);
        return next;
      });
    },
    [schedulePersist],
  );

  const reset = useCallback(() => {
    if (writeTimerRef.current) clearTimeout(writeTimerRef.current);
    clearLocalStorage(moduleKey);
    setSearchParams({}, { replace: true });
    setState(defaults);
  }, [moduleKey, defaults, setSearchParams]);

  // Cleanup pending timer on unmount
  useEffect(() => {
    return () => {
      if (writeTimerRef.current) clearTimeout(writeTimerRef.current);
    };
  }, []);

  return { state, setField, reset };
}
