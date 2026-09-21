import { useState, useId, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { AnchorPlateResult } from '../../lib/calculations/anchorPlate';
import {
  CheckRowItem,
  GroupHeader,
  ValueRow,
  VerdictBadge,
  ambientStyle,
} from '../../components/checks';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import { formatQuantity } from '../../lib/units/format';
import type { Quantity } from '../../lib/units/types';

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

// M11 (Phase 3) — solver mode labels en español, mostrados al usuario.
// Los strings internos ('biaxial-plastic', 'partial-lift-saturated', ...)
// son identificadores técnicos; el usuario merece una descripción.
const SOLVER_MODE_LABEL: Record<string, string> = {
  'uniform-compression':    'Compresión uniforme',
  'partial-lift':           'Tracción parcial (plástico)',
  'partial-lift-saturated': 'Tracción parcial — sección agotada',
  'biaxial-plastic':        'Biaxial plástico',
  'biaxial-grid':           'Biaxial aproximado (grid-search)',
  'pure-tension':           'Tracción pura (sin compresión)',
};

// H11 — short labels for the verdict pill so users see WHICH check governs
// without having to scan the full list. Keep short enough to fit inline.
const CHECK_SHORT_LABEL: Record<string, string> = {
  'plate-compression': 'compresión placa',
  'plate-bending':     'flexión placa',
  'bolt-tension':      'tracción barra',
  'bolt-shear':        'cortante barra',
  'bolt-interaction':  'interacción N+V',
  'anchorage-length':  'longitud anclaje',
  'concrete-cone':     'cono hormigón',
  'pullout':           'pull-out',
  'splitting':         'splitting',
  'stiffener':         'rigidizador',
  // Los seis que el panel no pintaba: sin entrada aquí la cabecera enseñaba el
  // id interno en crudo («util. máx. 321% · concrete-interaction») en una
  // interfaz en castellano.
  'plate-tension-tstub':    'tracción placa (T-stub)',
  'concrete-edge-breakout': 'rotura de borde',
  'concrete-pryout':        'pry-out',
  'concrete-breakout-v':    'breakout cortante',
  'concrete-interaction':   'interacción N+V hormigón',
  'solver-equilibrium':     'equilibrio del nudo',
};

export function AnchorPlateResults({ result }: Props) {
  const { system } = useUnitSystem();
  const fmtSi = (v: number, q: Quantity) => formatQuantity(v, q, system);
  // M10 (Phase 4) — empty state alineado con steel-columns: pill SIN DATOS +
  // tarjeta de explicación en lugar de una línea italic que el usuario puede
  // confundir con "sin tracción".
  if (!result.valid) {
    return (
      <div className="flex flex-col">
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-border-main">
          <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled">
            Resultados calculados
          </span>
          <span
            className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold px-1.25 py-0.5 rounded tracking-[0.02em] bg-state-neutral/10 text-state-neutral"
            role="status"
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'currentColor' }} aria-hidden="true" />
            SIN DATOS
          </span>
        </div>
        <div className="flex items-start gap-3 rounded border border-border-main bg-bg-elevated/40 px-3 py-3">
          <AlertTriangle size={16} className="text-text-secondary mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-[12px] text-text-primary font-semibold mb-0.5">
              Sin solicitación
            </p>
            <p className="text-[11px] text-text-secondary">
              Introduce un esfuerzo en el panel izquierdo (NEd, Mx, My o VEd) para activar el cálculo.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const { checks, solver, worstUtil, overallStatus, warnings, noSolution } = result;

  // H11 — identify the governing check (the one whose util equals worstUtil),
  // restricted to checks that are actually applicable ('neutral' = no aplica).
  // Ties broken by first occurrence, which matches the calc/order.
  const governingCheck = checks
    .filter((c) => c.status !== 'neutral' && isFinite(c.utilization))
    .reduce<typeof checks[number] | null>(
      (best, c) => (best === null || c.utilization > best.utilization ? c : best),
      null,
    );
  const governingLabel = governingCheck
    ? CHECK_SHORT_LABEL[governingCheck.id] ?? governingCheck.id
    : null;

  // D1 — group checks into sub-bands (design review finding).
  //
  // El reparto era una lista blanca de ids: las comprobaciones que no caían en
  // ninguna de las cuatro listas desaparecían de la tabla, pero seguían
  // contando para `worstUtil` y las seguía pintando el PDF. Con los valores por
  // defecto la cabecera decía «INCUMPLE · util. máx. 321% · concrete-inter-
  // action» y ningún renglón pasaba del 99%: el proyectista no podía saber qué
  // tocar. Se caían seis ids —plate-tension-tstub, concrete-edge-breakout,
  // concrete-pryout, concrete-breakout-v, concrete-interaction y
  // solver-equilibrium—. Es el mismo fallo que documenta
  // `src/test/features/checksVisible.dom.test.tsx` para empresillado,
  // rc-columns y retaining-wall; este panel no estaba enrolado en ese test y
  // ahora sí. Patrón `placed`/`unplaced` de RCColumnsResults.
  const plateChecks  = checks.filter((c) => ['plate-compression', 'plate-bending', 'plate-tension-tstub'].includes(c.id));
  const boltChecks   = checks.filter((c) => ['bolt-tension', 'bolt-shear', 'bolt-interaction'].includes(c.id));
  const anchorChecks = checks.filter((c) => [
    'anchorage-length', 'concrete-cone', 'pullout', 'splitting',
    'concrete-edge-breakout', 'concrete-pryout', 'concrete-breakout-v', 'concrete-interaction',
  ].includes(c.id));
  const stiffChecks  = checks.filter((c) => c.id === 'stiffener');

  // Red de seguridad: lo que el motor añada y este panel no coloque, se pinta
  // igual al final. El veredicto se calcula sobre TODAS las filas, así que
  // ninguna puede quedarse fuera de la pantalla sin más.
  const placed = new Set([
    ...plateChecks.map((c) => c.id), ...boltChecks.map((c) => c.id),
    ...anchorChecks.map((c) => c.id), ...stiffChecks.map((c) => c.id),
  ]);
  const unplaced = checks.filter((c) => !placed.has(c.id));

  const tensionedBolts = solver.bolts.filter((b) => b.inTension && b.Ft > 0);

  return (
    <div className="rounded border border-border-main overflow-hidden" style={ambientStyle(overallStatus)}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-sub">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled">Resultados calculados</span>
          {/* D4 — sin solución física: pill propio (patrón steel-columns), no un
              INCUMPLE al 100% que infraestima la demanda real. */}
          {noSolution ? (
            <span
              className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold px-1.25 py-0.5 rounded tracking-[0.02em] bg-state-fail/10 text-state-fail"
              role="status"
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'currentColor' }} aria-hidden="true" />
              SIN SOLUCIÓN
            </span>
          ) : (
            <VerdictBadge status={overallStatus} />
          )}
          {/* D2 — gating alineado con el PDF: cualquier no-convergencia sin
              saturación es APROX (antes solo el modo biaxial-grid lo mostraba). */}
          {!solver.converged && !noSolution && (
            <span
              className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider bg-state-warn/15 text-state-warn border border-state-warn/40"
              title={solver.note}
            >
              {solver.mode === 'biaxial-grid' ? 'APROX · grid' : 'APROX'}
            </span>
          )}
        </div>
        <span className="font-mono text-[11px] text-text-secondary tabular-nums">
          util. máx. {isFinite(worstUtil) ? `${(worstUtil * 100).toFixed(0)}%` : '∞'}
          {governingLabel && (
            <span className="ml-1 text-text-disabled normal-case"> · {governingLabel}</span>
          )}
        </span>
      </div>

      {/* D4 — explicación del estado sin solución, encima de los checks */}
      {noSolution && (
        <div className="flex items-start gap-3 px-4 py-3 bg-state-fail/5 border-b border-state-fail/30">
          <AlertTriangle size={16} className="text-state-fail mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-[12px] text-state-fail font-semibold mb-0.5">Sin equilibrio físico</p>
            <p className="text-[11px] text-text-secondary">
              {solver.note}. El nudo no puede equilibrar esta solicitación: las
              utilizaciones mostradas infraestiman la demanda real. Aumenta la
              placa, el número/diámetro de barras o la resistencia del hormigón.
              El export PDF está deshabilitado en este estado.
            </p>
          </div>
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

      {/* Cualquier comprobación futura no colocada arriba: nunca invisible. */}
      {unplaced.length > 0 && <GroupHeader label="Otras comprobaciones" />}
      {unplaced.map((c) => <CheckRowItem key={c.id} check={c} />)}

      {/* Solver summary values */}
      <GroupHeader label="Estado del nudo" />
      <ValueRow label="Modo"              value={SOLVER_MODE_LABEL[solver.mode] ?? solver.mode} />
      <ValueRow label="Nc (compresión)"   value={fmtSi(solver.Nc, 'force')} />
      <ValueRow label="Ft total (grupo)"  value={fmtSi(solver.Ft_total, 'force')} />
      <ValueRow label="Barras traccionadas" value={`${solver.n_t} de ${solver.bolts.length}`} />

      {/* Per-bar tension sub-panel, only if any tensile bar (D6 — collapsed by default) */}
      {tensionedBolts.length > 0 && (
        <CollapsibleGroup label={`Tracción por barra (${tensionedBolts.length}/${solver.bolts.length})`} defaultOpen={false}>
          {solver.bolts.map((b) => (
            <ValueRow
              key={b.index}
              label={`Barra ${b.index + 1} (x=${b.x.toFixed(0)}, y=${b.y.toFixed(0)})`}
              value={b.inTension && b.Ft > 0 ? `Ft=${fmtSi(b.Ft, 'force')}` : 'N/A (comprimida)'}
            />
          ))}
        </CollapsibleGroup>
      )}
    </div>
  );
}
