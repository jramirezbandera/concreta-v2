// Avisar antes de abandonar una pregunta en vuelo (T10 / D-I8).
//
// Hasta aquí, cambiar de pantalla mientras el asistente pensaba mataba el
// `fetch` en el `cleanup` del chat y el usuario sólo veía que había dejado de
// pensar. Lo que se prueba es que ahora se le pregunta ANTES, y que la pregunta
// sólo aparece cuando hay algo que perder: ni con el hilo parado ni al moverse
// dentro de la misma pantalla.
//
// Hace falta un data router de verdad (`createMemoryRouter` + `RouterProvider`):
// `useBlocker` no funciona con `MemoryRouter`, que no lo es. Por eso el resto de
// tests del provider lo apagan con `avisarAlSalir={false}`.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, Link, Outlet } from 'react-router';
import { StrictMode, useEffect } from 'react';

import { AsistenteProvider } from '../../components/ai/AsistenteProvider';
import { useAsistente, type EstadoAsistente } from '../../components/ai/asistente-context';
import { useAsistenteDeModulo } from '../../components/ai/useAsistenteDeModulo';
import { ToastContainer } from '../../components/ui/Toast';
import { ThemeProvider } from '../../lib/theme/ThemeProvider';

/** Hace de chat: publica hacia arriba el estado que se le pida. */
function Ventana({ estado }: { estado: EstadoAsistente }) {
  const { publicar } = useAsistente();
  useEffect(() => {
    publicar(estado, 2);
  }, [publicar, estado]);
  return <span>ventana del asistente</span>;
}

/** Un módulo con el asistente abierto y en el estado que toque. */
function Modulo({ estado }: { estado: EstadoAsistente }) {
  const asistente = useAsistenteDeModulo();
  return (
    <>
      <h1>módulo de vigas</h1>
      <button onClick={asistente.abrir}>abrir</button>
      <Link to="/viento">ir a viento</Link>
      <Link to="/vigas?tab=2">cambiar de pestaña</Link>
      {asistente.sesion && <Ventana estado={estado} />}
    </>
  );
}

/**
 * La pantalla de destino TAMBIÉN tiene asistente, como en la app: viento y
 * nieve lo tiene, igual que vigas. No es un detalle del decorado — es lo que
 * hace que su efecto se monte dos veces bajo StrictMode, y por ahí volvía a
 * pasar por «se va el módulo» con el espejo del provider sin actualizar.
 */
function OtraPantalla() {
  useAsistenteDeModulo();
  return <h1>viento y nieve</h1>;
}

function montar(estado: EstadoAsistente) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: (
          <ThemeProvider>
            <AsistenteProvider>
              <Outlet />
              <ToastContainer />
            </AsistenteProvider>
          </ThemeProvider>
        ),
        children: [
          { path: 'vigas', element: <Modulo estado={estado} /> },
          { path: 'viento', element: <OtraPantalla /> },
        ],
      },
    ],
    { initialEntries: ['/vigas'] },
  );
  // StrictMode a propósito: la app corre dentro de él, y es lo que hace que el
  // módulo que LLEGA monte su efecto dos veces. Sin esto, este test daba por
  // bueno un aviso que en la app salía duplicado.
  render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
  // El asistente arranca cerrado: se abre para que haya hilo que perder.
  fireEvent.click(screen.getByRole('button', { name: 'abrir' }));
  return router;
}

const aviso = () => screen.queryByRole('dialog');

beforeEach(() => {
  window.localStorage.clear();
});

describe('avisar antes de abandonar una pregunta en vuelo (T10 · D-I8)', () => {
  it('con la pregunta en vuelo, cambiar de pantalla pregunta primero', async () => {
    montar('cargando');

    await act(async () => {
      fireEvent.click(screen.getByRole('link', { name: 'ir a viento' }));
    });

    expect(aviso()).toBeInTheDocument();
    expect(screen.getByText('El asistente está pensando')).toBeInTheDocument();
    // Y NO se ha ido: sigue en el módulo.
    expect(screen.getByText('módulo de vigas')).toBeInTheDocument();
    expect(screen.queryByText('viento y nieve')).not.toBeInTheDocument();
  });

  it('«Esperar aquí» se queda donde estaba', async () => {
    montar('cargando');
    await act(async () => {
      fireEvent.click(screen.getByRole('link', { name: 'ir a viento' }));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Esperar aquí' }));
    });

    expect(aviso()).not.toBeInTheDocument();
    expect(screen.getByText('módulo de vigas')).toBeInTheDocument();
  });

  it('«Salir igualmente» se va, y no repite el aviso de después', async () => {
    montar('cargando');
    await act(async () => {
      fireEvent.click(screen.getByRole('link', { name: 'ir a viento' }));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Salir igualmente' }));
    });

    expect(screen.getByText('viento y nieve')).toBeInTheDocument();
    // Se lo hemos preguntado a la cara: decírselo otra vez sobra.
    expect(screen.queryByText(/se ha cancelado/)).not.toBeInTheDocument();
  });

  // Sin petición en vuelo no hay nada que esperar: se pasa sin preguntar, y el
  // aviso de «empieza de cero» sigue saliendo (una vez por usuario).
  it('con el hilo parado no se interpone', async () => {
    montar('viva');

    await act(async () => {
      fireEvent.click(screen.getByRole('link', { name: 'ir a viento' }));
    });

    expect(aviso()).not.toBeInTheDocument();
    expect(screen.getByText('viento y nieve')).toBeInTheDocument();
    expect(screen.getByText('El asistente empieza de cero en cada módulo.')).toBeInTheDocument();
  });

  // Cambiar de pestaña dentro del módulo no lo desmonta, así que no se pierde
  // ninguna petición: frenar ahí al usuario sería impertinente.
  it('moverse dentro de la misma pantalla no pregunta nada', async () => {
    montar('cargando');

    await act(async () => {
      fireEvent.click(screen.getByRole('link', { name: 'cambiar de pestaña' }));
    });

    expect(aviso()).not.toBeInTheDocument();
    expect(screen.getByText('módulo de vigas')).toBeInTheDocument();
  });
});
