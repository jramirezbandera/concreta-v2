// Steel Beams — esquema de carga + diagramas M / V / δ.
//
// columns=2 (escritorio/PDF): rejilla 2×2 — izquierda [carga mayorada, M],
// derecha [V, δ]. columns=1 (móvil): las 4 celdas apiladas.
//
// M y V se dibujan con la combinación ELU (wEd); la flecha con la de
// servicio (wSer → Mser → δmax) y su límite L/n como línea discontinua a
// escala real, de modo que se vea el margen frente al admisible.
//
// mode='screen': tokens CSS var() (tema oscuro)
// mode='pdf':    literales (rasterizado byte-estable)

import { type FC } from 'react';
import { type BeamType } from '../../data/defaults';
import { WARN_UTIL } from '../../lib/calculations/types';
import {
  FF_MONO, FS_PEAK, FS_AXIS, FS_ADM, FS_FF_SAG, DOT_R,
  peakColor, axisColor, admColor,
} from './diagramStyle';
import { beamPeakGeometry, type LabelPos } from './beamPeakGeometry';
import { formatQuantity } from '../../lib/units/format';
import { useUnitSystem } from '../../lib/units/useUnitSystem';

interface SteelBeamsDiagramsProps {
  beamType: BeamType;
  wEd: number;       // kN/m — carga total mayorada (ELU) del esquema
  MEd: number;       // kNm — M peak label
  VEdA: number;      // kN  — shear at left end (governing shear for all types)
  VEdB: number;      // kN  — shear at right end (= VEdA for ss/ff/cantilever; 3wL/8 for fp)
  L: number;         // mm
  deltaMax: number;  // mm — computed δmax (ELS)
  deltaAdm: number;  // mm — L/n limit
  deflLimit: number; // n in L/n admissible limit
  mode: 'screen' | 'pdf';
  width: number;
  height: number;
  /** 2 = carga+M | V+δ lado a lado (escritorio/PDF); 1 = columna única (móvil) */
  columns?: 1 | 2;
}

interface CellRect { x: number; y: number; w: number; h: number; }

