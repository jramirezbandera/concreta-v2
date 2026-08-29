// Muro de escollera / gaviones — tres vistas SVG: geometría, cargas, hiladas.
// mode='screen': paleta de tokens del tema; mode='pdf': paleta de papel para
// jsPDF/svg2pdf (mismo patrón que RetainingWallSVG).

import { type RockfillWallInputs } from '../../data/defaults';
import { type RockfillWallResult } from '../../lib/calculations/rockfillWall';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import { formatQuantity } from '../../lib/units/format';

export type RockfillWallView = 'geometry' | 'loads' | 'hiladas';

interface RockfillWallSVGProps {
  inp: RockfillWallInputs;
  result: RockfillWallResult;
  mode?: 'screen' | 'pdf';
  width?: number;
  height?: number;
  view?: RockfillWallView;
}

// ─── Paletas ────────────────────────────────────────────────────────────────

interface Palette {
  chipBg: string;
  chipBorder: string;
  label: string;
  dim: string;
  rockFill: string;
  rockEdge: string;
  rockLine: string;
  concreteFill: string;
  concreteEdge: string;
  soilFillTop: string;
  soilFillBot: string;
  soilLine: string;
  soilDot: string;
  ground: string;
  earth: string;
  water: string;
  seismic: string;
  weight: string;
  reaction: string;
  surcharge: string;
  ok: string;
  warn: string;
  fail: string;
  pivot: string;
}

const SCREEN_PALETTE: Palette = {
  chipBg: 'var(--color-bg-primary)',
  chipBorder: 'var(--color-border-main)',
  label: 'var(--color-chart-label)',
  dim: 'var(--color-chart-rebar-dim)',
  rockFill: 'var(--color-bg-elevated)',
  rockEdge: 'var(--color-chart-section)',
  rockLine: 'var(--color-text-disabled)',
  concreteFill: 'var(--color-bg-surface)',
  concreteEdge: 'var(--color-chart-section)',
  soilFillTop: 'var(--color-geo-soil-top)',
  soilFillBot: 'var(--color-geo-soil-bot)',
  soilLine: 'var(--color-geo-soil-line)',
  soilDot: 'var(--color-geo-soil-dot)',
  ground: 'var(--color-geo-ground)',
  earth: 'var(--color-geo-earth)',
  water: 'var(--color-accent)',
  seismic: 'var(--color-state-warn)',
  weight: 'var(--color-text-secondary)',
  reaction: 'var(--color-state-ok)',
  surcharge: 'var(--color-state-warn)',
  ok: 'var(--color-state-ok)',
  warn: 'var(--color-state-warn)',
  fail: 'var(--color-state-fail)',
  pivot: 'var(--color-accent)',
};

const PDF_PALETTE: Palette = {
  chipBg: '#ffffff',
  chipBorder: '#cbd5e1',
  label: '#1f2937',
  dim: '#94a3b8',
  rockFill: '#e8e4dc',
  rockEdge: '#475569',
  rockLine: '#8a8577',
  concreteFill: '#f1f5f9',
  concreteEdge: '#475569',
  soilFillTop: '#d6c1a0',
  soilFillBot: '#b89876',
  soilLine: '#8b6e3a',
  soilDot: '#7a5a3a',
  ground: '#5d4630',
  earth: '#6b7280',
  water: '#0ea5e9',
  seismic: '#d97706',
  weight: '#4b5563',
  reaction: '#15803d',
  surcharge: '#b45309',
  ok: '#15803d',
  warn: '#b45309',
  fail: '#b91c1c',
  pivot: '#0284c7',
};

// ─── Helpers (patrón RetainingWallSVG) ──────────────────────────────────────

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

// jsPDF/svg2pdf usa Helvetica WinAnsi: sin glifos griegos ni acentos.
function svgText(s: string, isPdf: boolean): string {
  if (!isPdf) return s;
  return s
    .replace(/σ/g, 'sigma').replace(/Σ/g, 'Sum')
    .replace(/Δ/g, 'D').replace(/δ/g, 'd')
    .replace(/γ/g, 'g').replace(/φ/g, 'phi')
    .replace(/μ/g, 'mu').replace(/α/g, 'a').replace(/β/g, 'beta')
    .replace(/θ/g, 'th')
    .replace(/₁/g, '1').replace(/₂/g, '2').replace(/²/g, '2').replace(/³/g, '3')
    .replace(/Ø/g, 'ph').replace(/°/g, 'deg').replace(/·/g, '.')
    .replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i').replace(/ó/g, 'o').replace(/ú/g, 'u').replace(/ñ/g, 'n')
    .replace(/Á/g, 'A').replace(/É/g, 'E').replace(/Í/g, 'I').replace(/Ó/g, 'O').replace(/Ú/g, 'U').replace(/Ñ/g, 'N')
    .replace(/[—–]/g, '-')
    // eslint-disable-next-line no-control-regex -- intencional: solo ASCII para las core fonts de jsPDF
    .replace(/[^\x00-\x7F]/g, '?');
}

