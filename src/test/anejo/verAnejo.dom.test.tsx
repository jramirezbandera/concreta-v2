/**
 * El toast de «Guardar en el anejo» gana «Ver anejo» (F6): lleva a la
 * pantalla del anejo y se cierra. Fuera de un Router no hay a dónde ir, y el
 * toast se cierra como siempre.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastContainer } from '../../components/ui/Toast';
import { useGuardarEnAnejo } from '../../hooks/useGuardarEnAnejo';
import { guardarPieza } from '../../lib/anejo';
import { _reiniciarProyectoParaTests, guardarComoNueva } from '../../lib/proyecto';
import { _reiniciarAlmacenParaTests } from '../../lib/storage/seguro';

vi.mock('../../lib/anejo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/anejo')>()),
  guardarPieza: vi.fn(async (p: { modulo: string; titulo: string }) => ({
    ok: true,
    pieza: { id: 'p1', modulo: p.modulo, clave: 'rc-beams', titulo: p.titulo, ts: 't', esquema: '1', blobId: 'b1', paginas: 2, huella: null, incluida: true },
    reemplazada: null,
  })),
}));

function Guardador() {
  const anejo = useGuardarEnAnejo();
  return (
    <>
      <button
        type="button"
        onClick={() => void anejo.guardar({ modulo: 'concreta-rc-beams', titulo: 'Viga V-1', blob: new Blob(['%PDF'], { type: 'application/pdf' }), paginas: 2 })}
      >
        Guardar
      </button>
      {anejo.dialogo}
    </>
  );
}

beforeEach(() => {
  localStorage.clear();
  _reiniciarAlmacenParaTests();
  _reiniciarProyectoParaTests();
  vi.mocked(guardarPieza).mockClear();
  guardarComoNueva('Nave');
});

describe('«Ver anejo» en el toast', () => {
  it('dentro de un Router: el toast lleva a /proyecto/anejo y se cierra', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/horm/vigas']}>
        <ToastContainer />
        <Routes>
          <Route path="/horm/vigas" element={<Guardador />} />
          <Route path="/proyecto/anejo" element={<p>Pantalla del anejo</p>} />
        </Routes>
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Guardado en el anejo: «Viga V-1» · 2 páginas')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ver anejo' }));
    expect(await screen.findByText('Pantalla del anejo')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/Guardado en el anejo/)).toBeNull());
  });

  it('fuera de un Router: sin acción, y el toast se cierra con su aspa', async () => {
    const user = userEvent.setup();
    render(
      <>
        <ToastContainer />
        <Guardador />
      </>
    );
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Guardado en el anejo: «Viga V-1» · 2 páginas')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver anejo' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByText(/Guardado en el anejo/)).toBeNull();
  });
});
