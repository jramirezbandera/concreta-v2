// El macizo se teclea en tres casillas que tienen que cuadrar (2026-09-25):
// ex (barra → borde de placa), mX (placa → cara del macizo) y cX (barra
// exterior → cara). El «pilar 1» del usuario movió las barras con ex y cX se
// quedó donde estaba: los anclajes calculaban un macizo de 600 y el dibujo
// enseñaba uno de 700. Ahora el panel escribe las tres a la vez.

import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { AnchorPlateInputsPanel } from '../../../features/anchor-plate/AnchorPlateInputs';
import { validateAnchorPlate } from '../../../lib/calculations/anchorPlate';
import { UnitSystemProvider } from '../../../lib/units/UnitSystemProvider';
import { anchorPlateDefaults, type AnchorPlateInputs } from '../../../data/defaults';

function Arnes({ inicial }: { inicial: AnchorPlateInputs }) {
  const [state, set] = useState(inicial);
  return (
    <UnitSystemProvider>
      <AnchorPlateInputsPanel
        state={state}
        setField={(k, v) => set((prev) => ({ ...prev, [k]: v }))}
        warnings={validateAnchorPlate(state)}
      />
    </UnitSystemProvider>
  );
}

const valor = (id: string) => (document.getElementById(id) as HTMLInputElement).value;
const teclear = (id: string, v: string) =>
  fireEvent.change(document.getElementById(id) as HTMLInputElement, { target: { value: v } });

describe('AnchorPlateInputsPanel — ex, mX y cX se mueven juntos', () => {
  it('mover las barras (ex) arrastra cX con el macizo quieto', () => {
    render(<Arnes inicial={anchorPlateDefaults} />);   // 40 + 150 = 190
    teclear('ap-bar_edge_x', '100');
    expect(valor('ap-pedestal_cX')).toBe('250');
    expect(valor('ap-plate_margin_x')).toBe('150');
  });

  it('agrandar el macizo por cX mueve su vuelo mX', () => {
    render(<Arnes inicial={anchorPlateDefaults} />);
    teclear('ap-pedestal_cX', '300');
    expect(valor('ap-plate_margin_x')).toBe('260');
    expect(valor('ap-bar_edge_x')).toBe('40');
  });

  it('agrandar el vuelo mY mueve cY', () => {
    render(<Arnes inicial={anchorPlateDefaults} />);
    teclear('ap-plate_margin_y', '200');
    expect(valor('ap-pedestal_cY')).toBe('240');
  });

  it('un estado que no cuadra enseña el aviso bajo cX, y se va al tocar cualquiera de las tres', () => {
    const pilar1 = {
      ...anchorPlateDefaults, bar_edge_x: 100, plate_margin_x: 150,
      pedestal_cX: 200, pedestal_cX1: 200, pedestal_cX2: 200,
    };
    render(<Arnes inicial={pilar1} />);
    expect(screen.getByText(/El macizo no cuadra en x/)).toBeTruthy();
    teclear('ap-plate_margin_x', '100');
    expect(valor('ap-pedestal_cX')).toBe('200');
    expect(screen.queryByText(/El macizo no cuadra/)).toBeNull();
  });

  it('la casilla cX dice de qué barra se mide', () => {
    render(<Arnes inicial={anchorPlateDefaults} />);
    expect(screen.getAllByText('barra exterior→cara').length).toBe(2);   // cX y cY
  });
});