function TitleChip({
  label, dotColor, w = 135, P,
}: { label: string; dotColor: string; w?: number; P: Palette }) {
  return (
    <g>
      <rect x={14} y={14} width={w} height={20} rx={3} fill={P.chipBg} stroke={P.chipBorder} />
      <circle cx={24} cy={24} r={3} fill={dotColor} />
      <text x={32} y={27.5} fontSize={10} fontFamily="'Geist Sans', sans-serif"
        fontWeight={600} fill={P.label} letterSpacing="0.05em">{label}</text>
    </g>
  );
}

function HDim({
  x1, x2, y, label, off = 26, chipW = 52, P, isPdf = false,
}: {
  x1: number; x2: number; y: number; label: string;
  off?: number; chipW?: number; P: Palette; isPdf?: boolean;
}) {
  const lbl = svgText(label, isPdf);
  const yy = y + off;
  const segPx = Math.abs(x2 - x1);
  const inline = segPx >= chipW + 6;
  return (
    <g>
      <line x1={x1} y1={y + 4} x2={x1} y2={yy + 6} stroke={P.dim} strokeWidth={0.7} />
      <line x1={x2} y1={y + 4} x2={x2} y2={yy + 6} stroke={P.dim} strokeWidth={0.7} />
      <line x1={x1} y1={yy} x2={x2} y2={yy} stroke={P.dim} strokeWidth={0.8} />
      <polygon points={`${x1},${yy} ${x1 + 5},${yy - 2.5} ${x1 + 5},${yy + 2.5}`} fill={P.dim} />
      <polygon points={`${x2},${yy} ${x2 - 5},${yy - 2.5} ${x2 - 5},${yy + 2.5}`} fill={P.dim} />
      {inline ? (
        <>
          <rect x={(x1 + x2) / 2 - chipW / 2} y={yy - 9} width={chipW} height={14} rx={2} fill={P.chipBg} />
          <text x={(x1 + x2) / 2} y={yy + 1} fontSize={10} fill={P.label} textAnchor="middle"
            fontFamily="ui-monospace, 'Geist Mono', monospace">{lbl}</text>
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
  y1, y2, x, label, side = 'left', off = 26, P, isPdf = false,
}: {
  y1: number; y2: number; x: number; label: string;
  side?: 'left' | 'right'; off?: number; P: Palette; isPdf?: boolean;
}) {
  const lbl = svgText(label, isPdf);
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
    </g>
  );
}

// ─── Proyección mundo → pantalla ────────────────────────────────────────────
// Mundo: x desde la punta de la puntera (m, + hacia el relleno);
//        y altura sobre la base del cimiento (m).

interface Proj {
  sx: (x: number) => number;
  sy: (y: number) => number;
  scale: number;
  worldW: number;
  Htot: number;
}

function computeProj(
  result: RockfillWallResult,
  width: number,
  height: number,
  margin: { top: number; right: number; bottom: number; left: number },
): Proj {
  const g = result.geom;
  const Htot = g.H + g.hz;
  const worldW = Math.max(g.B, g.xPlane);
  const drawW = width - margin.left - margin.right;
  const drawH = height - margin.top - margin.bottom;
  const scale = Math.min(worldW > 0 ? drawW / worldW : drawW, Htot > 0 ? drawH / Htot : drawH);
  const ox = margin.left + (drawW - worldW * scale) / 2;
  const oy = margin.top + (drawH - Htot * scale) / 2;
  return {
    sx: (x) => ox + x * scale,
    sy: (y) => oy + (Htot - y) * scale,
    scale,
    worldW,
    Htot,
  };
}

/** Contorno del cuerpo (mundo) como lista de puntos [x, y]. */
function bodyOutline(result: RockfillWallResult): Array<[number, number]> {
  const g = result.geom;
  if (g.rows && g.rows.length > 0) {
    // Gaviones: contorno escalonado (frente de abajo arriba, trasdós de arriba abajo)
    const pts: Array<[number, number]> = [];
    for (let i = g.rows.length - 1; i >= 0; i--) {
      const r = g.rows[i];
      pts.push([r.xFront, g.hz + g.H - r.zBot], [r.xFront, g.hz + g.H - r.zTop]);
    }
    for (const r of g.rows) {
      pts.push([r.xBack, g.hz + g.H - r.zTop], [r.xBack, g.hz + g.H - r.zBot]);
    }
    return pts;
  }
  // Escollera: trapecio
  return [
    [g.x0, g.hz],
    [g.x0 + g.mIntra * g.H, g.hz + g.H],
    [g.xb0, g.hz + g.H],
    [g.x0 + g.bBase, g.hz],
  ];
}

function toPath(pts: Array<[number, number]>, p: Proj): string {
  return pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${p.sx(x).toFixed(1)} ${p.sy(y).toFixed(1)}`).join(' ') + ' Z';
}

// ─── Vista 1: GEOMETRÍA ─────────────────────────────────────────────────────

function GeometryView({ inp, result, mode, width, height }: Required<RockfillWallSVGProps>) {
  const isPdf = mode === 'pdf';
  const P = isPdf ? PDF_PALETTE : SCREEN_PALETTE;
  const margin = { top: 56, right: 118, bottom: 96, left: 96 };
  const p = computeProj(result, width, height, margin);
  const g = result.geom;
  const isGavion = inp.wallType === 'gaviones';
  const Htot = g.H + g.hz;

  const body = bodyOutline(result);
  const bodyPath = toPath(body, p);
  const crownY = p.sy(Htot);
  const fdnTopY = p.sy(g.hz);
  const baseY = p.sy(0);
  const soilRight = width - Math.max(margin.right - 70, 12);

  // Superficie del terreno: desde el trasdós de coronación con pendiente β
  const betaTan = Math.tan(((inp.beta as number) * Math.PI) / 180);
  const soilTopAtRight = crownY - (soilRight - p.sx(g.xb0)) * betaTan * (p.scale / p.scale);
  const backSoil = `M ${p.sx(g.xb0)} ${crownY} L ${soilRight} ${soilTopAtRight} L ${soilRight} ${fdnTopY} L ${p.sx(g.bBase + g.x0)} ${fdnTopY} Z`;

  // Hiladas decorativas contrainclinadas (solo escollera)
  const alphaH = ((inp.alphaHiladas as number) * Math.PI) / 180;
  const nHiladas = Math.max(3, Math.round(g.H / 0.8));
  const hiladas: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  if (!isGavion) {
    for (let i = 1; i < nHiladas; i++) {
      const z = (i * g.H) / nHiladas;                       // profundidad desde coronación
      const y = g.hz + g.H - z;
      const xf = g.x0 + g.mIntra * (g.H - z);
      const b = (inp.a as number) + (g.mIntra - g.mTras) * z - 0 * z;
      const xb = xf + Math.max(b, 0.1);
      const dy = Math.tan(alphaH) * (xb - xf);              // sube hacia el trasdós
      hiladas.push({ x1: p.sx(xf), y1: p.sy(y), x2: p.sx(xb), y2: p.sy(y + dy) });
    }
  }

  // Nivel freático
  const hwY = inp.hasWater ? p.sy(Math.max(Htot - (inp.hw as number), 0)) : null;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}
      aria-label="Geometría del muro de escollera" role="img">
      <title>Muro de escollera — geometría</title>
      <defs>
        <pattern id="rk-soil" patternUnits="userSpaceOnUse" width={9} height={9}>
          <line x1={0} y1={9} x2={9} y2={0} stroke={P.soilLine} strokeWidth={0.6} opacity={0.45} />
          <circle cx={2} cy={3} r={0.5} fill={P.soilDot} opacity={0.6} />
          <circle cx={6} cy={7} r={0.4} fill={P.soilDot} opacity={0.5} />
        </pattern>
        <linearGradient id="rk-soil-grad" x1={0} y1={0} x2={0} y2={1}>
          <stop offset="0" stopColor={P.soilFillTop} />
          <stop offset="1" stopColor={P.soilFillBot} />
        </linearGradient>
        <pattern id="rk-rock" patternUnits="userSpaceOnUse" width={16} height={12}>
          <path d="M1 6 L5 2 L9 5 L8 10 L3 10 Z" fill="none" stroke={P.rockLine} strokeWidth={0.7} opacity={0.55} />
          <path d="M10 1 L15 3 L14 8 L10 6 Z" fill="none" stroke={P.rockLine} strokeWidth={0.6} opacity={0.45} />
        </pattern>
        <pattern id="rk-concrete" patternUnits="userSpaceOnUse" width={8} height={8}>
          <line x1={0} y1={8} x2={8} y2={0} stroke={P.concreteEdge} strokeWidth={0.5} opacity={0.35} />
        </pattern>
        <clipPath id="rk-body-clip">
          <path d={bodyPath} />
        </clipPath>
      </defs>

      {!isPdf && <TitleChip label={isGavion ? 'GEOMETRÍA · GAVIONES' : 'GEOMETRÍA · ESCOLLERA'} dotColor={P.pivot} w={isGavion ? 160 : 165} P={P} />}
      <text x={width - 14} y={27} fontSize={9.5} textAnchor="end"
        fill={P.dim} fontFamily="ui-monospace, 'Geist Mono', monospace">{svgText('SECCIÓN · 1 m ANCHO', isPdf)}</text>

      {/* Relleno del trasdós */}
      <path d={backSoil} fill="url(#rk-soil-grad)" />
      <path d={backSoil} fill="url(#rk-soil)" />
      <line x1={p.sx(g.xb0)} y1={crownY} x2={soilRight + 20} y2={soilTopAtRight - 20 * betaTan}
        stroke={P.ground} strokeWidth={1.4} />

      {/* Cimiento (escollera hormigonada) */}
      <rect x={p.sx(0)} y={fdnTopY} width={p.sx(g.B) - p.sx(0)} height={baseY - fdnTopY}
        fill={P.concreteFill} stroke={P.concreteEdge} strokeWidth={1.2} />
      <rect x={p.sx(0)} y={fdnTopY} width={p.sx(g.B) - p.sx(0)} height={baseY - fdnTopY}
        fill="url(#rk-concrete)" />
      <rect x={p.sx(0)} y={fdnTopY} width={p.sx(g.B) - p.sx(0)} height={baseY - fdnTopY}
        fill="url(#rk-rock)" opacity={0.8} />

      {/* Cuerpo del muro */}
      <path d={bodyPath} fill={P.rockFill} stroke={P.rockEdge} strokeWidth={1.3} />
      <path d={bodyPath} fill="url(#rk-rock)" />
      {!isGavion && hiladas.map((h, i) => (
        <line key={`hilada-${i}`} x1={h.x1} y1={h.y1} x2={h.x2} y2={h.y2}
          stroke={P.rockLine} strokeWidth={0.7} opacity={0.6} clipPath="url(#rk-body-clip)" />
      ))}
      {isGavion && g.rows?.map((r, i) => (
        <rect key={`row-${i}`}
          x={p.sx(r.xFront)} y={p.sy(g.hz + g.H - r.zTop)}
          width={(r.xBack - r.xFront) * p.scale} height={(r.zBot - r.zTop) * p.scale}
          fill="none" stroke={P.rockEdge} strokeWidth={0.9} />
      ))}

      {/* Terreno frontal (df) */}
      {(inp.df as number) > 0.001 && (
        <line x1={p.sx(0) - 26} y1={p.sy(g.hz + (inp.df as number))} x2={p.sx(g.x0)} y2={p.sy(g.hz + (inp.df as number))}
          stroke={P.ground} strokeWidth={1.2} />
      )}

      {/* Nivel freático */}
      {hwY !== null && hwY > crownY && (
        <g>
          <line x1={p.sx(g.xb0) - 8} y1={hwY} x2={soilRight} y2={hwY}
            stroke={P.water} strokeWidth={1} strokeDasharray="6 3" />
          <path d={`M ${soilRight - 24} ${hwY - 4} l 5 -7 l 5 7 Z`} fill="none" stroke={P.water} strokeWidth={1} />
        </g>
      )}

      {/* Cotas */}
      <VDim y1={crownY} y2={fdnTopY} x={p.sx(Math.min(g.x0, 0.001) === g.x0 ? g.x0 : 0)} label={`${g.H.toFixed(2)}`} side="left" off={34} P={P} isPdf={isPdf} />
      <VDim y1={fdnTopY} y2={baseY} x={p.sx(0)} label={`${g.hz.toFixed(2)}`} side="left" off={64} P={P} isPdf={isPdf} />
      <HDim x1={p.sx(g.xb0 - (inp.a as number))} x2={p.sx(g.xb0)} y={crownY - 40} off={0} label={`a=${(inp.a as number).toFixed(2)}`} P={P} isPdf={isPdf} />
      <HDim x1={p.sx(0)} x2={p.sx(g.B)} y={baseY} off={30} label={`B=${g.B.toFixed(2)}`} P={P} isPdf={isPdf} />
      {!isGavion && (
        <text x={p.sx(g.x0 + g.mIntra * g.H * 0.5) - 10} y={(crownY + fdnTopY) / 2}
          fontSize={9} fill={P.dim} textAnchor="end"
          fontFamily="ui-monospace, 'Geist Mono', monospace">
          {svgText(`${(inp.mIntra as number).toFixed(2)}H:1V`, isPdf)}
        </text>
      )}
      {isGavion && (
        <text x={p.sx(g.x0) - 10} y={(crownY + fdnTopY) / 2}
          fontSize={9} fill={P.dim} textAnchor="end"
          fontFamily="ui-monospace, 'Geist Mono', monospace">
          {svgText(`α=${(inp.alphaBatter as number).toFixed(0)}°`, isPdf)}
        </text>
      )}
      {/* Contrainclinación de la base */}
      {(inp.alphaBase as number) > 0.1 && (
        <text x={(p.sx(0) + p.sx(g.B)) / 2} y={baseY + 14} fontSize={8.5} fill={P.dim} textAnchor="middle"
          fontFamily="ui-monospace, 'Geist Mono', monospace">
          {svgText(`apoyo contrainclinado ${(inp.alphaBase as number).toFixed(1)}°`, isPdf)}
        </text>
      )}
    </svg>
  );
}

// ─── Vista 2: CARGAS ────────────────────────────────────────────────────────

function LoadsView({ inp, result, mode, width, height }: Required<RockfillWallSVGProps>) {
  const isPdf = mode === 'pdf';
  const P = isPdf ? PDF_PALETTE : SCREEN_PALETTE;
  const { system } = useUnitSystem();
  const fmtF = (v: number) => formatQuantity(v, 'linearLoad', system, { precision: 1 });
  const margin = { top: 56, right: 150, bottom: 88, left: 82 };
  const p = computeProj(result, width, height, margin);
  const g = result.geom;
  const Htot = g.H + g.hz;

  const bodyPath = toPath(bodyOutline(result), p);
  const crownY = p.sy(Htot);
  const fdnTopY = p.sy(g.hz);
  const baseY = p.sy(0);
  const planeX = p.sx(g.xPlane);

  // Diagrama de presiones horizontales sobre el plano virtual: ancho ∝ p(z).
  // p(z) por tramos (seco / q / saturado + agua); se dibuja con muestreo fino.
  const hwEff = inp.hasWater ? (inp.hw as number) : Htot + 1;
  const Ka = result.Ka;
  const pAt = (z: number): number => {
    const hd = Math.min(hwEff, z);
    const hw = Math.max(z - hd, 0);
    const cosD = Math.cos(((inp.delta as number) * Math.PI) / 180);
    const soil = Ka * ((inp.gammaSuelo as number) * hd + ((inp.gammaSat as number) - 10) * hw + (inp.q as number));
    return soil * cosD + 10 * hw;
  };
  const pMax = Math.max(pAt(Htot), 1e-6);
  const presScale = 52 / pMax;   // px por kPa
  const NP = 24;
  const presPts: string[] = [];
  for (let i = 0; i <= NP; i++) {
    const z = (i * Htot) / NP;
    presPts.push(`${(planeX + pAt(z) * presScale).toFixed(1)},${p.sy(Htot - z).toFixed(1)}`);
  }
  const presPath = `M ${planeX} ${crownY} L ` + presPts.join(' L ') + ` L ${planeX} ${baseY} Z`;

  // Resultante Ea (a Htot/3 sobre la base, inclinada δ hacia abajo-adelante)
  const yEa = p.sy(Htot / 3);
  const deltaR = ((inp.delta as number) * Math.PI) / 180;
  const eaLen = 56;
  const eaX2 = planeX + 8;
  const eaY2 = yEa;
  const eaX1 = eaX2 + eaLen * Math.cos(deltaR);
  const eaY1 = eaY2 - eaLen * Math.sin(deltaR);

  // Reacción: bloque de Meyerhof b' centrado en la resultante
  const xR = g.B / 2 - result.e;    // posición de la resultante desde la puntera
  const bEq = result.bEq;
  const sigmaH = 26;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}
      aria-label="Cargas y empujes sobre el muro de escollera" role="img">
      <title>Muro de escollera — cargas y empujes</title>

      {!isPdf && <TitleChip label="CARGAS Y EMPUJES" dotColor={P.seismic} w={150} P={P} />}
      <text x={width - 14} y={27} fontSize={9.5} textAnchor="end"
        fill={P.dim} fontFamily="ui-monospace, 'Geist Mono', monospace">{svgText('POR m DE MURO', isPdf)}</text>

      {/* Silueta */}
      <path d={bodyPath} fill={P.rockFill} stroke={P.rockEdge} strokeWidth={1.1} opacity={0.85} />
      <rect x={p.sx(0)} y={fdnTopY} width={p.sx(g.B) - p.sx(0)} height={baseY - fdnTopY}
        fill={P.concreteFill} stroke={P.concreteEdge} strokeWidth={1} opacity={0.85} />
      <line x1={planeX} y1={crownY - 8} x2={planeX} y2={baseY} stroke={P.dim} strokeWidth={0.8} strokeDasharray="4 3" />
      <text x={planeX + 2} y={crownY - 12} fontSize={8.5} fill={P.dim}
        fontFamily="ui-monospace, 'Geist Mono', monospace">{svgText('plano virtual', isPdf)}</text>

      {/* Diagrama de presiones */}
      <path d={presPath} fill={P.earth} opacity={0.22} />
      <path d={`M ${planeX} ${crownY} L ` + presPts.join(' L ')} fill="none" stroke={P.earth} strokeWidth={1.2} />

      {/* Ea resultante */}
      <Arrow x1={eaX1} y1={eaY1} x2={eaX2} y2={eaY2} color={P.earth} sw={2} head={8} />
      <rect x={eaX1 + 4} y={eaY1 - 18} width={104} height={15} rx={2} fill={P.chipBg} stroke={P.chipBorder} strokeWidth={0.5} />
      <text x={eaX1 + 8} y={eaY1 - 7} fontSize={9.5} fill={P.label}
        fontFamily="ui-monospace, 'Geist Mono', monospace">{svgText(`Ea=${fmtF(result.Ea)}`, isPdf)}</text>

      {/* Agua */}
      {result.EW !== undefined && result.EW > 0 && (
        <g>
          <Arrow x1={planeX + 66} y1={p.sy((Htot - hwEff) / 3)} x2={planeX + 10} y2={p.sy((Htot - hwEff) / 3)} color={P.water} sw={1.6} head={7} />
          <text x={planeX + 70} y={p.sy((Htot - hwEff) / 3) + 3} fontSize={9} fill={P.water}
            fontFamily="ui-monospace, 'Geist Mono', monospace">{svgText(`EW=${fmtF(result.EW)}`, isPdf)}</text>
        </g>
      )}

      {/* Sobrecarga q */}
      {(inp.q as number) > 0 && (
        <g>
          {Array.from({ length: 5 }).map((_, i) => {
            const xx = p.sx(g.xPlane) + 14 + i * 18;
            return <Arrow key={`q-${i}`} x1={xx} y1={crownY - 22} x2={xx} y2={crownY - 4} color={P.surcharge} sw={1} head={5} />;
          })}
          <text x={p.sx(g.xPlane) + 14} y={crownY - 28} fontSize={9} fill={P.surcharge}
            fontFamily="ui-monospace, 'Geist Mono', monospace">{svgText(`q=${(inp.q as number).toFixed(0)} kN/m²`, isPdf)}</text>
        </g>
      )}

      {/* Pesos */}
      <g>
        <Arrow x1={p.sx((g.x0 + g.bBase) / 2 + g.x0 / 2)} y1={(crownY + fdnTopY) / 2 - 16}
          x2={p.sx((g.x0 + g.bBase) / 2 + g.x0 / 2)} y2={(crownY + fdnTopY) / 2 + 22} color={P.weight} sw={1.8} head={7} />
        <text x={p.sx((g.x0 + g.bBase) / 2 + g.x0 / 2) + 5} y={(crownY + fdnTopY) / 2}
          fontSize={9.5} fill={P.weight} fontFamily="ui-monospace, 'Geist Mono', monospace">
          {svgText(`W=${fmtF(result.W_muro)}`, isPdf)}</text>
      </g>
      {result.W_relleno > 1 && (
        <text x={planeX - 4} y={(crownY + fdnTopY) / 2 + 26} fontSize={9} fill={P.weight} textAnchor="end"
          fontFamily="ui-monospace, 'Geist Mono', monospace">{svgText(`Ws=${fmtF(result.W_relleno)}`, isPdf)}</text>
      )}

      {/* Sismo */}
      {result.kh_derived > 0 && (
        <g>
          <Arrow x1={p.sx(g.x0 + g.bBase / 2) - 40} y1={p.sy(g.hz + g.H * 0.62)}
            x2={p.sx(g.x0 + g.bBase / 2) + 8} y2={p.sy(g.hz + g.H * 0.62)} color={P.seismic} sw={1.6} head={7} />
          <text x={p.sx(g.x0 + g.bBase / 2) - 42} y={p.sy(g.hz + g.H * 0.62) - 6} fontSize={9} fill={P.seismic} textAnchor="end"
            fontFamily="ui-monospace, 'Geist Mono', monospace">{svgText(`kh·W (kh=${result.kh_derived.toFixed(3)})`, isPdf)}</text>
        </g>
      )}

      {/* Reacción del terreno (Meyerhof) */}
      <g>
        <rect x={p.sx(Math.max(xR - bEq / 2, 0))} y={baseY} width={Math.max(bEq * p.scale, 2)} height={sigmaH}
          fill={P.reaction} opacity={0.18} />
        <line x1={p.sx(Math.max(xR - bEq / 2, 0))} y1={baseY + sigmaH} x2={p.sx(Math.min(xR + bEq / 2, g.B))} y2={baseY + sigmaH}
          stroke={P.reaction} strokeWidth={1.2} />
        {Array.from({ length: 5 }).map((_, i) => {
          const xx = p.sx(Math.max(xR - bEq / 2, 0)) + ((i + 0.5) * Math.max(bEq * p.scale, 2)) / 5;
          return <Arrow key={`r-${i}`} x1={xx} y1={baseY + sigmaH} x2={xx} y2={baseY + 4} color={P.reaction} sw={1} head={5} />;
        })}
        <text x={p.sx(xR)} y={baseY + sigmaH + 14} fontSize={9.5} fill={P.reaction} textAnchor="middle"
          fontFamily="ui-monospace, 'Geist Mono', monospace">
          {svgText(`σ=${formatQuantity(result.sigma_ref, 'soilPressure', system, { precision: 3 })} · b'=${bEq.toFixed(2)} m`, isPdf)}
        </text>
        <Arrow x1={p.sx(xR)} y1={baseY - 2} x2={p.sx(xR)} y2={baseY - 30} color={P.reaction} sw={1.4} head={6} />
        <text x={p.sx(xR) + 4} y={baseY - 22} fontSize={9} fill={P.reaction}
          fontFamily="ui-monospace, 'Geist Mono', monospace">{svgText(`ΣV=${fmtF(result.ΣV)}`, isPdf)}</text>
      </g>
    </svg>
  );
}

