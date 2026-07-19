import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { ToastContainer } from '../../components/ui/Toast';
import { presentUpdatePrompt, applyUpdate } from '../../components/pwa/pwaUpdate';

// Cubre la parte visible del mecanismo de cache-bust: cuando llega una versión
// nueva, `presentUpdatePrompt` enseña un toast persistente cuya acción aplica la
// actualización. El registro del SW en sí (useRegisterSW) es integración de
// navegador y no se ejercita en jsdom.
afterEach(cleanup);

// jsdom no implementa location.reload ni navigator.serviceWorker: los sustituimos
// para poder verificar que "Actualizar" recarga (y por qué vía) sin tocar la
// navegación real.
const originalLocation = window.location;
let reloadSpy: ReturnType<typeof vi.fn>;
let swTarget: EventTarget;

beforeEach(() => {
  reloadSpy = vi.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { ...originalLocation, reload: reloadSpy },
  });
  swTarget = new EventTarget();
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: swTarget,
  });
});

afterEach(() => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: originalLocation,
  });
  // Restaurar el estado por defecto de jsdom (sin SW).
  delete (navigator as { serviceWorker?: unknown }).serviceWorker;
});

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

describe('applyUpdate', () => {
  it('recarga en cuanto el worker nuevo toma el control (controllerchange)', () => {
    vi.useFakeTimers();
    try {
      const update = vi.fn();
      applyUpdate(update);

      expect(update).toHaveBeenCalledWith(true);
      expect(reloadSpy).not.toHaveBeenCalled();

      swTarget.dispatchEvent(new Event('controllerchange'));
      expect(reloadSpy).toHaveBeenCalledTimes(1);

      // El plazo de seguridad no debe provocar una segunda recarga.
      vi.advanceTimersByTime(10_000);
      expect(reloadSpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('recarga por plazo de seguridad si no llega controllerchange (pestaña sin controlar)', () => {
    vi.useFakeTimers();
    try {
      const update = vi.fn();
      applyUpdate(update);

      expect(reloadSpy).not.toHaveBeenCalled();
      vi.advanceTimersByTime(3000);
      expect(reloadSpy).toHaveBeenCalledTimes(1);

      // Un controllerchange tardío tras la recarga no la repite.
      swTarget.dispatchEvent(new Event('controllerchange'));
      expect(reloadSpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
