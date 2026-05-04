// Right results panel — verdict + selected/critical machón details + checks
// + per-floor summary. Colors driven by overall status (ambient gradient).

import type {
  MasonryWallState,
  PlantaResult,
  CriticoResult,
  OverallStatus,
} from '../../lib/calculations/masonryWalls';

interface Props {
  state: MasonryWallState;
  plantasCalc: PlantaResult[];
  critico: CriticoResult | null;
  overall: OverallStatus;
  selectedMachonKey: string | null;
  setSelectedMachonKey: (k: string | null) => void;
}

interface ValueRowProps {
  label: string;
  value: string;
  sub?: string;
}
function ValueRow({ label, value, sub }: ValueRowProps) {
  return (
    <div className="flex items-center justify-between py-1.5 px-4 border-b border-border-sub last:border-b-0">
      <div className="flex flex-col min-w-0">
        <span className="text-[12px] text-text-secondary">{label}</span>
        {sub && <span className="text-[10px] font-mono text-text-disabled">{sub}</span>}
      </div>
      <span className="text-[11px] font-mono text-text-primary tabular-nums whitespace-nowrap">{value}</span>
    </div>
  );
}

interface CheckRowProps {
  desc: string;
  article: string;
  value: string;
  limit?: string;
  eta: number;
  status: 'ok' | 'warn' | 'fail' | 'neutral';
  neutral?: boolean;
}
function CheckRow({ desc, article, value, limit, eta, status, neutral }: CheckRowProps) {
  const colors: Record<CheckRowProps['status'], { fg: string; bg: string }> = {
    ok:      { fg: 'var(--color-state-ok)',      bg: 'rgba(34,197,94,0.10)' },
    warn:    { fg: 'var(--color-state-warn)',    bg: 'rgba(245,158,11,0.10)' },
    fail:    { fg: 'var(--color-state-fail)',    bg: 'rgba(239,68,68,0.10)' },
    neutral: { fg: 'var(--color-state-neutral)', bg: 'rgba(100,116,139,0.10)' },
  };
  const c = colors[status];
  return (
    <div
      className="grid items-center gap-2 py-2 px-4 border-b border-border-sub last:border-b-0"
      style={{ gridTemplateColumns: '1fr auto auto' }}
    >
      <div className="min-w-0 flex flex-col">
        <span className="text-[12px] text-text-primary leading-tight">{desc}</span>
        <span className="font-mono text-[10px] text-text-disabled">{article}</span>
      </div>
      <span className="text-right font-mono text-[11px] text-text-secondary tabular-nums whitespace-nowrap">
        {value}{limit && <span className="text-text-disabled"> / {limit}</span>}
      </span>
      <span
        className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded text-center min-w-[42px]"
        style={{ color: c.fg, background: c.bg }}
      >
        {neutral ? '—' : (isFinite(eta) ? `${(eta * 100).toFixed(0)}%` : '—')}
      </span>
    </div>
  );
}

function VerdictBadge({ status, label }: { status: OverallStatus['v']; label: string }) {
  const colors: Record<OverallStatus['v'], { fg: string; bg: string }> = {
    ok:   { fg: 'var(--color-state-ok)',   bg: 'rgba(34,197,94,0.10)' },
    warn: { fg: 'var(--color-state-warn)', bg: 'rgba(245,158,11,0.10)' },
    fail: { fg: 'var(--color-state-fail)', bg: 'rgba(239,68,68,0.10)' },
  };
  const c = colors[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold px-2 py-0.5 rounded"
      style={{ color: c.fg, background: c.bg, letterSpacing: '0.05em' }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.fg }} />
      {label}
    </span>
  );
}

