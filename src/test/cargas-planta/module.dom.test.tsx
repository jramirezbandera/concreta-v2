/**
 * Smoke de integración del módulo en jsdom: que el cable entre la tabla, el
 * motor, la sección, la publicación de Viento y nieve y la publicación propia
 * existe.
 *
 *   1. arranca con tres plantas, calcula y publica;
 *   2. cambiar el uso cambia la columna derivada;
 *   3. el peso propio se pisa y se recupera desde la ficha de la fila;
 *   4. la nieve publicada se toma desde la ficha de la cubierta;
 *   5. las columnas de «lo que hay encima» se añaden y se quitan enteras;
 *   6. la fila abierta se resalta en la sección y al revés;
 *   7. el desplegable «Exportar» de la barra entrega el Word y el Excel.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ThemeProvider } from '../../lib/theme/ThemeProvider';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';
import { ToastContainer } from '../../components/ui/Toast';
import { CargasPlantaModule } from '../../features/cargas-planta';
import { MODULO_PUB, type PubCargasPlanta } from '../../features/cargas-planta/state';
import { defaultVientoNieveState, evaluar as evaluarVN, publicarResultado as publicarVN } from '../../features/viento-nieve/state';
import { leerPublicacion } from '../../lib/pub';

vi.mock('../../components/layout/AppShell', () => ({
  useDrawer: () => ({ openDrawer: vi.fn() }),
}));

const exportarCargasPlantaDocx = vi.fn(async (_blocks: unknown, titulo?: string) => ({
  blob: new Blob(['x'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
  filename: titulo ? `${titulo.toLowerCase().replace(/ /g, '-')}.docx` : 'cargas-por-planta.docx',
}));
vi.mock('../../lib/docx/cargasPlanta', () => ({
  exportarCargasPlantaDocx: (blocks: unknown, titulo?: string) => exportarCargasPlantaDocx(blocks, titulo),
}));
const exportarCargasPlantaXlsx = vi.fn(async (_secciones: unknown, titulo?: string) => ({
  blob: new Blob(['x'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
  filename: titulo ? `${titulo.toLowerCase().replace(/ /g, '-')}.xlsx` : 'cargas-por-planta.xlsx',
}));
vi.mock('../../lib/xlsx/cargasPlanta', () => ({
  exportarCargasPlantaXlsx: (secciones: unknown, titulo?: string) => exportarCargasPlantaXlsx(secciones, titulo),
}));

function montar() {
  return render(
    <MemoryRouter initialEntries={['/acciones/cargas-planta']}>
      <ThemeProvider>
        <UnitSystemProvider>
          <ToastContainer />
          <CargasPlantaModule />
        </UnitSystemProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

/** Viento y nieve publicado en Madrid a 660 m: zona A, aspereza IV, sk 0,56. */
function publicarMadrid() {
  const vn = defaultVientoNieveState();
  vn.emplazamiento = { ...vn.emplazamiento, provincia: '28', municipio: 'Madrid', altitud: 660 };
  publicarVN(vn, evaluarVN(vn));
}

/**
 * El único sitio que sabe cómo se pide cada formato en la barra: abre el
 * desplegable «Exportar» y elige la opción por su formato. Cada opción lleva
 * además su destino («para pegar en…»), de ahí el prefijo.
 */
function pulsarExportar(formato: 'docx' | 'xlsx') {
  fireEvent.click(screen.getByRole('button', { name: 'Exportar' }));
  fireEvent.click(screen.getByRole('menuitem', { name: formato === 'docx' ? /^Word/ : /^Excel/ }));
}

/** La fila de una zona por su nombre de planta; abrirla enseña su ficha. */
const filaDe = (planta: string) => screen.getByLabelText('Nombre de la planta', { selector: `input[value="${planta}"]` }).closest('tr') as HTMLTableRowElement;
const abrirFicha = (planta: string) => fireEvent.click(within(filaDe(planta)).getByText('toda'));

