// FEM 2D — el factor ×N de la deformada es INVARIANTE al zoom.
//
// Regresión de la cámara. `DeformedLayer` rotula la amplificación visual como
// (px por metro de desplazamiento) / (px por metro de geometría). La segunda
// magnitud salía de sx(1)-sx(0), que con la cámara ya viene multiplicada por k:
// ampliar ×3 habría cambiado el rótulo de ×250 a ×83 sin que la deformada real
// cambiase. Un número de CÁLCULO no puede moverse al girar la rueda: el zoom es
// cámara, no un cambio del modelo.
//
// Por eso la capa recibe `basePxPerM` (escala del encuadre base, k=1).

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Fem2DCanvas } from '../../features/fem2d/Fem2DCanvas';
import { analyzeFem2D } from '../../features/fem2d/pipeline';
import { FEM2D_TEMPLATES } from '../../features/fem2d/templates';
import { IDENTITY_VIEW, type CanvasView2D } from '../../lib/canvas/transform';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';

const portal = FEM2D_TEMPLATES['portal-frame'].build(FEM2D_TEMPLATES['portal-frame'].defaults());
const result = analyzeFem2D(portal);

function ampLabelAt(canvasView: CanvasView2D): string | null {
  const { container, unmount } = render(
    <UnitSystemProvider>
      <Fem2DCanvas
        model={portal}
        checks={result.checks}
        view="def"
        combo="env:ELU"
        elements={result.elements}
        width={720}
        height={460}
        mode="screen"
        canvasView={canvasView}
        setCanvasView={() => {}}
      />
    </UnitSystemProvider>,
  );
  const text = Array.from(container.querySelectorAll('text'))
    .map((t) => t.textContent ?? '')
    .find((t) => t.includes('δmax') && t.includes('×')) ?? null;
  unmount();
  return text;
}

describe('amplificación de la deformada bajo zoom', () => {
  it('el modelo de prueba produce una deformada con rótulo ×N', () => {
    const label = ampLabelAt(IDENTITY_VIEW);
    expect(label, 'el pórtico debe deformarse de forma apreciable').toBeTruthy();
    expect(label).toMatch(/×\d+/);
  });

  it('el ×N NO cambia al ampliar (mismo modelo, distinta cámara)', () => {
    const atFit = ampLabelAt(IDENTITY_VIEW);
    const atZoom3 = ampLabelAt({ k: 3, tx: -160, ty: -120 });
    const atZoom8 = ampLabelAt({ k: 8, tx: -400, ty: -300 });

    expect(atZoom3).toBe(atFit);
    expect(atZoom8).toBe(atFit);
  });
});
