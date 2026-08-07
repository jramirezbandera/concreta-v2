import { useState } from 'react';
import { type BeamType, type TimberBeamInputs } from '../../data/defaults';
import { TIMBER_GRADES, getKmod, getKdef, getTimberGrade } from '../../data/timberGrades';
import { BEAM_CASES } from '../../lib/calculations/beamCases';
import { LABELS, type LabelKey } from '../../lib/text/labels';
import { CollapsibleSection } from '../../components/ui/CollapsibleSection';
import { InputLabel } from '../../components/ui/InputLabel';
import { UnitNumberInput } from '../../components/units/UnitNumberInput';

interface Props {
  state: TimberBeamInputs;
  setField: (field: keyof TimberBeamInputs, value: TimberBeamInputs[keyof TimberBeamInputs]) => void;
}

// ── Shared field components (same pattern as SteelBeamsInputs) ────────────────

const SELECT_CLASS = 'w-28 shrink-0 bg-bg-primary border border-border-main rounded pl-2 pr-6 py-1 '
  + 'text-[12px] font-mono text-text-primary outline-none hover:border-accent/40 hover:bg-bg-elevated '
  + 'focus:border-accent focus:bg-bg-elevated cursor-pointer transition-colors';

function SelectField({
  labelKey, label, help, field, value, options, setField,
}: {
  labelKey?: LabelKey; label?: string; help?: string;
  field: keyof TimberBeamInputs;
  value: string | number;
  options: Array<{ value: string | number; label: string }>;
  setField: Props['setField'];
}) {
  const resolved = labelKey
    ? LABELS[labelKey].sym
      ? { label: LABELS[labelKey].sym, sub: LABELS[labelKey].descShort }
      : { label: LABELS[labelKey].descShort, sub: undefined as string | undefined }
    : { label: label ?? '', sub: undefined as string | undefined };
  return (
    <div className="flex items-center justify-between py-0.75 max-lg:min-h-11 gap-2">
      <InputLabel
        htmlFor={`tb-sel-${field}`}
        labelKey={labelKey}
        label={labelKey ? undefined : resolved.label}
        sub={labelKey ? undefined : resolved.sub}
        help={help}
      />
      <select
        id={`tb-sel-${field}`}
        value={value}
        onChange={(e) => {
          const raw = e.target.value;
          const n = Number(raw);
          setField(field, isNaN(n) || raw === '' ? raw : n);
        }}
        className={SELECT_CLASS}
      >
        {options.map((o) => <option key={String(o.value)} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-0.75 max-lg:min-h-11 gap-2">
      <span className="text-[13px] text-text-disabled whitespace-nowrap shrink-0">{label}</span>
      <span className="text-[12px] font-mono text-text-disabled">{value}</span>
    </div>
  );
}

// ── Option lists ──────────────────────────────────────────────────────────────

const SOFTWOOD_IDS = TIMBER_GRADES.filter(g => g.type === 'sawn' && g.subtype === 'softwood').map(g => g.id);
const HARDWOOD_IDS = TIMBER_GRADES.filter(g => g.type === 'sawn' && g.subtype === 'hardwood').map(g => g.id);
const GLULAM_IDS   = TIMBER_GRADES.filter(g => g.type === 'glulam').map(g => g.id);

const SERVICE_CLASS_OPTIONS = [
  { value: 1, label: 'SC 1 — Interior seco (viviendas, oficinas)' },
  { value: 2, label: 'SC 2 — Exterior cubierto / interior húmedo' },
  { value: 3, label: 'SC 3 — Exterior a la intemperie' },
];

const LOAD_DURATION_OPTIONS = [
  { value: 'permanent',     label: 'Permanente (peso propio, tierra)' },
  { value: 'long',          label: 'Larga duración (almacenamiento)' },
  { value: 'medium',        label: 'Media duración (sobrecarga uso)' },
  { value: 'short',         label: 'Corta duración (nieve, montaje)' },
  { value: 'instantaneous', label: 'Instantánea (viento, sísmico)' },
];

const LOAD_TYPE_OPTIONS = [
  { value: 'residential', label: 'Residencial / oficinas  (ψ₂=0.30)' },
  { value: 'office',      label: 'Administrativa          (ψ₂=0.30)' },
  { value: 'storage',     label: 'Almacenamiento          (ψ₂=0.80)' },
  { value: 'roof',        label: 'Cubierta transitable    (ψ₂=0.00)' },
  { value: 'custom',      label: 'Personalizado' },
];

const SYSTEM_OPTIONS = [
  { value: 'false', label: 'Viga aislada  (ksys = 1.00)' },
  { value: 'true',  label: 'Tablero colaborante  (ksys = 1.10)' },
];

const POINT_LOAD_OPTIONS = [
  { value: 'false', label: 'Solo repartida' },
  { value: 'true',  label: 'Con carga puntual' },
];

/** Valores de arranque al activar la carga puntual (el usuario los sobrescribe). */
const POINT_SEED_KN = 5;

const FIRE_OPTIONS = [
  { value: 'R0',   label: 'Sin requisito' },
  { value: 'R30',  label: 'R30  (30 min)'  },
  { value: 'R60',  label: 'R60  (60 min)'  },
  { value: 'R90',  label: 'R90  (90 min)'  },
  { value: 'R120', label: 'R120 (120 min)' },
];

const EXPOSED_FACES_OPTIONS = [
  { value: 3, label: '3 caras — Inf. + 2 laterales (habitual)' },
  { value: 4, label: '4 caras — Viga exenta' },
];

// Tipo de viga — el motor (calcTimberBeam) ya consume `beamType` vía BEAM_CASES
// para MEd/VEd/flecha, pero el panel no lo exponía y quedaba siempre en 'ss'.
// Las etiquetas salen de BEAM_CASES para que no puedan divergir del motor.
const BEAM_TYPE_OPTIONS = (['ss', 'cantilever', 'fp', 'ff'] as const).map((t: BeamType) => ({
  value: t,
  label: BEAM_CASES[t].label,
}));

// ── Main component ────────────────────────────────────────────────────────────

export function TimberBeamsInputs({ state, setField }: Props) {
  const grade  = getTimberGrade(state.gradeId);
  const kmod   = grade ? getKmod(state.loadDuration as never, state.serviceClass as never) : 0;
  const kdef   = grade ? getKdef(grade.type, state.serviceClass as never) : 0;
  const gammaM = grade ? (grade.type === 'glulam' ? 1.25 : 1.30) : 0;

  // El estado no lleva bandera: P_G = P_Q = 0 ES "sin carga puntual". `pointOpen`
  // solo mantiene los campos a la vista mientras el usuario los edita (si los
  // pone a cero no queremos que desaparezcan de golpe); `hasPoint` los abre
  // también cuando la carga llega de fuera (enlace compartido o asistente IA).
  const hasPoint = state.P_G > 0 || state.P_Q > 0;
  const [pointOpen, setPointOpen] = useState(false);
  const showPoint = pointOpen || hasPoint;

  const togglePointLoad = (on: boolean) => {
    setPointOpen(on);
    if (!on) {
      setField('P_G', 0);
      setField('P_Q', 0);
      return;
    }
    if (state.aP <= 0 || state.aP >= state.L) setField('aP', Number((state.L / 2).toFixed(3)));
    if (!hasPoint) {
      setField('P_G', POINT_SEED_KN);
      setField('P_Q', POINT_SEED_KN);
    }
  };

  return (
    <div>
      {/* ── Sección transversal ──────────────────────────────────────────── */}
      <CollapsibleSection label="Sección transversal">
        <div className="flex items-center justify-between py-0.75 max-lg:min-h-11 gap-2">
          <InputLabel htmlFor="tb-gradeId" labelKey="grade_timber" className="whitespace-nowrap shrink-0" />
          <select
            id="tb-gradeId"
            value={state.gradeId}
            onChange={(e) => setField('gradeId', e.target.value)}
            className={SELECT_CLASS}
          >
            <optgroup label="Conífera aserrada">
              {SOFTWOOD_IDS.map(id => <option key={id} value={id}>{id}</option>)}
            </optgroup>
            <optgroup label="Frondosa aserrada">
              {HARDWOOD_IDS.map(id => <option key={id} value={id}>{id}</option>)}
            </optgroup>
            <optgroup label="Laminada encolada">
              {GLULAM_IDS.map(id => <option key={id} value={id}>{id}</option>)}
            </optgroup>
          </select>
        </div>

        <UnitNumberInput id="tb-b" labelKey="b_section" value={state.b} min={40} step={10} widthClass="w-18" onChange={(v) => setField('b', v)} />
        <UnitNumberInput id="tb-h" labelKey="h_section" value={state.h} min={80} step={10} widthClass="w-18" onChange={(v) => setField('h', v)} />
      </CollapsibleSection>

      {/* ── Geometría del vano ──────────────────────────────────────────── */}
      <CollapsibleSection label="Geometría del vano">
        <SelectField
          label="Tipo de viga"
          help="Condiciones de apoyo del vano. Fijan MEd, VEd y la flecha (biapoyada wL²/8, ménsula wL²/2, empotrada-articulada wL²/8 en el empotramiento, biempotrada wL²/12)."
          field="beamType"
          value={state.beamType ?? 'ss'}
          options={BEAM_TYPE_OPTIONS}
          setField={setField}
        />
        <UnitNumberInput id="tb-L" labelKey="L_span" value={state.L} min={0.5} step={0.5} widthClass="w-18" onChange={(v) => setField('L', v)} />
      </CollapsibleSection>

      {/* ── Cargas características ───────────────────────────────────────── */}
      <CollapsibleSection label="Cargas características">
        <UnitNumberInput
          labelKey="gk_distributed"
          field="gk"
          value={state.gk}
          quantity="linearLoad"
          onChange={(v) => setField('gk', v)}
        />
        <UnitNumberInput
          labelKey="qk_distributed"
          field="qk"
          value={state.qk}
          quantity="linearLoad"
          onChange={(v) => setField('qk', v)}
        />

        <div className="flex items-center justify-between py-0.75 max-lg:min-h-11 gap-2">
          <InputLabel
            htmlFor="tb-hasPoint"
            label="Carga puntual"
            help="Carga concentrada sobre la viga (otra viga que apoya, un pilarillo, un montante). Se superpone al reparto uniforme: los esfuerzos, la flecha y las reacciones se recalculan con las dos a la vez."
          />
          <select
            id="tb-hasPoint"
            value={String(showPoint)}
            onChange={(e) => togglePointLoad(e.target.value === 'true')}
            className={SELECT_CLASS}
          >
            {POINT_LOAD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {showPoint && (
          <>
            <UnitNumberInput
              id="tb-P_G" label="P_G" sub="puntual permanente"
              help="Carga puntual PERMANENTE característica, en kN (no kN/m). Sin mayorar: el motor aplica γG = 1.35."
              value={state.P_G} quantity="force" min={0} step={1} widthClass="w-18"
              onChange={(v) => setField('P_G', v)}
            />
            <UnitNumberInput
              id="tb-P_Q" label="P_Q" sub="puntual variable"
              help="Carga puntual VARIABLE característica, en kN (no kN/m). Sin mayorar: el motor aplica γQ = 1.50."
              value={state.P_Q} quantity="force" min={0} step={1} widthClass="w-18"
              onChange={(v) => setField('P_Q', v)}
            />
            <UnitNumberInput
              id="tb-aP" label="a" sub="posición de la puntual" unit="m"
              help="Distancia desde el extremo IZQUIERDO del vano, que es el empotramiento en ménsula y en articulada-empotrada. Debe estar entre 0 y L."
              value={state.aP} min={0} max={state.L} step={0.1} widthClass="w-18"
              onChange={(v) => setField('aP', v)}
            />
          </>
        )}
      </CollapsibleSection>

      {/* ── Clase de servicio y duración ────────────────────────────────── */}
      <CollapsibleSection label="Condiciones de uso">
        <SelectField labelKey="serviceClass" field="serviceClass" value={state.serviceClass} options={SERVICE_CLASS_OPTIONS} setField={setField} />
        <SelectField labelKey="loadDuration" field="loadDuration" value={state.loadDuration} options={LOAD_DURATION_OPTIONS} setField={setField} />
        <SelectField labelKey="loadType"     field="loadType"     value={state.loadType}     options={LOAD_TYPE_OPTIONS}     setField={setField}
          help="Categoría de uso del CTE. Fija el coeficiente ψ₂ usado en la flecha activa (combinación cuasipermanente)." />
        {/* Tabiquería → límite de integridad CTE DB-SE 4.3.3 (fix auditoría #110) */}
        <SelectField label="Tabiquería" field="partitionType"
          help="Tipo de tabiquería soportada: fija el límite de flecha activa por integridad (frágil L/500, ordinaria L/400, sin tabiques L/300)."
          value={(state.partitionType as string) ?? 'ordinary'}
          options={[
            { value: 'fragile',  label: 'Frágil (L/500)' },
            { value: 'ordinary', label: 'Ordinaria (L/400)' },
            { value: 'none',     label: 'Sin tabiques (L/300)' },
          ]}
          setField={setField} />

        {state.loadType === 'custom' && (
          <UnitNumberInput id="tb-psi2Custom" label="ψ₂ personalizado" value={state.psi2Custom} unit="" min={0} step={0.05} widthClass="w-18"
            help="Coeficiente de combinación cuasipermanente ψ₂ a medida, para la flecha activa."
            onChange={(v) => setField('psi2Custom', v)} />
        )}

        {/* Derived material factors — read-only */}
        <div className="rounded border border-border-sub divide-y divide-border-sub px-3 mt-0.5 mb-0.5">
          <InfoRow label="kmod  (Tabla 3.1)" value={kmod.toFixed(2)} />
          <InfoRow label="kdef  (Tabla 3.2)" value={kdef.toFixed(2)} />
          <InfoRow label="γM"                value={gammaM.toFixed(2)} />
        </div>

        {/* isSystem — boolean, handled inline to avoid type coercion */}
        <div className="flex items-center justify-between py-0.75 max-lg:min-h-11 gap-2">
          <InputLabel
            htmlFor="tb-isSystem"
            label="Sistema resistente"
            help="Si las vigas comparten carga mediante un tablero o forjado solidario, se aplica ksys = 1.10, que aumenta la resistencia."
          />
          <select
            id="tb-isSystem"
            value={String(state.isSystem)}
            onChange={(e) => setField('isSystem', e.target.value === 'true')}
            className={SELECT_CLASS}
          >
            {SYSTEM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </CollapsibleSection>

      {/* ── Resistencia al fuego ─────────────────────────────────────────── */}
      <CollapsibleSection label="Resistencia al fuego">
        <SelectField labelKey="fireResistance" field="fireResistance" value={state.fireResistance} options={FIRE_OPTIONS} setField={setField} />

        {state.fireResistance !== 'R0' && (
          <SelectField labelKey="exposedFaces" field="exposedFaces" value={state.exposedFaces} options={EXPOSED_FACES_OPTIONS} setField={setField} />
        )}
      </CollapsibleSection>
    </div>
  );
}
