// Interruptor de dos estados con la etiqueta DENTRO de la píldora.
//
// No es un checkbox disfrazado: la píldora dice en palabras en qué estado está
// («Incluido» / «Omitido»), no si al pulsarla pasará algo. Por eso lleva
// `aria-pressed` y no `role="switch"` — y por eso los textos son adjetivos del
// estado actual, nunca imperativos.

import type { JSX } from 'react';

interface Props {
  on: boolean;
  onToggle: () => void;
  /** Texto cuando está activo ("Incluido", ">1000 m"). */
  onLabel: string;
  /** Texto cuando está inactivo ("Omitido", "≤1000 m"). */
  offLabel: string;
  /** Nombre accesible cuando la etiqueta de al lado no lo aporta. */
  ariaLabel?: string;
  disabled?: boolean;
}

export function ToggleChip({ on, onToggle, onLabel, offLabel, ariaLabel, disabled }: Props): JSX.Element {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={on}
      aria-label={ariaLabel}
      className={`shrink-0 rounded px-3 py-1 font-mono text-[11px] font-semibold transition-colors disabled:opacity-50 ${
        on
          ? 'border border-accent/40 bg-accent/15 text-accent'
          : 'border border-border-main bg-bg-elevated text-text-disabled'
      }`}
    >
      {on ? onLabel : offLabel}
    </button>
  );
}
