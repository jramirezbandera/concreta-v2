// Tarjeta de propuesta del asistente IA (T2.5 — UI compartida). Es una TARJETA
// inline pensada para vivir dentro de un hilo de chat (no un modal): tabla de
// preview Campo/Actual/Propuesto + bloque "No aplicados" + warnings + notes +
// botón Aplicar en el pie. Extraída por COPIA de
// src/features/steel-beams/AiFillModal.tsx (que conserva sus copias privadas
// hasta la Fase 4 — duplicación temporal deliberada).
import { useState } from 'react';
import { ShieldAlert, TriangleAlert } from 'lucide-react';
import type { AiApplyPlan } from '../../lib/ai/modules/types';

interface ProposalCardProps {
  plan: AiApplyPlan<unknown>;
  applied: boolean;
  /** true si una propuesta posterior ya recoge estos cambios: tarjeta atenuada,
   *  sin botón Aplicar y con nota. `applied` tiene prioridad visual. */
  superseded?: boolean;
  onApply: () => void;
}

// Botón primario — mismo estilo que TitlePromptModal/AiFillModal.
const PRIMARY_BTN =
  'inline-flex items-center gap-1.5 px-4 py-1.5 rounded text-sm text-accent disabled:opacity-40 transition-all';
const PRIMARY_STYLE = {
  border: '1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)',
  background: 'color-mix(in srgb, var(--color-accent) 6%, transparent)',
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
      className={`border border-border-main rounded bg-bg-primary px-3 py-2.5 space-y-2.5${
        isSuperseded ? ' opacity-60' : ''
      }`}
    >
      {changeCount > 0 ? (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border-sub">
              <th className="text-left text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled py-1.5 pr-2">
                Campo
              </th>
              <th className="text-left text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled py-1.5 pr-2">
                Actual
              </th>
              <th className="text-left text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled py-1.5">
                Propuesto
              </th>
            </tr>
          </thead>
          <tbody>
            {plan.changes.map((c) => (
              <tr key={c.field} className="border-b border-border-sub">
                <td className="py-1.5 pr-2 text-[12px] text-text-secondary">{c.label}</td>
                <td className="py-1.5 pr-2 text-[11px] font-mono tabular-nums text-text-disabled">
                  {c.before}
                </td>
                <td className="py-1.5 text-[11px] font-mono tabular-nums text-text-primary">
                  {c.after}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-text-secondary py-1">
          La propuesta no cambia ningún valor del formulario.
        </p>
      )}

      {/* Guardarraíl de seguridad — lo más prominente de la tarjeta, justo bajo
          la tabla. El checkbox solo se ofrece mientras se pueda aplicar. */}
      {!isSuperseded && hasRisks && (
        <RiskBlock risks={plan.risks} ack={ack} onAck={setAck} showAck={!applied} />
      )}

      {/* En tarjetas reemplazadas los bloques secundarios se ocultan (warnings
          y notes viajan fusionados a la tarjeta más reciente): queda solo la
          tabla como registro compacto del turno. */}
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

      {isSuperseded ? (
        <p className="text-[11px] text-text-disabled leading-snug">
          Recogida en la propuesta más reciente
        </p>
      ) : (
        <div className="flex justify-end pt-0.5">
          <button
            type="button"
            onClick={onApply}
            disabled={applied || changeCount === 0 || blockedByRisk}
            className={PRIMARY_BTN}
            style={PRIMARY_STYLE}
          >
            {applied ? 'Aplicado' : `Aplicar ${changeCount} cambio${changeCount === 1 ? '' : 's'}`}
          </button>
        </div>
      )}
    </div>
  );
}