export function MasonryWallsResults({
  state, plantasCalc, critico, overall,
  selectedMachonKey, setSelectedMachonKey,
}: Props) {
  const overallColor =
    overall.v === 'fail' ? 'var(--color-state-fail)'
      : overall.v === 'warn' ? 'var(--color-state-warn)'
        : 'var(--color-state-ok)';

  const ambientStyle: React.CSSProperties = {
    background: `linear-gradient(180deg, ${
      overall.v === 'fail' ? 'rgba(239,68,68,0.08)'
        : overall.v === 'warn' ? 'rgba(245,158,11,0.08)'
          : 'rgba(34,197,94,0.08)'
    } 0%, transparent 80px)`,
    borderTop: `2px solid ${overallColor}`,
  };

  // Machón seleccionado o crítico
  const machonSel = (() => {
    if (!selectedMachonKey) return null;
    const [piStr, mid] = selectedMachonKey.split('|');
    const pl = plantasCalc[parseInt(piStr, 10)];
    if (!pl) return null;
    const m = pl.machones.find((x) => x.id === mid);
    if (!m) return null;
    return { ...m, planta: pl };
  })();
  const displayMachon = machonSel || critico;
  const isShowingCritical = !machonSel;

  return (
    <div>
      <div style={ambientStyle}>
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase text-text-disabled" style={{ letterSpacing: '0.08em' }}>
            Veredicto edificio
          </span>
          <VerdictBadge status={overall.v} label={overall.label} />
        </div>
        <div className="px-4 pb-3">
          <div className="text-[26px] font-mono font-semibold tabular-nums" style={{ color: overallColor }}>
            {(overall.eta * 100).toFixed(0)}%
          </div>
          <div className="text-[11px] text-text-secondary">
            η máx · <span className="font-mono">{critico?.planta.nombre} / {critico?.id}</span>
          </div>
        </div>
      </div>

      <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-border-sub">
        <p className="text-[10px] font-semibold uppercase text-text-disabled" style={{ letterSpacing: '0.08em' }}>
          {isShowingCritical ? 'Machón crítico' : 'Machón seleccionado'}
        </p>
        {!isShowingCritical && (
          <button
            type="button"
            onClick={() => setSelectedMachonKey(null)}
            className="text-[10px] font-mono text-accent hover:text-accent-hover cursor-pointer"
          >
            ← ver crítico
          </button>
        )}
      </div>

      {displayMachon && (
        <>
          <ValueRow label="Planta"      value={displayMachon.planta.nombre} />
          <ValueRow label="Machón"      value={`${displayMachon.id} · ${displayMachon.ancho.toFixed(0)} mm`} />
          <ValueRow label="N_directo"   sub="por ancho"   value={`${displayMachon.N_lineal.toFixed(1)} kN`} />
          <ValueRow label="N_dinteles"  sub="reacciones"  value={`${displayMachon.N_dinteles.toFixed(1)} kN`} />
          <ValueRow label="N_puntual"   sub="vigas"       value={`${displayMachon.N_puntual.toFixed(1)} kN`} />
          <ValueRow label="N_Ed"        sub="axil cálculo" value={`${displayMachon.N_Ed.toFixed(1)} kN`} />
          <ValueRow label="N_Rd"        sub="resistencia"  value={`${displayMachon.N_Rd.toFixed(1)} kN`} />
          <ValueRow label="σ cabeza"    sub="top"         value={`${displayMachon.sigma_top.toFixed(2)} N/mm²`} />
          <ValueRow label="σ pie"       sub="bottom"      value={`${displayMachon.sigma_bottom.toFixed(2)} N/mm²`} />
          <ValueRow label="Φ"           sub="reductor"    value={displayMachon.Phi.toFixed(3)} />
          <ValueRow label="λ"           sub="esbeltez"    value={displayMachon.planta.lambda.toFixed(1)} />
          <ValueRow label="e_total"     sub="exc. cálc."  value={`${displayMachon.planta.e_total.toFixed(0)} mm`} />
        </>
      )}

      <p className="text-[10px] font-semibold uppercase text-text-disabled pt-3 pb-2 px-4 border-b border-border-sub" style={{ letterSpacing: '0.08em' }}>
        Comprobaciones DB-SE-F
      </p>
      {displayMachon && (
        <>
          <CheckRow
            desc="Compresión excéntrica"
            article="DB-SE-F §5.2"
            value={`${displayMachon.N_Ed.toFixed(0)} kN`}
            limit={`${displayMachon.N_Rd.toFixed(0)} kN`}
            eta={displayMachon.eta}
            status={displayMachon.eta < 0.8 ? 'ok' : displayMachon.eta < 1 ? 'warn' : 'fail'}
          />
          <CheckRow
            desc="Pandeo (esbeltez λ)"
            article="DB-SE-F §5.2.4"
            value={`λ=${displayMachon.planta.lambda.toFixed(1)}`}
            limit="27"
            eta={displayMachon.planta.lambda / 27}
            status={displayMachon.planta.lambda < 22 ? 'ok' : displayMachon.planta.lambda < 27 ? 'warn' : 'fail'}
          />
          {displayMachon.etaConc > 0 ? (
            <CheckRow
              desc="Concentración bajo apoyo"
              article="DB-SE-F §5.4"
              value="σ_loc"
              limit="β·f_d"
              eta={displayMachon.etaConc}
              status={displayMachon.etaConc < 0.8 ? 'ok' : displayMachon.etaConc < 1 ? 'warn' : 'fail'}
            />
          ) : (
            <CheckRow
              desc="Concentración bajo apoyo"
              article="DB-SE-F §5.4"
              value="—"
              eta={0}
              status="neutral"
              neutral
            />
          )}
        </>
      )}

      <p className="text-[10px] font-semibold uppercase text-text-disabled pt-3 pb-2 px-4 border-b border-border-sub" style={{ letterSpacing: '0.08em' }}>
        Resumen por planta
      </p>
      {plantasCalc.slice().reverse().map((pl) => {
        const eMax = Math.max(...pl.machones.map((m) => m.etaMax));
        const stCol = eMax >= 1
          ? 'var(--color-state-fail)'
          : eMax >= 0.8 ? 'var(--color-state-warn)' : 'var(--color-state-ok)';
        const isCrit = critico && critico.planta.index === pl.index;
        return (
          <div
            key={pl.id}
            className="grid items-center gap-2 px-4 py-1.5 border-b border-border-sub"
            style={{
              gridTemplateColumns: '1fr auto auto',
              background: isCrit ? 'rgba(56,189,248,0.04)' : 'transparent',
            }}
          >
            <span className="font-mono text-[11px]" style={{ color: isCrit ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}>
              {pl.nombre}
            </span>
            <span className="text-[10px] font-mono text-text-disabled">q<sub>d</sub>={pl.q_planta.toFixed(0)} kN/m</span>
            <span className="font-mono text-[11px] font-semibold tabular-nums" style={{ color: stCol }}>
              {(eMax * 100).toFixed(0)}%
            </span>
          </div>
        );
      })}

      <div className="px-4 py-3 text-[10px] font-mono text-text-disabled leading-relaxed">
        ELU: q<sub>d</sub> = γ<sub>G</sub>·G<sub>k</sub> + γ<sub>Q</sub>·Q<sub>k</sub> · DB-SE §4.2.4<br />
        γ<sub>G</sub>={state.gamma_G} · γ<sub>Q</sub>={state.gamma_Q} · γ<sub>M</sub>={state.gamma_M} · §4.6.7<br />
        Φ = (1−2e/t)·(1−(λ−10)/30)<br />
        k = 1/H_inf / (1/H_inf + 1/H_sup)
      </div>
    </div>
  );
}
