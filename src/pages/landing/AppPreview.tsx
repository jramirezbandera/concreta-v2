// AppPreview — parameterized mini replica of the Concreta UI.
// Pass `moduleId` to switch which module is shown (breadcrumb, sidebar active,
// inputs, canvas SVG, checks). Used inside the hero carousel and the demo card.

import { Fragment } from 'react';
import './app-preview.css';

type CheckState = 'ok' | 'warn' | 'fail';
type Check = [name: string, ref: string, eta: number, state: CheckState];

interface ModuleConfig {
  group: string;
  name: string;
  sidebarHighlight: string;
  sidebarGroup?: string;
  inputs: { section: string; rows: [string, string, string][] }[];
  checks: Check[];
  norm: string;
  canvas: keyof typeof CANVAS;
}

export const MODULE_CONFIG: Record<string, ModuleConfig> = {
  'rc-beams': {
    group: 'HORMIGÓN',
    name: 'Vigas',
    sidebarHighlight: 'Vigas',
    inputs: [
      { section: 'GEOMETRÍA', rows: [['b', '300', 'mm'], ['h', '500', 'mm'], ["d'", '40', 'mm']] },
      { section: 'ARMADURA', rows: [['nº barras', '4', ''], ['Ø', '20', 'mm'], ['cercos', 'Ø8/200', '']] },
      { section: 'MATERIALES', rows: [['fck', '25', 'MPa'], ['fyk', '500', 'MPa']] },
    ],
    checks: [
      ['Flexión', 'Md/MRd', 74, 'ok'],
      ['Cortante', 'Vd/VRd', 52, 'ok'],
      ['Fisuración', 'wk', 31, 'ok'],
      ['Cuantía mín.', 'ρ', 24, 'ok'],
      ['Anclaje', 'lb,rqd', 67, 'ok'],
    ],
    norm: 'CE art.42 · γc=1.5 · γs=1.15',
    canvas: 'rc-beam',
  },
  'rc-punching': {
    group: 'HORMIGÓN',
    name: 'Punzonamiento',
    sidebarHighlight: 'Punzonamiento',
    inputs: [
      { section: 'PILAR', rows: [['a', '300', 'mm'], ['b', '300', 'mm'], ['pos.', 'interior', '']] },
      { section: 'PLACA', rows: [['h', '220', 'mm'], ['d', '180', 'mm']] },
      { section: 'ESFUERZO', rows: [['VEd', '420', 'kN'], ['β', '1.15', '']] },
      { section: 'MATERIALES', rows: [['fck', '30', 'MPa'], ['fywd', '434', 'MPa']] },
    ],
    checks: [
      ['v · borde pilar', 'vRd,max', 68, 'ok'],
      ['v · u1 a 2d', 'vRd,c', 92, 'warn'],
      ['Cercos a 0.75d', 'vRd,cs', 86, 'warn'],
      ['Perímetro uout', 'vRd,c', 54, 'ok'],
    ],
    norm: 'CE art.45 · u1 = 2d',
    canvas: 'punching',
  },
  'steel-beams': {
    group: 'ACERO',
    name: 'Vigas',
    sidebarHighlight: 'Vigas',
    sidebarGroup: 'ACERO',
    inputs: [
      { section: 'PERFIL', rows: [['familia', 'IPE', ''], ['perfil', 'IPE 300', ''], ['S', '275', 'MPa']] },
      { section: 'LUZ', rows: [['L', '6.00', 'm'], ['Lcr', '6.00', 'm'], ['apoyo', 'biart.', '']] },
      { section: 'ACCIONES', rows: [['g', '5.2', 'kN/m'], ['q', '3.5', 'kN/m']] },
    ],
    checks: [
      ['Flexión', 'Mc,Rd', 63, 'ok'],
      ['Cortante', 'Vc,Rd', 38, 'ok'],
      ['M-V', 'interact.', 41, 'ok'],
      ['LTB', 'Mb,Rd', 88, 'warn'],
      ['Flecha', 'L/300', 71, 'ok'],
      ['Clase sección', '—', 1, 'ok'],
    ],
    norm: 'DB-SE-A §6.2 · γM0=1.05',
    canvas: 'steel-beam',
  },
  walls: {
    group: 'CIMENTACIÓN',
    name: 'Muros contención',
    sidebarHighlight: 'Muros',
    sidebarGroup: 'CIMENTACIÓN',
    inputs: [
      { section: 'GEOMETRÍA', rows: [['H', '3.50', 'm'], ['B', '2.20', 'm'], ['e', '0.30', 'm']] },
      { section: 'ZAPATA', rows: [['t', '0.40', 'm'], ['puntera', '0.80', 'm']] },
      { section: 'TERRENO', rows: [['φ', '30', '°'], ['γ', '18', 'kN/m³'], ['σadm', '200', 'kPa']] },
      { section: 'MATERIALES', rows: [['fck', '30', 'MPa']] },
    ],
    checks: [
      ['Vuelco', 'Mest/Mvol', 56, 'ok'],
      ['Deslizamiento', 'Fres/Hd', 78, 'ok'],
      ['σ suelo máx.', 'σmax/σadm', 64, 'ok'],
      ['σ suelo mín.', 'σmin ≥ 0', 18, 'ok'],
      ['Flexión fuste', 'Md/MRd', 61, 'ok'],
      ['Cortante fuste', 'Vd/VRd', 44, 'ok'],
    ],
    norm: 'DB-SE-C §6 · γR=1.5',
    canvas: 'wall',
  },
  timber: {
    group: 'MADERA',
    name: 'Vigas y pilares',
    sidebarHighlight: 'Vigas',
    sidebarGroup: 'MADERA',
    inputs: [
      { section: 'SECCIÓN', rows: [['b', '140', 'mm'], ['h', '240', 'mm']] },
      { section: 'CLASE', rows: [['material', 'GL24h', ''], ['uso', '1', '']] },
      { section: 'LUZ', rows: [['L', '4.50', 'm'], ['kmod', '0.80', '']] },
      { section: 'ACCIONES', rows: [['g', '1.8', 'kN/m'], ['q', '2.5', 'kN/m']] },
    ],
    checks: [
      ['Flexión', 'fm,d', 62, 'ok'],
      ['Cortante', 'fv,d', 35, 'ok'],
      ['LTB', 'kcrit', 74, 'ok'],
      ['Flecha inst.', 'L/300', 58, 'ok'],
      ['Flecha final', 'L/200', 81, 'warn'],
    ],
    norm: 'EC5 · clase servicio 1',
    canvas: 'timber',
  },
};

