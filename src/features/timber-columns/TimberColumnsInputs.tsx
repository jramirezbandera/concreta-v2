import { type TimberColumnInputs } from '../../data/defaults';
import { TIMBER_GRADES, getKmod, getGammaM, getTimberGrade } from '../../data/timberGrades';

interface Props {
  state: TimberColumnInputs;
  setField: (field: keyof TimberColumnInputs, value: TimberColumnInputs[keyof TimberColumnInputs]) => void;
}

// ── Shared field components ────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled pt-2.25 pb-1.75 border-b border-border-sub mb-2.5 mt-3 first:mt-0">
      {label}
    </p>
  );
}

function NumField({
  label, sub, field, value, unit, min, step, setField,
}: {
  label: string; sub?: string;
  field: keyof TimberColumnInputs; value: number; unit: string;
  min?: number; step?: number;
  setField: Props['setField'];
}) {
  return (
    <div className="flex items-center justify-between py-0.75 gap-2">
      <label htmlFor={`tc-${field}`} className="text-[13px] text-text-secondary whitespace-nowrap shrink-0">
        {label}
        {sub && <span className="text-[11px] text-text-disabled ml-1">{sub}</span>}
      </label>
      <div className="flex shrink-0">
        <input
          id={`tc-${field}`}
          type="number" value={value} min={min} step={step}
          onChange={(e) => { const n = Number(e.target.value); if (!isNaN(n)) setField(field, n); }}
          className="w-18 text-right bg-bg-primary border border-border-main rounded-l px-1.75 py-1 text-[12px] font-mono text-text-primary outline-none focus:border-accent transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span className="bg-bg-elevated border border-l-0 border-border-main rounded-r px-1.25 py-1 text-[10px] text-text-disabled font-mono whitespace-nowrap flex items-center">
          {unit}
        </span>
      </div>
    </div>
  );
}

function SelectField({
  label, field, value, options, setField,
}: {
  label: string; field: keyof TimberColumnInputs;
  value: string | number;
  options: Array<{ value: string | number; label: string }>;
  setField: Props['setField'];
}) {
  return (
    <div className="flex items-center justify-between py-0.75 gap-2">
      <label htmlFor={`tc-sel-${field}`} className="text-[13px] text-text-secondary min-w-0 truncate">
        {label}
      </label>
      <select
        id={`tc-sel-${field}`}
        value={value}
        onChange={(e) => {
          const raw = e.target.value;
          const n = Number(raw);
          setField(field, isNaN(n) || raw === '' ? raw : n);
        }}
        className="w-28 shrink-0 bg-bg-primary border border-border-main rounded px-1.5 py-1 text-[12px] font-mono text-text-primary outline-none focus:border-accent transition-colors"
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
      <SectionHeader label="Sección transversal" />

      <div className="flex items-center justify-between py-0.75 gap-2">
        <label htmlFor="tc-gradeId" className="text-[13px] text-text-secondary min-w-0 truncate">
          Clase resistente
        </label>
        <select
          id="tc-gradeId"
          value={state.gradeId}
          onChange={(e) => setField('gradeId', e.target.value)}
          className="w-28 shrink-0 bg-bg-primary border border-border-main rounded px-1.5 py-1 text-[12px] font-mono text-text-primary outline-none focus:border-accent transition-colors"
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

      <NumField label="b" sub="ancho" field="b" value={state.b} unit="mm" min={40}  step={10} setField={setField} />
      <NumField label="h" sub="canto" field="h" value={state.h} unit="mm" min={40}  step={10} setField={setField} />

      {/* ── Geometría ─────────────────────────────────────────────────────── */}
      <SectionHeader label="Geometría" />

      <NumField label="Longitud" sub="L" field="L" value={state.L} unit="m" min={0.5} step={0.5} setField={setField} />
      <SelectField label="Condición apoyo" field="beta" value={state.beta} options={BETA_OPTIONS} setField={setField} />

      {/* ── Solicitaciones de diseño ─────────────────────────────────────── */}
      <SectionHeader label="Solicitaciones (mayoradas)" />

      <NumField label="Axil" sub="Nd" field="Nd" value={state.Nd} unit="kN" min={0} step={5} setField={setField} />
      <NumField label="Cortante" sub="Vd" field="Vd" value={state.Vd} unit="kN" min={0} step={1} setField={setField} />
      <NumField label="Momento" sub="Md" field="Md" value={state.Md} unit="kNm" min={0} step={1} setField={setField} />
      <SelectField label="Eje de momento" field="momentAxis" value={state.momentAxis} options={MOMENT_AXIS_OPTIONS} setField={setField} />

      {/* ── Condiciones de uso ────────────────────────────────────────────── */}
      <SectionHeader label="Condiciones de uso" />

      <SelectField label="Clase de servicio" field="serviceClass" value={state.serviceClass} options={SERVICE_CLASS_OPTIONS} setField={setField} />
      <SelectField label="Duración de carga" field="loadDuration"  value={state.loadDuration}  options={LOAD_DURATION_OPTIONS}  setField={setField} />

      {/* Derived material factors */}
      <div className="rounded border border-border-sub divide-y divide-border-sub px-3 mt-0.5 mb-0.5">
        <InfoRow label="kmod  (Tabla 3.1)" value={kmod.toFixed(2)} />
        <InfoRow label="γM"                value={gammaM.toFixed(2)} />
      </div>

      {/* ── Resistencia al fuego ─────────────────────────────────────────── */}
      <SectionHeader label="Resistencia al fuego" />

      <SelectField label="Requisito fuego"  field="fireResistance" value={state.fireResistance} options={FIRE_OPTIONS}          setField={setField} />

      {state.fireResistance !== 'R0' && (
        <>
          <SelectField label="Caras expuestas" field="exposedFaces" value={state.exposedFaces} options={EXPOSED_FACES_OPTIONS} setField={setField} />
          <NumField label="Factor carga" sub="η_fi" field="etaFi" value={state.etaFi} unit="" min={0} step={0.05} setField={setField} />
        </>
      )}
    </div>
  );
}
