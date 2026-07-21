// FEM 2D — cámara del lienzo: gesto (rueda, pan, atajos) y controles.
//
// Los bordes que se fijan aquí son justo los que se rompen callados en un
// refactor: el deltaMode del trackpad, el pinch que no debe llegar al
// navegador, el autoscroll de Windows con el botón central, el guard de los
// atajos mientras se teclea, y el contrato VISTA ≠ EDICIÓN (el zoom sigue vivo
// en readOnly, las herramientas no).

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ZoomControls } from '../../features/fem2d/ZoomControls';
import { Fem2DEditorCanvas } from '../../features/fem2d/Fem2DEditorCanvas';
import { analyzeFem2D } from '../../features/fem2d/pipeline';
import { FEM2D_TEMPLATES } from '../../features/fem2d/templates';
import {
  IDENTITY_VIEW,
  ZOOM_MAX,
  type CanvasView2D,
} from '../../features/fem2d/transform';
import {
  isZoomIntent,
  wheelDeltaToPx,
  wheelZoomFactor,
} from '../../features/fem2d/useCanvasView2D';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';

const portal = FEM2D_TEMPLATES['portal-frame'].build(FEM2D_TEMPLATES['portal-frame'].defaults());
const result = analyzeFem2D(portal);

const W = 720;
const H = 460;

function renderCanvas(opts: { view?: CanvasView2D; readOnly?: boolean } = {}) {
  const setCanvasView = vi.fn<(v: CanvasView2D) => void>();
  const setModel = vi.fn();
  render(
    <UnitSystemProvider>
      <Fem2DEditorCanvas
        model={portal}
        checks={result.checks}
        setModel={setModel}
        selected={null}
        setSelected={vi.fn()}
        tool="select"
        showLabels
        width={W}
        height={H}
        readOnly={opts.readOnly ?? false}
        canvasView={opts.view ?? IDENTITY_VIEW}
        setCanvasView={setCanvasView}
      />
    </UnitSystemProvider>,
  );
  const svg = document.querySelector('svg[role="application"]') as SVGSVGElement;
  return { svg, setCanvasView, setModel };
}

/** La coalescencia publica en el siguiente frame: rAF en jsdom es un timer. */
const nextFrame = () => new Promise((r) => setTimeout(r, 24));

describe('intención de zoom (ratón vs trackpad)', () => {
  it('el pinch de trackpad (ctrlKey) SÍ amplía', () => {
    expect(isZoomIntent({ ctrlKey: true, deltaMode: 0, deltaX: 0, deltaY: 4 })).toBe(true);
  });

  it('la rueda de ratón (deltaMode en líneas) SÍ amplía', () => {
    expect(isZoomIntent({ ctrlKey: false, deltaMode: 1, deltaX: 0, deltaY: 3 })).toBe(true);
  });

  it('la rueda de ratón con saltos grandes en px SÍ amplía', () => {
    expect(isZoomIntent({ ctrlKey: false, deltaMode: 0, deltaX: 0, deltaY: 120 })).toBe(true);
  });

  it('el scroll de dos dedos de trackpad NO amplía', () => {
    // Deltas pequeños y con componente horizontal: el gesto significa desplazar.
    expect(isZoomIntent({ ctrlKey: false, deltaMode: 0, deltaX: 6, deltaY: 12 })).toBe(false);
    expect(isZoomIntent({ ctrlKey: false, deltaMode: 0, deltaX: 0, deltaY: 8 })).toBe(false);
  });
});

describe('normalización del delta de rueda', () => {
  it('una línea vale ~16 px y una página ~400 px', () => {
    expect(wheelDeltaToPx(3, 0)).toBe(3);
    expect(wheelDeltaToPx(3, 1)).toBe(48);
    expect(wheelDeltaToPx(1, 2)).toBe(400);
  });

  it('deltas equivalentes en modos distintos dan factores equivalentes', () => {
    // 48 px sueltos y 3 líneas son el mismo gesto físico: mismo zoom.
    expect(wheelZoomFactor(48, 0)).toBeCloseTo(wheelZoomFactor(3, 1), 10);
  });

  it('arriba amplía y abajo aleja', () => {
    expect(wheelZoomFactor(-100, 0)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100, 0)).toBeLessThan(1);
  });
});

