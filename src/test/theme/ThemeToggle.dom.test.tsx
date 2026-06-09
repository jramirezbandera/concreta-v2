import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { ThemeProvider } from "../../lib/theme/ThemeProvider";
import { ThemeToggle } from "../../components/theme/ThemeToggle";

describe("ThemeToggle", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
    delete (window as unknown as { matchMedia?: unknown }).matchMedia;
  });

  afterEach(() => {
    delete document.documentElement.dataset.theme;
  });

  function setup() {
    return render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );
  }

  it("renders an accessible button with an aria-label", () => {
    setup();
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-label")).toMatch(/Tema/i);
  });

  it("shows the moon (switch-to-dark) while in light mode", () => {
    setup();
    // light default → label invites switching to dark
    expect(screen.getByRole("button").getAttribute("aria-label")).toMatch(
      /Cambiar a tema oscuro/i
    );
  });

  it("flips to dark on click and offers switching back to light", () => {
    setup();
    act(() => {
      screen.getByRole("button").click();
    });
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByRole("button").getAttribute("aria-label")).toMatch(
      /Cambiar a tema claro/i
    );
  });
});