// ── Canvas renderers per module ────────────────────────────────────────────────
function CanvasRCBeam({ accent }: { accent: string }) {
  return (
    <svg viewBox="0 0 320 220" className="ap-canvas-svg">
      <rect x="80" y="40" width="160" height="140" stroke="var(--text-primary)" fill="none" strokeWidth="1.3" />
      <rect x="88" y="48" width="144" height="124" rx="3" stroke="var(--text-disabled)" fill="none" strokeWidth="0.9" />
      <circle cx="98" cy="60" r="3.6" fill="var(--text-primary)" />
      <circle cx="222" cy="60" r="3.6" fill="var(--text-primary)" />
      {[98, 138, 178, 222].map((x) => (<circle key={x} cx={x} cy="160" r="4.5" fill="var(--text-primary)" />))}
      <line x1="80" y1="92" x2="240" y2="92" stroke={accent} strokeWidth="1" strokeDasharray="4 3" />
      <text x="248" y="95" fontFamily="var(--font-mono)" fontSize="9" fill={accent}>x=164</text>
      <rect x="80" y="40" width="160" height="34" fill={accent} opacity="0.10" />
      <line x1="80" y1="195" x2="240" y2="195" stroke="var(--text-disabled)" strokeWidth="0.6" />
      <line x1="80" y1="190" x2="80" y2="200" stroke="var(--text-disabled)" strokeWidth="0.6" />
      <line x1="240" y1="190" x2="240" y2="200" stroke="var(--text-disabled)" strokeWidth="0.6" />
      <text x="160" y="208" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill="var(--text-disabled)">b = 300 mm</text>
      <line x1="60" y1="40" x2="60" y2="180" stroke="var(--text-disabled)" strokeWidth="0.6" />
      <line x1="55" y1="40" x2="65" y2="40" stroke="var(--text-disabled)" strokeWidth="0.6" />
      <line x1="55" y1="180" x2="65" y2="180" stroke="var(--text-disabled)" strokeWidth="0.6" />
      <text x="46" y="112" textAnchor="middle" transform="rotate(-90, 46, 112)" fontFamily="var(--font-mono)" fontSize="9" fill="var(--text-disabled)">h = 500 mm</text>
    </svg>
  );
}

