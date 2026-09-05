/**
 * Los dibujos del lienzo, montados sueltos con un resultado del motor: que
 * pintan lo que dicen, que responden a la dirección y que un estado sin
 * resultado o inválido no los tumba. Tamaño forzado: el stub de
 * ResizeObserver de jsdom no mide.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';
import { EdificioSVG } from '../../features/viento-nieve/lienzo/EdificioSVG';
import { defaultVientoNieveState, ejemploVientoNieveState, evaluar, type VientoNieveState } from '../../features/viento-nieve/state';

afterEach(() => cleanup());

function madrid(): VientoNieveState {
  const s = defaultVientoNieveState();
  s.emplazamiento = { ...s.emplazamiento, provincia: '28', municipio: 'Madrid', altitud: 660 };
  return s;
}

function montarEdificio(state: VientoNieveState, extra: Partial<Parameters<typeof EdificioSVG>[0]> = {}) {
  const ev = evaluar(state);
  const onSelectPlanta = vi.fn();
  const onDireccion = vi.fn();
  const utils = render(
    <UnitSystemProvider>
      <EdificioSVG viento={state.viento} resultado={ev.viento} direccion="y" plantaSel={null} onSelectPlanta={onSelectPlanta} onDireccion={onDireccion} forceWidth={760} forceHeight={600} {...extra} />
    </UnitSystemProvider>,
  );
  return { ...utils, ev, onSelectPlanta, onDireccion };
}

describe('EdificioSVG', () => {
  it('rotula las plantas, la fuerza de cada forjado y la dirección', () => {
    const { container, ev } = montarEdificio(madrid());
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('width')).toBe('760');
    const texto = svg.textContent ?? '';
    for (const p of ev.viento!.y.plantas) {
      expect(texto).toContain(p.nombre);
      expect(texto).toContain(`${p.F.toFixed(1).replace('.', ',')} kN`);
    }
    expect(texto).toContain('lado Y, paralelo al viento');
    expect(texto).toContain('según Y · ');
    expect(texto).toContain('cubierta plana u omitida');
  });

  it('según X dibuja la sección de 20 m y con cubierta el hastial o el rectángulo hasta la coronación', () => {
    const conCubierta = madrid();
    conCubierta.viento.cubierta = { ...conCubierta.viento.cubierta, activa: true, pendiente: 20, cumbrera: 'x' };
    const x = montarEdificio(conCubierta, { direccion: 'x' });
    const textoX = x.container.querySelector('svg')!.textContent ?? '';
    expect(textoX).toContain('lado X, paralelo al viento');
    expect(textoX).toContain('hastial');
    expect(textoX).toContain('coronación');
    cleanup();
    const y = montarEdificio(conCubierta, { direccion: 'y' });
    const textoY = y.container.querySelector('svg')!.textContent ?? '';
    expect(textoY).toContain('presión +');
    expect(textoY).toContain('faldones: +');
  });

  it('la planta es un botón por dirección y cada forjado se puede seleccionar', () => {
    const { onDireccion, onSelectPlanta } = montarEdificio(madrid());
    fireEvent.click(screen.getByRole('button', { name: 'Viento según X' }));
    expect(onDireccion).toHaveBeenCalledWith('x');
    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar Planta 2' }));
    expect(onSelectPlanta).toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Seleccionar Cubierta' }), { key: 'Enter' });
    expect(onSelectPlanta).toHaveBeenCalledTimes(2);
  });

  it('sin resultado dibuja el edificio y dice que las fuerzas aparecerán', () => {
    const { container } = montarEdificio(defaultVientoNieveState());
    const texto = container.querySelector('svg')!.textContent ?? '';
    expect(texto).toContain('aparecerán aquí');
    expect(texto).toContain('Planta 1');
    expect(texto).not.toContain(' kN');
  });

  it('el ejemplo (cubierta a 40º) y un edificio sin plantas no revientan', () => {
    expect(() => montarEdificio(ejemploVientoNieveState())).not.toThrow();
    cleanup();
    const vacio = madrid();
    vacio.viento.plantas = [];
    expect(() => montarEdificio(vacio)).not.toThrow();
  });
});
