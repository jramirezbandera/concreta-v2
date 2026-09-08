/* eslint-disable react-refresh/only-export-components -- standard Context+Provider pattern co-locates the context with the provider component; HMR full-reload is acceptable. */
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { UnitSystem } from "./types";
import { escribirClave, leerClave } from "../storage/seguro";

const STORAGE_KEY = "unitSystem";

export const TOGGLE_DISABLED =
  import.meta.env.VITE_UNITS_TOGGLE === "off";

function readStored(): UnitSystem {
  if (TOGGLE_DISABLED) return "si";
  if (typeof window === "undefined") return "si";
  const raw = leerClave(STORAGE_KEY);
  if (raw === "si" || raw === "tecnico") return raw;
  return "si";
}

export type UnitSystemContextValue = {
  system: UnitSystem;
  setSystem: (next: UnitSystem) => void;
  toggleDisabled: boolean;
};

export const UnitSystemContext =
  createContext<UnitSystemContextValue | null>(null);

export function UnitSystemProvider({ children }: { children: ReactNode }) {
  const [system, setSystemState] = useState<UnitSystem>(readStored);

  useEffect(() => {
    if (TOGGLE_DISABLED) return;
    if (typeof window === "undefined") return;
    const handler = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      const next = event.newValue;
      if (next === "si" || next === "tecnico") {
        setSystemState(next);
      } else if (next === null) {
        setSystemState("si");
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const setSystem = useCallback((next: UnitSystem) => {
    if (TOGGLE_DISABLED) return;
    setSystemState(next);
    if (typeof window !== "undefined") escribirClave(STORAGE_KEY, next);
  }, []);

  const value = useMemo<UnitSystemContextValue>(
    () => ({ system, setSystem, toggleDisabled: TOGGLE_DISABLED }),
    [system, setSystem]
  );

  return (
    <UnitSystemContext.Provider value={value}>
      {children}
    </UnitSystemContext.Provider>
  );
}
