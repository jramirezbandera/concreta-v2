// El atajo «A» del asistente, ahora que su botón ya no está en la barra.
//
// Estos tests vivían en `src/test/ai/AiButton.test.tsx`. El componente murió el
// 2026-09-22 (el asistente se mudó al Menú) y el listener subió a la Topbar,
// que es tan global como lo es `onOpenAssistant`. Si no se hubiera movido, la
// tecla «A» habría dejado de funcionar SIN un solo error: el fallo más fácil de
// no ver de todo este rediseño. Por eso el atajo tiene test propio.
//
// Cuando el asistente tenga su provider global (tarea T2 del plan), estos tests
// se mudan con él.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { Topbar } from '../../components/layout/Topbar';
import { ThemeProvider } from '../../lib/theme/ThemeProvider';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';

function renderTopbar(onOpenAssistant?: () => void) {
  render(
    <MemoryRouter initialEntries={['/horm/vigas']}>
      <ThemeProvider>
        <UnitSystemProvider>
          <Topbar moduleLabel="Vigas" moduleGroup="HORMIGÓN" onOpenAssistant={onOpenAssistant} />
        </UnitSystemProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

describe('Topbar — atajo «A»', () => {
  it('abre el asistente sin foco en un campo de texto', () => {
    const onOpenAssistant = vi.fn();
    renderTopbar(onOpenAssistant);

    fireEvent.keyDown(window, { key: 'a' });
    expect(onOpenAssistant).toHaveBeenCalledTimes(1);
  });

  it('NO dispara con foco en un input: no secuestra la escritura', () => {
    const onOpenAssistant = vi.fn();
    renderTopbar(onOpenAssistant);
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    fireEvent.keyDown(window, { key: 'a' });
    expect(onOpenAssistant).not.toHaveBeenCalled();

    input.remove();
  });

  it('ignora «A» con modificadores (Ctrl / Meta / Alt)', () => {
    const onOpenAssistant = vi.fn();
    renderTopbar(onOpenAssistant);

    fireEvent.keyDown(window, { key: 'a', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'a', metaKey: true });
    fireEvent.keyDown(window, { key: 'a', altKey: true });
    expect(onOpenAssistant).not.toHaveBeenCalled();
  });

  // Las cuatro pantallas sin asistente no pasan `onOpenAssistant`: allí la
  // tecla no debe hacer nada (y la fila del Menú sale apagada).
  it('no hace nada en las pantallas sin asistente', () => {
    renderTopbar(undefined);
    fireEvent.keyDown(window, { key: 'a' });
    // El Menú sigue cerrado: nada ha reaccionado a la tecla.
    expect(screen.getByRole('button', { name: 'Menú' })).toHaveAttribute('aria-expanded', 'false');
  });
});
