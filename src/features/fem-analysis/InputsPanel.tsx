// FEM 1D — panel de datos (columna izquierda).
//
// Cuatro estados según la selección:
//   - sin selección → tarjeta MODELO (recuento en una línea)
//   - barra         → material + el panel nativo del módulo (HA / acero)
//   - nodo          → coordenada, tipo de apoyo, articulación interna
//   - carga         → tipo, hipótesis, magnitudes
//
// Debajo, siempre, la lista de cargas con el peso propio.
//
// Escrito con las mismas piezas que el inspector del FEM 2D (ToggleChip,
// DraftNumberField, InputLabel): antes esto era CSS en línea y un `NumField`
// propio que acuñaba UNA entrada de historial POR TECLA.

import type { JSX } from 'react';
import { Trash2 } from 'lucide-react';
import { CollapsibleSection } from '../../components/ui/CollapsibleSection';
import { InputLabel } from '../../components/ui/InputLabel';
import { ToggleChip } from '../../components/ui/ToggleChip';
import { DraftNumberField } from '../../components/units/DraftNumberField';
import { VerdictBadge } from '../../components/checks';
import { USE_CATEGORIES } from '../../lib/calculations/loadGen';
import { formatQuantity } from '../../lib/units/format';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import { barStatusToCheck } from './checkMapping';
import { RcBarInputs } from './embedded/RcBarInputs';
import { SteelBarInputs } from './embedded/SteelBarInputs';
import { DEFAULT_APOYO_ARMADO, DEFAULT_VANO_ARMADO } from './presets';
import type {
  DesignBar,
  DesignModel,
  Load,
  LoadCase,
  Selected,
  SolveResult,
  SupportType,
  UseCategoryCode,
} from './types';

interface Props {
  model: DesignModel;
  setModel: (updater: (m: DesignModel) => DesignModel) => void;
  selected: Selected;
  setSelected: (s: Selected) => void;
  result: SolveResult;
  activeSection: 'vano' | 'apoyo';
  setActiveSection: (s: 'vano' | 'apoyo') => void;
  /** Mobile read-only mode: wraps everything in <fieldset disabled> so all
   *  inputs/selects/buttons are non-interactive. Adds a richer empty state
   *  with global verdict so the Datos tab is informative even when no
   *  element is selected. */
  readOnly?: boolean;
}

