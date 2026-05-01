// FEM 2D — ResultsHeader (Lane R6 V1.1)
//
// One-row inline header at the top of the right results panel.
//   Modelo · ● CUMPLE 87%                      (no bar selected)
//   Barra b1 · HA  ·  ● INCUMPLE 119%  ·  [vano │ apoyo]   (HA bar selected)
//   Modelo · ⚠ INESTABLE — no hay apoyos       (model unsolvable)
//
// max h-9 (36px), inline-flex, never a full-width chip stack
// (DESIGN.md line 309 + 398 explicit prohibition).

import type { BarResult, DesignBar, SolveResult } from '../types';

interface Props {
  result: SolveResult;
  selectedBar: DesignBar | undefined;
  activeSection: 'vano' | 'apoyo';
  setActiveSection: (s: 'vano' | 'apoyo') => void;
}

type VerdictDisplay = {
  label: string;
  symbol: string;
  bg: string;
  fg: string;
};

function verdictForStatus(status: BarResult['status'] | SolveResult['status']): VerdictDisplay {
  switch (status) {
    case 'ok':      return { label: 'CUMPLE',    symbol: '●', bg: 'rgba(34,197,94,0.10)',  fg: 'var(--color-state-ok)' };
    case 'warn':    return { label: 'REVISIÓN',  symbol: '●', bg: 'rgba(245,158,11,0.10)', fg: 'var(--color-state-warn)' };
    case 'fail':    return { label: 'INCUMPLE',  symbol: '●', bg: 'rgba(239,68,68,0.10)',  fg: 'var(--color-state-fail)' };
    case 'pending': return { label: 'PENDIENTE', symbol: '○', bg: 'rgba(100,116,139,0.10)', fg: 'var(--color-state-neutral)' };
    case 'neutral':
    default:        return { label: '—',         symbol: '●', bg: 'rgba(100,116,139,0.10)', fg: 'var(--color-state-neutral)' };
  }
}

export function ResultsHeader({ result, selectedBar, activeSection, setActiveSection }: Props) {
  // Decide which verdict drives the badge: bar-selected → bar.status; otherwise model.status.
  const barResult = selectedBar ? result.perBar[selectedBar.id] : undefined;
  const v = verdictForStatus(barResult?.status ?? result.status);
  const eta = barResult?.eta ?? result.maxEta;
  const showEta = (barResult?.status ?? result.status) !== 'pending'
                  && (barResult?.status ?? result.status) !== 'neutral'
                  && eta > 0;

  return (
    <div
      role="region"
      aria-label="Resultado del modelo"
      style={{
        height: 36,
        padding: '0 16px',
        background: 'var(--color-bg-surface)',
        borderBottom: '1px solid var(--color-border-main)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexShrink: 0,
      }}
    >
      {/* Subject: model or bar */}
      <span
        className="font-mono"
        style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)' }}
      >
        {selectedBar
          ? `Barra ${selectedBar.id} · ${selectedBar.material === 'rc' ? 'HA' : 'Acero'}`
          : 'Modelo'}
      </span>

      {/* Inline verdict badge — DESIGN.md compliant (NOT full-width chip) */}
      <span
        className="font-mono"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 10,
          fontWeight: 600,
          padding: '2px 6px',
          borderRadius: 4,
          background: v.bg,
          color: v.fg,
          letterSpacing: '0.02em',
          transition: 'background-color 150ms ease-in-out, color 150ms ease-in-out',
        }}
      >
        {v.symbol} {v.label}{showEta ? ` ${(eta * 100).toFixed(0)}%` : ''}
      </span>

      {/* Vano/Apoyo toggle (HA bar only) */}
      {selectedBar?.material === 'rc' && (
        <div
          role="tablist"
          aria-label="Sección"
          style={{ display: 'inline-flex', marginLeft: 'auto', gap: 0 }}
        >
          {(['vano', 'apoyo'] as const).map((s) => {
            const active = activeSection === s;
            return (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveSection(s)}
                className="font-mono"
                style={{
                  fontSize: 10,
                  padding: '2px 8px',
                  borderRadius: 4,
                  background: active ? 'rgba(56,189,248,0.15)' : 'transparent',
                  color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'background-color 150ms ease-in-out, color 150ms ease-in-out',
                  textTransform: 'capitalize',
                }}
              >
                {s}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
