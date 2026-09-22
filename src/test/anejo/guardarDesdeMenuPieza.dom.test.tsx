/**
 * «Guardar en el anejo» desde el desplegable «Exportar» de un módulo de PIEZA,
 * con Vigas de hormigón como representante de los veintiuno. (Vigas entrega
 * además el cuadro de plano en DXF, así que la promesa de «dos destinos y nada
 * más» se comprueba sobre `ExportarPdfMenu`, que es lo que comparten los otros
 * veinte.)
 *
 * Lo que se comprueba es el atajo entero: la opción está en el desplegable, el
 * modal del título dice a dónde va —y lo recalcula con lo que se teclea, que
 * es lo que decide si actualiza el capítulo abierto o estrena uno—, y al
 * confirmar la pieza entra en el anejo SIN pasar por la previsualización y sin
 * descargar nada. Antes esto eran cinco gestos con el visor de por medio.
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IDBFactory } from 'fake-indexeddb';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExportarPdfMenu } from '../../components/layout/ExportarPdfMenu';
import { ToastContainer } from '../../components/ui/Toast';
import { rcBeamDefaults } from '../../data/defaults';
import { RCBeamsModule } from '../../features/rc-beams';
import { piezas } from '../../lib/anejo';
import { _reiniciarBlobsParaTests, leerBlob } from '../../lib/anejo/blobs';
import { triggerDownload } from '../../lib/export/descargar';
import { _reiniciarProyectoParaTests, guardarComoNueva } from '../../lib/proyecto';
import { _reiniciarAlmacenParaTests } from '../../lib/storage/seguro';
import { ThemeProvider } from '../../lib/theme/ThemeProvider';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';

vi.mock('../../components/layout/AppShell', () => ({
  useDrawer: () => ({ openDrawer: vi.fn() }),
}));
// El PDF de verdad tiene sus tests (`test/rc-beams/pdfTitle`): aquí, el cable.
const URL_BLOB = 'blob:http://localhost/0000-viga';
vi.mock('../../lib/pdf/rcBeams', () => ({
  exportRCBeamsPDF: vi.fn(async (_s: unknown, _r: unknown, _u: unknown, title?: string) => ({
    blobUrl: URL_BLOB,
    filename: `${(title ?? 'viga').toLowerCase().replace(/ /g, '-')}.pdf`,
    pageCount: 2,
  })),
  rcBeamsFallbackFilename: () => 'concreta-viga.pdf',
}));
vi.mock('../../lib/export/descargar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/export/descargar')>()),
  triggerDownload: vi.fn(),
}));

const PDF = new Blob(['%PDF-1.4 viga'], { type: 'application/pdf' });

function montar(ruta = '/horm/vigas') {
  localStorage.setItem('rc-beams', JSON.stringify({ ...rcBeamDefaults, mode: 'portico' }));
  localStorage.setItem('rc-beams-version', '1');
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[ruta]}>
        <ThemeProvider>
          <UnitSystemProvider>
            <ToastContainer />
            <RCBeamsModule />
          </UnitSystemProvider>
        </ThemeProvider>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

/** Abrir el desplegable de la barra y elegir un destino. */
function elegir(destino: RegExp) {
  fireEvent.click(screen.getByLabelText('Exportar'));
  fireEvent.click(screen.getByRole('menuitem', { name: destino }));
}

const dialogo = () => screen.getByRole('dialog');

async function escribirYConfirmar(nombre: string) {
  const user = userEvent.setup();
  const caja = within(dialogo()).getByRole('textbox');
  await user.clear(caja);
  await user.type(caja, nombre);
  await user.click(within(dialogo()).getByRole('button', { name: 'Guardar en el anejo' }));
}

beforeEach(() => {
  localStorage.clear();
  _reiniciarAlmacenParaTests();
  _reiniciarProyectoParaTests();
  _reiniciarBlobsParaTests();
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
  vi.mocked(triggerDownload).mockClear();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => PDF }) as unknown as Response));
});

afterEach(() => {
  vi.unstubAllGlobals();
  _reiniciarBlobsParaTests();
});

