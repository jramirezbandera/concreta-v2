/* eslint-disable react-refresh/only-export-components -- co-locates the HERO_CANVASES
   map with the small presentational SVG components it indexes; these are static
   landing visuals, so HMR full-reload is acceptable. */
// canvases.tsx — honest per-module schematics for the hero carousel.
//
// Each slide draws a real structural view of its module (FEM continuous-beam
// elevation, RC cross-section with rebar, steel I-profile, retaining-wall
// section). They show geometry only — never fabricated check results — so they
// can't drift into a lie the way the old hand-drawn full-UI replica (AppPreview)
// did. All share the same 520×300 viewBox so they swap cleanly in one frame.

import type { ReactElement } from 'react';
import type { HeroCanvasKind } from '../../heroCase';
import { HERO_CASE, PORTAL_FRAME } from '../../heroCase';

const VB = '0 0 520 300';

// ── FEM 2D — portal frame elevation (the openable case) ──────────────────────
//
// Geometry comes from PORTAL_FRAME, derived from the same FEM 2D model the
// slide's deep-link opens — the drawing cannot show a frame you can't open.
// Static, like the other four slides.

/** Caption row. Must clear the load rail, drawn 30 px above the beam. */
const LABEL_Y = 32;

function Fem2dCanvas() {
  const x0 = 78;
  const x1 = 442;
  const baseY = 236;
  const topY = 92;

  const { span, height, members, nodes, supports, loadedMembers } = PORTAL_FRAME;
  const px = (x: number) => x0 + (span === 0 ? 0 : (x / span) * (x1 - x0));
  // Model +y is up; screen +y is down.
  const py = (y: number) => baseY - (height === 0 ? 0 : (y / height) * (baseY - topY));

  const nodeAt = (id: string) => nodes.find((n) => n.id === id);

  return (
    <svg viewBox={VB} className="hero-slide-svg" aria-hidden="true">
      <g>
        {loadedMembers.map((id) => {
          const m = members.find((mm) => mm.id === id);
          if (!m) return null;
          const y = py(Math.max(m.y1, m.y2));
          const ax0 = px(Math.min(m.x1, m.x2));
          const ax1 = px(Math.max(m.x1, m.x2));
          const railY = y - 30;
          const n = 9;
          return (
            <g key={id} stroke="var(--accent)" strokeWidth="0.9">
              <line x1={ax0} y1={railY} x2={ax1} y2={railY} strokeWidth="1.2" />
              {Array.from({ length: n }, (_, i) => {
                const ax = ax0 + ((i + 0.5) / n) * (ax1 - ax0);
                return (
                  <g key={i}>
                    <line x1={ax} y1={railY} x2={ax} y2={y - 6} />
                    <polygon
                      points={`${ax},${y - 2} ${ax - 3},${y - 8} ${ax + 3},${y - 8}`}
                      fill="var(--accent)"
                      stroke="none"
                    />
                  </g>
                );
              })}
            </g>
          );
        })}

        {members.map((m) => (
          <line
            key={m.id}
            x1={px(m.x1)}
            y1={py(m.y1)}
            x2={px(m.x2)}
            y2={py(m.y2)}
            stroke="var(--text-primary)"
            strokeWidth="3.5"
            strokeLinecap="square"
          />
        ))}

        {supports.map((id) => {
          const n = nodeAt(id);
          if (!n) return null;
          const sx = px(n.x);
          const sy = py(n.y);
          return (
            <g key={id} stroke="var(--text-secondary)" strokeWidth="1.4">
              <line x1={sx - 16} y1={sy} x2={sx + 16} y2={sy} strokeWidth="2.4" />
              {Array.from({ length: 5 }, (_, i) => {
                const hx = sx - 14 + i * 7;
                return <line key={i} x1={hx} y1={sy} x2={hx - 6} y2={sy + 8} />;
              })}
            </g>
          );
        })}

        {nodes.map((n) => (
          <circle
            key={n.id}
            cx={px(n.x)}
            cy={py(n.y)}
            r="4"
            fill="var(--bg-canvas)"
            stroke="var(--accent)"
            strokeWidth="2"
          />
        ))}

        <text
          x={(x0 + x1) / 2}
          y={LABEL_Y}
          textAnchor="middle"
          fontFamily="var(--font-mono)"
          fontSize="12"
          fill="var(--accent)"
        >
          pórtico biempotrado
        </text>
      </g>
    </svg>
  );
}

