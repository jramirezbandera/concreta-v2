/**
 * Smoke de integración del módulo de incendio en jsdom.
 *
 * Los tres casos vivían en el DOM del cuadro de materiales y se mudan con la
 * tabla. Lo que prueban no se puede probar en un test puro: que el cable entre
 * el formulario, la evaluación, el documento y la publicación existe.
 *
 * El cuarto es nuevo y es el que cierra la mudanza: que lo que se teclea aquí
 * llega al sobre, que es de donde el cuadro de materiales lo lee ahora.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ThemeProvider } from '../../lib/theme/ThemeProvider';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';
import { ToastContainer } from '../../components/ui/Toast';
import { IncendioModule } from '../../features/incendio';
import { MODULO_PUB, PUB_VERSION, type PubIncendio } from '../../features/incendio/state';
import { leerPublicacion } from '../../lib/pub';

vi.mock('../../components/layout/AppShell', () => ({
  useDrawer: () => ({ openDrawer: vi.fn() }),
}));

function montar() {
  return render(
    <MemoryRouter initialEntries={['/acciones/incendio']}>
      <ThemeProvider>
        <UnitSystemProvider>
          <ToastContainer />
          <IncendioModule />
        </UnitSystemProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

/** Añade una exigencia eligiendo un ámbito del menú y su R. */
function exigirFuego(ambito: string, minutos: string) {
  fireEvent.click(screen.getByRole('button', { name: '+ Añadir exigencia' }));
  fireEvent.click(screen.getByRole('menuitem', { name: ambito }));
  fireEvent.change(screen.getByLabelText(`Resistencia al fuego de ${ambito}`), {
    target: { value: minutos },
  });
}

beforeEach(() => {
  localStorage.clear();
});

describe('las exigencias de resistencia al fuego', () => {
  it('sólo salen en el documento si se indican', () => {
    montar();
    expect(
      screen.queryByText(/Resistencia al fuego exigida a la estructura/),
    ).not.toBeInTheDocument();
    exigirFuego('Toda la estructura', '60');
    expect(
      screen.getByText(/Resistencia al fuego exigida a la estructura: R60/),
    ).toBeInTheDocument();
  });

  it('el sótano, las plantas y la cubierta pueden pedir R distintas a la vez', () => {
    montar();
    exigirFuego('Sótano con aparcamiento', '120');
    exigirFuego('Cubierta ligera', '30');
    expect(
      screen.getByText(/R120 en el sótano con aparcamiento; R30 en la cubierta ligera/),
    ).toBeInTheDocument();
  });

  it('una exigencia sin R es un hueco y no se imprime a medias', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: '+ Añadir exigencia' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cubierta ligera' }));
    expect(screen.getByText(/1 sin resolver/)).toBeInTheDocument();
    expect(
      screen.queryByText(/Resistencia al fuego exigida a la estructura/),
    ).not.toBeInTheDocument();
  });

  it('lo tecleado llega al sobre, que es de donde lo lee el cuadro de materiales', () => {
    montar();
    exigirFuego('Plantas sobre rasante', '90');
    const sobre = leerPublicacion<PubIncendio>(MODULO_PUB, PUB_VERSION);
    expect(sobre?.datos.exigencias).toEqual([{ ambito: 'Plantas sobre rasante', minutos: 90 }]);
    expect(sobre?.configurado).toBe(true);
  });

  it('sin nada tecleado no se publica sobre ninguno', () => {
    montar();
    expect(leerPublicacion(MODULO_PUB, PUB_VERSION)).toBeNull();
  });
});

/**
 * El cable de F2: elegir el uso de un sector tiene que traer la R de la tabla
 * 3.1 a la pantalla y al documento, y cambiar la altura de evacuación tiene que
 * cambiar de columna. Es lo que no se puede probar en el test puro de
 * `resolverSectores`: que el formulario llegue al motor y el motor a la hoja.
 */
describe('los sectores, de la tabla 3.1 a la pantalla', () => {
  /** Añade un sector por el menú y le dice qué es. */
  function sector(nombre: string, clase: string) {
    fireEvent.click(screen.getByRole('button', { name: '+ Añadir sector' }));
    fireEvent.click(screen.getByRole('menuitem', { name: nombre }));
    fireEvent.change(screen.getByLabelText(`Qué es ${nombre}`), { target: { value: clase } });
  }

  it('el uso trae la R, y el documento dice de dónde sale', () => {
    montar();
    // Sin plantas publicadas, la altura de evacuación se teclea.
    fireEvent.change(screen.getByLabelText('Altura de evacuación del edificio'), {
      target: { value: '12' },
    });
    sector('Plantas sobre rasante', 'uso:residencialVivienda');

    expect(screen.getByText(/según tabla 3\.1 del DB SI 6/)).toBeInTheDocument();
    expect(screen.getByText(/R60 en las plantas sobre rasante/)).toBeInTheDocument();
  });

  it('y subir el edificio por encima de 28 m cambia de columna', () => {
    montar();
    fireEvent.change(screen.getByLabelText('Altura de evacuación del edificio'), {
      target: { value: '12' },
    });
    sector('Plantas sobre rasante', 'uso:residencialVivienda');
    expect(screen.getByText(/R60 en las plantas sobre rasante/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Altura de evacuación del edificio'), {
      target: { value: '35' },
    });
    expect(screen.getByText(/R120 en las plantas sobre rasante/)).toBeInTheDocument();
  });

  it('un sector sin decir qué es queda como hueco', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: '+ Añadir sector' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sótano' }));
    expect(screen.getByText(/1 sin resolver/)).toBeInTheDocument();
  });

  it('sin plantas publicadas lo dice y ofrece el módulo que las tiene', () => {
    montar();
    expect(screen.getByText(/Las plantas salen de/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Abrir Cargas por planta/ })).toBeInTheDocument();
  });
});
