import { useContext } from "react";
import { AiSettingsContext } from "./AiSettingsProvider";

export function useAiSettings() {
  const ctx = useContext(AiSettingsContext);
  if (!ctx) {
    throw new Error("useAiSettings must be used inside <AiSettingsProvider>");
  }
  return ctx;
}
