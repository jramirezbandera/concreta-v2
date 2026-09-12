/**
 * La ruta dice qué módulo está en pantalla (`lib/anejo/useModuloEnPantalla`):
 * cada ruta del registro resuelve a su adaptador, una ruta que no es de módulo
 * no resuelve, y fuera de un router no hay módulo (y no se lanza).
 */

import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { moduleRegistry } from '../../data/moduleRegistry';
import { adaptadorDeRuta, useModuloEnPantalla } from '../../lib/anejo/useModuloEnPantalla';

describe('adaptadorDeRuta', () => {
  it('cada ruta del registro resuelve al adaptador de su módulo', () => {
    for (const m of moduleRegistry) {
      expect(adaptadorDeRuta(m.route)?.modulo, m.route).toBe(m.key);
    }
  });

  it('admite la barra final y no confunde rutas parecidas', () => {
    expect(adaptadorDeRuta('/horm/vigas/')?.modulo).toBe('concreta-rc-beams');
    expect(adaptadorDeRuta('/horm/vigas/otra')).toBeNull();
  });

  it('una ruta que no es de módulo no tiene adaptador', () => {
    expect(adaptadorDeRuta('/pricing')).toBeNull();
    expect(adaptadorDeRuta('/')).toBeNull();
  });
});

describe('useModuloEnPantalla', () => {
  it('dentro del router, el módulo de la ruta actual', () => {
    const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={['/geotec/taludes']}>{children}</MemoryRouter>;
    const { result } = renderHook(() => useModuloEnPantalla(), { wrapper });
    expect(result.current?.modulo).toBe('concreta-slope-stability');
    expect(result.current?.capitulo).toBe('Estabilidad de taludes');
  });

  it('sin router: null, sin lanzar', () => {
    const { result } = renderHook(() => useModuloEnPantalla());
    expect(result.current).toBeNull();
  });
});
