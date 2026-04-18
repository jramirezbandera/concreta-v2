import { type TimberColumnInputs } from '../../data/defaults';
import { TIMBER_GRADES, getKmod, getGammaM, getTimberGrade } from '../../data/timberGrades';
import { LABELS, type LabelKey } from '../../lib/text/labels';
import { CollapsibleSection } from '../../components/ui/CollapsibleSection';

interface Props {
  state: TimberColumnInputs;
  setField: (field: keyof TimberColumnInputs, value: TimberColumnInputs[keyof TimberColumnInputs]) => void;
}

// ── Shared field components ────────────────────────────────────────────────────


function NumField({
  labelKey, label, sub, field, value, unit, min, step, setField, helpText,
}: {
  labelKey?: LabelKey;
  label?: string; sub?: string;
  field: keyof TimberColumnInputs; value: number; unit?: string;
  min?: number; step?: number;
  setField: Props['setField'];
  helpText?: string;
}) {
  const resolved = labelKey
    ? { label: LABELS[labelKey].sym, sub: LABELS[labelKey].descShort, unit: LABELS[labelKey].unit }
    : { label: label ?? '', sub, unit: unit ?? '' };
  const unitText = resolved.unit === '—' ? '' : resolved.unit;
  return (
    <div className="py-0.75">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={`tc-${field}`} className="text-[13px] text-text-secondary whitespace-nowrap shrink-0">
          {resolved.label}
          {resolved.sub && <span className="text-[11px] text-text-disabled ml-1">{resolved.sub}</span>}
        </label>
        <div className="flex shrink-0">
          <input
            id={`tc-${field}`}
            type="number" value={value} min={min} step={step}
            onChange={(e) => { const n = Number(e.target.value); if (!isNaN(n)) setField(field, n); }}
            className="w-18 text-right bg-bg-primary border border-border-main rounded-l px-1.75 py-1 text-[12px] font-mono text-text-primary outline-none hover:border-accent/40 hover:bg-bg-elevated focus:border-accent focus:bg-bg-elevated transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="bg-bg-elevated border border-l-0 border-border-main rounded-r px-1.25 py-1 text-[10px] text-text-disabled font-mono whitespace-nowrap flex items-center">
            {unitText}
          </span>
        </div>
      </div>
      {helpText && (
        <span className="text-[10px] text-text-disabled leading-tight whitespace-pre-line mt-0.5 block">{helpText}</span>
      )}
    </div>
  );
}

