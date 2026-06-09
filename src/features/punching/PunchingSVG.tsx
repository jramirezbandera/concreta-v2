import { type PunchingInputs, type PunchingMode, type PunchingPosition } from '../../data/defaults';
import { type PunchingResult } from '../../lib/calculations/punching';
import { getProfile } from '../../data/steelProfiles';

interface PunchingSVGProps {
  inp: PunchingInputs;
  result: PunchingResult;
  width: number;
  mode?: 'screen' | 'pdf';
}

// ── Plan view (top) ───────────────────────────────────────────────────────────
// Single, to-scale plan of the punching problem. The critical perimeter u1 is the
// real 2d offset of the loaded area, truncated at the free edge(s) exactly as the
// CE art. 6.4 formulas assume for each position (interior / borde / esquina). The
// punching collar (column → u1) is tinted with the overall verdict colour so the
// drawing itself reads as a pass/fail checker.
function PlanView({
  inp,
  result,
  size,
  svgMode,
}: {
  inp: PunchingInputs;
  result: PunchingResult;
  size: number;
  svgMode: 'screen' | 'pdf';
}) {
  const isPdf = svgMode === 'pdf';
  const cx = inp.cx as number;
  const cy = inp.cy as number;
  const d  = inp.d as number;
  const sr = inp.sr as number;
  const position = inp.position as PunchingPosition;
  const useCircular = (inp.isCircular as boolean) && position === 'interior';
  const hasShearReinf = inp.hasShearReinf as boolean;
  const isLoad = (inp.mode as PunchingMode) === 'carga-puntual';

  // Column half-extents (mm). For circular, cx is the diameter.
  const hx = (useCircular ? cx : cx) / 2;
  const hy = (useCircular ? cx : cy) / 2;
  const t1 = 2 * d;                         // u1 sits 2d from the loaded-area face

  // Overall verdict → tint of the punching collar (visual checker).
  const overall: 'ok' | 'warn' | 'fail' =
    result.checks.some((c) => c.status === 'fail') ? 'fail'
    : result.checks.some((c) => c.status === 'warn') ? 'warn'
    : 'ok';

  // uout — offset distance beyond which no shear reinforcement is needed. Drawn
  // only with shear reinforcement and when it falls outside u1. tOut is recovered
  // from the perimeter length (straight part + 2π·t); for borde/esquina this is a
  // visual approximation, the exact value lives in the results.
  let drawUout = false;
  let tOut = 0;
  if (hasShearReinf && result.uout > 0 && hx > 0) {
    const straight = useCircular ? Math.PI * cx : 2 * (cx + cy);
    const t = (result.uout - straight) / (2 * Math.PI);
    if (t > t1 * 1.05) { drawUout = true; tOut = t; }
  }
  const tMax = Math.max(t1, drawUout ? tOut : 0);

  // Free edges by position. Convention: cy ⟂ free edge (interior toward −y);
  // esquina adds a second free edge on +x.
  const freeBottom = position !== 'interior';
  const freeRight  = position === 'esquina';

  // World bounding box (column-local, mm). Free sides don't extend (truncated).
  const xMin = -(hx + tMax);
  const xMax =  (hx + (freeRight  ? 0 : tMax));
  const yMin = -(hy + tMax);
  const yMax =  (hy + (freeBottom ? 0 : tMax));
  const worldW = Math.max(xMax - xMin, 1);
  const worldH = Math.max(yMax - yMin, 1);
  const cxW = (xMin + xMax) / 2;
  const cyW = (yMin + yMax) / 2;

  const MARGIN = 30;
  const scale = (size - 2 * MARGIN) / Math.max(worldW, worldH);
  const px = (x: number) => size / 2 + (x - cxW) * scale;
  const py = (y: number) => size / 2 + (y - cyW) * scale;
  const clamp = (v: number) => Math.max(8, Math.min(size - 8, v));

  // Colours
  const colCanvas  = 'var(--color-bg-canvas, #0f172a)';
  const colSlab    = isPdf ? '#f8fafc' : 'var(--color-bg-surface, #1e293b)';
  const colArea    = isPdf ? '#cbd5e1' : 'var(--color-bg-elevated, #263348)';
  const strokeArea = isPdf ? '#334155' : 'var(--color-border-main, #475569)';
  const strokeU1   = isPdf ? '#0ea5e9' : '#38bdf8';
  const strokeUout = isPdf ? '#64748b' : '#64748b';
  const strokeEdge = isPdf ? '#475569' : '#64748b';
  const textCol    = isPdf ? '#475569' : '#94a3b8';
  const strokeSw   = isPdf ? '#94a3b8' : '#64748b';
  const tintCol    = overall === 'fail' ? '#ef4444' : overall === 'warn' ? '#f59e0b' : '#22c55e';

  // Shear-reinforcement perimeters (rings) + studs on the loaded spokes.
  const ringDists: number[] = [];
  if (hasShearReinf && sr > 0 && d > 0) {
    const dmax = drawUout ? tOut : 1.5 * d;
    for (let t = 0.5 * d; t <= dmax + 1e-6 && ringDists.length < 6; t += sr) ringDists.push(t);
  }
  const spokes = (['up', 'left', 'right', 'down'] as const).filter((dir) => {
    if (dir === 'down')  return !freeBottom;
    if (dir === 'right') return !freeRight;
    return true;
  });
  const studXY = (dir: (typeof spokes)[number], t: number): [number, number] => {
    if (dir === 'up')    return [px(0), py(-(hy + t))];
    if (dir === 'down')  return [px(0), py( (hy + t))];
    if (dir === 'left')  return [px(-(hx + t)), py(0)];
    return [px((hx + t)), py(0)];
  };

  // Concrete region clip — truncates u1/uout/rings exactly at the free edge(s).
  const clipId = `punch-slab-${position}`;
  const clipRect =
    position === 'esquina' ? { x: 0, y: 0, w: px(hx), h: py(hy) }
    : position === 'borde' ? { x: 0, y: 0, w: size, h: py(hy) }
    : { x: 0, y: 0, w: size, h: size };

  // Rounded-rect (rectangular) or circle (circular) offset at distance t.
  const offsetShape = (
    t: number,
    opts: { stroke?: string; sw?: number; dash?: string; fill?: string; fillOpacity?: number; key?: string },
  ) => {
    const { stroke = 'none', sw = 0, dash, fill = 'none', fillOpacity, key } = opts;
    return useCircular ? (
      <circle key={key} cx={px(0)} cy={py(0)} r={(hx + t) * scale}
        fill={fill} fillOpacity={fillOpacity} stroke={stroke} strokeWidth={sw} strokeDasharray={dash} />
    ) : (
      <rect key={key}
        x={px(-(hx + t))} y={py(-(hy + t))}
        width={(2 * hx + 2 * t) * scale} height={(2 * hy + 2 * t) * scale}
        rx={t * scale} ry={t * scale}
        fill={fill} fillOpacity={fillOpacity} stroke={stroke} strokeWidth={sw} strokeDasharray={dash} />
    );
  };

  // 2d cota: prefer the right side; if it's a free edge (esquina), use the top.
  const cota = freeRight
    ? { x1: px(0), y1: py(-hy), x2: px(0), y2: py(-(hy + t1)),
        tx: px(0) - 11, ty: (py(-hy) + py(-(hy + t1))) / 2 }
    : { x1: px(hx), y1: py(0), x2: px(hx + t1), y2: py(0),
        tx: (px(hx) + px(hx + t1)) / 2, ty: py(0) - 5 };

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label="Vista en planta — punzonamiento">
      <defs>
        <clipPath id={clipId}>
          <rect x={clipRect.x} y={clipRect.y} width={clipRect.w} height={clipRect.h} />
        </clipPath>
        <marker id="arrow-u1" markerWidth={6} markerHeight={6} refX={3} refY={3} orient="auto">
          <path d="M0,0 L0,6 L6,3 z" fill={strokeU1} />
        </marker>
        {/* Diagonal hatch for the point-load contact area (vs the solid column) */}
        <pattern id="punch-load-hatch" width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width={6} height={6} fill={colArea} />
          <line x1={0} y1={0} x2={0} y2={6} stroke={strokeArea} strokeWidth={0.8} />
        </pattern>
      </defs>

      {!isPdf && <rect width={size} height={size} fill={colCanvas} />}

      {/* Slab + perimeters, clipped to the concrete region (truncates at free edges) */}
      <g clipPath={`url(#${clipId})`}>
        {/* Concrete slab */}
        <rect x={0} y={0} width={size} height={size} fill={colSlab} />

        {/* Punching collar (column → u1) tinted with the verdict */}
        {offsetShape(t1, { fill: tintCol, fillOpacity: isPdf ? 0.12 : 0.16, key: 'tint' })}

        {/* uout perimeter — limit of required shear reinforcement */}
        {drawUout && offsetShape(tOut, { stroke: strokeUout, sw: 1, dash: '4 3', key: 'uout' })}

        {/* shear-reinforcement perimeters (rings) */}
        {ringDists.map((t, i) => offsetShape(t, { stroke: strokeSw, sw: 0.8, dash: '2 2', key: `ring-${i}` }))}

        {/* u1 critical perimeter */}
        {offsetShape(t1, { stroke: strokeU1, sw: 1.6, key: 'u1' })}

        {/* studs on the loaded spokes */}
        {ringDists.map((t, ti) =>
          spokes.map((dir) => {
            const [sxp, syp] = studXY(dir, t);
            return <circle key={`stud-${dir}-${ti}`} cx={sxp} cy={syp} r={2.2} fill={strokeSw} />;
          }),
        )}
      </g>

      {/* Loaded area (opaque, on top): solid = column (pilar), hatch + load glyph =
          point-load contact area (carga puntual, no column). */}
      {useCircular ? (
        <circle cx={px(0)} cy={py(0)} r={hx * scale}
          fill={isLoad ? 'url(#punch-load-hatch)' : colArea} stroke={strokeArea} strokeWidth={1} />
      ) : (
        <rect x={px(-hx)} y={py(-hy)} width={2 * hx * scale} height={2 * hy * scale}
          fill={isLoad ? 'url(#punch-load-hatch)' : colArea} stroke={strokeArea} strokeWidth={1} />
      )}
      {isLoad && (
        <g stroke={isPdf ? '#334155' : 'var(--color-chart-dim-text)'} fill={isPdf ? '#334155' : 'var(--color-chart-dim-text)'}>
          <circle cx={px(0)} cy={py(0)} r={7} fill="none" strokeWidth={1.3} />
          <circle cx={px(0)} cy={py(0)} r={2.4} strokeWidth={0} />
        </g>
      )}

      {/* Free-edge line(s) — slab boundary */}
      {freeBottom && (
        <line x1={0} y1={py(hy)} x2={position === 'esquina' ? px(hx) : size} y2={py(hy)}
          stroke={strokeEdge} strokeWidth={2} />
      )}
      {freeRight && (
        <line x1={px(hx)} y1={0} x2={px(hx)} y2={py(hy)} stroke={strokeEdge} strokeWidth={2} />
      )}

      {/* 2d cota */}
      <line x1={cota.x1} y1={cota.y1} x2={cota.x2} y2={cota.y2}
        stroke={strokeU1} strokeWidth={0.75} markerEnd="url(#arrow-u1)" />
      <text x={cota.tx} y={cota.ty} fontSize={9} fontFamily="monospace" textAnchor="middle" fill={strokeU1}>2d</text>

      {/* Labels */}
      <text x={clamp(px(0))} y={clamp(py(-(hy + t1)) - 5)} fontSize={11} fontFamily="monospace"
        textAnchor="middle" fill={strokeU1}>u1</text>
      {drawUout && (
        <text x={clamp(px(0) + 18)} y={clamp(py(-(hy + tOut)) - 4)} fontSize={9} fontFamily="monospace"
          textAnchor="middle" fill={textCol}>uout</text>
      )}
      {freeBottom && (
        <text x={position === 'esquina' ? clamp(px(hx) / 2) : size / 2} y={clamp(py(hy) + 13)}
          fontSize={9} fontFamily="monospace" textAnchor="middle" fill={textCol}>borde libre</text>
      )}
      {freeRight && (() => {
        const rx = clamp(px(hx) + 11);
        const ry = clamp(py(hy) / 2);
        return (
          <text x={rx} y={ry} fontSize={9} fontFamily="monospace" textAnchor="middle"
            fill={textCol} transform={`rotate(-90 ${rx} ${ry})`}>borde libre</text>
        );
      })()}
    </svg>
  );
}

