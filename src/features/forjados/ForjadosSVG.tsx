import { type ForjadosInputs, type ForjadosVariant } from '../../data/defaults';
import { type ForjadosResult } from '../../lib/calculations/rcSlabs';

interface Props {
  inp: ForjadosInputs;
  result: ForjadosResult;
  section: 'vano' | 'apoyo';
  width: number;
  mode?: 'screen' | 'pdf';
}

export function ForjadosSVG({ inp, result, section, width, mode = 'screen' }: Props) {
  const variant = inp.variant as ForjadosVariant;
  const isPdf = mode === 'pdf';

  // Common color tokens
  const bgFill       = isPdf ? '#ddd' : 'var(--color-bg-surface, #1e293b)';
  const strokeBorder = isPdf ? '#333' : '#475569';   // border-main lighter
  const strokeBar    = isPdf ? '#000' : '#f8fafc';   // text-primary
  const strokeAccent = isPdf ? '#000' : '#38bdf8';   // accent — neutral axis + cotas
  const textCol      = isPdf ? '#333' : '#94a3b8';

  const PAD_X = 40;
  const PAD_Y = 30;
  const innerW = width - 2 * PAD_X;

  if (variant === 'reticular') {
    const h       = inp.h as number;
    const hFlange = inp.hFlange as number;
    const bWeb    = inp.bWeb as number;
    const bEff    = result.bEff || (inp.intereje as number);
    const cover   = inp.cover as number;
    const isVano  = section === 'vano';

    // scale to fit bEff horizontally
    const scale = innerW / bEff;
    const h_px    = h       * scale;
    const hF_px   = hFlange * scale;
    const bW_px   = bWeb    * scale;
    const bE_px   = bEff    * scale;

    const ox = width / 2;
    const svgH = h_px + 2 * PAD_Y + 40;
    const topY = PAD_Y + 20;

    // Tension side: vano → bottom; apoyo → top (negative moment)
    // But geometry of T is always ala on top, nervio below.
    // For apoyo the M- puts tension in the top fibers (ala face). We still
    // draw the same T and annotate "tension = top" accordingly.
    const tensionOnTop = !isVano;

    const sec = isVano ? result.vano : result.apoyo;
    const x_px = sec.x * scale;

    // Neutral axis depth measured from the compression face.
    // Vano (reticular): compression on top (ala) → axis from topY downward.
    // Apoyo (reticular): compression on bottom (nervio) → axis from bottom upward.
    const axisY = tensionOnTop ? topY + h_px - x_px : topY + x_px;

    // Tension face: base (always) + refuerzo (zonal, may be 0).
    // For vano → tension = cara inferior; para apoyo → tension = cara superior.
    const baseDiam = isVano
      ? (inp.base_inf_barDiam as number)
      : (inp.base_sup_barDiam as number);
    const baseNum  = isVano
      ? (inp.base_inf_nBars as number)
      : (inp.base_sup_nBars as number);
    const refDiam = isVano
      ? (inp.refuerzo_vano_inf_barDiam  as number)
      : (inp.refuerzo_apoyo_sup_barDiam as number);
    const refNum  = isVano
      ? (inp.refuerzo_vano_inf_nBars  as number)
      : (inp.refuerzo_apoyo_sup_nBars as number);

    // Base bars sit at cover + Ø_base/2 from tension face; refuerzo shares the same layer.
    const barY_tension = tensionOnTop
      ? topY + cover * scale + (baseDiam * scale) / 2
      : topY + h_px - cover * scale - (baseDiam * scale) / 2;

    // Compression face shows the opposite face's base (montaje continuo).
    const conDiam = isVano
      ? (inp.base_sup_barDiam as number)
      : (inp.base_inf_barDiam as number);
    const conNum  = isVano
      ? (inp.base_sup_nBars as number)
      : (inp.base_inf_nBars as number);
    const barY_con = tensionOnTop
      ? topY + h_px - cover * scale - (conDiam * scale) / 2
      : topY + cover * scale + (conDiam * scale) / 2;

    // Bar X positions inside b_w
    const barPositions = (count: number): number[] => {
      if (count <= 0) return [];
      if (count === 1) return [ox];
      const clearance = Math.max(cover * scale, 4);
      const span = bW_px - 2 * clearance;
      const step = span / (count - 1);
      return Array.from({ length: count }, (_, i) => ox - bW_px / 2 + clearance + i * step);
    };
    const baseBarsX = barPositions(baseNum);
    const refBarsX  = barPositions(refNum);
    const conBarsX  = barPositions(conNum);

    // Nervio only in reticular needs to be clipped to (h - hFlange) below the ala
    // Shape: top rect = ala (bEff × hFlange), below = nervio (bWeb × (h-hFlange))
    return (
      <div className={mode === 'screen' ? 'canvas-dot-grid' : undefined}>
        <svg
          width={width}
          height={svgH}
          viewBox={`0 0 ${width} ${svgH}`}
          aria-label="Sección T — forjado reticular"
        >
          {!isPdf && <rect width={width} height={svgH} fill="var(--color-bg-canvas, #0f172a)" />}

          {/* Ala (capa compresión) */}
          <rect
            x={ox - bE_px / 2} y={topY}
            width={bE_px} height={hF_px}
            fill={bgFill} stroke={strokeBorder} strokeWidth={1}
          />
          {/* Nervio */}
          <rect
            x={ox - bW_px / 2} y={topY + hF_px}
            width={bW_px} height={h_px - hF_px}
            fill={bgFill} stroke={strokeBorder} strokeWidth={1}
          />

          {/* Neutral axis */}
          <line
            x1={ox - bE_px / 2 - 10} y1={axisY}
            x2={ox + bE_px / 2 + 10} y2={axisY}
            stroke={strokeAccent} strokeWidth={1} strokeDasharray="5 3"
          />
          <text
            x={ox + bE_px / 2 + 14} y={axisY + 3}
            fontSize={10} fontFamily="monospace" fill={strokeAccent}
          >
            x = {sec.x.toFixed(0)}
          </text>

          {/* Base tension bars (solid white) */}
          {baseBarsX.map((bx, i) => (
            <circle
              key={`tb-${i}`}
              cx={bx} cy={barY_tension}
              r={Math.max((baseDiam * scale) / 2, 2)}
              fill={strokeBar} stroke={strokeBar}
            />
          ))}
          {/* Refuerzo zonal (accent outline, offset inward slightly to stack visually) */}
          {refBarsX.map((bx, i) => {
            const rY = tensionOnTop
              ? barY_tension + (baseDiam * scale) / 2 + (refDiam * scale) / 2 + 1
              : barY_tension - (baseDiam * scale) / 2 - (refDiam * scale) / 2 - 1;
            return (
              <circle
                key={`tr-${i}`}
                cx={bx} cy={rY}
                r={Math.max((refDiam * scale) / 2, 2)}
                fill={strokeAccent} stroke={strokeAccent}
              />
            );
          })}
          {/* Compression-face base (montaje opuesto — outline only) */}
          {conBarsX.map((bx, i) => (
            <circle
              key={`c-${i}`}
              cx={bx} cy={barY_con}
              r={Math.max((conDiam * scale) / 2, 2)}
              fill="none" stroke={strokeBar} strokeWidth={1}
            />
          ))}

          {/* Cota b_eff */}
          <line
            x1={ox - bE_px / 2} y1={topY - 10}
            x2={ox + bE_px / 2} y2={topY - 10}
            stroke={strokeAccent} strokeWidth={0.75}
          />
          <text
            x={ox} y={topY - 14}
            fontSize={10} fontFamily="monospace" textAnchor="middle" fill={strokeAccent}
          >
            b_eff = {bEff.toFixed(0)}
          </text>

          {/* Cota b_w */}
          <line
            x1={ox - bW_px / 2} y1={topY + h_px + 10}
            x2={ox + bW_px / 2} y2={topY + h_px + 10}
            stroke={textCol} strokeWidth={0.75}
          />
          <text
            x={ox} y={topY + h_px + 22}
            fontSize={10} fontFamily="monospace" textAnchor="middle" fill={textCol}
          >
            b_w = {bWeb}
          </text>

          {/* Cota h lateral */}
          <text
            x={ox + bE_px / 2 + 14} y={topY + h_px / 2 + 4}
            fontSize={10} fontFamily="monospace" fill={textCol}
          >
            h = {h}
          </text>
        </svg>
      </div>
    );
  }

  // ── Losa maciza (rectangular 1000 × h) ─────────────────────────────────────
  const h     = inp.h as number;
  const cover = inp.cover as number;
  const isVano = section === 'vano';
  const bRef  = 1000;

  const scale = innerW / bRef;
  const h_px = h * scale;
  const b_px = bRef * scale;
  const ox = width / 2;
  const topY = PAD_Y + 20;
  const svgH = h_px + 2 * PAD_Y + 40;

  const sec = isVano ? result.vano : result.apoyo;
  const tensionOnTop = !isVano;
  const x_px = sec.x * scale;
  const axisY = tensionOnTop ? topY + h_px - x_px : topY + x_px;

  // Bars: parrilla base Ø/s siempre + parrilla refuerzo zonal opcional.
  const basePhi = isVano
    ? (inp.base_inf_phi_mac as number)
    : (inp.base_sup_phi_mac as number);
  const baseS   = isVano
    ? (inp.base_inf_s_mac as number)
    : (inp.base_sup_s_mac as number);
  const refPhi = isVano
    ? (inp.refuerzo_vano_inf_phi_mac   as number)
    : (inp.refuerzo_apoyo_sup_phi_mac  as number);
  const refS   = isVano
    ? (inp.refuerzo_vano_inf_s_mac    as number)
    : (inp.refuerzo_apoyo_sup_s_mac   as number);
  const hasRef = refPhi > 0 && refS > 0;

  const nBase = Math.max(1, Math.floor(bRef / baseS));
  const nRef  = hasRef ? Math.max(1, Math.floor(bRef / refS)) : 0;

  const barY_base = tensionOnTop
    ? topY + cover * scale + (basePhi * scale) / 2
    : topY + h_px - cover * scale - (basePhi * scale) / 2;
  // Refuerzo sits on top of base (toward neutral axis).
  const barY_ref = tensionOnTop
    ? barY_base + (basePhi * scale) / 2 + (refPhi * scale) / 2 + 1
    : barY_base - (basePhi * scale) / 2 - (refPhi * scale) / 2 - 1;

  const clearance = Math.max(cover * scale, 4);
  const spreadBars = (count: number): number[] => {
    if (count <= 0) return [];
    if (count === 1) return [ox];
    const span = b_px - 2 * clearance;
    const step = span / (count - 1);
    return Array.from({ length: count }, (_, i) => ox - b_px / 2 + clearance + i * step);
  };
  const baseBars = spreadBars(nBase);
  const refBars  = spreadBars(nRef);

  return (
    <div className={mode === 'screen' ? 'canvas-dot-grid' : undefined}>
      <svg
        width={width}
        height={svgH}
        viewBox={`0 0 ${width} ${svgH}`}
        aria-label="Sección rectangular — losa maciza"
      >
        {!isPdf && <rect width={width} height={svgH} fill="var(--color-bg-canvas, #0f172a)" />}

        {/* Losa rectangular */}
        <rect
          x={ox - b_px / 2} y={topY}
          width={b_px} height={h_px}
          fill={bgFill} stroke={strokeBorder} strokeWidth={1}
        />

        {/* Neutral axis */}
        <line
          x1={ox - b_px / 2 - 10} y1={axisY}
          x2={ox + b_px / 2 + 10} y2={axisY}
          stroke={strokeAccent} strokeWidth={1} strokeDasharray="5 3"
        />
        <text
          x={ox + b_px / 2 + 14} y={axisY + 3}
          fontSize={10} fontFamily="monospace" fill={strokeAccent}
        >
          x = {sec.x.toFixed(0)}
        </text>

        {/* Parrilla base */}
        {baseBars.map((bx, i) => (
          <circle key={`mb-${i}`} cx={bx} cy={barY_base}
            r={Math.max((basePhi * scale) / 2, 2)}
            fill={strokeBar} stroke={strokeBar} />
        ))}
        {/* Refuerzo zonal (accent) */}
        {refBars.map((bx, i) => (
          <circle key={`mr-${i}`} cx={bx} cy={barY_ref}
            r={Math.max((refPhi * scale) / 2, 2)}
            fill={strokeAccent} stroke={strokeAccent} />
        ))}

        {/* Cota b = 1000 */}
        <line
          x1={ox - b_px / 2} y1={topY - 10}
          x2={ox + b_px / 2} y2={topY - 10}
          stroke={textCol} strokeWidth={0.75}
        />
        <text
          x={ox} y={topY - 14}
          fontSize={10} fontFamily="monospace" textAnchor="middle" fill={textCol}
        >
          b = 1000 (franja 1 m)
        </text>

        {/* Cota h lateral */}
        <text
          x={ox + b_px / 2 + 14} y={topY + h_px / 2 + 4}
          fontSize={10} fontFamily="monospace" fill={textCol}
        >
          h = {h}
        </text>

        {/* Armado Ø/s label */}
        <text
          x={ox} y={topY + h_px + 22}
          fontSize={10} fontFamily="monospace" textAnchor="middle" fill={textCol}
        >
          {`base Ø${basePhi}/${baseS}`}{hasRef ? ` + ref Ø${refPhi}/${refS}` : ''}
        </text>
      </svg>
    </div>
  );
}
