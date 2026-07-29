// Alzado SVG — el dintel de un hueco PASANTE no invade la planta de arriba.
//
// Es el defecto visual que motiva el tipo: fingir un hueco de forjado a
// forjado con una puerta de altura H dejaba el dintel dibujado POR ENCIMA del
// borde superior del muro, es decir, pintado sobre el forjado y sobre la
// planta siguiente. En el pasante el dintel va DENTRO del hueco, pegado al
// forjado, que es donde está en la obra.

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MasonryWallsSVG } from '../../../features/masonry-walls/MasonryWallsSVG';
import {
  blankMasonryState,
  calcularEdificio,
  type Hueco,
  type MasonryWallState,
  type PlantaResult,
} from '../../../lib/calculations/masonryWalls';
import { UnitSystemProvider } from '../../../lib/units/UnitSystemProvider';

function stateConHueco(hueco: Hueco): MasonryWallState {
  const s = blankMasonryState(); // 1 planta, H = 3000, sin huecos
  return { ...s, plantas: [{ ...s.plantas[0], huecos: [hueco] }] };
}

function renderSvg(state: MasonryWallState) {
  const r = calcularEdificio(state);
  const plantasCalc: PlantaResult[] = r.invalid ? [] : r.plantas;
  const noop = () => {};
  return render(
    <UnitSystemProvider>
      <MasonryWallsSVG
        state={state}
        plantasCalc={plantasCalc}
        critico={null}
        mostrarMapa={false}
        selectedHueco={null}
        selectedPlantaIdx={0}
        selectedMachonKey={null}
        onSelectHueco={noop}
        onSelectPlanta={noop}
        onSelectMachon={noop}
        forceWidth={760}
        forceHeight={600}
      />
    </UnitSystemProvider>,
  );
}

/** [rect del hueco, rect del dintel] del grupo clicable de ese hueco. */
function rectsDelHueco(nombre: RegExp): { hueco: SVGRectElement; dintel: SVGRectElement } {
  const g = screen.getByRole('button', { name: nombre });
  const rects = g.querySelectorAll('rect');
  if (rects.length < 2) throw new Error('el grupo del hueco no trae hueco + dintel');
  return { hueco: rects[0] as SVGRectElement, dintel: rects[1] as SVGRectElement };
}

const y = (el: SVGRectElement) => parseFloat(el.getAttribute('y') ?? 'NaN');
const alto = (el: SVGRectElement) => parseFloat(el.getAttribute('height') ?? 'NaN');

describe('MasonryWallsSVG — dintel del hueco pasante', () => {
  it('pasante: el dintel queda DENTRO del hueco, no por encima del muro', () => {
    renderSvg(stateConHueco({ id: 'h1', x: 1000, y: 0, w: 900, h: 3000, tipo: 'pasante' }));
    const { hueco, dintel } = rectsDelHueco(/Pasante 1/);
    expect(y(dintel)).toBe(y(hueco));
    expect(y(dintel) + alto(dintel)).toBeLessThanOrEqual(y(hueco) + alto(hueco));
  });

  it('puerta con muro encima: el dintel sigue dibujándose sobre el hueco', () => {
    renderSvg(stateConHueco({ id: 'h1', x: 1000, y: 0, w: 900, h: 2100, tipo: 'puerta' }));
    const { hueco, dintel } = rectsDelHueco(/Puerta 1/);
    expect(y(dintel)).toBeLessThan(y(hueco));
  });

  it('pasante: la altura dibujada sale de H, no del `h` almacenado', () => {
    // Mismo dato obsoleto que tolera el motor: el hueco se dibuja a altura
    // completa igualmente, así que lienzo y cálculo cuentan lo mismo.
    const geom = (h: Hueco) => {
      const { unmount } = renderSvg(stateConHueco(h));
      const r = rectsDelHueco(/Pasante 1/);
      const out = { y: y(r.hueco), alto: alto(r.hueco) };
      unmount(); // un solo alzado montado a la vez: si no, "Pasante 1" sale dos veces
      return out;
    };
    const obsoleto = geom({ id: 'h1', x: 1000, y: 900, w: 900, h: 1200, tipo: 'pasante' });
    const limpio = geom({ id: 'h1', x: 1000, y: 0, w: 900, h: 3000, tipo: 'pasante' });
    expect(obsoleto).toEqual(limpio);
  });
});
