import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RawNumberInput } from "../../components/units/RawNumberInput";
import { UnitSystemProvider } from "../../lib/units/UnitSystemProvider";

function renderRaw(
  value: number,
  onChange: (n: number) => void,
  extra: Partial<React.ComponentProps<typeof RawNumberInput>> = {}
) {
  return render(
    <UnitSystemProvider>
      <RawNumberInput value={value} onChange={onChange} ariaLabel="campo" {...extra} />
    </UnitSystemProvider>
  );
}

describe("RawNumberInput — raw numeric entry (no quantity)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows the raw value verbatim", () => {
    renderRaw(5, () => {});
    const input = screen.getByLabelText("campo") as HTMLInputElement;
    expect(input.value).toBe("5");
  });

  it("uses inputMode=decimal (mobile numeric keypad, no auto-zoom trigger)", () => {
    renderRaw(5, () => {});
    const input = screen.getByLabelText("campo") as HTMLInputElement;
    expect(input.getAttribute("inputmode")).toBe("decimal");
    expect(input.getAttribute("type")).toBe("text");
  });

  it("accepts a decimal comma and emits the dot value", async () => {
    let captured = -1;
    renderRaw(0, (n) => { captured = n; });
    const user = userEvent.setup();
    const input = screen.getByLabelText("campo") as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "3,5");
    expect(captured).toBeCloseTo(3.5, 9);
  });

  it("can be emptied: does not emit and leaves the field blank while typing", async () => {
    let count = 0;
    renderRaw(80, () => { count += 1; });
    const user = userEvent.setup();
    const input = screen.getByLabelText("campo") as HTMLInputElement;
    await user.clear(input);
    expect(input.value).toBe("");
    expect(count).toBe(0); // empty string does not parse → parent keeps last value
  });

  it("restores the last valid value on blur when left empty/invalid", async () => {
    renderRaw(80, () => {});
    const user = userEvent.setup();
    const input = screen.getByLabelText("campo") as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "abc");
    expect(input.value).toBe("abc");
    await user.tab();
    expect(input.value).toBe("80");
  });

  it("integer mode strips non-digits and emits integers", async () => {
    let captured = -1;
    renderRaw(3, (n) => { captured = n; }, { integer: true });
    const user = userEvent.setup();
    const input = screen.getByLabelText("campo") as HTMLInputElement;
    expect(input.getAttribute("inputmode")).toBe("numeric");
    await user.clear(input);
    await user.type(input, "4a2");
    expect(captured).toBe(42);
  });

  it("renders the unit suffix chip", () => {
    renderRaw(5, () => {}, { unit: "m" });
    expect(screen.getByText("m")).toBeInTheDocument();
  });

  it("clamp coerces to [min,max] on blur only (not mid-typing)", async () => {
    let captured = -1;
    renderRaw(1, (n) => { captured = n; }, { min: 0.1, clamp: true });
    const user = userEvent.setup();
    const input = screen.getByLabelText("campo") as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "0"); // below min
    expect(captured).toBe(0);    // emitted verbatim while typing
    await user.tab();
    expect(captured).toBe(0.1);  // snapped on blur
    expect(input.value).toBe("0.1");
  });
});
