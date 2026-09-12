/**
 * «Guardar en el anejo» en el modal de previsualización (F5): el PDF que se
 * está viendo pasa al anejo con el título que el módulo acaba de persistir;
 * sin obra se pide UN nombre y se crea; con la pestaña desfasada no se guarda;
 * y los fallos del almacén salen con su mensaje sin dejar el botón colgado.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IDBFactory } from 'fake-indexeddb';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PdfPreviewModal } from '../../components/ui/PdfPreviewModal';
import { showToast } from '../../components/ui/Toast';
import { guardarPieza, piezaAbierta, piezas } from '../../lib/anejo';
import { _reiniciarBlobsParaTests, leerBlob } from '../../lib/anejo/blobs';
import { guardarObra } from '../../lib/obra';
import { _reiniciarProyectoParaTests, guardarComoNueva, proyectoActivo } from '../../lib/proyecto';
import { _reiniciarAlmacenParaTests, escribirClaveDiferida } from '../../lib/storage/seguro';

vi.mock('../../components/ui/Toast', () => ({ showToast: vi.fn() }));

const PDF = new Blob(['%PDF-1.4 previsualizado'], { type: 'application/pdf' });
const URL_BLOB = 'blob:http://localhost/0000-previsualizado';

function conIndexedDB(valor: unknown) {
  Object.defineProperty(globalThis, 'indexedDB', { value: valor, configurable: true, writable: true });
}

const toasts = () => vi.mocked(showToast).mock.calls.map((c) => c[0]);

function montar(ruta = '/horm/vigas') {
  const onClose = vi.fn();
  const onDownload = vi.fn();
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <PdfPreviewModal blobUrl={URL_BLOB} filename="viga-v-1.pdf" pageCount={3} onClose={onClose} onDownload={onDownload} />
    </MemoryRouter>,
  );
  return { onClose, onDownload };
}

const botonGuardar = () => screen.getByRole('button', { name: /Guardar en el anejo|En el anejo/ });

beforeEach(() => {
  localStorage.clear();
  _reiniciarAlmacenParaTests();
  _reiniciarProyectoParaTests();
  _reiniciarBlobsParaTests();
  conIndexedDB(new IDBFactory());
  vi.mocked(showToast).mockClear();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => PDF }) as unknown as Response));
  // El módulo persiste su título con 300 ms de retraso: aquí queda EN COLA a
  // propósito, para comprobar que el modal la vuelca antes de leerlo.
  escribirClaveDiferida('rc-beams', JSON.stringify({ title: 'Viga V-1', L: 6 }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  _reiniciarBlobsParaTests();
});

describe('PdfPreviewModal — Guardar en el anejo', () => {
  it('en una ruta sin módulo no hay botón; Descargar y cerrar siguen igual', () => {
    const { onDownload } = montar('/pricing');
    expect(screen.queryByRole('button', { name: /anejo/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Descargar' }));
    expect(onDownload).toHaveBeenCalled();
  });

  it('con obra abierta: guarda el PDF visto con el título del módulo y las páginas del modal', async () => {
    const user = userEvent.setup();
    guardarComoNueva('Nave F5');
    montar();
    await user.click(botonGuardar());
    await waitFor(() => expect(botonGuardar().textContent).toMatch(/En el anejo/));
    expect(botonGuardar()).toBeDisabled();

    const lista = piezas();
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ modulo: 'concreta-rc-beams', titulo: 'Viga V-1', paginas: 3, esquema: '1' });
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(URL_BLOB);
    const guardado = await leerBlob(lista[0].blobId);
    expect(guardado?.size).toBe(PDF.size);
    expect(toasts()).toEqual(['Guardado en el anejo: «Viga V-1» · 3 páginas']);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('sin obra: pide UN nombre, crea la obra y guarda la pieza en ella', async () => {
    const user = userEvent.setup();
    guardarObra({ denominacion: 'Nave sin guardar' });
    montar();
    await user.click(botonGuardar());

    const dialogo = await screen.findByRole('dialog', { name: 'Guardar en el anejo' });
    const input = screen.getByLabelText('Nombre de la obra') as HTMLInputElement;
    expect(input.value).toBe('Nave sin guardar');
    await user.clear(input);
    await user.type(input, 'Nave F5');
    await user.click(screen.getByRole('button', { name: 'Crear la obra y guardar' }));

    await waitFor(() => expect(botonGuardar().textContent).toMatch(/En el anejo/));
    expect(dialogo).not.toBeInTheDocument();
    expect(proyectoActivo()).not.toBeNull();
    expect(piezas()).toHaveLength(1);
    expect(toasts()).toEqual(['Guardado en el anejo: «Viga V-1» · 3 páginas']);
  });

  it('cancelar el nombre no guarda nada y devuelve el botón', async () => {
    const user = userEvent.setup();
    montar();
    await user.click(botonGuardar());
    await screen.findByRole('dialog', { name: 'Guardar en el anejo' });
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(botonGuardar()).toBeEnabled();
    expect(botonGuardar().textContent).toMatch(/Guardar en el anejo/);
    expect(piezas()).toEqual([]);
    expect(proyectoActivo()).toBeNull();
    expect(toasts()).toEqual([]);
  });

  it('Escape con el diálogo del nombre abierto cierra el diálogo, no el modal', async () => {
    const user = userEvent.setup();
    const { onClose } = montar();
    await user.click(botonGuardar());
    await screen.findByRole('dialog', { name: 'Guardar en el anejo' });
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('pestaña desfasada: avisa y no guarda', async () => {
    const user = userEvent.setup();
    guardarComoNueva('Nave F5');
    localStorage.setItem('concreta-proyecto-activo', 'otra-obra-en-otra-pestana');
    montar();
    await user.click(botonGuardar());
    await waitFor(() => expect(toasts()).toEqual(['Otra pestaña ha cambiado de obra. Recarga antes de guardar en el anejo.']));
    expect(piezas()).toEqual([]);
    expect(botonGuardar()).toBeEnabled();
  });

  it('sin IndexedDB: lo dice, no toca el índice y el botón vuelve a estar disponible', async () => {
    const user = userEvent.setup();
    guardarComoNueva('Nave F5');
    conIndexedDB(undefined);
    montar();
    await user.click(botonGuardar());
    await waitFor(() => expect(toasts()).toEqual(['Este navegador no permite guardar los PDF del anejo.']));
    expect(piezas()).toEqual([]);
    expect(botonGuardar()).toBeEnabled();
    expect(botonGuardar().textContent).toMatch(/Guardar en el anejo/);
  });

  it('si no se puede leer el PDF de la previsualización, avisa y no crea obra', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 }) as unknown as Response));
    montar();
    await user.click(botonGuardar());
    await waitFor(() => expect(toasts()).toEqual(['No se pudo leer el PDF para guardarlo en el anejo']));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(proyectoActivo()).toBeNull();
  });
});

describe('el botón dice lo que va a hacer', () => {
  const boton = () => screen.getByRole('button', { name: /anejo|capítulo|pieza nueva/ });

  /** Deja una V-1 guardada y el módulo ligado a ella, como después de guardarla. */
  async function conLaV1Guardada() {
    guardarComoNueva('Nave en Ávila');
    localStorage.setItem('rc-beams', JSON.stringify({ title: 'Viga V-1', L: 6 }));
    localStorage.setItem('rc-beams-version', '1');
    const r = await guardarPieza({ modulo: 'concreta-rc-beams', titulo: 'Viga V-1', blob: PDF, paginas: 3 });
    expect(r.ok).toBe(true);
    expect(piezaAbierta('concreta-rc-beams')).not.toBeNull();
  }

  it('sin nada guardado ofrece guardar, y lo que hace es añadir', async () => {
    guardarComoNueva('Nave en Ávila');
    montar();
    expect(boton()).toHaveTextContent('Guardar en el anejo');
    await userEvent.click(boton());
    await waitFor(() => expect(piezas()).toHaveLength(1));
  });

  it('con la pieza abierta y el mismo nombre, ofrece ACTUALIZAR su capítulo, y no duplica', async () => {
    await conLaV1Guardada();
    montar();
    await waitFor(() => expect(boton()).toHaveTextContent('Actualizar el capítulo 1'));
    await userEvent.click(boton());
    await waitFor(() => expect(piezas()).toHaveLength(1));
  });

  it('si le has cambiado el nombre, ofrece guardar como pieza NUEVA, y la anterior se queda', async () => {
    await conLaV1Guardada();
    localStorage.setItem('rc-beams', JSON.stringify({ title: 'Viga V-4', L: 9 }));
    montar();
    await waitFor(() => expect(boton()).toHaveTextContent('Guardar como pieza nueva'));
    expect(boton().title).toMatch(/«Viga V-1» se queda como está/);
    await userEvent.click(boton());
    await waitFor(() => expect(piezas().map((x) => x.titulo)).toEqual(['Viga V-1', 'Viga V-4']));
  });
});
