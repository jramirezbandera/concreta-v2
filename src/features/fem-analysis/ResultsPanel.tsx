// FEM 2D — ResultsPanel (Lane R6 V1.1)
//
// Right-column orchestrator. Mounts:
//   - <ResultsHeader> always on top (h-9 inline header — DESIGN.md compliant)
//   - When solver returns 'unsolvable': <ResultsUnsolvable> with errors
//   - When no bar selected: model summary (bars ranked + reactions)
//   - When HA bar selected: <RcBarResults hideSectionTabs>
//   - When Steel bar selected: <SteelBarResults>
//
// "Comprobar en Vigas HA →" deep-link is gone — embed real means the user is
// already conceptually in the module's results UI.

import { ambientStyle } from '../../components/checks';
import { ResultsHeader } from './embedded/ResultsHeader';
import { ResultsUnsolvable } from './embedded/ResultsUnsolvable';
import { RcBarResults } from './embedded/RcBarResults';
import { SteelBarResults } from './embedded/SteelBarResults';
import type {
  BarResult,
  DesignBar,
  DesignModel,
  Selected,
  SolveResult,
} from './types';

interface Props {
  model: DesignModel;
  result: SolveResult;
  selected: Selected;
  setSelected: (s: Selected) => void;
  activeSection: 'vano' | 'apoyo';
  setActiveSection: (s: 'vano' | 'apoyo') => void;
  /** Combo selected in topbar canvas — drives which reactions envelope to show. */
  combo: 'ELU' | 'ELS_c' | 'ELS_frec' | 'ELS_cp';
}

