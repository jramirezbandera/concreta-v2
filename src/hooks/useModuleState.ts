import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { getModuleSchemaVersion } from '../data/moduleRegistry';

// Canonical state priority: URL query params > localStorage > hardcoded defaults
//
// Two debounce intervals (separate concerns):
//   50ms  — SVG/calc updates  (handled by the module via useMemo/useEffect)
//   300ms — localStorage + URL writes (handled here)

type Primitive = string | number | boolean;
type StateRecord = Record<string, Primitive>;

interface UseModuleStateReturn<T extends StateRecord> {
  state: T;
  setField: (field: keyof T, value: T[keyof T]) => void;
  reset: () => void;
}

// Per-key schema version (preferred over global localStorage.clear)
function getVersionKey(moduleKey: string) {
  return `${moduleKey}-version`;
}

function readLocalStorage<T extends StateRecord>(moduleKey: string, defaults: T): T | null {
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

function writeLocalStorage<T extends StateRecord>(moduleKey: string, state: T): void {
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
function parseUrlParams<T extends StateRecord>(
  params: URLSearchParams,
  defaults: T,
): Partial<T> {
  const result: Partial<T> = {};
  for (const [key, raw] of params.entries()) {
    if (!(key in defaults)) continue;
    const defaultVal = defaults[key as keyof T];
    if (typeof defaultVal === 'number') {
      const n = Number(raw);
      if (!isNaN(n)) (result as StateRecord)[key] = n;
    } else if (typeof defaultVal === 'boolean') {
      (result as StateRecord)[key] = raw === 'true';
    } else {
      (result as StateRecord)[key] = raw;
    }
  }
  return result;
}

// Serialize full state to URL-safe params for complete state persistence (shareable URLs)
function toUrlParams<T extends StateRecord>(state: T): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(state)) {
    out[key] = String(val);
  }
  return out;
}

export function useModuleState<T extends StateRecord>(
  moduleKey: string,
  defaults: T,
): UseModuleStateReturn<T> {
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
    (field: keyof T, value: T[keyof T]) => {
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
