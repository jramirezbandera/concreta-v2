import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "../../lib/theme/ThemeProvider";
import { useTheme } from "../../lib/theme/useTheme";

const KEY = "concreta-theme";

function Probe() {
  const { theme, setTheme, toggleTheme } = useTheme();
  return (
    <>
      <span data-testid="theme">{theme}</span>
      <button onClick={() => setTheme("dark")}>set dark</button>
      <button onClick={() => setTheme("light")}>set light</button>
      <button onClick={() => toggleTheme()}>toggle</button>
    </>
  );
}

// matchMedia is not implemented in jsdom — inject a controllable mock.
function mockMatchMedia(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return false;
    },
  })) as unknown as typeof window.matchMedia;
}

describe("theme / provider", () => {
  let originalMM: typeof window.matchMedia | undefined;

  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
    originalMM = window.matchMedia;
    // default: no matchMedia (jsdom baseline) → OS resolves to light
    delete (window as unknown as { matchMedia?: unknown }).matchMedia;
  });

  afterEach(() => {
    if (originalMM) window.matchMedia = originalMM;
    vi.restoreAllMocks();
  });

  it("defaults to 'light' when nothing stored and OS is not dark", () => {
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByTestId("theme").textContent).toBe("light");
  });

  it("reads stored 'dark' on mount", () => {
    window.localStorage.setItem(KEY, "dark");
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByTestId("theme").textContent).toBe("dark");
  });

  it("reads stored 'light' on mount", () => {
    window.localStorage.setItem(KEY, "light");
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByTestId("theme").textContent).toBe("light");
  });

  it("falls back to 'light' on malformed stored value", () => {
    window.localStorage.setItem(KEY, "garbage");
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByTestId("theme").textContent).toBe("light");
  });

  it("reads the pre-set data-theme attribute as source of truth (no flash)", () => {
    // pre-paint script set this; localStorage empty
    document.documentElement.dataset.theme = "dark";
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByTestId("theme").textContent).toBe("dark");
  });

  it("follows OS dark when nothing stored and no pre-set attribute", () => {
    mockMatchMedia(true);
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByTestId("theme").textContent).toBe("dark");
  });

  it("stored preference wins over OS", () => {
    mockMatchMedia(true); // OS dark
    window.localStorage.setItem(KEY, "light"); // but user picked light
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByTestId("theme").textContent).toBe("light");
  });

  it("setTheme writes localStorage AND sets html[data-theme]", () => {
    render(<ThemeProvider><Probe /></ThemeProvider>);
    act(() => {
      screen.getByText("set dark").click();
    });
    expect(screen.getByTestId("theme").textContent).toBe("dark");
    expect(window.localStorage.getItem(KEY)).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("setTheme updates the <meta name=theme-color> content", () => {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    meta.setAttribute("content", "#ffffff");
    document.head.appendChild(meta);

    render(<ThemeProvider><Probe /></ThemeProvider>);
    act(() => {
      screen.getByText("set dark").click();
    });
    expect(meta.getAttribute("content")).toBe("#0b1220");
    act(() => {
      screen.getByText("set light").click();
    });
    expect(meta.getAttribute("content")).toBe("#ffffff");
    meta.remove();
  });

  it("toggleTheme flips and persists", () => {
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByTestId("theme").textContent).toBe("light");
    act(() => {
      screen.getByText("toggle").click();
    });
    expect(screen.getByTestId("theme").textContent).toBe("dark");
    expect(window.localStorage.getItem(KEY)).toBe("dark");
    act(() => {
      screen.getByText("toggle").click();
    });
    expect(screen.getByTestId("theme").textContent).toBe("light");
  });

  it("syncs across tabs via the storage event", () => {
    render(<ThemeProvider><Probe /></ThemeProvider>);
    act(() => {
      fireEvent(
        window,
        new StorageEvent("storage", { key: KEY, newValue: "dark" })
      );
    });
    expect(screen.getByTestId("theme").textContent).toBe("dark");
  });

  it("does not crash when localStorage.setItem throws; UI still updates", () => {
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(() =>
      act(() => {
        screen.getByText("set dark").click();
      })
    ).not.toThrow();
    expect(screen.getByTestId("theme").textContent).toBe("dark");
    spy.mockRestore();
  });

  it("useTheme throws when used outside the provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/ThemeProvider/);
    spy.mockRestore();
  });
});
