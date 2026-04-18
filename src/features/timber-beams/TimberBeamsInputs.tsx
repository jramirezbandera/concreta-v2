import { type TimberBeamInputs } from '../../data/defaults';
import { TIMBER_GRADES, getKmod, getKdef, getTimberGrade } from '../../data/timberGrades';
import { LABELS, type LabelKey } from '../../lib/text/labels';
import { CollapsibleSection } from '../../components/ui/CollapsibleSection';

interface Props {
  state: TimberBeamInputs;
  setField: (field: keyof TimberBeamInputs, value: TimberBeamInputs[keyof TimberBeamInputs]) => void;
}

// ── Shared field components (same pattern as SteelBeamsInputs) ────────────────


function NumField({
  labelKey, label, sub, unit, field, value, min, step, setField,
}: {
  // Pull label/sub/unit from the LABELS catalog when a key is given.
  labelKey?: LabelKey;
  // Escape hatch for one-off fields not in the catalog (e.g. psi2Custom).
  label?: string; sub?: string; unit?: string;
  field: keyof TimberBeamInputs; value: number;
  min?: number; step?: number;
  setField: Props['setField'];
}) {
  const resolved = labelKey
    ? { label: LABELS[labelKey].sym, sub: LABELS[labelKey].descShort, unit: LABELS[labelKey].unit }
    : { label: label ?? '', sub, unit: unit ?? '' };
  const unitText = resolved.unit === '—' ? '' : resolved.unit;
  return (
    <div className="flex items-center justify-between py-0.75 gap-2">
      <label htmlFor={`tb-${field}`} className="text-[13px] text-text-secondary whitespace-nowrap shrink-0">
        {resolved.label}
        {resolved.sub && <span className="text-[11px] text-text-disabled ml-1">{resolved.sub}</span>}
      </label>
      <div className="flex shrink-0">
        <input
          id={`tb-${field}`}
          type="number" value={value} min={min} step={step}
          onChange={(e) => { const n = Number(e.target.value); if (!isNaN(n)) setField(field, n); }}
          className="w-18 text-right bg-bg-primary border border-border-main rounded-l px-1.75 py-1 text-[12px] font-mono text-text-primary outline-none hover:border-accent/40 hover:bg-bg-elevated focus:border-accent focus:bg-bg-elevated transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span className="bg-bg-elevated border border-l-0 border-border-main rounded-r px-1.25 py-1 text-[10px] text-text-disabled font-mono whitespace-nowrap flex items-center">
          {unitText}
        </span>
      </div>
    </div>
  );
}

