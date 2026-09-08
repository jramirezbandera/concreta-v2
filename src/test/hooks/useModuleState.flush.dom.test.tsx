/**
 * REGRESIÓN (eng-review T9): desmontar `useModuleState` VUELCA los últimos
 * 300 ms de escritura diferida, no los cancela.
 *
 * Antes, el desmontaje cancelaba el temporizador: cambiar de módulo (o de obra)
 * dentro de los 300 ms siguientes a teclear perdía ese valor con la pantalla
 * mostrándolo todavía. Con la cola de `lib/storage/seguro`, el desmontaje lo
 * vuelca; y `reset()` sigue descartando lo pendiente, para no resucitar el
 * estado que se acaba de borrar.
 */

import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isolatedFootingDefaults as ifDefaults } from '../../data/defaults';
import { MODULE_SCHEMA_VERSIONS } from '../../data/moduleRegistry';
import { useModuleState } from '../../hooks/useModuleState';
import { _reiniciarAlmacenParaTests, RETARDO_ESCRITURA_MS } from '../../lib/storage/seguro';

const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;
const montar = () => renderHook(() => useModuleState('isolated-footing', ifDefaults), { wrapper });

const guardado = () => {
  const raw = window.localStorage.getItem('isolated-footing');
  return raw ? (JSON.parse(raw) as { N: number }) : null;
};

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  _reiniciarAlmacenParaTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useModuleState — vuelco al desmontar', () => {
  it('desmontar antes de los 300 ms escribe el valor tecleado (antes lo perdía)', () => {
    const { result, unmount } = montar();
    act(() => result.current.setField('N', 777));
    expect(guardado()).toBeNull(); // todavía diferido
    unmount();
    expect(guardado()?.N).toBe(777);
    expect(window.localStorage.getItem('isolated-footing-version')).toBe(MODULE_SCHEMA_VERSIONS['isolated-footing']);
  });

  it('sin desmontar, sigue escribiendo a los 300 ms (el debounce no ha cambiado)', () => {
    const { result } = montar();
    act(() => result.current.setField('N', 555));
    act(() => vi.advanceTimersByTime(RETARDO_ESCRITURA_MS - 1));
    expect(guardado()).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(guardado()?.N).toBe(555);
  });

  it('reset() descarta la escritura pendiente: el estado borrado no resucita a los 300 ms', () => {
    const { result, unmount } = montar();
    act(() => result.current.setField('N', 999));
    act(() => result.current.reset());
    act(() => vi.advanceTimersByTime(RETARDO_ESCRITURA_MS));
    expect(guardado()).toBeNull();
    unmount();
    expect(guardado()).toBeNull();
  });
});
