// FEM 2D — selection-driven inspector (left panel).
//
// Four states keyed off Selected2D, mirroring the 1D InputsPanel:
//   nothing → model summary + self-weight + snow>1000m (solo si hay madera) +
//             load list (rows select their load; trash deletes). Empezar una
//             estructura nueva vive en el botón + de la barra del lienzo.
//   member  → rol (auto/manual + volver-a-auto) · biela · material (acero ⇄
//             hormigón ⇄ madera) · [acero: perfil · acero · correas] · [HA:
//             sección b/h/fck/fyk/recubrimiento/exposición + armado por rol
//             (vano y apoyo para viga/cordón; jaula para pilar)] · [madera:
//             clase resistente · escuadría b×h mm · clase de servicio · correas
//             en viga/cordón] · rótulas i/j · borrar.
//   node    → x/y (commit-on-blur) · apoyo · borrar.
//   load    → hipótesis/categoría · componentes (mundo o marco local) ·
//             extensión (UDL) / posición (puntual en barra) · borrar.
//
// Every numeric edit goes through DraftNumberField (ONE history entry per
// gesture); every mutation is a pure modelOps call.

import { useState, type JSX } from 'react';
import { ChevronLeft, Copy, Maximize2, Move, Trash2 } from 'lucide-react';
import { showToast } from '../../components/ui/Toast';
import { InputLabel } from '../../components/ui/InputLabel';
import { formatQuantity } from '../../lib/units/format';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import { lcOptionLabel, LC_HELP, CATEGORY_HELP } from '../../lib/text/loadCases';
import { categoryLabel } from '../../lib/calculations/loadGen';
import { DraftNumberField } from '../../components/units/DraftNumberField';
import { ToggleChip } from '../../components/ui/ToggleChip';
import {
  AXIAL_FAMILIES,
  BENDING_FAMILIES,
  familyOfKey,
  nearestInFamily,
  steelEntriesByFamily,
  type SteelFamily,
} from './profiles';
import { TIMBER_GRADES } from '../../data/timberGrades';
import {
  DEFAULT_APOYO_ARMADO_2D,
  DEFAULT_COLUMN_CAGE_2D,
  DEFAULT_RC_BEAM_SECTION_2D,
  DEFAULT_TIMBER_SECTION_2D,
  DEFAULT_VANO_ARMADO_2D,
  deleteLoad,
  deleteMember,
  deleteNode,
  deleteSelection,
  duplicateSelection,
  editMembersMany,
  moveNode,
  normalizeSelection,
  selectionMoveNodeIds,
  translateSelection,
  setMemberDeflLimit,
  setMemberLtbSpacing,
  setMemberMaterial,
  setMemberProfile,
  setMemberRelease,
  setMemberSteel,
  setMemberWeakAxisBracing,
  setRcDesignKind,
  setSupport,
  updateLoad,
  updateMemberArmado,
  updateMemberColumnCage,
  updateMemberRcSection,
  updateMemberTimberSection,
  type OpResult,
  type Selected2D,
  type SelectionSet2D,
} from './modelOps';
import { memberFormulation } from './decompose';
import type { ArmadoHA, DeflLimit2D, Fem2DLoad, Fem2DMember, Fem2DModel, RcColumnCage, Support2DType } from './types';
import type { ServiceClass } from '../../data/timberGrades';

interface Props {
  model: Fem2DModel;
  setModel: (updater: (m: Fem2DModel) => Fem2DModel) => void;
  selected: Selected2D;
  setSelected: (s: Selected2D) => void;
  /** Abre la ficha de cálculo grande de la barra (modal Fem2DMemberDetail). */
  onOpenDetail?: (memberId: string) => void;
  readOnly?: boolean;
}

/** D10 — límite de flecha por barra (CTE DB-SE 4.3.3). El value serializa el
 *  campo: 'none' = no aplica; los números son el denominador de L/n. */
const DEFL_OPTIONS: { value: DeflLimit2D; label: string }[] = [
  { value: 500, label: 'L/500 · tabiques frágiles' },
  { value: 400, label: 'L/400 · tabiques ordinarios' },
  { value: 300, label: 'L/300 · apariencia' },
  { value: 'none', label: 'No aplica' },
];

const SUPPORT_OPTIONS: { value: Support2DType | 'none'; label: string }[] = [
  { value: 'none', label: 'Sin apoyo' },
  { value: 'pinned', label: 'Articulado' },
  { value: 'fixed', label: 'Empotrado' },
  { value: 'roller', label: 'Deslizante' },
];

const LC_OPTIONS = ['G', 'Q', 'W', 'S', 'E'] as const;
const CATEGORIAS = ['A1', 'A2', 'B', 'C1', 'C2', 'C3', 'D1', 'E1', 'G1'] as const;

const FCK_OPTIONS = [25, 30, 35, 40, 45, 50] as const;
const FYK_OPTIONS = [400, 500] as const;
const EXPOSURE_OPTIONS = ['XC1', 'XC2', 'XC3', 'XC4'] as const;

/** Clases resistentes agrupadas para el select de madera. */
const TIMBER_GRADE_GROUPS: { label: string; ids: string[] }[] = [
  { label: 'Aserrada — conífera (C)', ids: TIMBER_GRADES.filter((g) => g.type === 'sawn' && g.subtype === 'softwood').map((g) => g.id) },
  { label: 'Aserrada — frondosa (D)', ids: TIMBER_GRADES.filter((g) => g.type === 'sawn' && g.subtype === 'hardwood').map((g) => g.id) },
  { label: 'Laminada encolada (GL)', ids: TIMBER_GRADES.filter((g) => g.type === 'glulam').map((g) => g.id) },
];

const SERVICE_CLASS_OPTIONS: { value: ServiceClass; label: string }[] = [
  { value: 1, label: '1 — interior seco' },
  { value: 2, label: '2 — cubierto / protegido' },
  { value: 3, label: '3 — exterior expuesto' },
];

const selectClass =
  'bg-bg-primary border border-border-main rounded px-2 py-1 text-[12px] font-mono text-text-primary outline-none hover:border-accent/40 focus:border-accent transition-colors w-full';

function Row({ label, help, children }: { label: string; help?: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex flex-col gap-1 py-0.75 min-w-0">
      <InputLabel label={label} help={help} />
      {children}
    </div>
  );
}

function PanelHeader({ title, sub, onBack }: { title: string; sub?: string; onBack: () => void }): JSX.Element {
  return (
    <div className="flex items-center gap-2 pb-2 border-b border-border-sub mb-2">
      <button
        type="button"
        onClick={onBack}
        aria-label="Volver al resumen"
        className="p-1 -ml-1 rounded text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
      >
        <ChevronLeft size={14} />
      </button>
      <span className="font-mono text-[12.5px] font-semibold text-text-primary">{title}</span>
      {sub && <span className="text-[11px] text-text-disabled truncate min-w-0">{sub}</span>}
    </div>
  );
}

function DeleteButton({ label, onClick }: { label: string; onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 inline-flex items-center gap-1.5 self-start px-3 py-1.5 rounded border border-state-fail/40 text-[12px] text-state-fail hover:bg-state-fail/10 transition-colors"
    >
      <Trash2 size={12} aria-hidden="true" />
      {label}
    </button>
  );
}

// ── Shared blocks (vector ops) ──────────────────────────────────────────────

/** Δx/Δy del bloque de vector, propiedad del inspector (ver Fem2DInspector). */
interface VectorState {
  dx: number;
  dy: number;
  setDx: (v: number) => void;
  setDy: (v: number) => void;
}

/** Título de sección de un bloque del panel (selección múltiple y vector). */
function MultiSection({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="rounded border border-border-main px-3 py-2 flex flex-col gap-1">
      <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled">
        {label}
      </p>
      {children}
    </div>
  );
}

/**
 * Desplazar / copiar por vector. Vive en los TRES paneles de geometría (barra,
 * nudo y selección múltiple) sobre el mismo id-set: un click en una barra ya
 * puede moverla o clonarla, sin obligar a encerrarla en una ventana.
 *
 * Δx/Δy NO son estado propio: los tiene el inspector, porque tras "Copiar" la
 * selección salta a la copia — y con ella cambia el panel (barra → múltiple, al
 * clonarse los dos nudos) — y repetir el gesto debe encadenar (x·2, y·2).
 *
 * Se oculta cuando la selección no arrastra ningún nudo (una carga suelta).
 */
