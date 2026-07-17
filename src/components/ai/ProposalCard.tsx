// Tarjeta de propuesta del asistente IA (T2.5 — UI compartida). Es una TARJETA
// inline pensada para vivir dentro de un hilo de chat (no un modal). El
// rediseño (dirección 4a/5a) sustituye la tabla Campo/Actual/Propuesto por un
// DIFF visual por filas (Actual tachado en rojo → Propuesto en verde), con
// cabecera "PROPUESTA · n cambios" y pie con el botón Aplicar. Se conservan
// intactos el guardarraíl de seguridad con interlock (RiskBlock), el bloque
// colapsable "No aplicados" (SkippedBlock), los warnings, las notes y los
// estados `applied` / `superseded`.
import { useState } from 'react';
import { ArrowRight, ShieldAlert, Sparkles, TriangleAlert } from 'lucide-react';
import type { AiApplyPlan } from '../../lib/ai/modules/types';

interface ProposalCardProps {
  plan: AiApplyPlan<unknown>;
  applied: boolean;
  /** true si una propuesta posterior ya recoge estos cambios: tarjeta atenuada,
   *  sin botón Aplicar y con nota. `applied` tiene prioridad visual. */
  superseded?: boolean;
  onApply: () => void;
}

// Botón primario del pie — mismo lenguaje visual que el resto del asistente.
const PRIMARY_STYLE = {
  border: '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)',
  background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)',
};
// Celdas del diff: Actual (rojo tachado) → Propuesto (verde). Tintes exactos
// del design system vía var()/color-mix (no hardcodear hex — ver dark-palette).
const OLD_CELL: React.CSSProperties = {
  background: 'var(--color-tint-fail)',
  color: 'var(--color-state-fail)',
  border: '1px solid color-mix(in srgb, var(--color-state-fail) 22%, transparent)',
  textDecorationColor: 'color-mix(in srgb, var(--color-state-fail) 55%, transparent)',
};
const NEW_CELL: React.CSSProperties = {
  background: 'var(--color-tint-ok)',
  color: 'var(--color-state-ok)',
  border: '1px solid color-mix(in srgb, var(--color-state-ok) 30%, transparent)',
};

/** Chevron de sección colapsable (mismo dibujo que CollapsibleSection). */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      aria-hidden="true"
      className={`shrink-0 transition-transform duration-150 ${open ? '' : '-rotate-90'}`}
    >
      <path
        d="M2 3.5 L5 6.5 L8 3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Bloque colapsado "No aplicados": skipped (con motivo) + notFound. */