function CanvasPunching({ accent }: { accent: string }) {
  return (
    <svg viewBox="0 0 320 220" className="ap-canvas-svg">
      <rect x="40" y="20" width="240" height="180" stroke="var(--text-disabled)" strokeDasharray="3 3" fill="none" strokeWidth="0.6" />
      <rect x="130" y="80" width="60" height="60" stroke="var(--text-primary)" fill={accent} fillOpacity="0.06" strokeWidth="1.3" />
      <text x="160" y="115" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill="var(--text-primary)">30×30</text>
      <rect x="80" y="30" width="160" height="160" rx="45" stroke={accent} strokeDasharray="5 3" fill="none" strokeWidth="1.2" />
      <text x="244" y="32" fontFamily="var(--font-mono)" fontSize="10" fill={accent}>u1</text>
      {[100, 130, 160, 190, 220].map((x) => (<circle key={`t${x}`} cx={x} cy="30" r="2" fill="var(--text-disabled)" />))}
      {[100, 130, 160, 190, 220].map((x) => (<circle key={`b${x}`} cx={x} cy="190" r="2" fill="var(--text-disabled)" />))}
      {[50, 80, 110, 140, 170].map((y) => (<circle key={`l${y}`} cx="80" cy={y} r="2" fill="var(--text-disabled)" />))}
      {[50, 80, 110, 140, 170].map((y) => (<circle key={`r${y}`} cx="240" cy={y} r="2" fill="var(--text-disabled)" />))}
      <line x1="160" y1="110" x2="80" y2="30" stroke={accent} strokeWidth="0.5" strokeDasharray="2 2" />
      <text x="115" y="68" fontFamily="var(--font-mono)" fontSize="9" fill={accent}>2d</text>
      <text x="160" y="216" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill="var(--text-disabled)">VEd = 420 kN</text>
    </svg>
  );
}

function CanvasSteelBeam({ accent }: { accent: string }) {
  return (
    <svg viewBox="0 0 320 220" className="ap-canvas-svg">
      <rect x="100" y="50" width="120" height="14" stroke="var(--text-primary)" fill="none" strokeWidth="1.3" />
      <rect x="153" y="64" width="14" height="92" stroke="var(--text-primary)" fill="none" strokeWidth="1.3" />
      <rect x="100" y="156" width="120" height="14" stroke="var(--text-primary)" fill="none" strokeWidth="1.3" />
      <text x="160" y="115" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="13" fill="var(--text-primary)" fontWeight="600">IPE 300</text>
      <line x1="85" y1="110" x2="235" y2="110" stroke={accent} strokeWidth="1" strokeDasharray="4 3" />
      <text x="243" y="113" fontFamily="var(--font-mono)" fontSize="9" fill={accent}>y-y</text>
      <line x1="78" y1="50" x2="78" y2="170" stroke="var(--text-disabled)" strokeWidth="0.6" />
      <line x1="73" y1="50" x2="83" y2="50" stroke="var(--text-disabled)" strokeWidth="0.6" />
      <line x1="73" y1="170" x2="83" y2="170" stroke="var(--text-disabled)" strokeWidth="0.6" />
      <text x="64" y="112" textAnchor="middle" transform="rotate(-90, 64, 112)" fontFamily="var(--font-mono)" fontSize="9" fill="var(--text-disabled)">h=300</text>
      <line x1="100" y1="185" x2="220" y2="185" stroke="var(--text-disabled)" strokeWidth="0.6" />
      <line x1="100" y1="180" x2="100" y2="190" stroke="var(--text-disabled)" strokeWidth="0.6" />
      <line x1="220" y1="180" x2="220" y2="190" stroke="var(--text-disabled)" strokeWidth="0.6" />
      <text x="160" y="200" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill="var(--text-disabled)">b = 150 mm</text>
    </svg>
  );
}

