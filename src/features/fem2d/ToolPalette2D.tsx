// FEM 2D — editor tool palette (vertical, desktop/tablet only).
//
// Mirrors the 1D ToolPalette visual language, own CSS class (.fem2d-tool-btn)
// to avoid coupling through global styles. The four load tools (distributed /
// point × vertical / horizontal) live under ONE "Cargas" button that opens a
// flyout to the right — the toolbar stays short and every force type is a
// single, discoverable pick.
//
// The flyout is also where the load is CONFIGURED BEFORE placing it: picking a
// type keeps the panel open with its value + hipótesis (+ categoría for Q), so
// the click on the canvas already lands the right load instead of a hardcoded
// 10 kN that has to be re-opened in the inspector afterwards. The draft is per
// tool (units and everyday hypothesis differ) and lives in the shell.

import { useEffect, useRef, useState, type JSX } from 'react';
import { UnitNumberInput } from '../../components/units/UnitNumberInput';
import { Fem2DIcons } from './icons';
import {
  isLoadTool,
  isUdlTool,
  type LoadDraft2D,
  type LoadDrafts2D,
  type LoadToolId,
  type Tool2DId,
} from './modelOps';
import type { LoadCase, UseCategoryCode } from './types';
import { lcOptionLabel, LC_HELP } from '../../lib/text/loadCases';

interface ToolDef { id: Tool2DId; icon: React.ReactNode; label: string }

// The load family: shown as a flyout under the single "Cargas" button.
const LOAD_TOOLS: { id: LoadToolId; icon: React.ReactNode; label: string }[] = [
  { id: 'load-udl',   icon: <Fem2DIcons.LoadDist />,  label: 'Distribuida vertical (gravedad ↓)' },
  { id: 'load-udl-h', icon: <Fem2DIcons.LoadDistH />, label: 'Distribuida horizontal (viento →)' },
  { id: 'load-point', icon: <Fem2DIcons.Load />,      label: 'Puntual vertical (gravedad ↓)' },
  { id: 'load-h',     icon: <Fem2DIcons.LoadH />,     label: 'Puntual horizontal (viento →)' },
];

const LC_OPTIONS: readonly LoadCase[] = ['G', 'Q', 'W', 'S', 'E'];
const CATEGORIAS: readonly UseCategoryCode[] = ['A1', 'A2', 'B', 'C1', 'C2', 'C3', 'D1', 'E1', 'G1'];

interface Props {
  tool: Tool2DId;
  setTool: (t: Tool2DId) => void;
  /** Armed value + hipótesis of each load tool (the shell owns them). */
  loadDrafts: LoadDrafts2D;
  setLoadDraft: (tool: LoadToolId, draft: LoadDraft2D) => void;
}

export function ToolPalette2D({ tool, setTool, loadDrafts, setLoadDraft }: Props): JSX.Element {
  const topTools: ToolDef[] = [
    { id: 'select',  icon: <Fem2DIcons.Cursor />,  label: 'Seleccionar' },
    { id: 'node',    icon: <Fem2DIcons.Node />,    label: 'Añadir nudo' },
    { id: 'bar',     icon: <Fem2DIcons.Bar />,     label: 'Añadir barra' },
    { id: 'support', icon: <Fem2DIcons.Support />, label: 'Apoyo' },
  ];

  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const loadActive = isLoadTool(tool);
  // Remember the last picked load tool so the button face shows it even after
  // switching to select/etc. (adjust-during-render: no effect, no stale pass).
  const [lastLoad, setLastLoad] = useState<LoadToolId>('load-udl');
  if (loadActive && tool !== lastLoad) setLastLoad(tool);
  const armed: LoadToolId = loadActive ? tool : lastLoad;
  const faceTool = LOAD_TOOLS.find((t) => t.id === armed) ?? LOAD_TOOLS[0];

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

  // Picking a type ARMS the tool but keeps the panel open: the value and the
  // hipótesis right below it are the point of opening the flyout at all.
  const pickLoad = (id: LoadToolId) => setTool(id);

  const draft = loadDrafts[armed];
  const patchDraft = (p: Partial<LoadDraft2D>) => setLoadDraft(armed, { ...draft, ...p });

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

      {/* Load family: single button + flyout (type picker + draft config). */}
      <div ref={wrapRef} style={{ position: 'relative' }}>
        <button
          onClick={() => { setMenuOpen((o) => !o); if (!loadActive) setTool(armed); }}
          title="Cargas"
          aria-label="Cargas"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          className="fem2d-tool-btn"
          data-active={loadActive ? 'true' : 'false'}
          style={{ position: 'relative' }}
        >
          {faceTool.icon}
          <span className="fem2d-load-caret" aria-hidden="true">▸</span>
        </button>
        {menuOpen && (
          <div className="fem2d-load-menu" role="group" aria-label="Cargas">
            <p className="fem2d-load-menu-title">Cargas</p>
            <div role="radiogroup" aria-label="Tipo de carga" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {LOAD_TOOLS.map((lt) => (
                <button
                  key={lt.id}
                  role="radio"
                  aria-checked={armed === lt.id}
                  onClick={() => pickLoad(lt.id)}
                  className="fem2d-load-item"
                  data-active={armed === lt.id ? 'true' : 'false'}
                >
                  <span className="fem2d-load-item-icon">{lt.icon}</span>
                  <span>{lt.label}</span>
                </button>
              ))}
            </div>

            {/* Draft: what the NEXT click will place. */}
            <div className="fem2d-load-config">
              <p className="fem2d-load-menu-title" style={{ padding: '0 0 2px' }}>Se colocará</p>

              <UnitNumberInput
                label="Valor"
                sub={isUdlTool(armed) ? 'por metro de barra' : 'fuerza'}
                quantity={isUdlTool(armed) ? 'linearLoad' : 'force'}
                allowNegative
                value={draft.magnitude}
                onChange={(v) => patchDraft({ magnitude: v })}
                help="Positivo = en el sentido del icono (gravedad ↓ o viento →). Un valor negativo lo invierte (succión, empuje a la izquierda)."
              />

              <div className="fem2d-load-config-row">
                <label className="fem2d-load-config-label" htmlFor="fem2d-load-lc">Hipótesis</label>
                <select
                  id="fem2d-load-lc"
                  value={draft.lc}
                  onChange={(e) => patchDraft({ lc: e.target.value as LoadCase })}
                  className="fem2d-load-select"
                  title={LC_HELP}
                >
                  {LC_OPTIONS.map((lc) => (
                    <option key={lc} value={lc}>{lcOptionLabel(lc)}</option>
                  ))}
                </select>
              </div>

              {draft.lc === 'Q' && (
                <div className="fem2d-load-config-row">
                  <label className="fem2d-load-config-label" htmlFor="fem2d-load-cat">Categoría</label>
                  <select
                    id="fem2d-load-cat"
                    value={draft.useCategory ?? 'B'}
                    onChange={(e) => patchDraft({ useCategory: e.target.value as UseCategoryCode })}
                    className="fem2d-load-select"
                    title="Categoría de uso CTE Tabla 3.1 — fija los coeficientes ψ de combinación."
                  >
                    {CATEGORIAS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              )}

              <p className="fem2d-load-config-hint">
                Clic en {isUdlTool(armed) ? 'una barra' : 'un nudo o una barra'} para colocarla.
              </p>
            </div>
          </div>
        )}
      </div>

      {btn({ id: 'copy-props', icon: <Fem2DIcons.CopyProps />, label: 'Copiar propiedades entre barras' })}
      {btn({ id: 'delete', icon: <Fem2DIcons.Trash />, label: 'Eliminar' })}
    </div>
  );
}
