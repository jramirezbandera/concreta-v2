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
    grid:      isPdf ? '#94a3b8' : 'var(--color-chart-rebar-dim)',
    stirrup:   isPdf ? '#b45309' : 'var(--color-state-warn)',
    face:      isPdf ? '#0ea5e9' : 'var(--color-accent)',
    text:      isPdf ? '#0f172a' : 'var(--color-text-primary)',
    textSec:   isPdf ? '#475569' : 'var(--color-text-secondary)',
  };
}

const FONT = 'monospace';
const MAX_BARS_DRAWN = 30;   // por banda: más allá no se distingue nada
const MAX_STIRRUPS_DRAWN = 80;
const MAX_MESH_LINES = 60;   // por sentido

/** Recorte de un segmento a un polígono convexo antihorario (Cyrus–Beck):
 *  la malla de la retícula inferior se dibuja sólo dentro del anillo a
 *  recubrimiento. null si el segmento queda fuera. */
function clipSegmentToConvex(p: PilePos, q: PilePos, poly: PilePos[]): { p: PilePos; q: PilePos } | null {
  let t0 = 0;
  let t1 = 1;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    // interior a la izquierda de cada arista: f(t) = f0 + t·df ≥ 0
    const f0 = ex * (p.y - a.y) - ey * (p.x - a.x);
    const df = ex * dy - ey * dx;
    if (Math.abs(df) < 1e-12) {
      if (f0 < 0) return null;
      continue;
    }
    const t = -f0 / df;
    if (df > 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return { p: { x: p.x + dx * t0, y: p.y + dy * t0 }, q: { x: p.x + dx * t1, y: p.y + dy * t1 } };
}

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
    phi_g:   (inp.phi_g as number | undefined) ?? 12,
    s_g:     (inp.s_g as number | undefined) ?? 100,
  };
}

// ── Planta (armado inferior o superior) ──────────────────────────────────────
// Como en los planos tipo del usuario: dos plantas, ARMADO INFERIOR (bandas
// sobre los pilotes y, con n ≥ 3, la retícula entre bandas) y ARMADO SUPERIOR
// (las barras superiores de cada banda). El anillo de la horizontal de caras
// se ve en las dos.