function CanvasWall({ accent }: { accent: string }) {
  return (
    <svg viewBox="0 0 320 220" className="ap-canvas-svg">
      <rect x="60" y="150" width="200" height="26" stroke="var(--text-primary)" fill="none" strokeWidth="1.3" />
      <polygon points="135,30 168,30 188,150 135,150" stroke="var(--text-primary)" fill="none" strokeWidth="1.3" />
      <line x1="168" y1="30" x2="280" y2="30" stroke="var(--text-disabled)" strokeWidth="0.6" strokeDasharray="3 2" />
      <line x1="20" y1="176" x2="300" y2="176" stroke="var(--text-primary)" strokeWidth="1" />
      {[40, 55, 70, 85, 100, 115, 130, 145].map((y) => (
        <line key={`g${y}`} x1={188 - (150 - y) * 0.27 + 5} y1={y} x2={278 - (150 - y) * 0.2} y2={y} stroke="var(--text-disabled)" strokeWidth="0.4" />
      ))}
      {[60, 95, 130].map((y) => (
        <g key={y}>
          <line x1={195 + (y - 30) * 0.3} y1={y} x2={175 + (y - 30) * 0.05} y2={y} stroke={accent} strokeWidth="1" />
          <polygon points={`${175 + (y - 30) * 0.05},${y - 2.5} ${168 + (y - 30) * 0.05},${y} ${175 + (y - 30) * 0.05},${y + 2.5}`} fill={accent} />
        </g>
      ))}
      <text x="245" y="60" fontFamily="var(--font-mono)" fontSize="9" fill={accent}>Ea</text>
      <line x1="115" y1="30" x2="115" y2="150" stroke="var(--text-disabled)" strokeWidth="0.6" />
      <line x1="110" y1="30" x2="120" y2="30" stroke="var(--text-disabled)" strokeWidth="0.6" />
      <line x1="110" y1="150" x2="120" y2="150" stroke="var(--text-disabled)" strokeWidth="0.6" />
      <text x="102" y="92" textAnchor="middle" transform="rotate(-90, 102, 92)" fontFamily="var(--font-mono)" fontSize="9" fill="var(--text-disabled)">H=3.5m</text>
      <text x="160" y="200" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill="var(--text-disabled)">B = 2.20 m</text>
    </svg>
  );
}

function CanvasTimber({ accent }: { accent: string }) {
  return (
    <svg viewBox="0 0 320 220" className="ap-canvas-svg">
      <rect x="80" y="40" width="160" height="140" stroke="var(--text-primary)" fill="none" strokeWidth="1.3" />
      {[55, 70, 85, 100, 115, 130, 145, 160].map((y, i) => (
        <path
          key={y}
          d={`M 80 ${y} Q 160 ${y - 4 + (i % 2) * 8} 240 ${y}`}
          stroke="var(--text-disabled)"
          strokeWidth="0.6"
          fill="none"
        />
      ))}
      <circle cx="180" cy="100" r="5" stroke="var(--text-disabled)" strokeWidth="0.6" fill="none" />
      <circle cx="115" cy="145" r="3" stroke="var(--text-disabled)" strokeWidth="0.6" fill="none" />
      <line x1="80" y1="195" x2="240" y2="195" stroke="var(--text-disabled)" strokeWidth="0.6" />
      <line x1="80" y1="190" x2="80" y2="200" stroke="var(--text-disabled)" strokeWidth="0.6" />
      <line x1="240" y1="190" x2="240" y2="200" stroke="var(--text-disabled)" strokeWidth="0.6" />
      <text x="160" y="210" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill="var(--text-disabled)">b = 140 mm</text>
      <line x1="60" y1="40" x2="60" y2="180" stroke="var(--text-disabled)" strokeWidth="0.6" />
      <line x1="55" y1="40" x2="65" y2="40" stroke="var(--text-disabled)" strokeWidth="0.6" />
      <line x1="55" y1="180" x2="65" y2="180" stroke="var(--text-disabled)" strokeWidth="0.6" />
      <text x="46" y="112" textAnchor="middle" transform="rotate(-90, 46, 112)" fontFamily="var(--font-mono)" fontSize="9" fill="var(--text-disabled)">h = 240 mm</text>
      <rect x="92" y="50" width="46" height="16" fill={accent} fillOpacity="0.1" stroke={accent} strokeWidth="0.6" />
      <text x="115" y="61" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill={accent}>GL24h</text>
    </svg>
  );
}

const CANVAS = {
  'rc-beam': CanvasRCBeam,
  punching: CanvasPunching,
  'steel-beam': CanvasSteelBeam,
  wall: CanvasWall,
  timber: CanvasTimber,
};

// Sidebar groups for each module's nav state
const SIDEBAR_NAV = [
  { group: 'HORMIGÓN', items: ['Vigas', 'Pilares', 'Punzonamiento', 'Forjados'] },
  { group: 'ACERO', items: ['Vigas', 'Pilares', 'Empresillado', 'Anclaje'] },
  { group: 'CIMENTACIÓN', items: ['Zapatas', 'Encepados', 'Muros'] },
  { group: 'MADERA', items: ['Vigas', 'Pilares'] },
  { group: 'ANÁLISIS', items: ['FEM 1D'] },
];

interface AppPreviewProps {
  moduleId?: string;
  accent?: string;
}

