/**
 * El comodín de rutas decide AL PINTAR, no al construir el router.
 *
 * `App.tsx` crea el router una vez al cargar el módulo; un
 * `<Navigate to={rutaDeEntrada()} />` escrito ahí evaluaba la función en ese
 * instante y se quedaba con la respuesta: quien arrancaba sin obra y la creaba
 * sin recargar seguía cayendo en el cuadro de materiales. `<Entrada />` la
 * evalúa cada vez que se monta.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { Entrada } from '../../components/layout/Entrada';
import { guardarObra } from '../../lib/obra';
import { APP_ROUTE } from '../../pages/landing/constants';
import { _reiniciarAlmacenParaTests } from '../../lib/storage/seguro';

function montar() {
  return render(
    <MemoryRouter initialEntries={['/una/ruta/que/no/existe']}>
      <Routes>
        <Route path="/obra" element={<p>el panel de la obra</p>} />
        <Route path={APP_ROUTE} element={<p>el módulo de siempre</p>} />
        <Route path="*" element={<Entrada />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  _reiniciarAlmacenParaTests();
});

afterEach(() => {
  cleanup();
});

describe('Entrada', () => {
  it('sin obra cae donde siempre; con obra creada DESPUÉS de cargar la app, en su panel', () => {
    montar();
    expect(screen.getByText('el módulo de siempre')).toBeInTheDocument();
    cleanup();

    // La app sigue cargada —el router es el mismo—, pero ahora hay obra.
    guardarObra({ denominacion: 'Nave en Dos Hermanas', provincia: '41' });
    montar();
    expect(screen.getByText('el panel de la obra')).toBeInTheDocument();
  });
});