function PlanRebar({
  inp, result, size, isPdf, sec, layer,
}: { inp: PileCapInputs; result: PileCapResult; size: number; isPdf: boolean; sec: Sec; layer: 'inferior' | 'superior' }) {
  const c = colors(isPdf);
  const { pilePos, ties, outline, L_x, L_y, w_band, e_borde, n_bars_x, n_bars_y } = result;
  const n     = inp.n as number;
  const d_p   = inp.d_p as number;
  const b_col = inp.b_col as number;
  const h_col = inp.h_col as number;
  const cover = inp.cover as number;
  const phi_tie = inp.phi_tie as number;
  const inferior = layer === 'inferior';

  const margin = 22;
  const scale = Math.min((size - 2 * margin) / L_x, (size - 2 * margin) / L_y);
  const xs = outline.map((p) => p.x);
  const ys = outline.map((p) => p.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const px = (x: number) => size / 2 + (x - cx) * scale;
  const py = (y: number) => size / 2 - (y - cy) * scale;

  // Bandas: los tirantes del motor (result.ties). Las barras se prolongan
  // más allá del eje del pilote hasta el borde menos recubrimiento.
  const ext = Math.max(e_borde - cover, 0);
  type Band = { p: PilePos; q: PilePos; nBars: number };
  const bands: Band[] = ties.map(([i, j]) => {
    const p = pilePos[i];
    const q = pilePos[j];
    const alongY = Math.abs(q.x - p.x) < 1e-6;
    return { p, q, nBars: alongY && n_bars_y !== null ? n_bars_y : n_bars_x };
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

  // Malla genérica de las dos caras (EHE-08 58.8.2: nada más de 30 cm sin
  // armar; con n ≥ 3 cumple además el 1/4 de las bandas del 58.4.1.2.2.1): a s_g
  // los dos sentidos, simétrica respecto al centroide y recortada al anillo.
  const mesh: { p: PilePos; q: PilePos }[] = [];
  {
    const xmin = Math.min(...xs);
    const xmax = Math.max(...xs);
    const ymin = Math.min(...ys);
    const ymax = Math.max(...ys);
    const xsMesh: number[] = [0];
    for (let x = sec.s_g; x <= xmax && xsMesh.length < MAX_MESH_LINES; x += sec.s_g) xsMesh.push(x, -x);
    const ysMesh: number[] = [0];
    for (let y = sec.s_g; y <= ymax && ysMesh.length < MAX_MESH_LINES; y += sec.s_g) ysMesh.push(y);
    for (let y = -sec.s_g; y >= ymin && ysMesh.length < MAX_MESH_LINES; y -= sec.s_g) ysMesh.push(y);
    for (const x of xsMesh) {
      const seg = clipSegmentToConvex({ x, y: ymin }, { x, y: ymax }, ring);
      if (seg) mesh.push(seg);
    }
    for (const y of ysMesh) {
      const seg = clipSegmentToConvex({ x: xmin, y }, { x: xmax, y }, ring);
      if (seg) mesh.push(seg);
    }
  }

  // Con 2 micropilotes no hay banda: la armadura barre todo el ancho (viga).
  const donde = n === 2 ? 'en todo el ancho' : 'por banda';
  const title = inferior
    ? n_bars_y !== null
      ? `ARMADO INFERIOR · x ${n_bars_x}Ø${phi_tie} / y ${n_bars_y}Ø${phi_tie} por banda`
      : `ARMADO INFERIOR · ${n_bars_x}Ø${phi_tie} ${donde}`
    : sec.n_top > 0 ? `ARMADO SUPERIOR · ${sec.n_top}Ø${sec.phi_top} ${donde}` : 'ARMADO SUPERIOR · sin barras';

  return (
    <g>
      <polygon
        points={outline.map((p) => `${px(p.x)},${py(p.y)}`).join(' ')}
        fill={c.capFill} stroke={c.capStroke} strokeWidth={1.5} strokeLinejoin="round"
      />
      {/* Malla genérica de esta cara */}
      {mesh.map((l, i) => (
        <line key={`g-${i}`} x1={px(l.p.x)} y1={py(l.p.y)} x2={px(l.q.x)} y2={py(l.q.y)}
          stroke={c.grid} strokeWidth={0.7} />
      ))}
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
      {/* Bandas inferiores (planta inferior) */}
      {inferior && bands.map((b, bi) => barLines(b, b.nBars, 1).map((l, i) => (
        <line key={`inf-${bi}-${i}`} {...l} stroke={c.bottom} strokeWidth={1.3} strokeLinecap="round" />
      )))}
      {/* Superiores (planta superior): en el 60 % de la banda con n ≥ 3 y a todo
        * el ancho con n = 2, que es donde van (58.4.1.2.1.2) */}
      {!inferior && sec.n_top > 0 && bands.map((b, bi) => barLines(b, sec.n_top, n === 2 ? 0.85 : 0.6).map((l, i) => (
        <line key={`sup-${bi}-${i}`} {...l} stroke={c.top} strokeWidth={1.1} strokeLinecap="round" />
      )))}
      <text x={size / 2} y={12} textAnchor="middle" fontSize={isPdf ? 7 : 10}
        fill={c.textSec} fontFamily={FONT}>
        {title}
      </text>
    </g>
  );
}

// ── Las dos figuras de corte, en los dos sentidos ─────────────────────────────
// Un encepado con tirantes en las DOS direcciones (4 y 6 micropilotes) necesita
// las dos parejas de secciones: con una sola pareja, la armadura del otro
// sentido —los 9Ø20 por banda del tipo de 6 frente a los 6Ø20 de la otra— no
// aparecía en ninguna parte salvo en la planta. Las dos parejas son la misma
// figura con los ejes intercambiados, así que se dibujan con un descriptor que
// traduce x ↔ y y un sufijo « X» / « Y» en el rótulo cuando se dibujan las dos.

type Dir = 'x' | 'y';

interface AxisInfo {
  dir: Dir;
  /** Longitud del encepado en el sentido del tirante (la de la longitudinal). */
  span: number;
  /** Ancho perpendicular (el que se ve en la transversal). */
  cross: number;
  /** Borde del contorno en el eje perpendicular (mm desde el centroide). */
  crossMin: number;
  /** Dimensión del pilar en el sentido del tirante y en el perpendicular. */
  colSpan: number;
  colCross: number;
  /** Barras del tirante de ese sentido. */
  nBars: number;
  /** Del centro al eje del pilote extremo, en el sentido del tirante. */
  pileOff: number;
  /** Bandas que corta la transversal: posición en el eje perpendicular y ancho. */
  bands: { c: number; w: number }[];
  /** Sufijo del rótulo cuando se dibujan los dos sentidos. */
  suffix: string;
}

/** ¿Las dos parejas de secciones saldrían calcadas? Pasa con 4 micropilotes en
 *  cuadrado y pilar cuadrado: mismas luces, mismas bandas y mismas barras. En
 *  ese caso se dibuja una sola pareja, sin sufijo, en vez de repetirla. */
function mismaFigura(a: AxisInfo, b: AxisInfo): boolean {
  const eq = (u: number, v: number) => Math.abs(u - v) < 0.5;
  return eq(a.span, b.span) && eq(a.cross, b.cross)
    && eq(a.colSpan, b.colSpan) && eq(a.colCross, b.colCross)
    && a.nBars === b.nBars && eq(a.pileOff, b.pileOff)
    && a.bands.length === b.bands.length
    && a.bands.every((bd, i) => eq(bd.c, b.bands[i].c) && eq(bd.w, b.bands[i].w));
}

function axisInfo(inp: PileCapInputs, result: PileCapResult, dir: Dir, both: boolean): AxisInfo {
  const n     = inp.n as number;
  const s     = inp.s as number;
  const s_x   = inp.s_x as number;
  const { w_band, pilePos, n_bars_x, n_bars_y, L_x, L_y, outline } = result;
  const suffix = both ? (dir === 'x' ? ' X' : ' Y') : '';
  if (dir === 'y') {
    // Sólo se pide con tirantes en los dos sentidos (n = 4 y n = 6): las dos
    // columnas de pilotes, a ±s_x/2 (n=6) o ±s/2 (n=4).
    const col = n === 6 ? s_x / 2 : s / 2;
    return {
      dir,
      span: L_y, cross: L_x,
      crossMin: Math.min(...outline.map((p) => p.x)),
      colSpan: inp.h_col as number, colCross: inp.b_col as number,
      nBars: n_bars_y ?? n_bars_x,
      pileOff: Math.max(...pilePos.map((p) => Math.abs(p.y))),
      bands: [{ c: -col, w: w_band }, { c: col, w: w_band }],
      suffix,
    };
  }
  // Plano x = 0. Corta las bandas ∥ x: la única (n=2, que con dos micropilotes
  // es TODO el ancho —se arma como una viga, EHE-08 58.4.1.2.1.1—), las dos a
  // ±s/2 (n=4), las tres filas (n=6) o la inferior B–C y el cruce de las dos
  // inclinadas sobre A (n=3).
  const bands = n === 2
    ? [{ c: 0, w: w_band }]
    : n === 4
      ? [{ c: -s / 2, w: w_band }, { c: s / 2, w: w_band }]
      : n === 6
        ? [{ c: -s, w: w_band }, { c: 0, w: w_band }, { c: s, w: w_band }]
        : [{ c: pilePos[1].y, w: w_band }, { c: pilePos[0].y, w: w_band / Math.cos(Math.PI / 6) }];
  return {
    dir,
    span: L_x, cross: L_y,
    crossMin: Math.min(...outline.map((p) => p.y)),
    colSpan: inp.b_col as number, colCross: inp.h_col as number,
    nBars: n_bars_x,
    pileOff: Math.max(...pilePos.map((p) => Math.abs(p.x))),
    bands,
    suffix,
  };
}

// ── Sección longitudinal (por la fila —o la columna— de pilotes) ──────────────

function LongSection({
  inp, result, width, height, isPdf, sec, ax,
}: {
  inp: PileCapInputs; result: PileCapResult; width: number; height: number;
  isPdf: boolean; sec: Sec; ax: AxisInfo;
}) {
  const c = colors(isPdf);
  const h_enc = inp.h_enc as number;
  const d_p   = inp.d_p as number;
  const cover = inp.cover as number;
  const phi_tie = inp.phi_tie as number;
  const { span, colSpan, nBars, pileOff, suffix } = ax;
  void result;

  const margin = 16;
  const colStub = 26;
  const pileStub = 14;
  const scale = Math.min(
    (width - 2 * margin - 60) / span,
    (height - margin - colStub - pileStub - 22) / h_enc,
  );
  const capW = span * scale;
  const capH = h_enc * scale;
  // El dibujo se corre a la izquierda para dejar sitio a los rótulos de la
  // derecha, pero nunca tanto que se salga: a su izquierda se escribe la cota
  // del canto («h=800», anclada al final), y sin este tope el SVG se comía la
  // primera letra.
  const ox = Math.max(36, (width - capW) / 2 - 20);
  const oy = margin + colStub;
  const cov = cover * scale;
  const cTop = Math.max(40, phi_tie) * scale;

  const stirrups: number[] = [];
  for (let x = ox + cov, k = 0; x <= ox + capW - cov + 1e-6 && k < MAX_STIRRUPS_DRAWN; x += sec.s_cv * scale, k++) {
    stirrups.push(x);
  }
  const pileXs = [ox + (span / 2 - pileOff) * scale, ox + (span / 2 + pileOff) * scale];

  return (
    <g>
      <text x={ox} y={11} fontSize={isPdf ? 7 : 10} fill={c.textSec} fontFamily={FONT}>
        {`SECCIÓN LONGITUDINAL${suffix}`}
      </text>
      {/* Pilar y encepado */}
      <rect x={ox + capW / 2 - (colSpan / 2) * scale} y={oy - colStub + 14}
        width={colSpan * scale} height={colStub - 14}
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
      <text x={ox + capW + 5} y={oy + capH - cov + 3} fontSize={isPdf ? 6.5 : 9.5}
        fill={c.bottom} fontFamily={FONT}>
        {`${nBars}Ø${phi_tie}`}
      </text>
      {sec.n_top > 0 && (
        <text x={ox + capW + 5} y={oy + cTop + 3} fontSize={isPdf ? 6.5 : 9.5}
          fill={c.top} fontFamily={FONT}>
          {`${sec.n_top}Ø${sec.phi_top}`}
        </text>
      )}
      <text x={ox + capW / 2} y={oy - colStub + 10} textAnchor="middle" fontSize={isPdf ? 6.5 : 9.5}
        fill={c.stirrup} fontFamily={FONT}>
        {`cercos Ø${sec.phi_cv} c/${sec.s_cv}`}
      </text>
      <text x={ox - 4} y={oy + capH / 2} textAnchor="end" fontSize={isPdf ? 6.5 : 9.5}
        fill={c.textSec} fontFamily={FONT} dominantBaseline="middle">
        {`h=${h_enc}`}
      </text>
    </g>
  );
}

// ── Sección transversal (por el pilar) ────────────────────────────────────────
// Corta las bandas del sentido del tirante (ver `axisInfo`). Con n ≥ 3 los
// cercos van alrededor de cada banda (EHE-08 58.4.1.2.2.2) y la retícula
// inferior aparece como puntos entre bandas; con n = 2 el cerco es perimetral y
// la armadura inferior barre todo el ancho.

function TransSection({
  inp, result, width, height, isPdf, sec, ax,
}: {
  inp: PileCapInputs; result: PileCapResult; width: number; height: number;
  isPdf: boolean; sec: Sec; ax: AxisInfo;
}) {
  const c = colors(isPdf);
  const n     = inp.n as number;
  const h_enc = inp.h_enc as number;
  const cover = inp.cover as number;
  const phi_tie = inp.phi_tie as number;
  const { cross, crossMin, colCross, nBars, bands, suffix } = ax;
  void result;

  const margin = 16;
  const colStub = 26;
  const scale = Math.min(
    (width - 2 * margin - 90) / cross,
    (height - margin - colStub - 22) / h_enc,
  );
  const capW = cross * scale;
  const capH = h_enc * scale;
  const ox = Math.max(36, (width - capW) / 2 - 30);
  const oy = margin + colStub;
  const cov = cover * scale;
  const cTop = Math.max(40, phi_tie) * scale;
  const rBar = Math.max(1.6, (phi_tie / 2) * scale);
  const rFace = Math.max(1.4, (sec.phi_ch / 2) * scale);
  const X = (v: number) => ox + (v - crossMin) * scale;   // eje perpendicular → x del dibujo
  // Con 2 micropilotes la superior también va a todo el ancho (armadura
  // longitudinal de la cara superior, 58.4.1.2.1.2); en banda se dibuja
  // centrada en el 60 % para distinguirla de la inferior.
  const topFactor = n === 2 ? 0.85 : 0.6;

  const dotsAt = (center: number, w: number, count: number, factor: number): number[] => {
    const k = Math.min(count, MAX_BARS_DRAWN);
    const ww = w * factor * scale;
    return Array.from({ length: k }, (_, i) => X(center) + (k > 1 ? -ww / 2 + (i * ww) / (k - 1) : 0));
  };
  const faceYs: number[] = [];
  for (let y = oy + capH - cov - sec.s_ch * scale; y > oy + cTop + 1; y -= sec.s_ch * scale) faceYs.push(y);
  const gridXs: number[] = [];
  for (let x = ox + cov, k = 0; x <= ox + capW - cov + 1e-6 && k < MAX_STIRRUPS_DRAWN; x += sec.s_g * scale, k++) {
    gridXs.push(x);
  }
  const legsIn = (x0: number, w: number): number[] => {
    const out: number[] = [];
    for (let k = 1; k < sec.n_cv - 1; k++) out.push(x0 + (k * w) / (sec.n_cv - 1));
    return out;
  };

  return (
    <g>
      <text x={ox} y={11} fontSize={isPdf ? 7 : 10} fill={c.textSec} fontFamily={FONT}>
        {`SECCIÓN TRANSVERSAL${suffix}`}
      </text>
      <rect x={X(0) - (colCross / 2) * scale} y={oy - colStub + 14}
        width={colCross * scale} height={colStub - 14}
        fill={c.colFill} stroke={c.colStroke} strokeWidth={1} />
      <rect x={ox} y={oy} width={capW} height={capH}
        fill={c.capFill} stroke={c.capStroke} strokeWidth={1.5} />
      {/* Cercos: perimetral (n=2) o alrededor de cada banda (n ≥ 3) */}
      {n === 2 ? (
        <g>
          <rect x={ox + cov} y={oy + cTop} width={capW - 2 * cov} height={capH - cov - cTop} rx={3}
            fill="none" stroke={c.stirrup} strokeWidth={1.4} />
          {legsIn(ox + cov, capW - 2 * cov).map((x, i) => (
            <line key={`leg-${i}`} x1={x} y1={oy + cTop} x2={x} y2={oy + capH - cov}
              stroke={c.stirrup} strokeWidth={1.4} />
          ))}
        </g>
      ) : bands.map((b, bi) => {
        const x0 = X(b.c) - (b.w / 2) * scale;
        const w = b.w * scale;
        return (
          <g key={`band-${bi}`}>
            <rect x={x0} y={oy + cTop} width={w} height={capH - cov - cTop} rx={3}
              fill="none" stroke={c.stirrup} strokeWidth={1.4} />
            {legsIn(x0, w).map((x, i) => (
              <line key={`leg-${bi}-${i}`} x1={x} y1={oy + cTop} x2={x} y2={oy + capH - cov}
                stroke={c.stirrup} strokeWidth={1.4} />
            ))}
          </g>
        );
      })}
      {/* Horizontal de caras */}
      {faceYs.map((y, i) => (
        <g key={`f-${i}`}>
          <circle cx={ox + cov} cy={y} r={rFace} fill={c.face} />
          <circle cx={ox + capW - cov} cy={y} r={rFace} fill={c.face} />
        </g>
      ))}
      {/* Malla genérica: cortada en las dos caras, superior e inferior */}
      {gridXs.map((x, i) => (
        <g key={`gd-${i}`}>
          <circle cx={x} cy={oy + capH - cov} r={Math.max(1.2, (sec.phi_g / 2) * scale)} fill={c.grid} />
          <circle cx={x} cy={oy + cTop} r={Math.max(1.2, (sec.phi_g / 2) * scale)} fill={c.grid} />
        </g>
      ))}
      {/* Barras de banda (inferiores) y superiores */}
      {bands.map((b, bi) => (
        <g key={`bars-${bi}`}>
          {dotsAt(b.c, b.w, nBars, 1).map((x, i) => (
            <circle key={`b-${i}`} cx={x} cy={oy + capH - cov} r={rBar} fill={c.bottom} />
          ))}
          {dotsAt(b.c, b.w, sec.n_top, topFactor).map((x, i) => (
            <circle key={`t-${i}`} cx={x} cy={oy + cTop} r={Math.max(1.6, (sec.phi_top / 2) * scale)} fill={c.top} />
          ))}
        </g>
      ))}
      {/* Rótulos */}
      <text x={ox + capW + 6} y={oy + (capH + cTop - cov) / 2} fontSize={isPdf ? 6.5 : 9.5}
        fill={c.face} fontFamily={FONT} dominantBaseline="middle">
        {`Ø${sec.phi_ch} c/${sec.s_ch}`}
      </text>
      <text x={ox + capW + 6} y={oy + (capH + cTop - cov) / 2 + 11} fontSize={isPdf ? 6.5 : 9.5}
        fill={c.face} fontFamily={FONT} dominantBaseline="middle">
        por cara
      </text>
      <text x={ox + capW + 6} y={oy + capH - cov + 3} fontSize={isPdf ? 6.5 : 9.5}
        fill={c.grid} fontFamily={FONT}>
        {`malla Ø${sec.phi_g} c/${sec.s_g}`}
      </text>
      <text x={X(0)} y={oy - colStub + 10} textAnchor="middle" fontSize={isPdf ? 6.5 : 9.5}
        fill={c.stirrup} fontFamily={FONT}>
        {n === 2 ? `cerco Ø${sec.phi_cv} · ${sec.n_cv} ramas` : `cercos de banda Ø${sec.phi_cv} · ${sec.n_cv} ramas`}
      </text>
      <text x={ox - 4} y={oy + capH - cov} textAnchor="end" fontSize={isPdf ? 6.5 : 9.5}
        fill={c.bottom} fontFamily={FONT} dominantBaseline="middle">
        {`${nBars}Ø${phi_tie}`}
      </text>
    </g>
  );
}

// ── Leyenda ───────────────────────────────────────────────────────────────────

function legendItems(inp: PileCapInputs, result: PileCapResult, sec: Sec, c: ReturnType<typeof colors>) {
  const n = inp.n as number;
  const phi_tie = inp.phi_tie as number;
  // Con tirantes en los dos sentidos la inferior lleva DOS líneas: hasta ahora
  // la leyenda sólo rotulaba la de x y los 9Ø20 de la otra dirección se
  // quedaban sin nombre. Con dos micropilotes no hay banda: barre todo el ancho.
  const dosSentidos = result.n_bars_y !== null && result.As_prov_y !== null;
  const inferior = dosSentidos
    ? { color: c.bottom, text: `Inferior dir. x: ${result.n_bars_x}Ø${phi_tie} por banda (${result.As_prov_x.toFixed(0)} mm²)` }
    : {
      color: c.bottom,
      text: n === 2
        ? `Inferior: ${result.n_bars_x}Ø${phi_tie} en todo el ancho (${result.As_prov_x.toFixed(0)} mm²)`
        : `Inferior: ${result.n_bars_x}Ø${phi_tie} por banda (${result.As_prov_x.toFixed(0)} mm²)`,
    };
  const inferiorY = dosSentidos
    ? [{ color: c.bottom, text: `Inferior dir. y: ${result.n_bars_y}Ø${phi_tie} por banda (${result.As_prov_y!.toFixed(0)} mm²)` }]
    : [];
  const donde = n === 2 ? 'en todo el ancho' : 'por banda';
  const superior = (suffix: string) => ({ color: c.top, dash: '6 3', text: `Superior${suffix}: ${sec.n_top}Ø${sec.phi_top} ${donde} (${result.As_top_prov.toFixed(0)} mm²)` });
  const caras = (suffix: string) => ({ color: c.face, dash: '5 3', text: `Horizontal caras${suffix}: Ø${sec.phi_ch} c/${sec.s_ch} (${result.As_ch_prov.toFixed(0)} mm²/m)` });
  const malla = {
    color: c.grid,
    text: `Malla arriba y abajo: Ø${sec.phi_g} c/${sec.s_g} (${result.As_g_prov.toFixed(0)} mm²/m por cara)`,
  };
  if (n === 2) {
    return [
      inferior,
      malla,
      superior(''),
      { color: c.stirrup, text: `Cercos: Ø${sec.phi_cv} c/${sec.s_cv}, ${sec.n_cv} ramas (${result.As_cv_prov.toFixed(0)} mm²/m)` },
      caras(''),
    ];
  }
  return [
    inferior,
    ...inferiorY,
    malla,
    { color: c.stirrup, text: `Cercos de banda: Ø${sec.phi_cv} c/${sec.s_cv}, ${sec.n_cv} ramas (${result.As_cv_prov.toFixed(0)} mm²/m)` },
    superior(' (práctica)'),
    caras(' (práctica)'),
  ];
}

function Legend({
  inp, result, width, isPdf, sec,
}: { inp: PileCapInputs; result: PileCapResult; width: number; isPdf: boolean; sec: Sec }) {
  const c = colors(isPdf);
  const items: { color: string; dash?: string; text: string }[] = legendItems(inp, result, sec, c);
  const fs = isPdf ? 6.5 : 9.5;
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
// Dos plantas (inferior y superior) arriba, las secciones debajo y la leyenda al
// pie. Con tirantes en los dos sentidos (4 y 6 micropilotes) son DOS parejas de
// secciones, una por dirección, apiladas: la del otro sentido faltaba y su
// armadura sólo se veía en la planta. Plantas lado a lado desde 400 px y cada
// pareja de secciones lado a lado desde 520 px (clon del PDF); en móvil todo se
// apila.

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
  const gap = 10;
  const plansSide = width >= 400;
  const planSize = plansSide ? Math.min((width - gap) / 2, 280) : Math.min(width, 280);
  const plansH = plansSide ? planSize : 2 * planSize + gap;
  const plansX0 = plansSide ? (width - 2 * planSize - gap) / 2 : (width - planSize) / 2;
  const plan2X = plansSide ? plansX0 + planSize + gap : plansX0;
  const plan2Y = plansSide ? 0 : planSize + gap;

  const axY = result.n_bars_y !== null ? axisInfo(inp, result, 'y', false) : null;
  const dosParejas = axY !== null && !mismaFigura(axisInfo(inp, result, 'x', false), axY);
  const dirs: Dir[] = dosParejas ? ['x', 'y'] : ['x'];
  const axes = dirs.map((d) => axisInfo(inp, result, d, dosParejas));
  const secsSide = width >= 520;
  const secW = secsSide ? (width - gap) / 2 : width;
  const secH = Math.round(secW * (secsSide ? 0.62 : 0.5));
  const secRows = secsSide ? axes.length : 2 * axes.length;
  const secsH = secRows * secH + (secRows - 1) * gap;
  const secsY = plansH + gap;

  const legendRows = legendItems(inp, result, sec, colors(isPdf)).length;
  const legendH = (width >= 520 ? Math.ceil(legendRows / 2) : legendRows) * 14 + 8;
  const totalH = secsY + secsH + gap + legendH;

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
        <g transform={`translate(${plansX0},0)`}>
          <PlanRebar inp={inp} result={result} size={planSize} isPdf={isPdf} sec={sec} layer="inferior" />
        </g>
        <g transform={`translate(${plan2X},${plan2Y})`}>
          <PlanRebar inp={inp} result={result} size={planSize} isPdf={isPdf} sec={sec} layer="superior" />
        </g>
        {axes.map((ax, i) => {
          const yLong = secsY + (secsSide ? i : 2 * i) * (secH + gap);
          const xTrans = secsSide ? secW + gap : 0;
          const yTrans = secsSide ? yLong : yLong + secH + gap;
          return (
            <g key={ax.dir}>
              <g transform={`translate(0,${yLong})`}>
                <LongSection inp={inp} result={result} width={secW} height={secH} isPdf={isPdf} sec={sec} ax={ax} />
              </g>
              <g transform={`translate(${xTrans},${yTrans})`}>
                <TransSection inp={inp} result={result} width={secW} height={secH} isPdf={isPdf} sec={sec} ax={ax} />
              </g>
            </g>
          );
        })}
        <g transform={`translate(0,${secsY + secsH + gap})`}>
          <Legend inp={inp} result={result} width={width} isPdf={isPdf} sec={sec} />
        </g>
      </svg>
    </div>
  );
}