function VectorOps({ model, setModel, setSelected, sel, note, dx, dy, setDx, setDy }: VectorState & {
  model: Fem2DModel;
  setModel: (updater: (m: Fem2DModel) => Fem2DModel) => void;
  setSelected: (s: Selected2D) => void;
  sel: SelectionSet2D;
  note: string;
}): JSX.Element | null {
  if (selectionMoveNodeIds(model, sel).size === 0) return null;

  const doTranslate = () => {
    const res = translateSelection(model, sel, dx, dy);
    if (res.ok) setModel(() => res.model);
    else showToast(res.reason, { autoDismiss: 4000 });
  };

  const doCopy = () => {
    const res = duplicateSelection(model, sel, dx, dy);
    if (res.ok) {
      setModel(() => res.model);
      setSelected(normalizeSelection(res.selection));
      showToast(
        `Copiados ${res.selection.nodes.length} nudo${res.selection.nodes.length === 1 ? '' : 's'} y ${res.selection.members.length} barra${res.selection.members.length === 1 ? '' : 's'} — la selección es la copia (repite para encadenar).`,
        { autoDismiss: 4000 },
      );
    } else {
      showToast(res.reason, { autoDismiss: 4000 });
    }
  };

  const vectorBtnClass =
    'flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded border border-border-main text-[11.5px] text-text-secondary hover:text-accent hover:border-accent/40 transition-colors';

  return (
    <MultiSection label="Desplazar / copiar (vector)">
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        <DraftNumberField
          stacked label="Δx" unit="m" value={dx} resetKey="multi:dx"
          onCommit={setDx}
        />
        <DraftNumberField
          stacked label="Δy" unit="m" value={dy} resetKey="multi:dy"
          onCommit={setDy}
        />
      </div>
      <div className="flex gap-1.5 pt-1">
        <button type="button" onClick={doTranslate} className={vectorBtnClass}>
          <Move size={12} aria-hidden="true" />
          Desplazar
        </button>
        <button type="button" onClick={doCopy} className={vectorBtnClass}>
          <Copy size={12} aria-hidden="true" />
          Copiar
        </button>
      </div>
      <p className="text-[10px] text-text-disabled leading-snug">{note}</p>
    </MultiSection>
  );
}

const VECTOR_NOTE_MEMBER =
  'Desplazar mueve los dos nudos de la barra. La copia la clona con sus cargas y los apoyos de sus nudos, y queda seleccionada: repite Copiar para encadenar.';
const VECTOR_NOTE_NODE =
  'Desplazar mueve el nudo (las barras que llegan a él le siguen). La copia clona el nudo con su apoyo y sus cargas, y queda seleccionada: repite Copiar para encadenar.';
const VECTOR_NOTE_MULTI =
  'Una barra seleccionada arrastra sus dos nudos. La copia clona las barras entre nudos del bloque con sus cargas y apoyos, y queda seleccionada: repite Copiar para encadenar.';

// ── Global (nothing selected) ────────────────────────────────────────────────

function loadSummary(ld: Fem2DLoad, system: 'si' | 'tecnico'): string {
  const F = (v: number) => formatQuantity(v, 'force', system);
  const W = (v: number) => formatQuantity(v, 'linearLoad', system);
  if (ld.kind === 'node') {
    const parts = [ld.Fx !== 0 ? `Fx ${F(ld.Fx)}` : null, ld.Fy !== 0 ? `Fy ${F(ld.Fy)}` : null].filter(Boolean);
    return `${ld.node} · ${parts.join(' · ') || '0'}`;
  }
  if (ld.kind === 'udl') {
    const parts = [ld.wx !== 0 ? `wx ${W(ld.wx)}` : null, ld.wy !== 0 ? `wy ${W(ld.wy)}` : null].filter(Boolean);
    return `${ld.member} · ${parts.join(' · ') || '0'}${ld.frame === 'local' ? ' (local)' : ''}`;
  }
  const parts = [ld.Fx !== 0 ? `Fx ${F(ld.Fx)}` : null, ld.Fy !== 0 ? `Fy ${F(ld.Fy)}` : null].filter(Boolean);
  return `${ld.member} @ ${ld.pos.toFixed(2)} · ${parts.join(' · ') || '0'}${ld.frame === 'local' ? ' (local)' : ''}`;
}