export function InputsPanel({
  model, setModel, selected, setSelected, result,
  activeSection, setActiveSection, readOnly = false,
}: Props) {
  const selBar = selected?.kind === 'bar' ? model.bars.find((b) => b.id === selected.id) : undefined;
  const selNode = selected?.kind === 'node' ? model.nodes.find((n) => n.id === selected.id) : undefined;
  const selLoad = selected?.kind === 'load' ? model.loads.find((l) => l.id === selected.id) : undefined;
  const hasSelection = !!(selBar || selNode || selLoad);

  return (
    <fieldset
      disabled={readOnly}
      // <fieldset> trae `min-width: min-content` del navegador, así que NO se
      // encoge a su contenedor: con un hijo más ancho desbordaba (≈3px) y
      // disparaba el scroll horizontal. `min-w-0` lo obliga a respetar al padre.
      className={`m-0 block w-full min-w-0 border-none px-3.5 py-3 ${readOnly ? 'opacity-85' : ''}`}
    >
      {/* Empty-state global verdict — only when nothing is selected. */}
      {!hasSelection && readOnly && (
        <ReadOnlyGlobalSummary result={result} model={model} />
      )}

      {/* Selection panel */}
      {selBar && (
        <BarPanel
          bar={selBar}
          model={model}
          setModel={setModel}
          result={result}
          activeSection={activeSection}
          setActiveSection={setActiveSection}
        />
      )}
      {selNode && <NodePanel node={selNode} model={model} setModel={setModel} />}
      {selLoad && <LoadPanel load={selLoad} setModel={setModel} />}

      {/* Modelo: recuento en UNA línea, como la tarjeta del inspector 2D. Las
          cuatro filas anteriores gastaban 96 px en cuatro números de un dígito. */}
      {!hasSelection && (
        <div className="mb-3 rounded border border-border-main px-3 py-2.5">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled">Modelo</p>
          <p className="font-mono text-[11px] tabular-nums text-text-secondary">
            {model.nodes.length} nudos · {model.bars.length} barras · {model.supports.length} apoyos · {model.loads.length} cargas
          </p>
          <p className="mt-1.5 text-[10px] leading-snug text-text-disabled">
            Selecciona una barra, un nudo o una carga (en el lienzo o en la lista) para editarla aquí.
          </p>
        </div>
      )}

      {/* Loads list (always visible) */}
      <CollapsibleSection label={`Cargas (${model.loads.length})`}>
        <div className="flex min-w-0 items-center justify-between gap-2 px-0.5 py-1">
          <InputLabel label="Peso propio" help="Incluye el peso propio de las barras como una hipótesis G." />
          <ToggleChip
            on={model.selfWeight}
            onToggle={() => setModel((m) => ({ ...m, selfWeight: !m.selfWeight }))}
            onLabel="Incluido"
            offLabel="Omitido"
            disabled={readOnly}
          />
        </div>
        {model.loads.length === 0 ? (
          <p className="mt-1.5 text-[11px] leading-snug text-text-disabled">
            Sin cargas. Usa las herramientas de carga del lienzo.
          </p>
        ) : (
          <div className="mt-1.5 overflow-hidden rounded border border-border-main">
            {model.loads.map((ld) => (
              <LoadRow
                key={ld.id}
                load={ld}
                setModel={setModel}
                isSelected={selected?.kind === 'load' && selected.id === ld.id}
                onSelect={() => setSelected({ kind: 'load', id: ld.id })}
                readOnly={readOnly}
              />
            ))}
          </div>
        )}
      </CollapsibleSection>
    </fieldset>
  );
}

function ReadOnlyGlobalSummary({ result, model }: { result: SolveResult; model: DesignModel }) {
  const errorCount = result.errors.length;
  const status = barStatusToCheck(result.status);
  const showEta = errorCount === 0 && status !== 'neutral';

  return (
    <div className="mb-3 flex flex-col gap-2 rounded border border-border-main bg-bg-elevated px-3 py-2.5">
      <div className="flex items-center gap-2">
        {errorCount > 0 ? (
          <span className="rounded bg-state-fail/10 px-1.75 py-0.5 font-mono text-[10px] font-semibold tracking-[0.05em] text-state-fail">
            {errorCount} {errorCount === 1 ? 'error' : 'errores'}
          </span>
        ) : (
          <VerdictBadge status={status} />
        )}
        {showEta && (
          <span className="font-mono text-[11px] font-semibold tabular-nums text-text-secondary">
            η {(result.maxEta * 100).toFixed(0)}%
          </span>
        )}
      </div>
      <p className="font-mono text-[11px] leading-relaxed tabular-nums text-text-secondary">
        {model.nodes.length} nudos · {model.bars.length} barras · {model.supports.length} apoyos · {model.loads.length} cargas
      </p>
      <p className="text-[11px] italic leading-snug text-text-disabled">
        Toca una barra, nodo o carga en Diagramas para inspeccionarla.
      </p>
    </div>
  );
}

// ── Selection panels ───────────────────────────────────────────────────────

