/**
 * Ajustes › Mi estudio: la pantalla del perfil del despacho.
 *
 * Lo que se protege: que se autoguarde en la clave de preferencia (no hay
 * botón de guardar), que la ficha ya no lo pida, y que expone los campos que
 * la ficha NO dejaba editar —eran la mitad— por los que se le dio pantalla.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ThemeProvider } from '../../lib/theme/ThemeProvider';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';
import { AjustesEstudioModule } from '../../features/ajustes-estudio';
import { leerPerfilEstudio } from '../../features/memoria-dbse/state';
import { _reiniciarAlmacenParaTests } from '../../lib/storage/seguro';

const montar = () =>
  render(
    <MemoryRouter initialEntries={['/ajustes/estudio']}>
      <ThemeProvider>
        <UnitSystemProvider>
          <AjustesEstudioModule />
        </UnitSystemProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  localStorage.clear();
  _reiniciarAlmacenParaTests();
});

afterEach(() => {
  cleanup();
});

describe('Mi estudio', () => {
  it('arranca con la plantilla colegial y se autoguarda al escribir', () => {
    montar();
    const programa = screen.getByLabelText('Programa') as HTMLInputElement;
    expect(programa.value).toBe('Cypecad Espacial');
    expect(leerPerfilEstudio()).toBeNull();

    fireEvent.change(programa, { target: { value: 'Tricalc' } });

    // Sin botón de guardar: la escritura ya está en la clave de preferencia.
    expect(screen.queryByRole('button', { name: /guardar/i })).toBeNull();
    expect(leerPerfilEstudio()?.programa.nombre).toBe('Tricalc');
  });

  it('expone lo que la ficha no dejaba editar: método, cuantías y flechas por tipo de forjado', () => {
    montar();

    fireEvent.change(screen.getByLabelText('Cuantías'), { target: { value: 'las del anejo' } });
    fireEvent.change(screen.getByLabelText('reticular activa'), { target: { value: 'L/600' } });
    fireEvent.change(screen.getByLabelText('Control del hormigón'), { target: { value: '100_por_100' } });

    const p = leerPerfilEstudio()!;
    expect(p.cuantias).toBe('las del anejo');
    expect(p.forjados.reticular.activa).toBe('L/600');
    expect(p.control.nivelControlHormigon).toBe('100_por_100');
    // Y lo de al lado no se ha tocado.
    expect(p.forjados.reticular.total).toBe('L/250');
    expect(p.forjados.losa.activa).toBe('L/500');
  });
});
