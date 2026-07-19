// FEM 2D — editor tool palette (vertical, desktop/tablet only).
//
// Mirrors the 1D ToolPalette visual language, own CSS class (.fem2d-tool-btn)
// to avoid coupling through global styles. The four load tools (distributed /
// point × vertical / horizontal) live under ONE "Cargas" button that opens a
// flyout menu to the right — the toolbar stays short and every force type is a
// single, discoverable pick.

import { useEffect, useRef, useState, type JSX } from 'react';
import { Fem2DIcons } from './icons';
import type { Tool2DId } from './modelOps';

interface ToolDef { id: Tool2DId; icon: React.ReactNode; label: string }

// The load family: shown as a flyout under the single "Cargas" button.
const LOAD_TOOLS: ToolDef[] = [
  { id: 'load-udl',   icon: <Fem2DIcons.LoadDist />,  label: 'Distribuida vertical (gravedad ↓)' },
  { id: 'load-udl-h', icon: <Fem2DIcons.LoadDistH />, label: 'Distribuida horizontal (viento →)' },
  { id: 'load-point', icon: <Fem2DIcons.Load />,      label: 'Puntual vertical (gravedad ↓)' },
  { id: 'load-h',     icon: <Fem2DIcons.LoadH />,     label: 'Puntual horizontal (viento →)' },
];
const LOAD_IDS = new Set<Tool2DId>(LOAD_TOOLS.map((t) => t.id));

export function ToolPalette2D({ tool, setTool }: { tool: Tool2DId; setTool: (t: Tool2DId) => void }): JSX.Element {
  const topTools: ToolDef[] = [
    { id: 'select',  icon: <Fem2DIcons.Cursor />,  label: 'Seleccionar' },
    { id: 'node',    icon: <Fem2DIcons.Node />,    label: 'Añadir nudo' },
    { id: 'bar',     icon: <Fem2DIcons.Bar />,     label: 'Añadir barra' },
    { id: 'support', icon: <Fem2DIcons.Support />, label: 'Apoyo' },
  ];

  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const loadActive = LOAD_IDS.has(tool);
  // Remember the last picked load tool so the button face shows it even after
  // switching to select/etc. (adjust-during-render: no effect, no stale pass).
  const [lastLoad, setLastLoad] = useState<Tool2DId>('load-udl');
  if (loadActive && tool !== lastLoad) setLastLoad(tool);
  const faceTool = LOAD_TOOLS.find((t) => t.id === (loadActive ? tool : lastLoad)) ?? LOAD_TOOLS[0];

  // Close the flyout on any pointer down outside the palette (canvas click,
  // another tool, elsewhere on the page).
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [menuOpen]);

  const pickLoad = (id: Tool2DId) => {
    setTool(id);
    setMenuOpen(false);
  };

  const btn = (t: ToolDef) => (
    <button
      key={t.id}
      onClick={() => { setTool(t.id); setMenuOpen(false); }}
      title={t.label}
      aria-label={t.label}
      aria-pressed={tool === t.id}
      className="fem2d-tool-btn"
      data-active={tool === t.id ? 'true' : 'false'}
    >
      {t.icon}
    </button>
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: 8,
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border-main)',
        borderRadius: 4,
      }}
    >
      {topTools.map(btn)}

      {/* Load family: single button + flyout menu to the right. */}
      <div ref={wrapRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setMenuOpen((o) => !o)}
          title="Cargas"
          aria-label="Cargas"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="fem2d-tool-btn"
          data-active={loadActive ? 'true' : 'false'}
          style={{ position: 'relative' }}
        >
          {faceTool.icon}
          <span className="fem2d-load-caret" aria-hidden="true">▸</span>
        </button>
        {menuOpen && (
          <div className="fem2d-load-menu" role="menu" aria-label="Tipo de carga">
            <p className="fem2d-load-menu-title">Cargas</p>
            {LOAD_TOOLS.map((lt) => (
              <button
                key={lt.id}
                role="menuitemradio"
                aria-checked={tool === lt.id}
                onClick={() => pickLoad(lt.id)}
                className="fem2d-load-item"
                data-active={tool === lt.id ? 'true' : 'false'}
              >
                <span className="fem2d-load-item-icon">{lt.icon}</span>
                <span>{lt.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {btn({ id: 'copy-props', icon: <Fem2DIcons.CopyProps />, label: 'Copiar propiedades entre barras' })}
      {btn({ id: 'delete', icon: <Fem2DIcons.Trash />, label: 'Eliminar' })}
    </div>
  );
}