describe('Módulo de pieza — «Guardar en el anejo» desde el desplegable', () => {
  it('los dos destinos del PDF son los que ofrece `ExportarPdfMenu`', () => {
    // El desplegable genérico de los módulos de una sola salida, montado
    // aparte. Antes esto se comprobaba sobre el menú de Vigas, que era uno de
    // ellos; desde que Vigas entrega además el cuadro de plano en DXF ya no lo
    // es, y la promesa que hay que guardar es la del componente que sí
    // comparten los veinte restantes.
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={['/horm/vigas']}>
          <ThemeProvider>
            <ExportarPdfMenu onElegir={vi.fn()} />
          </ThemeProvider>
        </MemoryRouter>
      </HelmetProvider>,
    );
    fireEvent.click(screen.getByLabelText('Exportar'));
    const opciones = screen.getAllByRole('menuitem').map((o) => o.textContent);
    expect(opciones).toHaveLength(2);
    expect(opciones[0]).toMatch(/^PDF/);
    expect(opciones[1]).toMatch(/^Guardar en el anejo/);
  });

  it('el de Vigas añade el DXF del cuadro de plano, sin mover los otros dos', () => {
    montar();
    fireEvent.click(screen.getByLabelText('Exportar'));
    const opciones = screen.getAllByRole('menuitem').map((o) => o.textContent);
    expect(opciones).toHaveLength(3);
    expect(opciones[0]).toMatch(/^PDF/);
    expect(opciones[1]).toMatch(/^DXF/);
    expect(opciones[2]).toMatch(/^Guardar en el anejo/);
  });

  it('guarda la pieza con su título y sus páginas, sin previsualizar ni descargar', async () => {
    guardarComoNueva('Nave del menú');
    montar();
    elegir(/Guardar en el anejo/);

    // El modal dice a dónde va esto, no «Se descargará como…».
    expect(dialogo().textContent).toMatch(/Entra en el anejo de esta obra como capítulo/);
    expect(dialogo().textContent).not.toMatch(/Se descargará como/);
    await escribirYConfirmar('V-3');

    await waitFor(() => expect(piezas()).toHaveLength(1));
    expect(piezas()[0]).toMatchObject({ modulo: 'concreta-rc-beams', titulo: 'V-3', paginas: 2 });
    const guardado = await leerBlob(piezas()[0].blobId);
    expect(guardado?.size).toBe(PDF.size);
    expect(await screen.findByText(/Guardado en el anejo: «V-3» · 2 páginas/)).toBeTruthy();

    // Ni visor ni descarga: el PDF no ha pasado por delante del usuario.
    expect(screen.queryByText('Previsualización PDF')).toBeNull();
    expect(vi.mocked(triggerDownload)).not.toHaveBeenCalled();
  });

  it('con la pieza abierta, la línea del modal dice si actualiza o estrena capítulo', async () => {
    const user = userEvent.setup();
    guardarComoNueva('Nave del menú');
    montar();
    elegir(/Guardar en el anejo/);
    await escribirYConfirmar('V-3');
    await waitFor(() => expect(piezas()).toHaveLength(1));

    // Mismo nombre: pisa el capítulo que el módulo tiene abierto.
    elegir(/Guardar en el anejo/);
    expect(dialogo().textContent).toMatch(/Actualiza el capítulo 1 del anejo/);

    // Otro nombre: pieza nueva, y la V-3 se queda donde estaba.
    await user.clear(within(dialogo()).getByRole('textbox'));
    await user.type(within(dialogo()).getByRole('textbox'), 'V-4');
    expect(dialogo().textContent).toMatch(/le has cambiado el nombre.*«V-3» se queda/);
  });

  it('«PDF» sigue abriendo la previsualización de siempre', async () => {
    montar();
    elegir(/^PDF/);
    // Ese modal sí promete una descarga, y la promete con el nombre real.
    const caja = within(dialogo()).getByRole('textbox');
    fireEvent.change(caja, { target: { value: 'V-9' } });
    expect(dialogo().textContent).toMatch(/Se descargará como/);
    fireEvent.click(within(dialogo()).getByRole('button', { name: 'Exportar PDF' }));
    expect(await screen.findByText('Previsualización PDF')).toBeTruthy();
    expect(piezas()).toHaveLength(0);
  });
});
