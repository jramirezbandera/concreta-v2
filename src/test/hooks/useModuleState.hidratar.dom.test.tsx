/**
 * Un módulo abierto desde un enlace compartido PERSISTE el estado hidratado.
 * Antes sólo escribía setField, así que el módulo tenía cero bytes en el
 * almacén y «Guardar proyecto» habría guardado la viga anterior con la
 * compartida en pantalla. Lo que se ve es lo que se guarda.
 */

import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MODULE_SCHEMA_VERSIONS } from '../../data/moduleRegistry';
import { useModuleState } from '../../hooks/useModuleState';
import { _reiniciarAlmacenParaTests } from '../../lib/storage/seguro';

const defaults = { L: 5, b: 300 };

function montar(ruta: string) {
  const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[ruta]}>{children}</MemoryRouter>;
  return renderHook(() => useModuleState('rc-beams', defaults), { wrapper });
}

const guardado = () => {
  const raw = window.localStorage.getItem('rc-beams');
  return raw ? (JSON.parse(raw) as typeof defaults) : null;
};

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  _reiniciarAlmacenParaTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useModuleState — enlace compartido', () => {
  it('con parámetros en la URL, el estado hidratado queda guardado sin tocar nada', () => {
    const { result, unmount } = montar('/horm/vigas?L=7.5');
    expect(result.current.state.L).toBe(7.5);
    unmount(); // vuelca lo diferido
    expect(guardado()).toEqual({ L: 7.5, b: 300 });
    expect(window.localStorage.getItem('rc-beams-version')).toBe(MODULE_SCHEMA_VERSIONS['rc-beams']);
  });

  it('sin parámetros, montar no escribe nada (el almacén vacío sigue vacío)', () => {
    const { unmount } = montar('/horm/vigas');
    unmount();
    expect(guardado()).toBeNull();
  });
});
