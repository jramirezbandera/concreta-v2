// FEM 2D — ficha de cálculo por barra (modal grande).
//
// Se abre desde el icono de la fila del panel de resultados (y desde el
// inspector). Muestra todo lo que la fila compacta no puede: datos de partida,
// esfuerzos pésimos con su combinación gobernante, diagramas N/V/M de la barra
// aislada (envolvente ELU — la MISMA que alimenta las comprobaciones) y las
// comprobaciones completas con su combinación pésima por fila, más los valores
// intermedios capturados del motor (MemberDetail2D).
//
// Los números vienen ÍNTEGROS del pase de comprobación (checks.ts): este
// componente NO re-ejecuta motores, así que nunca puede discrepar del panel.
// La flecha δ no lleva tira de diagrama a propósito: la envolvente por muestra
// mezclaría combinaciones (la trampa documentada de deformed.ts) — sus valores
// van en las filas de flecha con su combinación.

import { useEffect, type JSX } from 'react';
import { X } from 'lucide-react';
import { CheckRowItem, GroupHeader, ValueRow, VerdictBadge } from '../../components/checks';
import { useContainerWidth } from '../../hooks/useContainerWidth';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import { diagColorFor, findLocalExtrema, fmtField, signRuns } from './canvasTheme';
import { memberStatusToCheck, toCheckRow } from './checkMapping';
import type { MemberEnvelopes2D, MemberVerdict2D } from './checks';
import type { DisplayGroup2D, Fem2DMember } from './types';

/** Etiqueta del grupo de PRESENTACIÓN (paso 12) — nunca enruta nada. */
const GROUP_SINGULAR: Record<DisplayGroup2D, string> = {
  pilar: 'Pilar',
  viga: 'Viga / dintel',
  cordon: 'Cordón',
  diagonal: 'Diagonal',
  montante: 'Montante',
};

interface Props {
  member: Fem2DMember;
  verdict: MemberVerdict2D;
  envelopes: MemberEnvelopes2D;
  /** Formulación DERIVADA (memberFormulation): true = biela (birrotulada +
   *  sin carga de barra). La calcula el llamante, que tiene el modelo. */
  twoForce: boolean;
  /** True cuando algún combo ELU lleva los factores laterales amplificados por αcr. */
  amplified: boolean;
  onClose: () => void;
}

// ── Tira de diagrama de una barra (recta, horizontal) ───────────────────────