beforeEach(() => {
  localStorage.clear();
  exportarCargasPlantaDocx.mockClear();
  exportarCargasPlantaXlsx.mockClear();
});

afterEach(() => {
  cleanup();
});

describe('Cargas por planta — la tabla', () => {
  it('arranca con tres plantas, calcula con la norma y publica', async () => {
    montar();

    // Una fila por zona, con su nombre de planta editable.
    expect(screen.getAllByLabelText('Nombre de la planta')).toHaveLength(3);
    // El peso propio del reticular de 30 cm sale de la tabla C.5.
    expect(screen.getAllByText('tabla C.5').length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText(/3 plantas · 3 zonas/)).toBeInTheDocument();
    expect(screen.getByText(/^· publicado$/)).toBeInTheDocument();

    await waitFor(() => {
      const sobre = leerPublicacion<PubCargasPlanta>(MODULO_PUB, 1);
      expect(sobre?.datos.plantas).toHaveLength(3);
    });
  });

  it('las columnas de «lo que hay encima» son la unión de la obra', () => {
    montar();
    // Arranque: solado y tabiquería en las plantas de piso, grava en la cubierta.
    expect(screen.getByRole('columnheader', { name: /Solado/ })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Tabiquería/ })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /^Cubierta/ })).toBeInTheDocument();
  });

  it('cambiar el uso cambia la sobrecarga que pone la norma', () => {
    montar();
    const uso = screen.getByLabelText('Uso de Planta Baja');
    fireEvent.change(uso, { target: { value: 'C4' } });
    expect(uso).toHaveValue('C4');
    // 5 kN/m² de gimnasio, con el rótulo de la tabla 3.1 en el title.
    expect(screen.getByTitle('C4 — gimnasios')).toHaveTextContent('5,00');
  });

  it('el peso propio se pisa tecleándolo y se recupera desde la ficha', () => {
    montar();
    const pp = screen.getByLabelText('Peso propio de Planta Baja');
    fireEvent.change(pp, { target: { value: '6,2' } });
    expect(pp).toHaveValue('6,2');

    // Con valor propio, la fila ofrece volver a la norma.
    fireEvent.click(screen.getByRole('button', { name: 'Usar el peso propio de la norma en Planta Baja' }));
    expect(screen.getByLabelText('Peso propio de Planta Baja')).toHaveValue('5');
  });

  it('un forjado sin peso en la norma es un error que bloquea la exportación', async () => {
    montar();
    fireEvent.change(screen.getByLabelText('Tipo de forjado de Planta Baja'), { target: { value: 'madera' } });

    expect(screen.getByText(/«Planta Baja»: indique el peso propio del forjado/)).toBeInTheDocument();
    expect(screen.getByText(/^· sin publicar$/)).toBeInTheDocument();

    pulsarExportar('docx');
    expect(await screen.findByText('Corrija los errores antes de exportar')).toBeInTheDocument();
    expect(screen.queryByLabelText('Título del elemento')).not.toBeInTheDocument();
  });
});

