/**
 * `useTitledFileExport` con destino: por defecto descarga; con `entregar`, el
 * fichero va a donde diga el módulo (el anejo), y el modal del título ya está
 * cerrado cuando se entrega. Un fallo al generar deja el modal abierto y no
 * entrega nada.
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { showToast } from '../../components/ui/Toast';
import { descargarBlob, type ResultadoExport } from '../../lib/export/descargar';
import { useTitledFileExport } from '../../hooks/useTitledFileExport';

vi.mock('../../components/ui/Toast', () => ({ showToast: vi.fn() }));
vi.mock('../../lib/export/descargar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/export/descargar')>()),
  descargarBlob: vi.fn(),
}));

const fichero: ResultadoExport = { blob: new Blob(['x'], { type: 'application/pdf' }), filename: 'x.pdf' };

beforeEach(() => {
  vi.mocked(showToast).mockClear();
  vi.mocked(descargarBlob).mockClear();
});

describe('useTitledFileExport', () => {
  it('sin `entregar`, descarga el fichero y cierra el modal', async () => {
    const onTitleChange = vi.fn();
    const { result } = renderHook(() => useTitledFileExport({ exportFn: async () => fichero, valid: true, onTitleChange }));
    act(() => result.current.openExport());
    expect(result.current.titleOpen).toBe(true);
    await act(async () => {
      await result.current.confirmTitle('Viga');
    });
    expect(onTitleChange).toHaveBeenCalledWith('Viga');
    expect(descargarBlob).toHaveBeenCalledWith(fichero, 'Viga');
    expect(result.current.titleOpen).toBe(false);
    expect(result.current.exportando).toBe(false);
  });

  it('con `entregar`, entrega en vez de descargar, y el modal ya está cerrado cuando entrega', async () => {
    let soltar: () => void = () => {};
    const entregar = vi.fn(() => new Promise<void>((resolver) => { soltar = resolver; }));
    const { result } = renderHook(() => useTitledFileExport({ exportFn: async () => fichero, valid: true, onTitleChange: () => {}, entregar }));
    act(() => result.current.openExport());
    let pendiente: Promise<void> = Promise.resolve();
    act(() => {
      pendiente = result.current.confirmTitle('Cuadro');
    });
    await waitFor(() => expect(entregar).toHaveBeenCalledWith(fichero, 'Cuadro'));
    // Entregando todavía, el modal del título ya no está: lo que abra la
    // entrega (el nombre de la obra) no se apila sobre «Generando…».
    expect(result.current.titleOpen).toBe(false);
    expect(result.current.exportando).toBe(false);
    await act(async () => {
      soltar();
      await pendiente;
    });
    expect(descargarBlob).not.toHaveBeenCalled();
  });

  it('si generar falla, el modal sigue abierto con su toast y no se entrega nada', async () => {
    const entregar = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() =>
      useTitledFileExport({ exportFn: async () => { throw new Error('boom'); }, valid: true, onTitleChange: () => {}, formatoLabel: 'PDF', entregar }),
    );
    act(() => result.current.openExport());
    await act(async () => {
      await result.current.confirmTitle('Viga');
    });
    expect(result.current.titleOpen).toBe(true);
    expect(entregar).not.toHaveBeenCalled();
    expect(vi.mocked(showToast).mock.calls[0][0]).toBe('Error al generar el PDF');
  });

  it('si la entrega falla, avisa sin dejar el modal abierto', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() =>
      useTitledFileExport({ exportFn: async () => fichero, valid: true, onTitleChange: () => {}, formatoLabel: 'PDF del anejo', entregar: async () => { throw new Error('sin sitio'); } }),
    );
    act(() => result.current.openExport());
    await act(async () => {
      await result.current.confirmTitle('Viga');
    });
    expect(result.current.titleOpen).toBe(false);
    expect(vi.mocked(showToast).mock.calls[0][0]).toBe('No se pudo entregar el PDF del anejo');
  });

  it('con datos no válidos no abre el modal: avisa', () => {
    const { result } = renderHook(() => useTitledFileExport({ exportFn: async () => fichero, valid: false, onTitleChange: () => {}, invalidMessage: 'Rellene la altitud' }));
    act(() => result.current.openExport());
    expect(result.current.titleOpen).toBe(false);
    expect(vi.mocked(showToast).mock.calls[0][0]).toBe('Rellene la altitud');
  });
});
