// Retaining wall SVG — three views in one file: geometry, loads, rebar.
// mode='screen': dark-theme palette (Concreta UI)
// mode='pdf':    light-paper palette for print (jsPDF/svg2pdf)

import { type RetainingWallInputs } from '../../data/defaults';
import { type RetainingWallResult } from '../../lib/calculations/retainingWall';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import { formatQuantity } from '../../lib/units/format';

export type RetainingWallView = 'geometry' | 'loads' | 'rebar';

interface RetainingWallSVGProps {
  inp: RetainingWallInputs;
  result: RetainingWallResult;
  mode?: 'screen' | 'pdf';
  width?: number;
  height?: number;
  view?: RetainingWallView;
}

// ─── Palettes ───────────────────────────────────────────────────────────────

interface Palette {
  chipBg:        string;
  chipBorder:    string;
  label:         string;
  text:          string;
  dim:           string;
  concreteFill:  string;
  concreteEdge:  string;
  soilFillTop:   string;
  soilFillBot:   string;
  soilLine:      string;
  soilDot:       string;
  ground:        string;
  earth:         string;
  water:         string;
  seismic:       string;
  weight:        string;
  reaction:      string;
  passive:       string;
  surcharge:     string;
  rebar:         string;
  rebarSecondary:string;
  rebarTransv:   string;
  rebarGhost:    string;
  pivot:         string;
}

const SCREEN_PALETTE: Palette = {
  chipBg:        '#0b1220',
  chipBorder:    '#22304d',
  label:         '#cbd5e1',
  text:          '#94a3b8',
  dim:           '#475569',
  concreteFill:  '#1a2540',
  concreteEdge:  '#3a4a6e',
  soilFillTop:   '#4a3522',
  soilFillBot:   '#2a1d12',
  soilLine:      '#a8825a',
  soilDot:       '#7a5a3a',
  ground:        '#8a6a44',
  earth:         '#a8a29e',
  water:         '#7dd3fc',
  seismic:       '#fcd34d',
  weight:        '#cbd5e1',
  reaction:      '#22c55e',
  passive:       '#a78bfa',
  surcharge:     '#f59e0b',
  rebar:         '#f8fafc',
  rebarSecondary:'#94a3b8',
  rebarTransv:   '#fbbf24',
  rebarGhost:    '#22304d',
  pivot:         '#38bdf8',
};

const PDF_PALETTE: Palette = {
  chipBg:        '#ffffff',
  chipBorder:    '#cbd5e1',
  label:         '#1f2937',
  text:          '#475569',
  dim:           '#94a3b8',
  concreteFill:  '#f1f5f9',
  concreteEdge:  '#475569',
  soilFillTop:   '#d6c1a0',
  soilFillBot:   '#b89876',
  soilLine:      '#8b6e3a',
  soilDot:       '#7a5a3a',
  ground:        '#5d4630',
  earth:         '#6b7280',
  water:         '#0ea5e9',
  seismic:       '#d97706',
  weight:        '#4b5563',
  reaction:      '#15803d',
  passive:       '#7c3aed',
  surcharge:     '#b45309',
  rebar:         '#0f172a',
  rebarSecondary:'#475569',
  rebarTransv:   '#b45309',
  rebarGhost:    '#cbd5e1',
  pivot:         '#0284c7',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function Arrow({
  x1, y1, x2, y2, color, sw = 1, head = 6, opacity = 1,
}: {
  x1: number; y1: number; x2: number; y2: number;
  color: string; sw?: number; head?: number; opacity?: number;
}) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1) return null;
  const ux = dx / len;
  const uy = dy / len;
  const hx = x2 - ux * head;
  const hy = y2 - uy * head;
  const px = -uy * head * 0.45;
  const py = ux * head * 0.45;
  return (
    <g opacity={opacity}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={sw} strokeLinecap="round" />
      <polygon points={`${x2},${y2} ${hx + px},${hy + py} ${hx - px},${hy - py}`} fill={color} />
    </g>
  );
}

// jsPDF/svg2pdf renders SVG <text> nodes via Helvetica WinAnsi, which has no
// Greek glyphs and treats UTF-8 bytes as Latin-1 (turning ó into Ã³, σ into Ã,
// W₁ into W•, etc). When mode='pdf', swap non-WinAnsi chars for ASCII so the
// resulting PDF stays legible. Screen mode keeps the original glyphs.
function svgText(s: string, isPdf: boolean): string {
  if (!isPdf) return s;
  return s
    .replace(/σ/g, 'sigma').replace(/Σ/g, 'Sum')
    .replace(/Δ/g, 'D').replace(/δ/g, 'd')
    .replace(/γ/g, 'g').replace(/φ/g, 'phi')
    .replace(/μ/g, 'mu').replace(/λ/g, 'lam')
    .replace(/τ/g, 't').replace(/θ/g, 'th')
    .replace(/η/g, 'eta').replace(/ε/g, 'eps').replace(/β/g, 'beta')
    .replace(/₁/g, '1').replace(/₂/g, '2').replace(/₃/g, '3').replace(/₄/g, '4')
    .replace(/²/g, '2').replace(/³/g, '3')
    .replace(/Ø/g, 'ph').replace(/°/g, 'deg').replace(/·/g, '.')
    .replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i').replace(/ó/g, 'o').replace(/ú/g, 'u').replace(/ñ/g, 'n')
    .replace(/Á/g, 'A').replace(/É/g, 'E').replace(/Í/g, 'I').replace(/Ó/g, 'O').replace(/Ú/g, 'U').replace(/Ñ/g, 'N')
    .replace(/[\u2014\u2013]/g, '-')
    .replace(/[^\x00-\x7F]/g, '?');
}

interface GeomDims {
  H: number; hf: number; t: number; bP: number; bT: number; df: number;
  Htot: number; B: number; dEmb: number;
  scale: number; ox: number; oy: number;
  x_toe: number; x_stemL: number; x_stemR: number; x_heel: number;
  y_top: number; y_fb: number; y_b: number;
  /** y of front-side ground surface (above the toe). Equals y_fb when df=0. */
  y_front_ground: number;
}

function computeGeom(
  inp: RetainingWallInputs,
  width: number,
  height: number,
  margin: { top: number; right: number; bottom: number; left: number },
): GeomDims {
  const H = inp.H as number;
  const hf = inp.hf as number;
  const t = inp.tFuste as number;
  const bP = inp.bPunta as number;
  const bT = inp.bTalon as number;
  const df = Math.max(inp.df as number, 0);
  const Htot = H + hf;
  const B = bP + t + bT;
  const dEmb = df + hf;  // total front embedment (passive height)

  const drawW = width - margin.left - margin.right;
  const drawH = height - margin.top - margin.bottom;
  const scale = Math.min(B > 0 ? drawW / B : drawW, Htot > 0 ? drawH / Htot : drawH);
  const ox = margin.left + (drawW - B * scale) / 2;
  const oy = margin.top + (drawH - Htot * scale) / 2;
  const y_fb = oy + H * scale;

  return {
    H, hf, t, bP, bT, df, Htot, B, dEmb, scale, ox, oy,
    x_toe:   ox,
    x_stemL: ox + bP * scale,
    x_stemR: ox + (bP + t) * scale,
    x_heel:  ox + B * scale,
    y_top:   oy,
    y_fb,
    y_b:     oy + Htot * scale,
    y_front_ground: y_fb - df * scale,
  };
}

// Title chip in top-left of SVG
function TitleChip({
  label, dotColor, w = 135, P,
}: { label: string; dotColor: string; w?: number; P: Palette }) {
  return (
    <g>
      <rect x={14} y={14} width={w} height={20} rx={3} fill={P.chipBg === '#0b1220' ? '#111a2d' : '#f8fafc'} stroke={P.chipBorder} />
      <circle cx={24} cy={24} r={3} fill={dotColor} />
      <text x={32} y={27.5} fontSize={10} fontFamily="'Geist Sans', sans-serif"
        fontWeight={600} fill={P.label} letterSpacing="0.05em">{label}</text>
    </g>
  );
}