function SelectField({
  labelKey, label, field, value, options, setField,
}: {
  labelKey?: LabelKey; label?: string;
  field: keyof TimberColumnInputs;
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
      <label htmlFor={`tc-sel-${field}`} className="text-[13px] text-text-secondary whitespace-nowrap shrink-0">
        {resolved.label}
        {resolved.sub && <span className="text-[11px] text-text-disabled ml-1">{resolved.sub}</span>}
      </label>
      <select
        id={`tc-sel-${field}`}
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

// ── Option lists ───────────────────────────────────────────────────────────────

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

const BETA_OPTIONS = [
  { value: 0.5, label: 'β = 0.50  — Biempotrado' },
  { value: 0.7, label: 'β = 0.70  — Empotrado-articulado' },
  { value: 1.0, label: 'β = 1.00  — Biarticulado' },
  { value: 2.0, label: 'β = 2.00  — Ménsula' },
];

const BETA_Y_OPTIONS = BETA_OPTIONS.map(o => ({ ...o, label: o.label.replace('β', 'βy') }));
const BETA_Z_OPTIONS = BETA_OPTIONS.map(o => ({ ...o, label: o.label.replace('β', 'βz') }));

const MOMENT_AXIS_OPTIONS = [
  { value: 'strong', label: 'Eje fuerte (h — canto mayor)' },
  { value: 'weak',   label: 'Eje débil  (b — ancho menor)' },
];

const FIRE_OPTIONS = [
  { value: 'R0',   label: 'Sin requisito' },
  { value: 'R30',  label: 'R30  (30 min)'  },
  { value: 'R60',  label: 'R60  (60 min)'  },
  { value: 'R90',  label: 'R90  (90 min)'  },
  { value: 'R120', label: 'R120 (120 min)' },
];

const EXPOSED_FACES_OPTIONS = [
  { value: 3, label: '3 caras — Pilar adosado a muro' },
  { value: 4, label: '4 caras — Pilar exento' },
];

// ── Main component ─────────────────────────────────────────────────────────────

export function TimberColumnsInputs({ state, setField }: Props) {
  const grade  = getTimberGrade(state.gradeId);
  const kmod   = grade ? getKmod(state.loadDuration as never, state.serviceClass as never) : 0;
  const gammaM = grade ? getGammaM(grade.type) : 0;

  return (
    <div>
      {/* ── Sección transversal ───────────────────────────────────────────── */}
      <CollapsibleSection label="Sección transversal">
        <div className="flex items-center justify-between py-0.75 gap-2">
          <label htmlFor="tc-gradeId" className="text-[13px] text-text-secondary whitespace-nowrap shrink-0">
            {LABELS.grade_timber.sym || LABELS.grade_timber.descShort}
            {LABELS.grade_timber.sym && <span className="text-[11px] text-text-disabled ml-1">{LABELS.grade_timber.descShort}</span>}
          </label>
          <select
            id="tc-gradeId"
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
        <NumField labelKey="h_section" field="h" value={state.h} min={40}  step={10} setField={setField} />
      </CollapsibleSection>

      {/* ── Geometría ─────────────────────────────────────────────────────── */}
      <CollapsibleSection label="Geometría">
        <NumField labelKey="L_column" field="L" value={state.L} min={0.5} step={0.5} setField={setField} />
        <SelectField label="Apoyo eje fuerte" field="beta_y" value={state.beta_y} options={BETA_Y_OPTIONS} setField={setField} />
        <SelectField label="Apoyo eje débil"  field="beta_z" value={state.beta_z} options={BETA_Z_OPTIONS} setField={setField} />
      </CollapsibleSection>

      {/* ── Solicitaciones de diseño ─────────────────────────────────────── */}
      <CollapsibleSection label="Solicitaciones (mayoradas)">
        <NumField labelKey="NEd" field="Nd" value={state.Nd} min={0} step={5} setField={setField} />
        <NumField labelKey="VEd" field="Vd" value={state.Vd} min={0} step={1} setField={setField} />
        <NumField labelKey="MEd" field="Md" value={state.Md} min={0} step={1} setField={setField} />
        <SelectField label="Eje de momento" field="momentAxis" value={state.momentAxis} options={MOMENT_AXIS_OPTIONS} setField={setField} />
      </CollapsibleSection>

      {/* ── Condiciones de uso ────────────────────────────────────────────── */}
      <CollapsibleSection label="Condiciones de uso">
        <SelectField labelKey="serviceClass" field="serviceClass" value={state.serviceClass} options={SERVICE_CLASS_OPTIONS} setField={setField} />
        <SelectField labelKey="loadDuration" field="loadDuration"  value={state.loadDuration}  options={LOAD_DURATION_OPTIONS}  setField={setField} />

        {/* Derived material factors */}
        <div className="rounded border border-border-sub divide-y divide-border-sub px-3 mt-0.5 mb-0.5">
          <InfoRow label="kmod  (Tabla 3.1)" value={kmod.toFixed(2)} />
          <InfoRow label="γM"                value={gammaM.toFixed(2)} />
        </div>
      </CollapsibleSection>

      {/* ── Resistencia al fuego ─────────────────────────────────────────── */}
      <CollapsibleSection label="Resistencia al fuego">
        <SelectField labelKey="fireResistance" field="fireResistance" value={state.fireResistance} options={FIRE_OPTIONS} setField={setField} />

        {state.fireResistance !== 'R0' && (
          <>
            <SelectField labelKey="exposedFaces" field="exposedFaces" value={state.exposedFaces} options={EXPOSED_FACES_OPTIONS} setField={setField} />
            <NumField labelKey="eta_fi" field="etaFi" value={state.etaFi} min={0} step={0.05} setField={setField}
              helpText={"Factor de reducción de carga en incendio.\nNd,fi = η_fi · Nd  (EN 1995-1-2 §2.4.2)\nValor típico: 0.65–0.70 (cargas uso habitual).\nUsar 1.0 si Nd ya está en combinación de incendio."}
            />
          </>
        )}
      </CollapsibleSection>
    </div>
  );
}
