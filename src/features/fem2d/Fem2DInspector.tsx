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
import { lcOptionLabel, LC_HELP } from '../../lib/text/loadCases';
import { DraftNumberField } from './DraftNumberField';
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
  resetMemberRoleAuto,
  selectionMoveNodeIds,
  translateSelection,
  setMemberLtbSpacing,
  setMemberMaterial,
  setMemberProfile,
  setMemberRelease,
  setMemberRole,
  setMemberSteel,
  setMemberTwoForce,
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
import type { ArmadoHA, Fem2DLoad, Fem2DMember, Fem2DModel, MemberRole, RcColumnCage, Support2DType } from './types';
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

const ROLE_OPTIONS: { value: MemberRole; label: string }[] = [
  { value: 'pilar', label: 'Pilar' },
  { value: 'viga', label: 'Viga / dintel' },
  { value: 'cordon', label: 'Cordón' },
  { value: 'diagonal', label: 'Diagonal' },
  { value: 'montante', label: 'Montante' },
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
        <button
          type="button"
          disabled={readOnly}
          onClick={() => setModel((m) => ({ ...m, selfWeight: !m.selfWeight }))}
          aria-pressed={model.selfWeight}
          className={`px-3 py-1 rounded text-[11px] font-semibold font-mono transition-colors shrink-0 disabled:opacity-50 ${
            model.selfWeight
              ? 'bg-accent/15 text-accent border border-accent/40'
              : 'bg-bg-elevated text-text-disabled border border-border-main'
          }`}
        >
          {model.selfWeight ? 'Incluido' : 'Omitido'}
        </button>
      </div>

      {hasTimber && (
        <div className="flex items-center justify-between gap-2 min-w-0 px-0.5">
          <InputLabel
            label="Nieve a >1000 m"
            help="Madera: por encima de 1000 m de altitud la nieve es una acción de duración MEDIA (kmod menor, EC5 §2.3.1.2 / CTE DB-SE-M), no corta. Solo afecta a las barras de madera con hipótesis de nieve; acero y hormigón la ignoran."
          />
          <button
            type="button"
            disabled={readOnly}
            onClick={() => setModel((m) => ({ ...m, snowOver1000m: !(m.snowOver1000m ?? false) }))}
            aria-pressed={model.snowOver1000m ?? false}
            className={`px-3 py-1 rounded text-[11px] font-semibold font-mono transition-colors shrink-0 disabled:opacity-50 ${
              model.snowOver1000m
                ? 'bg-accent/15 text-accent border border-accent/40'
                : 'bg-bg-elevated text-text-disabled border border-border-main'
            }`}
          >
            {model.snowOver1000m ? '>1000 m' : '≤1000 m'}
          </button>
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
  const isBeamRole = m.role === 'viga' || m.role === 'cordon';
  return (
    <>
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

      {m.role === 'pilar' ? (
        <ColumnCageEditor m={m} model={model} setModel={setModel} cage={m.columnCage ?? DEFAULT_COLUMN_CAGE_2D} />
      ) : isBeamRole ? (
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
      ) : (
        <p className="text-[10.5px] text-text-secondary leading-snug py-1">
          El rol axil ({m.role}) no está soportado en hormigón: la barra queda
          pendiente de comprobar. Usa rol pilar/viga/cordón, o material acero o
          madera.
        </p>
      )}
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

function MemberPanel(props: Props & { memberId: string }): JSX.Element {
  const { model, setModel, setSelected, memberId, readOnly } = props;
  const m = model.members.find((mm) => mm.id === memberId);
  if (!m) return <GlobalPanel {...props} />;
  const a = model.nodes.find((n) => n.id === m.i);
  const b = model.nodes.find((n) => n.id === m.j);
  const L = a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
  const twoForce = m.elementType === 'two-force';
  const braced = m.ltbSpacing !== undefined;

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

      <Row label="Rol" help="Decide qué comprobación normativa se aplica (pilar → pandeo de pilar; viga/cordón → flexión + LTB; diagonal/montante → axil puro). El auto lo infiere de la geometría: cambiarlo aquí lo fija en manual. OJO: αcr detecta las plantas por los miembros con rol pilar.">
        <div className="flex items-center gap-1.5 min-w-0">
          <select
            value={m.role}
            onChange={(e) => setModel((mm) => setMemberRole(mm, m.id, e.target.value as MemberRole))}
            className={selectClass}
            aria-label="Rol de la barra"
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <span className="font-mono text-[9.5px] font-semibold px-1.5 py-0.5 rounded bg-bg-elevated text-text-disabled shrink-0 uppercase">
            {m.roleManual ? 'manual' : 'auto'}
          </span>
        </div>
        {m.roleManual && (
          <button
            type="button"
            onClick={() => setModel((mm) => resetMemberRoleAuto(mm, m.id))}
            className="self-start text-[10.5px] text-accent/80 hover:text-accent transition-colors"
          >
            Volver a rol automático
          </button>
        )}
      </Row>

      <div className="flex items-center justify-between py-0.75 gap-2 min-w-0">
        <InputLabel label="Biela" sub="solo axil" help="Elemento de 2 fuerzas (celosías): trabaja solo a axil, articulado por formulación, y NO admite cargas en la barra." />
        <button
          type="button"
          onClick={() => applyRes(setMemberTwoForce(model, m.id, !twoForce))}
          aria-pressed={twoForce}
          className={`px-3 py-1 rounded text-[11px] font-semibold font-mono transition-colors shrink-0 ${
            twoForce
              ? 'bg-accent/15 text-accent border border-accent/40'
              : 'bg-bg-elevated text-text-disabled border border-border-main'
          }`}
        >
          {twoForce ? 'Biela' : 'Pórtico'}
        </button>
      </div>

      <Row label="Material" help="Acero laminado (catálogo de perfiles), hormigón armado (sección rectangular con su armado) o madera (escuadría b×h con su clase resistente EC5). Una biela no puede ser de hormigón (el chequeo axil HA no está modelado); de madera sí.">
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

      {!twoForce && (
        <Row label="Rótulas" help="Liberan el momento en el extremo (M=0 exacto). Una barra con ambos extremos articulados en un pórtico se comporta como biela a flexión.">
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
      )}

      {!twoForce && m.material !== 'rc' && (m.role === 'viga' || m.role === 'cordon') && (
        <>
          <div className="flex items-center justify-between py-0.75 gap-2 min-w-0">
            <InputLabel label="Correas" sub="arriostr. ala" help="Separación entre puntos que arriostran el borde comprimido (correas/viguetas/forjado). Limita la longitud crítica de pandeo lateral (LTB); en madera limita también la longitud de pandeo fuera del plano (kc,z). Sin arriostrar = pandea con la luz completa." />
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

function NodePanel(props: Props & { nodeId: string }): JSX.Element {
  const { model, setModel, setSelected, nodeId, readOnly } = props;
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
        <Row label="Categoría" help="Categoría de uso CTE Tabla 3.1 — fija los coeficientes ψ de combinación.">
          <select
            value={ld.useCategory ?? 'B'}
            onChange={(e) => patch({ useCategory: e.target.value as Fem2DLoad['useCategory'] })}
            className={selectClass}
            aria-label="Categoría de uso"
          >
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>{c}</option>
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

/** Título de sección del panel de selección múltiple. */
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

  const commonRole = common((m) => m.role);
  const commonTipo = common((m) => m.elementType);
  const commonMat = common((m) => m.material);
  const anyManual = members.some((m) => m.roleManual === true);
  const allBeamCol = members.every((m) => m.elementType === 'beam-column');

  const toggleClass = (pressed: boolean) =>
    `flex-1 px-2.5 py-1 rounded text-[11px] font-semibold font-mono transition-colors ${
      pressed
        ? 'bg-accent/15 text-accent border border-accent/40'
        : 'bg-bg-elevated text-text-disabled border border-border-main'
    }`;

  // Correas: solo vigas/cordones de acero o madera en pórtico (mismo criterio
  // que el panel individual). Se aplican SOLO a las elegibles.
  const eligibleLtb = members.filter(
    (m) => m.elementType === 'beam-column' && m.material !== 'rc' && (m.role === 'viga' || m.role === 'cordon'),
  );
  const eligibleLtbIds = eligibleLtb.map((m) => m.id);
  const allBraced = eligibleLtb.length > 0 && eligibleLtb.every((m) => m.ltbSpacing !== undefined);
  const commonLtb = allBraced
    ? (eligibleLtb.every((m) => m.ltbSpacing === eligibleLtb[0].ltbSpacing) ? eligibleLtb[0].ltbSpacing : undefined)
    : undefined;

  return (
    <>
      <Row label="Rol" help="Cambia el rol de TODAS las barras seleccionadas (fija manual). El rol dirige la comprobación normativa de cada barra.">
        <select
          value={commonRole ?? ''}
          onChange={(e) => run(ids, (mm, id) => setMemberRole(mm, id, e.target.value as MemberRole))}
          className={selectClass}
          aria-label="Rol del grupo"
        >
          {commonRole === undefined && <option value="" disabled>— varios —</option>}
          {ROLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {anyManual && (
          <button
            type="button"
            onClick={() => run(ids, resetMemberRoleAuto)}
            className="self-start text-[10.5px] text-accent/80 hover:text-accent transition-colors"
          >
            Volver a rol automático
          </button>
        )}
      </Row>

      <Row label="Tipo" help="Pórtico = viga-columna (axil + flexión). Biela = solo axil (celosías); una barra con cargas aplicadas o de hormigón no puede pasar a biela (se omite con aviso).">
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => run(ids, (mm, id) => setMemberTwoForce(mm, id, false))}
            aria-pressed={commonTipo === 'beam-column'}
            className={toggleClass(commonTipo === 'beam-column')}
          >
            Pórtico
          </button>
          <button
            type="button"
            onClick={() => run(ids, (mm, id) => setMemberTwoForce(mm, id, true))}
            aria-pressed={commonTipo === 'two-force'}
            className={toggleClass(commonTipo === 'two-force')}
          >
            Biela
          </button>
        </div>
      </Row>

      <Row label="Material" help="Cambia el material de todas las seleccionadas. Una biela no puede ser de hormigón (se omite con aviso). Los datos del material anterior se conservan por barra.">
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

      {allBeamCol && (
        <Row label="Rótulas" help="Libera el momento en ese extremo de TODAS las barras. Pulsado = todas liberadas; sin pulsar = alguna (o ninguna) — al pulsar se unifican.">
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
      )}

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
  const allPilar = members.every((m) => m.role === 'pilar');
  const allViga = members.every((m) => m.role === 'viga' || m.role === 'cordon');

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

      {allPilar ? (
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
      ) : allViga ? (
        <>
          {armadoGrid('vano', 'Armado vano', 'M+ (tracción abajo)')}
          {armadoGrid('apoyo', 'Armado apoyo', 'M− (tracción arriba)')}
        </>
      ) : (
        <p className="text-[10.5px] text-text-secondary leading-snug py-1">
          Roles mixtos: el armado se edita por rol (pilar usa jaula; viga/cordón
          usan vano y apoyo). Unifica el rol del grupo o edita el armado barra a
          barra.
        </p>
      )}
    </>
  );
}

function MultiPanel(props: Props & { sel: SelectionSet2D }): JSX.Element {
  const { model, setModel, setSelected, sel, readOnly } = props;
  // El vector sobrevive a los cambios de selección A PROPÓSITO: tras "Copiar"
  // la selección salta a la copia y repetir el gesto encadena (x·2, y·2).
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);

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

  const moveIds = selectionMoveNodeIds(model, sel);
  const groupMembers = sel.members
    .map((id) => model.members.find((m) => m.id === id))
    .filter((m): m is Fem2DMember => m !== undefined);

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
    <div className="flex flex-col gap-2 min-w-0">
      <PanelHeader title="Selección" sub={counts} onBack={() => setSelected(null)} />

      <div className="rounded border border-border-main px-3 py-2">
        {idRow('Nudos', sel.nodes)}
        {idRow('Barras', sel.members)}
        {idRow('Cargas', sel.loads)}
      </div>

      {!readOnly && moveIds.size > 0 && (
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
          <p className="text-[10px] text-text-disabled leading-snug">
            Una barra seleccionada arrastra sus dos nudos. La copia clona las
            barras entre nudos del bloque con sus cargas y apoyos, y queda
            seleccionada: repite Copiar para encadenar.
          </p>
        </MultiSection>
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
  if (selected?.kind === 'member') return <MemberPanel {...props} memberId={selected.id} />;
  if (selected?.kind === 'node') return <NodePanel {...props} nodeId={selected.id} />;
  if (selected?.kind === 'load') return <LoadPanel {...props} loadId={selected.id} />;
  if (selected?.kind === 'multi') return <MultiPanel {...props} sel={selected} />;
  return <GlobalPanel {...props} />;
}
