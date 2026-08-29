// Feedback del traspaso muro → taludes en el panel de inputs.
// Run: bun test src/test/slope-stability/rigidBlockBanner.dom.test.tsx
//
// Sin este banner el traspaso era ilegible: el usuario aterrizaba ante un talud
// a 85° sin saber por qué, con una restricción invisible sobre los círculos
// (el bloque rígido) y sin manera de quitarla si después quería calcular un
// talud normal. El banner explica el modelo, señala el estrato a revisar y da
// la salida ("Quitar bloque rígido").

import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SlopeInputs } from "../../features/slope-stability/SlopeInputs";
import { UnitSystemProvider } from "../../lib/units/UnitSystemProvider";
import { slopeDefaults, type SlopeInputs as SlopeInputsModel } from "../../data/defaults";

const VALID = { valid: true } as const;

function renderPanel(model: SlopeInputsModel, onChange = vi.fn()) {
  render(
    <UnitSystemProvider>
      <SlopeInputs value={model} onChange={onChange} validation={VALID} />
    </UnitSystemProvider>,
  );
  return onChange;
}

const withBlock: SlopeInputsModel = {
  ...slopeDefaults,
  angle: 85,
  context: "global-foundation",
  rigidBlock: { padHeel: 1.5, padToe: 0.6, depth: 3.5 },
};

describe("banner del bloque rígido", () => {
  it("no aparece en un talud normal (sin rigidBlock)", () => {
    renderPanel(slopeDefaults);
    expect(screen.queryByText(/sólido rígido/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /quitar bloque rígido/i })).toBeNull();
  });

  it("con rigidBlock explica el modelo y muestra la huella con sus valores", () => {
    renderPanel(withBlock);
    expect(screen.getByText(/Modelo de muro — sólido rígido/)).toBeInTheDocument();
    // Los tres valores de la huella, tal y como viajaron en el modelo.
    const banner = screen.getByText(/bajo la huella del muro/i).closest("div")!;
    expect(banner.textContent).toContain("1.50");
    expect(banner.textContent).toContain("0.60");
    expect(banner.textContent).toContain("3.50");
    // Y el aviso de revisar el estrato de cimentación.
    expect(screen.getByText(/último estrato/i)).toBeInTheDocument();
  });

  it("«Quitar bloque rígido» emite el modelo SIN el bloque, sin tocar lo demás", () => {
    const onChange = renderPanel(withBlock);
    fireEvent.click(screen.getByRole("button", { name: /quitar bloque rígido/i }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as SlopeInputsModel;
    expect(next.rigidBlock).toBeUndefined();
    // El resto del modelo queda intacto (sigue siendo el talud a 85°).
    expect(next.angle).toBe(85);
    expect(next.context).toBe("global-foundation");
    expect(next.strata).toEqual(withBlock.strata);
  });
});
