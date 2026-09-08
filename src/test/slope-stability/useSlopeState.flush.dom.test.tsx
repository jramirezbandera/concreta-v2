/**
 * REGRESIÓN (eng-review T9): desmontar `useSlopeState` VUELCA la escritura
 * diferida en vez de cancelarla. Un talud editado y abandonado en los 300 ms
 * siguientes (por ejemplo, volviendo al módulo de muro) se perdía.
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { slopeDefaults, type SlopeInputs } from '../../data/defaults';
import { useSlopeState } from '../../features/slope-stability/useSlopeState';
import { _reiniciarAlmacenParaTests } from '../../lib/storage/seguro';

const LS_KEY = 'concreta-slope-stability';

const guardado = (): SlopeInputs | null => {
  const raw = window.localStorage.getItem(LS_KEY);
  return raw ? (JSON.parse(raw) as SlopeInputs) : null;
};

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  _reiniciarAlmacenParaTests();
  window.history.replaceState({}, '', '/geotec/taludes');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useSlopeState — vuelco al desmontar', () => {
  it('editar y desmontar antes de los 300 ms deja el talud guardado', () => {
    const { result, unmount } = renderHook(() => useSlopeState());
    act(() => result.current.setState({ ...slopeDefaults, height: 9.5 }));
    expect(guardado()?.height).not.toBe(9.5);
    unmount();
    expect(guardado()?.height).toBe(9.5);
  });

  it('reset() borra y no resucita lo pendiente; los defaults se guardan después', () => {
    const { result } = renderHook(() => useSlopeState());
    act(() => result.current.setState({ ...slopeDefaults, height: 9.5 }));
    act(() => result.current.reset());
    act(() => vi.advanceTimersByTime(300));
    expect(guardado()?.height).toBe(slopeDefaults.height);
  });
});
