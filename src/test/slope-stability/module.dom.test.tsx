// Smoke test del módulo (jsdom). Verifica el render inicial sin tocar el worker
// (Pyodide no arranca en jsdom; el worker SOLO se crea al pulsar Calcular, que
// este test no dispara). Comprueba el estado pre-cálculo: botón Calcular, hint y
// que el SVG de la sección se pinta en vivo desde la geometría de entrada.

import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { HelmetProvider } from "react-helmet-async";
import { ThemeProvider } from "../../lib/theme/ThemeProvider";
import { UnitSystemProvider } from "../../lib/units/UnitSystemProvider";
import { SlopeStabilityModule } from "../../features/slope-stability";

function renderModule() {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <ThemeProvider>
          <UnitSystemProvider>
            <SlopeStabilityModule />
          </UnitSystemProvider>
        </ThemeProvider>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

describe("SlopeStabilityModule — smoke (pre-cálculo)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("monta con el botón Calcular y el hint pre-cálculo", () => {
    renderModule();
    expect(screen.getByRole("button", { name: /Calcular/i })).toBeInTheDocument();
    // El hint pre-cálculo: "Pulsa Calcular para el factor de seguridad." El nodo
    // de texto directo del <p> excluye el <span>Calcular</span> (RTL getNodeText).
    expect(screen.getByText(/para el factor de seguridad/i)).toBeInTheDocument();
  });

  it("dibuja la geometría en vivo (al menos un <svg>) sin calcular", () => {
    const { container } = renderModule();
    // El lienzo + el clon oculto del PDF → varios SVG presentes desde el inicio.
    expect(container.querySelectorAll("svg").length).toBeGreaterThan(0);
  });
});