function DiagramStrip({
  title, xs, vals, fmt, width, flip = false,
}: {
  title: string;
  xs: number[];
  vals: number[];
  fmt: (v: number) => string;
  width: number;
  /** true = positivo hacia abajo (momentos del lado de la fibra traccionada). */
  flip?: boolean;
}): JSX.Element | null {
  const H = 88;
  const PAD_X = 14;
  const PAD_Y = 18;
  const n = Math.min(xs.length, vals.length);
  if (n < 2 || width <= 40) return null;
  const maxAbs = vals.reduce((mx, v) => Math.max(mx, Math.abs(v)), 0);
  const x0 = xs[0];
  const span = xs[n - 1] - x0 || 1;
  const sx = (x: number) => PAD_X + ((x - x0) / span) * (width - 2 * PAD_X);
  const amp = H / 2 - PAD_Y;
  const dir = flip ? 1 : -1; // SVG y crece hacia abajo; sin flip, positivo arriba
  const sy = (v: number) => H / 2 + dir * (maxAbs > 0 ? (v / maxAbs) * amp : 0);
  const runs = signRuns(xs.slice(0, n), vals.slice(0, n));
  const labelIdx = findLocalExtrema(vals.slice(0, n), maxAbs, 0.35);
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled pb-1">{title}</p>
      <svg width={width} height={H} role="img" aria-label={title} className="block">
        <line x1={sx(xs[0])} y1={H / 2} x2={sx(xs[n - 1])} y2={H / 2} stroke="var(--color-border-main)" strokeWidth={1} />
        {runs.map((r, k) => {
          const pts = r.pts.map((p) => `${sx(p.x).toFixed(1)},${sy(p.v).toFixed(1)}`).join(' ');
          const first = r.pts[0];
          const last = r.pts[r.pts.length - 1];
          const poly = `${sx(first.x).toFixed(1)},${H / 2} ${pts} ${sx(last.x).toFixed(1)},${H / 2}`;
          const color = diagColorFor(r.sign, false);
          return (
            <g key={k}>
              <polygon points={poly} fill={color} opacity={0.14} />
              <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
            </g>
          );
        })}
        {labelIdx.map((i) => {
          const v = vals[i];
          if (maxAbs === 0 || Math.abs(v) < 1e-9) return null;
          const px = Math.min(Math.max(sx(xs[i]), 26), width - 26);
          const above = sy(v) <= H / 2;
          const py = above ? Math.max(sy(v) - 4, 9) : Math.min(sy(v) + 12, H - 2);
          return (
            <text
              key={i}
              x={px}
              y={py}
              textAnchor="middle"
              fontSize={9}
              className="font-mono"
              fill={diagColorFor(v, false)}
              stroke="var(--color-bg-surface)"
              strokeWidth={3}
              paintOrder="stroke"
            >
              {fmt(v)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

// ── Fila de esfuerzo pésimo (valor + combinación gobernante) ────────────────

function DemandRow({ label, value, combo }: { label: string; value: string; combo: string }): JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.75 px-4 border-b border-border-sub last:border-b-0">
      <div className="flex flex-col min-w-0">
        <span className="text-[12px] text-text-secondary">{label}</span>
        <span className="font-mono text-[10px] text-text-disabled truncate" title={combo}>{combo}</span>
      </div>
      <span className="text-[12px] font-mono text-text-primary tabular-nums shrink-0">{value}</span>
    </div>
  );
}

// ── Modal ───────────────────────────────────────────────────────────────────

export function Fem2DMemberDetail({ member, verdict, envelopes, twoForce, amplified, onClose }: Props): JSX.Element {
  const { system } = useUnitSystem();

  // Escape + scroll lock + devolver el foco al disparador (patrón de los
  // modales existentes — TitlePromptModal / PdfPreviewModal).
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      trigger?.focus?.();
    };
  }, [onClose]);

  const detail = verdict.detail;
  const status = memberStatusToCheck(verdict.status);
  const pct = verdict.status === 'pending' ? '—' : verdict.eta <= 1 ? `${(verdict.eta * 100).toFixed(0)}%` : 'INCUMPLE';
  const pctColor = status === 'ok' ? 'text-state-ok' : status === 'warn' ? 'text-state-warn' : status === 'fail' ? 'text-state-fail' : 'text-state-neutral';

  const [stripRef, stripWidth] = useContainerWidth();
  const eluEnv = envelopes.ELU;
  const strips: { key: string; title: string; xs: number[]; vals: number[]; fmt: (v: number) => string; flip?: boolean }[] = [];
  const pushStrip = (key: string, title: string, xs: number[], vals: number[], fmt: (v: number) => string, flip = false) => {
    const maxAbs = vals.reduce((mx, v) => Math.max(mx, Math.abs(v)), 0);
    if (maxAbs > 1e-6) strips.push({ key, title, xs, vals, fmt, flip });
  };
  if (eluEnv) {
    pushStrip('N', 'Axil N — envolvente ELU', eluEnv.xs, eluEnv.N, (v) => fmtField(v, 'force', system));
    pushStrip('V', 'Cortante V — envolvente ELU', eluEnv.xs, eluEnv.V, (v) => fmtField(v, 'force', system));
    pushStrip('M', 'Momento M — envolvente ELU', eluEnv.xs, eluEnv.M, (v) => fmtField(v, 'moment', system), true);
  }

  const releases = twoForce
    ? 'i y j (biela derivada: birrotulada + sin carga de barra)'
    : member.releases.i && member.releases.j ? 'en i y j'
    : member.releases.i ? 'en i'
    : member.releases.j ? 'en j'
    : 'sin rótulas';

  // Fase 2, paso 11: el gate de LTB va por DEMANDA de datos, no por etiqueta —
  // se muestra donde el dato de correas aplica (acero/madera en viga-columna).
  const showLtb = member.material !== 'rc' && !twoForce;

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-50 flex items-center justify-center px-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Ficha de cálculo de la barra ${member.id}`}
        className="bg-bg-surface rounded-lg shadow-2xl border border-border-main w-[760px] max-w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-border-main shrink-0 min-w-0">
          <span className="font-mono text-[14px] font-semibold text-text-primary shrink-0">{member.id}</span>
          <span className="text-[11.5px] text-text-secondary truncate min-w-0">
            {GROUP_SINGULAR[verdict.group]}
            {twoForce ? ' · biela' : ''}
            {detail ? ` · ${detail.sectionLabel}` : ''}
          </span>
          <div className="flex-1" />
          <span className={`font-mono text-[13px] font-semibold tabular-nums shrink-0 ${pctColor}`}>{pct}</span>
          <VerdictBadge status={status} />
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ficha"
            className="p-1.5 rounded text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors shrink-0"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="scroll-hide flex-1 overflow-y-auto pb-2">
          {/* Datos de partida */}
          <GroupHeader label="Datos de partida" />
          <ValueRow label="Barra" value={`${member.i} → ${member.j}`} />
          {detail && <ValueRow label="Longitud" value={`${detail.L.toFixed(2)} m`} />}
          <ValueRow
            label="Elemento"
            value={twoForce ? 'biela (solo axil, derivada)' : 'viga-columna'}
          />
          {detail && <ValueRow label="Sección" value={detail.sectionLabel} />}
          <ValueRow label="Rótulas" value={releases} />
          {showLtb && (
            <ValueRow
              label="Arriostramiento del ala comprimida (correas)"
              value={member.ltbSpacing !== undefined ? `cada ${member.ltbSpacing.toFixed(2)} m` : 'sin arriostrar (Lcr = L)'}
            />
          )}
          {member.material !== 'rc' && (
            <ValueRow
              label="Arriostramiento del eje débil"
              value={member.weakAxisBracing !== undefined ? `cada ${member.weakAxisBracing.toFixed(2)} m` : 'sin arriostrar (Lcr,z = L)'}
            />
          )}
          {!twoForce && (
            <ValueRow
              label="Límite de flecha"
              value={member.deflLimit === 'none' ? 'no aplica' : `L/${member.deflLimit ?? 300}`}
            />
          )}

          {/* Esfuerzos pésimos */}
          <GroupHeader label="Esfuerzos de cálculo pésimos (ELU)" />
          {detail && detail.demands.length > 0 ? (
            detail.demands.map((d) => <DemandRow key={d.label} label={d.label} value={d.value} combo={d.combo} />)
          ) : (
            <p className="px-4 py-2 text-[11px] text-text-secondary">Sin esfuerzos apreciables.</p>
          )}
          {amplified && (
            <p className="px-4 pt-2 text-[10px] text-text-disabled leading-snug">
              Los esfuerzos ELU incluyen los efectos de 2º orden por sensibilidad al desplome (αcr):
              cargas laterales — reales o nocionales de imperfección (Hφ, §5.3.2) — amplificadas.
            </p>
          )}

          {/* Diagramas de la barra */}
          {strips.length > 0 && (
            <>
              <GroupHeader label="Diagramas de la barra" />
              <div ref={stripRef} className="px-4 pt-3 pb-1 flex flex-col gap-2 min-w-0">
                {strips.map((s) => (
                  <DiagramStrip
                    key={s.key}
                    title={s.title}
                    xs={s.xs}
                    vals={s.vals}
                    fmt={s.fmt}
                    width={Math.max(stripWidth ?? 0, 0)}
                    flip={s.flip}
                  />
                ))}
                <p className="text-[10px] text-text-disabled leading-snug pb-1">
                  Abscisa local de {member.i} a {member.j} · azul = positivo, rojo = negativo
                  {strips.some((s) => s.key === 'M') ? ' · M dibujado del lado de la fibra traccionada' : ''}.
                </p>
              </div>
            </>
          )}

          {/* Comprobaciones */}
          <GroupHeader label="Comprobaciones" />
          {verdict.checks.map((c) => (
            <div key={c.id} className="border-b border-border-sub last:border-b-0 [&_.check-row]:border-b-0">
              <CheckRowItem check={toCheckRow(c, verdict.status)} />
              {c.combo && (
                <p className="px-5 pb-2 text-[10px] font-mono text-text-disabled leading-snug">
                  Combinación pésima: {c.combo}
                </p>
              )}
            </div>
          ))}

          {/* Valores intermedios del motor */}
          {detail && detail.groups.map((g) => (
            <div key={g.title}>
              <GroupHeader label={g.title} />
              {g.rows.map((r) => (
                <ValueRow key={r.label} label={r.label} value={r.value} />
              ))}
            </div>
          ))}

          {/* Nota de método */}
          <p className="px-4 pt-3 text-[10px] text-text-disabled leading-snug">
            Valores del pase de comprobación (mismos números que el panel de resultados).
            Análisis lineal de pórtico · combinaciones CTE multi-principal · 2º orden simplificado por αcr.
            Predimensionamiento — no sustituye un cálculo completo.
          </p>
        </div>
      </div>
    </div>
  );
}