function SelectField({
  labelKey, label, field, value, options, setField,
}: {
  labelKey?: LabelKey; label?: string;
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
    <div className="flex items-center justify-between py-0.75 gap-2">
      <label htmlFor={`tb-sel-${field}`} className="text-[13px] text-text-secondary whitespace-nowrap shrink-0">
        {resolved.label}
        {resolved.sub && <span className="text-[11px] text-text-disabled ml-1">{resolved.sub}</span>}
      </label>
      <select
        id={`tb-sel-${field}`}
        value={value}
        onChange={(e) => {
          const raw = e.target.value;
          const n = Number(raw);
          setField(field, isNaN(n) || raw === '' ? raw : n);
        }}
        className="w-28 shrink-0 bg-bg-primary border border-border-main rounded px-1.5 py-1 text-[12px] font-mono text-text-primary outline-none hover:border-accent/40 hover:bg-bg-elevated focus:border-accent focus:bg-bg-elevated cursor-pointer transition-colors"
      >
        {options.map((o) => <option key={String(o.value)} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-0.75 gap-2">
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

// ── Main component ────────────────────────────────────────────────────────────

export function TimberBeamsInputs({ state, setField }: Props) {
  const grade  = getTimberGrade(state.gradeId);
  const kmod   = grade ? getKmod(state.loadDuration as never, state.serviceClass as never) : 0;
  const kdef   = grade ? getKdef(grade.type, state.serviceClass as never) : 0;
  const gammaM = grade ? (grade.type === 'glulam' ? 1.25 : 1.30) : 0;

  return (
    <div>
      {/* ── Sección transversal ──────────────────────────────────────────── */}
      <CollapsibleSection label="Sección transversal">
        <div className="flex items-center justify-between py-0.75 gap-2">
          <label htmlFor="tb-gradeId" className="text-[13px] text-text-secondary whitespace-nowrap shrink-0">
            {LABELS.grade_timber.sym || LABELS.grade_timber.descShort}
            {LABELS.grade_timber.sym && <span className="text-[11px] text-text-disabled ml-1">{LABELS.grade_timber.descShort}</span>}
          </label>
          <select
            id="tb-gradeId"
            value={state.gradeId}
            onChange={(e) => setField('gradeId', e.target.value)}
            className="w-28 shrink-0 bg-bg-primary border border-border-main rounded px-1.5 py-1 text-[12px] font-mono text-text-primary outline-none hover:border-accent/40 hover:bg-bg-elevated focus:border-accent focus:bg-bg-elevated cursor-pointer transition-colors"
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

        <NumField labelKey="b_section" field="b" value={state.b} min={40}  step={10} setField={setField} />
        <NumField labelKey="h_section" field="h" value={state.h} min={80}  step={10} setField={setField} />
      </CollapsibleSection>

      {/* ── Geometría del vano ──────────────────────────────────────────── */}
      <CollapsibleSection label="Geometría del vano">
        <NumField labelKey="L_span" field="L" value={state.L} min={0.5} step={0.5} setField={setField} />
      </CollapsibleSection>

      {/* ── Cargas características ───────────────────────────────────────── */}
      <CollapsibleSection label="Cargas características">
        <NumField labelKey="gk_distributed" field="gk" value={state.gk} min={0} step={0.5} setField={setField} />
        <NumField labelKey="qk_distributed" field="qk" value={state.qk} min={0} step={0.5} setField={setField} />
      </CollapsibleSection>

      {/* ── Clase de servicio y duración ────────────────────────────────── */}
      <CollapsibleSection label="Condiciones de uso">
        <SelectField labelKey="serviceClass" field="serviceClass" value={state.serviceClass} options={SERVICE_CLASS_OPTIONS} setField={setField} />
        <SelectField labelKey="loadDuration" field="loadDuration" value={state.loadDuration} options={LOAD_DURATION_OPTIONS} setField={setField} />
        <SelectField labelKey="loadType"     field="loadType"     value={state.loadType}     options={LOAD_TYPE_OPTIONS}     setField={setField} />

        {state.loadType === 'custom' && (
          <NumField label="ψ₂ personalizado" field="psi2Custom" value={state.psi2Custom} unit="" min={0} step={0.05} setField={setField} />
        )}

        {/* Derived material factors — read-only */}
        <div className="rounded border border-border-sub divide-y divide-border-sub px-3 mt-0.5 mb-0.5">
          <InfoRow label="kmod  (Tabla 3.1)" value={kmod.toFixed(2)} />
          <InfoRow label="kdef  (Tabla 3.2)" value={kdef.toFixed(2)} />
          <InfoRow label="γM"                value={gammaM.toFixed(2)} />
        </div>

        {/* isSystem — boolean, handled inline to avoid type coercion */}
        <div className="flex items-center justify-between py-0.75 gap-2">
          <label htmlFor="tb-isSystem" className="text-[13px] text-text-secondary min-w-0 truncate">
            Sistema resistente
          </label>
          <select
            id="tb-isSystem"
            value={String(state.isSystem)}
            onChange={(e) => setField('isSystem', e.target.value === 'true')}
            className="w-28 shrink-0 bg-bg-primary border border-border-main rounded px-1.5 py-1 text-[12px] font-mono text-text-primary outline-none hover:border-accent/40 hover:bg-bg-elevated focus:border-accent focus:bg-bg-elevated cursor-pointer transition-colors"
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