function SkippedBlock({ plan }: { plan: AiApplyPlan<unknown> }) {
  const [open, setOpen] = useState(false);
  const total = plan.skipped.length + plan.notFound.length;
  return (
    <div className="border border-border-main rounded">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled hover:text-text-secondary transition-colors"
      >
        <Chevron open={open} />
        No aplicados
        <span className="ml-auto font-mono normal-case tracking-normal">{total}</span>
      </button>
      {open && (
        <ul className="px-3 pb-2.5 pt-1.5 border-t border-border-sub space-y-1">
          {plan.skipped.map((s, i) => (
            <li key={`s-${i}`} className="text-[11px] leading-snug">
              <span className="text-text-primary">{s.label}</span>
              <span className="text-text-secondary"> — {s.reason}</span>
            </li>
          ))}
          {plan.notFound.map((label, i) => (
            <li key={`n-${i}`} className="text-[11px] leading-snug">
              <span className="text-text-primary">{label}</span>
              <span className="text-text-secondary"> — No encontrado en el enunciado</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Bloque rojo de guardarraíl (plan.risks — ver lib/ai/safety.ts): cambios que
 * REDUCEN la seguridad del cálculo (rebajan una carga o un esfuerzo, relajan un
 * criterio, mejoran un dato del terreno). No se limita a avisar: el checkbox es
 * un INTERLOCK — sin marcarlo el botón Aplicar queda deshabilitado. Un aviso que
 * no frena el clic no evita el fallo que motivó todo esto (aprobar por inercia
 * una propuesta plausible que deja el momento de cálculo a la mitad).
 */
function RiskBlock({
  risks,
  ack,
  onAck,
  showAck,
}: {
  risks: AiApplyPlan<unknown>['risks'];
  ack: boolean;
  onAck: (v: boolean) => void;
  showAck: boolean;
}) {
  const many = risks.length > 1;
  return (
    <div
      className="rounded border border-state-fail/50 px-3 py-2.5 space-y-2"
      style={{ background: 'color-mix(in srgb, var(--color-state-fail) 7%, transparent)' }}
    >
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-state-fail">
        <ShieldAlert size={13} className="shrink-0" aria-hidden="true" />
        {many ? 'Estos cambios reducen la seguridad' : 'Este cambio reduce la seguridad'}
      </p>
      <ul className="space-y-1.5">
        {risks.map((r) => (
          <li key={r.field} className="text-[11px] leading-snug">
            <span className="text-text-primary">{r.label}</span>{' '}
            <span className="font-mono tabular-nums text-text-disabled">{r.before}</span>
            <span className="text-text-disabled" aria-hidden="true">
              {' → '}
            </span>
            <span className="font-mono tabular-nums text-state-fail">{r.after}</span>
            <span className="block text-text-secondary mt-0.5">{r.why}</span>
          </li>
        ))}
      </ul>
      {showAck && (
        <label className="flex items-start gap-2 pt-0.5 text-[11px] text-text-primary leading-snug cursor-pointer">
          <input
            type="checkbox"
            checked={ack}
            onChange={(e) => onAck(e.target.checked)}
            className="mt-[1px] shrink-0"
            style={{ accentColor: 'var(--color-state-fail)' }}
          />
          <span>
            {many
              ? 'He revisado estos cambios y son correctos.'
              : 'He revisado este cambio y es correcto.'}
          </span>
        </label>
      )}
    </div>
  );
}

/**
 * Una fila del diff: label + celda Actual (tachada) → celda Propuesto.
 * Las pistas usan `minmax(0,1fr)` y las celdas `min-w-0` + `truncate` para que
 * un valor largo (p. ej. resúmenes del módulo FEM "2 vanos: 5 m") se recorte con
 * elipsis DENTRO de su celda en vez de desbordar la tarjeta; el valor completo
 * queda en el `title` (hover) y en la lectura por texto (los tests lo ven).
 */
function DiffRow({ label, before, after }: { label: string; before: string; after: string }) {
  return (
    <div className="grid grid-cols-[minmax(52px,68px)_minmax(0,1fr)] gap-2 items-center">
      <span className="text-[11.5px] text-text-secondary leading-tight">{label}</span>
      <div className="grid grid-cols-[minmax(0,1fr)_16px_minmax(0,1fr)] items-center gap-1">
        <span
          title={before}
          className="block min-w-0 h-7 leading-7 rounded px-1.5 font-mono text-[12px] tabular-nums line-through truncate"
          style={OLD_CELL}
        >
          {before}
        </span>
        <ArrowRight
          size={12}
          className="text-text-disabled justify-self-center shrink-0"
          aria-hidden="true"
        />
        <span
          title={after}
          className="block min-w-0 h-7 leading-7 rounded px-1.5 font-mono text-[12px] tabular-nums font-medium truncate"
          style={NEW_CELL}
        >
          {after}
        </span>
      </div>
    </div>
  );
}

/**
 * Tarjeta inline con la propuesta de datos de un turno del asistente.
 * El padre aplica el plan en onApply y marca `applied` (la tarjeta pasa a
 * "Aplicado" y la conversación sigue — nunca cierra nada). Con `superseded`
 * la tarjeta queda atenuada y sin botón: sus cambios ya viajan fusionados en
 * la propuesta más reciente del hilo.
 */
export function ProposalCard({ plan, applied, superseded = false, onApply }: ProposalCardProps) {
  const changeCount = plan.changes.length;
  // `applied` manda: una tarjeta aplicada nunca se pinta como reemplazada
  // (defensivo — el modal no marca superseded lo ya aplicado).
  const isSuperseded = superseded && !applied;

  // Interlock del guardarraíl: con riesgos, Aplicar exige confirmación expresa.
  // El estado es LOCAL a la tarjeta: una propuesta nueva (tarjeta nueva) vuelve
  // a exigirla, y una reemplazada arrastra sus riesgos a la tarjeta viva.
  const [ack, setAck] = useState(false);
  const hasRisks = plan.risks.length > 0;
  const blockedByRisk = hasRisks && !ack;

  return (
    <div
      className={`border border-border-main rounded-md bg-bg-primary overflow-hidden${
        isSuperseded ? ' opacity-60' : ''
      }`}
    >
      {/* Cabecera de la tarjeta */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-sub">
        <Sparkles size={12} className="text-accent shrink-0" aria-hidden="true" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-secondary">
          Propuesta
        </span>
        <span className="ml-auto font-mono text-[10.5px] text-text-disabled">
          {changeCount} cambio{changeCount === 1 ? '' : 's'}
        </span>
      </div>

      {/* Cuerpo: diff por filas o mensaje de "sin cambios" */}
      <div className="px-3 py-3 space-y-2.5">
        {changeCount > 0 ? (
          <div className="space-y-2.5">
            {plan.changes.map((c) => (
              <DiffRow key={c.field} label={c.label} before={c.before} after={c.after} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-secondary py-1">
            La propuesta no cambia ningún valor del formulario.
          </p>
        )}

        {/* Guardarraíl de seguridad — lo más prominente, justo bajo el diff.
            El checkbox solo se ofrece mientras se pueda aplicar. */}
        {!isSuperseded && hasRisks && (
          <RiskBlock risks={plan.risks} ack={ack} onAck={setAck} showAck={!applied} />
        )}

        {/* En tarjetas reemplazadas los bloques secundarios se ocultan (warnings
            y notes viajan fusionados a la tarjeta más reciente): queda solo el
            diff como registro compacto del turno. */}
        {!isSuperseded && plan.skipped.length + plan.notFound.length > 0 && (
          <SkippedBlock plan={plan} />
        )}

        {!isSuperseded && plan.warnings.length > 0 && (
          <ul className="space-y-1">
            {plan.warnings.map((w, i) => (
              <li
                key={i}
                className="flex items-start gap-1.5 text-[11px] text-state-warn leading-snug"
              >
                <TriangleAlert size={12} className="shrink-0 mt-0.5" aria-hidden="true" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        )}

        {!isSuperseded && plan.notes && (
          <p className="text-[11px] text-text-secondary leading-snug">{plan.notes}</p>
        )}

        {isSuperseded && (
          <p className="text-[11px] text-text-disabled leading-snug">
            Recogida en la propuesta más reciente
          </p>
        )}
      </div>

      {/* Pie con la acción principal (oculto en tarjetas reemplazadas). */}
      {!isSuperseded && (
        <div className="flex px-3 py-2.5 border-t border-border-sub bg-bg-surface">
          <button
            type="button"
            onClick={onApply}
            disabled={applied || changeCount === 0 || blockedByRisk}
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 rounded text-[13px] font-medium text-accent disabled:opacity-40 transition-all"
            style={PRIMARY_STYLE}
          >
            {applied ? 'Aplicado' : `Aplicar ${changeCount} cambio${changeCount === 1 ? '' : 's'}`}
          </button>
        </div>
      )}
    </div>
  );
}
