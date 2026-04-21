import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import {
  UnitSystemProvider,
} from "../../lib/units/UnitSystemProvider";
import { useUnitSystem } from "../../lib/units/useUnitSystem";

function Probe() {
  const { system, setSystem, toggleDisabled } = useUnitSystem();
  return (
    <>
      <span data-testid="system">{system}</span>
      <span data-testid="disabled">{String(toggleDisabled)}</span>
      <button onClick={() => setSystem("tecnico")}>set tec</button>
      <button onClick={() => setSystem("si")}>set si</button>
    </>
  );
}

describe("units / provider — localStorage behavior", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to 'si' when nothing is stored", () => {
    render(
      <UnitSystemProvider>
        <Probe />
      </UnitSystemProvider>
    );
    expect(screen.getByTestId("system").textContent).toBe("si");
  });

  it("reads stored 'tecnico' on mount", () => {
    window.localStorage.setItem("unitSystem", "tecnico");
    render(
      <UnitSystemProvider>
        <Probe />
      </UnitSystemProvider>
    );
    expect(screen.getByTestId("system").textContent).toBe("tecnico");
  });

  it("falls back to 'si' on malformed value", () => {
    window.localStorage.setItem("unitSystem", "garbage");
    render(
      <UnitSystemProvider>
        <Probe />
      </UnitSystemProvider>
    );
    expect(screen.getByTestId("system").textContent).toBe("si");
  });

  it("setSystem writes to localStorage", () => {
    render(
      <UnitSystemProvider>
        <Probe />
      </UnitSystemProvider>
    );
    act(() => {
      screen.getByText("set tec").click();
    });
    expect(window.localStorage.getItem("unitSystem")).toBe("tecnico");
    expect(screen.getByTestId("system").textContent).toBe("tecnico");
  });
});

describe("units / provider — cross-tab storage event", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("updates when another tab writes 'tecnico'", () => {
    render(
      <UnitSystemProvider>
        <Probe />
      </UnitSystemProvider>
    );
    expect(screen.getByTestId("system").textContent).toBe("si");
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "unitSystem",
          newValue: "tecnico",
          oldValue: "si",
        })
      );
    });
    expect(screen.getByTestId("system").textContent).toBe("tecnico");
  });

  it("ignores unrelated keys", () => {
    render(
      <UnitSystemProvider>
        <Probe />
      </UnitSystemProvider>
    );
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "other",
          newValue: "tecnico",
        })
      );
    });
    expect(screen.getByTestId("system").textContent).toBe("si");
  });

  it("storage clear (newValue=null) resets to 'si'", () => {
    window.localStorage.setItem("unitSystem", "tecnico");
    render(
      <UnitSystemProvider>
        <Probe />
      </UnitSystemProvider>
    );
    expect(screen.getByTestId("system").textContent).toBe("tecnico");
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "unitSystem",
          newValue: null,
        })
      );
    });
    expect(screen.getByTestId("system").textContent).toBe("si");
  });
});
