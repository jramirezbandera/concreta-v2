/**
 * «Guardar en el anejo» desde el desplegable «Exportar» de un módulo de
 * memoria (F5), con Viento y nieve como representante de los cuatro: la
 * opción está en su grupo, el modal del título dice a dónde va el PDF, y al
 * confirmar la pieza se guarda con el módulo y el título correctos y NO se
 * descarga nada. Sin obra, se pide el nombre después de generar.
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastContainer } from '../../components/ui/Toast';
import { VientoNieveModule } from '../../features/viento-nieve';
import { guardarPieza } from '../../lib/anejo';
import { descargarBlob } from '../../lib/export/descargar';
import { _reiniciarProyectoParaTests, guardarComoNueva, proyectoActivo } from '../../lib/proyecto';
import { _reiniciarAlmacenParaTests } from '../../lib/storage/seguro';
import { ThemeProvider } from '../../lib/theme/ThemeProvider';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';

vi.mock('../../components/layout/AppShell', () => ({
  useDrawer: () => ({ openDrawer: vi.fn() }),
}));
// El PDF de verdad tiene su test (`test/pdf/vientoNieve.dom.test.ts`): aquí el cable.
vi.mock('../../lib/pdf/vientoNieve', () => ({
  exportarVientoNievePdf: async (_blocks: unknown, titulo?: string) => ({
    blob: new Blob(['%PDF-1.4 memoria'], { type: 'application/pdf' }),
    filename: titulo ? `${titulo.toLowerCase().replace(/ /g, '-')}.pdf` : 'viento-y-nieve.pdf',
  }),
}));
vi.mock('../../lib/anejo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/anejo')>()),
  guardarPieza: vi.fn(async (p: { modulo: string; titulo: string }) => ({
    ok: true,
    pieza: { id: 'p1', modulo: p.modulo, clave: 'concreta-viento-nieve-model', titulo: p.titulo || 'Viento y nieve', ts: 't', esquema: '1', blobId: 'b1', paginas: 4, huella: null, incluida: true },
    reemplazada: null,
  })),
}));
vi.mock('../../lib/export/descargar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/export/descargar')>()),
  descargarBlob: vi.fn(),
}));

function montar() {
  return render(
    <MemoryRouter initialEntries={['/acciones/viento-nieve']}>
      <ThemeProvider>
        <UnitSystemProvider>
          <ToastContainer />
          <VientoNieveModule />
        </UnitSystemProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

/** Madrid a 660 m: lo justo para que el módulo esté listo para exportar. */
function rellenarMadrid() {
  fireEvent.change(screen.getByLabelText('Provincia'), { target: { value: '28' } });
  fireEvent.change(screen.getByLabelText('Altitud'), { target: { value: '660' } });
}

beforeEach(() => {
  localStorage.clear();
  _reiniciarAlmacenParaTests();
  _reiniciarProyectoParaTests();
  vi.mocked(guardarPieza).mockClear();
  vi.mocked(descargarBlob).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Guardar en el anejo desde «Exportar»', () => {
  it('la opción está en su grupo, y el modal dice a dónde va el PDF', async () => {
    montar();
    rellenarMadrid();
    fireEvent.click(screen.getByRole('button', { name: 'Exportar' }));
    const grupo = screen.getByRole('group', { name: 'Anejo de cálculo' });
    fireEvent.click(within(grupo).getByRole('menuitem', { name: /^Guardar en el anejo/ }));

    const dialogo = screen.getByRole('dialog', { name: 'Guardar en el anejo' });
    expect(within(dialogo).getByText(/Entra en el anejo de esta obra como capítulo «Viento y nieve»/)).toBeInTheDocument();
    expect(within(dialogo).queryByText(/Se descargará como/)).toBeNull();
    expect(within(dialogo).getByRole('button', { name: 'Guardar en el anejo' })).toBeInTheDocument();
  });

  it('con obra abierta: guarda la pieza con el título tecleado y no descarga nada', async () => {
    const user = userEvent.setup();
    guardarComoNueva('Nave F5');
    montar();
    rellenarMadrid();
    fireEvent.click(screen.getByRole('button', { name: 'Exportar' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /^Guardar en el anejo/ }));
    const input = screen.getByLabelText('Título del elemento');
    await user.clear(input);
    await user.type(input, 'Nave F5 viento');
    await user.click(screen.getByRole('button', { name: 'Guardar en el anejo' }));

    await waitFor(() => expect(guardarPieza).toHaveBeenCalledTimes(1));
    const peticion = vi.mocked(guardarPieza).mock.calls[0][0];
    expect(peticion.modulo).toBe('concreta-viento-nieve');
    expect(peticion.titulo).toBe('Nave F5 viento');
    expect(peticion.blob.type).toBe('application/pdf');
    expect(descargarBlob).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByText('Guardado en el anejo: «Nave F5 viento» · 4 páginas')).toBeInTheDocument();
  });

  it('sin obra: tras generar pide el nombre, crea la obra y guarda', async () => {
    const user = userEvent.setup();
    montar();
    rellenarMadrid();
    fireEvent.click(screen.getByRole('button', { name: 'Exportar' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /^Guardar en el anejo/ }));
    await user.click(screen.getByRole('button', { name: 'Guardar en el anejo' }));

    const nombre = await screen.findByLabelText('Nombre de la obra');
    // El modal del título ya se ha ido: sólo queda el diálogo del nombre.
    expect(screen.queryByLabelText('Título del elemento')).toBeNull();
    await user.type(nombre, 'Nave nueva');
    await user.click(screen.getByRole('button', { name: 'Crear la obra y guardar' }));

    await waitFor(() => expect(guardarPieza).toHaveBeenCalledTimes(1));
    expect(proyectoActivo()).not.toBeNull();
    expect(descargarBlob).not.toHaveBeenCalled();
  });

  it('el PDF de siempre sigue descargándose', async () => {
    const user = userEvent.setup();
    montar();
    rellenarMadrid();
    fireEvent.click(screen.getByRole('button', { name: 'Exportar' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /^PDF/ }));
    await user.click(screen.getByRole('button', { name: 'Exportar PDF' }));
    await waitFor(() => expect(descargarBlob).toHaveBeenCalledTimes(1));
    expect(guardarPieza).not.toHaveBeenCalled();
  });
});
