/**
 * Rehacer el PDF de una pieza: la obra llega con los datos de cada capítulo
 * pero sin su papel —es lo que se exporta desde el 23-09-2026— y la app lo
 * rehace sola, abriendo cada pieza en su módulo y volviendo a exportarla.
 *
 * Lo que de verdad se comprueba aquí es lo que puede salir mal de esa manera:
 *
 *  - que NO se duplique: el fallo que esto vino a arreglar era ir al módulo,
 *    guardar, y acabar con dos capítulos «V-3» —uno con PDF y otro sin él—;
 *  - que arranque SOLA al abrir la obra, con su velo por delante;
 *  - y que al terminar DEVUELVA los módulos a como estaban: una tanda de dos
 *    vigas no puede dejar en el módulo la última que pasó por él.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IDBFactory } from 'fake-indexeddb';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastContainer } from '../../components/ui/Toast';
import { PanelReconstruccion } from '../../components/anejo/PanelReconstruccion';
import { AnejoModule } from '../../features/anejo';
import { RCBeamsModule } from '../../features/rc-beams';
import { adaptadorDe, escribirAnejo, piezas, type Pieza } from '../../lib/anejo';
import { _olvidarRevisionParaTests, pedirRevisionAlAbrir } from '../../lib/anejo/alAbrir';
import { _reiniciarBlobsParaTests, idsDeBlobs, leerBlob } from '../../lib/anejo/blobs';
import { cerrarTanda, pedirReconstruir, _reiniciarReconstruccionParaTests } from '../../lib/anejo/reconstruccion';
import { _reiniciarRemonteParaTests, useRemonte } from '../../lib/anejo/remonte';
import { _olvidarPisadaParaTests } from '../../lib/anejo/tanda';
import { _reiniciarProyectoParaTests, guardarComoNueva, proyectoActivo } from '../../lib/proyecto';
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

/**
 * Las rutas con la `key` del remonte, como las lleva `AppShell`. No es
 * decorado: dos capítulos seguidos del mismo módulo no cambian de ruta, y sin
 * esa `key` el módulo no se volvería a montar —ni reclamaría el segundo
 * encargo—. La tanda de dos vigas de aquí abajo es exactamente ese caso.
 */
function Rutas() {
  const remonte = useRemonte();
  return (
    <Routes key={remonte}>
      <Route path="/proyecto/anejo" element={<AnejoModule />} />
      <Route path="/horm/vigas" element={<RCBeamsModule />} />
    </Routes>
  );
}

function montar() {
  return render(
    <HelmetProvider>
      <ThemeProvider>
        <UnitSystemProvider>
          <MemoryRouter initialEntries={['/proyecto/anejo']}>
            <ToastContainer />
            <Donde />
            <PanelReconstruccion />
            <Rutas />
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
  _reiniciarRemonteParaTests();
  _olvidarPisadaParaTests();
  _olvidarRevisionParaTests();
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => REHECHO }) as unknown as Response));
  guardarComoNueva('Obra traída de otra máquina');
});

afterEach(() => {
  vi.unstubAllGlobals();
  _reiniciarBlobsParaTests();
  _reiniciarReconstruccionParaTests();
  _olvidarPisadaParaTests();
  _olvidarRevisionParaTests();
});

