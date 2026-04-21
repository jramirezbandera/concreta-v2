import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UnitNumberInput } from "../../components/units/UnitNumberInput";
import { UnitSystemProvider } from "../../lib/units/UnitSystemProvider";

function renderInput(
  value: number,
  onChange: (n: number) => void,
  extra: Partial<React.ComponentProps<typeof UnitNumberInput>> = {}
) {
  return render(
    <UnitSystemProvider>
      <UnitNumberInput
        id="test-input"
        label="N"
        value={value}
        onChange={onChange}
        quantity="force"
        {...extra}
      />
    </UnitSystemProvider>
  );
}

describe("UnitNumberInput — display formatting", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows SI value verbatim with default precision in SI mode", () => {
    renderInput(80, () => {});
    const input = screen.getByLabelText("N (kN)") as HTMLInputElement;
    expect(input.value).toBe("80.00");
  });

  it("shows técnico-converted value with técnico precision when system=tecnico", () => {
    window.localStorage.setItem("unitSystem", "tecnico");
    renderInput(80, () => {});
    const input = screen.getByLabelText("N (Tn)") as HTMLInputElement;
    expect(input.value).toBe("8.16");
  });

  it("respects precision override", () => {
    renderInput(80, () => {}, { precision: 0 });
    const input = screen.getByLabelText("N (kN)") as HTMLInputElement;
    expect(input.value).toBe("80");
  });

  it("renders unit '—' as empty suffix", () => {
    render(
      <UnitSystemProvider>
        <UnitNumberInput
          id="ratio"
          label="ψ"
          unit="—"
          value={0.3}
          onChange={() => {}}
        />
      </UnitSystemProvider>
    );
    const input = screen.getByLabelText("ψ ()") as HTMLInputElement;
    expect(input.value).toBe("0.3");
  });
});

describe("UnitNumberInput — typing emits SI", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("typing display value in técnico mode emits SI value via onChange", async () => {
    window.localStorage.setItem("unitSystem", "tecnico");
    let captured = 0;
    renderInput(0, (n) => { captured = n; });
    const user = userEvent.setup();
    const input = screen.getByLabelText("N (Tn)") as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "10");
    // 10 Tn → 10 / 0.101971621 ≈ 98.0665 kN
    expect(captured).toBeCloseTo(10 / 0.101971621, 6);
  });

  it("accepts comma decimal separator in técnico mode", async () => {
    window.localStorage.setItem("unitSystem", "tecnico");
    let captured = 0;
    renderInput(0, (n) => { captured = n; });
    const user = userEvent.setup();
    const input = screen.getByLabelText("N (Tn)") as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "1,5");
    expect(captured).toBeCloseTo(1.5 / 0.101971621, 6);
  });

  it("invalid input does not emit (state holds previous SI value)", async () => {
    let count = 0;
    renderInput(80, () => { count += 1; });
    const user = userEvent.setup();
    const input = screen.getByLabelText("N (kN)") as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "abc");
    expect(count).toBe(0);
  });

  it("integer mode strips non-digits and emits integers", async () => {
    let captured = 0;
    render(
      <UnitSystemProvider>
        <UnitNumberInput
          id="nbars"
          label="n"
          value={3}
          integer
          onChange={(n) => { captured = n; }}
        />
      </UnitSystemProvider>
    );
    const user = userEvent.setup();
    const input = screen.getByLabelText("n ()") as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "4a2");
    expect(captured).toBe(42);
  });
});

describe("UnitNumberInput — system switch", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("switching system reformats input from SI value (no state change emitted)", () => {
    let count = 0;
    const { rerender } = render(
      <UnitSystemProvider>
        <UnitNumberInput
          id="N"
          label="N"
          value={98.0665}
          quantity="force"
          onChange={() => { count += 1; }}
        />
      </UnitSystemProvider>
    );
    const inputSi = screen.getByLabelText("N (kN)") as HTMLInputElement;
    expect(inputSi.value).toBe("98.07");
    expect(count).toBe(0);

    act(() => {
      window.localStorage.setItem("unitSystem", "tecnico");
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "unitSystem",
          newValue: "tecnico",
        })
      );
    });
    rerender(
      <UnitSystemProvider>
        <UnitNumberInput
          id="N"
          label="N"
          value={98.0665}
          quantity="force"
          onChange={() => { count += 1; }}
        />
      </UnitSystemProvider>
    );
    const inputTec = screen.getByLabelText("N (Tn)") as HTMLInputElement;
    expect(inputTec.value).toBe("10.00");
    expect(count).toBe(0);
  });
});

describe("UnitNumberInput — onBlur normalization", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("blur with invalid input restores formatted SI value", async () => {
    renderInput(80, () => {});
    const user = userEvent.setup();
    const input = screen.getByLabelText("N (kN)") as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "abc");
    expect(input.value).toBe("abc");
    await user.tab();
    expect(input.value).toBe("80.00");
  });

  it("blur with valid input renormalizes to canonical precision", async () => {
    let captured = 0;
    renderInput(0, (n) => { captured = n; });
    const user = userEvent.setup();
    const input = screen.getByLabelText("N (kN)") as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "12.345");
    await user.tab();
    expect(captured).toBeCloseTo(12.345, 9);
    expect(input.value).toBe("12.35");
  });
});
