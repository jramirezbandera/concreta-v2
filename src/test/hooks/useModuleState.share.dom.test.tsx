// Share-link "build-on-demand" de useModuleState.
//
// Regresión del bug original: "Copiar enlace" en los módulos simples copiaba
// window.location.href, pero useModuleState sólo escribía los params en la URL
// con un debounce de 300 ms al editar. Si el usuario cargaba un cálculo desde
// localStorage/defaults y compartía sin editar (o dentro de los 300 ms), la URL
// salía SIN parámetros → el destinatario veía otro cálculo.
//
// Fix: getShareUrl()/copyShareLink() construyen el enlace desde el estado EN
// MEMORIA, y un enlace entrante se limpia de la barra al montar.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { useModuleState } from '../../hooks/useModuleState';

// Defaults planos representativos de un módulo simple (mezcla number/string).
const defaults = { L: 5, b: 300, h: 600, mode: 'simple' };

function Probe() {
  const { state, setField, getShareUrl, copyShareLink } = useModuleState('rc-beams', defaults);
  return (
    <div>
      <span data-testid="L">{state.L}</span>
      <span data-testid="share">{getShareUrl()}</span>
      <button onClick={() => setField('L', 7.5)}>edit</button>
      <button onClick={copyShareLink}>copy</button>
    </div>
  );
}

function LocationProbe() {
  const loc = useLocation();
  useModuleState('rc-beams', defaults);
  return <span data-testid="search">{loc.search}</span>;
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('useModuleState — getShareUrl (build-on-demand)', () => {
  it('incluye TODOS los params sin haber editado (defaults → enlace completo)', () => {
    render(<MemoryRouter><Probe /></MemoryRouter>);
    const share = screen.getByTestId('share').textContent ?? '';
    const qs = new URL(share).searchParams;
    expect(qs.get('L')).toBe('5');
    expect(qs.get('b')).toBe('300');
    expect(qs.get('h')).toBe('600');
    expect(qs.get('mode')).toBe('simple');
  });

  it('refleja la edición inmediatamente (sin esperar el debounce)', () => {
    render(<MemoryRouter><Probe /></MemoryRouter>);
    act(() => {
      screen.getByText('edit').click();
    });
    const qs = new URL(screen.getByTestId('share').textContent ?? '').searchParams;
    expect(qs.get('L')).toBe('7.5');
  });

  it('copyShareLink copia getShareUrl() al portapapeles', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    render(<MemoryRouter><Probe /></MemoryRouter>);
    await act(async () => {
      screen.getByText('copy').click();
    });

    expect(writeText).toHaveBeenCalledTimes(1);
    const copied = writeText.mock.calls[0][0] as string;
    const qs = new URL(copied).searchParams;
    expect(qs.get('L')).toBe('5');
    expect(qs.get('mode')).toBe('simple');
  });
});

describe('useModuleState — enlace entrante', () => {
  it('lee los params al montar y LIMPIA la barra de direcciones', () => {
    render(
      <MemoryRouter initialEntries={['/horm/vigas?L=9&b=250&h=550&mode=avanzado']}>
        <LocationProbe />
      </MemoryRouter>,
    );
    // La URL se ha limpiado tras consumir el enlace entrante.
    expect(screen.getByTestId('search').textContent).toBe('');
  });

  it('round-trip: editar → copiar → abrir el enlace → mismo estado', () => {
    // Emisor: edita L=7.5 y genera el enlace desde el estado en memoria.
    const emitter = render(<MemoryRouter><Probe /></MemoryRouter>);
    act(() => {
      screen.getByText('edit').click();
    });
    const search = new URL(screen.getByTestId('share').textContent ?? '').search;
    expect(search).not.toBe('');
    emitter.unmount();

    // Receptor: abre el enlace en un montaje nuevo (incluso con otro valor en
    // localStorage, la URL gana). El estado debe reproducir L=7.5.
    window.localStorage.setItem('rc-beams', JSON.stringify({ ...defaults, L: 99 }));
    render(
      <MemoryRouter initialEntries={[`/horm/vigas${search}`]}>
        <Probe />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('L').textContent).toBe('7.5');
  });
});
