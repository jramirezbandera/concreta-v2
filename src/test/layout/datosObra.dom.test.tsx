/**
 * La página Datos de obra escribe cada cambio en `concreta-obra` al momento,
 * y la Topbar móvil enseña la obra abierta en el hueco del grupo.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { DatosObraModule } from '../../features/datos-obra';
import { leerObra } from '../../lib/obra';
import { _reiniciarProyectoParaTests, guardarComoNueva } from '../../lib/proyecto';
import { _reiniciarAlmacenParaTests } from '../../lib/storage/seguro';
import { ThemeProvider } from '../../lib/theme/ThemeProvider';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';

function montar() {
  return render(
    <ThemeProvider>
      <UnitSystemProvider>
        <MemoryRouter>
          <DatosObraModule />
        </MemoryRouter>
      </UnitSystemProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  _reiniciarAlmacenParaTests();
  _reiniciarProyectoParaTests();
});

describe('Datos de obra', () => {
  it('cada campo escribe la obra compartida al momento', async () => {
    const user = userEvent.setup();
    montar();
    await user.type(screen.getByLabelText('Denominación'), 'Nave Z');
    expect(leerObra()?.denominacion).toBe('Nave Z');

    const provincia = screen.getByLabelText('Provincia') as HTMLSelectElement;
    const codigo = provincia.options[1].value;
    await user.selectOptions(provincia, codigo);
    expect(leerObra()?.provincia).toBe(codigo);

    await user.type(screen.getByLabelText('Municipio'), 'Dos Hermanas');
    expect(leerObra()?.municipio).toBe('Dos Hermanas');
  });

  it('no pide el código INE del municipio: nadie se lo sabe y nada lo leía', () => {
    montar();
    expect(screen.queryByLabelText(/INE/i)).toBeNull();
  });

  it('la ficha de obra de la topbar dice la obra abierta, o «Sin obra»', () => {
    montar();
    expect(screen.getByRole('button', { name: /Obra: sin obra/i })).toBeInTheDocument();
  });

  it('con obra guardada, la página y la topbar la nombran', () => {
    guardarComoNueva('Nave con nombre');
    montar();
    expect(screen.getByText(/Obra abierta: Nave con nombre/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Obra: Nave con nombre/ })).toBeInTheDocument();
  });
});
