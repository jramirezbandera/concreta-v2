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
import { leerPublicacion, publicar } from '../../lib/pub';

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

  it('quitar el único sector retira el sobre: el cuadro de materiales no puede seguir imprimiendo su R', () => {
    montar();
    fireEvent.change(screen.getByLabelText('Altura de evacuación del edificio'), {
      target: { value: '12' },
    });
    sector('Plantas sobre rasante', 'uso:residencialVivienda');
    expect(leerPublicacion<PubIncendio>(MODULO_PUB, PUB_VERSION)?.datos.exigencias).toEqual([
      { ambito: 'Plantas sobre rasante', minutos: 60 },
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Quitar Plantas sobre rasante' }));
    expect(leerPublicacion(MODULO_PUB, PUB_VERSION)).toBeNull();
  });

  it('cambiar la familia del revestimiento tira el λp tecleado: era el del producto de antes', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: '+ Añadir elemento' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Jácenas metálicas' }));
    const de = (que: string) => screen.getByLabelText(`${que} Jácenas metálicas`);
    fireEvent.change(de('Material de'), { target: { value: 'acero' } });
    fireEvent.change(de('Perfil de'), { target: { value: 'IPE 300' } });
    fireEvent.change(de('Resistencia exigida a'), { target: { value: '60' } });

    // Una IPE 300 desnuda no llega a R 60: pide protección, y con una lana
    // hay que teclear el λp del producto.
    fireEvent.change(de('Protección de'), { target: { value: 'lanaMineral' } });
    fireEvent.change(de('Conductividad declarada del revestimiento de'), { target: { value: '0.25' } });
    expect(de('Conductividad declarada del revestimiento de')).toHaveValue(0.25);

    // Con un silicato el λp de la lana no vale: la casilla vuelve en blanco.
    fireEvent.change(de('Protección de'), { target: { value: 'silicatoCalcico' } });
    expect(de('Conductividad declarada del revestimiento de')).toHaveValue(null);
  });

  it('una zona de riesgo especial también puede estar bajo rasante, y entonces se compara con el sótano', () => {
    montar();
    fireEvent.change(screen.getByLabelText('Altura de evacuación del edificio'), {
      target: { value: '12' },
    });
    sector('Plantas sobre rasante', 'uso:residencialVivienda'); // R 60
    sector('Aparcamiento', 'uso:aparcamientoBajoOtroUso'); // R 120
    fireEvent.click(screen.getByLabelText('Aparcamiento está bajo rasante'));

    fireEvent.click(screen.getByRole('button', { name: '+ Añadir sector' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Otro sector… (en blanco)' }));
    const nombres = screen.getAllByLabelText('Nombre del sector');
    fireEvent.change(nombres[nombres.length - 1], { target: { value: 'Sala de calderas' } });
    fireEvent.change(screen.getByLabelText('Qué es Sala de calderas'), { target: { value: 'riesgo:bajo' } });

    // Sin decir de qué lado está, la llamada (1) la compara con las plantas
    // de arriba: R 90 de la tabla contra R 60 → R 90.
    const r = () => screen.getByLabelText<HTMLSelectElement>('Resistencia al fuego de Sala de calderas').options[0].textContent;
    expect(r()).toContain('R90');

    // Antes esta casilla no existía en las zonas de riesgo, y la sala de
    // calderas del aparcamiento salía R 90 donde toca R 120.
    fireEvent.click(screen.getByLabelText('Sala de calderas está bajo rasante'));
    expect(r()).toContain('R120');
  });
});

/**
 * Con plantas publicadas. El sobre de «Cargas por planta» va de arriba abajo y
 * los cantos en centímetros, como los escribe aquel módulo.
 */
describe('con las plantas de Cargas por planta', () => {
  type Zona = { fila: string; forjado: { canto: number | null } };
  const publicarPlantas = (plantas: [string, boolean, Zona[]][]) =>
    publicar(
      'cargas-planta',
      1,
      { plantas: plantas.map(([nombre, esCubierta, zonas]) => ({ nombre, esCubierta, zonas })) },
      {},
      true,
    );
  const zona = (fila: string, canto: number | null = 30): Zona => ({ fila, forjado: { canto } });

  function sector(nombre: string, clase: string) {
    fireEvent.click(screen.getByRole('button', { name: '+ Añadir sector' }));
    fireEvent.click(screen.getByRole('menuitem', { name: nombre }));
    fireEvent.change(screen.getByLabelText(`Qué es ${nombre}`), { target: { value: clase } });
  }
  const altura = (planta: string, m: string) =>
    fireEvent.change(screen.getByLabelText(`Altura de ${planta}`), { target: { value: m } });

  it('con una altura en blanco no se imprime ninguna R ni se publica, y el hueco dice cuál falta', () => {
    publicarPlantas([
      ['Cubierta', true, [zona('G1')]],
      ['Planta Segunda', false, [zona('A1')]],
      ['Planta Primera', false, [zona('A1')]],
      ['Planta Baja', false, [zona('A1')]],
    ]);
    montar();
    sector('Plantas sobre rasante', 'uso:residencialVivienda');
    altura('Planta Baja', '3.2');

    // Antes: 3,20 m —la cota más alta que pudo acumular— y R 60, impresos y
    // publicados, sin ninguna señal. Con la cadena entera son 9,20 m.
    expect(screen.queryByText(/Resistencia al fuego exigida a la estructura/)).not.toBeInTheDocument();
    expect(leerPublicacion(MODULO_PUB, PUB_VERSION)).toBeNull();
    expect(screen.getByText(/2 sin resolver/)).toBeInTheDocument();
    expect(screen.getByText(/Faltan las alturas de Planta Primera y Planta Segunda/)).toBeInTheDocument();

    altura('Planta Primera', '3');
    altura('Planta Segunda', '3');
    expect(screen.getByText(/R60 en las plantas sobre rasante/)).toBeInTheDocument();
    // Hasta el forjado de la segunda: la cubierta es de conservación y no cuenta.
    expect(leerPublicacion<PubIncendio>(MODULO_PUB, PUB_VERSION)?.datos.alturaEvacuacion).toBeCloseTo(6.2, 10);
  });

  it('en modo libre, el canto que se teclea en una fila es el del forjado de ENCIMA, y ahí se guarda', () => {
    // La cubierta tiene dos cantos distintos en Cargas por planta: hay que
    // elegir uno, y se pide en la fila de la planta de debajo, que es la que
    // sube hasta ese forjado. Antes se escribía en la propia planta —una fila
    // más abajo de donde hacía falta— y el de la más alta no tenía casilla.
    publicarPlantas([
      ['Cubierta', true, [zona('G1', 25), zona('G1', 30)]],
      ['Planta Primera', false, [zona('A1')]],
      ['Planta Baja', false, [zona('A1')]],
    ]);
    montar();
    fireEvent.change(screen.getByLabelText('Qué altura se teclea en cada planta'), {
      target: { value: 'libre' },
    });
    altura('Planta Baja', '2.9');
    altura('Planta Primera', '2.7');

    // El canto de la primera lo publica Cargas por planta: su fila no lo pide.
    expect(screen.queryByLabelText('Canto del forjado sobre Planta Baja')).not.toBeInTheDocument();
    // El de la cubierta no: se teclea en la fila de la primera.
    fireEvent.change(screen.getByLabelText('Canto del forjado sobre Planta Primera'), {
      target: { value: '0.35' },
    });
    // 2,90 + 0,30 + 2,70 + 0,35 = 6,25 en el forjado de cubierta (en la tabla
    // y en la sección dibujada, que acota la misma cota).
    expect(screen.getAllByText('+6,25').length).toBeGreaterThan(0);
    // Y lo tecleado sigue a la vista, para poder corregirlo.
    expect(screen.getByLabelText('Canto del forjado sobre Planta Primera')).toHaveValue(0.35);
  });
});
