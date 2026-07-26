// Paleta de herramientas de los lienzos de análisis — vertical, flotante sobre
// el lienzo (left-3 top-3), escritorio y tableta.
//
// Una sola paleta para el FEM 1D y el FEM 2D. Antes había dos, con el mismo
// contenedor copiado línea a línea y dos clases CSS gemelas
// (.fem-tool-btn / .fem2d-tool-btn) que solo se distinguían en el prefijo.
//
// La FAMILIA DE CARGAS es lo que la hace algo más que una fila de botones: los
// tipos de carga viven bajo UN botón que abre un panel a la derecha, y ese
// panel es además donde la carga se ARMA antes de colocarla (valor, hipótesis
// y categoría). Así el clic en el lienzo ya suelta la carga correcta, en vez de
// un valor de fábrica que hay que corregir después en el inspector.
//
// Genérica en el id de herramienta: cada módulo declara su juego (el 1D no
// tiene barra en diagonal ni cargas horizontales; el 2D sí) y esta paleta solo
// se ocupa del cromo y del gesto.

import { useEffect, useRef, useState, type JSX, type ReactNode } from 'react';
import { UnitNumberInput } from '../units/UnitNumberInput';
import type { LoadCase, UseCategoryCode } from '../../lib/frame-core/types';
import { lcOptionLabel, LC_HELP, CATEGORY_HELP } from '../../lib/text/loadCases';
import { categoryLabel } from '../../lib/calculations/loadGen';

export interface PaletteTool<T extends string> {
  id: T;
  icon: ReactNode;
  label: string;
}

/** Lo que colocará el próximo clic en el lienzo. */
export interface LoadDraft {
  magnitude: number;
  lc: LoadCase;
  useCategory?: UseCategoryCode;
}

export interface LoadFamily<T extends string> {
  /** Tipos de carga que ofrece el módulo, en orden de menú. */
  tools: ReadonlyArray<PaletteTool<T>>;
  /** Tipo armado — es la cara del botón aunque la herramienta activa sea otra. */
  armed: T;
  draft: LoadDraft;
  onDraftChange: (draft: LoadDraft) => void;
  /** Distribuida ⇒ el valor va por metro de barra (kN/m) en vez de kN. */
  isUdl: (id: T) => boolean;
  /** Dónde hay que hacer clic para soltarla («una barra», «un nudo o una barra»). */
  target: (id: T) => string;
}

const LC_OPTIONS: readonly LoadCase[] = ['G', 'Q', 'W', 'S', 'E'];
const CATEGORIAS: readonly UseCategoryCode[] = ['A1', 'A2', 'B', 'C1', 'C2', 'C3', 'D1', 'E1', 'G1'];

interface Props<T extends string> {
  /** Herramientas por encima de la familia de cargas. */
  tools: ReadonlyArray<PaletteTool<T>>;
  /** Herramientas por debajo (borrar, copiar propiedades…). */
  tailTools?: ReadonlyArray<PaletteTool<T>>;
  loadFamily: LoadFamily<T>;
  tool: T;
  setTool: (t: T) => void;
}

export function ToolPalette<T extends string>({
  tools, tailTools = [], loadFamily, tool, setTool,
}: Props<T>): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const loadIds = loadFamily.tools.map((t) => t.id);
  const loadActive = loadIds.includes(tool);
  const faceTool = loadFamily.tools.find((t) => t.id === loadFamily.armed) ?? loadFamily.tools[0];

  // El panel se cierra con cualquier pulsación fuera de la paleta (clic en el
  // lienzo, otra herramienta, cualquier sitio de la página).
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [menuOpen]);

  const draft = loadFamily.draft;
  const patchDraft = (p: Partial<LoadDraft>) => loadFamily.onDraftChange({ ...draft, ...p });
  const udl = loadFamily.isUdl(loadFamily.armed);

  const btn = (t: PaletteTool<T>) => (
    <button
      key={t.id}
      onClick={() => { setTool(t.id); setMenuOpen(false); }}
      title={t.label}
      aria-label={t.label}
      aria-pressed={tool === t.id}
      className="tool-btn"
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
      {tools.map(btn)}

      {/* Familia de cargas: un botón + panel (elegir tipo y armar la carga). */}
      <div ref={wrapRef} style={{ position: 'relative' }}>
        <button
          onClick={() => { setMenuOpen((o) => !o); if (!loadActive) setTool(loadFamily.armed); }}
          title="Cargas"
          aria-label="Cargas"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          className="tool-btn"
          data-active={loadActive ? 'true' : 'false'}
          style={{ position: 'relative' }}
        >
          {faceTool.icon}
          <span className="tool-load-caret" aria-hidden="true">▸</span>
        </button>
        {menuOpen && (
          <div className="tool-load-menu" role="group" aria-label="Cargas">
            <p className="tool-load-menu-title">Cargas</p>
            <div role="radiogroup" aria-label="Tipo de carga" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {loadFamily.tools.map((lt) => (
                <button
                  key={lt.id}
                  role="radio"
                  aria-checked={loadFamily.armed === lt.id}
                  // Elegir tipo ARMA la herramienta pero deja el panel abierto:
                  // el valor y la hipótesis de debajo son el motivo de abrirlo.
                  onClick={() => setTool(lt.id)}
                  className="tool-load-item"
                  data-active={loadFamily.armed === lt.id ? 'true' : 'false'}
                >
                  <span className="tool-load-item-icon">{lt.icon}</span>
                  <span>{lt.label}</span>
                </button>
              ))}
            </div>

            <div className="tool-load-config">
              <p className="tool-load-menu-title" style={{ padding: '0 0 2px' }}>Se colocará</p>

              <UnitNumberInput
                label="Valor"
                sub={udl ? 'por metro de barra' : 'fuerza'}
                quantity={udl ? 'linearLoad' : 'force'}
                allowNegative
                value={draft.magnitude}
                onChange={(v) => patchDraft({ magnitude: v })}
                help="Positivo = en el sentido del icono (gravedad ↓ o viento →). Un valor negativo lo invierte (succión, empuje a la izquierda)."
              />

              <div className="tool-load-config-row">
                <label className="tool-load-config-label" htmlFor="tool-load-lc">Hipótesis</label>
                <select
                  id="tool-load-lc"
                  value={draft.lc}
                  onChange={(e) => patchDraft({ lc: e.target.value as LoadCase })}
                  className="tool-load-select"
                  title={LC_HELP}
                >
                  {LC_OPTIONS.map((lc) => (
                    <option key={lc} value={lc}>{lcOptionLabel(lc)}</option>
                  ))}
                </select>
              </div>

              {draft.lc === 'Q' && (
                <div className="tool-load-config-row">
                  <label className="tool-load-config-label" htmlFor="tool-load-cat">Categoría</label>
                  <select
                    id="tool-load-cat"
                    value={draft.useCategory ?? 'B'}
                    onChange={(e) => patchDraft({ useCategory: e.target.value as UseCategoryCode })}
                    className="tool-load-select"
                    title={CATEGORY_HELP}
                  >
                    {CATEGORIAS.map((c) => (
                      <option key={c} value={c}>{categoryLabel(c)}</option>
                    ))}
                  </select>
                </div>
              )}

              <p className="tool-load-config-hint">
                Clic en {loadFamily.target(loadFamily.armed)} para colocarla.
              </p>
            </div>
          </div>
        )}
      </div>

      {tailTools.map(btn)}
    </div>
  );
}
