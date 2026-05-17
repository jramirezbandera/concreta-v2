// RC Beam — "Sección simple" view.
//
// 1-section focused layout para el modo 'simple' del módulo rc-beams.
// Layout:
//   ┌─ Header mínimo: % capacidad + verdict badge ────────────────┐
//   │  STRAIN SVG    │   SECTION SVG    │   FORCES SVG            │
//   │  ──────────────────────────────────────────────────────────│
//   │  Narrativa (1 frase auto-interpretativa)                    │
//   │  Checks (ELU flexion / cortante / ELS fisuración)            │
//   └──────────────────────────────────────────────────────────────┘
//
// El motor de fondo es solveSectionAtMoment (Chunk 1), que resuelve la
// sección al Md del usuario con parábola-rectángulo (CE 21.3.3). MRd
// viene de calcRCBeam (capacidad última) para el cálculo de utilización.

import { useMemo } from 'react';
import { type RCBeamInputs } from '../../data/defaults';
import { type RCBeamResult, pickSectionInputs } from '../../lib/calculations/rcBeams';
import { solveSectionAtMoment } from '../../lib/calculations/rcBeamsSection';
import { useContainerWidth } from '../../hooks/useContainerWidth';
import { RCBeamStrainSVG } from './RCBeamStrainSVG';
import { RCBeamForcesSVG } from './RCBeamForcesSVG';
import { RCBeamsSVG } from './RCBeamsSVG';
import { RCBeamsResults } from './RCBeamsResults';
import { buildSectionNarrative } from './rcBeamNarrative';
import { VerdictBadge } from '../../components/checks';

interface RCBeamSimpleViewProps {
  state: RCBeamInputs;
  result: RCBeamResult;
}

const STACK_THRESHOLD = 720; // ancho mínimo para 3-SVG en fila

export function RCBeamSimpleView({ state, result }: RCBeamSimpleViewProps) {
  const [canvasRef, canvasWidth] = useContainerWidth();

  // Resolver sección al Md del usuario (sagging-only V1 → kind='vano').
  const sectionResult = useMemo(() => {
    const secInp = pickSectionInputs(state, 'vano');
    return solveSectionAtMoment(secInp, secInp.Md);
  }, [state]);

  const h = state.h as number;
  const MRd = result.vano?.MRd ?? 0;
  const utilization = MRd > 0 ? (sectionResult.Md / MRd) * 100 : 0;
  // El badge refleja el verdict GLOBAL de la sección: el peor entre la
  // utilización a flexión y todos los checks (cortante, fisuración, armaduras
  // mín/máx, separación de barras…). Si solo mirásemos la flexión, el header
  // diría CUMPLE mientras un check de abajo está en INCUMPLE.
  const flexStatus: 'ok' | 'warn' | 'fail' =
    utilization >= 100 ? 'fail' : utilization >= 80 ? 'warn' : 'ok';
  const checks = result.vano?.checks ?? [];
  const hasFail = flexStatus === 'fail' || checks.some((c) => c.status === 'fail');
  const hasWarn = flexStatus === 'warn' || checks.some((c) => c.status === 'warn');
  const verdictStatus: 'ok' | 'warn' | 'fail' = hasFail ? 'fail' : hasWarn ? 'warn' : 'ok';

  // Tamaño SVG responsive.
  const isStacked = (canvasWidth ?? 0) < STACK_THRESHOLD;
  const CANVAS_PAD = 32;
  const GAP = 12;
  let svgW: number;
  if (isStacked && canvasWidth !== undefined && canvasWidth > 0) {
    svgW = Math.max(220, Math.min(360, canvasWidth - CANVAS_PAD));
  } else if (canvasWidth !== undefined && canvasWidth > 0) {
    svgW = Math.max(180, Math.floor((canvasWidth - CANVAS_PAD - 2 * GAP) / 3));
  } else {
    svgW = 220;
  }
  const svgH = Math.min(360, Math.round(svgW * 1.3));

  return (
    <div className="flex flex-col">
      {/* HEADER mínimo: sólo verdict badge + % capacidad. La info Md/MRd
       *  detallada vive en el panel de resultados de abajo (no duplicar). */}
      <div className="px-6 py-2.5 border-b border-border-main flex items-center justify-end gap-3">
        <span
          className={[
            'text-[11px] font-mono font-semibold',
            verdictStatus === 'fail'
              ? 'text-state-fail'
              : verdictStatus === 'warn'
                ? 'text-state-warn'
                : 'text-state-ok',
          ].join(' ')}
        >
          {utilization.toFixed(0)}% capacidad
        </span>
        <VerdictBadge status={verdictStatus} />
      </div>

      {/* 3-SVG canvas */}
      <div
        ref={canvasRef}
        className={[
          'border-b border-border-main canvas-dot-grid py-4 px-4',
          isStacked ? 'flex flex-col items-center gap-4' : 'flex flex-row items-start justify-center gap-3',
        ].join(' ')}
      >
        <div className="flex flex-col items-center gap-1">
          <span className="text-[10px] text-text-secondary font-mono uppercase tracking-[0.08em]">
            Deformación (ε)
          </span>
          <RCBeamStrainSVG
            sectionResult={sectionResult}
            h={h}
            mode="screen"
            width={svgW}
            height={svgH}
          />
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-[10px] text-text-secondary font-mono uppercase tracking-[0.08em]">
            Sección
          </span>
          <RCBeamsSVG
            inp={state}
            result={result}
            momentSign="positive"
            mode="screen"
            width={svgW}
            height={svgH}
          />
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-[10px] text-text-secondary font-mono uppercase tracking-[0.08em]">
            Fuerzas movilizadas
          </span>
          <RCBeamForcesSVG
            sectionResult={sectionResult}
            h={h}
            fck={state.fck as number}
            mode="screen"
            width={svgW}
            height={svgH}
          />
        </div>
      </div>

      {/* Narrativa auto-interpretativa */}
      <div className="px-6 py-3 border-b border-border-main">
        <p className="text-[13px] text-text-primary leading-relaxed">
          {buildSectionNarrative(sectionResult, MRd)}
        </p>
      </div>

      {/* Checks (flexion + cortante + fisuracion) */}
      <div className="px-6 py-5">
        <RCBeamsResults result={result} activeSection="vano" hideSectionTabs />
      </div>
    </div>
  );
}
