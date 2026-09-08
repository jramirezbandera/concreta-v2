/**
 * La banda persistente del almacenamiento: aparece al fallar una escritura,
 * nombra la causa, y desaparece cuando vuelve a escribirse bien. El toast sale
 * en la transición, una vez, no en cada pulsación.
 */

import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BandaAlmacen } from '../../components/layout/BandaAlmacen';
import { showToast } from '../../components/ui/Toast';
import { _reiniciarAlmacenParaTests, escribirClave } from '../../lib/storage/seguro';

vi.mock('../../components/ui/Toast', () => ({ showToast: vi.fn() }));

function cuotaLlena() {
  return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('QuotaExceededError', 'QuotaExceededError');
  });
}

beforeEach(() => {
  window.localStorage.clear();
  _reiniciarAlmacenParaTests();
  vi.mocked(showToast).mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BandaAlmacen', () => {
  it('no se ve mientras el almacenamiento funciona', () => {
    render(<BandaAlmacen />);
    act(() => {
      escribirClave('k', 'v');
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('cuota llena: banda con la causa y UN toast aunque falle varias veces; se va al recuperarse, con toast', () => {
    render(<BandaAlmacen />);
    escribirClave('previa', 'x');
    const spy = cuotaLlena();

    act(() => {
      escribirClave('rc-beams', '{}');
    });
    expect(screen.getByRole('alert').textContent).toMatch(/lleno/);
    expect(showToast).toHaveBeenCalledTimes(1);

    act(() => {
      escribirClave('rc-beams', '{"L":5}');
      escribirClave('rc-columns', '{}');
    });
    expect(showToast).toHaveBeenCalledTimes(1);

    spy.mockRestore();
    act(() => {
      escribirClave('rc-beams', '{"L":5}');
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(showToast).toHaveBeenCalledTimes(2);
    expect(vi.mocked(showToast).mock.calls[1][0]).toMatch(/vuelve a funcionar/);
  });

  it('almacenamiento no disponible: la banda lo dice con otras palabras', () => {
    render(<BandaAlmacen />);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError');
    });
    act(() => {
      escribirClave('k', 'v');
    });
    expect(screen.getByRole('alert').textContent).toMatch(/modo privado/);
  });
});
