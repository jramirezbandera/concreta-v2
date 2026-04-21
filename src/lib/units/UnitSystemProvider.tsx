import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { UnitSystem } from "./types";

const STORAGE_KEY = "unitSystem";

export const TOGGLE_DISABLED =
  import.meta.env.VITE_UNITS_TOGGLE === "off";

function readStored(): UnitSystem {
  if (TOGGLE_DISABLED) return "si";
  if (typeof window === "undefined") return "si";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "si" || raw === "tecnico") return raw;
  } catch {
    // localStorage unavailable (private mode, disabled): fall back to SI
  }
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
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, next);
      }
    } catch {
      // ignore — UI state still updates even if persistence fails
    }
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