describe('rueda sobre el lienzo', () => {
  it('amplía y consume el evento (preventDefault)', async () => {
    const { svg, setCanvasView } = renderCanvas();
    const ev = new WheelEvent('wheel', {
      deltaY: -120, deltaMode: 0, clientX: 300, clientY: 200, bubbles: true, cancelable: true,
    });
    svg.dispatchEvent(ev);
    await nextFrame();

    expect(ev.defaultPrevented).toBe(true);
    expect(setCanvasView).toHaveBeenCalled();
    const v = setCanvasView.mock.calls.at(-1)![0] as CanvasView2D;
    expect(v.k).toBeGreaterThan(1);
  });

  it('el pinch de trackpad amplía sin dejar que el navegador haga zoom de página', async () => {
    const { svg, setCanvasView } = renderCanvas();
    const ev = new WheelEvent('wheel', {
      deltaY: -10, deltaMode: 0, ctrlKey: true, clientX: 300, clientY: 200, bubbles: true, cancelable: true,
    });
    svg.dispatchEvent(ev);
    await nextFrame();

    expect(ev.defaultPrevented).toBe(true);
    expect(setCanvasView).toHaveBeenCalled();
  });

  it('el scroll de dos dedos no toca la cámara ni bloquea la página', async () => {
    const { svg, setCanvasView } = renderCanvas();
    const ev = new WheelEvent('wheel', {
      deltaY: 10, deltaX: 6, deltaMode: 0, clientX: 300, clientY: 200, bubbles: true, cancelable: true,
    });
    svg.dispatchEvent(ev);
    await nextFrame();

    expect(ev.defaultPrevented).toBe(false);
    expect(setCanvasView).not.toHaveBeenCalled();
  });

  it('en el suelo del zoom, alejar es un no-op silencioso', async () => {
    const { svg, setCanvasView } = renderCanvas();
    svg.dispatchEvent(new WheelEvent('wheel', {
      deltaY: 240, deltaMode: 0, clientX: 300, clientY: 200, bubbles: true, cancelable: true,
    }));
    await nextFrame();
    expect(setCanvasView).not.toHaveBeenCalled();
  });

  it('en el techo del zoom, acercar es un no-op silencioso', async () => {
    const { svg, setCanvasView } = renderCanvas({ view: { k: ZOOM_MAX, tx: -100, ty: -80 } });
    svg.dispatchEvent(new WheelEvent('wheel', {
      deltaY: -240, deltaMode: 0, clientX: 300, clientY: 200, bubbles: true, cancelable: true,
    }));
    await nextFrame();
    expect(setCanvasView).not.toHaveBeenCalled();
  });

  it('varios eventos seguidos se agrupan en UNA publicación por fotograma', async () => {
    const { svg, setCanvasView } = renderCanvas();
    for (let i = 0; i < 6; i++) {
      svg.dispatchEvent(new WheelEvent('wheel', {
        deltaY: -40, deltaMode: 0, clientX: 300, clientY: 200, bubbles: true, cancelable: true,
      }));
    }
    await nextFrame();
    expect(setCanvasView).toHaveBeenCalledTimes(1);
  });
});

describe('encuadre con el botón central', () => {
  it('arrastrar desplaza la vista y el evento se consume (autoscroll de Windows)', async () => {
    const { svg, setCanvasView } = renderCanvas({ view: { k: 2, tx: -50, ty: -40 } });

    const down = new PointerEvent('pointerdown', {
      button: 1, pointerId: 7, clientX: 200, clientY: 150, bubbles: true, cancelable: true,
    });
    svg.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);

    svg.dispatchEvent(new PointerEvent('pointermove', {
      pointerId: 7, clientX: 260, clientY: 190, bubbles: true,
    }));
    await nextFrame();

    expect(setCanvasView).toHaveBeenCalled();
    const v = setCanvasView.mock.calls.at(-1)![0] as CanvasView2D;
    expect(v.tx).toBeGreaterThan(-50);
    expect(v.ty).toBeGreaterThan(-40);

    svg.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, bubbles: true }));
  });

  it('el auxclick que cierra el arrastre no llega como acción', () => {
    const { svg } = renderCanvas({ view: { k: 2, tx: -50, ty: -40 } });
    const aux = new MouseEvent('auxclick', { button: 1, bubbles: true, cancelable: true });
    svg.dispatchEvent(aux);
    expect(aux.defaultPrevented).toBe(true);
  });

  it('un micro-movimiento por debajo del umbral no mueve la cámara', async () => {
    const { svg, setCanvasView } = renderCanvas({ view: { k: 2, tx: -50, ty: -40 } });
    svg.dispatchEvent(new PointerEvent('pointerdown', {
      button: 1, pointerId: 9, clientX: 200, clientY: 150, bubbles: true, cancelable: true,
    }));
    svg.dispatchEvent(new PointerEvent('pointermove', {
      pointerId: 9, clientX: 201, clientY: 151, bubbles: true,
    }));
    await nextFrame();
    expect(setCanvasView).not.toHaveBeenCalled();
  });
});

describe('atajos de teclado', () => {
  it('+ − 0 (fila superior y numpad) manejan la cámara', async () => {
    const { setCanvasView } = renderCanvas({ view: { k: 2, tx: -40, ty: -30 } });
    const user = userEvent.setup();

    await user.keyboard('{+}');
    await nextFrame();
    expect(setCanvasView).toHaveBeenCalled();

    setCanvasView.mockClear();
    await user.keyboard('{-}');
    await nextFrame();
    expect(setCanvasView).toHaveBeenCalled();

    setCanvasView.mockClear();
    await user.keyboard('0');
    await nextFrame();
    expect(setCanvasView).toHaveBeenCalled();
  });

  it('NO se disparan mientras se teclea en un input', async () => {
    const { setCanvasView } = renderCanvas({ view: { k: 2, tx: -40, ty: -30 } });
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    const user = userEvent.setup();
    await user.keyboard('{+}0{-}');
    await nextFrame();

    expect(setCanvasView).not.toHaveBeenCalled();
    input.remove();
  });

  it('Ctrl+± se deja al navegador', async () => {
    const { setCanvasView } = renderCanvas({ view: { k: 2, tx: -40, ty: -30 } });
    const user = userEvent.setup();
    await user.keyboard('{Control>}{+}{/Control}');
    await nextFrame();
    expect(setCanvasView).not.toHaveBeenCalled();
  });
});

