/**
 * La pantalla del anejo (`features/anejo`, F6): el vacío enseña de dónde
 * salen las filas, las dos secciones con la numeración derivada del orden y
 * los estados con texto, las tres entradas para reordenar (botones, «Mover
 * a…», arrastre) con su anuncio, la casilla de incluir, generar con progreso
 * fila a fila y descarga, la fila culpable en rojo con «Generar sin esta
 * pieza», la pieza sin PDF con su salida, quitar con confirmación, y la
 * pestaña desfasada. El montaje del PDF tiene su test (`test/pdf/anejo-indice`).
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IDBFactory } from 'fake-indexeddb';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastContainer } from '../../components/ui/Toast';
import { routeLoaders } from '../../data/routeLoaders';
import { routeMeta } from '../../data/routeMeta';
import { AnejoModule } from '../../features/anejo';
import { adaptadorDe, escribirAnejo, huellaDeModulo, leerAnejo, type Pieza } from '../../lib/anejo';
import { _reiniciarBlobsParaTests, guardarBlob } from '../../lib/anejo/blobs';
import { ErrorDeAnejo } from '../../lib/anejo/errores';
import { generarAnejo, type PeticionAnejo } from '../../lib/anejo/generar';
import { capitulosDe } from '../../lib/anejo/maqueta';
import { descargarBlob } from '../../lib/export/descargar';
import { guardarObra } from '../../lib/obra';
import { _reiniciarProyectoParaTests, guardarComoNueva } from '../../lib/proyecto';
import { _reiniciarAlmacenParaTests } from '../../lib/storage/seguro';
import { ThemeProvider } from '../../lib/theme/ThemeProvider';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';

vi.mock('../../lib/anejo/generar', () => ({ generarAnejo: vi.fn() }));
vi.mock('../../lib/export/descargar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/export/descargar')>()),
  descargarBlob: vi.fn(),
}));

const RESULTADO = {
  blob: new Blob(['%PDF-1.4 anejo'], { type: 'application/pdf' }),
  filename: 'anejo-de-calculo-nave-f6.pdf',
  paginas: 9,
  paginasIndice: 1,
  entradas: [],
};

function pieza(id: string, modulo: string, titulo: string, extra: Partial<Pieza> = {}): Pieza {
  return {
    id,
    modulo,
    clave: modulo.replace('concreta-', ''),
    titulo,
    ts: '2026-09-08T10:00:00.000Z',
    esquema: '1',
    blobId: `blob-${id}`,
    paginas: 2,
    huella: 'ajena',
    incluida: true,
    ...extra,
  };
}

/** Tres piezas: la viga al día, el pilar por recalcular y un capítulo de memoria guardado el último. */
async function conPiezas(opciones: { pdfDeMemoria?: boolean } = {}) {
  localStorage.setItem('rc-beams', JSON.stringify({ title: 'Viga V-1', L: 6 }));
  const vigas = adaptadorDe('concreta-rc-beams');
  localStorage.setItem(vigas.entrada.claveVersion ?? 'rc-beams-version', vigas.entrada.versionViva);
  escribirAnejo({
    v: 1,
    piezas: [
      pieza('p1', 'concreta-rc-beams', 'Viga V-1', { esquema: vigas.entrada.versionViva, huella: huellaDeModulo(vigas), paginas: 3 }),
      pieza('p2', 'concreta-rc-columns', 'Pilar P-3', { paginas: 2 }),
      pieza('m1', 'concreta-viento-nieve', 'Viento de la nave', { paginas: 4 }),
    ],
  });
  await guardarBlob('blob-p1', new Blob(['%PDF'], { type: 'application/pdf' }));
  await guardarBlob('blob-p2', new Blob(['%PDF'], { type: 'application/pdf' }));
  if (opciones.pdfDeMemoria !== false) await guardarBlob('blob-m1', new Blob(['%PDF'], { type: 'application/pdf' }));
}

function montar() {
  return render(
    <ThemeProvider>
      <UnitSystemProvider>
        <MemoryRouter initialEntries={['/proyecto/anejo']}>
          <ToastContainer />
          <AnejoModule />
        </MemoryRouter>
      </UnitSystemProvider>
    </ThemeProvider>,
  );
}

