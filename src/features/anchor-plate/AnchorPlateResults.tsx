import { useState, useId, type ReactNode } from 'react';
import type { AnchorPlateResult } from '../../lib/calculations/anchorPlate';
import {
  CheckRowItem,
  GroupHeader,
  ValueRow,
  VerdictBadge,
  ambientStyle,
} from '../../components/checks';

interface Props {
  result: AnchorPlateResult;
}

function CollapsibleGroup({
  label,
  defaultOpen = false,
  children,
}: {
  label: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-text-disabled pt-3.5 pb-2 px-4 border-b border-border-sub hover:text-text-secondary transition-colors cursor-pointer"
      >
        <span className="flex items-center gap-1.5">
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            className="transition-transform duration-150"
            style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
            aria-hidden="true"
          >
            <path d="M3 4l2 2 2-2" />
          </svg>
          {label}
        </span>
      </button>
      {open && <div id={contentId}>{children}</div>}
    </>
  );
}

export function AnchorPlateResults({ result }: Props) {
  if (!result.valid) {
    return (
      <div className="text-[12px] text-text-disabled italic">
        Sin solicitación — introduce NEd, Mx o My para calcular.
      </div>
    );
  }

  const { checks, solver, worstUtil, overallStatus, warnings, pr1Limitations } = result;

  // D1 — group checks into 4 sub-bands (design review finding)
  const plateChecks   = checks.filter((c) => c.id === 'plate-compression' || c.id === 'plate-bending');
  const boltChecks    = checks.filter((c) => c.id === 'bolt-tension' || c.id === 'bolt-shear' || c.id === 'bolt-interaction');
  const anchorChecks  = checks.filter((c) => c.id === 'anchorage-length' || c.id === 'concrete-cone' || c.id === 'pullout' || c.id === 'splitting');
  const stiffChecks   = checks.filter((c) => c.id === 'stiffener');

  const tensionedBolts = solver.bolts.filter((b) => b.inTension && b.Ft > 0);

  return (
    <div className="rounded border border-border-main overflow-hidden" style={ambientStyle(overallStatus)}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-sub">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled">Resultados calculados</span>
          <VerdictBadge status={overallStatus} />
          {solver.mode === 'biaxial-grid' && (
            <span
              className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider bg-state-warn/15 text-state-warn border border-state-warn/40"
              title="Solver biaxial no convergente dentro de tolerancia — resultado por rejilla de búsqueda"
            >
              APROX · grid
            </span>
          )}
        </div>
        <span className="font-mono text-[11px] text-text-secondary tabular-nums">
          util. máx. {isFinite(worstUtil) ? `${(worstUtil * 100).toFixed(0)}%` : '∞'}
        </span>
      </div>

      {/* Scope limitations (simplificaciones vigentes) */}
      {pr1Limitations.length > 0 && (
        <div className="px-4 py-2 bg-state-warn/10 border-b border-state-warn/30">
          <p className="text-[10px] uppercase tracking-widest text-state-warn font-mono mb-1">Simplificaciones</p>
          <ul className="text-[11px] text-text-secondary space-y-0.5">
            {pr1Limitations.map((note, i) => (
              <li key={i}>· {note}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Validation warnings (D3 — amber strip under header) */}
      {warnings.length > 0 && (
        <div className="px-4 py-2 bg-state-warn/10 border-b border-state-warn/30">
          <p className="text-[10px] uppercase tracking-widest text-state-warn font-mono mb-1">Geometría</p>
          <ul className="text-[11px] text-text-secondary space-y-0.5">
            {warnings.map((w, i) => (
              <li key={i}>· {w.message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Group 1 — Placa */}
      <GroupHeader label={`Placa (${plateChecks.length})`} />
      {plateChecks.map((c) => <CheckRowItem key={c.id} check={c} />)}

      {/* Group 2 — Barras */}
      <GroupHeader label={`Barras (${boltChecks.length})`} />
      {boltChecks.map((c) => <CheckRowItem key={c.id} check={c} />)}

      {/* Group 3 — Anclaje en hormigón */}
      <GroupHeader label={`Anclaje en hormigón (${anchorChecks.length})`} />
      {anchorChecks.map((c) => <CheckRowItem key={c.id} check={c} />)}

      {/* Group 4 — Rigidizadores */}
      <GroupHeader label={`Rigidizadores (${stiffChecks.length})`} />
      {stiffChecks.map((c) => <CheckRowItem key={c.id} check={c} />)}

      {/* Solver summary values */}
      <GroupHeader label="Estado del nudo" />
      <ValueRow label="Modo"              value={solver.mode} />
      <ValueRow label="Nc (compresión)"   value={`${solver.Nc.toFixed(1)} kN`} />
      <ValueRow label="Ft total (grupo)"  value={`${solver.Ft_total.toFixed(1)} kN`} />
      <ValueRow label="Barras traccionadas" value={`${solver.n_t} de ${solver.bolts.length}`} />

      {/* Per-bar tension sub-panel, only if any tensile bar (D6 — collapsed by default) */}
      {tensionedBolts.length > 0 && (
        <CollapsibleGroup label={`Tracción por barra (${tensionedBolts.length}/${solver.bolts.length})`} defaultOpen={false}>
          {solver.bolts.map((b) => (
            <ValueRow
              key={b.index}
              label={`Barra ${b.index + 1} (x=${b.x.toFixed(0)}, y=${b.y.toFixed(0)})`}
              value={b.inTension && b.Ft > 0 ? `Ft=${b.Ft.toFixed(1)} kN` : 'N/A (comprimida)'}
            />
          ))}
        </CollapsibleGroup>
      )}
    </div>
  );
}
