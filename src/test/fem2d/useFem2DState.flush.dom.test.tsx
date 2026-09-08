/**
 * REGRESIÓN (eng-review T9): desmontar `useFem2DState` VUELCA la escritura
 * diferida en vez de cancelarla. El editor FEM 2D persiste 300 ms después de
 * cada edición; salir del módulo justo después de editar perdía esa edición.
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getModuleSchemaVersion } from '../../data/moduleRegistry';
import { useFem2DState } from '../../features/fem2d/useFem2DState';
import { _reiniciarAlmacenParaTests } from '../../lib/storage/seguro';

const LS_KEY = 'concreta-fem2d';

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  _reiniciarAlmacenParaTests();
  window.history.replaceState({}, '', '/analisis/fem2d');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useFem2DState — vuelco al desmontar', () => {
  it('editar y desmontar antes de los 300 ms deja el modelo guardado', () => {
    const { result, unmount } = renderHook(() => useFem2DState());
    // La semilla intacta no se persiste a propósito; una edición (nueva referencia) sí.
    act(() => result.current.setModel((m) => ({ ...m })));
    expect(window.localStorage.getItem(LS_KEY)).toBeNull();
    unmount();
    expect(window.localStorage.getItem(LS_KEY)).not.toBeNull();
    expect(window.localStorage.getItem(`${LS_KEY}-v`)).toBe(getModuleSchemaVersion('fem2d'));
  });

  it('la semilla sin tocar sigue sin persistirse aunque se desmonte', () => {
    const { unmount } = renderHook(() => useFem2DState());
    unmount();
    expect(window.localStorage.getItem(LS_KEY)).toBeNull();
  });
});
