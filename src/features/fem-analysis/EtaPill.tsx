import type { SolveResult } from './types';

interface Props {
  result: SolveResult;
  onClick: () => void;
}

/**
 * Mobile-only floating pill that surfaces the global verdict (η% or error count)
 * across all tabs. Tapping switches to the Resultados tab. The use case driving
 * this is "abro URL-share en obra, ¿pasa o no pasa?" — the user must not have
 * to tab-hop to find the answer.
 *
 * Color reuses the SideRail logic (state-ok / state-warn / state-fail).
 */
export function EtaPill({ result, onClick }: Props) {
  const errorCount = result.errors.length;
  const status = result.status;
  const eta = result.maxEta;

  let bg: string;
  let label: string;
  if (errorCount > 0) {
    bg = 'bg-state-fail';
    label = `${errorCount} ${errorCount === 1 ? 'error' : 'errores'}`;
  } else if (status === 'ok') {
    bg = 'bg-state-ok';
    label = `η ${(eta * 100).toFixed(0)}%`;
  } else if (status === 'warn') {
    bg = 'bg-state-warn';
    label = `η ${(eta * 100).toFixed(0)}%`;
  } else if (status === 'fail') {
    bg = 'bg-state-fail';
    label = `η ${(eta * 100).toFixed(0)}%`;
  } else {
    bg = 'bg-state-neutral';
    label = '—';
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`md:hidden absolute top-3 right-3 z-10 ${bg} text-white font-mono text-[11px] font-semibold px-3 py-2 rounded shadow-md min-h-11 min-w-11 flex items-center justify-center`}
      aria-label={`Ver resultados — ${label}`}
    >
      {label}
    </button>
  );
}
