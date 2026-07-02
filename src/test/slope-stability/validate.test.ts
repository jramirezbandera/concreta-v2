// Invariantes de entrada del talud (validate.ts, puro — sin worker). Cubre los
// añadidos de la auditoría 2026-07-01: espesor por estrato > 0 y γ en [1,50],
// que antes llegaban al motor y reventaban con errores crípticos de PySlope
// ("The same material depth has been input twice" / assert_range del vendor).

import { describe, it, expect } from "vitest";
import { validateSlope } from "../../lib/calculations/geotech/validate";
import { slopeDefaults, type SlopeInputs } from "../../data/defaults";

const withStrata = (patch: Partial<SlopeInputs["strata"][0]>, extra?: Partial<SlopeInputs>): SlopeInputs => ({
  ...slopeDefaults,
  strata: [{ ...slopeDefaults.strata[0], ...patch }],
  ...extra,
});

describe("validateSlope — invariantes por estrato", () => {
  it("acepta los defaults", () => {
    expect(validateSlope(slopeDefaults).valid).toBe(true);
  });

  it("rechaza un estrato con espesor 0 (evita 'same material depth' del motor)", () => {
    // Dos estratos para que la suma siga cubriendo H (aísla el invariante nuevo).
    const inputs: SlopeInputs = {
      ...slopeDefaults,
      strata: [
        { ...slopeDefaults.strata[0], thickness: 20 },
        { ...slopeDefaults.strata[0], id: 2, thickness: 0 },
      ],
    };
    const v = validateSlope(inputs);
    expect(v.valid).toBe(false);
    expect(v.error).toContain("estrato 2");
    expect(v.error).toContain("espesor 0");
  });

  it("rechaza γ fuera del rango [1,50] del motor (0 y 60)", () => {
    for (const gamma of [0, 60]) {
      const v = validateSlope(withStrata({ gamma }));
      expect(v.valid).toBe(false);
      expect(v.error).toContain("peso específico");
    }
  });

  it("acepta γ en los bordes del rango (1 y 50)", () => {
    expect(validateSlope(withStrata({ gamma: 1 })).valid).toBe(true);
    expect(validateSlope(withStrata({ gamma: 50 })).valid).toBe(true);
  });

  it("sigue aceptando NF a 0 m (coronación) — caso que el motor ya no ignora", () => {
    expect(validateSlope({ ...slopeDefaults, waterTableDepth: 0 }).valid).toBe(true);
  });
});
