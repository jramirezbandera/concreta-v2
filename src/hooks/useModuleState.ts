import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { getModuleSchemaVersion } from '../data/moduleRegistry';
import { showToast } from '../components/ui/Toast';
import { borrarClave, escribirClaveDiferida, leerClave, volcarPendientes } from '../lib/storage/seguro';

// Canonical state priority: URL query params > localStorage > hardcoded defaults
//
// Share-link model ("build-on-demand"): durante el uso normal la barra de
// direcciones se mantiene LIMPIA. El estado se persiste en localStorage (no en
// la URL) y el enlace compartible se construye desde el estado en memoria sólo
// al pulsar "Copiar enlace" (getShareUrl / copyShareLink). Un enlace entrante
// (?campo=valor) se lee al montar y se limpia de la URL acto seguido. Esto
// elimina la carrera del debounce que dejaba enlaces sin parámetros.
//
// Debounce: 300 ms, por la cola drenable de lib/storage/seguro (las
// actualizaciones de SVG/cálculo las maneja cada módulo vía useMemo/useEffect a
// ~50 ms). Al desmontar se VUELCA lo pendiente, no se cancela.

type Primitive = string | number | boolean;
// Loose internal record type used for dynamic key access in URL/storage helpers.
// The public hook takes a concrete `T` (each module's *Inputs interface) without
// requiring an index signature — the cast is contained to the dynamic-key paths.
type PrimitiveRecord = Record<string, Primitive>;

interface UseModuleStateReturn<T> {
  state: T;
  setField: <K extends keyof T>(field: K, value: T[K]) => void;
  reset: () => void;
  /**
   * Construye una URL compartible que codifica el estado ACTUAL en memoria como
   * query params, independientemente de lo que haya en la barra de direcciones.
   * Es la fuente de verdad del enlace — no depende de window.location.search.
   */
  getShareUrl: () => string;
  /**
   * Copia `getShareUrl()` al portapapeles y muestra un toast. Pensado para
   * cablearse directamente en `<Topbar onCopyLink={copyShareLink} />`.
   */
  copyShareLink: () => void;
}

// Per-key schema version (preferred over global localStorage.clear)
function getVersionKey(moduleKey: string) {
  return `${moduleKey}-version`;
}

function readLocalStorage<T>(moduleKey: string, defaults: T): T | null {
  const version = leerClave(getVersionKey(moduleKey));
  if (version !== getModuleSchemaVersion(moduleKey)) return null;
  const raw = leerClave(moduleKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<T>;
    // Merge with defaults so new fields added in future schema versions are present
    return { ...defaults, ...parsed };
  } catch {
    return null;
  }
}

// Escritura DIFERIDA (300 ms) por la cola de lib/storage/seguro: al desmontar,
// el hook la VUELCA en vez de cancelarla, y serializar() puede volcarla desde
// fuera de React con el módulo montado. La cuota llena ya no es muda.
function writeLocalStorage<T>(moduleKey: string, state: T): void {
  escribirClaveDiferida(moduleKey, () => JSON.stringify(state));
  escribirClaveDiferida(getVersionKey(moduleKey), getModuleSchemaVersion(moduleKey));
}

function clearLocalStorage(moduleKey: string): void {
  borrarClave(moduleKey);
  borrarClave(getVersionKey(moduleKey));
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

  // Escritura diferida (300 ms, cola de lib/storage/seguro). Ya NO escribimos
  // en la URL: el enlace se construye bajo demanda (getShareUrl) y la barra
  // queda limpia.
  const schedulePersist = useCallback(
    (nextState: T) => {
      writeLocalStorage(moduleKey, nextState);
    },
    [moduleKey],
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
    clearLocalStorage(moduleKey);
    setSearchParams({}, { replace: true });
    setState(defaults);
  }, [moduleKey, defaults, setSearchParams]);

  // Construye el enlace desde el estado ACTUAL en memoria (no desde la URL).
  // Así "Copiar enlace" siempre lleva todos los parámetros, sin depender de
  // haber editado antes ni del debounce.
  const getShareUrl = useCallback(() => {
    if (typeof window === 'undefined') return '';
    const { origin, pathname } = window.location;
    const qs = new URLSearchParams(toUrlParams(state)).toString();
    return qs ? `${origin}${pathname}?${qs}` : `${origin}${pathname}`;
  }, [state]);

  const copyShareLink = useCallback(() => {
    const url = getShareUrl();
    navigator.clipboard.writeText(url).then(
      () => showToast('Enlace copiado', { autoDismiss: 2000 }),
      () => showToast('No se pudo copiar el enlace', { autoDismiss: 3000 }),
    );
  }, [getShareUrl]);

  // Al montar: si la URL traía parámetros (un enlace compartido), ya se han
  // leído al estado inicial arriba. Los retiramos de la barra para que quede
  // limpia durante el uso; el enlace se reconstruye bajo demanda. Se ejecuta
  // una sola vez con los searchParams de la primera renderización.
  //
  // Y se PERSISTE el estado hidratado: hasta aquí sólo escribía setField, así
  // que un módulo abierto desde un enlace tenía cero bytes en el almacén y
  // «Guardar proyecto» habría guardado la viga anterior con la compartida en
  // pantalla. Lo que se ve es lo que se guarda.
  useEffect(() => {
    if (Array.from(searchParams).length > 0) {
      setSearchParams({}, { replace: true });
      writeLocalStorage(moduleKey, state);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Al desmontar: VOLCAR lo pendiente, no cancelarlo. Si se cancelase, cambiar
  // de módulo o de obra perdería lo tecleado en los últimos 300 ms con el valor
  // todavía en pantalla.
  useEffect(() => {
    return () => {
      volcarPendientes();
    };
  }, []);

  return { state, setField, reset, getShareUrl, copyShareLink };
}
