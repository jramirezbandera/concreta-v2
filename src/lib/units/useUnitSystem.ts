import { useContext } from "react";
import { UnitSystemContext } from "./UnitSystemProvider";

export function useUnitSystem() {
  const ctx = useContext(UnitSystemContext);
  if (!ctx) {
    throw new Error(
      "useUnitSystem must be used inside <UnitSystemProvider>"
    );
  }
  return ctx;
}
