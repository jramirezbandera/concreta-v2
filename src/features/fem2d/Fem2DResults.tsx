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

import type { JSX } from 'react';
import { TriangleAlert } from 'lucide-react';
import { CheckRowItem, GroupHeader } from '../../components/checks';
import { MemberRow, type MemberRowData } from '../../components/checks/MemberRow';
import { UtilizationCard } from '../../components/checks/UtilizationCard';
import { ErrorAmbient } from '../../components/ui/ErrorAmbient';
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

/** MemberVerdict2D → la forma mínima que entiende la fila compartida. */
const toRowData = (v: MemberVerdict2D): MemberRowData => ({
  id: v.memberId,
  status: memberStatusToCheck(v.status),
  eta: v.eta,
  checks: v.checks.map((c) => toCheckRow(c, v.status)),
});

export function Fem2DResults({ model, result, validationErrors, selected, onSelectMember, onOpenDetail }: Props): JSX.Element {
  // Invalid params — the model wasn't built; point back to the input banner.
  if (validationErrors.length > 0 || !model) {
    return (
      <ErrorAmbient
        title="Datos no válidos"
        message="Corrige los parámetros marcados en el panel de la izquierda."
      />
    );
  }

  // Solve failed on a valid-looking model (singular matrix / mechanism, …).
  if (result && !result.ok) {
    const fails = result.errors.filter((e) => e.severity === 'fail');
    return (
      <ErrorAmbient
        title="No se pudo resolver el modelo"
        message={fails[0]?.msg ?? 'El solver no devolvió resultados válidos.'}
        details={fails.slice(1).map((e) => e.msg)}
        hint="Revisa apoyos y conectividad: un mecanismo no tiene solución estática."
      />
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

  return (
    <div className="flex flex-col px-2 py-3 gap-3">
      {/* Global verdict card. */}
      <UtilizationCard
        status={status}
        eta={checks.status === 'pending' ? null : checks.maxEta}
        meta={`${model.members.length} barras · ${model.nodes.length} nudos`}
      >
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
      </UtilizationCard>

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
                data={toRowData(v)}
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
