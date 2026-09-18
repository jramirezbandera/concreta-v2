/**
 * «Reconstruir el PDF»: la pieza que perdió su papel —una obra traída de otra
 * máquina— se rehace sola. La pantalla del anejo la abre en su módulo, el
 * módulo la vuelve a exportar sobre SU capítulo y devuelve al usuario al
 * anejo.
 *
 * Lo que de verdad se comprueba aquí es que NO se duplica: el fallo que esto
 * viene a arreglar era ir al módulo, guardar, y acabar con dos capítulos «V-3»
 * —uno con PDF y otro sin él— y tener que borrar el viejo a mano.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IDBFactory } from 'fake-indexeddb';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastContainer } from '../../components/ui/Toast';
import { AnejoModule } from '../../features/anejo';
import { RCBeamsModule } from '../../features/rc-beams';
import { adaptadorDe, escribirAnejo, piezas, type Pieza } from '../../lib/anejo';
import { _reiniciarBlobsParaTests, idsDeBlobs, leerBlob } from '../../lib/anejo/blobs';
import { cerrarTanda, pedirReconstruir, _reiniciarReconstruccionParaTests } from '../../lib/anejo/reconstruccion';
import { _reiniciarProyectoParaTests, guardarComoNueva } from '../../lib/proyecto';
import { _reiniciarAlmacenParaTests } from '../../lib/storage/seguro';
import { ThemeProvider } from '../../lib/theme/ThemeProvider';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';

vi.mock('../../components/layout/AppShell', () => ({
  useDrawer: () => ({ openDrawer: vi.fn() }),
}));
const URL_BLOB = 'blob:http://localhost/0000-rehecho';
vi.mock('../../lib/pdf/rcBeams', () => ({
  exportRCBeamsPDF: vi.fn(async (_s: unknown, _r: unknown, _u: unknown, title?: string) => ({
    blobUrl: URL_BLOB,
    filename: `${title ?? 'viga'}.pdf`,
    pageCount: 3,
  })),
  rcBeamsFallbackFilename: () => 'concreta-viga.pdf',
}));
vi.mock('../../lib/export/descargar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/export/descargar')>()),
  triggerDownload: vi.fn(),
}));

const REHECHO = new Blob(['%PDF-1.4 rehecho'], { type: 'application/pdf' });
const V3 = '{"title":"Viga V-3","L":9,"mode":"portico"}';
const V4 = '{"title":"Viga V-4","L":5,"mode":"portico"}';

function pieza(id: string, titulo: string, datos: string): Pieza {
  const vigas = adaptadorDe('concreta-rc-beams');
  return {
    id,
    modulo: 'concreta-rc-beams',
    clave: 'rc-beams',
    titulo,
    ts: '2026-09-18T10:00:00.000Z',
    esquema: vigas.entrada.versionViva,
    // El PDF NO está en esta máquina: es justo el caso.
    blobId: `blob-${id}`,
    paginas: 2,
    huella: 'de-otra-maquina',
    datos: { 'rc-beams': datos, 'rc-beams-version': vigas.entrada.versionViva },
    tituloEnPdf: true,
    incluida: true,
  };
}

function Donde() {
  return <span data-testid="ruta">{useLocation().pathname}</span>;
}

function montar() {
  return render(
    <HelmetProvider>
      <ThemeProvider>
        <UnitSystemProvider>
          <MemoryRouter initialEntries={['/proyecto/anejo']}>
            <ToastContainer />
            <Donde />
            <Routes>
              <Route path="/proyecto/anejo" element={<AnejoModule />} />
              <Route path="/horm/vigas" element={<RCBeamsModule />} />
            </Routes>
          </MemoryRouter>
        </UnitSystemProvider>
      </ThemeProvider>
    </HelmetProvider>,
  );
}

const ruta = () => screen.getByTestId('ruta').textContent;

beforeEach(() => {
  localStorage.clear();
  _reiniciarAlmacenParaTests();
  _reiniciarProyectoParaTests();
  _reiniciarBlobsParaTests();
  _reiniciarReconstruccionParaTests();
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => REHECHO }) as unknown as Response));
  guardarComoNueva('Obra traída de otra máquina');
});

afterEach(() => {
  vi.unstubAllGlobals();
  _reiniciarBlobsParaTests();
  _reiniciarReconstruccionParaTests();
});

describe('reconstruir el PDF de una pieza', () => {
  it('rehace su capítulo en el sitio, sin duplicarlo, y vuelve al anejo', async () => {
    const user = userEvent.setup();
    escribirAnejo({ v: 1, piezas: [pieza('p1', 'Viga V-3', V3)] });
    montar();

    await user.click(await screen.findByRole('button', { name: 'Reconstruir el PDF' }));

    await waitFor(() => expect(ruta()).toBe('/proyecto/anejo'), { timeout: 4000 });
    // Sigue habiendo UNA pieza, con su id y su título: se ha actualizado.
    const lista = piezas();
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ id: 'p1', titulo: 'Viga V-3', paginas: 3 });
    // Y ahora su PDF está en esta máquina.
    expect(await idsDeBlobs()).toEqual([lista[0].blobId]);
    expect(await (await leerBlob(lista[0].blobId))?.text()).toBe('%PDF-1.4 rehecho');
    expect(await screen.findByText(/1 capítulo con su PDF otra vez en el anejo/)).toBeInTheDocument();
  });

  it('el módulo se queda con los datos de la pieza rehecha, no con los que hubiera', async () => {
    const user = userEvent.setup();
    localStorage.setItem('rc-beams', '{"title":"Otra cosa","L":3,"mode":"portico"}');
    escribirAnejo({ v: 1, piezas: [pieza('p1', 'Viga V-3', V3)] });
    montar();

    await user.click(await screen.findByRole('button', { name: 'Reconstruir el PDF' }));
    await waitFor(() => expect(ruta()).toBe('/proyecto/anejo'), { timeout: 4000 });
    expect(localStorage.getItem('rc-beams')).toBe(V3);
  });

  it('en tanda: las dos piezas pasan por su módulo y las dos quedan con PDF', async () => {
    const user = userEvent.setup();
    escribirAnejo({ v: 1, piezas: [pieza('p1', 'Viga V-3', V3), pieza('p2', 'Viga V-4', V4)] });
    montar();

    await user.click(await screen.findByRole('button', { name: 'Reconstruir los 2' }));

    await waitFor(() => expect(screen.getByText(/2 capítulos con su PDF otra vez en el anejo/)).toBeInTheDocument(), {
      timeout: 6000,
    });
    expect(ruta()).toBe('/proyecto/anejo');
    const lista = piezas();
    expect(lista.map((p) => p.titulo)).toEqual(['Viga V-3', 'Viga V-4']);
    expect((await idsDeBlobs()).sort()).toEqual(lista.map((p) => p.blobId).sort());
  });

  it('cerrar la tanda dos veces no anuncia una segunda vez', () => {
    // React en modo estricto ejecuta el efecto dos veces con la misma
    // instantánea: sin esto, encima del recuento bueno salía «0 capítulos».
    pedirReconstruir([{ piezaId: 'p1', modulo: 'concreta-rc-beams', titulo: 'Viga V-3' }]);
    expect(cerrarTanda()).toMatchObject({ total: 1 });
    expect(cerrarTanda()).toBeNull();
  });

  it('sin datos no se puede rehacer, y la fila lo dice en vez de ofrecerlo', async () => {
    escribirAnejo({ v: 1, piezas: [{ ...pieza('p1', 'Viga V-3', V3), datos: null }] });
    montar();
    expect(await screen.findByText(/no se puede rehacer/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reconstruir el PDF' })).toBeNull();
  });
});