export function ResultsPanel({
  model, result, selected, setSelected, activeSection, setActiveSection, combo,
}: Props) {
  const ambient = (result.status === 'ok' || result.status === 'warn' || result.status === 'fail')
    ? ambientStyle(result.status)
    : {};

  const selectedBar = selected?.kind === 'bar'
    ? model.bars.find((b) => b.id === selected.id)
    : undefined;
  const selectedBarResult = selectedBar ? result.perBar[selectedBar.id] : undefined;

  // Decide unsolvable: solver-level fail errors (mecanismo, sin apoyos, ...).
  const isUnsolvable = result.errors.some((e) => e.severity === 'fail');

  return (
    <div style={{ ...ambient, height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <ResultsHeader
        result={result}
        selectedBar={selectedBar}
        activeSection={activeSection}
        setActiveSection={setActiveSection}
      />

      {isUnsolvable ? (
        <ResultsUnsolvable errors={result.errors} />
      ) : selectedBar ? (
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {selectedBar.material === 'rc'
            ? <RcBarResults barResult={selectedBarResult} activeSection={activeSection} />
            : <SteelBarResults barResult={selectedBarResult} bar={selectedBar} />}
        </div>
      ) : (
        <ModelSummary
          model={model}
          result={result}
          setSelected={setSelected}
          combo={combo}
        />
      )}
    </div>
  );
}

function comboLabel(combo: 'ELU' | 'ELS_c' | 'ELS_frec' | 'ELS_cp'): string {
  return (
    combo === 'ELU'      ? 'ELU' :
    combo === 'ELS_c'    ? 'ELS-c' :
    combo === 'ELS_frec' ? 'ELS-frec' :
                           'ELS-cp'
  );
}

// ── No-bar-selected: model summary view (bars list + reactions) ─────────────

function ModelSummary({
  model, result, setSelected, combo,
}: {
  model: DesignModel;
  result: SolveResult;
  setSelected: (s: Selected) => void;
  combo: 'ELU' | 'ELS_c' | 'ELS_frec' | 'ELS_cp';
}) {
  // V1.1 R9: reactions list reflects the combo selector. Falls back to summed
  // `reactions` if the new envelope structure isn't present.
  const reactionsForCombo =
    result.reactionsByCombo?.[combo] ?? result.reactions;
  const ranked = model.bars
    .map((b) => ({ b, r: result.perBar[b.id] }))
    .filter((x): x is { b: DesignBar; r: BarResult } => !!x.r)
    .sort((a, b) => (b.r.eta || 0) - (a.r.eta || 0));

  return (
    <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '14px 16px' }}>
      <div style={{
        fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '0.07em', color: 'var(--color-text-disabled)',
        padding: '0 0 7px', borderBottom: '1px solid var(--color-border-sub)',
      }}>
        Verificación por barra
      </div>
      <div style={{ marginTop: 6 }}>
        {ranked.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--color-text-disabled)', padding: '12px 0', fontStyle: 'italic' }}>
            Sin resultados todavía. Añade armado a las barras.
          </div>
        )}
        {ranked.map(({ b, r }) => {
          const statusColor =
            r.status === 'ok' ? 'var(--color-state-ok)'
            : r.status === 'warn' ? 'var(--color-state-warn)'
            : r.status === 'fail' ? 'var(--color-state-fail)'
            : 'var(--color-state-neutral)';
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => setSelected({ kind: 'bar', id: b.id })}
              style={{
                width: '100%', textAlign: 'left',
                padding: '7px 10px',
                marginBottom: 2,
                background: 'transparent',
                border: '1px solid transparent',
                borderRadius: 4,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
                transition: 'background-color 150ms ease-in-out',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(56,189,248,0.05)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-primary)' }}>{b.id}</span>
              <span style={{ fontSize: 10, color: 'var(--color-text-disabled)', textTransform: 'uppercase' }}>
                {b.material === 'rc' ? 'HA' : 'Acero'}
              </span>
              <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 11, color: statusColor }}>
                {r.status === 'pending' ? '—' : `${(r.eta * 100).toFixed(0)}%`}
              </span>
            </button>
          );
        })}
      </div>

      {ranked.length > 0 && (
        <div style={{ fontSize: 10, color: 'var(--color-text-disabled)', fontStyle: 'italic', marginTop: 8 }}>
          Click una barra para ver detalles.
        </div>
      )}

      {reactionsForCombo.length > 0 && (
        <>
          <div style={{
            marginTop: 14,
            fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.07em', color: 'var(--color-text-disabled)',
            padding: '9px 0 7px', borderBottom: '1px solid var(--color-border-sub)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span>Reacciones</span>
            <span className="font-mono" style={{ fontSize: 9, color: 'var(--color-text-disabled)', textTransform: 'none', letterSpacing: 0 }}>
              {comboLabel(combo)}
            </span>
          </div>
          {reactionsForCombo.map((r, i) => (
            <div
              key={i}
              style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '6px 0', borderBottom: '1px solid var(--color-border-sub)',
                fontSize: 11,
              }}
            >
              <span style={{ color: 'var(--color-text-secondary)' }}>{r.node}</span>
              <span className="font-mono" style={{ color: 'var(--color-text-primary)' }}>
                Ry={r.Ry.toFixed(1)} kN{r.Mr ? ` · M=${r.Mr.toFixed(1)} kN·m` : ''}
              </span>
            </div>
          ))}
        </>
      )}

      <NormativaFooter />
    </div>
  );
}

function NormativaFooter() {
  const rows: { label: string; value: string }[] = [
    { label: 'Hormigón',  value: 'CE 2021' },
    { label: 'Acero',     value: 'CTE DB-SE-A · EC3' },
    { label: 'Acciones',  value: 'CTE DB-SE' },
  ];
  return (
    <>
      <div style={{
        marginTop: 14,
        fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '0.07em', color: 'var(--color-text-disabled)',
        padding: '9px 0 7px', borderBottom: '1px solid var(--color-border-sub)',
      }}>
        Normativa
      </div>
      {rows.map((r) => (
        <div
          key={r.label}
          style={{
            display: 'flex', justifyContent: 'space-between',
            padding: '5px 0', fontSize: 11,
          }}
        >
          <span style={{ color: 'var(--color-text-secondary)' }}>{r.label}</span>
          <span className="font-mono" style={{ color: 'var(--color-text-primary)' }}>{r.value}</span>
        </div>
      ))}
    </>
  );
}