function GlobalPanel({ model, setModel, setSelected, readOnly }: Props): JSX.Element {
  const { system } = useUnitSystem();
  // La duración de la nieve (kmod) solo afecta a barras de MADERA — el toggle
  // se muestra únicamente cuando hay alguna, para no ensuciar los modelos de
  // acero/HA con un dato que no usan.
  const hasTimber = model.members.some((m) => m.material === 'timber');
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded border border-border-main px-3 py-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled mb-1.5">Modelo</p>
        <p className="font-mono text-[11px] text-text-secondary tabular-nums">
          {model.nodes.length} nudos · {model.members.length} barras · {model.supports.length} apoyos · {model.loads.length} cargas
        </p>
        <p className="text-[10px] text-text-disabled mt-1.5 leading-snug">
          Selecciona un nudo, una barra o una carga (en el lienzo o en la lista) para editarla aquí.
        </p>
      </div>

      <div className="flex items-center justify-between gap-2 min-w-0 px-0.5">
        <InputLabel label="Peso propio" help="Incluye el peso propio de los perfiles como una hipótesis G." />
        <ToggleChip
          on={model.selfWeight}
          onToggle={() => setModel((m) => ({ ...m, selfWeight: !m.selfWeight }))}
          onLabel="Incluido"
          offLabel="Omitido"
          disabled={readOnly}
        />
      </div>

      {hasTimber && (
        <div className="flex items-center justify-between gap-2 min-w-0 px-0.5">
          <InputLabel
            label="Nieve a >1000 m"
            help="Madera: por encima de 1000 m de altitud la nieve es una acción de duración MEDIA (kmod menor, EC5 §2.3.1.2 / CTE DB-SE-M), no corta. Solo afecta a las barras de madera con hipótesis de nieve; acero y hormigón la ignoran."
          />
          <ToggleChip
            on={model.snowOver1000m ?? false}
            onToggle={() => setModel((m) => ({ ...m, snowOver1000m: !(m.snowOver1000m ?? false) }))}
            onLabel=">1000 m"
            offLabel="≤1000 m"
            disabled={readOnly}
          />
        </div>
      )}

      <div className="rounded border border-border-main overflow-hidden">
        <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled px-3 pt-2.5 pb-1.5 border-b border-border-sub">
          Cargas ({model.loads.length})
        </p>
        {model.loads.length === 0 ? (
          <p className="text-[11px] text-text-disabled px-3 py-2">Sin cargas. Usa las herramientas de carga del lienzo.</p>
        ) : (
          model.loads.map((ld) => (
            <div key={ld.id} className="flex items-center gap-1.5 border-b border-border-sub last:border-b-0">
              <button
                type="button"
                onClick={() => setSelected({ kind: 'load', id: ld.id })}
                className="flex items-center gap-2 px-3 py-1.5 flex-1 min-w-0 text-left hover:bg-bg-elevated/60 transition-colors"
              >
                <span className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded bg-bg-elevated text-text-secondary shrink-0">
                  {ld.lc}
                </span>
                <span className="font-mono text-[10.5px] text-text-secondary tabular-nums truncate min-w-0">
                  {loadSummary(ld, system)}
                </span>
              </button>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => setModel((m) => deleteLoad(m, ld.id))}
                  aria-label={`Eliminar carga ${ld.id}`}
                  className="p-1.5 mr-1 text-text-disabled hover:text-state-fail transition-colors shrink-0"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── RC member editor (sección + armado por rol) ─────────────────────────────

function SubHeader({ label }: { label: string }): JSX.Element {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled pt-2 pb-0.5">
      {label}
    </p>
  );
}

interface RcEditorProps {
  m: Fem2DMember;
  model: Fem2DModel;
  setModel: (updater: (mm: Fem2DModel) => Fem2DModel) => void;
}

/** One armado region (vano o apoyo): tracción + compresión + cercos. */
function ArmadoRegionEditor({ m, setModel, region, armado, label, subLabel }: RcEditorProps & {
  region: 'vano' | 'apoyo';
  armado: ArmadoHA;
  label: string;
  subLabel: string;
}): JSX.Element {
  const patch = (p: Partial<ArmadoHA>) =>
    setModel((mm) => updateMemberArmado(mm, m.id, region, p));
  const key = `${m.id}:${region}`;
  return (
    <>
      <SubHeader label={`${label} · ${subLabel}`} />
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        <DraftNumberField
          stacked label="n" sub="tracción" integer value={armado.tens_nBars} resetKey={`${key}:tn`} min={1}
          onCommit={(v) => patch({ tens_nBars: Math.max(1, Math.round(v)) })}
        />
        <DraftNumberField
          stacked label="Ø" sub="tracción" unit="mm" integer value={armado.tens_barDiam} resetKey={`${key}:td`} min={6}
          onCommit={(v) => patch({ tens_barDiam: Math.max(6, Math.round(v)) })}
        />
        <DraftNumberField
          stacked label="n" sub="compresión" integer value={armado.comp_nBars} resetKey={`${key}:cn`} min={0}
          onCommit={(v) => patch({ comp_nBars: Math.max(0, Math.round(v)) })}
        />
        <DraftNumberField
          stacked label="Ø" sub="compresión" unit="mm" integer value={armado.comp_barDiam} resetKey={`${key}:cd`} min={6}
          onCommit={(v) => patch({ comp_barDiam: Math.max(6, Math.round(v)) })}
        />
        <DraftNumberField
          stacked label="Ø" sub="cerco" unit="mm" integer value={armado.stirrupDiam} resetKey={`${key}:sd`} min={5}
          onCommit={(v) => patch({ stirrupDiam: Math.max(5, Math.round(v)) })}
        />
        <DraftNumberField
          stacked label="s" sub="cercos" unit="mm" integer value={armado.stirrupSpacing} resetKey={`${key}:ss`} min={40}
          onCommit={(v) => patch({ stirrupSpacing: Math.max(40, Math.round(v)) })}
        />
        <DraftNumberField
          stacked label="ramas" sub="cerco" integer value={armado.stirrupLegs} resetKey={`${key}:sl`} min={2}
          onCommit={(v) => patch({ stirrupLegs: Math.max(2, Math.round(v)) })}
        />
      </div>
    </>
  );
}

/** Jaula rectangular de pilar: 4 esquinas + intermedias por cara + cercos. */
function ColumnCageEditor({ m, setModel, cage }: RcEditorProps & { cage: RcColumnCage }): JSX.Element {
  const patch = (p: Partial<RcColumnCage>) =>
    setModel((mm) => updateMemberColumnCage(mm, m.id, p));
  const key = `${m.id}:cage`;
  return (
    <>
      <SubHeader label="Armado del pilar" />
      <p className="text-[10px] text-text-disabled leading-snug pb-1">
        4 barras de esquina siempre presentes + intermedias por cara (X = caras
        horizontales, Y = caras verticales de la sección).
      </p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        <DraftNumberField
          stacked label="Ø" sub="esquinas" unit="mm" integer value={cage.cornerBarDiam} resetKey={`${key}:corner`} min={8}
          onCommit={(v) => patch({ cornerBarDiam: Math.max(8, Math.round(v)) })}
        />
        <div />
        <DraftNumberField
          stacked label="n" sub="interm. X" integer value={cage.nBarsX} resetKey={`${key}:nx`} min={0}
          onCommit={(v) => patch({ nBarsX: Math.max(0, Math.round(v)) })}
        />
        <DraftNumberField
          stacked label="Ø" sub="interm. X" unit="mm" integer value={cage.barDiamX} resetKey={`${key}:dx`} min={6}
          onCommit={(v) => patch({ barDiamX: Math.max(6, Math.round(v)) })}
        />
        <DraftNumberField
          stacked label="n" sub="interm. Y" integer value={cage.nBarsY} resetKey={`${key}:ny`} min={0}
          onCommit={(v) => patch({ nBarsY: Math.max(0, Math.round(v)) })}
        />
        <DraftNumberField
          stacked label="Ø" sub="interm. Y" unit="mm" integer value={cage.barDiamY} resetKey={`${key}:dy`} min={6}
          onCommit={(v) => patch({ barDiamY: Math.max(6, Math.round(v)) })}
        />
        <DraftNumberField
          stacked label="Ø" sub="cerco" unit="mm" integer value={cage.stirrupDiam} resetKey={`${key}:sd`} min={5}
          onCommit={(v) => patch({ stirrupDiam: Math.max(5, Math.round(v)) })}
        />
        <DraftNumberField
          stacked label="s" sub="cercos" unit="mm" integer value={cage.stirrupSpacing} resetKey={`${key}:ss`} min={40}
          onCommit={(v) => patch({ stirrupSpacing: Math.max(40, Math.round(v)) })}
        />
      </div>
    </>
  );
}

function RcMemberEditor({ m, model, setModel }: RcEditorProps): JSX.Element {
  const sec = m.rcSection;
  if (!sec) return <p className="text-[11px] text-state-fail px-0.5 py-1">Barra HA sin sección — cambia a acero y vuelve a hormigón para regenerarla.</p>;
  const patchSec = (p: Parameters<typeof updateMemberRcSection>[2]) =>
    setModel((mm) => updateMemberRcSection(mm, m.id, p));
  const kind = m.rcDesignKind;
  return (
    <>
      {/* Fase 2 — la ÚNICA elección que heredó del rol: qué armado se lee.
          Destacada mientras esté sin elegir (la barra lee PENDIENTE). */}
      <Row
        label="Comprobación HA"
        help="Cómo está armada la barra — el programa no puede deducirlo. Pilar: jaula rectangular, flexocompresión §5.8 con pandeo. Viga: armado de vano y apoyo, flexión + cortante + fisuración + flecha."
      >
        <div className={`flex gap-1.5 ${kind === undefined ? 'rounded ring-2 ring-state-warn/60 p-0.5 -m-0.5' : ''}`}>
          {([['column', 'Pilar (jaula)'], ['beam', 'Viga (vano+apoyo)']] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setModel((mm) => setRcDesignKind(mm, m.id, k))}
              aria-pressed={kind === k}
              className={`flex-1 px-2 py-1 rounded text-[11px] font-semibold font-mono transition-colors ${
                kind === k
                  ? 'bg-accent/15 text-accent border border-accent/40'
                  : 'bg-bg-elevated text-text-disabled border border-border-main'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {kind === undefined && (
          <p className="text-[10.5px] text-state-warn leading-snug">
            Sin elegir: la barra queda PENDIENTE de comprobar.
          </p>
        )}
      </Row>
      <SubHeader label="Sección de hormigón" />
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        <DraftNumberField
          stacked label="b" sub="ancho" unit="cm" value={sec.b} resetKey={`${m.id}:b`} min={15}
          onCommit={(v) => patchSec({ b: Math.max(15, v) })}
        />
        <DraftNumberField
          stacked label="h" sub="canto" unit="cm" value={sec.h} resetKey={`${m.id}:h`} min={15}
          onCommit={(v) => patchSec({ h: Math.max(15, v) })}
        />
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        <Row label="fck">
          <select
            value={sec.fck}
            onChange={(e) => patchSec({ fck: Number(e.target.value) })}
            className={selectClass}
            aria-label="Resistencia del hormigón"
          >
            {FCK_OPTIONS.map((f) => (
              <option key={f} value={f}>HA-{f}</option>
            ))}
          </select>
        </Row>
        <Row label="fyk">
          <select
            value={sec.fyk}
            onChange={(e) => patchSec({ fyk: Number(e.target.value) })}
            className={selectClass}
            aria-label="Acero de armar"
          >
            {FYK_OPTIONS.map((f) => (
              <option key={f} value={f}>B{f}S</option>
            ))}
          </select>
        </Row>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        <DraftNumberField
          stacked label="rec" sub="mecánico" unit="mm" integer value={sec.cover} resetKey={`${m.id}:cover`} min={20}
          onCommit={(v) => patchSec({ cover: Math.max(20, Math.round(v)) })}
        />
        <Row label="Exposición" help="Clase de exposición ambiental — fija el ancho de fisura admisible wmax.">
          <select
            value={sec.exposureClass}
            onChange={(e) => patchSec({ exposureClass: e.target.value })}
            className={selectClass}
            aria-label="Clase de exposición"
          >
            {EXPOSURE_OPTIONS.map((x) => (
              <option key={x} value={x}>{x}</option>
            ))}
          </select>
        </Row>
      </div>

      {kind === 'column' ? (
        <ColumnCageEditor m={m} model={model} setModel={setModel} cage={m.columnCage ?? DEFAULT_COLUMN_CAGE_2D} />
      ) : kind === 'beam' ? (
        <>
          <ArmadoRegionEditor
            m={m} model={model} setModel={setModel} region="vano"
            armado={m.vanoArmado ?? DEFAULT_VANO_ARMADO_2D}
            label="Armado vano" subLabel="M+ (tracción abajo)"
          />
          <ArmadoRegionEditor
            m={m} model={model} setModel={setModel} region="apoyo"
            armado={m.apoyoArmado ?? DEFAULT_APOYO_ARMADO_2D}
            label="Armado apoyo" subLabel="M− (tracción arriba)"
          />
        </>
      ) : null}
    </>
  );
}

// ── Timber member editor (clase resistente + escuadría + clase de servicio) ──

function TimberMemberEditor({ m, setModel }: RcEditorProps): JSX.Element {
  const sec = m.timberSection;
  if (!sec) return <p className="text-[11px] text-state-fail px-0.5 py-1">Barra de madera sin sección — cambia a acero y vuelve a madera para regenerarla.</p>;
  const patchSec = (p: Parameters<typeof updateMemberTimberSection>[2]) =>
    setModel((mm) => updateMemberTimberSection(mm, m.id, p));
  return (
    <>
      <SubHeader label="Sección de madera" />
      <Row label="Clase resistente" help="Clase de la madera (EN 338 aserrada / EN 14080 laminada): fija fm,k, fc0,k, ft0,k, fv,k y el módulo E del análisis.">
        <select
          value={sec.gradeId}
          onChange={(e) => patchSec({ gradeId: e.target.value })}
          className={selectClass}
          aria-label="Clase resistente de la madera"
        >
          {TIMBER_GRADE_GROUPS.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.ids.map((id) => (
                <option key={id} value={id}>{id}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </Row>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        <DraftNumberField
          stacked label="b" sub="ancho" unit="mm" integer value={sec.b} resetKey={`${m.id}:tb`} min={40}
          onCommit={(v) => patchSec({ b: Math.max(40, Math.round(v)) })}
        />
        <DraftNumberField
          stacked label="h" sub="canto" unit="mm" integer value={sec.h} resetKey={`${m.id}:th`} min={40}
          onCommit={(v) => patchSec({ h: Math.max(40, Math.round(v)) })}
        />
      </div>
      <Row label="Clase de servicio" help="Ambiente higrotérmico EC5: gobierna kmod (resistencia según la duración de la carga) y kdef (fluencia de la flecha).">
        <select
          value={sec.serviceClass}
          onChange={(e) => patchSec({ serviceClass: Number(e.target.value) as ServiceClass })}
          className={selectClass}
          aria-label="Clase de servicio"
        >
          {SERVICE_CLASS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </Row>
    </>
  );
}

// ── Member panel ────────────────────────────────────────────────────────────

function MemberPanel(props: Props & { memberId: string; vector: VectorState }): JSX.Element {
  const { model, setModel, setSelected, memberId, readOnly, vector } = props;
  const m = model.members.find((mm) => mm.id === memberId);
  if (!m) return <GlobalPanel {...props} />;
  const a = model.nodes.find((n) => n.id === m.i);
  const b = model.nodes.find((n) => n.id === m.j);
  const L = a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
  // Fase 2: la biela es DERIVADA — birrotulada + sin carga de barra. Ya no hay
  // toggle: liberar ambos extremos de una barra descargada ES activarla.
  const twoForce = memberFormulation(model, m) === 'two-force';
  const braced = m.ltbSpacing !== undefined;
  const weakBraced = m.weakAxisBracing !== undefined;

  const applyRes = (res: OpResult) => {
    if (res.ok) setModel(() => res.model);
    else showToast(res.reason, { autoDismiss: 4000 });
  };

  return (
    <fieldset disabled={readOnly} className="flex flex-col gap-1 min-w-0 border-0 p-0 m-0">
      <PanelHeader
        title={m.id}
        sub={`${a?.id} → ${b?.id} · L = ${L.toFixed(2)} m`}
        onBack={() => setSelected(null)}
      />

      {/* Ficha grande (modal de solo lectura). Dentro del fieldset: en móvil
          (readOnly) queda deshabilitado como el resto — allí la ficha se abre
          desde el icono de la fila en la pestaña Resultados. */}
      {props.onOpenDetail && (
        <button
          type="button"
          onClick={() => props.onOpenDetail!(m.id)}
          className="mb-1 inline-flex items-center gap-1.5 self-start px-2.5 py-1 rounded border border-border-main text-[11px] text-text-secondary hover:text-accent hover:border-accent/40 transition-colors"
        >
          <Maximize2 size={11} aria-hidden="true" />
          Ficha de cálculo
        </button>
      )}

      {/* Mismo bloque y misma posición que en la selección múltiple: una barra
          clicada ya se mueve/clona sin tener que encerrarla en una ventana. */}
      {!readOnly && (
        <div className="pb-1">
          <VectorOps
            model={model} setModel={setModel} setSelected={setSelected}
            sel={{ nodes: [], members: [m.id], loads: [] }}
            note={VECTOR_NOTE_MEMBER}
            {...vector}
          />
        </div>
      )}

      {twoForce && (
        <p className="text-[10.5px] text-text-secondary leading-snug px-2 py-1.5 rounded bg-bg-elevated/60 border border-border-sub">
          <span className="font-mono font-semibold uppercase text-[9.5px] text-accent mr-1.5">biela</span>
          Birrotulada y sin cargas en la barra: trabaja solo a axil. Añadirle
          una carga o cerrar una rótula la devuelve a viga-columna.
        </p>
      )}

      <Row label="Material" help="Acero laminado (catálogo de perfiles), hormigón armado (sección rectangular con su armado) o madera (escuadría b×h con su clase resistente EC5).">
        <div className="flex gap-1.5">
          {([['steel', 'Acero'], ['rc', 'Hormigón'], ['timber', 'Madera']] as const).map(([mat, label]) => (
            <button
              key={mat}
              type="button"
              onClick={() => applyRes(setMemberMaterial(model, m.id, mat))}
              aria-pressed={m.material === mat}
              className={`flex-1 px-2.5 py-1 rounded text-[11px] font-semibold font-mono transition-colors ${
                m.material === mat
                  ? 'bg-accent/15 text-accent border border-accent/40'
                  : 'bg-bg-elevated text-text-disabled border border-border-main'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </Row>

      {m.material === 'timber' ? (
        <TimberMemberEditor m={m} model={model} setModel={setModel} />
      ) : m.material === 'steel' ? (
        <>
          <SteelProfileRows
            profileKey={m.steelSelection?.profileKey ?? ''}
            twoForce={twoForce}
            onSelect={(key) => setModel((mm) => setMemberProfile(mm, m.id, key))}
          />

          <Row label="Acero">
            <select
              value={m.steelSelection?.steel ?? 'S275'}
              onChange={(e) => setModel((mm) => setMemberSteel(mm, m.id, e.target.value as 'S275' | 'S355'))}
              className={selectClass}
              aria-label="Grado del acero"
            >
              <option value="S275">S275</option>
              <option value="S355">S355</option>
            </select>
          </Row>
        </>
      ) : (
        <RcMemberEditor m={m} model={model} setModel={setModel} />
      )}

      <Row label="Rótulas" help="Liberan el momento en el extremo (M=0 exacto). Ambas rótulas + sin cargas en la barra = biela (solo axil), derivada automáticamente.">
        <div className="flex gap-1.5">
          {(['i', 'j'] as const).map((end) => (
            <button
              key={end}
              type="button"
              onClick={() => setModel((mm) => setMemberRelease(mm, m.id, end, !m.releases[end]))}
              aria-pressed={m.releases[end]}
              className={`px-2.5 py-1 rounded text-[11px] font-mono transition-colors ${
                m.releases[end]
                  ? 'bg-accent/15 text-accent border border-accent/40'
                  : 'bg-bg-elevated text-text-disabled border border-border-main'
              }`}
            >
              {end === 'i' ? `${m.i} (i)` : `${m.j} (j)`}
            </button>
          ))}
        </div>
      </Row>

      {!twoForce && m.material !== 'rc' && (
        <>
          <div className="flex items-center justify-between py-0.75 gap-2 min-w-0">
            <InputLabel label="Correas" sub="arriostr. ala" help="Separación entre puntos que arriostran el ALA COMPRIMIDA (correas/viguetas/forjado). Limita la longitud crítica de vuelco lateral (LTB / kcrit). NO coacciona el eje débil de la sección entera — eso es el campo de abajo." />
            <button
              type="button"
              onClick={() => setModel((mm) => setMemberLtbSpacing(mm, m.id, braced ? undefined : 1.5))}
              aria-pressed={braced}
              className={`px-3 py-1 rounded text-[11px] font-semibold font-mono transition-colors shrink-0 ${
                braced
                  ? 'bg-accent/15 text-accent border border-accent/40'
                  : 'bg-bg-elevated text-text-disabled border border-border-main'
              }`}
            >
              {braced ? 'Arriostrada' : 'Libre'}
            </button>
          </div>
          {braced && (
            <DraftNumberField
              label="s"
              sub="separación"
              unit="m"
              value={m.ltbSpacing ?? 1.5}
              resetKey={`${m.id}:ltb`}
              min={0.1}
              onCommit={(v) => setModel((mm) => setMemberLtbSpacing(mm, m.id, Math.max(0.1, v)))}
            />
          )}
        </>
      )}

      {m.material !== 'rc' && (
        <>
          {/* D13 (cierra OQ7): coacción del eje débil, SEPARADA de las correas.
              También en bielas: un tirante-puntal arriostrado a mitad pandea
              entre puntos de arriostramiento. */}
          <div className="flex items-center justify-between py-0.75 gap-2 min-w-0">
            <InputLabel label="Eje débil" sub="arriostr. sección" help="Separación entre puntos que impiden la traslación lateral de la SECCIÓN ENTERA (no solo el ala): acorta la longitud de pandeo por el eje débil de la fila de compresión. Unas correas en el ala no garantizan esta coacción — por eso son dos campos." />
            <button
              type="button"
              onClick={() => setModel((mm) => setMemberWeakAxisBracing(mm, m.id, weakBraced ? undefined : 1.5))}
              aria-pressed={weakBraced}
              className={`px-3 py-1 rounded text-[11px] font-semibold font-mono transition-colors shrink-0 ${
                weakBraced
                  ? 'bg-accent/15 text-accent border border-accent/40'
                  : 'bg-bg-elevated text-text-disabled border border-border-main'
              }`}
            >
              {weakBraced ? 'Arriostrada' : 'Libre'}
            </button>
          </div>
          {weakBraced && (
            <DraftNumberField
              label="s"
              sub="separación"
              unit="m"
              value={m.weakAxisBracing ?? 1.5}
              resetKey={`${m.id}:wab`}
              min={0.1}
              onCommit={(v) => setModel((mm) => setMemberWeakAxisBracing(mm, m.id, Math.max(0.1, v)))}
            />
          )}
        </>
      )}

      {!twoForce && (
        /* D10 (cierra OQ2): el límite de flecha es un DATO DE PROYECTO —
           depende de qué soporta la barra y el programa no puede deducirlo.
           Una biela derivada no flecta por formulación: sin selector. */
        <Row label="Límite de flecha" help="CTE DB-SE 4.3.3 según lo que soporta la barra: tabiques frágiles L/500, ordinarios L/400, solo apariencia L/300. 'No aplica' quita la fila de flecha (p. ej. un soporte cuyo criterio es la deriva de planta).">
          <select
            value={String(m.deflLimit ?? 300)}
            onChange={(e) => {
              const v = e.target.value;
              setModel((mm) => setMemberDeflLimit(mm, m.id, v === 'none' ? 'none' : (Number(v) as DeflLimit2D)));
            }}
            className={selectClass}
            aria-label="Límite de flecha"
          >
            {DEFL_OPTIONS.map((o) => (
              <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
            ))}
          </select>
        </Row>
      )}

      {!readOnly && (
        <DeleteButton
          label="Eliminar barra"
          onClick={() => {
            setModel((mm) => deleteMember(mm, m.id));
            setSelected(null);
          }}
        />
      )}
    </fieldset>
  );
}

/** Two-step profile selector (familia + tamaño), patrón de los módulos
 *  standalone. Cambiar de familia salta a la entrada de rigidez más parecida
 *  (nearestInFamily) para que la barra no pegue un salto de canto absurdo. */
function SteelProfileRows({ profileKey, twoForce, onSelect }: {
  profileKey: string;
  twoForce: boolean;
  onSelect: (key: string) => void;
}): JSX.Element {
  const families = twoForce ? AXIAL_FAMILIES : BENDING_FAMILIES;
  const current = familyOfKey(profileKey);
  // Una selección heredada fuera de la lista (p.ej. un L en una barra recién
  // pasada a pórtico) se muestra tal cual: el enrutado la deja 'pendiente'
  // honestamente en vez de que el select mienta.
  const famOptions = current && !families.includes(current) ? [current, ...families] : families;
  const fam = current ?? families[0];
  return (
    <Row label="Perfil">
      <div className="flex gap-1.5 min-w-0">
        <select
          value={fam}
          onChange={(e) => onSelect(nearestInFamily(e.target.value as SteelFamily, profileKey).key)}
          className={selectClass}
          aria-label="Familia de perfil"
        >
          {famOptions.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
        <select
          value={profileKey}
          onChange={(e) => onSelect(e.target.value)}
          className={selectClass}
          aria-label="Tamaño del perfil"
        >
          {steelEntriesByFamily(fam).map((en) => (
            <option key={en.key} value={en.key}>{en.sizeLabel}</option>
          ))}
        </select>
      </div>
    </Row>
  );
}

// ── Node panel ──────────────────────────────────────────────────────────────

function NodePanel(props: Props & { nodeId: string; vector: VectorState }): JSX.Element {
  const { model, setModel, setSelected, nodeId, readOnly, vector } = props;
  const n = model.nodes.find((x) => x.id === nodeId);
  if (!n) return <GlobalPanel {...props} />;
  const support = model.supports.find((s) => s.node === n.id)?.type ?? 'none';

  const move = (x: number, y: number) => {
    const res = moveNode(model, n.id, x, y);
    if (res.ok) setModel(() => res.model);
    else showToast(res.reason, { autoDismiss: 4000 });
  };

  return (
    <fieldset disabled={readOnly} className="flex flex-col gap-1 min-w-0 border-0 p-0 m-0">
      <PanelHeader title={n.id} sub="nudo" onBack={() => setSelected(null)} />

      {!readOnly && (
        <div className="pb-1">
          <VectorOps
            model={model} setModel={setModel} setSelected={setSelected}
            sel={{ nodes: [n.id], members: [], loads: [] }}
            note={VECTOR_NOTE_NODE}
            {...vector}
          />
        </div>
      )}

      <DraftNumberField
        label="x" unit="m" value={n.x} resetKey={`${n.id}:x`}
        onCommit={(v) => move(v, n.y)}
      />
      <DraftNumberField
        label="y" unit="m" value={n.y} resetKey={`${n.id}:y`}
        onCommit={(v) => move(n.x, v)}
      />

      <Row label="Apoyo">
        <select
          value={support}
          onChange={(e) => setModel((mm) => setSupport(mm, n.id, e.target.value as Support2DType | 'none'))}
          className={selectClass}
          aria-label="Tipo de apoyo"
        >
          {SUPPORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </Row>

      {!readOnly && (
        <DeleteButton
          label="Eliminar nudo"
          onClick={() => {
            setModel((mm) => deleteNode(mm, n.id));
            setSelected(null);
          }}
        />
      )}
    </fieldset>
  );
}

// ── Load panel ──────────────────────────────────────────────────────────────

function LoadPanel(props: Props & { loadId: string }): JSX.Element {
  const { model, setModel, setSelected, loadId, readOnly } = props;
  const ld = model.loads.find((l) => l.id === loadId);
  if (!ld) return <GlobalPanel {...props} />;

  const patch = (p: Partial<Fem2DLoad>) => {
    const res = updateLoad(model, ld.id, p);
    if (res.ok) setModel(() => res.model);
    else showToast(res.reason, { autoDismiss: 4000 });
  };

  const kindLabel = ld.kind === 'node' ? 'carga en nudo' : ld.kind === 'udl' ? 'carga distribuida' : 'carga puntual en barra';
  const target = ld.kind === 'node' ? ld.node : ld.member;

  return (
    <fieldset disabled={readOnly} className="flex flex-col gap-1 min-w-0 border-0 p-0 m-0">
      <PanelHeader title={ld.id} sub={`${kindLabel} · ${target}`} onBack={() => setSelected(null)} />

      <Row label="Hipótesis" help={LC_HELP}>
        <select
          value={ld.lc}
          onChange={(e) => {
            const lc = e.target.value as Fem2DLoad['lc'];
            patch({ lc, useCategory: lc === 'Q' ? (ld.useCategory ?? 'B') : undefined });
          }}
          className={selectClass}
          aria-label="Hipótesis de carga"
        >
          {LC_OPTIONS.map((lc) => (
            <option key={lc} value={lc}>{lcOptionLabel(lc)}</option>
          ))}
        </select>
      </Row>

      {ld.lc === 'Q' && (
        <Row label="Categoría" help={CATEGORY_HELP}>
          <select
            value={ld.useCategory ?? 'B'}
            onChange={(e) => patch({ useCategory: e.target.value as Fem2DLoad['useCategory'] })}
            className={selectClass}
            aria-label="Categoría de uso"
          >
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>{categoryLabel(c)}</option>
            ))}
          </select>
        </Row>
      )}

      {ld.kind !== 'node' && (
        <Row label="Marco" help="Global: componentes en ejes del mundo (x→derecha, y→arriba; la gravedad es negativa). Local: en ejes de la barra (wy_local ⊥ a la barra — viento sobre un faldón).">
          <select
            value={ld.frame}
            onChange={(e) => patch({ frame: e.target.value as 'global' | 'local' })}
            className={selectClass}
            aria-label="Marco de la carga"
          >
            <option value="global">Global (mundo)</option>
            <option value="local">Local (barra)</option>
          </select>
        </Row>
      )}

      {ld.kind === 'udl' ? (
        <>
          <DraftNumberField
            label="wx" sub={ld.frame === 'local' ? 'axial local' : 'horizontal'} quantity="linearLoad" allowNegative
            value={ld.wx} resetKey={`${ld.id}:wx`}
            onCommit={(v) => patch({ wx: v })}
          />
          <DraftNumberField
            label="wy" sub={ld.frame === 'local' ? '⊥ barra' : 'vertical (− abajo)'} quantity="linearLoad" allowNegative
            value={ld.wy} resetKey={`${ld.id}:wy`}
            onCommit={(v) => patch({ wy: v })}
          />
          <DraftNumberField
            label="desde" sub="fracción 0–1" value={ld.from ?? 0} resetKey={`${ld.id}:from`}
            min={0} max={1}
            onCommit={(v) => patch({ from: Math.max(0, Math.min(1, v)) })}
          />
          <DraftNumberField
            label="hasta" sub="fracción 0–1" value={ld.to ?? 1} resetKey={`${ld.id}:to`}
            min={0} max={1}
            onCommit={(v) => patch({ to: Math.max(0, Math.min(1, v)) })}
          />
        </>
      ) : (
        <>
          <DraftNumberField
            label="Fx" sub={ld.kind !== 'node' && ld.frame === 'local' ? 'axial local' : 'horizontal'} quantity="force" allowNegative
            value={ld.Fx} resetKey={`${ld.id}:Fx`}
            onCommit={(v) => patch({ Fx: v })}
          />
          <DraftNumberField
            label="Fy" sub={ld.kind !== 'node' && ld.frame === 'local' ? '⊥ barra' : 'vertical (− abajo)'} quantity="force" allowNegative
            value={ld.Fy} resetKey={`${ld.id}:Fy`}
            onCommit={(v) => patch({ Fy: v })}
          />
          {ld.kind === 'point-member' && (
            <DraftNumberField
              label="pos" sub="fracción 0–1" value={ld.pos} resetKey={`${ld.id}:pos`}
              min={0} max={1}
              onCommit={(v) => patch({ pos: Math.max(0, Math.min(1, v)) })}
            />
          )}
        </>
      )}

      {!readOnly && (
        <DeleteButton
          label="Eliminar carga"
          onClick={() => {
            setModel((mm) => deleteLoad(mm, ld.id));
            setSelected(null);
          }}
        />
      )}
    </fieldset>
  );
}

// ── Multi panel (marquee selection) ─────────────────────────────────────────

/**
 * Editor de propiedades EN GRUPO de las barras seleccionadas: los mismos
 * controles que el panel individual, aplicados a todas a la vez. Cada campo
 * muestra el valor común (o «— varios —») y SOLO se aplica el campo que se
 * toca — lo no tocado se conserva por barra. Cada gesto es una op de
 * editMembersMany (un undo); las barras incompatibles con un cambio (biela con
 * cargas, biela HA…) se omiten con toast, sin hundir el lote (contrato de la
 * brocha).
 */
function GroupMemberEditor({ model, setModel, members }: {
  model: Fem2DModel;
  setModel: (updater: (m: Fem2DModel) => Fem2DModel) => void;
  members: readonly Fem2DMember[];
}): JSX.Element {
  const ids = members.map((m) => m.id);
  const groupKey = ids.join(',');

  const run = (targetIds: readonly string[], op: (mm: Fem2DModel, id: string) => Fem2DModel | OpResult) => {
    const res = editMembersMany(model, targetIds, op);
    if (res.applied.length > 0) setModel(() => res.model);
    if (res.failures.length > 0) {
      showToast(
        `${res.applied.length} cambiada${res.applied.length === 1 ? '' : 's'} · ${res.failures.length} omitida${res.failures.length === 1 ? '' : 's'} — ${res.failures[0].reason}`,
        { autoDismiss: 5000 },
      );
    }
  };

  function common<T>(get: (m: Fem2DMember) => T): T | undefined {
    const first = get(members[0]);
    return members.every((m) => get(m) === first) ? first : undefined;
  }

  /** Campo numérico de grupo: valor común (o el de la 1ª con sub «varios»);
   *  DraftNumberField solo comitea si el draft difiere → sembrar es seguro. */
  const numField = (
    field: string,
    label: string,
    sub: string | undefined,
    unit: string | undefined,
    min: number,
    integer: boolean,
    get: (m: Fem2DMember) => number,
    apply: (v: number) => void,
  ): JSX.Element => {
    const c = common(get);
    return (
      <DraftNumberField
        stacked
        label={label}
        sub={c === undefined ? '— varios —' : sub}
        unit={unit}
        {...(integer ? { integer: true } : {})}
        min={min}
        value={c ?? get(members[0])}
        resetKey={`grp:${groupKey}:${field}`}
        onCommit={apply}
      />
    );
  };

  const commonMat = common((m) => m.material);

  const toggleClass = (pressed: boolean) =>
    `flex-1 px-2.5 py-1 rounded text-[11px] font-semibold font-mono transition-colors ${
      pressed
        ? 'bg-accent/15 text-accent border border-accent/40'
        : 'bg-bg-elevated text-text-disabled border border-border-main'
    }`;

  // Correas: acero o madera (una biela derivada las ignora sin daño — su
  // demanda de flexión es 0 por formulación). Se aplican SOLO a las elegibles.
  const eligibleLtb = members.filter((m) => m.material !== 'rc');
  const eligibleLtbIds = eligibleLtb.map((m) => m.id);
  const allBraced = eligibleLtb.length > 0 && eligibleLtb.every((m) => m.ltbSpacing !== undefined);
  const commonLtb = allBraced
    ? (eligibleLtb.every((m) => m.ltbSpacing === eligibleLtb[0].ltbSpacing) ? eligibleLtb[0].ltbSpacing : undefined)
    : undefined;
  const commonDefl = common((m) => m.deflLimit ?? 300);

  return (
    <>
      <Row label="Material" help="Cambia el material de todas las seleccionadas. Los datos del material anterior se conservan por barra.">
        <div className="flex gap-1.5">
          {([['steel', 'Acero'], ['rc', 'Hormigón'], ['timber', 'Madera']] as const).map(([mat, label]) => (
            <button
              key={mat}
              type="button"
              onClick={() => run(ids, (mm, id) => setMemberMaterial(mm, id, mat))}
              aria-pressed={commonMat === mat}
              className={toggleClass(commonMat === mat)}
            >
              {label}
            </button>
          ))}
        </div>
      </Row>

      {commonMat === 'steel' ? (
        <>
          <Row label="Perfil">
            <select
              value={common((m) => m.steelSelection?.profileKey) ?? ''}
              onChange={(e) => run(ids, (mm, id) => setMemberProfile(mm, id, e.target.value))}
              className={selectClass}
              aria-label="Perfil del grupo"
            >
              {common((m) => m.steelSelection?.profileKey) === undefined && (
                <option value="" disabled>— varios —</option>
              )}
              {AXIAL_FAMILIES.map((f) => (
                <optgroup key={f} label={f}>
                  {steelEntriesByFamily(f).map((en) => (
                    <option key={en.key} value={en.key}>{en.sizeLabel}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Row>
          <Row label="Acero">
            <select
              value={common((m) => m.steelSelection?.steel) ?? ''}
              onChange={(e) => run(ids, (mm, id) => setMemberSteel(mm, id, e.target.value as 'S275' | 'S355'))}
              className={selectClass}
              aria-label="Grado del acero del grupo"
            >
              {common((m) => m.steelSelection?.steel) === undefined && (
                <option value="" disabled>— varios —</option>
              )}
              <option value="S275">S275</option>
              <option value="S355">S355</option>
            </select>
          </Row>
        </>
      ) : commonMat === 'rc' ? (
        <GroupRcEditor members={members} run={run} numField={numField} common={common} />
      ) : commonMat === 'timber' ? (
        <>
          <Row label="Clase resistente">
            <select
              value={common((m) => m.timberSection?.gradeId) ?? ''}
              onChange={(e) => run(ids, (mm, id) => updateMemberTimberSection(mm, id, { gradeId: e.target.value }))}
              className={selectClass}
              aria-label="Clase resistente del grupo"
            >
              {common((m) => m.timberSection?.gradeId) === undefined && (
                <option value="" disabled>— varios —</option>
              )}
              {TIMBER_GRADE_GROUPS.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.ids.map((id) => (
                    <option key={id} value={id}>{id}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Row>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            {numField('tb', 'b', 'ancho', 'mm', 40, true,
              (m) => m.timberSection?.b ?? DEFAULT_TIMBER_SECTION_2D.b,
              (v) => run(ids, (mm, id) => updateMemberTimberSection(mm, id, { b: Math.max(40, Math.round(v)) })))}
            {numField('th', 'h', 'canto', 'mm', 40, true,
              (m) => m.timberSection?.h ?? DEFAULT_TIMBER_SECTION_2D.h,
              (v) => run(ids, (mm, id) => updateMemberTimberSection(mm, id, { h: Math.max(40, Math.round(v)) })))}
          </div>
          <Row label="Clase de servicio">
            <select
              value={common((m) => m.timberSection?.serviceClass) ?? ''}
              onChange={(e) => run(ids, (mm, id) => updateMemberTimberSection(mm, id, { serviceClass: Number(e.target.value) as ServiceClass }))}
              className={selectClass}
              aria-label="Clase de servicio del grupo"
            >
              {common((m) => m.timberSection?.serviceClass) === undefined && (
                <option value="" disabled>— varios —</option>
              )}
              {SERVICE_CLASS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Row>
        </>
      ) : (
        <p className="text-[10.5px] text-text-secondary leading-snug py-1">
          Materiales distintos: unifica el material del grupo para editar la
          sección en conjunto.
        </p>
      )}

      <Row label="Rótulas" help="Libera el momento en ese extremo de TODAS las barras. Pulsado = todas liberadas; sin pulsar = alguna (o ninguna) — al pulsar se unifican. Ambas rótulas + sin cargas de barra = biela derivada.">
        <div className="flex gap-1.5">
          {(['i', 'j'] as const).map((end) => {
            const all = members.every((m) => m.releases[end]);
            return (
              <button
                key={end}
                type="button"
                onClick={() => run(ids, (mm, id) => setMemberRelease(mm, id, end, !all))}
                aria-pressed={all}
                className={toggleClass(all)}
              >
                extremo {end}
              </button>
            );
          })}
        </div>
      </Row>

      <Row label="Límite de flecha" help="D10 — el límite lo decide lo que soporta cada barra (CTE DB-SE 4.3.3). Se aplica a TODAS las seleccionadas; en las bielas derivadas no hay fila de flecha en ningún caso.">
        <select
          value={commonDefl === undefined ? '' : String(commonDefl)}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '') return;
            run(ids, (mm, id) => setMemberDeflLimit(mm, id, v === 'none' ? 'none' : (Number(v) as DeflLimit2D)));
          }}
          className={selectClass}
          aria-label="Límite de flecha del grupo"
        >
          {commonDefl === undefined && <option value="" disabled>— varios —</option>}
          {DEFL_OPTIONS.map((o) => (
            <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
          ))}
        </select>
      </Row>


      {eligibleLtb.length > 0 && (
        <>
          <div className="flex items-center justify-between py-0.75 gap-2 min-w-0">
            <InputLabel
              label="Correas"
              sub={eligibleLtb.length < members.length ? `${eligibleLtb.length} de ${members.length} barras` : 'arriostr. ala'}
              help="Separación entre puntos que arriostran el borde comprimido. Solo aplica a vigas/cordones de acero o madera en pórtico: el resto de la selección se ignora."
            />
            <button
              type="button"
              onClick={() => run(eligibleLtbIds, (mm, id) => setMemberLtbSpacing(mm, id, allBraced ? undefined : 1.5))}
              aria-pressed={allBraced}
              className={`px-3 py-1 rounded text-[11px] font-semibold font-mono transition-colors shrink-0 ${
                allBraced
                  ? 'bg-accent/15 text-accent border border-accent/40'
                  : 'bg-bg-elevated text-text-disabled border border-border-main'
              }`}
            >
              {allBraced ? 'Arriostradas' : 'Libres'}
            </button>
          </div>
          {allBraced && (
            <DraftNumberField
              label="s"
              sub={commonLtb === undefined ? '— varios —' : 'separación'}
              unit="m"
              value={commonLtb ?? eligibleLtb[0].ltbSpacing ?? 1.5}
              resetKey={`grp:${groupKey}:ltb`}
              min={0.1}
              onCommit={(v) => run(eligibleLtbIds, (mm, id) => setMemberLtbSpacing(mm, id, Math.max(0.1, v)))}
            />
          )}
        </>
      )}
    </>
  );
}

/** Sección + armado HA en grupo (solo cuando TODAS las barras son de hormigón). */
function GroupRcEditor({ members, run, numField, common }: {
  members: readonly Fem2DMember[];
  run: (ids: readonly string[], op: (mm: Fem2DModel, id: string) => Fem2DModel | OpResult) => void;
  numField: (
    field: string, label: string, sub: string | undefined, unit: string | undefined,
    min: number, integer: boolean,
    get: (m: Fem2DMember) => number, apply: (v: number) => void,
  ) => JSX.Element;
  common: <T>(get: (m: Fem2DMember) => T) => T | undefined;
}): JSX.Element {
  const ids = members.map((m) => m.id);
  const sec = (m: Fem2DMember) => m.rcSection ?? DEFAULT_RC_BEAM_SECTION_2D;
  const allColumnKind = members.every((m) => m.rcDesignKind === 'column');
  const allBeamKind = members.every((m) => m.rcDesignKind === 'beam');
  const anyUnchosen = members.some((m) => m.rcDesignKind === undefined);

  const armadoGrid = (region: 'vano' | 'apoyo', label: string, subLabel: string): JSX.Element => {
    const arm = (m: Fem2DMember): ArmadoHA =>
      (region === 'vano' ? m.vanoArmado : m.apoyoArmado)
      ?? (region === 'vano' ? DEFAULT_VANO_ARMADO_2D : DEFAULT_APOYO_ARMADO_2D);
    const patch = (p: Partial<ArmadoHA>) => run(ids, (mm, id) => updateMemberArmado(mm, id, region, p));
    return (
      <>
        <SubHeader label={`${label} · ${subLabel}`} />
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {numField(`${region}:tn`, 'n', 'tracción', undefined, 1, true, (m) => arm(m).tens_nBars, (v) => patch({ tens_nBars: Math.max(1, Math.round(v)) }))}
          {numField(`${region}:td`, 'Ø', 'tracción', 'mm', 6, true, (m) => arm(m).tens_barDiam, (v) => patch({ tens_barDiam: Math.max(6, Math.round(v)) }))}
          {numField(`${region}:cn`, 'n', 'compresión', undefined, 0, true, (m) => arm(m).comp_nBars, (v) => patch({ comp_nBars: Math.max(0, Math.round(v)) }))}
          {numField(`${region}:cd`, 'Ø', 'compresión', 'mm', 6, true, (m) => arm(m).comp_barDiam, (v) => patch({ comp_barDiam: Math.max(6, Math.round(v)) }))}
          {numField(`${region}:sd`, 'Ø', 'cerco', 'mm', 5, true, (m) => arm(m).stirrupDiam, (v) => patch({ stirrupDiam: Math.max(5, Math.round(v)) }))}
          {numField(`${region}:ss`, 's', 'cercos', 'mm', 40, true, (m) => arm(m).stirrupSpacing, (v) => patch({ stirrupSpacing: Math.max(40, Math.round(v)) }))}
          {numField(`${region}:sl`, 'ramas', 'cerco', undefined, 2, true, (m) => arm(m).stirrupLegs, (v) => patch({ stirrupLegs: Math.max(2, Math.round(v)) }))}
        </div>
      </>
    );
  };

  const cage = (m: Fem2DMember): RcColumnCage => m.columnCage ?? DEFAULT_COLUMN_CAGE_2D;
  const patchCage = (p: Partial<RcColumnCage>) => run(ids, (mm, id) => updateMemberColumnCage(mm, id, p));

  return (
    <>
      <Row label="Comprobación HA" help="Cómo están armadas las barras del grupo — el programa no puede deducirlo. Pilar = jaula (flexocompresión §5.8); Viga = vano+apoyo (flexión, cortante, fisuración, flecha).">
        <div className={`flex gap-1.5 ${anyUnchosen ? 'rounded ring-2 ring-state-warn/60 p-0.5 -m-0.5' : ''}`}>
          {([['column', 'Pilar (jaula)'], ['beam', 'Viga (vano+apoyo)']] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => run(ids, (mm, id) => setRcDesignKind(mm, id, k))}
              aria-pressed={k === 'column' ? allColumnKind : allBeamKind}
              className={`flex-1 px-2 py-1 rounded text-[11px] font-semibold font-mono transition-colors ${
                (k === 'column' ? allColumnKind : allBeamKind)
                  ? 'bg-accent/15 text-accent border border-accent/40'
                  : 'bg-bg-elevated text-text-disabled border border-border-main'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </Row>
      <SubHeader label="Sección de hormigón" />
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {numField('rcb', 'b', 'ancho', 'cm', 15, false, (m) => sec(m).b, (v) => run(ids, (mm, id) => updateMemberRcSection(mm, id, { b: Math.max(15, v) })))}
        {numField('rch', 'h', 'canto', 'cm', 15, false, (m) => sec(m).h, (v) => run(ids, (mm, id) => updateMemberRcSection(mm, id, { h: Math.max(15, v) })))}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        <Row label="fck">
          <select
            value={common((m) => sec(m).fck) ?? ''}
            onChange={(e) => run(ids, (mm, id) => updateMemberRcSection(mm, id, { fck: Number(e.target.value) }))}
            className={selectClass}
            aria-label="Resistencia del hormigón del grupo"
          >
            {common((m) => sec(m).fck) === undefined && <option value="" disabled>— varios —</option>}
            {FCK_OPTIONS.map((f) => (
              <option key={f} value={f}>HA-{f}</option>
            ))}
          </select>
        </Row>
        <Row label="fyk">
          <select
            value={common((m) => sec(m).fyk) ?? ''}
            onChange={(e) => run(ids, (mm, id) => updateMemberRcSection(mm, id, { fyk: Number(e.target.value) }))}
            className={selectClass}
            aria-label="Acero de armar del grupo"
          >
            {common((m) => sec(m).fyk) === undefined && <option value="" disabled>— varios —</option>}
            {FYK_OPTIONS.map((f) => (
              <option key={f} value={f}>B{f}S</option>
            ))}
          </select>
        </Row>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {numField('rccover', 'rec', 'mecánico', 'mm', 20, true, (m) => sec(m).cover, (v) => run(ids, (mm, id) => updateMemberRcSection(mm, id, { cover: Math.max(20, Math.round(v)) })))}
        <Row label="Exposición">
          <select
            value={common((m) => sec(m).exposureClass) ?? ''}
            onChange={(e) => run(ids, (mm, id) => updateMemberRcSection(mm, id, { exposureClass: e.target.value }))}
            className={selectClass}
            aria-label="Clase de exposición del grupo"
          >
            {common((m) => sec(m).exposureClass) === undefined && <option value="" disabled>— varios —</option>}
            {EXPOSURE_OPTIONS.map((x) => (
              <option key={x} value={x}>{x}</option>
            ))}
          </select>
        </Row>
      </div>

      {allColumnKind ? (
        <>
          <SubHeader label="Armado del pilar" />
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            {numField('cage:corner', 'Ø', 'esquinas', 'mm', 8, true, (m) => cage(m).cornerBarDiam, (v) => patchCage({ cornerBarDiam: Math.max(8, Math.round(v)) }))}
            <div />
            {numField('cage:nx', 'n', 'interm. X', undefined, 0, true, (m) => cage(m).nBarsX, (v) => patchCage({ nBarsX: Math.max(0, Math.round(v)) }))}
            {numField('cage:dx', 'Ø', 'interm. X', 'mm', 6, true, (m) => cage(m).barDiamX, (v) => patchCage({ barDiamX: Math.max(6, Math.round(v)) }))}
            {numField('cage:ny', 'n', 'interm. Y', undefined, 0, true, (m) => cage(m).nBarsY, (v) => patchCage({ nBarsY: Math.max(0, Math.round(v)) }))}
            {numField('cage:dy', 'Ø', 'interm. Y', 'mm', 6, true, (m) => cage(m).barDiamY, (v) => patchCage({ barDiamY: Math.max(6, Math.round(v)) }))}
            {numField('cage:sd', 'Ø', 'cerco', 'mm', 5, true, (m) => cage(m).stirrupDiam, (v) => patchCage({ stirrupDiam: Math.max(5, Math.round(v)) }))}
            {numField('cage:ss', 's', 'cercos', 'mm', 40, true, (m) => cage(m).stirrupSpacing, (v) => patchCage({ stirrupSpacing: Math.max(40, Math.round(v)) }))}
          </div>
        </>
      ) : allBeamKind ? (
        <>
          {armadoGrid('vano', 'Armado vano', 'M+ (tracción abajo)')}
          {armadoGrid('apoyo', 'Armado apoyo', 'M− (tracción arriba)')}
        </>
      ) : (
        <p className="text-[10.5px] text-text-secondary leading-snug py-1">
          Comprobaciones mixtas o sin elegir: el armado se edita según la
          comprobación (pilar usa jaula; viga usa vano y apoyo). Unifícala
          arriba o edita el armado barra a barra.
        </p>
      )}
    </>
  );
}

function MultiPanel(props: Props & { sel: SelectionSet2D; vector: VectorState }): JSX.Element {
  const { model, setModel, setSelected, sel, readOnly, vector } = props;

  const counts = [
    sel.nodes.length > 0 ? `${sel.nodes.length} nudo${sel.nodes.length === 1 ? '' : 's'}` : null,
    sel.members.length > 0 ? `${sel.members.length} barra${sel.members.length === 1 ? '' : 's'}` : null,
    sel.loads.length > 0 ? `${sel.loads.length} carga${sel.loads.length === 1 ? '' : 's'}` : null,
  ].filter(Boolean).join(' · ');

  const idRow = (label: string, ids: string[]): JSX.Element | null =>
    ids.length === 0 ? null : (
      <div key={label} className="flex gap-2 min-w-0 py-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled shrink-0 w-12 pt-0.5">
          {label}
        </span>
        <span className="font-mono text-[10.5px] text-text-secondary leading-relaxed break-words min-w-0">
          {ids.join(', ')}
        </span>
      </div>
    );

  const groupMembers = sel.members
    .map((id) => model.members.find((m) => m.id === id))
    .filter((m): m is Fem2DMember => m !== undefined);

  return (
    <div className="flex flex-col gap-2 min-w-0">
      <PanelHeader title="Selección" sub={counts} onBack={() => setSelected(null)} />

      <div className="rounded border border-border-main px-3 py-2">
        {idRow('Nudos', sel.nodes)}
        {idRow('Barras', sel.members)}
        {idRow('Cargas', sel.loads)}
      </div>

      {!readOnly && (
        <VectorOps
          model={model} setModel={setModel} setSelected={setSelected}
          sel={sel} note={VECTOR_NOTE_MULTI} {...vector}
        />
      )}

      {!readOnly && groupMembers.length >= 2 && (
        <MultiSection label={`Propiedades de las ${groupMembers.length} barras`}>
          <GroupMemberEditor model={model} setModel={setModel} members={groupMembers} />
        </MultiSection>
      )}

      <p className="text-[10px] text-text-disabled leading-snug px-0.5">
        Supr o el botón eliminan todo lo seleccionado en un solo paso. Las barras
        que tocan un nudo borrado (y sus cargas) caen con él.
      </p>

      {!readOnly && (
        <DeleteButton
          label="Eliminar selección"
          onClick={() => {
            setModel((m) => deleteSelection(m, sel));
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}

// ── Entry ───────────────────────────────────────────────────────────────────

export function Fem2DInspector(props: Props): JSX.Element {
  const { selected } = props;
  // Δx/Δy viven AQUÍ, por encima del cambio de panel: tras "Copiar" la
  // selección salta a la copia (y una barra copiada pasa a selección múltiple),
  // y repetir el gesto debe encadenar (x·2, y·2) sin reescribir el vector.
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);
  const vector: VectorState = { dx, dy, setDx, setDy };

  if (selected?.kind === 'member') return <MemberPanel {...props} memberId={selected.id} vector={vector} />;
  if (selected?.kind === 'node') return <NodePanel {...props} nodeId={selected.id} vector={vector} />;
  if (selected?.kind === 'load') return <LoadPanel {...props} loadId={selected.id} />;
  if (selected?.kind === 'multi') return <MultiPanel {...props} sel={selected} vector={vector} />;
  return <GlobalPanel {...props} />;
}
