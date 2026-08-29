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

/** Hidratación inicial: URL (?model=) > localStorage > defaults.
 *  Devuelve también el ORIGEN: `useState(load)` descartaría esa información, y
 *  la persistencia la necesita para no pisar el modelo guardado (ver abajo). */
function load(): { state: SlopeInputs; fromUrl: boolean } {
  const url = loadFromUrl();
  if (url) return { state: url, fromUrl: true };
  return { state: loadFromStorage(), fromUrl: false };
}

export interface SlopeStateStore {
  state: SlopeInputs;
  setState: (next: SlopeInputs) => void;
  reset: () => void;
  /** El estado inicial vino de un enlace `?model=` (traspaso desde un módulo de
   *  muro o enlace compartido). La UI lo usa para avisar de que hay que revisar
   *  el estrato de cimentación del modelo prefabricado. */
  hydratedFromUrl: boolean;
}

export function useSlopeState(): SlopeStateStore {
  const [initial] = useState(load);
  const [state, setState] = useState<SlopeInputs>(initial.state);
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

  // Un modelo llegado por URL es un BORRADOR de traspaso, no trabajo guardado:
  // si se persistiera al montar pisaría para siempre el modelo del usuario, y
  // con un botón "VER TALUDES" en cada módulo de muro eso pasa de rareza a
  // rutina. Mientras `state` siga siendo EL MISMO OBJETO que llegó del enlace,
  // no se escribe; el primer setState lo sustituye por otra referencia y a
  // partir de ahí persiste con normalidad (también en reset(), que pasa a
  // slopeDefaults). La comparación por identidad —en vez de una bandera de un
  // solo uso— es idempotente ante el doble montaje de StrictMode.
  useEffect(() => {
    if (initial.fromUrl && state === initial.state) return;
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
  }, [state, initial]);

  const reset = useCallback(() => {
    try {
      localStorage.removeItem(LS_KEY);
    } catch {
      /* noop */
    }
    setState(slopeDefaults);
  }, []);

  return { state, setState, reset, hydratedFromUrl: initial.fromUrl };
}