// Adaptive horizontal dimension chip
function HDim({
  x1, x2, y, label, sub, off = 26, chipW = 52, P, isPdf = false,
}: {
  x1: number; x2: number; y: number; label: string; sub?: string | null;
  off?: number; chipW?: number; P: Palette; isPdf?: boolean;
}) {
  const lbl = svgText(label, isPdf);
  const subSafe = sub ? svgText(sub, isPdf) : sub;
  const yy = y + off;
  const segPx = Math.abs(x2 - x1);
  const inline = segPx >= chipW + 6;
  const arrowsInside = segPx >= 14;
  const a1x1 = arrowsInside ? x1 : x1 - 8;
  const a2x2 = arrowsInside ? x2 : x2 + 8;
  return (
    <g>
      <line x1={x1} y1={y + 4} x2={x1} y2={yy + 6} stroke={P.dim} strokeWidth={0.7} />
      <line x1={x2} y1={y + 4} x2={x2} y2={yy + 6} stroke={P.dim} strokeWidth={0.7} />
      <line x1={Math.min(a1x1, a2x2)} y1={yy} x2={Math.max(a1x1, a2x2)} y2={yy}
        stroke={P.dim} strokeWidth={0.8} />
      {arrowsInside ? (
        <>
          <polygon points={`${x1},${yy} ${x1 + 5},${yy - 2.5} ${x1 + 5},${yy + 2.5}`} fill={P.dim} />
          <polygon points={`${x2},${yy} ${x2 - 5},${yy - 2.5} ${x2 - 5},${yy + 2.5}`} fill={P.dim} />
        </>
      ) : (
        <>
          <polygon points={`${x1},${yy} ${x1 - 4},${yy - 2.5} ${x1 - 4},${yy + 2.5}`} fill={P.dim} />
          <polygon points={`${x2},${yy} ${x2 + 4},${yy - 2.5} ${x2 + 4},${yy + 2.5}`} fill={P.dim} />
        </>
      )}
      {inline ? (
        <>
          <rect x={(x1 + x2) / 2 - chipW / 2} y={yy - 9} width={chipW} height={14} rx={2} fill={P.chipBg} />
          <text x={(x1 + x2) / 2} y={yy + 1} fontSize={10} fill={P.label} textAnchor="middle"
            fontFamily="ui-monospace, 'Geist Mono', monospace">{lbl}</text>
          {subSafe && (
            <text x={(x1 + x2) / 2} y={yy + 14} fontSize={8.5} fill={P.dim} textAnchor="middle"
              fontFamily="ui-monospace, 'Geist Mono', monospace">{subSafe}</text>
          )}
        </>
      ) : (
        <>
          <line x1={(x1 + x2) / 2} y1={yy} x2={(x1 + x2) / 2} y2={yy - 14} stroke={P.dim} strokeWidth={0.5} />
          <rect x={(x1 + x2) / 2 - chipW / 2} y={yy - 27} width={chipW} height={14} rx={2}
            fill={P.chipBg} stroke={P.chipBorder} strokeWidth={0.5} />
          <text x={(x1 + x2) / 2} y={yy - 17} fontSize={10} fill={P.label} textAnchor="middle"
            fontFamily="ui-monospace, 'Geist Mono', monospace">{lbl}</text>
        </>
      )}
    </g>
  );
}

function VDim({
  y1, y2, x, label, sub, side = 'left', off = 26, P, isPdf = false,
}: {
  y1: number; y2: number; x: number; label: string; sub?: string;
  side?: 'left' | 'right'; off?: number; P: Palette; isPdf?: boolean;
}) {
  const lbl = svgText(label, isPdf);
  const subSafe = sub ? svgText(sub, isPdf) : sub;
  const xx = side === 'left' ? x - off : x + off;
  const tickInner = side === 'left' ? x - 4 : x + 4;
  const tickOuter = side === 'left' ? xx - 6 : xx + 6;
  return (
    <g>
      <line x1={tickInner} y1={y1} x2={tickOuter} y2={y1} stroke={P.dim} strokeWidth={0.7} />
      <line x1={tickInner} y1={y2} x2={tickOuter} y2={y2} stroke={P.dim} strokeWidth={0.7} />
      <line x1={xx} y1={y1} x2={xx} y2={y2} stroke={P.dim} strokeWidth={0.8} />
      <polygon points={`${xx},${y1} ${xx - 2.5},${y1 + 5} ${xx + 2.5},${y1 + 5}`} fill={P.dim} />
      <polygon points={`${xx},${y2} ${xx - 2.5},${y2 - 5} ${xx + 2.5},${y2 - 5}`} fill={P.dim} />
      <rect x={xx - 22} y={(y1 + y2) / 2 - 8} width={44} height={14} rx={2} fill={P.chipBg} />
      <text x={xx} y={(y1 + y2) / 2 + 2} fontSize={10} fill={P.label} textAnchor="middle"
        fontFamily="ui-monospace, 'Geist Mono', monospace">{lbl}</text>
      {subSafe && (
        <text x={xx} y={(y1 + y2) / 2 + 14} fontSize={8.5} fill={P.dim} textAnchor="middle"
          fontFamily="ui-monospace, 'Geist Mono', monospace">{subSafe}</text>
      )}
    </g>
  );
}

// ─── View 1: GEOMETRY ───────────────────────────────────────────────────────

