/**
 * Los dibujos del lienzo, montados sueltos con un resultado del motor: que
 * pintan lo que dicen, que responden a la dirección y que un estado sin
 * resultado o inválido no los tumba. Tamaño forzado: el stub de
 * ResizeObserver de jsdom no mide.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';
import { CubiertaSVG } from '../../features/viento-nieve/lienzo/CubiertaSVG';
import { EdificioSVG } from '../../features/viento-nieve/lienzo/EdificioSVG';
import { FachadasSVG } from '../../features/viento-nieve/lienzo/FachadasSVG';
import { NieveSVG } from '../../features/viento-nieve/lienzo/NieveSVG';
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

function svgTexto(container: HTMLElement) {
  return container.querySelector('svg')!.textContent ?? '';
}

describe('CubiertaSVG', () => {
  it('pinta las zonas de la dirección elegida con sus presiones y el hastial', () => {
    const s = ejemploVientoNieveState();
    const ev = evaluar(s);
    const { container } = render(
      <UnitSystemProvider>
        <CubiertaSVG viento={s.viento} cubierta={ev.viento!.cubierta} direccion="y" forceWidth={760} forceHeight={700} />
      </UnitSystemProvider>,
    );
    const texto = svgTexto(container);
    expect(texto).toContain('θ = 0º: viento según Y, perpendicular a la cumbrera');
    for (const z of ['F', 'G', 'H', 'I', 'J']) expect(container.querySelectorAll('text')).toSatisfy((ts: NodeListOf<SVGTextElement>) => [...ts].some((t) => t.textContent === z));
    expect(texto).toContain('α = 40º');
    expect(texto).toContain('hacia sotavento');
    // Un rectángulo por pieza: F son dos rincones.
    expect(container.querySelectorAll('rect').length).toBeGreaterThanOrEqual(6);
    cleanup();
    const x = render(
      <UnitSystemProvider>
        <CubiertaSVG viento={s.viento} cubierta={ev.viento!.cubierta} direccion="x" forceWidth={760} forceHeight={700} />
      </UnitSystemProvider>,
    );
    expect(svgTexto(x.container)).toContain('θ = 90º: viento según X, paralelo a la cumbrera');
    expect(svgTexto(x.container)).toContain('a lo largo de la cumbrera');
  });

  it('sin cubierta dice por qué y no revienta', () => {
    const s = madrid();
    const { container } = render(
      <UnitSystemProvider>
        <CubiertaSVG viento={s.viento} cubierta={null} direccion="y" forceWidth={760} forceHeight={700} />
      </UnitSystemProvider>,
    );
    expect(svgTexto(container)).toContain('cubierta plana u omitida');
  });
});

describe('FachadasSVG', () => {
  it('despliega D · lateral · E · lateral con las zonas y la banda e/10', () => {
    const s = ejemploVientoNieveState();
    const ev = evaluar(s);
    const { container } = render(
      <UnitSystemProvider>
        <FachadasSVG viento={s.viento} paramentos={ev.viento!.paramentos} cumbrera="x" direccion="y" forceWidth={760} forceHeight={700} />
      </UnitSystemProvider>,
    );
    const texto = svgTexto(container);
    expect(texto).toContain('D · barlovento (20 m)');
    expect(texto).toContain('E · sotavento (20 m)');
    expect(texto).toContain('hastial');
    expect(texto).toContain('A: e/10 = 2,0 m');
    expect(texto).toContain('sin zona C');
    cleanup();
    const x = render(
      <UnitSystemProvider>
        <FachadasSVG viento={s.viento} paramentos={ev.viento!.paramentos} cumbrera="x" direccion="x" forceWidth={760} forceHeight={700} />
      </UnitSystemProvider>,
    );
    expect(svgTexto(x.container)).toContain('D · barlovento (12 m)');
    expect(svgTexto(x.container)).toContain('A, B y C el resto');
  });

  it('sin paramentos dice por qué y no revienta', () => {
    const s = madrid();
    const { container } = render(
      <UnitSystemProvider>
        <FachadasSVG viento={s.viento} paramentos={null} cumbrera={null} direccion="y" forceWidth={760} forceHeight={700} />
      </UnitSystemProvider>,
    );
    expect(svgTexto(container)).toContain('fachadas por zonas omitidas');
  });
});

describe('NieveSVG', () => {
  function montarNieve(s: VientoNieveState, faldonSel: string | null = null) {
    const ev = evaluar(s);
    const onSelectFaldon = vi.fn();
    const utils = render(
      <UnitSystemProvider>
        <NieveSVG nieve={s.nieve} resultado={ev.nieve} zona={ev.zonas.zonaInvernal} altitud={s.emplazamiento.altitud} faldonSel={faldonSel} onSelectFaldon={onSelectFaldon} forceWidth={760} forceHeight={760} />
      </UnitSystemProvider>,
    );
    return { ...utils, ev, onSelectFaldon };
  }

  it('un glifo por faldón con μ, qn, la acumulación y la curva de la zona con la obra marcada', () => {
    const { container, onSelectFaldon } = montarNieve(ejemploVientoNieveState());
    const texto = svgTexto(container);
    expect(texto).toContain('Faldón norte');
    expect(texto).toContain('Faldón sur');
    expect(texto).toContain('Cubierta baja');
    expect(texto).toContain('μ 0,67');
    expect(texto).toContain('μ 1,00 (petos)');
    expect(texto).toContain('cambio de nivel: se acumula abajo');
    expect(texto).toContain('pd 1,00 → pa 1,00 kN/m en 2 m');
    expect(texto).toContain('L = 6,00 m');
    expect(texto).toContain('sk por altitud · zona 3');
    expect(texto).toContain('800 m → 0,50 kN/m²');
    expect(texto).toContain('a 1000 m serían 0,70');
    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar Faldón sur' }));
    expect(onSelectFaldon).toHaveBeenCalled();
  });

  it('sin altitud dibuja los faldones sin banda y lo dice', () => {
    const s = madrid();
    s.emplazamiento.altitud = null;
    const { container } = montarNieve(s);
    const texto = svgTexto(container);
    expect(texto).toContain('sin resultado');
    expect(texto).toContain('Cubierta');
    // Sin sk no hay banda ni carga por faldón (la leyenda sí menciona qn).
    expect(texto).not.toMatch(/qn \d/);
  });

  it('sin faldones ni provincia no revienta', () => {
    const s = defaultVientoNieveState();
    s.nieve.faldones = [];
    expect(() => montarNieve(s)).not.toThrow();
    expect(svgTexto(document.body as HTMLElement)).toContain('Sin faldones');
  });
});