describe('Cargas por planta — la ficha de la fila', () => {
  it('se abre al pulsar la fila y enseña lo que dice la norma', () => {
    montar();
    expect(screen.queryByLabelText('Portal, meseta o escalera en Planta Baja')).not.toBeInTheDocument();

    abrirFicha('Planta Baja');
    expect(screen.getByLabelText('Portal, meseta o escalera en Planta Baja')).toBeInTheDocument();
    expect(screen.getByText(/Tabla C.5 para un grueso de 30 cm/)).toBeInTheDocument();

    // Volver a pulsarla la cierra.
    abrirFicha('Planta Baja');
    expect(screen.queryByLabelText('Portal, meseta o escalera en Planta Baja')).not.toBeInTheDocument();
  });

  it('el incremento de escaleras de la ficha llega a la sobrecarga de la tabla', () => {
    montar();
    abrirFicha('Planta Baja');
    fireEvent.click(screen.getByLabelText('Portal, meseta o escalera en Planta Baja'));
    // Viviendas 2,00 + 1,00 del art. 3.1.1-3, y sólo en esta planta.
    const [primera, baja] = screen.getAllByTitle('A1 — viviendas');
    expect(baja).toHaveTextContent('3,00');
    expect(primera).toHaveTextContent('2,00');
  });

  it('trae la nieve del sobre de Viento y nieve y avisa cuando el sobre cambia', async () => {
    publicarMadrid();
    montar();

    abrirFicha('Cubierta');
    fireEvent.click(screen.getByRole('button', { name: /Usar la nieve publicada \(0,56 kN\/m²\)/ }));

    expect(screen.getByLabelText('Origen de la nieve de Cubierta')).toHaveValue('publicada');
    expect(screen.getByText('qn = 0,56 kN/m²')).toBeInTheDocument();
    expect(screen.getByTitle('Carga de nieve de la cubierta')).toHaveTextContent('0,56');

    // Un sobre más nuevo: aviso ámbar, sin bloquear.
    await new Promise((r) => setTimeout(r, 5));
    publicarMadrid();
    fireEvent.change(screen.getByLabelText('Municipio'), { target: { value: 'Madrid' } });
    expect(screen.getByText(/«Cubierta»: Viento y nieve ha publicado de nuevo/)).toBeInTheDocument();
    expect(screen.getByText(/1 aviso/)).toBeInTheDocument();
  });
});

describe('Cargas por planta — las columnas de encima', () => {
  it('añadir una columna la pone en las zonas que no la tienen', () => {
    montar();
    fireEvent.change(screen.getByLabelText('Añadir una carga permanente a todas las zonas'), { target: { value: 'agua' } });

    expect(screen.getByRole('columnheader', { name: /Agua/ })).toBeInTheDocument();
    // Se teclea por espesor: la celda pide metros en todas las filas.
    expect(screen.getAllByLabelText(/^Espesor de Agua/)).toHaveLength(3);
  });

  it('quitar una columna la quita de todas las zonas', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: /Quitar Tabiquería de todas las zonas/ }));
    expect(screen.queryByRole('columnheader', { name: /Tabiquería/ })).not.toBeInTheDocument();
  });
});

describe('Cargas por planta — la sección', () => {
  it('dibuja un bloque por zona y lo selecciona con la fila', () => {
    montar();
    const bloques = screen.getAllByRole('button', { name: /^Seleccionar / });
    // En el orden de la tabla, que es el de la sección: de la cubierta abajo.
    expect(bloques.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Seleccionar Cubierta',
      'Seleccionar Planta Primera',
      'Seleccionar Planta Baja',
    ]);

    // Del dibujo a la fila: pulsar el bloque abre la ficha de esa zona.
    fireEvent.click(bloques[2]);
    expect(screen.getByLabelText('Portal, meseta o escalera en Planta Baja')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Seleccionar Planta Baja' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('Cargas por planta — exportación', () => {
  it('«Word» entrega la memoria', async () => {
    montar();
    pulsarExportar('docx');

    const modal = await screen.findByRole('dialog');
    expect(within(modal).getByText('cargas-por-planta.docx')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Título del elemento'), { target: { value: 'Edificio en Madrid' } });
    fireEvent.click(within(modal).getByRole('button', { name: /Exportar|Descargar/ }));

    await waitFor(() => expect(exportarCargasPlantaDocx).toHaveBeenCalledTimes(1));
    expect(exportarCargasPlantaXlsx).not.toHaveBeenCalled();
  });

  it('«Excel» entrega el cuadro del plano', async () => {
    montar();
    pulsarExportar('xlsx');

    const modal = await screen.findByRole('dialog');
    expect(within(modal).getByText('cargas-por-planta.xlsx')).toBeInTheDocument();
    fireEvent.click(within(modal).getByRole('button', { name: /Exportar|Descargar/ }));

    await waitFor(() => expect(exportarCargasPlantaXlsx).toHaveBeenCalledTimes(1));
    expect(exportarCargasPlantaDocx).not.toHaveBeenCalled();
  });
});
