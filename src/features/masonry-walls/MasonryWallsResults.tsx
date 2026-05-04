// Right results panel — verdict + selected/critical machón details + checks
// + per-floor summary. Uses the shared check primitives from
// src/components/checks so styling stays consistent across modules.

import {
  ambientStyle,
  CheckRowItem,
  STATUS_COLORS,
  ValueRow,
  VerdictBadge,
} from '../../components/checks';
import { toStatus, type CheckRow, type CheckStatus } from '../../lib/calculations/types';
import type {
  CriticoResult,
  EdificioInvalid,
  MasonryWallState,
  OverallStatus,
  PlantaResult,
} from '../../lib/calculations/masonryWalls';

interface Props {
  state: MasonryWallState;
  plantasCalc: PlantaResult[];
  critico: CriticoResult | null;
  overall: OverallStatus;
  invalid: EdificioInvalid | null;
  selectedMachonKey: string | null;
  setSelectedMachonKey: (k: string | null) => void;
}

export function MasonryWallsResults({
  state, plantasCalc, critico, overall, invalid,
  selectedMachonKey, setSelectedMachonKey,
}: Props) {
  // Banner de invalidación: cuando la combinación de fábrica es inviable o la
  // geometría es degenerada, lo mostramos ANTES de números para que el usuario
  // sepa que los resultados no son fiables.
  if (invalid) {
    return (
      <div>
        <div style={ambientStyle('fail')}>
          <div className="px-4 pt-4 pb-2 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase text-text-disabled" style={{ letterSpacing: '0.08em' }}>
              Veredicto edificio
            </span>
            <VerdictBadge status="fail" />
          </div>
          <div className="px-4 pb-3">
            <div className="text-[15px] font-semibold text-state-fail">Datos no válidos</div>
            <div className="text-[12px] text-text-secondary mt-1 leading-snug">{invalid.reason}</div>
          </div>
        </div>
        <div className="px-4 py-3 text-[11px] text-text-disabled leading-relaxed border-t border-border-sub">
          Corrige los datos en el panel izquierdo para ver las comprobaciones DB-SE-F.
        </div>
      </div>
    );
  }

  const overallColors = STATUS_COLORS[overall.v as CheckStatus];

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

  // Construir checks como CheckRow[] para el shared CheckRowItem.
  const checks: CheckRow[] = displayMachon ? [
    {
      id: 'compresion-excentrica',
      description: 'Compresión excéntrica',
      article: 'DB-SE-F §5.2',
      value: `${displayMachon.N_Ed.toFixed(0)} kN`,
      limit: `${displayMachon.N_Rd.toFixed(0)} kN`,
      utilization: displayMachon.eta,
      status: toStatus(displayMachon.eta),
    },
    {
      id: 'pandeo',
      description: 'Pandeo (esbeltez λ)',
      article: 'DB-SE-F §5.2.4',
      value: `λ=${displayMachon.planta.lambda.toFixed(1)}`,
      limit: '27',
      utilization: displayMachon.planta.lambda / 27,
      status: displayMachon.planta.lambda < 22
        ? 'ok'
        : displayMachon.planta.lambda < 27 ? 'warn' : 'fail',
    },
    displayMachon.etaConc > 0
      ? {
          id: 'concentracion',
          description: 'Concentración bajo apoyo',
          article: 'DB-SE-F §5.4',
          value: 'σ_loc',
          limit: 'β·f_d',
          utilization: displayMachon.etaConc,
          status: toStatus(displayMachon.etaConc),
        }
      : {
          id: 'concentracion',
          description: 'Concentración bajo apoyo',
          article: 'DB-SE-F §5.4',
          valueStr: '—',
          utilization: 0,
          status: 'neutral',
          neutral: true,
        },
  ] : [];

  return (
    <div>
      <div style={ambientStyle(overall.v as CheckStatus)}>
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase text-text-disabled" style={{ letterSpacing: '0.08em' }}>
            Veredicto edificio
          </span>
          <VerdictBadge status={overall.v as CheckStatus} />
        </div>
        <div className="px-4 pb-3">
          <div className="text-[26px] font-mono font-semibold tabular-nums" style={{ color: overallColors.fg }}>
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
          <ValueRow label="Planta"                         value={displayMachon.planta.nombre} />
          <ValueRow label="Machón"                         value={`${displayMachon.id} · ${displayMachon.ancho.toFixed(0)} mm`} />
          <ValueRow label="N_directo · por ancho"          value={`${displayMachon.N_lineal.toFixed(1)} kN`} />
          <ValueRow label="N_dinteles · reacciones"        value={`${displayMachon.N_dinteles.toFixed(1)} kN`} />
          <ValueRow label="N_puntual · vigas"              value={`${displayMachon.N_puntual.toFixed(1)} kN`} />
          <ValueRow label="N_Ed cabeza · axil cálculo"     value={`${displayMachon.N_Ed.toFixed(1)} kN`} />
          <ValueRow label="N_Ed pie · cabeza+ pp muro"     value={`${displayMachon.N_Ed_pie.toFixed(1)} kN`} />
          <ValueRow label="N_Rd · resistencia"             value={`${displayMachon.N_Rd.toFixed(1)} kN`} />
          <ValueRow label="σ cabeza"                       value={`${displayMachon.sigma_top.toFixed(2)} N/mm²`} />
          <ValueRow label="σ pie"                          value={`${displayMachon.sigma_bottom.toFixed(2)} N/mm²`} />
          <ValueRow label="Φ · reductor"                   value={displayMachon.Phi.toFixed(3)} />
          <ValueRow label="λ · esbeltez"                   value={displayMachon.planta.lambda.toFixed(1)} />
          <ValueRow label="e_total · exc. cálc."           value={`${displayMachon.planta.e_total.toFixed(0)} mm`} />
        </>
      )}

      <p className="text-[10px] font-semibold uppercase text-text-disabled pt-3 pb-2 px-4 border-b border-border-sub" style={{ letterSpacing: '0.08em' }}>
        Comprobaciones DB-SE-F
      </p>
      {checks.map((c) => <CheckRowItem key={c.id} check={c} compact />)}

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
        Φ = Φ_m·Φ_λ — comprobación en cabeza y pie del machón<br />
        k = 1/H_inf / (1/H_inf + 1/H_sup)
      </div>
    </div>
  );
}
