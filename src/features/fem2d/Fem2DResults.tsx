// FEM 2D — results panel (T10).
//
// Recomputes live (synchronous solve, D4) — no "Calcular" button. Shows:
//   • global verdict card (worst member η + αcr global-stability row)
//   • per-member verdicts grouped by role, each expandable to its check rows
//   • solve / validation failures as their own blocks (never a "plausible but
//     wrong" verdict on a degenerate model).
//
// Reuses the shared check display system (CheckRowItem / VerdictBadge /
// ambientStyle): MemberCheck is mapped onto CheckRow so a bar's checks render
// exactly like every other module's.

import { useState, type JSX } from 'react';
import { ChevronRight, Maximize2, TriangleAlert } from 'lucide-react';
import { CheckRowItem, VerdictBadge, GroupHeader, ambientStyle } from '../../components/checks';
import { memberStatusToCheck, toCheckRow } from './checkMapping';
import type { Fem2DAnalysisResult } from './pipeline';
import type { MemberVerdict2D } from './checks';
import type { Selected2D } from './modelOps';
import type { Fem2DModel, MemberRole } from './types';

interface Props {
  model: Fem2DModel | null;
  result: Fem2DAnalysisResult | null;
  validationErrors: string[];
  /** Editor wiring (optional): clicking a member row SELECTS that bar on the
   *  canvas/inspector (1D ModelSummary pattern); the selected row highlights. */
  selected?: Selected2D;
  onSelectMember?: (memberId: string) => void;
  /** Abre la ficha de cálculo grande de la barra (modal Fem2DMemberDetail). */
  onOpenDetail?: (memberId: string) => void;
}

const ROLE_ORDER: MemberRole[] = ['pilar', 'viga', 'cordon', 'diagonal', 'montante'];
const ROLE_LABEL: Record<MemberRole, string> = {
  pilar: 'Pilares',
  viga: 'Vigas / dinteles',
  cordon: 'Cordones',
  diagonal: 'Diagonales',
  montante: 'Montantes',
};