function GeometryView({ inp, mode, width, height }: Required<Omit<RetainingWallSVGProps, 'view' | 'result'>>) {
  const isPdf = mode === 'pdf';
  const P = isPdf ? PDF_PALETTE : SCREEN_PALETTE;
  const margin = { top: 56, right: 110, bottom: 112, left: 110 };
  const g = computeGeom(inp, width, height, margin);

  // Visual fallback when bT = 0 — a wall without heel still retains soil
  // behind it. Reserve a fixed pixel band so the soil block, ground line and
  // surface tufts remain visible (matches LoadsView convention).
  const noHeel = g.bT <= 0;
  const heelRenderPx = noHeel ? 70 : g.x_heel - g.x_stemR;
  const x_heel_v = g.x_stemR + heelRenderPx;

  const soilPath = `M ${g.x_stemR} ${g.y_top} L ${x_heel_v} ${g.y_top} L ${x_heel_v} ${g.y_fb} L ${g.x_stemR} ${g.y_fb} Z`;

  return (
    <svg
      width={width} height={height} viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}
      aria-label="Geometría del muro de contención" role="img"
    >
      <title>Muro de contención — geometría</title>
      <defs>
        <pattern id="rw-geom-soil" patternUnits="userSpaceOnUse" width={9} height={9}>
          <line x1={0} y1={9} x2={9} y2={0} stroke={P.soilLine} strokeWidth={0.6} opacity={0.45} />
          <circle cx={2} cy={3} r={0.5} fill={P.soilDot} opacity={0.6} />
          <circle cx={6} cy={7} r={0.4} fill={P.soilDot} opacity={0.5} />
        </pattern>
        <linearGradient id="rw-geom-soil-grad" x1={0} y1={0} x2={0} y2={1}>
          <stop offset="0" stopColor={P.soilFillTop} />
          <stop offset="1" stopColor={P.soilFillBot} />
        </linearGradient>
      </defs>

      {!isPdf && <TitleChip label="GEOMETRÍA" dotColor={P.pivot} w={135} P={P} />}
      <text x={width - 14} y={27} fontSize={9.5} textAnchor="end"
        fill={P.dim} fontFamily="ui-monospace, 'Geist Mono', monospace">{svgText('SECCIÓN · 1 m ANCHO', isPdf)}</text>

      {/* Soil on heel side */}
      <path d={soilPath} fill="url(#rw-geom-soil-grad)" />
      <path d={soilPath} fill="url(#rw-geom-soil)" />
      <line x1={g.x_stemR} y1={g.y_top} x2={x_heel_v + 28} y2={g.y_top} stroke={P.ground} strokeWidth={1.4} />
      {Array.from({ length: 6 }).map((_, i) => {
        const xx = g.x_stemR + 8 + (i * (x_heel_v - g.x_stemR - 8)) / 6;
        return <line key={`tuft-r-${i}`} x1={xx} y1={g.y_top} x2={xx + 3} y2={g.y_top - 4} stroke={P.ground} strokeWidth={0.9} />;
      })}

      {/* Front side ground (toe side). When df > 0, the front ground line is
          raised above the top of the footing and a soil column sits over the
          toe — that column adds stabilizing weight in the calc engine. */}
      {g.df > 0.001 && (
        <>
          <path d={`M ${g.x_toe} ${g.y_front_ground} L ${g.x_stemL} ${g.y_front_ground} L ${g.x_stemL} ${g.y_fb} L ${g.x_toe} ${g.y_fb} Z`}
            fill="url(#rw-geom-soil-grad)" />
          <path d={`M ${g.x_toe} ${g.y_front_ground} L ${g.x_stemL} ${g.y_front_ground} L ${g.x_stemL} ${g.y_fb} L ${g.x_toe} ${g.y_fb} Z`}
            fill="url(#rw-geom-soil)" />
        </>
      )}
      <line x1={g.x_toe - 28} y1={g.y_front_ground} x2={g.x_stemL} y2={g.y_front_ground}
        stroke={P.ground} strokeWidth={1.4} />
      {Array.from({ length: 3 }).map((_, i) => {
        const xx = g.x_toe - 18 + i * 14;
        return <line key={`tuft-f-${i}`} x1={xx} y1={g.y_front_ground} x2={xx + 3} y2={g.y_front_ground - 3} stroke={P.ground} strokeWidth={0.9} />;
      })}

      {/* Footing */}
      <rect x={g.x_toe} y={g.y_fb} width={g.x_heel - g.x_toe} height={g.y_b - g.y_fb}
        fill={P.concreteFill} stroke={P.concreteEdge} strokeWidth={1.3} />

      {/* Stem (rectangular — tFuste at top and bottom) */}
      <rect x={g.x_stemL} y={g.y_top} width={g.x_stemR - g.x_stemL} height={g.y_fb - g.y_top}
        fill={P.concreteFill} stroke={P.concreteEdge} strokeWidth={1.3} />

      {/* Centerline */}
      <line
        x1={(g.x_stemL + g.x_stemR) / 2} y1={g.y_top - 12}
        x2={(g.x_stemL + g.x_stemR) / 2} y2={g.y_b + 8}
        stroke={P.pivot} strokeOpacity={0.35} strokeWidth={0.7} strokeDasharray="3 3"
      />

      {/* Vertical dimensions */}
      <VDim y1={g.y_top} y2={g.y_fb} x={g.x_stemL - 6} side="left"
        label={`H = ${g.H.toFixed(2)} m`} sub="alzado fuste" off={48} P={P} isPdf={isPdf} />
      <VDim y1={g.y_fb} y2={g.y_b} x={g.x_toe - 6} side="left"
        label={`hf = ${g.hf.toFixed(2)} m`} sub="canto zapata" off={48} P={P} isPdf={isPdf} />
      {g.df > 0.001 && (
        <VDim y1={g.y_front_ground} y2={g.y_fb} x={g.x_toe - 6} side="left"
          label={`df = ${g.df.toFixed(2)} m`} sub="empot. frontal" off={48} P={P} isPdf={isPdf} />
      )}
      <VDim y1={g.y_top} y2={g.y_b} x={g.x_heel + 6} side="right"
        label={`Htot = ${g.Htot.toFixed(2)} m`} off={56} P={P} isPdf={isPdf} />

      {/* Horizontal segment chips */}
      {(() => {
        const segs = [
          { x1: g.x_toe,   x2: g.x_stemL, label: `bP = ${g.bP.toFixed(2)}`, sub: 'punta',      key: 'bp' },
          { x1: g.x_stemL, x2: g.x_stemR, label: `t = ${g.t.toFixed(2)}`,   sub: 'fuste',      key: 't'  },
          { x1: g.x_stemR, x2: g.x_heel,  label: `bT = ${g.bT.toFixed(2)}`, sub: 'talón',      key: 'bt' },
        ];
        const chipFor = (x1: number, x2: number) => Math.max(40, Math.min(58, Math.abs(x2 - x1) - 4));
        let floatRow = 0;
        return segs.map((s) => {
          const segPx = Math.abs(s.x2 - s.x1);
          const cw = chipFor(s.x1, s.x2);
          const inline = segPx >= cw + 6;
          const off = inline ? 26 : 26 + (floatRow++ % 2 === 0 ? 0 : 16);
          return (
            <HDim key={s.key} x1={s.x1} x2={s.x2} y={g.y_b}
              label={s.label} sub={inline ? s.sub : null} off={off} chipW={cw} P={P} isPdf={isPdf} />
          );
        });
      })()}
      <HDim x1={g.x_toe} x2={g.x_heel} y={g.y_b}
        label={`B = ${g.B.toFixed(2)} m`} sub="ancho total" off={72} chipW={70} P={P} isPdf={isPdf} />

      {/* Part labels (faint) */}
      <text x={(g.x_stemL + g.x_stemR) / 2} y={(g.y_top + g.y_fb) / 2 + 3}
        fontSize={11} fill={P.dim} textAnchor="middle"
        fontFamily="'Geist Sans', sans-serif" letterSpacing="0.15em">FUSTE</text>
      <text x={(g.x_toe + g.x_heel) / 2} y={(g.y_fb + g.y_b) / 2 + 3}
        fontSize={10} fill={P.dim} textAnchor="middle"
        fontFamily="'Geist Sans', sans-serif" letterSpacing="0.15em">ZAPATA</text>
      {g.bT > 0.3 && (
        <text x={(g.x_stemR + g.x_heel) / 2} y={(g.y_top + g.y_fb) / 2 + 4}
          fontSize={9} fill={P.text} textAnchor="middle" opacity={0.55}
          fontFamily="'Geist Sans', sans-serif" letterSpacing="0.1em">RELLENO</text>
      )}

      {/* Coordinate origin marker (toe) */}
      <g>
        <circle cx={g.x_toe} cy={g.y_b} r={3.2} fill={P.pivot} />
        <circle cx={g.x_toe} cy={g.y_b} r={6} fill="none" stroke={P.pivot} strokeWidth={0.7} opacity={0.4} />
        <text x={g.x_toe - 6} y={g.y_b + 18} fontSize={9} fill={P.pivot}
          textAnchor="middle" fontFamily="ui-monospace, 'Geist Mono', monospace">O</text>
      </g>
    </svg>
  );
}

// ─── View 2: LOADS ──────────────────────────────────────────────────────────

