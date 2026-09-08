/**
 * Dos pestañas con obras distintas: la que se queda atrás muestra una banda
 * persistente con la obra que se abrió en la otra. Cambiar la obra desde esta
 * misma pestaña no la dispara.
 */

import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { BandaProyecto } from '../../components/layout/BandaProyecto';
import { CLAVE_PROYECTO_ACTIVO } from '../../data/proyectoKeys';
import { _reiniciarProyectoParaTests, fijarProyectoActivo, guardar, pestanaDesfasada, proyectoNuevo } from '../../lib/proyecto';
import { _reiniciarAlmacenParaTests } from '../../lib/storage/seguro';

function otraPestanaAbre(id: string, nombre: string) {
  const p = proyectoNuevo(nombre);
  p.id = id;
  guardar(p);
  window.localStorage.setItem(CLAVE_PROYECTO_ACTIVO, id);
  window.dispatchEvent(new StorageEvent('storage', { key: CLAVE_PROYECTO_ACTIVO, newValue: id }));
}

beforeEach(() => {
  window.localStorage.clear();
  _reiniciarAlmacenParaTests();
  _reiniciarProyectoParaTests();
});

describe('BandaProyecto', () => {
  it('no se ve mientras la obra activa es la de esta pestaña', () => {
    render(<BandaProyecto />);
    expect(screen.queryByRole('alert')).toBeNull();
    act(() => fijarProyectoActivo('mia'));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(pestanaDesfasada()).toBe(false);
  });

  it('otra pestaña abre otra obra: banda con su nombre y botón de recargar', () => {
    render(<BandaProyecto />);
    act(() => otraPestanaAbre('ajena', 'Nave de la otra pestaña'));
    expect(pestanaDesfasada()).toBe(true);
    const banda = screen.getByRole('alert');
    expect(banda.textContent).toMatch(/Nave de la otra pestaña/);
    expect(banda.textContent).toMatch(/ha dejado de guardar los cambios/);
    expect(screen.getByRole('button', { name: /recargar/i })).toBeInTheDocument();
  });

  it('otra pestaña cierra la obra: la banda lo dice', () => {
    act(() => fijarProyectoActivo('mia'));
    render(<BandaProyecto />);
    act(() => {
      window.localStorage.removeItem(CLAVE_PROYECTO_ACTIVO);
      window.dispatchEvent(new StorageEvent('storage', { key: CLAVE_PROYECTO_ACTIVO, newValue: null }));
    });
    expect(screen.getByRole('alert').textContent).toMatch(/se ha cerrado la obra/);
  });
});
