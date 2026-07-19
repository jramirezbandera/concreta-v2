// FEM 2D — "Nueva estructura" dialog (templates as SEEDS of the free editor).
//
// The parametric templates no longer ARE the module state: they generate the
// starting model, which is then freely editable on the canvas. This modal owns
// a local Fem2DUiState DRAFT (selector + per-template params via
// TemplateDraftForm); "Crear" builds the model through buildModelFromState and
// hands it to the shell, which resets the edit history (a new structure is not
// a user edit). Same visual language as TitlePromptModal (backdrop, Escape, X).
//
// Creating REPLACES the current model — the footer says so explicitly; the
// destructive path is a single click but fully undone by "Nueva estructura"
// again (the draft always starts from fresh template defaults).

import { useEffect, useState, type JSX } from 'react';
import { LayoutTemplate, X } from 'lucide-react';
import { TemplateDraftForm } from './TemplateForms';
import { buildModelFromState, fem2dUiDefaults, validateActive, type Fem2DUiState } from './uiState';
import type { Fem2DModel } from './types';

interface NewStructureDialogProps {
  /** Crear: replaces the live model (caller resets history + selection). */
  onCreate: (model: Fem2DModel) => void;
  onCancel: () => void;
}

export function NewStructureDialog({ onCreate, onCancel }: NewStructureDialogProps): JSX.Element {
  const [draft, setDraft] = useState<Fem2DUiState>(fem2dUiDefaults);
  const errors = validateActive(draft);

  // Escape closes; lock body scroll + return focus to the trigger on close.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const trigger = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      trigger?.focus?.();
    };
  }, [onCancel]);

  const create = () => {
    const { model } = buildModelFromState(draft);
    if (model) onCreate(model);
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-50 flex items-center justify-center px-4"
      role="presentation"
    >
      <div
        className="bg-bg-surface rounded-lg shadow-2xl border border-border-main w-[460px] max-w-full max-h-[85vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-structure-heading"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-border-main shrink-0">
          <LayoutTemplate size={16} className="text-text-secondary" aria-hidden="true" />
          <span id="new-structure-heading" className="text-sm font-medium text-text-primary">
            Nueva estructura
          </span>
          <div className="flex-1" />
          <button
            onClick={onCancel}
            aria-label="Cerrar"
            className="p-1.5 rounded hover:bg-bg-elevated text-text-secondary hover:text-text-primary transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body: the parametric draft form (scrolls) */}
        <div className="scroll-hide flex-1 overflow-y-auto px-5 py-4">
          <TemplateDraftForm value={draft} onChange={setDraft} errors={errors} />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border-main shrink-0">
          <p className="text-[11px] text-text-disabled leading-snug">
            Sustituirá el modelo actual (el historial se reinicia).
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onCancel}
              className="px-4 py-1.5 rounded text-sm text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={create}
              disabled={errors.length > 0}
              className="px-4 py-1.5 rounded text-sm text-accent disabled:opacity-40 transition-all"
              style={{
                border: '1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)',
                background: 'color-mix(in srgb, var(--color-accent) 6%, transparent)',
              }}
            >
              Crear
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
