/**
 * La lupa del pie de la barra lateral fue un icono sin `onClick` desde que se
 * dibujó (5ef234d) hasta el 2026-09-25. Ahora abre un buscador de módulos, y
 * Ctrl+K también.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from '../../components/layout/Sidebar';
import { DESTINOS, buscarDestinos } from '../../components/layout/destinos';
import { moduleRegistry } from '../../data/moduleRegistry';
import { _reiniciarProyectoParaTests } from '../../lib/proyecto';
import { _reiniciarAlmacenParaTests } from '../../lib/storage/seguro';

beforeEach(() => {
  window.localStorage.clear();
  _reiniciarAlmacenParaTests();
  _reiniciarProyectoParaTests();
});

const rutas = (consulta: string) => buscarDestinos(consulta).map((d) => d.route);

describe('buscarDestinos', () => {
  it('sin nada escrito, la barra entera y en su orden: Proyecto primero y los grupos juntos', () => {
    const todos = buscarDestinos('');
    expect(todos).toHaveLength(DESTINOS.length);
    expect(todos.map((d) => d.label).slice(0, 2)).toEqual(['La obra', 'Anejo de cálculo']);
    // El registro mete Punzonamiento detrás de Muros; la barra lo agrupa con Hormigón.
    const grupos = todos.map((d) => d.group);
    const vistos = grupos.filter((g, i) => g !== grupos[i - 1]);
    expect(new Set(vistos).size).toBe(vistos.length);
  });

  it('están todos los módulos del registro, y ninguno dos veces', () => {
    const claves = DESTINOS.map((d) => d.key);
    expect(new Set(claves).size).toBe(claves.length);
    for (const m of moduleRegistry) expect(claves).toContain(m.key);
  });

  it('«vigas» da las tres, en el orden de la barra, antes que lo que sólo la menciona', () => {
    const r = buscarDestinos('vigas');
    expect(r.slice(0, 3).map((d) => d.route)).toEqual(['/horm/vigas', '/acero/vigas', '/madera/vigas']);
    expect(r.map((d) => d.route)).toContain('/analisis/fem');
    expect(r.map((d) => d.route).indexOf('/analisis/fem')).toBeGreaterThan(2);
  });

  it('cada palabra filtra: «vigas acero» deja sólo la de acero', () => {
    expect(rutas('vigas acero')).toEqual(['/acero/vigas']);
    expect(rutas('pilar madera')[0]).toBe('/madera/pilares');
  });

  it('sin tildes y con las palabras de obra y de la norma', () => {
    expect(rutas('accion sismica')[0]).toBe('/analisis/sismo');
    expect(rutas('Acción')[0]).toBe('/analisis/sismo');
    expect(rutas('sismo')[0]).toBe('/analisis/sismo');
    expect(rutas('NCSE')[0]).toBe('/analisis/sismo');
    expect(rutas('fuego')[0]).toBe('/acciones/incendio');
    expect(rutas('placa')[0]).toBe('/acero/placas-de-anclaje');
    expect(rutas('contención')[0]).toBe('/ciment/muros');
  });

  it('lo que no está en ningún sitio no da nada', () => {
    expect(buscarDestinos('xyzzy')).toEqual([]);
  });
});

function DondeEstoy() {
  return <p data-testid="ruta">{useLocation().pathname}</p>;
}

function montar(onClose = vi.fn()) {
  render(
    <MemoryRouter initialEntries={['/obra']}>
      <Sidebar onClose={onClose} />
      <Routes>
        <Route path="*" element={<DondeEstoy />} />
      </Routes>
    </MemoryRouter>,
  );
  return onClose;
}

describe('la lupa de la barra lateral', () => {
  it('abre el buscador, escribe, e Intro lleva al módulo y cierra el cajón', async () => {
    const user = userEvent.setup();
    const onClose = montar();
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Buscar un módulo' }));
    const campo = screen.getByRole('combobox', { name: 'Buscar un módulo' });
    expect(campo).toHaveFocus();

    await user.type(campo, 'placas');
    expect(screen.getAllByRole('option')[0]).toHaveTextContent('Placas de anclaje');
    await user.keyboard('{Enter}');

    expect(screen.getByTestId('ruta')).toHaveTextContent('/acero/placas-de-anclaje');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onClose).toHaveBeenCalled();
  });

  it('las flechas mueven la fila activa y el clic también lleva', async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole('button', { name: 'Buscar un módulo' }));
    const campo = screen.getByRole('combobox');

    await user.type(campo, 'vigas');
    const [horm, acero] = screen.getAllByRole('option');
    expect(horm).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowDown}');
    expect(acero).toHaveAttribute('aria-selected', 'true');
    expect(campo).toHaveAttribute('aria-activedescendant', acero.id);
    // Arriba desde la primera da la vuelta hasta la última.
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(screen.getAllByRole('option').at(-1)).toHaveAttribute('aria-selected', 'true');

    fireEvent.mouseDown(screen.getByRole('option', { name: /Vigas.*Madera/ }));
    expect(screen.getByTestId('ruta')).toHaveTextContent('/madera/vigas');
  });

  it('Ctrl+K lo abre desde cualquier sitio, y Escape lo cierra sin moverse y devuelve el foco', async () => {
    const user = userEvent.setup();
    montar();
    const lupa = screen.getByRole('button', { name: 'Buscar un módulo' });
    lupa.focus();

    await user.keyboard('{Control>}k{/Control}');
    expect(screen.getByRole('dialog', { name: 'Buscar un módulo' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('ruta')).toHaveTextContent('/obra');
    expect(lupa).toHaveFocus();
  });

  it('sin resultados lo dice, y el Intro no hace nada', async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole('button', { name: 'Buscar un módulo' }));
    await user.type(screen.getByRole('combobox'), 'xyzzy{Enter}');
    expect(screen.getByText(/Nada con «xyzzy»/)).toBeInTheDocument();
    expect(screen.getByTestId('ruta')).toHaveTextContent('/obra');
  });
});
