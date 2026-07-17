// Tests del botón del asistente IA de la topbar (src/components/ai/AiButton.tsx).
// Componente presentacional + atajo "A". Cubre: doble render (icono móvil +
// etiqueta escritorio, ambos "Abrir asistente IA"), clic → onClick, y el atajo
// "A" con sus guardas (foco en campo de texto, modificadores).
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AiButton } from '../../components/ai/AiButton';

describe('AiButton', () => {
  it('renderiza icono móvil + etiqueta escritorio y llama onClick al pulsar', async () => {
    const onClick = vi.fn();
    render(<AiButton onClick={onClick} />);

    // Dos botones (móvil sm:hidden + escritorio), ambos con aria-label estable.
    const btns = screen.getAllByRole('button', { name: 'Abrir asistente IA' });
    expect(btns).toHaveLength(2);
    expect(screen.getByText('Asistente IA')).toBeInTheDocument();

    await userEvent.setup().click(btns[0]);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('atajo "A" abre el asistente cuando no hay foco en un campo de texto', () => {
    const onClick = vi.fn();
    render(<AiButton onClick={onClick} />);
    fireEvent.keyDown(window, { key: 'a' });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('atajo "A" NO dispara con foco en un input (no secuestra la escritura)', () => {
    const onClick = vi.fn();
    render(
      <>
        <input aria-label="campo" />
        <AiButton onClick={onClick} />
      </>,
    );
    (screen.getByLabelText('campo') as HTMLInputElement).focus();
    fireEvent.keyDown(window, { key: 'a' });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('atajo ignora "A" con modificadores (Ctrl / Meta / Alt)', () => {
    const onClick = vi.fn();
    render(<AiButton onClick={onClick} />);
    fireEvent.keyDown(window, { key: 'a', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'a', metaKey: true });
    fireEvent.keyDown(window, { key: 'a', altKey: true });
    expect(onClick).not.toHaveBeenCalled();
  });
});