function LoadsView({ inp, result, mode, width, height }: Required<Omit<RetainingWallSVGProps, 'view'>>) {
  const { system } = useUnitSystem();
  const isPdf = mode === 'pdf';
  const P = isPdf ? PDF_PALETTE : SCREEN_PALETTE;
  const sigmaText = (kpa: number) => formatQuantity(kpa, 'soilPressure', system, { precision: 3 });
  const qText        = (v: number) => formatQuantity(v, 'areaLoad',   system, { precision: system === 'si' ? 0 : 0 });
  const linearText   = (v: number) => formatQuantity(v, 'linearLoad', system, { precision: system === 'si' ? 1 : 0 });
  const margin = { top: 56, right: 86, bottom: 170, left: 86 };
  const g = computeGeom(inp, width, height, margin);

  // Visual fallback when bTalon = 0 — a wall without heel still retains soil
  // and develops earth pressure on the back of the stem. Without a heel slab
  // we have no scaled "behind-the-wall" width to anchor the soil block, ground
  // line, surcharge, water, and empuje arrows. Reserve a fixed pixel band so
  // those elements stay visible.
  const noHeel = g.bT <= 0;
  const heelRenderPx = noHeel ? 70 : g.x_heel - g.x_stemR;
  const x_heel_v = g.x_stemR + heelRenderPx;

  const Ka = result.valid ? result.Ka : 0.333;
  const gammaSoil = inp.gammaSuelo as number;
  const gammaSat = inp.gammaSat as number;
  const q = inp.q as number;
  const hw = inp.hw as number;
  const hasWater = (inp.hasWater as boolean) && hw < g.Htot;
  const kh = (inp.S as number) * (inp.Ab as number);
  const hasSeismic = result.valid ? result.kh_derived > 0 : kh > 0;

  const y_nf = g.oy + Math.min(hw, g.Htot) * g.scale;
  const h_dry = hasWater ? Math.min(hw, g.H) : g.H;
  const gamma_sub = gammaSat - 10;

  const p_at = (z: number) => {
    if (!hasWater || z <= h_dry) return Ka * gammaSoil * z + Ka * q;
    const z_sub = z - h_dry;
    return Ka * gammaSoil * h_dry + Ka * gamma_sub * z_sub + Ka * q;
  };
  const p_max_earth = Math.max(p_at(g.H), 0.001);
  const arrowMax = Math.min(heelRenderPx * 0.85, 70);

  // Earth-pressure envelope (right of trasdós)
  const envPoints: string[] = [];
  envPoints.push(`${g.x_stemR},${g.y_top}`);
  for (let i = 0; i <= 16; i++) {
    const z = (g.H * i) / 16;
    const p = p_at(z);
    const len = (p / p_max_earth) * arrowMax;
    envPoints.push(`${g.x_stemR + len},${g.y_top + z * g.scale}`);
  }
  envPoints.push(`${g.x_stemR},${g.y_fb}`);

  // Earth arrows
  const N_earth = 10;
  const earthArrows: Array<{ y: number; len: number }> = [];
  for (let i = 0; i < N_earth; i++) {
    const z = (g.H * i) / (N_earth - 1);
    const p = p_at(z);
    const len = (p / p_max_earth) * arrowMax;
    earthArrows.push({ y: g.y_top + z * g.scale, len });
  }

  // Hydro envelope + arrows
  const hydroEnv: string[] = [];
  const hydroArrows: Array<{ y: number; len: number }> = [];
  let arrowMaxW = 0;
  if (hasWater) {
    const h_wet = g.H - Math.min(hw, g.H);
    const ew_max = Math.max(10 * h_wet, 0.001);
    arrowMaxW = Math.min(heelRenderPx * 0.6, 50);
    if (h_wet > 0.01) {
      hydroEnv.push(`${g.x_stemR},${y_nf}`);
      for (let i = 0; i <= 12; i++) {
        const zw = (h_wet * i) / 12;
        const p = 10 * zw;
        const len = (p / ew_max) * arrowMaxW;
        const z = Math.min(hw, g.H) + zw;
        hydroEnv.push(`${g.x_stemR + len},${g.y_top + z * g.scale}`);
      }
      hydroEnv.push(`${g.x_stemR},${g.y_fb}`);
    }
    const Nh = 6;
    for (let i = 0; i < Nh; i++) {
      const zw = (h_wet * i) / (Nh - 1);
      const p = 10 * zw;
      const len = (p / ew_max) * arrowMaxW;
      const z = Math.min(hw, g.H) + zw;
      hydroArrows.push({ y: g.y_top + z * g.scale, len });
    }
  }

  // Surcharge
  const surchargeArrows: number[] = [];
  if (q > 0) {
    const surchargeN = 6;
    for (let i = 0; i < surchargeN; i++) {
      surchargeArrows.push(g.x_stemR + 6 + (i * (x_heel_v - g.x_stemR - 12)) / (surchargeN - 1));
    }
  }

  // Reaction trapezoid + sample arrows
  const sigma_max = result.valid ? result.sigma_max : 0;
  const sigma_min = result.valid ? result.sigma_min : 0;
  const e_ecc = result.valid ? result.e : 0;
  const a_eff = e_ecc <= g.B / 6 ? g.B : Math.max(3 * (g.B / 2 - e_ecc), 0);
  const reactionMaxPx = Math.min(g.hf * g.scale * 1.4, 56);
  const sig_ref = Math.max(sigma_max, 1);
  const r_max = reactionMaxPx;
  const r_min = (sigma_min / sig_ref) * reactionMaxPx;
  const rx1 = g.x_toe;
  const rx2 = g.x_toe + a_eff * g.scale;
  const reactionPoly = `${rx1},${g.y_b} ${rx2},${g.y_b} ${rx2},${g.y_b + r_min} ${rx1},${g.y_b + r_max}`;
  const reactionArrows: Array<{ x: number; len: number }> = [];
  if (sigma_max > 0 && rx2 > rx1) {
    const Nr = 8;
    for (let i = 0; i < Nr; i++) {
      const xx = rx1 + (rx2 - rx1) * (i / (Nr - 1));
      const t01 = (xx - rx1) / Math.max(rx2 - rx1, 1);
      const len = r_max + (r_min - r_max) * t01;
      if (len > 1) reactionArrows.push({ x: xx, len });
    }
  }

  // Weights
  const W_stem_x = (g.x_stemL + g.x_stemR) / 2;
  const W_foot_x = (g.x_toe + g.x_heel) / 2;
  const W_soil_x = (g.x_stemR + g.x_heel) / 2;

  // Passive resistance — the user opts in via inp.usePassive. When enabled
  // (and result is valid) we draw a real triangle of pressure over the
  // embedment height (df + hf) acting on the front face of the wall, plus
  // a chip with the Ep value. When disabled we still hint at it.
  const usePassive = (inp.usePassive as boolean) === true;
  const dEmb       = g.dEmb;
  const ep_y_top   = g.y_front_ground;
  const ep_y_bot   = g.y_b;
  const ep_max_w   = Math.min(48, Math.max(20, dEmb * g.scale * 0.55));
  // Resultant of triangle is at dEmb/3 above base
  const ep_res_y   = ep_y_bot - (dEmb / 3) * g.scale;

  // Earth resultant Ea — labelled at H/3 from base (2/3 from top)
  const Ea_y = g.y_top + g.H * g.scale * (2 / 3);

  return (
    <svg
      width={width} height={height} viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}
      aria-label="Cargas y empujes" role="img"
    >
      <title>Muro de contención — cargas y empujes</title>
      <defs>
        <pattern id="rw-loads-soil" patternUnits="userSpaceOnUse" width={9} height={9}>
          <line x1={0} y1={9} x2={9} y2={0} stroke={P.soilLine} strokeWidth={0.6} opacity={0.45} />
          <circle cx={2} cy={3} r={0.5} fill={P.soilDot} opacity={0.55} />
          <circle cx={6} cy={7} r={0.4} fill={P.soilDot} opacity={0.45} />
        </pattern>
        <pattern id="rw-loads-water" patternUnits="userSpaceOnUse" width={6} height={6}>
          <path d="M 0 4 Q 1.5 2 3 4 T 6 4" stroke={P.water} strokeWidth={0.5} fill="none" opacity={0.45} />
        </pattern>
        <linearGradient id="rw-loads-soil-grad" x1={0} y1={0} x2={0} y2={1}>
          <stop offset="0" stopColor={P.soilFillTop} />
          <stop offset="1" stopColor={P.soilFillBot} />
        </linearGradient>
      </defs>

      {!isPdf && <TitleChip label="CARGAS Y EMPUJES" dotColor={P.seismic} w={155} P={P} />}
      <text x={width - 14} y={27} fontSize={9.5} textAnchor="end"
        fill={P.dim} fontFamily="ui-monospace, 'Geist Mono', monospace">
        Ka = {Ka.toFixed(3)}
      </text>

      {/* Soil on heel — when bTalon=0 we still render a behind-the-wall band so
          the empuje and surcharge have visual context. */}
      <path d={`M ${g.x_stemR} ${g.y_top} L ${x_heel_v} ${g.y_top} L ${x_heel_v} ${g.y_fb} L ${g.x_stemR} ${g.y_fb} Z`}
        fill="url(#rw-loads-soil-grad)" />
      <path d={`M ${g.x_stemR} ${g.y_top} L ${x_heel_v} ${g.y_top} L ${x_heel_v} ${g.y_fb} L ${g.x_stemR} ${g.y_fb} Z`}
        fill="url(#rw-loads-soil)" />
      <line x1={g.x_stemR} y1={g.y_top} x2={x_heel_v} y2={g.y_top} stroke={P.ground} strokeWidth={1.4} />

      {/* Soil column above toe (front-side embedment df > 0). */}
      {g.df > 0.001 && (
        <>
          <path d={`M ${g.x_toe} ${g.y_front_ground} L ${g.x_stemL} ${g.y_front_ground} L ${g.x_stemL} ${g.y_fb} L ${g.x_toe} ${g.y_fb} Z`}
            fill="url(#rw-loads-soil-grad)" />
          <path d={`M ${g.x_toe} ${g.y_front_ground} L ${g.x_stemL} ${g.y_front_ground} L ${g.x_stemL} ${g.y_fb} L ${g.x_toe} ${g.y_fb} Z`}
            fill="url(#rw-loads-soil)" />
        </>
      )}
      <line x1={g.x_toe - 28} y1={g.y_front_ground} x2={g.x_stemL} y2={g.y_front_ground}
        stroke={P.ground} strokeWidth={1.2} opacity={0.85} />

      {/* Water-filled portion below NF */}
      {hasWater && (
        <>
          <rect x={g.x_stemR} y={y_nf} width={x_heel_v - g.x_stemR} height={g.y_fb - y_nf}
            fill="url(#rw-loads-water)" opacity={0.6} />
          <line x1={g.x_stemR} y1={y_nf} x2={x_heel_v} y2={y_nf}
            stroke={P.water} strokeWidth={1.1} strokeDasharray="6 3" />
          <polygon points={`${x_heel_v + 4},${y_nf} ${x_heel_v + 12},${y_nf - 5} ${x_heel_v + 12},${y_nf + 5}`}
            fill={P.water} opacity={0.85} />
          <text x={x_heel_v + 16} y={y_nf + 3} fontSize={9.5} fill={P.water}
            fontFamily="ui-monospace, 'Geist Mono', monospace">NF</text>
        </>
      )}

      {/* Surcharge q */}
      {q > 0 && (
        <>
          <line x1={g.x_stemR} y1={g.y_top - 18} x2={x_heel_v} y2={g.y_top - 18}
            stroke={P.surcharge} strokeWidth={0.9} />
          {surchargeArrows.map((xx, i) => (
            <Arrow key={`sa-${i}`} x1={xx} y1={g.y_top - 16} x2={xx} y2={g.y_top - 4}
              color={P.surcharge} sw={0.9} head={4} opacity={0.95} />
          ))}
          <text x={(g.x_stemR + x_heel_v) / 2} y={g.y_top - 22} fontSize={10} fill={P.surcharge}
            textAnchor="middle" fontFamily="ui-monospace, 'Geist Mono', monospace">
            {svgText(`q = ${qText(q)}`, isPdf)}
          </text>
        </>
      )}

      {/* Earth pressure envelope + arrows */}
      <polygon points={envPoints.join(' ')} fill={P.earth} fillOpacity={0.1}
        stroke={P.earth} strokeWidth={0.8} strokeOpacity={0.6} />
      {earthArrows.map((a, i) =>
        a.len > 1 ? (
          <Arrow key={`ea-${i}`} x1={g.x_stemR + a.len} y1={a.y} x2={g.x_stemR} y2={a.y}
            color={P.earth} sw={1.0} head={5} />
        ) : null
      )}
      {/* Ea label */}
      <g>
        <line x1={g.x_stemR + arrowMax + 4} y1={Ea_y} x2={g.x_stemR + 6} y2={Ea_y}
          stroke={P.earth} strokeWidth={1.6} />
        <polygon points={`${g.x_stemR + 6},${Ea_y} ${g.x_stemR + 11},${Ea_y - 3} ${g.x_stemR + 11},${Ea_y + 3}`} fill={P.earth} />
        <rect x={g.x_stemR + arrowMax + 8} y={Ea_y - 9} width={100} height={14} rx={2}
          fill={P.chipBg} stroke={P.chipBorder} strokeWidth={0.5} />
        <text x={g.x_stemR + arrowMax + 58} y={Ea_y + 1} fontSize={9} fill={P.earth}
          textAnchor="middle" fontFamily="ui-monospace, 'Geist Mono', monospace">
          Ea = {result.valid ? linearText(result.EAH_total) : (isPdf ? '-' : '—')}
        </text>
      </g>

      {/* Hydro envelope + arrows + Ew label */}
      {hasWater && hydroEnv.length > 0 && (
        <>
          <polygon points={hydroEnv.join(' ')} fill={P.water} fillOpacity={0.13}
            stroke={P.water} strokeWidth={0.7} strokeOpacity={0.6} />
          {hydroArrows.map((a, i) =>
            a.len > 1 ? (
              <Arrow key={`hw-${i}`} x1={g.x_stemR + a.len} y1={a.y} x2={g.x_stemR} y2={a.y}
                color={P.water} sw={0.9} head={4} opacity={0.95} />
            ) : null
          )}
          {(() => {
            const h_wet = g.H - Math.min(hw, g.H);
            if (h_wet < 0.05) return null;
            const Ew_y = g.y_top + (Math.min(hw, g.H) + h_wet * (2 / 3)) * g.scale;
            return (
              <g>
                <line x1={g.x_stemR + arrowMaxW + 4} y1={Ew_y} x2={g.x_stemR + 6} y2={Ew_y}
                  stroke={P.water} strokeWidth={1.4} />
                <polygon points={`${g.x_stemR + 6},${Ew_y} ${g.x_stemR + 11},${Ew_y - 3} ${g.x_stemR + 11},${Ew_y + 3}`} fill={P.water} />
                <rect x={g.x_stemR + arrowMaxW + 8} y={Ew_y - 9} width={100} height={14} rx={2}
                  fill={P.chipBg} stroke={P.chipBorder} strokeWidth={0.5} />
                <text x={g.x_stemR + arrowMaxW + 58} y={Ew_y + 1} fontSize={9} fill={P.water}
                  textAnchor="middle" fontFamily="ui-monospace, 'Geist Mono', monospace">
                  Ew = {result.valid && result.EW !== undefined ? linearText(result.EW) : (isPdf ? '-' : '—')}
                </text>
              </g>
            );
          })()}
        </>
      )}

      {/* Seismic increment */}
      {hasSeismic && (
        <>
          <polygon
            points={`${g.x_stemR},${g.y_top} ${g.x_stemR + arrowMax * 0.45},${g.y_top} ${g.x_stemR},${g.y_fb}`}
            fill={P.seismic} fillOpacity={0.1} stroke={P.seismic} strokeWidth={1} strokeDasharray="4 3" />
          <text x={g.x_stemR + arrowMax * 0.42} y={g.y_top - 4} fontSize={9.5}
            fill={P.seismic} textAnchor="middle" fontFamily="ui-monospace, 'Geist Mono', monospace">
            {svgText('ΔEae · kh', isPdf)} = {kh.toFixed(2)}
          </text>
        </>
      )}

      {/* Footing & stem */}
      <rect x={g.x_toe} y={g.y_fb} width={g.x_heel - g.x_toe} height={g.y_b - g.y_fb}
        fill={P.concreteFill} stroke={P.concreteEdge} strokeWidth={1.3} />
      <rect x={g.x_stemL} y={g.y_top} width={g.x_stemR - g.x_stemL} height={g.y_fb - g.y_top}
        fill={P.concreteFill} stroke={P.concreteEdge} strokeWidth={1.3} />

      {/* Weights */}
      <Arrow x1={W_stem_x} y1={g.y_top + (g.y_fb - g.y_top) * 0.18}
        x2={W_stem_x} y2={g.y_top + (g.y_fb - g.y_top) * 0.55}
        color={P.weight} sw={1.1} head={5} />
      <text x={W_stem_x + 7} y={g.y_top + (g.y_fb - g.y_top) * 0.36 + 3} fontSize={9.5}
        fill={P.weight} fontFamily="ui-monospace, 'Geist Mono', monospace">{isPdf ? 'W1' : 'W₁'}</text>

      <Arrow x1={W_foot_x} y1={g.y_fb + 5} x2={W_foot_x} y2={g.y_b - 6}
        color={P.weight} sw={1.1} head={4} />
      <text x={W_foot_x + 7} y={(g.y_fb + g.y_b) / 2 + 3} fontSize={9}
        fill={P.weight} fontFamily="ui-monospace, 'Geist Mono', monospace">{isPdf ? 'W2' : 'W₂'}</text>

      {g.bT > 0.05 && (
        <>
          <Arrow x1={W_soil_x} y1={g.y_top + (g.y_fb - g.y_top) * 0.2}
            x2={W_soil_x} y2={g.y_top + (g.y_fb - g.y_top) * 0.65}
            color={P.weight} sw={1.1} head={5} opacity={0.8} />
          <text x={W_soil_x + 7} y={g.y_top + (g.y_fb - g.y_top) * 0.42 + 3} fontSize={9.5}
            fill={P.weight} fontFamily="ui-monospace, 'Geist Mono', monospace">{isPdf ? 'W3' : 'W₃'}</text>
        </>
      )}

      {/* Passive resistance — opt-in via inp.usePassive (CTE DB-SE-C §9.3.3).
          When ON: triangle of pressure on the front face of the embedment,
          arrows point INTO the wall (rightward), and a chip shows Ep value.
          When OFF: dashed hint indicating the user chose to ignore Ep. */}
      {usePassive && result.valid && dEmb > 0.001 ? (
        <g>
          <polygon
            points={`${g.x_toe},${ep_y_top} ${g.x_toe},${ep_y_bot} ${g.x_toe - ep_max_w},${ep_y_bot}`}
            fill={P.passive} fillOpacity={0.18}
            stroke={P.passive} strokeWidth={0.9} strokeOpacity={0.85}
          />
          {(() => {
            const N = 6;
            const arrows: Array<{ y: number; len: number }> = [];
            for (let i = 1; i <= N; i++) {
              const t = i / (N + 1);              // 0..1 from top to bottom
              const y = ep_y_top + (ep_y_bot - ep_y_top) * t;
              const len = ep_max_w * t;            // 0 at top, max at bottom
              if (len > 1) arrows.push({ y, len });
            }
            return arrows.map((a, i) => (
              <Arrow key={`ep-${i}`} x1={g.x_toe - a.len} y1={a.y} x2={g.x_toe} y2={a.y}
                color={P.passive} sw={0.95} head={4} opacity={0.95} />
            ));
          })()}
          {/* Resultant Ep label */}
          <line x1={g.x_toe - ep_max_w - 6} y1={ep_res_y} x2={g.x_toe - 4} y2={ep_res_y}
            stroke={P.passive} strokeWidth={1.4} />
          <polygon
            points={`${g.x_toe - 4},${ep_res_y} ${g.x_toe - 9},${ep_res_y - 3} ${g.x_toe - 9},${ep_res_y + 3}`}
            fill={P.passive} />
          <rect x={g.x_toe - ep_max_w - 108} y={ep_res_y - 9} width={100} height={14} rx={2}
            fill={P.chipBg} stroke={P.chipBorder} strokeWidth={0.5} />
          <text x={g.x_toe - ep_max_w - 58} y={ep_res_y + 1} fontSize={9} fill={P.passive}
            textAnchor="middle" fontFamily="ui-monospace, 'Geist Mono', monospace">
            Ep = {result.Ep !== undefined ? linearText(result.Ep) : (isPdf ? '-' : '—')}
          </text>
        </g>
      ) : (
        <g>
          <line x1={g.x_toe - 36} y1={ep_res_y} x2={g.x_toe} y2={ep_res_y}
            stroke={P.passive} strokeWidth={1.2} strokeOpacity={0.35} strokeDasharray="3 3" />
          <text x={g.x_toe - 40} y={ep_res_y - 4} fontSize={9.5}
            fill={P.passive} fillOpacity={0.55} textAnchor="end"
            fontFamily="ui-monospace, 'Geist Mono', monospace">Ep ignorado</text>
        </g>
      )}

      {/* Base reaction trapezoid */}
      {sigma_max > 0 && (
        <>
          <polygon points={reactionPoly} fill={P.reaction} fillOpacity={0.18}
            stroke={P.reaction} strokeWidth={1} />
          {reactionArrows.map((r, i) => (
            <Arrow key={`r-${i}`} x1={r.x} y1={g.y_b + r.len} x2={r.x} y2={g.y_b + 2}
              color={P.reaction} sw={0.9} head={4} opacity={0.85} />
          ))}
          <g>
            <line x1={rx1 - 6} y1={g.y_b + r_max} x2={rx1 + 4} y2={g.y_b + r_max}
              stroke={P.reaction} strokeWidth={0.6} />
            <rect x={rx1 - 110} y={g.y_b + r_max - 7} width={100} height={14} rx={2}
              fill={P.chipBg} stroke={P.chipBorder} strokeWidth={0.5} />
            <text x={rx1 - 60} y={g.y_b + r_max + 3} fontSize={9} fill={P.reaction}
              textAnchor="middle" fontFamily="ui-monospace, 'Geist Mono', monospace">
              {svgText(`σmax = ${sigmaText(sigma_max)}`, isPdf)}
            </text>
          </g>
          <g>
            <rect x={rx2 + 8} y={g.y_b + r_min - 7} width={100} height={14} rx={2}
              fill={P.chipBg} stroke={P.chipBorder} strokeWidth={0.5} />
            <text x={rx2 + 58} y={g.y_b + r_min + 3} fontSize={9} fill={P.reaction}
              textAnchor="middle" fontFamily="ui-monospace, 'Geist Mono', monospace">
              {svgText(`σmin = ${sigmaText(sigma_min)}`, isPdf)}
            </text>
          </g>
        </>
      )}

      {/* Pivot O */}
      <circle cx={g.x_toe} cy={g.y_b} r={3.5} fill={P.pivot} />

      {/* Bottom legend strip */}
      {(() => {
        const items: Array<{ c: string; l: string; dashed?: boolean }> = [
          { c: P.earth,    l: 'Empuje tierras (Ea)' },
          { c: P.water,    l: 'Empuje hidrostático (Ew)' },
          { c: P.seismic,  l: 'Incremento sísmico (ΔEae)', dashed: true },
          { c: P.weight,   l: g.df > 0.001 ? 'Pesos (W₁..W₄)' : 'Pesos (W₁, W₂, W₃)' },
          usePassive
            ? { c: P.passive, l: 'Resistencia pasiva (Ep)' }
            : { c: P.passive, l: 'Resistencia pasiva (ignorada)', dashed: true },
          { c: P.reaction, l: 'Reacción del terreno (σ)' },
        ];
        const rows = 3, padY = 12, lineH = 16;
        const rectH = padY * 2 + (rows - 1) * lineH + 10;
        const rectW = width - 28;
        const rectX = 14;
        const rectY = height - rectH - 14;
        const colW = (rectW - 16) / 2;
        return (
          <g>
            <rect x={rectX} y={rectY} width={rectW} height={rectH} rx={3}
              fill={P.chipBg} fillOpacity={0.6} stroke={P.chipBorder} strokeWidth={0.5} />
            {items.map((row, i) => {
              const col = i % 2;
              const r = Math.floor(i / 2);
              const cx = rectX + 8 + col * colW;
              const cy = rectY + padY + r * lineH + 5;
              return (
                <g key={`leg-${i}`}>
                  <line x1={cx} y1={cy} x2={cx + 14} y2={cy} stroke={row.c} strokeWidth={1.6}
                    strokeDasharray={row.dashed ? '3 2' : undefined} />
                  <text x={cx + 20} y={cy + 3.5} fontSize={9.5} fill={P.text}
                    fontFamily="'Geist Sans', sans-serif">{svgText(row.l, isPdf)}</text>
                </g>
              );
            })}
          </g>
        );
      })()}
    </svg>
  );
}

