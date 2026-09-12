/**
 * El panel de la obra: la pantalla que contesta «¿qué me falta?».
 *
 * Lo que se protege aquí:
 *
 *   1. la obra en blanco no lleva ni un rojo (a quien acaba de empezar no se
 *      le reprocha nada);
 *   2. con una obra a medias, lo que falta sale enumerado y con su destino;
 *   3. el total que dice el panel es EXACTAMENTE el que impide exportar en la
 *      ficha: si los dos se separan, el usuario deja de creerse ninguno de los
 *      dos;
 *   4. el panel se entera de lo que se publica en otro módulo sin recargar.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ThemeProvider } from '../../lib/theme/ThemeProvider';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';
import { ObraModule } from '../../features/obra';
import { resumenDeObra } from '../../features/obra/resumen';
import { cargarEstado } from '../../features/memoria-dbse/state';
import { leerSobres } from '../../features/memoria-dbse/sobres';
import { evaluar } from '../../lib/memoria/ensamblar';
import { defaultMaterialesState, evaluar as evaluarMateriales, publicarResultado as publicarMateriales } from '../../features/materiales/state';
import { guardarObra } from '../../lib/obra';
import { _reiniciarAlmacenParaTests } from '../../lib/storage/seguro';

function montar() {
  return render(
    <MemoryRouter initialEntries={['/obra']}>
      <ThemeProvider>
        <UnitSystemProvider>
          <ObraModule />
        </UnitSystemProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

const obraGranada = () => guardarObra({ denominacion: 'Edificio en Granada', municipio: 'Granada', provincia: '18', altitud: 680, uso: 'Edificio de viviendas' });

beforeEach(() => {
  localStorage.clear();
  _reiniciarAlmacenParaTests();
});

afterEach(() => {
  cleanup();
});

describe('la obra en blanco', () => {
  it('no tiene un solo rojo, y enseña de dónde sale todo', async () => {
    montar();
    expect(await screen.findByText('Por dónde se empieza')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /cuadro de materiales/ })).toHaveAttribute('href', '/memorias/materiales');

    // Ni un `state-fail` en el DOM, y ni una palabra «falta».
    await waitFor(() => expect(screen.getAllByText('sin empezar').length).toBeGreaterThan(0));
    expect(document.querySelectorAll('.text-state-fail')).toHaveLength(0);
    expect(screen.queryByText('falta')).toBeNull();
  });
});

describe('una obra a medias', () => {
  it('dice cuántos datos faltan y lleva a resolverlos', async () => {
    obraGranada();
    montar();

    expect(await screen.findByText(/Faltan \d+ datos para poder exportar/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Resolver lo que falta' })).toHaveAttribute('href', '/memorias/db-se');

    // Cada módulo sin calcular es una fila con su destino.
    const fila = await screen.findByRole('link', { name: /Cuadro de materiales: falta/ });
    expect(fila).toHaveAttribute('href', '/memorias/materiales');
  });

  it('el total del panel es el mismo que impide exportar en la ficha', () => {
    obraGranada();
    const r = resumenDeObra();
    const ev = evaluar(cargarEstado(), leerSobres());

    // El panel cuenta los datos de obra aparte, porque se resuelven en su
    // diálogo y no en la ficha; sumados, son exactamente las faltas.
    expect(r.faltan + r.datosObra.length).toBe(ev.huecos.filter((h) => h.estado === 'falta').length);
    expect(ev.listo).toBe(r.faltan + r.datosObra.length === 0);
  });

  it('se entera de lo que se publica en otro módulo sin recargar', async () => {
    obraGranada();
    montar();
    await screen.findByRole('link', { name: /Cuadro de materiales: falta/ });

    // Otro módulo publica un cuadro de verdad, no el de arranque.
    const m = { ...defaultMaterialesState(), costa: true };
    publicarMateriales(m, evaluarMateriales(m));

    await waitFor(() => expect(screen.getByRole('link', { name: /Cuadro de materiales: hecho/ })).toBeInTheDocument());
  });
});
