// El atajo «A» del asistente, ya en su sitio definitivo.
//
// Su recorrido cuenta por qué tiene test propio: vivía dentro de `AiButton`,
// que era un botón de la topbar. Al mudarse el asistente al Menú (2026-09-22)
// el botón desapareció, y con él se habría ido el atajo SIN un solo error —un
// día la «A» deja de hacer nada—, que es el fallo más fácil de no ver de todo
// el rediseño. T1 lo dejó de paso en la `Topbar`; T2 lo sube al
// `AsistenteProvider`, al lado del «C» de la calculadora.
//
// Lo que se prueba aquí es justamente que ya no depende de ningún botón: el
// Menú no está montado en estos tests y la tecla funciona igual.
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { AsistenteProvider } from '../../components/ai/AsistenteProvider';
import { useAsistenteDeModulo } from '../../components/ai/useAsistenteDeModulo';
import { ThemeProvider } from '../../lib/theme/ThemeProvider';

/** Un módulo con asistente: lo declara al montarse y enseña si se ha abierto. */
function ModuloConAsistente() {
  const { sesion } = useAsistenteDeModulo();
  return sesion ? <span>asistente abierto</span> : null;
}

/** Una de las cuatro pantallas sin asistente: no declara nada. */
function PantallaSinAsistente() {
  return <p>pantalla sin asistente</p>;
}

function montar(ui: React.ReactNode) {
  render(
    <ThemeProvider>
      <AsistenteProvider>{ui}</AsistenteProvider>
    </ThemeProvider>,
  );
}

const abierto = () => screen.queryByText('asistente abierto');

describe('atajo «A» — vive en el provider, no en ningún botón', () => {
  it('abre el asistente sin foco en un campo de texto', () => {
    montar(<ModuloConAsistente />);
    expect(abierto()).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'a' });
    expect(abierto()).toBeInTheDocument();
  });

  it('la «A» mayúscula vale igual', () => {
    montar(<ModuloConAsistente />);

    fireEvent.keyDown(window, { key: 'A' });
    expect(abierto()).toBeInTheDocument();
  });

  it('NO dispara con foco en un input: no secuestra la escritura', () => {
    montar(<ModuloConAsistente />);
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    fireEvent.keyDown(window, { key: 'a' });
    expect(abierto()).not.toBeInTheDocument();

    input.remove();
  });

  it('ignora «A» con modificadores (Ctrl / Meta / Alt)', () => {
    montar(<ModuloConAsistente />);

    fireEvent.keyDown(window, { key: 'a', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'a', metaKey: true });
    fireEvent.keyDown(window, { key: 'a', altKey: true });
    expect(abierto()).not.toBeInTheDocument();
  });

  // Las cuatro pantallas sin asistente (anejo, ficha DB SE, panel de obra, Mi
  // estudio) no lo declaran: allí la tecla no debe hacer nada, igual que su
  // fila del Menú sale apagada.
  it('no hace nada en las pantallas sin asistente', () => {
    montar(<PantallaSinAsistente />);

    fireEvent.keyDown(window, { key: 'a' });
    expect(abierto()).not.toBeInTheDocument();
    expect(screen.getByText('pantalla sin asistente')).toBeInTheDocument();
  });

  // Aquí está el premio de T2: antes el listener colgaba de la `Topbar`, o sea
  // de que hubiera barra. Al irse el módulo deja de responder, y al volver otro
  // vuelve a responder, sin que nadie tenga que acordarse de pasar una prop.
  it('sigue al módulo: deja de responder cuando el módulo se va', () => {
    const { rerender } = render(
      <ThemeProvider>
        <AsistenteProvider>
          <ModuloConAsistente />
        </AsistenteProvider>
      </ThemeProvider>,
    );

    rerender(
      <ThemeProvider>
        <AsistenteProvider>
          <PantallaSinAsistente />
        </AsistenteProvider>
      </ThemeProvider>,
    );

    fireEvent.keyDown(window, { key: 'a' });
    expect(abierto()).not.toBeInTheDocument();
  });
});