const fila = (titulo: string) => screen.getByRole('listitem', { name: new RegExp(titulo) });
const ordenDePiezas = () => leerAnejo().piezas.map((p) => p.id);
const botonGenerar = () => screen.getByRole('button', { name: 'Generar anejo' });
const panel = () => screen.getByRole('complementary', { name: 'Resumen del anejo' });

beforeEach(() => {
  localStorage.clear();
  _reiniciarAlmacenParaTests();
  _reiniciarProyectoParaTests();
  _reiniciarBlobsParaTests();
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
  vi.mocked(descargarBlob).mockClear();
  vi.mocked(generarAnejo).mockReset();
  vi.mocked(generarAnejo).mockImplementation(async (p: PeticionAnejo) => {
    for (const c of capitulosDe(p.piezas)) p.onParte?.(c.id);
    return RESULTADO;
  });
  guardarObra({ denominacion: 'Nave F6', municipio: 'Dos Hermanas', provincia: '41', uso: 'Nave industrial' });
  guardarComoNueva('Nave F6');
});

afterEach(() => {
  _reiniciarBlobsParaTests();
});

describe('la ruta', () => {
  it('tiene loader perezoso y metadatos', () => {
    expect(routeLoaders['/proyecto/anejo']).toBeTypeOf('function');
    expect(routeMeta['/proyecto/anejo']?.title).toContain('Anejo de cálculo');
  });
});

