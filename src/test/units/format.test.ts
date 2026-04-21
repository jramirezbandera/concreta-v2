import { describe, it, expect } from "vitest";
import {
  formatNumber,
  formatQuantity,
  getPrecision,
  getUnitLabel,
  parseQuantity,
} from "../../lib/units/format";

describe("units / format — labels and precision per system", () => {
  it("getUnitLabel returns SI labels in SI", () => {
    expect(getUnitLabel("force", "si")).toBe("kN");
    expect(getUnitLabel("moment", "si")).toBe("kNm");
    expect(getUnitLabel("stress", "si")).toBe("N/mm²");
    expect(getUnitLabel("linearLoad", "si")).toBe("kN/m");
    expect(getUnitLabel("areaLoad", "si")).toBe("kN/m²");
  });
  it("getUnitLabel returns técnico labels in técnico", () => {
    expect(getUnitLabel("force", "tecnico")).toBe("Tn");
    expect(getUnitLabel("moment", "tecnico")).toBe("mt");
    expect(getUnitLabel("stress", "tecnico")).toBe("kg/cm²");
    expect(getUnitLabel("linearLoad", "tecnico")).toBe("kg/m");
    expect(getUnitLabel("areaLoad", "tecnico")).toBe("kg/m²");
  });
  it("getPrecision differs by quantity in técnico", () => {
    expect(getPrecision("stress", "tecnico")).toBe(1);
    expect(getPrecision("force", "tecnico")).toBe(2);
    expect(getPrecision("moment", "tecnico")).toBe(2);
    expect(getPrecision("linearLoad", "tecnico")).toBe(0);
  });
});

describe("units / format — formatQuantity", () => {
  it("formats with unit suffix by default", () => {
    expect(formatQuantity(80, "force", "si")).toBe("80.00 kN");
    expect(formatQuantity(80, "force", "tecnico")).toBe("8.16 Tn");
  });
  it("respects precision override", () => {
    expect(formatQuantity(80, "force", "si", { precision: 0 })).toBe("80 kN");
    expect(
      formatQuantity(80, "force", "tecnico", { precision: 4 })
    ).toBe("8.1577 Tn");
  });
  it("withUnit:false returns numeric only", () => {
    expect(formatQuantity(80, "force", "si", { withUnit: false })).toBe(
      "80.00"
    );
  });
  it("formatNumber is shorthand for withUnit:false", () => {
    expect(formatNumber(80, "force", "si")).toBe("80.00");
    expect(formatNumber(80, "force", "tecnico", 1)).toBe("8.2");
  });
});

describe("units / format — non-finite handling", () => {
  it("NaN → '—'", () => {
    expect(formatQuantity(Number.NaN, "stress", "tecnico")).toBe("—");
  });
  it("+Infinity → '∞'", () => {
    expect(formatQuantity(Number.POSITIVE_INFINITY, "force", "si")).toBe(
      "∞"
    );
  });
  it("-Infinity → '-∞'", () => {
    expect(formatQuantity(Number.NEGATIVE_INFINITY, "force", "si")).toBe(
      "-∞"
    );
  });
});

describe("units / format — no thousands separator", () => {
  it("large numbers do not get commas", () => {
    expect(formatQuantity(1234567.89, "force", "si", { precision: 1 })).toBe(
      "1234567.9 kN"
    );
  });
});

describe("units / format — parseQuantity", () => {
  it("accepts both comma and dot decimal separators", () => {
    expect(parseQuantity("0.82", "moment", "tecnico")).toBeCloseTo(
      0.82 / 0.101971621,
      9
    );
    expect(parseQuantity("0,82", "moment", "tecnico")).toBeCloseTo(
      0.82 / 0.101971621,
      9
    );
  });
  it("identity in SI mode", () => {
    expect(parseQuantity("12.5", "force", "si")).toBe(12.5);
  });
  it("rejects scientific notation", () => {
    expect(parseQuantity("1e3", "force", "si")).toBeNull();
    expect(parseQuantity("2.5E-2", "stress", "si")).toBeNull();
  });
  it("rejects embedded units / letters", () => {
    expect(parseQuantity("8 kN", "force", "si")).toBeNull();
    expect(parseQuantity("abc", "force", "si")).toBeNull();
  });
  it("rejects negatives", () => {
    expect(parseQuantity("-5", "force", "si")).toBeNull();
  });
  it("rejects empty / whitespace", () => {
    expect(parseQuantity("", "force", "si")).toBeNull();
    expect(parseQuantity("   ", "force", "si")).toBeNull();
  });
  it("zero is valid", () => {
    expect(parseQuantity("0", "force", "tecnico")).toBe(0);
  });
});
