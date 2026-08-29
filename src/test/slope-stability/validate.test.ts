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

  // ── Bloque rígido (muro traspasado desde otro módulo) ────────────────────
  // Sólo se validan los invariantes RELATIVOS: lo absoluto (contra top_x /
  // external_length) lo clampea el motor, y bloquear el módulo aquí por algo
  // que se corrige solo sería peor.

  it("acepta un modelo SIN bloque rígido (taludes usado por sí solo)", () => {
    expect(validateSlope({ ...slopeDefaults, rigidBlock: undefined }).valid).toBe(true);
  });

  it("acepta un bloque rígido bien formado, con vuelos a cero", () => {
    const v = validateSlope({
      ...slopeDefaults,
      rigidBlock: { padHeel: 0, padToe: 0, depth: 4.5 },
    });
    expect(v.valid).toBe(true);
  });

  it("rechaza vuelos negativos del bloque rígido", () => {
    for (const blk of [
      { padHeel: -1, padToe: 0.5, depth: 4 },
      { padHeel: 0.5, padToe: -1, depth: 4 },
    ]) {
      const v = validateSlope({ ...slopeDefaults, rigidBlock: blk });
      expect(v.valid).toBe(false);
      expect(v.error).toContain("vuelos");
    }
  });

  it("rechaza profundidad no positiva (no habría bloque que excluir)", () => {
    for (const depth of [0, -2]) {
      const v = validateSlope({
        ...slopeDefaults,
        rigidBlock: { padHeel: 0.2, padToe: 0.2, depth },
      });
      expect(v.valid).toBe(false);
      expect(v.error).toContain("profundidad");
    }
  });

  it("rechaza valores no finitos (enlace corrupto)", () => {
    const v = validateSlope({
      ...slopeDefaults,
      rigidBlock: { padHeel: 0.2, padToe: NaN, depth: 4 },
    });
    expect(v.valid).toBe(false);
    expect(v.error).toContain("no numéricos");
  });
});