function BarPanel({
  bar, model, setModel, result, activeSection, setActiveSection,
}: {
  bar: DesignBar;
  model: DesignModel;
  setModel: (u: (m: DesignModel) => DesignModel) => void;
  result: SolveResult;
  activeSection: 'vano' | 'apoyo';
  setActiveSection: (s: 'vano' | 'apoyo') => void;
}) {
  const barResult = result.perBar[bar.id];

  // Compute bar length from FEM geometry (mm).
  const ni = model.nodes.find((n) => n.id === bar.i);
  const nj = model.nodes.find((n) => n.id === bar.j);
  const L_m = ni && nj ? Math.abs(nj.x - ni.x) : 0;
  const L_mm = L_m * 1000;

  // Loads on this bar (used by SteelBarInputs to derive useCategory).
  const barLoads = model.loads.filter(
    (l) => (l.kind === 'udl' || l.kind === 'point-bar') && l.bar === bar.id,
  );

  return (
    <div className="flex flex-col gap-2">
      <p className="border-b border-border-sub pb-1.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled">
        Barra {bar.id}
      </p>

      <div className="flex items-center justify-between gap-2 py-1">
        <span className="text-[12px] text-text-secondary">Material</span>
        <div className="flex gap-1">
          {(['rc', 'steel'] as const).map((fam) => (
            <SegmentButton
              key={fam}
              active={bar.material === fam}
              onClick={() => setBarMaterial(setModel, bar.id, fam)}
            >
              {fam === 'rc' ? 'HORMIGÓN' : 'ACERO'}
            </SegmentButton>
          ))}
        </div>
      </div>

      {/* Embed real — module-native panel UI, no nested chrome */}
      {bar.material === 'rc' && bar.rcSection && (
        <RcBarInputs
          bar={bar}
          setModel={setModel}
          activeSection={activeSection}
          setActiveSection={setActiveSection}
          barResult={barResult}
        />
      )}
      {bar.material === 'steel' && bar.steelSelection && (
        <SteelBarInputs
          bar={bar}
          setModel={setModel}
          barResult={barResult}
          L_mm={L_mm}
          barLoads={barLoads}
        />
      )}
    </div>
  );
}

function NodePanel({
  node, model, setModel,
}: {
  node: DesignModel['nodes'][number];
  model: DesignModel;
  setModel: (u: (m: DesignModel) => DesignModel) => void;
}) {
  const support = model.supports.find((s) => s.node === node.id);
  // Nudo «interior» = concurren al menos 2 barras.
  const isInteriorNode = model.bars.filter((b) => b.i === node.id || b.j === node.id).length >= 2;

  // Por ahora la articulación voltea el extremo j de la barra que muere aquí y
  // el extremo i de la que arranca.
  function toggleHinge() {
    setModel((m) => ({
      ...m,
      bars: m.bars.map((b) => {
        if (b.j === node.id) return { ...b, internalHinges: { ...b.internalHinges, j: !b.internalHinges.j } };
        if (b.i === node.id) return { ...b, internalHinges: { ...b.internalHinges, i: !b.internalHinges.i } };
        return b;
      }),
    }));
  }
  const hingeOn = nodeHasHingeFlag(model, node.id);

  return (
    <CollapsibleSection label={`Nodo ${node.id}`}>
      <Row label="x" value={`${node.x.toFixed(2)} m`} />
      <Row label="Apoyo">
        <FieldSelect
          value={support?.type ?? 'none'}
          onChange={(v) => setModel((m) => {
            const others = m.supports.filter((s) => s.node !== node.id);
            return v === 'none'
              ? { ...m, supports: others }
              : { ...m, supports: [...others, { node: node.id, type: v as SupportType }] };
          })}
        >
          <option value="none">Ninguno</option>
          <option value="pinned">Articulado</option>
          <option value="fixed">Empotrado</option>
          <option value="roller">Deslizante</option>
        </FieldSelect>
      </Row>
      {isInteriorNode && !support && (
        <Row label="Articulación">
          <ToggleChip
            on={hingeOn}
            onToggle={toggleHinge}
            onLabel="Rótula"
            offLabel="Continua"
            ariaLabel="Articulación interna"
          />
        </Row>
      )}
    </CollapsibleSection>
  );
}

function nodeHasHingeFlag(model: DesignModel, nodeId: string): boolean {
  return model.bars.some((b) =>
    (b.i === nodeId && b.internalHinges.i) ||
    (b.j === nodeId && b.internalHinges.j),
  );
}

