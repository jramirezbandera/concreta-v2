/**
 * El Sidebar tras el control de obra: el grupo PROYECTO va el primero, el menú
 * de obra vive en la cabecera, y el pie enseña la versión real de la app.
 */

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { Sidebar } from '../../components/layout/Sidebar';
import { _reiniciarProyectoParaTests } from '../../lib/proyecto';
import { _reiniciarAlmacenParaTests } from '../../lib/storage/seguro';

beforeEach(() => {
  window.localStorage.clear();
  _reiniciarAlmacenParaTests();
  _reiniciarProyectoParaTests();
});

describe('Sidebar', () => {
  it('grupo PROYECTO con Datos de obra y Anejo de cálculo, los dos activos, antes que los módulos', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );
    const datos = screen.getByRole('link', { name: /Datos de obra/ });
    expect(datos).toHaveAttribute('href', '/proyecto/datos');
    expect(datos).toHaveAttribute('aria-disabled', 'false');
    const anejo = screen.getByRole('link', { name: /Anejo de cálculo/ });
    expect(anejo).toHaveAttribute('href', '/proyecto/anejo');
    expect(anejo).toHaveAttribute('aria-disabled', 'false');
    expect(screen.queryByText('pronto')).toBeNull();
    const grupos = screen.getAllByText(/^(Proyecto|Memorias)$/).map((e) => e.textContent);
    expect(grupos[0]).toBe('Proyecto');
    expect(grupos[1]).toBe('Memorias');
  });

  it('la cabecera lleva el menú de obra, y el pie la versión de calendario', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /menú de obra/i }).textContent).toMatch(/Sin obra/);
    expect(screen.getByTitle('Versión de Concreta').textContent).toMatch(/^v\d{6}\.\d+$/);
  });
});