describe('contrato VISTA ≠ EDICIÓN (readOnly)', () => {
  it('con readOnly el zoom sigue vivo', async () => {
    const { svg, setCanvasView } = renderCanvas({ readOnly: true });
    svg.dispatchEvent(new WheelEvent('wheel', {
      deltaY: -120, deltaMode: 0, clientX: 300, clientY: 200, bubbles: true, cancelable: true,
    }));
    await nextFrame();
    expect(setCanvasView).toHaveBeenCalled();
  });

  it('con readOnly las herramientas siguen apagadas', async () => {
    const { svg, setModel } = renderCanvas({ readOnly: true });
    // Un clic con la herramienta activa degradada a 'select' no edita el modelo.
    svg.dispatchEvent(new MouseEvent('click', { clientX: 120, clientY: 90, bubbles: true }));
    expect(setModel).not.toHaveBeenCalled();
  });
});

describe('hint de encuadre', () => {
  it('sólo aparece cuando hay zoom', () => {
    const { unmount } = render(
      <UnitSystemProvider>
        <Fem2DEditorCanvas
          model={portal} checks={result.checks} setModel={vi.fn()} selected={null}
          setSelected={vi.fn()} tool="select" showLabels width={W} height={H}
          canvasView={IDENTITY_VIEW} setCanvasView={vi.fn()}
        />
      </UnitSystemProvider>,
    );
    expect(document.body.textContent).not.toContain('Espacio+arrastre');
    unmount();

    render(
      <UnitSystemProvider>
        <Fem2DEditorCanvas
          model={portal} checks={result.checks} setModel={vi.fn()} selected={null}
          setSelected={vi.fn()} tool="select" showLabels width={W} height={H}
          canvasView={{ k: 2, tx: -40, ty: -30 }} setCanvasView={vi.fn()}
        />
      </UnitSystemProvider>,
    );
    expect(document.body.textContent).toContain('Espacio+arrastre');
  });
});

describe('ZoomControls — tabla de estados', () => {
  const setup = (k: number, disabled = false) => {
    const onZoomIn = vi.fn(), onZoomOut = vi.fn(), onReset = vi.fn();
    render(<ZoomControls k={k} onZoomIn={onZoomIn} onZoomOut={onZoomOut} onReset={onReset} disabled={disabled} />);
    return {
      minus: screen.getByLabelText('Alejar') as HTMLButtonElement,
      plus: screen.getByLabelText('Acercar') as HTMLButtonElement,
      fit: screen.getByLabelText('Encuadrar') as HTMLButtonElement,
      pct: screen.getByLabelText(/Reencuadrar — zoom actual/) as HTMLButtonElement,
      onZoomIn, onZoomOut, onReset,
    };
  };

  it('k=1: − y Encuadrar deshabilitados, + activo (el zoom debe verse disponible)', () => {
    const { minus, plus, fit } = setup(1);
    expect(minus.disabled).toBe(true);
    expect(fit.disabled).toBe(true);
    expect(plus.disabled).toBe(false);
  });

  it('zoom intermedio: los cuatro activos', () => {
    const { minus, plus, fit, pct } = setup(2.5);
    expect(minus.disabled).toBe(false);
    expect(plus.disabled).toBe(false);
    expect(fit.disabled).toBe(false);
    expect(pct.disabled).toBe(false);
  });

  it('k máximo: + deshabilitado, − y Encuadrar activos', () => {
    const { minus, plus, fit } = setup(ZOOM_MAX);
    expect(plus.disabled).toBe(true);
    expect(minus.disabled).toBe(false);
    expect(fit.disabled).toBe(false);
  });

  it('modelo vacío: grupo entero deshabilitado', () => {
    const { minus, plus, fit, pct } = setup(1, true);
    for (const b of [minus, plus, fit, pct]) expect(b.disabled).toBe(true);
  });

  it('el chip % lleva el valor vivo en su etiqueta y reencuadra al pulsarlo', async () => {
    const { pct, onReset } = setup(2.5);
    expect(pct.getAttribute('aria-label')).toBe('Reencuadrar — zoom actual 250 %');
    expect(pct.textContent).toBe('250 %');
    await userEvent.click(pct);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('anuncia el cambio SOLO tras un salto discreto (no por rueda)', async () => {
    const { plus } = setup(2);
    const live = document.querySelector('[aria-live="polite"]')!;
    expect(live.textContent).toBe('');
    await userEvent.click(plus);
    await new Promise((r) => setTimeout(r, 90));
    expect(live.textContent).toContain('Acercado');
  });
});