export function MemberRow({
  verdict, isSelected, onSelect, onOpenDetail,
}: {
  verdict: MemberVerdict2D;
  isSelected?: boolean;
  onSelect?: (memberId: string) => void;
  onOpenDetail?: (memberId: string) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const cs = memberStatusToCheck(verdict.status);
  const pct = verdict.status === 'pending'
    ? '—'
    : verdict.eta <= 1 ? `${(verdict.eta * 100).toFixed(0)}%` : 'INCUMPLE';
  const pctColor = cs === 'ok' ? 'text-state-ok' : cs === 'warn' ? 'text-state-warn' : cs === 'fail' ? 'text-state-fail' : 'text-state-neutral';
  return (
    <div className="border-b border-border-sub last:border-b-0">
      {/* El icono de ficha vive FUERA del botón principal (button-in-button es
          HTML inválido): fila = flex de dos botones que comparten el hover. */}
      <div className={`flex items-center transition-colors ${isSelected ? 'bg-accent/10' : 'hover:bg-bg-elevated/50'}`}>
        <button
          type="button"
          onClick={() => {
            setOpen((o) => !o);
            onSelect?.(verdict.memberId);
          }}
          aria-expanded={open}
          className="min-w-0 flex-1 flex items-center gap-2 px-4 py-2 text-left max-md:min-h-11"
        >
          <ChevronRight size={13} className={`shrink-0 text-text-disabled transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
          <span className={`font-mono text-[11px] min-w-0 truncate flex-1 ${isSelected ? 'text-accent' : 'text-text-primary'}`}>
            {verdict.memberId}
          </span>
          <span className={`font-mono text-[11px] font-semibold tabular-nums shrink-0 ${pctColor}`}>{pct}</span>
        </button>
        {onOpenDetail && (
          <button
            type="button"
            onClick={() => onOpenDetail(verdict.memberId)}
            title="Ficha de cálculo"
            aria-label={`Ficha de cálculo de ${verdict.memberId}`}
            className="shrink-0 p-2 mr-1 rounded text-text-disabled hover:text-accent transition-colors max-md:min-h-11"
          >
            <Maximize2 size={12} aria-hidden="true" />
          </button>
        )}
      </div>
      {open && (
        <div className="pb-1">
          {verdict.checks.map((c) => (
            <CheckRowItem key={c.id} check={toCheckRow(c, verdict.status)} compact />
          ))}
        </div>
      )}
    </div>
  );
}

export function Fem2DResults({ model, result, validationErrors, selected, onSelectMember, onOpenDetail }: Props): JSX.Element {
  // Invalid params — the model wasn't built; point back to the input banner.
  if (validationErrors.length > 0 || !model) {
    return (
      <div className="flex flex-col px-4 py-4 gap-2">
        <div className="rounded border border-state-fail/40 bg-state-fail/5 px-3 py-2.5">
          <p className="text-[12px] text-state-fail leading-relaxed">
            <span className="font-semibold">Datos no válidos.</span> Corrige los parámetros marcados en el panel de la izquierda.
          </p>
        </div>
      </div>
    );
  }

  // Solve failed on a valid-looking model (singular matrix / mechanism, …).
  if (result && !result.ok) {
    const fails = result.errors.filter((e) => e.severity === 'fail');
    return (
      <div className="flex flex-col px-4 py-4 gap-2">
        <div className="rounded border border-state-fail/40 bg-state-fail/5 px-3 py-2.5 flex flex-col gap-1.5">
          <p className="text-[12px] text-state-fail font-semibold">No se pudo resolver el modelo</p>
          {fails.map((e, i) => (
            <p key={i} className="text-[11px] text-text-secondary leading-snug">{e.msg}</p>
          ))}
          {fails.length === 0 && (
            <p className="text-[11px] text-text-secondary leading-snug">El solver no devolvió resultados válidos.</p>
          )}
        </div>
      </div>
    );
  }

  const checks = result?.checks;
  if (!checks) {
    return (
      <div className="flex flex-col px-4 py-6">
        <p className="text-[12px] text-text-secondary">Calculando…</p>
      </div>
    );
  }

  const status = memberStatusToCheck(checks.status); // pending → neutral for the shared badge/ambient
  const warnings = result!.errors.filter((e) => e.severity === 'warn');

  // Group members by role, preserving ROLE_ORDER and model order within a role.
  const byRole = new Map<MemberRole, MemberVerdict2D[]>();
  for (const m of model.members) {
    const v = checks.perMember[m.id];
    if (!v) continue;
    const arr = byRole.get(m.role) ?? [];
    arr.push(v);
    byRole.set(m.role, arr);
  }

  const maxPct = checks.status === 'pending'
    ? '—'
    : `${Math.min(checks.maxEta * 100, 999).toFixed(0)}%`;
  const pctColor = status === 'ok' ? 'text-state-ok' : status === 'warn' ? 'text-state-warn' : status === 'fail' ? 'text-state-fail' : 'text-state-neutral';

  return (
    <div className="flex flex-col px-2 py-3 gap-3">
      {/* Global verdict card. */}
      <div className="mx-2 rounded overflow-hidden transition-colors" style={ambientStyle(status)}>
        <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-border-main">
          <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled">
            Utilización máxima
          </span>
          <VerdictBadge status={status} />
        </div>
        <div className="flex items-baseline justify-between px-4 py-3 border-b border-border-sub">
          <span className={`font-mono text-2xl font-semibold tabular-nums ${pctColor}`}>{maxPct}</span>
          <span className="font-mono text-[11px] text-text-disabled tabular-nums">
            {model.members.length} barras · {model.nodes.length} nudos
          </span>
        </div>

        {/* Global rows (αcr sway sensitivity). */}
        {checks.globalChecks.map((c) => (
          <CheckRowItem key={c.id} check={toCheckRow(c, 'ok')} compact />
        ))}
        {checks.amplified && (
          <div className="px-4 py-2 border-t border-border-sub">
            <p className="text-[10px] text-text-disabled leading-snug">
              Efectos de 2º orden: factores de viento/sismo amplificados por sensibilidad al desplome (αcr).
            </p>
          </div>
        )}
      </div>

      {/* Solver warnings (non-fatal). */}
      {warnings.length > 0 && (
        <div className="mx-2 rounded border border-state-warn/30 bg-state-warn/5 px-3 py-2 flex flex-col gap-1">
          {warnings.map((w, i) => (
            <p key={i} className="flex items-start gap-1.5 text-[11px] text-text-secondary leading-snug">
              <TriangleAlert size={11} className="text-state-warn mt-0.5 shrink-0" aria-hidden="true" />
              {w.msg}
            </p>
          ))}
        </div>
      )}

      {/* Per-member verdicts, grouped by role. */}
      <div className="mx-2 rounded border border-border-main overflow-hidden">
        {ROLE_ORDER.filter((r) => byRole.has(r)).map((role) => (
          <div key={role}>
            <GroupHeader label={ROLE_LABEL[role]} />
            {byRole.get(role)!.map((v) => (
              <MemberRow
                key={v.memberId}
                verdict={v}
                isSelected={selected?.kind === 'member' && selected.id === v.memberId}
                onSelect={onSelectMember}
                onOpenDetail={onOpenDetail}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Method disclaimer. */}
      <div className="mx-2 px-2">
        <p className="text-[10px] text-text-disabled leading-snug">
          Análisis lineal de pórtico (rigidez directa, 3 GDL) · combinaciones CTE multi-principal ·
          2º orden simplificado por αcr. Predimensionamiento — no sustituye un cálculo completo.
        </p>
      </div>
    </div>
  );
}
