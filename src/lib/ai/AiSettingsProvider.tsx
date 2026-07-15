/* eslint-disable react-refresh/only-export-components -- standard Context+Provider pattern co-locates the context with the provider component; HMR full-reload is acceptable. */
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AiProviderId } from "./types";

// BYOK settings: the user's API keys live ONLY in localStorage, in plain text
// (documented trade-off, see SPECS.md). SECURITY: never log keys (console.*)
// and never interpolate them into error messages.
const STORAGE_KEY = "concreta-ai-settings";

const PROVIDER_IDS: readonly AiProviderId[] = ["anthropic", "openai", "gemini"];

export interface AiSettings {
  provider: AiProviderId;
  keys: Partial<Record<AiProviderId, string>>;
}

function isProviderId(v: unknown): v is AiProviderId {
  return (PROVIDER_IDS as readonly unknown[]).includes(v);
}

function defaultSettings(): AiSettings {
  return { provider: "anthropic", keys: {} };
}

/**
 * Defensive parse of the stored JSON (`{provider, keys}`): unknown provider →
 * 'anthropic', non-string / blank keys dropped, corrupt JSON → defaults.
 * Shared by the initial read and the cross-tab `storage` handler.
 */
function parseStored(raw: string | null): AiSettings {
  if (raw === null) return defaultSettings();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return defaultSettings();
    const obj = parsed as Record<string, unknown>;
    const provider: AiProviderId = isProviderId(obj.provider)
      ? obj.provider
      : "anthropic";
    const keys: Partial<Record<AiProviderId, string>> = {};
    if (typeof obj.keys === "object" && obj.keys !== null) {
      const rawKeys = obj.keys as Record<string, unknown>;
      for (const p of PROVIDER_IDS) {
        const k = rawKeys[p];
        if (typeof k === "string" && k.trim() !== "") keys[p] = k.trim();
      }
    }
    return { provider, keys };
  } catch {
    return defaultSettings(); // corrupt JSON — start clean
  }
}

function readStored(): AiSettings {
  if (typeof window === "undefined") return defaultSettings();
  try {
    return parseStored(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return defaultSettings(); // localStorage unavailable (private mode, disabled)
  }
}

function persist(next: AiSettings): void {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  } catch {
    // persistence failed — UI state still updates for the session
  }
}

export interface AiSettingsContextValue {
  settings: AiSettings;
  /** Key of the active provider (trimmed), or null when empty/absent. */
  activeKey: string | null;
  setProvider(p: AiProviderId): void;
  /** Trims the key; an empty result is equivalent to clearKey(p). */
  setKey(p: AiProviderId, key: string): void;
  clearKey(p: AiProviderId): void;
}

export const AiSettingsContext = createContext<AiSettingsContextValue | null>(
  null
);

export function AiSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AiSettings>(readStored);

  // Cross-tab sync: another tab changed the settings → follow it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      setSettings(parseStored(e.newValue));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setProvider = useCallback((p: AiProviderId) => {
    setSettings((prev) => {
      if (prev.provider === p) return prev;
      const next: AiSettings = { ...prev, provider: p };
      persist(next);
      return next;
    });
  }, []);

  const setKey = useCallback((p: AiProviderId, key: string) => {
    const trimmed = key.trim();
    setSettings((prev) => {
      const keys = { ...prev.keys };
      if (trimmed === "") {
        if (keys[p] === undefined) return prev;
        delete keys[p];
      } else {
        if (keys[p] === trimmed) return prev;
        keys[p] = trimmed;
      }
      const next: AiSettings = { ...prev, keys };
      persist(next);
      return next;
    });
  }, []);

  const clearKey = useCallback((p: AiProviderId) => {
    setSettings((prev) => {
      if (prev.keys[p] === undefined) return prev;
      const keys = { ...prev.keys };
      delete keys[p];
      const next: AiSettings = { ...prev, keys };
      persist(next);
      return next;
    });
  }, []);

  const value = useMemo<AiSettingsContextValue>(() => {
    const raw = settings.keys[settings.provider];
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    return {
      settings,
      activeKey: trimmed === "" ? null : trimmed,
      setProvider,
      setKey,
      clearKey,
    };
  }, [settings, setProvider, setKey, clearKey]);

  return (
    <AiSettingsContext.Provider value={value}>
      {children}
    </AiSettingsContext.Provider>
  );
}
