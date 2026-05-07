import { useState } from 'react';
import { X } from 'lucide-react';

const STORAGE_KEY = 'concreta-fem-2d-mobile-readonly-banner-seen';

function loadDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function persistDismissed() {
  try {
    localStorage.setItem(STORAGE_KEY, 'true');
  } catch {
    // private mode / quota — accept transient loss
  }
}

/**
 * Mobile-only banner shown above the FEM canvas explaining read-only mode.
 * Without this, a user familiar with the desktop editor would tap where the
 * tool palette used to be and see no response. The banner removes that confusion.
 *
 * Persists the dismissal in localStorage so it appears at most once per device.
 */
export function ReadOnlyBanner() {
  const [dismissed, setDismissed] = useState<boolean>(loadDismissed);
  if (dismissed) return null;
  return (
    <div
      role="status"
      className="md:hidden absolute bottom-3 left-1/2 -translate-x-1/2 z-10 max-w-[calc(100%-24px)] flex items-center gap-2 px-3 py-2 rounded bg-bg-elevated border border-border-main text-text-secondary text-[11px]"
    >
      <span className="font-mono leading-snug">
        Modo consulta — abre en tablet o desktop para editar.
      </span>
      <button
        type="button"
        onClick={() => {
          persistDismissed();
          setDismissed(true);
        }}
        className="ml-auto p-1 -mr-1 text-text-disabled hover:text-text-secondary"
        aria-label="Ocultar aviso"
      >
        <X size={12} />
      </button>
    </div>
  );
}