describe('rehacer el PDF de una pieza', () => {
  it('al abrir la obra arranca sola, con su velo, y no hace falta tocar nada', async () => {
    escribirAnejo({ v: 1, piezas: [pieza('p1', 'Viga V-3', V3)] });
    // El recado que deja el menú de obra justo antes de la recarga.
    pedirRevisionAlAbrir(proyectoActivo() ?? '');
    montar();

    // La interfaz queda tapada mientras dura, y se dice por dónde va.
    expect(await screen.findByRole('dialog', { name: /Preparando el anejo/ })).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText(/1 capítulo con su PDF otra vez en el anejo/)).toBeInTheDocument(), {
      timeout: 6000,
    });
    // Y al acabar se quita, y devuelve al usuario donde estaba.
    expect(screen.queryByRole('dialog', { name: /Preparando el anejo/ })).toBeNull();
    await waitFor(() => expect(ruta()).toBe('/proyecto/anejo'));

    const lista = piezas();
    expect(lista).toHaveLength(1);
    expect(await idsDeBlobs()).toEqual([lista[0].blobId]);
  });

  it('el recado es de un solo uso: no se repite en la siguiente carga', async () => {
    escribirAnejo({ v: 1, piezas: [pieza('p1', 'Viga V-3', V3)] });
    pedirRevisionAlAbrir(proyectoActivo() ?? '');
    const { unmount } = montar();
    await waitFor(() => expect(screen.getByText(/1 capítulo con su PDF/)).toBeInTheDocument(), { timeout: 6000 });
    unmount();

    // Otra carga de la misma obra, sin abrirla: nada que preparar.
    montar();
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('dialog', { name: /Preparando el anejo/ })).toBeNull();
  });

  it('rehace su capítulo en el sitio, sin duplicarlo, y vuelve donde estaba', async () => {
    const user = userEvent.setup();
    escribirAnejo({ v: 1, piezas: [pieza('p1', 'Viga V-3', V3)] });
    montar();

    await user.click(await screen.findByRole('button', { name: 'Volver a intentarlo' }));

    await waitFor(() => expect(ruta()).toBe('/proyecto/anejo'), { timeout: 4000 });
    // Sigue habiendo UNA pieza, con su id y su título: se ha actualizado.
    const lista = piezas();
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ id: 'p1', titulo: 'Viga V-3', paginas: 3 });
    // La fecha es la del cálculo, no la de hoy: lo que se ha rehecho es el papel.
    expect(lista[0].ts).toBe('2026-09-18T10:00:00.000Z');
    // Y ahora su PDF está en esta máquina.
    expect(await idsDeBlobs()).toEqual([lista[0].blobId]);
    expect(await (await leerBlob(lista[0].blobId))?.text()).toBe('%PDF-1.4 rehecho');
    expect(await screen.findByText(/1 capítulo con su PDF otra vez en el anejo/)).toBeInTheDocument();
  });

  it('el módulo se queda con lo que tenía, no con la pieza que pasó por él', async () => {
    const user = userEvent.setup();
    // Un cálculo a medias, sin guardar en ninguna pieza: es lo que no se puede
    // perder por rehacer un PDF de otra cosa.
    localStorage.setItem('rc-beams', '{"title":"Otra cosa","L":3,"mode":"portico"}');
    escribirAnejo({ v: 1, piezas: [pieza('p1', 'Viga V-3', V3)] });
    montar();

    await user.click(await screen.findByRole('button', { name: 'Volver a intentarlo' }));
    await waitFor(() => expect(screen.getByText(/1 capítulo con su PDF/)).toBeInTheDocument(), { timeout: 6000 });

    expect(localStorage.getItem('rc-beams')).toBe('{"title":"Otra cosa","L":3,"mode":"portico"}');
    // Y la pieza guardó SUS datos, no los del cálculo a medias.
    expect(piezas()[0].datos?.['rc-beams']).toBe(V3);
  });

  it('en tanda: las dos piezas pasan por su módulo y las dos quedan con PDF', async () => {
    const user = userEvent.setup();
    escribirAnejo({ v: 1, piezas: [pieza('p1', 'Viga V-3', V3), pieza('p2', 'Viga V-4', V4)] });
    montar();

    await user.click(await screen.findByRole('button', { name: 'Volver a intentarlo con los dos' }));

    await waitFor(() => expect(screen.getByText(/2 capítulos con su PDF otra vez en el anejo/)).toBeInTheDocument(), {
      timeout: 8000,
    });
    await waitFor(() => expect(ruta()).toBe('/proyecto/anejo'));
    const lista = piezas();
    expect(lista.map((p) => p.titulo)).toEqual(['Viga V-3', 'Viga V-4']);
    expect((await idsDeBlobs()).sort()).toEqual(lista.map((p) => p.blobId).sort());
    // El módulo no se queda con la última que pasó: no había nada suyo, y no
    // hay nada suyo.
    expect(localStorage.getItem('rc-beams')).toBeNull();
  });

  it('cerrar la tanda dos veces no anuncia una segunda vez', () => {
    // React en modo estricto ejecuta el efecto dos veces con la misma
    // instantánea: sin esto, encima del recuento bueno salía «0 capítulos».
    pedirReconstruir([{ piezaId: 'p1', modulo: 'concreta-rc-beams', titulo: 'Viga V-3', fecha: '2026-09-18T10:00:00.000Z' }]);
    expect(cerrarTanda()).toMatchObject({ total: 1 });
    expect(cerrarTanda()).toBeNull();
  });

  it('sin datos no se puede rehacer, y la fila lo dice en vez de ofrecerlo', async () => {
    escribirAnejo({ v: 1, piezas: [{ ...pieza('p1', 'Viga V-3', V3), datos: null }] });
    montar();
    expect(await screen.findByText(/no se puede rehacer/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Volver a intentarlo' })).toBeNull();
  });
});
