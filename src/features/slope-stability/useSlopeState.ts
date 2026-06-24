// Persistencia del estado del talud. A diferencia del resto de módulos (estado
// plano vía useModuleState con serialización a URL), aquí el estado anida estratos
// y cargas → se guarda como BLOB JSON en localStorage del propio módulo
// (eng-review §9.3 T3). Versionado por MODULE_SCHEMA_VERSIONS['slope-stability'].
// Los enlaces compartibles lz-string son Phase 2.

import { useCallback, useEffect, useRef, useState } from "react";
import { slopeDefaults, type SlopeInputs } from "../../data/defaults";
import { getModuleSchemaVersion } from "../../data/moduleRegistry";

const LS_KEY = "concreta-slope-stability";
const VERSION_KEY = `${LS_KEY}-v`;
const SCHEMA = getModuleSchemaVersion("slope-stability");

function load(): SlopeInputs {
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

export interface SlopeStateStore {
  state: SlopeInputs;
  setState: (next: SlopeInputs) => void;
  reset: () => void;
}

export function useSlopeState(): SlopeStateStore {
  const [state, setState] = useState<SlopeInputs>(load);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
