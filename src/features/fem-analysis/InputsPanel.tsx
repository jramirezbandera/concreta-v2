// FEM 2D — InputsPanel
//
// Four panel states by selection (per design review Pass 1):
//   - null (no selection)   → "Modelo global": geometry counts, combo, share button
//   - bar selected          → bar properties (material toggle, section, armado)
//   - node selected         → coords + support type + internal hinge toggle
//   - load selected         → type + value + lc + position
//
// Plus a persistent "Cargas" + "Geometría" + "Combinación" sections at the
// bottom (matching the legacy esqueleto layout for familiarity).

import { CollapsibleSection } from '../../components/ui/CollapsibleSection';
import { USE_CATEGORIES } from '../../lib/calculations/loadGen';
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
}

export function InputsPanel({
  model, setModel, selected, setSelected, result,
  activeSection, setActiveSection,
}: Props) {
  const selBar = selected?.kind === 'bar' ? model.bars.find((b) => b.id === selected.id) : undefined;
  const selNode = selected?.kind === 'node' ? model.nodes.find((n) => n.id === selected.id) : undefined;
  const selLoad = selected?.kind === 'load' ? model.loads.find((l) => l.id === selected.id) : undefined;

  return (
    <div style={{ padding: '12px 14px' }}>
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

      {/* Always-visible sections */}
      {!selBar && !selNode && !selLoad && (
        <CollapsibleSection label="Modelo global">
          <Row label="Barras" value={`${model.bars.length}`} />
          <Row label="Nodos" value={`${model.nodes.length}`} />
          <Row label="Apoyos" value={`${model.supports.length}`} />
          <Row label="Cargas" value={`${model.loads.length}`} />
        </CollapsibleSection>
      )}

      {/* Loads list (always visible) */}
      <CollapsibleSection label={`Cargas (${model.loads.length})`}>
        <Row label="Peso propio">
          <button
            type="button"
            onClick={() => setModel((m) => ({ ...m, selfWeight: !m.selfWeight }))}
            style={{
              padding: '2px 8px', fontSize: 10, borderRadius: 4,
              background: model.selfWeight ? 'rgba(56,189,248,0.1)' : 'var(--color-bg-elevated)',
              color: model.selfWeight ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              border: '1px solid ' + (model.selfWeight ? 'var(--color-accent)' : 'var(--color-border-main)'),
              fontFamily: 'var(--font-mono)', cursor: 'pointer',
            }}
          >
            {model.selfWeight ? 'ON' : 'OFF'}
          </button>
        </Row>
        {model.loads.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--color-text-disabled)', marginTop: 6 }}>
            Sin cargas. Selecciona la herramienta de carga y haz click en un nodo o barra.
          </div>
        )}
        {model.loads.map((ld) => (
          <LoadRow
            key={ld.id}
            load={ld}
            setModel={setModel}
            isSelected={selected?.kind === 'load' && selected.id === ld.id}
            onSelect={() => setSelected({ kind: 'load', id: ld.id })}
          />
        ))}
      </CollapsibleSection>

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
  const family = bar.material;
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 11, color: 'var(--color-text-disabled)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600, padding: '0 0 6px', borderBottom: '1px solid var(--color-border-sub)' }}>
        Barra {bar.id}
      </div>

      {/* Material toggle (lightweight, sits above the embed) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Material</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['rc', 'steel'] as const).map((fam) => {
            const active = family === fam;
            return (
              <button
                key={fam}
                type="button"
                onClick={() => setBarMaterial(setModel, bar.id, fam)}
                style={pillStyle(active)}
              >
                {fam === 'rc' ? 'HORMIGÓN' : 'ACERO'}
              </button>
            );
          })}
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
  void model;
  const support = model.supports.find((s) => s.node === node.id);
  const isInteriorNode = (() => {
    // Node is "interior" if at least 2 bars meet at it.
    const count = model.bars.filter((b) => b.i === node.id || b.j === node.id).length;
    return count >= 2;
  })();
  // For now we just expose a hinge toggle that flips the j-end of the bar
  // ending at this node + the i-end of the bar starting at this node.
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
        <select
          value={support?.type ?? 'none'}
          onChange={(e) => {
            const v = e.target.value;
            setModel((m) => {
              const others = m.supports.filter((s) => s.node !== node.id);
              return v === 'none'
                ? { ...m, supports: others }
                : { ...m, supports: [...others, { node: node.id, type: v as SupportType }] };
            });
          }}
          style={fieldSelectStyle()}
        >
          <option value="none">Ninguno</option>
          <option value="pinned">Articulado</option>
          <option value="fixed">Empotrado</option>
          <option value="roller">Deslizante</option>
        </select>
      </Row>
      {isInteriorNode && !support && (
        <Row label="Articulación">
          <button
            type="button"
            onClick={toggleHinge}
            style={pillStyle(hingeOn)}
          >
            {hingeOn ? 'ON' : 'OFF'}
          </button>
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
  return (
    <CollapsibleSection label={`Carga ${load.id}`}>
      <Row label="Tipo">
        <span className="font-mono" style={{ fontSize: 10 }}>
          {load.kind === 'point-node' ? 'PUNTUAL EN NODO'
            : load.kind === 'udl' ? 'REPARTIDA'
            : 'PUNTUAL EN BARRA'}
        </span>
      </Row>
      <Row label="Hipótesis">
        <select
          value={load.lc}
          onChange={(e) => patch((l) => ({ ...l, lc: e.target.value as LoadCase }))}
          style={fieldSelectStyle()}
        >
          <option value="G">G — Permanente</option>
          <option value="Q">Q — Sobrecarga</option>
          <option value="W">W — Viento</option>
          <option value="S">S — Nieve</option>
          <option value="E">E — Sismo</option>
        </select>
      </Row>
      {load.lc === 'Q' && (
        <Row label="Categoría de uso">
          <select
            value={load.useCategory ?? 'B'}
            onChange={(e) => patch((l) => ({ ...l, useCategory: e.target.value as UseCategoryCode }))}
            style={fieldSelectStyle()}
          >
            {USE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </Row>
      )}
      {load.kind === 'point-node' && (
        <>
          <NumField label="Px" value={load.Px ?? 0} unit="kN" step={1}
            onChange={(v) => patch((l) => l.kind === 'point-node' ? { ...l, Px: v } : l)} />
          <NumField label="Py" value={load.Py ?? 0} unit="kN" step={1}
            onChange={(v) => patch((l) => l.kind === 'point-node' ? { ...l, Py: v } : l)} />
          <div style={{ fontSize: 10, color: 'var(--color-text-disabled)', fontStyle: 'italic', padding: '2px 0 0', lineHeight: 1.4 }}>
            Py: positivo hacia abajo (gravedad), negativo hacia arriba.
          </div>
        </>
      )}
      {load.kind === 'udl' && (
        <NumField label="q" value={load.w} unit="kN/m" step={1} min={0}
          onChange={(v) => patch((l) => l.kind === 'udl' ? { ...l, w: v } : l)} />
      )}
      {load.kind === 'point-bar' && (
        <>
          <NumField label="P" value={load.P} unit="kN" step={1} min={0}
            onChange={(v) => patch((l) => l.kind === 'point-bar' ? { ...l, P: v } : l)} />
          <NumField label="pos" value={load.pos} step={0.05} min={0} max={1}
            onChange={(v) => patch((l) => l.kind === 'point-bar' ? { ...l, pos: v } : l)} />
        </>
      )}
    </CollapsibleSection>
  );
}

function LoadRow({
  load, setModel, isSelected, onSelect,
}: {
  load: Load;
  setModel: (u: (m: DesignModel) => DesignModel) => void;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const target = load.kind === 'point-node' ? `nodo ${load.node}` : `barra ${load.bar}`;
  const summary = load.kind === 'point-node' ? `Py=${load.Py ?? 0} kN`
    : load.kind === 'udl' ? `q=${load.w} kN/m`
    : `P=${load.P} kN`;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      aria-selected={isSelected}
      style={{
        background: isSelected ? 'rgba(56,189,248,0.05)' : 'var(--color-bg-primary)',
        border: '1px solid var(--color-border-sub)',
        borderLeft: isSelected ? '2px solid var(--color-accent)' : '2px solid transparent',
        borderRadius: 4,
        padding: '6px 8px',
        marginBottom: 4,
        cursor: 'pointer',
        transition: 'background-color 150ms ease-in-out, border-color 150ms ease-in-out',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="font-mono" style={{ fontSize: 11, color: 'var(--color-accent)' }}>{load.id}</span>
        <span className="font-mono" style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{target}</span>
        <span className="font-mono" style={{ fontSize: 10, color: 'var(--color-text-secondary)', padding: '1px 5px', borderRadius: 3, background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border-sub)' }}>
          [{load.lc}]
        </span>
        <span className="font-mono" style={{ fontSize: 11, color: 'var(--color-text-primary)', marginLeft: 'auto' }}>{summary}</span>
        <button
          type="button"
          onClick={(e) => {
            // Critical (Codex catch #8): stopPropagation prevents the row's
            // onSelect from firing when delete is clicked, which would
            // otherwise select a load that just got deleted.
            e.stopPropagation();
            setModel((m) => ({ ...m, loads: m.loads.filter((l) => l.id !== load.id) }));
          }}
          style={{ color: 'var(--color-text-disabled)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}
          aria-label={`Borrar ${load.id}`}
        >×</button>
      </div>
    </div>
  );
}

// ── UI primitives ──────────────────────────────────────────────────────────

function Row({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', gap: 8 }}>
      <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{label}</span>
      {children ?? (
        <span className="font-mono" style={{ fontSize: 11, color: 'var(--color-text-primary)' }}>{value}</span>
      )}
    </div>
  );
}

function NumField({
  label, value, unit, onChange, step = 1, min, max,
}: {
  label: string;
  value: number;
  unit?: string;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <Row label={label}>
      <div style={{ display: 'flex', alignItems: 'stretch', height: 24 }}>
        <input
          type="number"
          value={Number.isFinite(value) ? value : 0}
          step={step}
          min={min}
          max={max}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (Number.isFinite(v)) onChange(v);
          }}
          style={{
            width: 60,
            background: 'var(--color-bg-primary)',
            border: '1px solid var(--color-border-main)',
            borderRight: unit ? 'none' : '1px solid var(--color-border-main)',
            borderRadius: unit ? '4px 0 0 4px' : 4,
            textAlign: 'right',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            padding: '0 6px',
            outline: 'none',
            color: 'var(--color-text-primary)',
          }}
        />
        {unit && (
          <span style={{
            background: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border-main)',
            borderRadius: '0 4px 4px 0',
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-text-disabled)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 6px',
            minWidth: 32,
          }}>
            {unit}
          </span>
        )}
      </div>
    </Row>
  );
}

function pillStyle(active: boolean): React.CSSProperties {
  return {
    padding: '3px 9px',
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    borderRadius: 3,
    background: active ? 'rgba(56,189,248,0.12)' : 'var(--color-bg-elevated)',
    color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)',
    border: '1px solid ' + (active ? 'var(--color-accent)' : 'var(--color-border-main)'),
    cursor: 'pointer',
  };
}

function fieldSelectStyle(): React.CSSProperties {
  return {
    background: 'var(--color-bg-primary)',
    border: '1px solid var(--color-border-main)',
    borderRadius: 4,
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    color: 'var(--color-text-primary)',
    padding: '2px 6px',
    height: 24,
    width: 130,
    outline: 'none',
  };
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