// ─── Vista 3: HILADAS ───────────────────────────────────────────────────────
// Silueta a la izquierda + perfil de utilización (deslizamiento y vuelco
// parcial) por profundidad a la derecha; línea límite en 1.0.

function HiladasView({ inp, result, mode, width, height }: Required<RockfillWallSVGProps>) {
  const isPdf = mode === 'pdf';
  const P = isPdf ? PDF_PALETTE : SCREEN_PALETTE;
  const isGavion = inp.wallType === 'gaviones';

  // Panel izquierdo: silueta escalada dentro del 38% del ancho.
  const leftW = Math.round(width * 0.38);
  const margin = { top: 56, right: 24, bottom: 68, left: 66 };
  const p = computeProj(result, leftW + margin.left, height, { ...margin, right: 16 });
  const g = result.geom;
  const Htot = g.H + g.hz;
  const bodyPath = toPath(bodyOutline(result), p);
  const crownY = p.sy(Htot);
  const fdnTopY = p.sy(g.hz);
  const baseY = p.sy(0);

  // Panel derecho: gráfico utilización(z)
  const chartX0 = leftW + margin.left + 34;
  const chartX1 = width - 24;
  const chartW = chartX1 - chartX0;
  const utilMaxData = Math.max(
    1.15,
    ...result.courses.map((c) => Math.max(c.utilSlide, c.utilOvert, c.utilSlideSeis ?? 0)),
  );
  const utilMax = Math.min(utilMaxData, 2.5);
  const ux = (u: number) => chartX0 + (Math.min(u, utilMax) / utilMax) * chartW;
  const zy = (z: number) => p.sy(Htot - z);   // misma escala vertical que la silueta

  const colorFor = (u: number) => (u >= 1 ? P.fail : u >= 0.95 ? P.warn : P.ok);

  const linePath = (key: 'utilSlide' | 'utilOvert') =>
    result.courses.map((c, i) => `${i === 0 ? 'M' : 'L'} ${ux(c[key]).toFixed(1)} ${zy(c.z).toFixed(1)}`).join(' ');

  const worst = result.worstSlide.util >= result.worstOvert.util ? result.worstSlide : result.worstOvert;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}
      aria-label="Comprobación hilada a hilada" role="img">
      <title>Muro de escollera — comprobación por hiladas</title>

      {!isPdf && <TitleChip label={isGavion ? 'JUNTAS ENTRE FILAS' : 'HILADA A HILADA'} dotColor={P.ok} w={isGavion ? 165 : 175} P={P} />}
      <text x={width - 14} y={27} fontSize={9.5} textAnchor="end"
        fill={P.dim} fontFamily="ui-monospace, 'Geist Mono', monospace">
        {svgText('ÍNDICE ≤ 1 · γR INCLUIDO', isPdf)}</text>

      {/* Silueta */}
      <path d={bodyPath} fill={P.rockFill} stroke={P.rockEdge} strokeWidth={1.1} />
      <rect x={p.sx(0)} y={fdnTopY} width={p.sx(g.B) - p.sx(0)} height={baseY - fdnTopY}
        fill={P.concreteFill} stroke={P.concreteEdge} strokeWidth={0.9} opacity={0.8} />

      {/* Corte pésimo sobre la silueta */}
      {worst.util > 0 && (
        <g>
          <line x1={p.sx(0) - 6} y1={zy(worst.z)} x2={p.sx(Math.max(g.B, g.xPlane)) + 4} y2={zy(worst.z)}
            stroke={colorFor(worst.util)} strokeWidth={1.2} strokeDasharray="5 3" />
          <text x={p.sx(0) - 4} y={zy(worst.z) - 4} fontSize={8.5} fill={colorFor(worst.util)}
            fontFamily="ui-monospace, 'Geist Mono', monospace">
            {svgText(`z=${worst.z.toFixed(2)} m`, isPdf)}</text>
        </g>
      )}

      {/* Ejes del gráfico */}
      <line x1={chartX0} y1={crownY} x2={chartX0} y2={zy(g.H)} stroke={P.dim} strokeWidth={0.9} />
      <line x1={chartX0} y1={zy(g.H)} x2={chartX1} y2={zy(g.H)} stroke={P.dim} strokeWidth={0.9} />
      {/* Límite 1.0 */}
      <line x1={ux(1)} y1={crownY - 4} x2={ux(1)} y2={zy(g.H)} stroke={P.fail} strokeWidth={0.9} strokeDasharray="4 3" />
      <text x={ux(1)} y={crownY - 8} fontSize={9.5} fill={P.fail} textAnchor="middle"
        fontFamily="ui-monospace, 'Geist Mono', monospace">1.0</text>
      {[0, 0.5].map((t) => (
        <g key={`tick-${t}`}>
          <line x1={ux(t)} y1={zy(g.H)} x2={ux(t)} y2={zy(g.H) + 4} stroke={P.dim} strokeWidth={0.7} />
          <text x={ux(t)} y={zy(g.H) + 14} fontSize={9} fill={P.dim} textAnchor="middle"
            fontFamily="ui-monospace, 'Geist Mono', monospace">{t.toFixed(1)}</text>
        </g>
      ))}
      <text x={(chartX0 + chartX1) / 2} y={zy(g.H) + 28} fontSize={9.5} fill={P.dim} textAnchor="middle"
        fontFamily="ui-monospace, 'Geist Mono', monospace">{svgText('índice de utilización', isPdf)}</text>

      {isGavion ? (
        // Pocas juntas: barras horizontales por junta
        <g>
          {result.courses.map((c) => (
            <g key={`bar-${c.z}`}>
              <rect x={chartX0} y={zy(c.z) - 8} width={Math.max(ux(c.utilSlide) - chartX0, 1)} height={6}
                fill={colorFor(c.utilSlide)} opacity={0.85} />
              <rect x={chartX0} y={zy(c.z) + 1} width={Math.max(ux(c.utilOvert) - chartX0, 1)} height={6}
                fill={colorFor(c.utilOvert)} opacity={0.45} />
            </g>
          ))}
        </g>
      ) : (
        // Perfil continuo: deslizamiento (sólido) y vuelco (tenue)
        <g>
          <path d={linePath('utilSlide')} fill="none" stroke={P.pivot} strokeWidth={1.6} />
          <path d={linePath('utilOvert')} fill="none" stroke={P.weight} strokeWidth={1.2} strokeDasharray="5 3" />
        </g>
      )}

      {/* Peor punto */}
      {worst.util > 0 && (
        <g>
          <circle cx={ux(worst.util)} cy={zy(worst.z)} r={3.5} fill={colorFor(worst.util)} />
          <rect x={Math.min(ux(worst.util) + 6, chartX1 - 74)} y={zy(worst.z) - 20} width={70} height={15} rx={2}
            fill={P.chipBg} stroke={P.chipBorder} strokeWidth={0.5} />
          <text x={Math.min(ux(worst.util) + 10, chartX1 - 70)} y={zy(worst.z) - 9} fontSize={9.5}
            fill={colorFor(worst.util)} fontFamily="ui-monospace, 'Geist Mono', monospace">
            {`I=${worst.util.toFixed(2)}`}</text>
        </g>
      )}

      {/* Leyenda */}
      {isGavion ? (
        <g>
          <rect x={chartX0} y={height - 24} width={5} height={5} fill={P.ok} opacity={0.85} />
          <text x={chartX0 + 10} y={height - 19} fontSize={9.5} fill={P.label}
            fontFamily="ui-monospace, 'Geist Mono', monospace">{svgText('deslizamiento', isPdf)}</text>
          <rect x={chartX0 + 118} y={height - 24} width={5} height={5} fill={P.ok} opacity={0.45} />
          <text x={chartX0 + 128} y={height - 19} fontSize={9.5} fill={P.label}
            fontFamily="ui-monospace, 'Geist Mono', monospace">{svgText('vuelco (e/b)', isPdf)}</text>
        </g>
      ) : (
        <g>
          <line x1={chartX0} y1={height - 22} x2={chartX0 + 22} y2={height - 22} stroke={P.pivot} strokeWidth={1.6} />
          <text x={chartX0 + 27} y={height - 19} fontSize={9.5} fill={P.label}
            fontFamily="ui-monospace, 'Geist Mono', monospace">{svgText('deslizamiento', isPdf)}</text>
          <line x1={chartX0 + 118} y1={height - 22} x2={chartX0 + 140} y2={height - 22}
            stroke={P.weight} strokeWidth={1.2} strokeDasharray="5 3" />
          <text x={chartX0 + 145} y={height - 19} fontSize={9.5} fill={P.label}
            fontFamily="ui-monospace, 'Geist Mono', monospace">{svgText('vuelco (e/b)', isPdf)}</text>
        </g>
      )}
    </svg>
  );
}

// ─── Componente principal ───────────────────────────────────────────────────

export function RockfillWallSVG({
  inp, result, mode = 'screen', width = 560, height = 460, view = 'geometry',
}: RockfillWallSVGProps) {
  if (!result.valid) {
    const P = mode === 'pdf' ? PDF_PALETTE : SCREEN_PALETTE;
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img"
        aria-label="Datos inválidos">
        <text x={width / 2} y={height / 2} fontSize={11} fill={P.dim} textAnchor="middle"
          fontFamily="ui-monospace, 'Geist Mono', monospace">
          {svgText(result.error ?? 'Datos inválidos', mode === 'pdf')}
        </text>
      </svg>
    );
  }
  const props = { inp, result, mode, width, height, view } as Required<RockfillWallSVGProps>;
  if (view === 'loads') return <LoadsView {...props} />;
  if (view === 'hiladas') return <HiladasView {...props} />;
  return <GeometryView {...props} />;
}