// ── Cruceta plan view (steel column + UPN crucetas welded to each face) ────────
function CrossPlanView({
  inp, size, svgMode,
}: {
  inp: PunchingInputs;
  size: number;
  svgMode: 'screen' | 'pdf';
}) {
  const isPdf = svgMode === 'pdf';
  const plateA = inp.plateA as number;
  const plateB = inp.plateB as number;
  const d = inp.d as number;
  // Longitud de brazo ESQUEMÁTICA (el dibujo es "no a escala"): el modelo de reparto
  // se eliminó (recorte 2026-06-09), así que la cruz se dibuja con un brazo proporcional
  // a la placa solo para ilustrar el detalle. El reparto real lo verifica el ingeniero.
  const Leff = Math.max(plateA, plateB) * 1.4;
  const r = 2 * d;

  // Column profile geometry (plan = I/H cross-section): depth h along y, width b along x.
  const prof = getProfile(inp.colType, inp.colSize);
  const ph = prof?.h ?? plateB;   // mm — section depth (y)
  const pb_ = prof?.b ?? plateA;  // mm — flange width (x)
  const ptf = prof?.tf ?? 12;     // mm — flange thickness
  const ptw = prof?.tw ?? 8;      // mm — web thickness

  // Detail view: fit the STEEL (plate + profile + crucetas) prominently. For real
  // cases 2d and L_eff are each larger than the column, so a true-scale u1 would
  // dwarf the column; u1 is therefore drawn as a schematic context boundary near
  // the canvas edge (its true value is in the results / label). The steel and its
  // parts are to scale among themselves.
  void r;
  // Arm presence by position (interior 4, borde drops down, esquina drops down+left).
  const leftPresent = inp.position !== 'esquina';
  const downPresent = inp.position === 'interior';
  const bodyX = Math.max(pb_ / 2, plateA / 2);
  const bodyY = Math.max(ph / 2, plateB / 2);
  const armV = ph / 2 + Leff;   // vertical arm reach from plate centre
  const armH = pb_ / 2 + Leff;  // horizontal arm reach
  const Ru = Math.max(bodyY, armV);                       // up arm (always)
  const Rr = Math.max(bodyX, armH);                       // right arm (always)
  const Rl = leftPresent ? Math.max(bodyX, armH) : bodyX; // left arm (not esquina)
  const Rd = downPresent ? Math.max(bodyY, armV) : bodyY; // down arm (interior only)

  // Layout: interior is centred. Borde/esquina anchor the steel against the free
  // edge(s) near the canvas border and scale to fill the slab side, so the
  // concrete-less void beyond the edge is a thin strip, not half the canvas
  // (matches the pilar / carga-puntual plan views).
  let scale: number, ox: number, oy: number;
  if (inp.position === 'interior') {
    const maxReach = Math.max(Ru, Rr, Rl, Rd, 1);
    scale = ((size / 2) * 0.70) / maxReach;
    ox = size / 2;
    oy = size / 2;
  } else {
    const BOT = 26, LFT = 26, TM = 16, SM = 16;
    const FE_Y = size - BOT;     // bottom free edge near the canvas border
    const FE_X = LFT;            // left free edge (esquina)
    const offY = plateB / 2 + (inp.edgeY as number); // plate centre → bottom edge
    const offX = plateA / 2 + (inp.edgeX as number); // plate centre → left edge
    const cands = [(FE_Y - TM) / (offY + Ru)];       // fit the up arm under the top
    if (inp.position === 'borde') {
      cands.push((size / 2 - SM) / Math.max(Rr, 1), (size / 2 - SM) / Math.max(Rl, 1));
    } else {
      cands.push((size - SM - FE_X) / (offX + Rr));   // fit the right arm
    }
    scale = Math.max(0.02, Math.min(...cands));
    oy = FE_Y - offY * scale;
    ox = inp.position === 'esquina' ? FE_X + offX * scale : size / 2;
  }
  const px = (mm: number) => mm * scale;

  // Column profile = container (light fill + outline). Crucetas = the subject
  // (mid-grey, clearly visible). Screen via theme tokens; PDF literal.
  const colArea    = isPdf ? '#94a3b8' : 'var(--color-bg-elevated)';     // profile fill
  const strokeArea = isPdf ? '#1e293b' : 'var(--color-chart-section)';   // profile outline
  const armFill    = isPdf ? '#e2e8f0' : 'var(--color-chart-rebar-faint)'; // cruceta fill
  const armStroke  = isPdf ? '#64748b' : 'var(--color-chart-dim-text)';  // cruceta outline
  const weldCol    = isPdf ? '#0ea5e9' : 'var(--color-accent)';
  const plateStroke = isPdf ? '#94a3b8' : 'var(--color-chart-rebar-dim)';
  const strokeU1   = isPdf ? '#0ea5e9' : 'var(--color-accent)';
  const textCol    = isPdf ? '#475569' : '#94a3b8';

  // px geometry
  const hb = px(pb_) / 2;   // half flange width (x)
  const hh = px(ph) / 2;    // half depth (y)
  const tf = px(ptf);
  const tw = px(ptw) / 2;   // half web thickness
  const le = px(Leff);
  const paH = px(plateA) / 2;
  const pbH = px(plateB) / 2;
  const chT = Math.max(Math.min(hb, hh) * 0.85, 14);  // UPN channel footprint width

  // u1 schematic boundary (NOT to scale — see note above)
  const u1Inset = 7;

  // Free-edge positions (to scale, relative to the plate). The schematic u1
  // boundary is truncated at these edges — the concrete control perimeter stops
  // at the slab edge, same as the pilar / carga-puntual plan views.
  const horizEdgeY = Math.max(0, Math.min(size, oy + pbH + px(inp.edgeY)));
  const vertEdgeX  = Math.max(0, Math.min(size, ox - paH - px(inp.edgeX)));
  const slabClipId = `cruz-slab-${inp.position}`;
  const slabClip =
    inp.position === 'esquina' ? { x: vertEdgeX, y: 0, w: size - vertEdgeX, h: horizEdgeY }
    : inp.position === 'borde' ? { x: 0, y: 0, w: size, h: horizEdgeY }
    : { x: 0, y: 0, w: size, h: size };

  // A UPN cruceta drawn as a channel that runs TANGENT to a profile face, parallel
  // to it, passing by the column on both ends and projecting L_eff beyond. It is
  // welded LONGITUDINALLY along the contact with the face (never butting head-on)
  // and stays entirely OUTSIDE the profile. dir = which face it hugs.
  const channel = (dir: 'up' | 'down' | 'left' | 'right'): React.ReactElement | null => {
    if (le <= 0) return null;
    if (dir === 'up' || dir === 'down') {
      // horizontal channel tangent to the flange face, passing left & right
      const face = dir === 'up' ? oy - hh : oy + hh;       // flange face (weld line)
      const yt   = dir === 'up' ? face - chT : face;       // channel band
      const x1 = ox - hb - le, x2 = ox + hb + le;
      return (
        <g key={dir}>
          <rect x={x1} y={yt} width={x2 - x1} height={chT} fill={armFill} stroke={armStroke} strokeWidth={1} />
          {/* UPN = canal en C: una sola línea (el alma/dorso) en el lado interior, hacia el pilar */}
          <line x1={x1} y1={dir === 'up' ? face - chT * 0.28 : face + chT * 0.28}
                x2={x2} y2={dir === 'up' ? face - chT * 0.28 : face + chT * 0.28}
                stroke={armStroke} strokeWidth={0.7} />
          {/* longitudinal weld along the face contact */}
          <line x1={ox - hb} y1={face} x2={ox + hb} y2={face} stroke={weldCol} strokeWidth={2} />
        </g>
      );
    }
    // vertical channel tangent to the side face (flange tips), passing up & down
    const face = dir === 'left' ? ox - hb : ox + hb;       // side face (weld line)
    const xt   = dir === 'left' ? face - chT : face;       // channel band
    const y1 = oy - hh - le, y2 = oy + hh + le;
    return (
      <g key={dir}>
        <rect x={xt} y={y1} width={chT} height={y2 - y1} fill={armFill} stroke={armStroke} strokeWidth={1} />
        {/* UPN = canal en C: una sola línea (el alma/dorso) en el lado interior, hacia el pilar */}
        <line x1={dir === 'left' ? face - chT * 0.28 : face + chT * 0.28} y1={y1}
              x2={dir === 'left' ? face - chT * 0.28 : face + chT * 0.28} y2={y2}
              stroke={armStroke} strokeWidth={0.7} />
        {/* longitudinal weld along the face contact */}
        <line x1={face} y1={oy - hh} x2={face} y2={oy + hh} stroke={weldCol} strokeWidth={2} />
      </g>
    );
  };

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label="Vista en planta — pilar con crucetas">
      {!isPdf && <rect width={size} height={size} fill="var(--color-bg-canvas, #0f172a)" />}

      <defs>
        <clipPath id={slabClipId}>
          <rect x={slabClip.x} y={slabClip.y} width={slabClip.w} height={slabClip.h} />
        </clipPath>
      </defs>

      {/* u1 perimeter — schematic boundary (NOT to scale), truncated at free edge(s) */}
      <rect
        x={u1Inset} y={u1Inset}
        width={size - 2 * u1Inset} height={size - 2 * u1Inset}
        rx={18} ry={18}
        fill="none" stroke={strokeU1} strokeWidth={1.5} strokeDasharray="5 3"
        clipPath={`url(#${slabClipId})`}
      />

      {/* end plate (bears on concrete) — faint outline */}
      <rect
        x={ox - paH} y={oy - pbH} width={paH * 2} height={pbH * 2}
        fill="none" stroke={plateStroke} strokeWidth={1} strokeDasharray="3 2"
      />

      {/* free-edge line(s) where the concrete ends (perimeter is truncated here) */}
      {inp.position !== 'interior' && (
        <>
          <line x1={u1Inset} y1={horizEdgeY} x2={size - u1Inset} y2={horizEdgeY}
            stroke={textCol} strokeWidth={1.5} strokeDasharray="6 3" />
          <text x={size - u1Inset - 4} y={horizEdgeY - 4} fontSize={8} fontFamily="monospace" textAnchor="end" fill={textCol}>borde libre</text>
        </>
      )}
      {inp.position === 'esquina' && (
        <line x1={vertEdgeX} y1={u1Inset} x2={vertEdgeX} y2={size - u1Inset}
          stroke={textCol} strokeWidth={1.5} strokeDasharray="6 3" />
      )}

      {/* column profile (I/H section in plan) */}
      <g fill={colArea} stroke={strokeArea} strokeWidth={1}>
        <rect x={ox - hb} y={oy - hh}      width={hb * 2} height={tf} />            {/* top flange */}
        <rect x={ox - hb} y={oy + hh - tf} width={hb * 2} height={tf} />            {/* bottom flange */}
        <rect x={ox - tw} y={oy - hh + tf} width={tw * 2} height={hh * 2 - 2 * tf} /> {/* web */}
      </g>

      {/* UPN crucetas — one channel tangent to each column face, welded
          longitudinally and passing the column on both ends (full length L_eff).
          The edge-facing channel(s) are the "crucetas de borde": they hug the
          column just like the interior arms (NOT stuck to the free edge), so all
          four are drawn for every position. Truncated only at the slab free edge. */}
      <g clipPath={`url(#${slabClipId})`}>
        {(['up', 'down', 'left', 'right'] as const).map((dir) => channel(dir))}
      </g>

      {/* labels — sin "L_eff" (el reparto se eliminó; el brazo dibujado es esquemático,
          no una longitud eficaz calculada). El pie ya identifica el perfil y el "no a escala". */}
      <text x={size - u1Inset - 16} y={u1Inset + 13} fontSize={10} fontFamily="monospace" fill={strokeU1}>u1</text>
      <text x={ox} y={size - u1Inset - 6} fontSize={8} fontFamily="monospace" textAnchor="middle" fill={textCol}>
        {inp.colType} {inp.colSize} · cruceta UPN {inp.upnSize} · esquemático (no a escala)
      </text>
    </svg>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export function PunchingSVG({ inp, result, width, mode = 'screen' }: PunchingSVGProps) {
  const planSize = Math.min(width, 360);

  if ((inp.mode as PunchingMode) === 'pilar-cruceta') {
    return (
      <div className={mode === 'screen' ? 'canvas-dot-grid' : undefined}>
        <CrossPlanView inp={inp} size={planSize} svgMode={mode} />
      </div>
    );
  }

  return (
    <div className={mode === 'screen' ? 'canvas-dot-grid' : undefined}>
      <PlanView inp={inp} result={result} size={planSize} svgMode={mode} />
    </div>
  );
}