// ─── View 3: REBAR ──────────────────────────────────────────────────────────

function RebarView({ inp, result, mode, width, height }: Required<Omit<RetainingWallSVGProps, 'view'>>) {
  const isPdf = mode === 'pdf';
  const P = isPdf ? PDF_PALETTE : SCREEN_PALETTE;
  const margin = { top: 50, right: 40, bottom: 110, left: 40 };
  const g = computeGeom(inp, width, height, margin);
  const cover_m = inp.cover as number;
  const cv = cover_m * g.scale;

  const fv_int_d = inp.diam_fv_int as number;
  const fv_int_s = inp.sep_fv_int as number;
  const fv_ext_d = inp.diam_fv_ext as number;
  const fv_ext_s = inp.sep_fv_ext as number;
  const fh_d = inp.diam_fh as number;
  const fh_s_m = (inp.sep_fh as number) / 1000;
  const zs_d = inp.diam_zs as number;
  const zs_s = inp.sep_zs as number;
  const zi_d = inp.diam_zi as number;
  const zi_s = inp.sep_zi as number;
  const zt_inf_d = inp.diam_zt_inf as number;
  const zt_inf_s = inp.sep_zt_inf as number;
  const zt_sup_d = inp.diam_zt_sup as number;
  const zt_sup_s = inp.sep_zt_sup as number;
  const zt_inf_s_m = zt_inf_s / 1000;
  const zt_sup_s_m = zt_sup_s / 1000;

  // Stem horizontal bars (perpendicular to view) — render as dots near both faces
  const stemHorizDots: Array<{ x: number; y: number; side: 'L' | 'R' }> = [];
  if (fh_d > 0 && fh_s_m > 0) {
    const n = Math.max(1, Math.floor(g.H / fh_s_m));
    for (let i = 1; i <= n; i++) {
      const z = i * fh_s_m;
      if (z > g.H - 0.05) break;
      const y = g.y_top + z * g.scale;
      stemHorizDots.push({ x: g.x_stemR - cv - 1, y, side: 'R' });
      stemHorizDots.push({ x: g.x_stemL + cv + 1, y, side: 'L' });
    }
  }

  // Footing transverse bars (perpendicular to view) — dots along top/bottom covers
  const B_m = g.bP + g.t + g.bT;
  const footingZtSupDots: Array<{ x: number; y: number }> = [];
  if (zt_sup_d > 0 && zt_sup_s_m > 0 && B_m > 0) {
    const n = Math.max(1, Math.floor(B_m / zt_sup_s_m));
    for (let i = 1; i <= n; i++) {
      const xm = i * zt_sup_s_m;
      if (xm > B_m - 0.05) break;
      footingZtSupDots.push({ x: g.x_toe + xm * g.scale, y: g.y_fb + cv + 1 });
    }
  }
  const footingZtInfDots: Array<{ x: number; y: number }> = [];
  if (zt_inf_d > 0 && zt_inf_s_m > 0 && B_m > 0) {
    const n = Math.max(1, Math.floor(B_m / zt_inf_s_m));
    for (let i = 1; i <= n; i++) {
      const xm = i * zt_inf_s_m;
      if (xm > B_m - 0.05) break;
      footingZtInfDots.push({ x: g.x_toe + xm * g.scale, y: g.y_b - cv - 1 });
    }
  }

  const trasdosLine = fv_int_d > 0 ? {
    x1: g.x_stemR - cv, y1: g.y_top + 6,
    x2: g.x_stemR - cv, y2: g.y_fb - 4,
    d: fv_int_d, s: fv_int_s,
  } : null;
  const intradosLine = fv_ext_d > 0 ? {
    x1: g.x_stemL + cv, y1: g.y_top + 6,
    x2: g.x_stemL + cv, y2: g.y_fb - 4,
    d: fv_ext_d, s: fv_ext_s,
  } : null;
  const footingTop = zs_d > 0 ? { y: g.y_fb + cv, d: zs_d, s: zs_s } : null;
  const footingBot = zi_d > 0 ? { y: g.y_b - cv, d: zi_d, s: zi_s } : null;

  const hookPath = (x: number, y: number, side: 'L' | 'R'): string => {
    const dy = 18, dx = side === 'R' ? -22 : 22;
    return `M ${x} ${y} q 0 ${dy / 1.2} ${dx / 2} ${dy} t ${dx / 2} ${dy / 3}`;
  };

  const callouts: Array<{ k: string; color: string; label: string; spec: string }> = [];
  if (fv_int_d > 0) callouts.push({ k: 'fv_int', color: P.rebar, label: 'Trasdós (vert.)', spec: `Ø${fv_int_d} c/${fv_int_s}` });
  if (fv_ext_d > 0) callouts.push({ k: 'fv_ext', color: P.rebarSecondary, label: 'Intradós (vert.)', spec: `Ø${fv_ext_d} c/${fv_ext_s}` });
  if (fh_d > 0) callouts.push({ k: 'fh', color: P.rebarTransv, label: 'Horizontal', spec: `Ø${fh_d} c/${inp.sep_fh}` });
  if (zs_d > 0) callouts.push({ k: 'zs', color: P.rebar, label: 'Sup. zapata (talón)', spec: `Ø${zs_d} c/${zs_s}` });
  if (zi_d > 0) callouts.push({ k: 'zi', color: P.rebar, label: 'Inf. zapata (punta)', spec: `Ø${zi_d} c/${zi_s}` });
  if (zt_sup_d > 0) callouts.push({ k: 'zt_sup', color: P.rebarTransv, label: 'Transv. superior', spec: `Ø${zt_sup_d} c/${zt_sup_s}` });
  if (zt_inf_d > 0) callouts.push({ k: 'zt_inf', color: P.rebarTransv, label: 'Transv. inferior', spec: `Ø${zt_inf_d} c/${zt_inf_s}` });

  // Sizing-mode hint when no rebar specified
  const noRebar = callouts.length === 0;
  const elevW = width - margin.left - margin.right;

  // Display cover in mm regardless of internal storage (m)
  const cover_display_mm = Math.round(cover_m * 1000);

  const _result = result; // not strictly needed but keep prop typing
  void _result;

  return (
    <svg
      width={width} height={height} viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}
      aria-label="Armado del muro" role="img"
    >
      <title>Muro de contención — armado</title>
      <defs>
        <pattern id="rw-rebar-conc" patternUnits="userSpaceOnUse" width={6} height={6}>
          <rect width={6} height={6} fill={P.concreteFill} />
          <circle cx={2} cy={2} r={0.4} fill={P.concreteEdge} />
          <circle cx={5} cy={4} r={0.4} fill={P.concreteEdge} />
        </pattern>
      </defs>

      {!isPdf && <TitleChip label="ARMADO" dotColor={P.rebar} w={115} P={P} />}
      <text x={margin.left + elevW / 2} y={27} fontSize={9.5} textAnchor="middle"
        fill={P.dim} fontFamily="ui-monospace, 'Geist Mono', monospace">
        {svgText(`ALZADO · rec. = ${cover_display_mm} mm`, isPdf)}
      </text>

      {/* Footing */}
      <rect x={g.x_toe} y={g.y_fb} width={g.x_heel - g.x_toe} height={g.y_b - g.y_fb}
        fill="url(#rw-rebar-conc)" stroke={P.concreteEdge} strokeWidth={1.2} />
      {/* Stem (rectangular) */}
      <rect x={g.x_stemL} y={g.y_top} width={g.x_stemR - g.x_stemL} height={g.y_fb - g.y_top}
        fill="url(#rw-rebar-conc)" stroke={P.concreteEdge} strokeWidth={1.2} />

      {/* Cover ghost lines */}
      <line x1={g.x_stemR - cv} y1={g.y_top + 4} x2={g.x_stemR - cv} y2={g.y_fb}
        stroke={P.rebarGhost} strokeWidth={0.5} strokeDasharray="2 3" />
      <line x1={g.x_stemL + cv} y1={g.y_top + 4} x2={g.x_stemL + cv} y2={g.y_fb}
        stroke={P.rebarGhost} strokeWidth={0.5} strokeDasharray="2 3" />

      {/* Stem trasdós verticals */}
      {trasdosLine && (
        <g>
          <line x1={trasdosLine.x1} y1={trasdosLine.y1}
            x2={trasdosLine.x2} y2={trasdosLine.y2}
            stroke={P.rebar} strokeWidth={Math.max(1.6, fv_int_d * 0.18)} />
          <path d={hookPath(trasdosLine.x2, trasdosLine.y2, 'R')}
            fill="none" stroke={P.rebar} strokeWidth={Math.max(1.4, fv_int_d * 0.18)} strokeLinecap="round" />
        </g>
      )}
      {/* Stem intradós verticals */}
      {intradosLine && (
        <g>
          <line x1={intradosLine.x1} y1={intradosLine.y1}
            x2={intradosLine.x2} y2={intradosLine.y2}
            stroke={P.rebarSecondary} strokeWidth={Math.max(1.4, fv_ext_d * 0.16)} />
          <path d={hookPath(intradosLine.x2, intradosLine.y2, 'L')}
            fill="none" stroke={P.rebarSecondary} strokeWidth={Math.max(1.2, fv_ext_d * 0.16)} strokeLinecap="round" />
        </g>
      )}

      {/* Horizontal bar dots */}
      <g>
        {stemHorizDots.map((p, i) => (
          <circle key={`hd-${i}`} cx={p.x} cy={p.y}
            r={Math.max(1.1, Math.min(fh_d * g.scale * 0.5, 4.5) / 1.5)} fill={P.rebarTransv} />
        ))}
      </g>

      {/* Footing transverse bar dots (perpendicular to view) */}
      <g>
        {footingZtSupDots.map((p, i) => (
          <circle key={`zts-${i}`} cx={p.x} cy={p.y}
            r={Math.max(1.1, Math.min(zt_sup_d * g.scale * 0.5, 4.5) / 1.5)} fill={P.rebarTransv} />
        ))}
        {footingZtInfDots.map((p, i) => (
          <circle key={`zti-${i}`} cx={p.x} cy={p.y}
            r={Math.max(1.1, Math.min(zt_inf_d * g.scale * 0.5, 4.5) / 1.5)} fill={P.rebarTransv} />
        ))}
      </g>

      {/* Footing top bars (zs) */}
      {footingTop && (
        <g>
          <line x1={g.x_stemR + 2} y1={footingTop.y} x2={g.x_heel - 4} y2={footingTop.y}
            stroke={P.rebar} strokeWidth={Math.max(1.5, zs_d * 0.18)} />
          <path d={`M ${g.x_stemR + 2} ${footingTop.y} q -10 0 -14 -16`}
            fill="none" stroke={P.rebar} strokeWidth={Math.max(1.4, zs_d * 0.18)} strokeLinecap="round" />
        </g>
      )}
      {/* Footing bottom bars (zi) */}
      {footingBot && (
        <g>
          <line x1={g.x_toe + 4} y1={footingBot.y} x2={g.x_stemL - 2} y2={footingBot.y}
            stroke={P.rebar} strokeWidth={Math.max(1.5, zi_d * 0.18)} />
          <path d={`M ${g.x_toe + 4} ${footingBot.y} q -8 0 -10 -10`}
            fill="none" stroke={P.rebar} strokeWidth={Math.max(1.4, zi_d * 0.18)} strokeLinecap="round" />
        </g>
      )}

      {/* Spec callouts */}
      {trasdosLine && (
        <g>
          <line x1={trasdosLine.x1} y1={trasdosLine.y1 + 18} x2={g.x_stemR + 22} y2={g.y_top - 6}
            stroke={P.rebar} strokeWidth={0.5} opacity={0.5} />
          <rect x={g.x_stemR + 22} y={g.y_top - 18} width={92} height={14} rx={2}
            fill={P.chipBg} stroke={P.chipBorder} strokeWidth={0.5} />
          <text x={g.x_stemR + 26} y={g.y_top - 8} fontSize={9.5} fill={P.label}
            fontFamily="ui-monospace, 'Geist Mono', monospace">
            {svgText(`Ø${fv_int_d} c/${fv_int_s}`, isPdf)}
          </text>
        </g>
      )}
      {intradosLine && (
        <g>
          <line x1={intradosLine.x1} y1={(intradosLine.y1 + intradosLine.y2) / 2}
            x2={g.x_stemL - 22} y2={g.y_top + 30}
            stroke={P.rebarSecondary} strokeWidth={0.5} opacity={0.5} />
          <rect x={g.x_stemL - 114} y={g.y_top + 22} width={92} height={14} rx={2}
            fill={P.chipBg} stroke={P.chipBorder} strokeWidth={0.5} />
          <text x={g.x_stemL - 110} y={g.y_top + 32} fontSize={9.5} fill={P.label}
            fontFamily="ui-monospace, 'Geist Mono', monospace">
            {svgText(`Ø${fv_ext_d} c/${fv_ext_s}`, isPdf)}
          </text>
        </g>
      )}
      {footingTop && (
        <g>
          <rect x={(g.x_stemR + g.x_heel) / 2 - 46} y={g.y_fb + cv - 18} width={92} height={14} rx={2}
            fill={P.chipBg} stroke={P.chipBorder} strokeWidth={0.5} />
          <text x={(g.x_stemR + g.x_heel) / 2} y={g.y_fb + cv - 8} fontSize={9.5} fill={P.label}
            textAnchor="middle" fontFamily="ui-monospace, 'Geist Mono', monospace">
            {svgText(`Ø${zs_d} c/${zs_s}`, isPdf)}
          </text>
        </g>
      )}
      {footingBot && (
        <g>
          <rect x={(g.x_toe + g.x_stemL) / 2 - 46} y={g.y_b - cv + 6} width={92} height={14} rx={2}
            fill={P.chipBg} stroke={P.chipBorder} strokeWidth={0.5} />
          <text x={(g.x_toe + g.x_stemL) / 2} y={g.y_b - cv + 16} fontSize={9.5} fill={P.label}
            textAnchor="middle" fontFamily="ui-monospace, 'Geist Mono', monospace">
            {svgText(`Ø${zi_d} c/${zi_s}`, isPdf)}
          </text>
        </g>
      )}

      {/* Sizing-mode hint */}
      {noRebar && (
        <g>
          <rect x={margin.left} y={(g.y_top + g.y_b) / 2 - 14} width={elevW} height={28} rx={3}
            fill={P.chipBg} stroke={P.chipBorder} strokeWidth={0.5} fillOpacity={0.85} />
          <text x={margin.left + elevW / 2} y={(g.y_top + g.y_b) / 2 + 4} fontSize={10}
            fill={P.text} textAnchor="middle" fontFamily="'Geist Sans', sans-serif">
            {svgText('Modo diseño — introduce diámetros y separaciones para visualizar el armado', isPdf)}
          </text>
        </g>
      )}

      {/* Bottom legend strip */}
      {callouts.length > 0 && (() => {
        const rows = Math.ceil(callouts.length / 3);
        const padY = 14, lineH = 18;
        const rectH = padY * 2 + (rows - 1) * lineH + 14;
        const rectX = margin.left;
        const rectW = elevW;
        const rectY = height - rectH - 14;
        const colW = (rectW - 16) / 3;
        return (
          <g>
            <rect x={rectX} y={rectY} width={rectW} height={rectH} rx={3}
              fill={P.chipBg} fillOpacity={0.6} stroke={P.chipBorder} strokeWidth={0.5} />
            <text x={rectX + 8} y={rectY + 12} fontSize={9} fontFamily="'Geist Sans', sans-serif"
              fill={P.dim} letterSpacing="0.07em" fontWeight={600}>LEYENDA</text>
            {callouts.map((c, i) => {
              const col = i % 3;
              const r = Math.floor(i / 3);
              const cx = rectX + 8 + col * colW;
              const cy = rectY + padY + 14 + r * lineH;
              return (
                <g key={c.k}>
                  <circle cx={cx + 4} cy={cy} r={2.8} fill={c.color} />
                  <text x={cx + 12} y={cy + 3.5} fontSize={9} fill={P.label}
                    fontFamily="'Geist Sans', sans-serif">{svgText(c.label, isPdf)}</text>
                  <text x={cx + colW - 8} y={cy + 3.5} fontSize={8.5} fill={P.text} textAnchor="end"
                    fontFamily="ui-monospace, 'Geist Mono', monospace">{svgText(c.spec, isPdf)}</text>
                </g>
              );
            })}
          </g>
        );
      })()}
    </svg>
  );
}

// ─── Public component ──────────────────────────────────────────────────────

export function RetainingWallSVG({
  inp, result, mode = 'screen', width = 560, height = 460, view = 'geometry',
}: RetainingWallSVGProps) {
  const props = { inp, result, mode, width, height };
  switch (view) {
    case 'loads':    return <LoadsView {...props} />;
    case 'rebar':    return <RebarView {...props} />;
    case 'geometry':
    default:         return <GeometryView inp={inp} mode={mode} width={width} height={height} />;
  }
}