// ── FEM 1D — continuous beam elevation (the openable case) ───────────────────
function FemCanvas() {
  const x0 = 54;
  const x1 = 466;
  const baseY = 168;
  const xs = HERO_CASE.nodeX;
  const total = xs[xs.length - 1] - xs[0] || 1;
  const px = (m: number) => x0 + ((m - xs[0]) / total) * (x1 - x0);
  const supX = xs.map(px);

  const railY = 96;
  const nArrows = 15;
  const arrowXs = Array.from({ length: nArrows }, (_, i) => x0 + ((i + 0.5) / nArrows) * (x1 - x0));

  return (
    <svg viewBox={VB} className="hero-slide-svg" aria-hidden="true">
      <rect x={x0} y={railY} width={x1 - x0} height={baseY - railY} fill="var(--accent)" opacity="0.06" />
      <line x1={x0} y1={railY} x2={x1} y2={railY} stroke="var(--accent)" strokeWidth="1.2" />
      {arrowXs.map((ax, i) => (
        <g key={i} stroke="var(--accent)" strokeWidth="0.9">
          <line x1={ax} y1={railY} x2={ax} y2={baseY - 6} />
          <polygon points={`${ax},${baseY - 2} ${ax - 3},${baseY - 8} ${ax + 3},${baseY - 8}`} fill="var(--accent)" stroke="none" />
        </g>
      ))}
      <text x={x1 - 4} y={railY - 8} textAnchor="end" fontFamily="var(--font-mono)" fontSize="11" fill="var(--accent)">
        q = {HERO_CASE.load} kN/m
      </text>

      <line x1={x0} y1={baseY} x2={x1} y2={baseY} stroke="var(--text-primary)" strokeWidth="2.4" />

      <path
        d={supX
          .slice(0, -1)
          .map((sx, i) => {
            const nx = supX[i + 1];
            const mid = (sx + nx) / 2;
            return `${i === 0 ? `M ${sx} ${baseY}` : ''} Q ${mid} ${baseY + 26} ${nx} ${baseY}`;
          })
          .join(' ')}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.4"
        strokeDasharray="5 3"
        opacity="0.8"
      />

      {supX.map((sx, i) => (
        <g key={i} stroke="var(--text-secondary)" strokeWidth="1.2">
          <polygon points={`${sx},${baseY} ${sx - 8},${baseY + 14} ${sx + 8},${baseY + 14}`} fill="none" />
          {i === 0 ? (
            <>
              <line x1={sx - 12} y1={baseY + 14} x2={sx + 12} y2={baseY + 14} />
              {[-9, -3, 3, 9].map((o) => (
                <line key={o} x1={sx + o} y1={baseY + 14} x2={sx + o - 5} y2={baseY + 20} strokeWidth="0.8" />
              ))}
            </>
          ) : (
            <>
              <circle cx={sx - 4} cy={baseY + 17} r="2.4" fill="none" strokeWidth="0.9" />
              <circle cx={sx + 4} cy={baseY + 17} r="2.4" fill="none" strokeWidth="0.9" />
              <line x1={sx - 12} y1={baseY + 21} x2={sx + 12} y2={baseY + 21} strokeWidth="0.8" />
            </>
          )}
        </g>
      ))}

      <g stroke="var(--text-disabled)" strokeWidth="0.7">
        <line x1={x0} y1={baseY + 42} x2={x1} y2={baseY + 42} />
        {supX.map((sx, i) => (
          <line key={i} x1={sx} y1={baseY + 38} x2={sx} y2={baseY + 46} />
        ))}
      </g>
      <text x={(x0 + x1) / 2} y={baseY + 60} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="11" fill="var(--text-disabled)">
        L = {HERO_CASE.spanLabel}
      </text>
    </svg>
  );
}

