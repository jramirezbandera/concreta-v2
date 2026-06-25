// Persistencia del estado del talud. A diferencia del resto de módulos (estado
// plano vía useModuleState con serialización a URL), aquí el estado anida estratos
// y cargas → se guarda como BLOB JSON en localStorage del propio módulo
// (eng-review §9.3 T3). Versionado por MODULE_SCHEMA_VERSIONS['slope-stability'].
//
// Phase 2 (T2.2): enlaces compartibles vía lz-string (serialize.ts). Al montar,
// la prioridad de hidratación es URL (?model=) > localStorage > defaults; el
// param se limpia de la URL tras consumirlo, como hace FEM.

import { useCallback, useEffect, useRef, useState } from "react";
import { slopeDefaults, type SlopeInputs } from "../../data/defaults";
import { getModuleSchemaVersion } from "../../data/moduleRegistry";
import { decodeShareString } from "./serialize";

// Reexporta el builder de enlaces para que T4.1 cablee onCopyLink en el Topbar
// sin acoplarse al módulo de serialización directamente.
export { buildShareUrl } from "./serialize";

const LS_KEY = "concreta-slope-stability";
const VERSION_KEY = `${LS_KEY}-v`;
const SCHEMA = getModuleSchemaVersion("slope-stability");

function loadFromStorage(): SlopeInputs {
  try {
    if (localStorage.getItem(VERSION_KEY) !== SCHEMA) return slopeDefaults;
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return slopeDefaults;
    const parsed = JSON.parse(raw) as Partial<SlopeInputs>;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.strata)) {
      return slopeDefaults;
    }
    // Merge sobre defaults para tolerar campos nuevos tras un bump menor.
    return { ...slopeDefaults, ...parsed };
  } catch {
    return slopeDefaults;
  }
}

/** Lee ?model= de la URL si existe. Devuelve null si no hay param o es inválido. */
function loadFromUrl(): SlopeInputs | null {
  if (typeof window === "undefined") return null;
  try {
    const param = new URLSearchParams(window.location.search).get("model");
    if (!param) return null;
    return decodeShareString(param); // null si está corrupto
  } catch {
    return null;
  }
}

/** Hidratación inicial: URL (?model=) > localStorage > defaults. */
function load(): SlopeInputs {
  return loadFromUrl() ?? loadFromStorage();
}

export interface SlopeStateStore {
  state: SlopeInputs;
  setState: (next: SlopeInputs) => void;
  reset: () => void;
}

export function useSlopeState(): SlopeStateStore {
  const [state, setState] = useState<SlopeInputs>(load);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tras consumir ?model= al montar, lo retiramos para dejar la URL limpia
  // (espeja FEM). replaceState evita ensuciar el historial de navegación.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.has("model")) {
      url.searchParams.delete("model");
      window.history.replaceState(window.history.state, "", url.toString());
    }
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(state));
        localStorage.setItem(VERSION_KEY, SCHEMA);
      } catch {
        /* almacenamiento no disponible — se ignora */
      }
    }, 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [state]);

  const reset = useCallback(() => {
    try {
      localStorage.removeItem(LS_KEY);
    } catch {
      /* noop */
    }
    setState(slopeDefaults);
  }, []);

  return { state, setState, reset };
}