function LoadPanel({
  load, setModel,
}: {
  load: Load;
  setModel: (u: (m: DesignModel) => DesignModel) => void;
}) {
  function patch(updater: (l: Load) => Load) {
    setModel((m) => ({ ...m, loads: m.loads.map((l) => l.id === load.id ? updater(l) : l) }));
  }
  // Clave de resiembra de los borradores: al saltar de una carga a otra el
  // campo tiene que enseñar el valor de la NUEVA, no el borrador de la anterior.
  const key = (field: string) => `${load.id}:${field}`;

  return (
    <CollapsibleSection label={`Carga ${load.id}`}>
      <Row label="Tipo">
        <span className="font-mono text-[10px] text-text-primary">
          {load.kind === 'point-node' ? 'PUNTUAL EN NODO'
            : load.kind === 'udl' ? 'REPARTIDA'
            : 'PUNTUAL EN BARRA'}
        </span>
      </Row>
      <Row label="Hipótesis">
        <FieldSelect value={load.lc} onChange={(v) => patch((l) => ({ ...l, lc: v as LoadCase }))}>
          <option value="G">G — Permanente</option>
          <option value="Q">Q — Sobrecarga</option>
          <option value="W">W — Viento</option>
          <option value="S">S — Nieve</option>
          <option value="E">E — Sismo</option>
        </FieldSelect>
      </Row>
      {load.lc === 'Q' && (
        <Row label="Categoría de uso">
          <FieldSelect
            value={load.useCategory ?? 'B'}
            onChange={(v) => patch((l) => ({ ...l, useCategory: v as UseCategoryCode }))}
          >
            {USE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </FieldSelect>
        </Row>
      )}
      {load.kind === 'point-node' && (
        <>
          <DraftNumberField
            label="Px" value={load.Px ?? 0} quantity="force" allowNegative resetKey={key('Px')}
            onCommit={(v) => patch((l) => l.kind === 'point-node' ? { ...l, Px: v } : l)}
          />
          <DraftNumberField
            label="Py" value={load.Py ?? 0} quantity="force" allowNegative resetKey={key('Py')}
            onCommit={(v) => patch((l) => l.kind === 'point-node' ? { ...l, Py: v } : l)}
          />
          <p className="pt-0.5 text-[10px] italic leading-snug text-text-disabled">
            Py: positivo hacia abajo (gravedad), negativo hacia arriba.
          </p>
        </>
      )}
      {load.kind === 'udl' && (
        <DraftNumberField
          label="q" value={load.w} quantity="linearLoad" min={0} resetKey={key('w')}
          onCommit={(v) => patch((l) => l.kind === 'udl' ? { ...l, w: v } : l)}
        />
      )}
      {load.kind === 'point-bar' && (
        <>
          <DraftNumberField
            label="P" value={load.P} quantity="force" min={0} resetKey={key('P')}
            onCommit={(v) => patch((l) => l.kind === 'point-bar' ? { ...l, P: v } : l)}
          />
          <DraftNumberField
            label="pos" value={load.pos} min={0} max={1} resetKey={key('pos')}
            help="Posición a lo largo de la barra: 0 = extremo inicial, 1 = extremo final."
            onCommit={(v) => patch((l) => l.kind === 'point-bar' ? { ...l, pos: v } : l)}
          />
        </>
      )}
    </CollapsibleSection>
  );
}

function LoadRow({
  load, setModel, isSelected, onSelect, readOnly,
}: {
  load: Load;
  setModel: (u: (m: DesignModel) => DesignModel) => void;
  isSelected: boolean;
  onSelect: () => void;
  readOnly?: boolean;
}) {
  const { system } = useUnitSystem();
  const target = load.kind === 'point-node' ? `nodo ${load.node}` : `barra ${load.bar}`;
  const summary = load.kind === 'point-node'
    ? `Py=${formatQuantity(load.Py ?? 0, 'force', system)}`
    : load.kind === 'udl'
      ? `q=${formatQuantity(load.w, 'linearLoad', system)}`
      : `P=${formatQuantity(load.P, 'force', system)}`;

  // <button> nativo, no `div role="button"`: el teclado, el foco y el estado
  // deshabilitado del <fieldset> salen gratis en vez de reimplementarse.
  return (
    <div className={`flex items-center gap-1.5 border-b border-border-sub transition-colors last:border-b-0 ${isSelected ? 'bg-accent/10' : ''}`}>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={isSelected}
        className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-bg-elevated/60 max-md:min-h-11"
      >
        <span className="shrink-0 rounded bg-bg-elevated px-1.5 py-0.5 font-mono text-[10px] font-semibold text-text-secondary">
          {load.lc}
        </span>
        <span className={`shrink-0 font-mono text-[10.5px] ${isSelected ? 'text-accent' : 'text-text-secondary'}`}>{load.id}</span>
        <span className="min-w-0 truncate font-mono text-[10.5px] tabular-nums text-text-secondary">
          {target} · {summary}
        </span>
      </button>
      {!readOnly && (
        <button
          type="button"
          onClick={() => setModel((m) => ({ ...m, loads: m.loads.filter((l) => l.id !== load.id) }))}
          aria-label={`Borrar ${load.id}`}
          className="mr-1 shrink-0 p-1.5 text-text-disabled transition-colors hover:text-state-fail max-md:min-h-11"
        >
          <Trash2 size={11} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

// ── UI primitives ──────────────────────────────────────────────────────────

function Row({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.25">
      <span className="text-[12px] text-text-secondary">{label}</span>
      {children ?? <span className="font-mono text-[11px] tabular-nums text-text-primary">{value}</span>}
    </div>
  );
}

function SegmentButton({ active, onClick, children }: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded px-2.25 py-0.75 font-mono text-[11px] transition-colors ${
        active
          ? 'border border-accent/40 bg-accent/15 text-accent'
          : 'border border-border-main bg-bg-elevated text-text-secondary'
      }`}
    >
      {children}
    </button>
  );
}

function FieldSelect({ value, onChange, children }: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="fem-focus-ring h-6 w-32.5 rounded border border-border-main bg-bg-primary px-1.5 font-mono text-[12px] text-text-primary"
    >
      {children}
    </select>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function setBarMaterial(
  setModel: (u: (m: DesignModel) => DesignModel) => void,
  barId: string,
  material: 'rc' | 'steel',
) {
  setModel((m) => ({
    ...m,
    bars: m.bars.map((b) => {
      if (b.id !== barId) return b;
      if (material === 'rc') {
        // Restore defaults for any RC fields that were cleared during a
        // previous switch to steel — otherwise the round-trip steel→rc would
        // leave the bar with undefined armado and the adapter would mark it
        // 'pending' even though the user expects the previous defaults.
        return {
          ...b,
          material: 'rc',
          rcSection: b.rcSection ?? { b: 30, h: 50, fck: 25, fyk: 500, cover: 30, exposureClass: 'XC1', loadType: 'B' },
          vano_armado: b.vano_armado ?? { ...DEFAULT_VANO_ARMADO },
          apoyo_armado: b.apoyo_armado ?? { ...DEFAULT_APOYO_ARMADO },
          steelSelection: undefined,
        };
      } else {
        // Preserve rcSection/armado on the bar while material is steel — they
        // survive the round-trip back to RC instead of being wiped. Type
        // discriminator (`material`) is what gates which fields the solver
        // and adapters read.
        return {
          ...b,
          material: 'steel',
          steelSelection: b.steelSelection ?? { profileKey: 'steel_IPE240', steel: 'S275', beamType: 'ss', deflLimit: 300, elsCombo: 'characteristic', useCategory: 'B' },
        };
      }
    }),
  }));
}
