// PileCapRebarSVG — vista «Armado» del encepado, pareja de la vista «Modelo»
// (PileCapSVG) como en el módulo de muros: planta con las bandas inferiores y
// superiores sobre los pilotes y la armadura horizontal de las caras, sección
// longitudinal por la fila de pilotes (tirante con patillas, superior y cercos)
// y sección transversal por el pilar (cerco, barras y horizontales de cara).
//
// Un ÚNICO <svg> con las tres figuras y la leyenda: el exportador de PDF toma
// el primer <svg> del clon oculto, así que todo tiene que vivir dentro. Con
// ancho ≥ 520 px (clon del PDF) la planta va a la izquierda y las secciones a
// la derecha; en pantalla se apilan.

import { type PileCapInputs } from '../../data/defaults';
import { insetPolygon, type PileCapResult, type PilePos } from '../../lib/calculations/pileCap';

interface Props {
  inp:    PileCapInputs;
  result: PileCapResult;
  width:  number;
  mode?:  'screen' | 'pdf';
}

function colors(isPdf: boolean) {
  return {
    capFill:   isPdf ? '#f8fafc' : 'var(--color-bg-surface)',
    capStroke: isPdf ? '#334155' : 'var(--color-chart-rebar-dim)',
    colFill:   isPdf ? '#cbd5e1' : 'var(--color-chart-section-fill)',
    colStroke: isPdf ? '#475569' : 'var(--color-chart-rebar-faint)',
    pile:      isPdf ? '#94a3b8' : 'var(--color-chart-rebar-dim)',
    bottom:    isPdf ? '#0f172a' : 'var(--color-text-primary)',
    top:       isPdf ? '#64748b' : 'var(--color-chart-dim-text)',
    stirrup:   isPdf ? '#b45309' : 'var(--color-state-warn)',
    face:      isPdf ? '#0ea5e9' : 'var(--color-accent)',
    text:      isPdf ? '#0f172a' : 'var(--color-text-primary)',
    textSec:   isPdf ? '#475569' : 'var(--color-text-secondary)',
  };
}

const FONT = 'monospace';
const MAX_BARS_DRAWN = 30;   // por banda: más allá no se distingue nada
const MAX_STIRRUPS_DRAWN = 80;

type Sec = ReturnType<typeof secondary>;

/** Armadura secundaria dispuesta, con los mismos defaults que el motor. */
function secondary(inp: PileCapInputs) {
  return {
    phi_top: (inp.phi_top as number | undefined) ?? 12,
    n_top:   (inp.n_top as number | undefined) ?? 2,
    phi_cv:  (inp.phi_cv as number | undefined) ?? 12,
    s_cv:    (inp.s_cv as number | undefined) ?? 100,
    n_cv:    (inp.n_cv as number | undefined) ?? 2,
    phi_ch:  (inp.phi_ch as number | undefined) ?? 12,
    s_ch:    (inp.s_ch as number | undefined) ?? 100,
  };
}

// ── Planta ────────────────────────────────────────────────────────────────────