// ── RC beam — reinforced-concrete cross-section ──────────────────────────────
function RcBeamCanvas() {
  const x = 197;
  const y = 44;
  const w = 126;
  const h = 210;
  const sIn = 12; // stirrup inset
  const botY = y + h - sIn - 5;
  const topY = y + sIn + 5;
  const botXs = [0, 1, 2, 3].map((i) => x + sIn + 8 + (i * (w - 2 * (sIn + 8))) / 3);
  const topXs = [x + sIn + 8, x + w - sIn - 8];

  return (
    <svg viewBox={VB} className="hero-slide-svg" aria-hidden="true">
      {/* concrete outline */}
      <rect x={x} y={y} width={w} height={h} fill="var(--accent)" fillOpacity="0.04" stroke="var(--text-primary)" strokeWidth="1.6" />
      {/* stirrup */}
      <rect x={x + sIn} y={y + sIn} width={w - 2 * sIn} height={h - 2 * sIn} rx="4" fill="none" stroke="var(--text-disabled)" strokeWidth="1" />
      {/* longitudinal bars: 4Ø20 bottom (tension), 2Ø12 top */}
      {botXs.map((bx, i) => (
        <circle key={`b${i}`} cx={bx} cy={botY} r="5" fill="var(--accent)" />
      ))}
      {topXs.map((tx, i) => (
        <circle key={`t${i}`} cx={tx} cy={topY} r="3.5" fill="var(--text-secondary)" />
      ))}
      {/* width dimension */}
      <g stroke="var(--text-disabled)" strokeWidth="0.7">
        <line x1={x} y1={y + h + 16} x2={x + w} y2={y + h + 16} />
        <line x1={x} y1={y + h + 11} x2={x} y2={y + h + 21} />
        <line x1={x + w} y1={y + h + 11} x2={x + w} y2={y + h + 21} />
      </g>
      <text x={x + w / 2} y={y + h + 34} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="11" fill="var(--text-disabled)">
        b = 300 mm
      </text>
      {/* height dimension */}
      <g stroke="var(--text-disabled)" strokeWidth="0.7">
        <line x1={x - 16} y1={y} x2={x - 16} y2={y + h} />
        <line x1={x - 21} y1={y} x2={x - 11} y2={y} />
        <line x1={x - 21} y1={y + h} x2={x - 11} y2={y + h} />
      </g>
      <text
        x={x - 30}
        y={y + h / 2}
        textAnchor="middle"
        transform={`rotate(-90, ${x - 30}, ${y + h / 2})`}
        fontFamily="var(--font-mono)"
        fontSize="11"
        fill="var(--text-disabled)"
      >
        h = 500 mm
      </text>
      <text x={x + w + 18} y={botY + 4} fontFamily="var(--font-mono)" fontSize="11" fill="var(--accent)">
        4Ø20
      </text>
    </svg>
  );
}

// ── Steel beam — rolled I-profile (IPE) cross-section ────────────────────────
function SteelBeamCanvas() {
  const cx = 260;
  const y = 54;
  const H = 194;
  const bf = 116;
  const tf = 12;
  const tw = 9;

  return (
    <svg viewBox={VB} className="hero-slide-svg" aria-hidden="true">
      {/* label above the profile so it never overlaps the drawing */}
      <text x={cx} y={y - 20} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="13" fontWeight="600" fill="var(--text-primary)">
        IPE 300
      </text>
      {/* profile — thin outlines (a rolled section reads lighter than a slab) */}
      <rect x={cx - bf / 2} y={y} width={bf} height={tf} stroke="var(--text-primary)" fill="var(--accent)" fillOpacity="0.05" strokeWidth="1.2" />
      <rect x={cx - tw / 2} y={y + tf} width={tw} height={H - 2 * tf} stroke="var(--text-primary)" fill="var(--accent)" fillOpacity="0.05" strokeWidth="1.2" />
      <rect x={cx - bf / 2} y={y + H - tf} width={bf} height={tf} stroke="var(--text-primary)" fill="var(--accent)" fillOpacity="0.05" strokeWidth="1.2" />
      {/* strong axis y–y */}
      <line x1={cx - bf / 2 - 22} y1={y + H / 2} x2={cx + bf / 2 + 22} y2={y + H / 2} stroke="var(--accent)" strokeWidth="1" strokeDasharray="5 3" />
      <text x={cx + bf / 2 + 26} y={y + H / 2 + 4} fontFamily="var(--font-mono)" fontSize="11" fill="var(--accent)">
        y–y
      </text>
      {/* height dimension */}
      <g stroke="var(--text-disabled)" strokeWidth="0.7">
        <line x1={cx - bf / 2 - 40} y1={y} x2={cx - bf / 2 - 40} y2={y + H} />
        <line x1={cx - bf / 2 - 45} y1={y} x2={cx - bf / 2 - 35} y2={y} />
        <line x1={cx - bf / 2 - 45} y1={y + H} x2={cx - bf / 2 - 35} y2={y + H} />
      </g>
      <text
        x={cx - bf / 2 - 54}
        y={y + H / 2}
        textAnchor="middle"
        transform={`rotate(-90, ${cx - bf / 2 - 54}, ${y + H / 2})`}
        fontFamily="var(--font-mono)"
        fontSize="11"
        fill="var(--text-disabled)"
      >
        h = 300 mm
      </text>
      {/* width dimension */}
      <g stroke="var(--text-disabled)" strokeWidth="0.7">
        <line x1={cx - bf / 2} y1={y + H + 16} x2={cx + bf / 2} y2={y + H + 16} />
        <line x1={cx - bf / 2} y1={y + H + 11} x2={cx - bf / 2} y2={y + H + 21} />
        <line x1={cx + bf / 2} y1={y + H + 11} x2={cx + bf / 2} y2={y + H + 21} />
      </g>
      <text x={cx} y={y + H + 34} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="11" fill="var(--text-disabled)">
        b = 150 mm
      </text>
    </svg>
  );
}

