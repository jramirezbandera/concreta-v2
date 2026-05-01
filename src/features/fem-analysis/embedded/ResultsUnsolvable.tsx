// FEM 2D — ResultsUnsolvable (Lane R6 V1.1, Codex catch P2-D)
//
// Rendered in the right results panel when validation produces severity:'fail'
// errors (NO_SUPPORTS, INSUFFICIENT_REACTIONS, FLOATING_BARS, BIARTICULATED_BAR).
// Suppresses the bar list and reactions; canvas keeps drawing loads/geometry
// dimmed (Lane R2 will dim diagram opacity).
//
// Local component (NOT shared); promote to <ErrorAmbient> in src/components/ui/
// when a second module needs this pattern (TODOS.md V1.2 entry).

import type { ModelError } from '../types';

interface Props {
  errors: ModelError[];
}

export function ResultsUnsolvable({ errors }: Props) {
  const failErrors = errors.filter((e) => e.severity === 'fail');
  const firstError = failErrors[0];

  return (
    <div
      style={{
        padding: '24px 16px',
        flex: 1,
        background: 'linear-gradient(180deg, rgba(239,68,68,0.08) 0%, transparent 80px)',
        borderTop: '2px solid var(--color-state-fail)',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 8,
        }}
      >
        <div
          className="font-mono"
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--color-state-fail)',
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
          }}
        >
          ⚠ Modelo no resoluble
        </div>
        {firstError && (
          <div style={{ fontSize: 12, color: 'var(--color-text-primary)', lineHeight: 1.5 }}>
            {firstError.msg}
          </div>
        )}
        {failErrors.length > 1 && (
          <ul
            style={{
              fontSize: 11,
              color: 'var(--color-text-secondary)',
              listStyle: 'disc',
              paddingLeft: 18,
              marginTop: 4,
              lineHeight: 1.4,
            }}
          >
            {failErrors.slice(1).map((e, i) => (
              <li key={i}>{e.msg}</li>
            ))}
          </ul>
        )}
        <div
          style={{
            fontSize: 11,
            color: 'var(--color-text-disabled)',
            marginTop: 8,
            fontStyle: 'italic',
          }}
        >
          Corrige los errores en el lienzo para recuperar las comprobaciones.
        </div>
      </div>
    </div>
  );
}
