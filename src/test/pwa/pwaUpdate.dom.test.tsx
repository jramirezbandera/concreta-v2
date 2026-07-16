import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { ToastContainer } from '../../components/ui/Toast';
import { presentUpdatePrompt } from '../../components/pwa/pwaUpdate';

// Cubre la parte visible del mecanismo de cache-bust: cuando llega una versión
// nueva, `presentUpdatePrompt` enseña un toast persistente cuya acción aplica la
// actualización. El registro del SW en sí (useRegisterSW) es integración de
// navegador y no se ejercita en jsdom.
afterEach(cleanup);

describe('presentUpdatePrompt', () => {
  it('muestra un toast con acción "Actualizar" que aplica la actualización', () => {
    const update = vi.fn();
    render(<ToastContainer />);

    act(() => presentUpdatePrompt(update));

    expect(screen.getByText(/nueva versión/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    expect(update).toHaveBeenCalledWith(true);
  });

  it('es persistente: no se auto-descarta sin acción del usuario', () => {
    vi.useFakeTimers();
    try {
      const update = vi.fn();
      render(<ToastContainer />);

      act(() => presentUpdatePrompt(update));
      act(() => vi.advanceTimersByTime(60_000)); // por encima de cualquier autoDismiss

      expect(screen.getByRole('button', { name: 'Actualizar' })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
