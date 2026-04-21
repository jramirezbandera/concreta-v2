import { describe, it, expect } from "vitest";
import { CATALOG } from "../../lib/units/catalog";
import { fromDisplay, toDisplay } from "../../lib/units/convert";
import type { Quantity } from "../../lib/units/types";

const QUANTITIES = Object.keys(CATALOG) as Quantity[];

describe("units / convert — SI mode is identity", () => {
  for (const q of QUANTITIES) {
    it(`${q}: toDisplay returns input unchanged in SI`, () => {
      expect(toDisplay(123.456, q, "si")).toBe(123.456);
      expect(toDisplay(0, q, "si")).toBe(0);
      expect(toDisplay(-7.5, q, "si")).toBe(-7.5);
    });

    it(`${q}: fromDisplay returns input unchanged in SI`, () => {
      expect(fromDisplay(123.456, q, "si")).toBe(123.456);
    });
  }
});

describe("units / convert — técnico round-trip", () => {
  for (const q of QUANTITIES) {
    it(`${q}: fromDisplay(toDisplay(x)) ≈ x within 1e-9 relative`, () => {
      for (const x of [0.001, 1, 12.34, 1234.5678, 9.99e6]) {
        const round = fromDisplay(toDisplay(x, q, "tecnico"), q, "tecnico");
        expect(Math.abs(round - x) / Math.max(Math.abs(x), 1)).toBeLessThan(
          1e-9
        );
      }
    });
  }
});

describe("units / convert — factor table matches catalog", () => {
  it("force = 0.101971621 Tn/kN", () => {
    expect(toDisplay(1, "force", "tecnico")).toBeCloseTo(0.101971621, 9);
  });
  it("moment = 0.101971621 mt/kNm", () => {
    expect(toDisplay(1, "moment", "tecnico")).toBeCloseTo(0.101971621, 9);
  });
  it("linearLoad = 101.971621 (kg/m) / (kN/m)", () => {
    expect(toDisplay(1, "linearLoad", "tecnico")).toBeCloseTo(101.971621, 6);
  });
  it("areaLoad = 101.971621 (kg/m²) / (kN/m²)", () => {
    expect(toDisplay(1, "areaLoad", "tecnico")).toBeCloseTo(101.971621, 6);
  });
  it("stress = 10.1971621 (kg/cm²) / (N/mm²)", () => {
    expect(toDisplay(1, "stress", "tecnico")).toBeCloseTo(10.1971621, 7);
  });
  it("youngModulus = 10.1971621 (kg/cm²) / (N/mm²)", () => {
    expect(toDisplay(1, "youngModulus", "tecnico")).toBeCloseTo(10.1971621, 7);
  });
});

describe("units / convert — zero and negative", () => {
  it("toDisplay(0) === 0 for every quantity in técnico", () => {
    for (const q of QUANTITIES) {
      expect(toDisplay(0, q, "tecnico")).toBe(0);
    }
  });
  it("toDisplay preserves sign in técnico", () => {
    expect(toDisplay(-5, "force", "tecnico")).toBeCloseTo(
      -5 * 0.101971621,
      9
    );
  });
});