function PlanRebar({
  inp, result, size, isPdf, sec,
}: { inp: PileCapInputs; result: PileCapResult; size: number; isPdf: boolean; sec: Sec }) {
  const c = colors(isPdf);
  const { pilePos, outline, L_x, L_y, w_band, e_borde, n_bars_x, n_bars_y } = result;
  const s     = inp.s as number;
  const d_p   = inp.d_p as number;
  const b_col = inp.b_col as number;
  const h_col = inp.h_col as number;
  const cover = inp.cover as number;
  const phi_tie = inp.phi_tie as number;

  const margin = 22;
  const scale = Math.min((size - 2 * margin) / L_x, (size - 2 * margin) / L_y);
  const xs = outline.map((p) => p.x);
  const ys = outline.map((p) => p.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const px = (x: number) => size / 2 + (x - cx) * scale;
  const py = (y: number) => size / 2 - (y - cy) * scale;

  // Bandas: parejas de pilotes contiguos (a distancia s). Las barras se
  // prolongan más allá del eje del pilote hasta el borde menos recubrimiento.
  const ext = Math.max(e_borde - cover, 0);
  type Band = { p: PilePos; q: PilePos; nBars: number };
  const bands: Band[] = [];
  pilePos.forEach((p, i) => {
    pilePos.slice(i + 1).forEach((q) => {
      if (Math.hypot(q.x - p.x, q.y - p.y) > s * 1.01) return;
      const alongY = Math.abs(q.x - p.x) < 1e-6;
      bands.push({ p, q, nBars: alongY && n_bars_y !== null ? n_bars_y : n_bars_x });
    });
  });
  const barLines = (b: Band, count: number, widthFactor: number) => {
    const dx = b.q.x - b.p.x;
    const dy = b.q.y - b.p.y;
    const len = Math.hypot(dx, dy) || 1;
    const tx = dx / len;
    const ty = dy / len;
    const nx = -ty;
    const ny = tx;
    const w = w_band * widthFactor;
    const k = Math.min(count, MAX_BARS_DRAWN);
    return Array.from({ length: k }, (_, i) => {
      const off = k > 1 ? -w / 2 + (i * w) / (k - 1) : 0;
      return {
        x1: px(b.p.x - tx * ext + nx * off), y1: py(b.p.y - ty * ext + ny * off),
        x2: px(b.q.x + tx * ext + nx * off), y2: py(b.q.y + ty * ext + ny * off),
      };
    });
  };
  const ring = insetPolygon(outline, cover);
  const r_pile = Math.min(Math.max((d_p / 2) * scale, 4), 18);

  return (
    <g>
      <polygon
        points={outline.map((p) => `${px(p.x)},${py(p.y)}`).join(' ')}
        fill={c.capFill} stroke={c.capStroke} strokeWidth={1.5} strokeLinejoin="round"
      />
      {/* Horizontal de caras: anillo a recubrimiento */}
      <polygon
        points={ring.map((p) => `${px(p.x)},${py(p.y)}`).join(' ')}
        fill="none" stroke={c.face} strokeWidth={1} strokeDasharray="5 3" strokeLinejoin="round"
      />
      {/* Pilotes (contorno tenue) y pilar */}
      {pilePos.map((p, i) => (
        <circle key={`pl-${i}`} cx={px(p.x)} cy={py(p.y)} r={r_pile}
          fill="none" stroke={c.pile} strokeWidth={1} strokeDasharray="2 2" />
      ))}
      <rect
        x={px(0) - (b_col / 2) * scale} y={py(0) - (h_col / 2) * scale}
        width={b_col * scale} height={h_col * scale}
        fill={c.colFill} stroke={c.colStroke} strokeWidth={1}
      />
      {/* Bandas inferiores */}
      {bands.map((b, bi) => barLines(b, b.nBars, 1).map((l, i) => (
        <line key={`inf-${bi}-${i}`} {...l} stroke={c.bottom} strokeWidth={1.3} strokeLinecap="round" />
      )))}
      {/* Superiores (discontinuas, en el 60 % de la banda) */}
      {sec.n_top > 0 && bands.map((b, bi) => barLines(b, sec.n_top, 0.6).map((l, i) => (
        <line key={`sup-${bi}-${i}`} {...l} stroke={c.top} strokeWidth={1} strokeDasharray="6 3" />
      )))}
      <text x={size / 2} y={12} textAnchor="middle" fontSize={isPdf ? 7 : 8}
        fill={c.textSec} fontFamily={FONT}>
        {`PLANTA · inferior ${n_bars_x}Ø${phi_tie}${n_bars_y !== null && n_bars_y !== n_bars_x ? ` / ${n_bars_y}Ø${phi_tie}` : ''} por banda`}
      </text>
    </g>
  );
}

// ── Sección longitudinal (por la fila de pilotes) ─────────────────────────────

function LongSection({
  inp, result, width, height, isPdf, sec,
}: { inp: PileCapInputs; result: PileCapResult; width: number; height: number; isPdf: boolean; sec: Sec }) {
  const c = colors(isPdf);
  const { L_x, n_bars_x } = result;
  const h_enc = inp.h_enc as number;
  const b_col = inp.b_col as number;
  const d_p   = inp.d_p as number;
  const cover = inp.cover as number;
  const s     = inp.s as number;
  const phi_tie = inp.phi_tie as number;

  const margin = 16;
  const colStub = 26;
  const pileStub = 14;
  const scale = Math.min(
    (width - 2 * margin - 60) / L_x,
    (height - margin - colStub - pileStub - 22) / h_enc,
  );
  const capW = L_x * scale;
  const capH = h_enc * scale;
  const ox = (width - capW) / 2 - 20;
  const oy = margin + colStub;
  const cov = cover * scale;
  const cTop = Math.max(40, phi_tie) * scale;

  const stirrups: number[] = [];
  for (let x = ox + cov, k = 0; x <= ox + capW - cov + 1e-6 && k < MAX_STIRRUPS_DRAWN; x += sec.s_cv * scale, k++) {
    stirrups.push(x);
  }
  const pileXs = [ox + (L_x / 2 - s / 2) * scale, ox + (L_x / 2 + s / 2) * scale];

  return (
    <g>
      <text x={ox} y={11} fontSize={isPdf ? 7 : 8} fill={c.textSec} fontFamily={FONT}>
        SECCIÓN LONGITUDINAL
      </text>
      {/* Pilar y encepado */}
      <rect x={ox + capW / 2 - (b_col / 2) * scale} y={oy - colStub + 14}
        width={b_col * scale} height={colStub - 14}
        fill={c.colFill} stroke={c.colStroke} strokeWidth={1} />
      <rect x={ox} y={oy} width={capW} height={capH}
        fill={c.capFill} stroke={c.capStroke} strokeWidth={1.5} />
      {/* Pilotes cortados */}
      {pileXs.map((x, i) => (
        <rect key={`p-${i}`} x={x - (d_p / 2) * scale} y={oy + capH} width={d_p * scale} height={pileStub}
          fill="none" stroke={c.pile} strokeWidth={1} strokeDasharray="2 2" />
      ))}
      {/* Cercos verticales */}
      {stirrups.map((x, i) => (
        <line key={`cv-${i}`} x1={x} y1={oy + cTop} x2={x} y2={oy + capH - cov}
          stroke={c.stirrup} strokeWidth={1} />
      ))}
      {/* Superior */}
      {sec.n_top > 0 && (
        <line x1={ox + cov} y1={oy + cTop} x2={ox + capW - cov} y2={oy + cTop}
          stroke={c.top} strokeWidth={1.6} strokeDasharray="6 3" />
      )}
      {/* Tirante inferior con patillas verticales */}
      <polyline
        points={[
          `${ox + cov},${oy + cTop}`,
          `${ox + cov},${oy + capH - cov}`,
          `${ox + capW - cov},${oy + capH - cov}`,
          `${ox + capW - cov},${oy + cTop}`,
        ].join(' ')}
        fill="none" stroke={c.bottom} strokeWidth={2} strokeLinejoin="round"
      />
      {/* Rótulos */}
      <text x={ox + capW + 5} y={oy + capH - cov + 3} fontSize={isPdf ? 6.5 : 7.5}
        fill={c.bottom} fontFamily={FONT}>
        {`${n_bars_x}Ø${phi_tie}`}
      </text>
      {sec.n_top > 0 && (
        <text x={ox + capW + 5} y={oy + cTop + 3} fontSize={isPdf ? 6.5 : 7.5}
          fill={c.top} fontFamily={FONT}>
          {`${sec.n_top}Ø${sec.phi_top}`}
        </text>
      )}
      <text x={ox + capW / 2} y={oy - colStub + 10} textAnchor="middle" fontSize={isPdf ? 6.5 : 7.5}
        fill={c.stirrup} fontFamily={FONT}>
        {`cercos Ø${sec.phi_cv} c/${sec.s_cv}`}
      </text>
      <text x={ox - 4} y={oy + capH / 2} textAnchor="end" fontSize={isPdf ? 6.5 : 7.5}
        fill={c.textSec} fontFamily={FONT} dominantBaseline="middle">
        {`h=${h_enc}`}
      </text>
    </g>
  );
}

// ── Sección transversal (por el pilar) ────────────────────────────────────────

function TransSection({
  inp, result, width, height, isPdf, sec,
}: { inp: PileCapInputs; result: PileCapResult; width: number; height: number; isPdf: boolean; sec: Sec }) {
  const c = colors(isPdf);
  const { L_y, w_band, n_bars_x } = result;
  const h_enc = inp.h_enc as number;
  const h_col = inp.h_col as number;
  const cover = inp.cover as number;
  const phi_tie = inp.phi_tie as number;

  const margin = 16;
  const colStub = 26;
  const scale = Math.min(
    (width - 2 * margin - 90) / L_y,
    (height - margin - colStub - 22) / h_enc,
  );
  const capW = L_y * scale;
  const capH = h_enc * scale;
  const ox = (width - capW) / 2 - 30;
  const oy = margin + colStub;
  const cov = cover * scale;
  const cTop = Math.max(40, phi_tie) * scale;
  const rBar = Math.max(1.6, (phi_tie / 2) * scale);
  const rFace = Math.max(1.4, (sec.phi_ch / 2) * scale);

  const dots = (count: number, widthFactor: number): number[] => {
    const k = Math.min(count, MAX_BARS_DRAWN);
    const w = w_band * widthFactor * scale;
    return Array.from({ length: k }, (_, i) => ox + capW / 2 + (k > 1 ? -w / 2 + (i * w) / (k - 1) : 0));
  };
  const faceYs: number[] = [];
  for (let y = oy + capH - cov - sec.s_ch * scale; y > oy + cTop + 1; y -= sec.s_ch * scale) faceYs.push(y);
  const legs: number[] = [];
  for (let k = 1; k < sec.n_cv - 1; k++) legs.push(ox + cov + (k * (capW - 2 * cov)) / (sec.n_cv - 1));

  return (
    <g>
      <text x={ox} y={11} fontSize={isPdf ? 7 : 8} fill={c.textSec} fontFamily={FONT}>
        SECCIÓN TRANSVERSAL
      </text>
      <rect x={ox + capW / 2 - (h_col / 2) * scale} y={oy - colStub + 14}
        width={h_col * scale} height={colStub - 14}
        fill={c.colFill} stroke={c.colStroke} strokeWidth={1} />
      <rect x={ox} y={oy} width={capW} height={capH}
        fill={c.capFill} stroke={c.capStroke} strokeWidth={1.5} />
      {/* Cerco cerrado y ramas intermedias */}
      <rect x={ox + cov} y={oy + cTop} width={capW - 2 * cov} height={capH - cov - cTop} rx={3}
        fill="none" stroke={c.stirrup} strokeWidth={1.4} />
      {legs.map((x, i) => (
        <line key={`leg-${i}`} x1={x} y1={oy + cTop} x2={x} y2={oy + capH - cov}
          stroke={c.stirrup} strokeWidth={1.4} />
      ))}
      {/* Horizontal de caras */}
      {faceYs.map((y, i) => (
        <g key={`f-${i}`}>
          <circle cx={ox + cov} cy={y} r={rFace} fill={c.face} />
          <circle cx={ox + capW - cov} cy={y} r={rFace} fill={c.face} />
        </g>
      ))}
      {/* Barras inferiores (banda) y superiores */}
      {dots(n_bars_x, 1).map((x, i) => (
        <circle key={`b-${i}`} cx={x} cy={oy + capH - cov} r={rBar} fill={c.bottom} />
      ))}
      {dots(sec.n_top, 0.6).map((x, i) => (
        <circle key={`t-${i}`} cx={x} cy={oy + cTop} r={Math.max(1.6, (sec.phi_top / 2) * scale)} fill={c.top} />
      ))}
      {/* Rótulos */}
      <text x={ox + capW + 6} y={oy + (capH + cTop - cov) / 2} fontSize={isPdf ? 6.5 : 7.5}
        fill={c.face} fontFamily={FONT} dominantBaseline="middle">
        {`Ø${sec.phi_ch} c/${sec.s_ch}`}
      </text>
      <text x={ox + capW + 6} y={oy + (capH + cTop - cov) / 2 + 11} fontSize={isPdf ? 6.5 : 7.5}
        fill={c.face} fontFamily={FONT} dominantBaseline="middle">
        por cara
      </text>
      <text x={ox + capW / 2} y={oy - colStub + 10} textAnchor="middle" fontSize={isPdf ? 6.5 : 7.5}
        fill={c.stirrup} fontFamily={FONT}>
        {`cerco Ø${sec.phi_cv} · ${sec.n_cv} ramas`}
      </text>
      <text x={ox - 4} y={oy + capH - cov} textAnchor="end" fontSize={isPdf ? 6.5 : 7.5}
        fill={c.bottom} fontFamily={FONT} dominantBaseline="middle">
        {`${n_bars_x}Ø${phi_tie}`}
      </text>
    </g>
  );
}

// ── Leyenda ───────────────────────────────────────────────────────────────────

function Legend({
  inp, result, width, isPdf, sec,
}: { inp: PileCapInputs; result: PileCapResult; width: number; isPdf: boolean; sec: Sec }) {
  const c = colors(isPdf);
  const phi_tie = inp.phi_tie as number;
  const items: { color: string; dash?: string; text: string }[] = [
    { color: c.bottom, text: `Inferior: ${result.n_bars_x}Ø${phi_tie} por banda (${result.As_prov_x.toFixed(0)} mm²)` },
    { color: c.top, dash: '6 3', text: `Superior: ${sec.n_top}Ø${sec.phi_top} por banda (${result.As_top_prov.toFixed(0)} mm²)` },
    { color: c.stirrup, text: `Cercos: Ø${sec.phi_cv} c/${sec.s_cv}, ${sec.n_cv} ramas (${result.As_cv_prov.toFixed(0)} mm²/m)` },
    { color: c.face, dash: '5 3', text: `Horizontal caras: Ø${sec.phi_ch} c/${sec.s_ch} (${result.As_ch_prov.toFixed(0)} mm²/m)` },
  ];
  const fs = isPdf ? 6.5 : 7.5;
  const twoCols = width >= 520;
  return (
    <g>
      {items.map((it, i) => {
        const col = twoCols ? i % 2 : 0;
        const row = twoCols ? Math.floor(i / 2) : i;
        const x0 = 8 + col * (width / 2);
        const y = 8 + row * 14;
        return (
          <g key={i}>
            <line x1={x0} y1={y} x2={x0 + 16} y2={y} stroke={it.color} strokeWidth={2} strokeDasharray={it.dash} />
            <text x={x0 + 22} y={y + 3} fontSize={fs} fill={c.text} fontFamily={FONT}>{it.text}</text>
          </g>
        );
      })}
    </g>
  );
}

// ── Wrapper ───────────────────────────────────────────────────────────────────

export function PileCapRebarSVG({ inp, result, width, mode = 'screen' }: Props) {
  const isPdf = mode === 'pdf';
  if (!result.valid) {
    return (
      <div
        className={mode === 'screen' ? 'flex items-center justify-center text-text-disabled text-sm' : undefined}
        style={{ width, height: 80 }}
      >
        {mode === 'screen' && <span>Sin datos — completar entradas</span>}
      </div>
    );
  }
  const sec = secondary(inp);
  const grid = width >= 520;
  const gap = 10;
  const planSize = grid ? Math.round(width * 0.42) : Math.min(width, 280);
  const secW = grid ? width - planSize - gap : width;
  const secH = Math.round(secW * 0.5);
  const legendH = grid ? 36 : 62;
  const bodyH = grid ? Math.max(planSize, 2 * secH + gap) : planSize + 2 * (secH + gap);
  const totalH = bodyH + gap + legendH;

  const planX = grid ? 0 : (width - planSize) / 2;
  const secX = grid ? planSize + gap : 0;
  const sec1Y = grid ? 0 : planSize + gap;
  const sec2Y = sec1Y + secH + gap;

  return (
    <div
      className={mode === 'screen' ? 'flex flex-col items-center py-4' : undefined}
      style={mode === 'pdf' ? { background: '#fff' } : undefined}
    >
      <svg
        width={width} height={totalH} viewBox={`0 0 ${width} ${totalH}`}
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Armado del encepado"
      >
        <g transform={`translate(${planX},0)`}>
          <PlanRebar inp={inp} result={result} size={planSize} isPdf={isPdf} sec={sec} />
        </g>
        <g transform={`translate(${secX},${sec1Y})`}>
          <LongSection inp={inp} result={result} width={secW} height={secH} isPdf={isPdf} sec={sec} />
        </g>
        <g transform={`translate(${secX},${sec2Y})`}>
          <TransSection inp={inp} result={result} width={secW} height={secH} isPdf={isPdf} sec={sec} />
        </g>
        <g transform={`translate(0,${bodyH + gap})`}>
          <Legend inp={inp} result={result} width={width} isPdf={isPdf} sec={sec} />
        </g>
      </svg>
    </div>
  );
}