export const SteelBeamsDiagrams: FC<SteelBeamsDiagramsProps> = ({
  beamType, wEd, MEd, VEdA, VEdB, L, deltaMax, deltaAdm, deflLimit,
  mode, width, height, columns = 2,
}) => {
  const { system } = useUnitSystem();
  // Invariant: VEdA > 0 guarantees safe VEdB/VEdA division in the fp shear-shape
  // computation below. Callers pass VEdA=0 only when the calc failed upstream.
  if (MEd <= 0 || VEdA <= 0) return null;

  const isPdf = mode === 'pdf';

  // ── Rejilla de celdas ─────────────────────────────────────────────────────
  const colGap = 20;
  const rowGap = 12;
  const cells: Record<'load' | 'm' | 'v' | 'd', CellRect> = (() => {
    if (columns === 1) {
      const cellH = (height - 3 * rowGap) / 4;
      const at = (i: number): CellRect => ({ x: 0, y: i * (cellH + rowGap), w: width, h: cellH });
      return { load: at(0), m: at(1), v: at(2), d: at(3) };
    }
    const cellW = (width - colGap) / 2;
    const cellH = (height - rowGap) / 2;
    return {
      load: { x: 0,             y: 0,             w: cellW, h: cellH },
      m:    { x: 0,             y: cellH + rowGap, w: cellW, h: cellH },
      v:    { x: cellW + colGap, y: 0,             w: cellW, h: cellH },
      d:    { x: cellW + colGap, y: cellH + rowGap, w: cellW, h: cellH },
    };
  })();

  const padX = 20;
  const labelH = 14;
  const chartTopOff = labelH + 4;
  const chartBot = 16;
  const N = 40;

  // ── Colors ───────────────────────────────────────────────────────────────
  const qFill      = isPdf ? 'rgba(56,189,248,0.12)' : 'color-mix(in srgb, var(--color-accent) 15%, transparent)';
  const qStroke    = isPdf ? '#336699'               : 'var(--color-accent)';
  const beamStroke = isPdf ? '#333333'               : 'var(--color-chart-section)';
  const mFill      = isPdf ? 'rgba(56,189,248,0.12)' : 'color-mix(in srgb, var(--color-accent) 20%, transparent)';
  const mStroke    = isPdf ? '#336699'               : 'var(--color-accent)';
  const vPosFill   = isPdf ? 'rgba(34,197,94,0.12)'  : 'color-mix(in srgb, var(--color-state-ok) 20%, transparent)';
  const vPosStroke = isPdf ? '#336633'               : 'var(--color-state-ok)';
  const vNegFill   = isPdf ? 'rgba(239,68,68,0.12)'  : 'color-mix(in srgb, var(--color-state-fail) 20%, transparent)';
  const vNegStroke = isPdf ? '#663333'               : 'var(--color-state-fail)';

  const dStatus = deltaMax > deltaAdm ? 'fail' : deltaMax / deltaAdm >= WARN_UTIL ? 'warn' : 'ok';
  const dFill = dStatus === 'fail'
    ? (isPdf ? 'rgba(239,68,68,0.12)'  : 'color-mix(in srgb, var(--color-state-fail) 20%, transparent)')
    : dStatus === 'warn'
    ? (isPdf ? 'rgba(245,158,11,0.12)' : 'color-mix(in srgb, var(--color-state-warn) 20%, transparent)')
    : (isPdf ? 'rgba(34,197,94,0.12)'  : 'color-mix(in srgb, var(--color-state-ok) 20%, transparent)');
  const dStroke = dStatus === 'fail'
    ? (isPdf ? '#663333' : 'var(--color-state-fail)')
    : dStatus === 'warn'
    ? (isPdf ? '#664400' : 'var(--color-state-warn)')
    : (isPdf ? '#336633' : 'var(--color-state-ok)');

  const baseColor  = isPdf ? '#555555' : 'var(--color-chart-dim)';
  const vPosLabelC = isPdf ? '#336633' : 'var(--color-state-ok)';
  const vNegLabelC = isPdf ? '#663333' : 'var(--color-state-fail)';
  // Halo color de fondo bajo las etiquetas (paint-order: stroke): las mantiene
  // legibles cuando una curva o la línea de límite pasa por debajo del texto.
  const haloC      = isPdf ? '#ffffff' : 'var(--color-bg-primary)';
  const C_PEAK = peakColor(isPdf);
  const C_AXIS = axisColor(isPdf);
  const C_ADM  = admColor(isPdf);

  const cellTitle = (cell: CellRect, text: string) => (
    <text x={cell.x + padX} y={cell.y + 11} fontSize={FS_AXIS} fill={C_AXIS}
      style={{ fontFamily: FF_MONO }}>
      {text}
    </text>
  );

  // ── Support symbols (parametrizados por celda) ────────────────────────────
  const triAt = (x: number, by: number) =>
    `M ${x},${by} L ${x - 4},${by + 5} L ${x + 4},${by + 5} Z`;

  const fixedWall = (x: number, by: number, h: number, side: 'left' | 'right') => {
    const wx = side === 'left' ? x - 4 : x;
    const hx0 = side === 'left' ? x - 4 : x + 4;
    const hx1 = side === 'left' ? x : x + 4;
    return (
      <>
        <rect x={wx} y={by - h / 2} width={4} height={h} fill={baseColor} />
        <line x1={hx0} y1={by - h / 2 + h * 0.35} x2={side === 'left' ? hx1 : x} y2={by - h / 2 + h * 0.65}
          stroke={baseColor} strokeWidth={0.75} />
        <line x1={hx0} y1={by - h / 2 + h * 0.65} x2={side === 'left' ? hx1 : x} y2={by - h / 2 + h * 0.95}
          stroke={baseColor} strokeWidth={0.75} />
      </>
    );
  };

  const supportsAt = (x0: number, x1: number, by: number, wallH: number) => {
    switch (beamType) {
      case 'ss':
        return <>
          <path d={triAt(x0, by)} fill={baseColor} />
          <path d={triAt(x1, by)} fill={baseColor} />
        </>;
      case 'cantilever':
        return fixedWall(x0, by, wallH, 'left');
      case 'fp':
        return <>
          {fixedWall(x0, by, wallH, 'left')}
          <path d={triAt(x1, by)} fill={baseColor} />
        </>;
      case 'ff':
        return <>
          {fixedWall(x0, by, wallH, 'left')}
          {fixedWall(x1, by, wallH, 'right')}
        </>;
    }
  };

  // ══ Celda de carga: viga + UDL mayorada + cota de luz ═════════════════════
  const qc = cells.load;
  const qx0 = qc.x + padX;
  const qx1 = qc.x + qc.w - padX;
  const qbw = qx1 - qx0;
  const beamY  = qc.y + qc.h * 0.60;
  const udlH   = Math.min(24, qc.h * 0.22);
  const udlTop = beamY - udlH;
  const dimY   = beamY + 20;

  const udlArrows = Array.from({ length: 9 }, (_, i) => qx0 + (qbw * i) / 8);

  const loadCellEl = (
    <>
      {cellTitle(qc, 'Carga mayorada')}
      {/* Valor centrado sobre el bloque de carga */}
      <text x={(qx0 + qx1) / 2} y={udlTop - 7} fontSize={FS_PEAK} fontWeight={600}
        fill={qStroke} textAnchor="middle" style={{ fontFamily: FF_MONO }}>
        {`wEd = ${formatQuantity(wEd, 'linearLoad', system, { precision: 2 })}`}
      </text>
      {/* Bloque UDL: rect translúcido + borde superior + flechas */}
      <rect x={qx0} y={udlTop} width={qbw} height={udlH} fill={qFill} stroke="none" />
      <line x1={qx0} y1={udlTop} x2={qx1} y2={udlTop} stroke={qStroke} strokeWidth={1} />
      {udlArrows.map((x) => (
        <g key={x}>
          <line x1={x} y1={udlTop} x2={x} y2={beamY - 4.5} stroke={qStroke} strokeWidth={1} />
          <path d={`M ${x - 2.4},${beamY - 5} L ${x + 2.4},${beamY - 5} L ${x},${beamY - 1} Z`}
            fill={qStroke} />
        </g>
      ))}
      {/* Viga + apoyos */}
      <line x1={qx0} y1={beamY} x2={qx1} y2={beamY} stroke={beamStroke} strokeWidth={2.5} />
      {supportsAt(qx0, qx1, beamY, 24)}
      {/* Cota de la luz */}
      <line x1={qx0} y1={dimY} x2={qx1} y2={dimY} stroke={baseColor} strokeWidth={0.75} />
      <line x1={qx0} y1={dimY - 3} x2={qx0} y2={dimY + 3} stroke={baseColor} strokeWidth={0.75} />
      <line x1={qx1} y1={dimY - 3} x2={qx1} y2={dimY + 3} stroke={baseColor} strokeWidth={0.75} />
      <text x={(qx0 + qx1) / 2} y={dimY + 12} fontSize={FS_ADM} fill={C_AXIS}
        textAnchor="middle" style={{ fontFamily: FF_MONO }}>
        L = {(L / 1000).toFixed(2)} m
      </text>
    </>
  );

  // ══ Celda M ═══════════════════════════════════════════════════════════════
  const mc = cells.m;
  const mx0 = mc.x + padX;
  const mx1 = mc.x + mc.w - padX;
  const mbw = mx1 - mx0;

  const mShapeFn: (t: number) => number =
    beamType === 'ss'         ? (t) => 4 * t * (1 - t)          :
    beamType === 'cantilever' ? (t) => -(1 - t)                  :
    beamType === 'fp'         ? (t) => -1 + 5 * t - 4 * t * t   :
    /* ff */                    (t) => -1 + 6 * t - 6 * t * t;

  const rawVals = Array.from({ length: N + 1 }, (_, i) => mShapeFn(i / N));
  const rawMin  = Math.min(...rawVals);
  const rawMax  = Math.max(...rawVals);

  const mAvailH = mc.h - chartTopOff - chartBot;
  const mUnit   = mAvailH / Math.max(rawMax - rawMin, 0.01);
  const mBaseY  = mc.y + chartTopOff + (rawMin < 0 ? -rawMin * mUnit : 0);

  const mRawPts: Array<[number, number]> = rawVals.map((v, i) => [
    mx0 + mbw * (i / N),
    mBaseY + v * mUnit,
  ]);

  const ptsToPolyline = (pts: Array<[number, number]>) =>
    pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

  const ptsToFillPath = (pts: Array<[number, number]>, baseY: number) =>
    `M ${pts[0][0].toFixed(1)},${baseY} ` +
    pts.map(([x, y]) => `L ${x.toFixed(1)},${y.toFixed(1)}`).join(' ') +
    ` L ${pts[pts.length - 1][0].toFixed(1)},${baseY} Z`;

  // Los apoyos viven en el esquema de carga: aquí solo lóbulos + línea base.
  let mShapeEl: React.ReactNode;
  switch (beamType) {
    case 'ss':
    case 'cantilever': {
      mShapeEl = (
        <>
          <path d={ptsToFillPath(mRawPts, mBaseY)} fill={mFill} stroke="none" />
          <polyline points={ptsToPolyline(mRawPts)} fill="none" stroke={mStroke} strokeWidth={1.5} />
          <line x1={mx0} y1={mBaseY} x2={mx1} y2={mBaseY} stroke={baseColor} strokeWidth={1} />
        </>
      );
      break;
    }
    case 'fp': {
      const zeroX  = mx0 + mbw * 0.25;
      const hogPts = mRawPts.filter(([x]) => x <= zeroX + 2);
      const sagPts = mRawPts.filter(([x]) => x >= zeroX - 2);
      mShapeEl = (
        <>
          <path d={ptsToFillPath(hogPts, mBaseY)} fill={mFill} stroke="none" />
          <path d={ptsToFillPath(sagPts, mBaseY)} fill={mFill} stroke="none" />
          <polyline points={ptsToPolyline(mRawPts)} fill="none" stroke={mStroke} strokeWidth={1.5} />
          <line x1={mx0} y1={mBaseY} x2={mx1} y2={mBaseY} stroke={baseColor} strokeWidth={1} />
        </>
      );
      break;
    }
    case 'ff': {
      const x1      = mx0 + mbw * (3 - Math.sqrt(3)) / 6;
      const x2      = mx0 + mbw * (3 + Math.sqrt(3)) / 6;
      const hogLPts = mRawPts.filter(([x]) => x <= x1 + 2);
      const sagPts  = mRawPts.filter(([x]) => x >= x1 - 2 && x <= x2 + 2);
      const hogRPts = mRawPts.filter(([x]) => x >= x2 - 2);
      mShapeEl = (
        <>
          <path d={ptsToFillPath(hogLPts, mBaseY)} fill={mFill} stroke="none" />
          <path d={ptsToFillPath(sagPts,  mBaseY)} fill={mFill} stroke="none" />
          <path d={ptsToFillPath(hogRPts, mBaseY)} fill={mFill} stroke="none" />
          <polyline points={ptsToPolyline(mRawPts)} fill="none" stroke={mStroke} strokeWidth={1.5} />
          <line x1={mx0} y1={mBaseY} x2={mx1} y2={mBaseY} stroke={baseColor} strokeWidth={1} />
        </>
      );
      break;
    }
  }

  // ══ Celda V ═══════════════════════════════════════════════════════════════
  const vc = cells.v;
  const vx0 = vc.x + padX;
  const vx1 = vc.x + vc.w - padX;
  // Banda extra arriba para la etiqueta +V (va ENCIMA del pico, fuera del
  // lóbulo); la etiqueta −V usa la banda chartBot inferior.
  const V_LABEL_ROOM = 10;
  const vAvail   = vc.h - chartTopOff - V_LABEL_ROOM - chartBot;
  const vCenterY = vc.y + chartTopOff + V_LABEL_ROOM + vAvail / 2;
  const vHalf    = vAvail / 2 - 2;

  const vPosH = vHalf;
  const vNegH =
    beamType === 'fp'         ? vHalf * (VEdB / VEdA) :
    beamType === 'cantilever' ? 0                     :
                                vHalf;

  let vShapeEl: React.ReactNode;
  switch (beamType) {
    case 'ss':
    case 'ff': {
      const vMidX = (vx0 + vx1) / 2;
      vShapeEl = (
        <>
          <path d={`M ${vx0},${vCenterY - vPosH} L ${vMidX},${vCenterY} L ${vx0},${vCenterY} Z`}
            fill={vPosFill} stroke="none" />
          <line x1={vx0} y1={vCenterY - vPosH} x2={vMidX} y2={vCenterY}
            stroke={vPosStroke} strokeWidth={1.5} />
          <path d={`M ${vMidX},${vCenterY} L ${vx1},${vCenterY + vNegH} L ${vx1},${vCenterY} Z`}
            fill={vNegFill} stroke="none" />
          <line x1={vMidX} y1={vCenterY} x2={vx1} y2={vCenterY + vNegH}
            stroke={vNegStroke} strokeWidth={1.5} />
          <line x1={vx0} y1={vCenterY} x2={vx1} y2={vCenterY} stroke={baseColor} strokeWidth={1} />
        </>
      );
      break;
    }
    case 'cantilever': {
      vShapeEl = (
        <>
          <path d={`M ${vx0},${vCenterY - vPosH} L ${vx1},${vCenterY} L ${vx0},${vCenterY} Z`}
            fill={vPosFill} stroke="none" />
          <line x1={vx0} y1={vCenterY - vPosH} x2={vx1} y2={vCenterY}
            stroke={vPosStroke} strokeWidth={1.5} />
          <line x1={vx0} y1={vCenterY} x2={vx1} y2={vCenterY} stroke={baseColor} strokeWidth={1} />
        </>
      );
      break;
    }
    case 'fp': {
      const vZeroX = vx0 + (vx1 - vx0) * (5 / 8);
      vShapeEl = (
        <>
          <path d={`M ${vx0},${vCenterY - vPosH} L ${vZeroX},${vCenterY} L ${vx0},${vCenterY} Z`}
            fill={vPosFill} stroke="none" />
          <line x1={vx0} y1={vCenterY - vPosH} x2={vZeroX} y2={vCenterY}
            stroke={vPosStroke} strokeWidth={1.5} />
          <path d={`M ${vZeroX},${vCenterY} L ${vx1},${vCenterY + vNegH} L ${vx1},${vCenterY} Z`}
            fill={vNegFill} stroke="none" />
          <line x1={vZeroX} y1={vCenterY} x2={vx1} y2={vCenterY + vNegH}
            stroke={vNegStroke} strokeWidth={1.5} />
          <line x1={vx0} y1={vCenterY} x2={vx1} y2={vCenterY} stroke={baseColor} strokeWidth={1} />
        </>
      );
      break;
    }
  }

  // ══ Celda δ ═══════════════════════════════════════════════════════════════
  const dc = cells.d;
  const dx0 = dc.x + padX;
  const dx1 = dc.x + dc.w - padX;
  const dbw = dx1 - dx0;
  const dTop   = dc.y + chartTopOff;
  const dAvail = dc.h - chartTopOff - chartBot;

  // Escala común curva/límite: el mayor de δmax y δadm ocupa todo el alto.
  // Así la curva enseña el MARGEN real frente a la línea discontinua L/n.
  const maxRef = Math.max(deltaMax, deltaAdm);
  const dDepth = dAvail * (deltaMax / maxRef);
  const admY   = dTop + dAvail * (deltaAdm / maxRef);

  const dShapeFn: (t: number) => number = (() => {
    switch (beamType) {
      case 'ss':
      case 'ff':
        return (t: number) => 4 * t * (1 - t);
      case 'cantilever':
        return (t: number) => (6 * t * t - 4 * t * t * t + t * t * t * t) / 3;
      case 'fp': {
        // Forma analítica de la ménsula apuntalada bajo UDL: y ∝ t²(1−t)(3−2t).
        const rawFn = (t: number) => t * t * (1 - t) * (3 - 2 * t);
        let dMax = 0;
        for (let i = 0; i <= N; i++) dMax = Math.max(dMax, rawFn(i / N));
        return (t: number) => rawFn(t) / dMax;
      }
    }
  })();

  const dPts: Array<[number, number]> = Array.from({ length: N + 1 }, (_, i) => {
    const t = i / N;
    return [dx0 + dbw * t, dTop + dShapeFn(t) * dDepth];
  });

  const dPolyline = dPts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const dFillPath =
    `M ${dx0},${dTop} ` +
    dPts.map(([x, y]) => `L ${x.toFixed(1)},${y.toFixed(1)}`).join(' ') +
    ` L ${dx1},${dTop} Z`;

  // ── Label + peak-dot geometry (shared helper) ─────────────────────────────
  const geom = beamPeakGeometry({
    beamType,
    m: { x0: mx0, x1: mx1, baseY: mBaseY, unit: mUnit, rawMin, rawMax },
    v: { x0: vx0, x1: vx1, centerY: vCenterY, posH: vPosH, negH: vNegH },
    d: { x0: dx0, x1: dx1, baseY: dTop, depth: dDepth, admY },
  });

  const renderLabel = (
    pos: LabelPos, text: string,
    opts: { fontSize?: number; color?: string; bold?: boolean } = {},
  ) => (
    <text
      x={pos.x} y={pos.y}
      fontSize={opts.fontSize ?? FS_PEAK}
      fontWeight={opts.bold === false ? undefined : 600}
      fill={opts.color ?? C_PEAK}
      textAnchor={pos.anchor}
      dominantBaseline="middle"
      stroke={haloC} strokeWidth={3} strokeLinejoin="round" paintOrder="stroke"
      style={{ fontFamily: FF_MONO }}
    >
      {text}
    </text>
  );

  const renderDot = (p: { x: number; y: number }, color: string) => (
    <circle cx={p.x} cy={p.y} r={DOT_R} fill={color} stroke="none" />
  );

  // ff sagging secondary value: |MEd|×0.5 (UDL assumption)
  const ffSagValue = beamType === 'ff' ? Math.abs(MEd) * 0.5 : 0;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* ══ Esquema de carga ══════════════════════════════════════════════ */}
      {loadCellEl}

      {/* ══ M diagram ════════════════════════════════════════════════════ */}
      {cellTitle(mc, 'Momento · ELU')}
      {mShapeEl}
      {renderDot(geom.mPeak, mStroke)}
      {renderLabel(geom.mLabel, formatQuantity(MEd, 'moment', system, { precision: 1 }))}
      {geom.mPeakSecondary && renderDot(geom.mPeakSecondary, mStroke)}
      {geom.mLabelSecondary && renderLabel(
        geom.mLabelSecondary,
        formatQuantity(ffSagValue, 'moment', system, { precision: 1 }),
        { fontSize: FS_FF_SAG, color: C_ADM, bold: false },
      )}

      {/* ══ V diagram ════════════════════════════════════════════════════ */}
      {cellTitle(vc, 'Cortante · ELU')}
      {vShapeEl}
      {renderDot(geom.vPosPeak, vPosStroke)}
      {renderLabel(geom.vPosLabel, `+${formatQuantity(VEdA, 'force', system, { precision: 1 })}`, { color: vPosLabelC })}
      {geom.vNegPeak && renderDot(geom.vNegPeak, vNegStroke)}
      {geom.vNegLabel && renderLabel(
        geom.vNegLabel,
        `-${formatQuantity(beamType === 'fp' ? VEdB : VEdA, 'force', system, { precision: 1 })}`,
        { color: vNegLabelC },
      )}

      {/* ══ δ diagram (ELS) ═══════════════════════════════════════════════ */}
      {cellTitle(dc, 'Flecha · ELS')}
      <path d={dFillPath} fill={dFill} stroke="none" />
      <polyline points={dPolyline} fill="none" stroke={dStroke} strokeWidth={1.5} />
      <line x1={dx0} y1={dTop} x2={dx1} y2={dTop} stroke={baseColor} strokeWidth={1} />
      {/* Límite admisible: línea discontinua con SU etiqueta pegada (mismo
          color), en el extremo opuesto al pico para no chocar con δmax */}
      <line x1={dx0} y1={admY} x2={dx1} y2={admY}
        stroke={C_ADM} strokeWidth={1} strokeDasharray="4,3" />
      <text
        x={beamType === 'cantilever' ? dx0 : dx1}
        y={admY - 5}
        fontSize={FS_ADM}
        fill={C_ADM}
        textAnchor={beamType === 'cantilever' ? 'start' : 'end'}
        stroke={haloC} strokeWidth={3} strokeLinejoin="round" paintOrder="stroke"
        style={{ fontFamily: FF_MONO }}
      >
        δadm = {deltaAdm.toFixed(1)} mm (L/{deflLimit})
      </text>
      {renderDot(geom.dPeak, dStroke)}
      {renderLabel(geom.dLabel, `${deltaMax.toFixed(1)} mm`)}
    </svg>
  );
};