describe('Anejo de cálculo', () => {
  it('vacío: las dos cabeceras enseñan de dónde salen las filas, y no hay nada que generar', () => {
    montar();
    expect(screen.getByRole('heading', { name: 'Memoria justificativa' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cálculos de pieza' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'cuadro de materiales' })).toHaveAttribute('href', '/memorias/materiales');
    expect(screen.getByRole('link', { name: 'sismo' })).toHaveAttribute('href', '/analisis/sismo');
    expect(screen.getByText(/Los cálculos entran con el botón «Guardar en el anejo»/)).toBeInTheDocument();
    expect(botonGenerar()).toBeDisabled();
    expect(within(panel()).getByText('0 piezas · nada que generar')).toBeInTheDocument();
    // La obra abierta, y la denominación en la previsualización de la portada.
    expect(within(panel()).getAllByText('Nave F6')).toHaveLength(2);
    expect(within(panel()).getByText('Dos Hermanas (Sevilla) · Nave industrial')).toBeInTheDocument();
    expect(screen.getByText('+ Añadir un cálculo guardado…')).toBeInTheDocument();
  });

  it('dos secciones, numeración derivada del orden, estados con texto y el resumen del documento', async () => {
    await conPiezas();
    montar();
    const memoria = screen.getByRole('list', { name: 'Memoria justificativa' });
    const piezas = screen.getByRole('list', { name: 'Cálculos de pieza' });
    expect(within(memoria).getAllByRole('listitem').map((li) => li.getAttribute('aria-label'))).toEqual(['Capítulo 1: Viento de la nave']);
    expect(within(piezas).getAllByRole('listitem').map((li) => li.getAttribute('aria-label'))).toEqual(['Capítulo 2: Viga V-1', 'Capítulo 3: Pilar P-3']);
    expect(within(fila('Viga V-1')).getByText('AL DÍA')).toBeInTheDocument();
    expect(within(fila('Pilar P-3')).getByText('RECALCULAR')).toBeInTheDocument();
    expect(within(fila('Viga V-1')).getByText(/Vigas de hormigón · 3 págs\./)).toBeInTheDocument();

    const resumen = panel();
    expect(within(resumen).getByText('Capítulos').nextSibling?.textContent).toBe('3');
    expect(within(resumen).getByText('Páginas de cálculo').nextSibling?.textContent).toBe('9');
    expect(within(resumen).getByText('Portada e índice').nextSibling?.textContent).toBe('2');
    expect(within(resumen).getByText('Total').nextSibling?.textContent).toBe('11 páginas');
    expect(within(resumen).getByText('2 piezas por recalcular')).toBeInTheDocument();
    expect(botonGenerar()).toBeEnabled();
  });

  it('subir y bajar reordenan dentro de la sección, escriben el índice y lo anuncian', async () => {
    const user = userEvent.setup();
    await conPiezas();
    montar();
    expect(screen.getByRole('button', { name: 'Subir «Viento de la nave»' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Subir «Viga V-1»' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Subir «Pilar P-3»' }));
    expect(ordenDePiezas()).toEqual(['m1', 'p2', 'p1']);
    expect(screen.getByText('«Pilar P-3» movida a la posición 1 de 2')).toBeInTheDocument();
    expect(fila('Pilar P-3')).toHaveAttribute('aria-label', 'Capítulo 2: Pilar P-3');
    expect(fila('Viga V-1')).toHaveAttribute('aria-label', 'Capítulo 3: Viga V-1');
    await user.click(screen.getByRole('button', { name: 'Bajar «Pilar P-3»' }));
    expect(ordenDePiezas()).toEqual(['m1', 'p1', 'p2']);
  });

  it('«Mover a…» pide la posición y la aplica', async () => {
    const user = userEvent.setup();
    await conPiezas();
    montar();
    await user.click(screen.getByRole('button', { name: 'Mover «Pilar P-3» a otra posición' }));
    const posicion = screen.getByLabelText('Nueva posición de «Pilar P-3» (de 1 a 2)');
    await user.type(posicion, '1{Enter}');
    expect(ordenDePiezas()).toEqual(['m1', 'p2', 'p1']);
    expect(screen.queryByLabelText(/Nueva posición/)).toBeNull();
  });

  it('arrastrar una fila sobre otra de su sección la mueve a esa posición', async () => {
    await conPiezas();
    montar();
    fireEvent.dragStart(fila('Pilar P-3'));
    fireEvent.dragOver(fila('Viga V-1'));
    fireEvent.drop(fila('Viga V-1'));
    expect(ordenDePiezas()).toEqual(['m1', 'p2', 'p1']);
    // A otra sección no se puede: la sección la decide el módulo.
    fireEvent.dragStart(fila('Pilar P-3'));
    fireEvent.drop(fila('Viento de la nave'));
    expect(ordenDePiezas()).toEqual(['m1', 'p2', 'p1']);
  });

  it('la casilla «incluir» quita el número, actualiza el contador y se guarda', async () => {
    const user = userEvent.setup();
    await conPiezas();
    montar();
    await user.click(screen.getByRole('checkbox', { name: 'Incluir «Pilar P-3» en el anejo' }));
    expect(leerAnejo().piezas.find((p) => p.id === 'p2')?.incluida).toBe(false);
    expect(fila('Pilar P-3')).toHaveAttribute('aria-label', 'Pilar P-3');
    expect(within(fila('Pilar P-3')).getByText('—')).toBeInTheDocument();
    expect(within(panel()).getByText('Capítulos').nextSibling?.textContent).toBe('2');
    expect(within(panel()).getByText('Total').nextSibling?.textContent).toBe('9 páginas');
  });

  it('generar: progreso fila a fila sin bloquear la página, descarga, toast y «Descargar otra vez»', async () => {
    const user = userEvent.setup();
    await conPiezas();
    let liberar: () => void = () => undefined;
    const espera = new Promise<void>((r) => {
      liberar = r;
    });
    vi.mocked(generarAnejo).mockImplementationOnce(async (p: PeticionAnejo) => {
      const capitulos = capitulosDe(p.piezas);
      p.onParte?.(capitulos[0].id);
      await espera;
      for (const c of capitulos.slice(1)) p.onParte?.(c.id);
      return RESULTADO;
    });
    montar();
    await user.click(botonGenerar());

    expect(await within(fila('Viento de la nave')).findByText('en el documento')).toBeInTheDocument();
    expect(within(fila('Viga V-1')).getByText('esperando…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generar anejo' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Incluir «Viga V-1» en el anejo' })).toBeEnabled();

    liberar();
    await waitFor(() => expect(descargarBlob).toHaveBeenCalledTimes(1));
    expect(vi.mocked(descargarBlob).mock.calls[0][0].filename).toBe('anejo-de-calculo-nave-f6.pdf');
    const peticion = vi.mocked(generarAnejo).mock.calls[0][0];
    expect(peticion.nombreObra).toBe('Nave F6');
    expect(peticion.obra?.municipio).toBe('Dos Hermanas');
    expect(await screen.findByText('Anejo generado: 9 páginas')).toBeInTheDocument();
    expect(within(panel()).getByText('anejo-de-calculo-nave-f6.pdf')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Descargar otra vez' }));
    expect(descargarBlob).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('en el documento')).toBeNull();
  });

  it('si una pieza falla, su fila se pone en rojo con el motivo y «Generar sin esta pieza» la deja fuera y repite', async () => {
    const user = userEvent.setup();
    await conPiezas();
    vi.mocked(generarAnejo).mockRejectedValueOnce(new ErrorDeAnejo('ilegible', 'p2', 'El PDF guardado no se puede leer: vuelve a guardarla desde el módulo.'));
    montar();
    await user.click(botonGenerar());

    const alerta = await within(fila('Pilar P-3')).findByRole('alert');
    expect(alerta.textContent).toContain('El PDF guardado no se puede leer');
    expect(descargarBlob).not.toHaveBeenCalled();
    expect(within(fila('Viga V-1')).queryByRole('alert')).toBeNull();

    await user.click(within(alerta).getByRole('button', { name: 'Generar sin esta pieza' }));
    await waitFor(() => expect(generarAnejo).toHaveBeenCalledTimes(2));
    const segunda = vi.mocked(generarAnejo).mock.calls[1][0];
    expect(segunda.piezas.find((p) => p.id === 'p2')?.incluida).toBe(false);
    expect(leerAnejo().piezas.find((p) => p.id === 'p2')?.incluida).toBe(false);
    await waitFor(() => expect(descargarBlob).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('un fallo sin pieza culpable se cuenta en el panel', async () => {
    const user = userEvent.setup();
    await conPiezas();
    vi.mocked(generarAnejo).mockRejectedValueOnce(new ErrorDeAnejo('indice', null, 'El índice ocupa 2 páginas y se habían previsto 1.'));
    montar();
    await user.click(botonGenerar());
    expect(await within(panel()).findByRole('alert')).toHaveTextContent('No se pudo generar el anejo');
    expect(within(panel()).getByText('El índice ocupa 2 páginas y se habían previsto 1.')).toBeInTheDocument();
  });

  it('una pieza sin PDF en esta máquina: fila roja con el motivo, el enlace al módulo y «Dejar fuera»', async () => {
    const user = userEvent.setup();
    await conPiezas({ pdfDeMemoria: false });
    montar();
    const memoria = fila('Viento de la nave');
    expect(await within(memoria).findByText(/Falta el PDF guardado/)).toBeInTheDocument();
    expect(within(memoria).getByRole('link', { name: 'Ir a Viento y nieve' })).toHaveAttribute('href', '/acciones/viento-nieve');
    expect(within(fila('Viga V-1')).queryByText(/Falta el PDF/)).toBeNull();
    await user.click(within(memoria).getByRole('button', { name: 'Dejar fuera' }));
    expect(leerAnejo().piezas.find((p) => p.id === 'm1')?.incluida).toBe(false);
    expect(within(fila('Viento de la nave')).queryByRole('button', { name: 'Dejar fuera' })).toBeNull();
  });

  it('quitar pide confirmar, y al confirmar la pieza desaparece del índice', async () => {
    const user = userEvent.setup();
    await conPiezas();
    montar();
    await user.click(screen.getByRole('button', { name: 'Quitar «Pilar P-3» del anejo' }));
    expect(ordenDePiezas()).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: 'Quitar' }));
    await waitFor(() => expect(ordenDePiezas()).toEqual(['p1', 'm1']));
    expect(screen.queryByRole('listitem', { name: /Pilar P-3/ })).toBeNull();
    // En el toast y en la región `aria-live`.
    expect(await screen.findAllByText('«Pilar P-3» quitada del anejo')).toHaveLength(2);
  });

  it('con la pestaña desfasada no se genera: el botón lo dice', async () => {
    await conPiezas();
    localStorage.setItem('concreta-proyecto-activo', 'otra-obra-en-otra-pestana');
    montar();
    expect(botonGenerar()).toBeDisabled();
    expect(within(panel()).getByText('Otra pestaña ha cambiado de obra. Recarga antes de generar.')).toBeInTheDocument();
    expect(generarAnejo).not.toHaveBeenCalled();
  });
});
