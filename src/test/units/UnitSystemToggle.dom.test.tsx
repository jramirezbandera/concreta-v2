import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UnitSystemProvider } from "../../lib/units/UnitSystemProvider";
import { UnitSystemToggle } from "../../components/units/UnitSystemToggle";

describe("UnitSystemToggle", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders both buttons with SI pressed by default", () => {
    render(
      <UnitSystemProvider>
        <UnitSystemToggle />
      </UnitSystemProvider>
    );
    const si = screen.getByRole("button", { name: "N/mm²" });
    const tec = screen.getByRole("button", { name: "kg/cm²" });
    expect(si.getAttribute("aria-pressed")).toBe("true");
    expect(tec.getAttribute("aria-pressed")).toBe("false");
  });

  it("clicking Téc updates aria-pressed and persists to localStorage", async () => {
    render(
      <UnitSystemProvider>
        <UnitSystemToggle />
      </UnitSystemProvider>
    );
    const tec = screen.getByRole("button", { name: "kg/cm²" });
    await userEvent.setup().click(tec);
    expect(tec.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "N/mm²" }).getAttribute("aria-pressed")).toBe("false");
    expect(window.localStorage.getItem("unitSystem")).toBe("tecnico");
  });

  it("reads stored 'tecnico' on mount", () => {
    window.localStorage.setItem("unitSystem", "tecnico");
    render(
      <UnitSystemProvider>
        <UnitSystemToggle />
      </UnitSystemProvider>
    );
    expect(screen.getByRole("button", { name: "kg/cm²" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "N/mm²" }).getAttribute("aria-pressed")).toBe("false");
  });
});
