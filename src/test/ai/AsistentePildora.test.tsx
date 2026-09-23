// La píldora del asistente y el provider que la manda (T3 del plan de diseño
// de 2026-09-22).
//
// Lo que aquí se prueba es exactamente lo que ANTES era imposible: que la
// píldora siga puesta cuando el chat no está montado. Hasta el rediseño era un
// sub-estado del propio modal —sin modal no había píldora— y estaba a TRES
// gestos del arranque, así que casi nadie la había visto.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useEffect } from 'react';

import { AsistenteProvider } from '../../components/ai/AsistenteProvider';
import { useAsistente, type EstadoAsistente } from '../../components/ai/asistente-context';
import { useAsistenteDeModulo } from '../../components/ai/useAsistenteDeModulo';
import { ToastContainer } from '../../components/ui/Toast';
import { ThemeProvider } from '../../lib/theme/ThemeProvider';

const PILDORA = /Abrir asistente IA|El asistente|Asistente con/;

/** Un módulo cualquiera con asistente: declara que lo tiene y monta su ventana. */
function ModuloConAsistente({ estado }: { estado?: EstadoAsistente }) {
  const asistente = useAsistenteDeModulo();
  return (
    <>
      <button onClick={asistente.abrir}>abrir desde el menú</button>
      {asistente.sesion && <Ventana estado={estado} />}
    </>
  );
}

/** Hace de AiChatModal: publica su estado hacia arriba y se calla al minimizar. */
function Ventana({ estado = 'viva' }: { estado?: EstadoAsistente }) {
  const { publicar, minimizado, minimizar } = useAsistente();
  useEffect(() => {
    publicar(estado, 3);
  }, [publicar, estado]);
  if (minimizado) return null;
  return (
    <div>
      <span>ventana del asistente</span>
      <button onClick={minimizar}>bajar</button>
    </div>
  );
}

/** Una pantalla sin asistente: no llama al hook. Las hay: anejo, ficha DB SE… */
function ModuloSinAsistente() {
  return <p>pantalla sin asistente</p>;
}

function montar(ui: React.ReactNode) {
  return render(
    <ThemeProvider>
      <AsistenteProvider>
        {ui}
        <ToastContainer />
      </AsistenteProvider>
    </ThemeProvider>,
  );
}

const pildora = () => screen.queryByRole('button', { name: PILDORA });

beforeEach(() => {
  window.localStorage.clear();
});

describe('píldora del asistente', () => {
  it('no la hay en una pantalla sin asistente', () => {
    montar(<ModuloSinAsistente />);
    expect(pildora()).not.toBeInTheDocument();
  });

  // Lo que hace este rediseño: la píldora existe ANTES de abrir nada.
  it('está puesta desde el primer momento, sin haber abierto el chat', () => {
    montar(<ModuloConAsistente />);
    expect(pildora()).toBeInTheDocument();
    expect(screen.queryByText('ventana del asistente')).not.toBeInTheDocument();
    expect(screen.getByText('Asistente')).toBeInTheDocument();
  });

  it('al pulsarla abre el chat, y entonces ella se quita de en medio', () => {
    montar(<ModuloConAsistente />);
    fireEvent.click(pildora()!);

    expect(screen.getByText('ventana del asistente')).toBeInTheDocument();
    // O está el asistente, o está su píldora. Nunca los dos: la ventana
    // flotante nace justo encima de ella.
    expect(pildora()).not.toBeInTheDocument();
  });

  it('al bajar la ventana, vuelve la píldora con la conversación viva', () => {
    montar(<ModuloConAsistente />);
    fireEvent.click(pildora()!);
    fireEvent.click(screen.getByRole('button', { name: 'bajar' }));

    expect(screen.queryByText('ventana del asistente')).not.toBeInTheDocument();
    // El rótulo cuenta los turnos: no es lo mismo «Asistente» que «Asistente · 3».
    expect(screen.getByText('Asistente · 3')).toBeInTheDocument();
    // Y restaurar desde ahí devuelve la MISMA conversación (no se remonta).
    fireEvent.click(pildora()!);
    expect(screen.getByText('ventana del asistente')).toBeInTheDocument();
  });

  it('cada estado dice lo suyo con palabras, no sólo con color', () => {
    const casos: Array<[EstadoAsistente, string]> = [
      ['cargando', 'Pensando…'],
      ['propuesta', 'Asistente · propuesta'],
      ['error', 'Asistente · error'],
      ['sin-clave', 'Asistente · configurar'],
    ];
    for (const [estado, rotulo] of casos) {
      const { unmount } = montar(<ModuloConAsistente estado={estado} />);
      fireEvent.click(pildora()!);
      fireEvent.click(screen.getByRole('button', { name: 'bajar' }));
      expect(screen.getByText(rotulo), `estado ${estado}`).toBeInTheDocument();
      unmount();
    }
  });

  // El punto que parpadea está en la lista negra de tics de interfaz generada,
  // y además chocaría con el anillo de «propuesta pendiente».
  it('«cargando» se cuenta con una hebra, no con un punto que parpadea', () => {
    montar(<ModuloConAsistente estado="cargando" />);
    fireEvent.click(pildora()!);
    fireEvent.click(screen.getByRole('button', { name: 'bajar' }));

    const boton = pildora()!;
    expect(boton.querySelector('.animate-route-progress')).not.toBeNull();
    expect(boton.innerHTML).not.toMatch(/animate-pulse|animate-ping/);
  });
});