// ── Retaining wall — cantilever wall section with earth pressure ─────────────
function WallCanvas() {
  const footY = 226; // top of footing
  const footX = 176;
  const footW = 210;
  const footH = 16;
  const stemTopY = 58;
  const stemBotL = 214;
  const stemBotR = 246;
  const stemTopL = 214;
  const stemTopR = 232;

  return (
    <svg viewBox={VB} className="hero-slide-svg" aria-hidden="true">
      {/* backfill soil hatch (behind the stem, to the right) */}
      <line x1={stemTopR} y1={stemTopY} x2={392} y2={stemTopY} stroke="var(--text-disabled)" strokeWidth="0.7" strokeDasharray="3 2" />
      {Array.from({ length: 9 }).map((_, i) => {
        const yy = stemTopY + 12 + i * 18;
        const x1 = stemBotR - ((footY - yy) / (footY - stemTopY)) * (stemBotR - stemTopR);
        return <line key={i} x1={x1 + 4} y1={yy} x2={388} y2={yy} stroke="var(--text-disabled)" strokeWidth="0.4" />;
      })}
      {/* earth-pressure arrows (triangular: larger near the base) */}
      {[0.3, 0.55, 0.8].map((f, i) => {
        const yy = stemTopY + f * (footY - stemTopY);
        const len = 16 + f * 34;
        const tail = stemBotR - ((footY - yy) / (footY - stemTopY)) * (stemBotR - stemTopR);
        const head = tail - len;
        return (
          <g key={i} stroke="var(--accent)" strokeWidth="1.1">
            <line x1={tail} y1={yy} x2={head} y2={yy} />
            <polygon points={`${head},${yy} ${head + 6},${yy - 3} ${head + 6},${yy + 3}`} fill="var(--accent)" stroke="none" />
          </g>
        );
      })}
      <text x={352} y={stemTopY + 40} fontFamily="var(--font-mono)" fontSize="11" fill="var(--accent)">
        Ea
      </text>

      {/* footing */}
      <rect x={footX} y={footY} width={footW} height={footH} fill="var(--accent)" fillOpacity="0.05" stroke="var(--text-primary)" strokeWidth="1.6" />
      {/* stem */}
      <polygon
        points={`${stemBotL},${footY} ${stemBotR},${footY} ${stemTopR},${stemTopY} ${stemTopL},${stemTopY}`}
        fill="var(--accent)"
        fillOpacity="0.05"
        stroke="var(--text-primary)"
        strokeWidth="1.6"
      />
      {/* ground line under footing */}
      <line x1={132} y1={footY + footH} x2={410} y2={footY + footH} stroke="var(--text-primary)" strokeWidth="1" />
      {[145, 165, 185, 205, 225, 245, 265, 285, 305, 325, 345, 365].map((gx) => (
        <line key={gx} x1={gx} y1={footY + footH} x2={gx - 6} y2={footY + footH + 8} stroke="var(--text-disabled)" strokeWidth="0.5" />
      ))}
      {/* height dimension */}
      <g stroke="var(--text-disabled)" strokeWidth="0.7">
        <line x1={footX - 16} y1={stemTopY} x2={footX - 16} y2={footY} />
        <line x1={footX - 21} y1={stemTopY} x2={footX - 11} y2={stemTopY} />
        <line x1={footX - 21} y1={footY} x2={footX - 11} y2={footY} />
      </g>
      <text
        x={footX - 30}
        y={(stemTopY + footY) / 2}
        textAnchor="middle"
        transform={`rotate(-90, ${footX - 30}, ${(stemTopY + footY) / 2})`}
        fontFamily="var(--font-mono)"
        fontSize="11"
        fill="var(--text-disabled)"
      >
        H = 3.50 m
      </text>
    </svg>
  );
}

export const HERO_CANVASES: Record<HeroCanvasKind, () => ReactElement> = {
  fem2d: Fem2dCanvas,
  fem: FemCanvas,
  'rc-beam': RcBeamCanvas,
  'steel-beam': SteelBeamCanvas,
  wall: WallCanvas,
};
