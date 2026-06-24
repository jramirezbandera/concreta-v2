// Invariantes de entrada del talud (puros, sin worker). Los comparten el shell
// del módulo (gatea si llama o no a calcSlope) y el panel de inputs (aria-invalid
// + banner "Cómo arreglarlo"). Si `valid` es false NO se llama al motor.

import type { SlopeInputs } from "../../../data/defaults";

export interface SlopeValidation {
  valid: boolean;
  error?: string;
  /** Sugerencia concreta para el banner de validación (patrón DESIGN.md). */
  fix?: string;
}

export function validateSlope(inp: SlopeInputs): SlopeValidation {
  if (!(inp.height > 0)) {
    return { valid: false, error: "La altura del talud debe ser mayor que 0.", fix: "Introduce una altura H > 0 m." };
  }
  if (!(inp.angle > 0 && inp.angle < 90)) {
    return { valid: false, error: "El ángulo del talud debe estar entre 0° y 90°.", fix: "Ajusta β a un valor entre 1° y 89°." };
  }
  if (inp.strata.length < 1) {
    return { valid: false, error: "Define al menos un estrato.", fix: "Añade un estrato con su γ, c' y φ'." };
  }
  const totalThickness = inp.strata.reduce((s, st) => s + (st.thickness || 0), 0);
  if (totalThickness < inp.height) {
    return {
      valid: false,
      error: "Los estratos no cubren la altura del talud.",
      fix: `Aumenta el espesor de los estratos hasta ≥ ${inp.height} m (suma actual ${totalThickness.toFixed(2)} m).`,
    };
  }
  if (inp.waterTableDepth !== null && inp.waterTableDepth < 0) {
    return { valid: false, error: "El nivel freático no puede ser negativo.", fix: "Introduce una profundidad de NF ≥ 0 m o déjalo vacío." };
  }
  return { valid: true };
}