describe('el asistente se reinicia en cada módulo (D-I8)', () => {
  function Pantallas({ mostrar }: { mostrar: boolean }) {
    return mostrar ? <ModuloConAsistente /> : <ModuloSinAsistente />;
  }

  it('al irse el módulo, la conversación muere y la píldora vuelve a reposo', () => {
    const { rerender } = render(
      <ThemeProvider>
        <AsistenteProvider>
          <Pantallas mostrar />
          <ToastContainer />
        </AsistenteProvider>
      </ThemeProvider>,
    );
    fireEvent.click(pildora()!);
    expect(screen.getByText('ventana del asistente')).toBeInTheDocument();

    rerender(
      <ThemeProvider>
        <AsistenteProvider>
          <Pantallas mostrar={false} />
          <ToastContainer />
        </AsistenteProvider>
      </ThemeProvider>,
    );

    expect(screen.queryByText('ventana del asistente')).not.toBeInTheDocument();
    expect(pildora()).not.toBeInTheDocument();
    // Y lo DICE: una píldora permanente promete continuidad con su sola
    // presencia, así que romperla en silencio no vale.
    expect(screen.getByText('El asistente empieza de cero en cada módulo.')).toBeInTheDocument();
  });

  it('con una pregunta en vuelo, el aviso es el de la pregunta cancelada', () => {
    const { rerender } = render(
      <ThemeProvider>
        <AsistenteProvider>
          <ModuloConAsistente estado="cargando" />
          <ToastContainer />
        </AsistenteProvider>
      </ThemeProvider>,
    );
    fireEvent.click(pildora()!);

    rerender(
      <ThemeProvider>
        <AsistenteProvider>
          <ModuloSinAsistente />
          <ToastContainer />
        </AsistenteProvider>
      </ThemeProvider>,
    );

    expect(screen.getByText(/se ha cancelado/)).toBeInTheDocument();
  });
});

describe('por debajo de 768 px no hay píldora (R4 · D-I16)', () => {
  it('el asistente se alcanza sólo por el Menú', () => {
    const original = window.matchMedia;
    window.matchMedia = ((q: string) =>
      ({
        matches: false, // ni min-width: 768px ni nada: pantalla estrecha
        media: q,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList) as typeof window.matchMedia;

    act(() => {
      montar(<ModuloConAsistente />);
    });
    expect(pildora()).not.toBeInTheDocument();
    // Pero el asistente sigue estando: por el Menú, que es lo que pidió el
    // usuario para móvil.
    fireEvent.click(screen.getByRole('button', { name: 'abrir desde el menú' }));
    expect(screen.getByText('ventana del asistente')).toBeInTheDocument();

    window.matchMedia = original;
  });
});