export function AppPreview({ moduleId = 'rc-beams', accent = 'var(--accent)' }: AppPreviewProps) {
  const cfg = MODULE_CONFIG[moduleId] || MODULE_CONFIG['rc-beams'];
  const Canvas = CANVAS[cfg.canvas] || CanvasRCBeam;
  const checks = cfg.checks;

  const eta = checks[0][2];
  const state: CheckState = eta < 80 ? 'ok' : eta < 100 ? 'warn' : 'fail';
  const stateColor = state === 'ok' ? 'var(--state-ok)' : state === 'warn' ? 'var(--state-warn)' : 'var(--state-fail)';
  const stateBg =
    state === 'ok' ? 'var(--color-tint-ok)' :
    state === 'warn' ? 'var(--color-tint-warn)' :
    'var(--color-tint-fail)';

  const activeGroup = cfg.sidebarGroup || cfg.group;

  return (
    <div className="app-preview">
      {/* topbar */}
      <div className="ap-topbar">
        <div className="ap-brand">
          <span className="ap-brand-dot" style={{ background: accent }} />
          <span className="ap-brand-name">Concreta</span>
        </div>
        <div className="ap-bread">
          <span className="ap-bread-group">{cfg.group}</span>
          <span className="ap-bread-sep">/</span>
          <span className="ap-bread-mod">{cfg.name}</span>
        </div>
        <div className="ap-tools">
          <span className="ap-tool">N/mm²</span>
          <span className="ap-tool">⌘C</span>
          <span className="ap-tool">PDF</span>
        </div>
      </div>

      <div className="ap-body">
        {/* sidebar */}
        <aside className="ap-sidebar">
          {SIDEBAR_NAV.map((g) => (
            <div className="ap-sb-group" key={g.group}>
              <div className="ap-sb-label">{g.group}</div>
              {g.items.map((it, i) => {
                const isActive = g.group === activeGroup && it === cfg.sidebarHighlight;
                return (
                  <div key={`${it}-${i}`} className={`ap-sb-item ${isActive ? 'active' : ''}`}>
                    <span className="ap-sb-dot" style={isActive ? { background: accent } : undefined} />
                    {it}
                  </div>
                );
              })}
            </div>
          ))}
          <div className="ap-sb-version">v0.1.1</div>
        </aside>

        {/* inputs */}
        <div className="ap-inputs">
          {cfg.inputs.map((sec) => (
            <Fragment key={sec.section}>
              <div className="ap-section-h">▼ {sec.section}</div>
              {sec.rows.map(([k, v, u]) => (
                <div className="ap-input-row" key={k}>
                  <span className="ap-input-lbl">{k}</span>
                  <span className="ap-input-val">
                    <span className="ap-input-v">{v}</span>
                    {u && <span className="ap-input-u">{u}</span>}
                  </span>
                </div>
              ))}
            </Fragment>
          ))}
        </div>

        {/* canvas */}
        <div className="ap-canvas dot-grid">
          <Canvas accent={accent} />
        </div>

        {/* results */}
        <div
          className="ap-results"
          style={{
            background: `linear-gradient(180deg, ${stateBg} 0%, transparent 80px)`,
            borderTop: `2px solid ${stateColor}`,
          }}
        >
          <div className="ap-res-h">
            <span className="ap-res-title">VERIFICACIONES</span>
            <span className="ap-res-badge" style={{ color: stateColor, background: stateBg }}>
              <span className="ap-res-dot" style={{ background: stateColor }} />
              {state === 'ok' ? 'CUMPLE' : state === 'warn' ? 'REVISAR' : 'INCUMPLE'}
            </span>
          </div>
          {checks.map(([name, ref, chkEta, st], i) => {
            const c = st === 'ok' ? 'var(--state-ok)' : st === 'warn' ? 'var(--state-warn)' : 'var(--state-fail)';
            const stBg = st === 'ok' ? 'var(--color-tint-ok)' : st === 'warn' ? 'var(--color-tint-warn)' : 'var(--color-tint-fail)';
            return (
              <div className="ap-check" key={i}>
                <div className="ap-check-name">
                  {name}
                  <div className="ap-check-ref">{ref}</div>
                </div>
                <div className="ap-check-bar">
                  <div className="ap-check-bar-fill" style={{ width: `${Math.min(chkEta, 100)}%`, background: c }} />
                </div>
                <div className="ap-check-tag" style={{ color: c, background: stBg }}>{chkEta}%</div>
              </div>
            );
          })}
          <div className="ap-res-foot">
            <span className="dim">{cfg.norm}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
