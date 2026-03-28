import { useEffect } from 'react';
import { type SteelBeamInputs } from '../../data/defaults';
import { getSizesForTipo } from '../../data/steelProfiles';
import { deriveFromLoads } from '../../lib/calculations/loadGen';

interface SteelBeamsInputsProps {
  state: SteelBeamInputs;
  setField: (field: keyof SteelBeamInputs, value: SteelBeamInputs[keyof SteelBeamInputs]) => void;
}

// CTE DB-SE-AE tabla 3.1 — use categories
const USE_CATEGORIES = [
  { value: 'A1', label: 'A1  Residencial privado',  qk: 2.0 },
  { value: 'A2', label: 'A2  Trasteros',             qk: 3.0 },
  { value: 'B',  label: 'B   Administrativa',        qk: 3.0 },
  { value: 'C1', label: 'C1  Zonas con mesas',       qk: 3.0 },
  { value: 'C2', label: 'C2  Asientos fijos',        qk: 4.0 },
  { value: 'C3', label: 'C3  Sin obstáculos',        qk: 5.0 },
  { value: 'D1', label: 'D1  Comercio local',        qk: 5.0 },
  { value: 'E1', label: 'E1  Almacén',               qk: 7.5 },
  { value: 'G1', label: 'G1  Cubierta accesible',    qk: 1.0 },
  { value: 'custom', label: 'Personalizada',         qk: null },
] as const;

function NumField({
  label,
  sub,
  field,
  value,
  unit,
  min,
  setField,
}: {
  label: string;
  sub?: string;
  field: keyof SteelBeamInputs;
  value: number;
  unit: string;
  min?: number;
  setField: SteelBeamsInputsProps['setField'];
}) {
  return (
    <div className="flex items-center justify-between py-0.75 gap-2">
      <label
        htmlFor={`sb-input-${field}`}
        className="text-[13px] text-text-secondary whitespace-nowrap shrink-0"
      >
        {label}
        {sub && <span className="text-[11px] text-text-disabled ml-1">{sub}</span>}
      </label>
      <div className="flex shrink-0">
        <input
          id={`sb-input-${field}`}
          type="number"
          value={value}
          min={min}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!isNaN(n)) setField(field, n);
          }}
          className="w-18 text-right bg-bg-primary border border-border-main rounded-l px-1.75 py-1 text-[12px] font-mono text-text-primary outline-none focus:border-accent transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          aria-label={`${label} (${unit})`}
        />
        <span className="bg-bg-elevated border border-l-0 border-border-main rounded-r px-1.25 py-1 text-[10px] text-text-disabled font-mono whitespace-nowrap flex items-center">
          {unit}
        </span>
      </div>
    </div>
  );
}

function SelectField({
  label,
  field,
  value,
  options,
  disabled,
  setField,
}: {
  label: string;
  field: keyof SteelBeamInputs;
  value: string | number;
  options: Array<{ value: string | number; label: string }>;
  disabled?: boolean;
  setField: SteelBeamsInputsProps['setField'];
}) {
  return (
    <div className="flex items-center justify-between py-0.75 gap-2">
      <label
        htmlFor={`sb-select-${field}`}
        className="text-[13px] text-text-secondary whitespace-nowrap shrink-0"
      >
        {label}
      </label>
      <select
        id={`sb-select-${field}`}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const raw = e.target.value;
          const asNum = Number(raw);
          setField(field, isNaN(asNum) ? raw : asNum);
        }}
        className={`bg-bg-primary border border-border-main rounded px-1.75 py-1 text-[12px] text-text-primary font-mono outline-none focus:border-accent transition-colors shrink-0 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled pt-2.25 pb-1.75 border-b border-border-sub mb-2.5 mt-3 first:mt-0">
      {label}
    </p>
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

function DerivedRow({
  label,
  sub,
  value,
  unit,
}: {
  label: string;
  sub?: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="flex items-center justify-between py-0.75 gap-2">
      <span className="text-[13px] text-text-secondary whitespace-nowrap shrink-0">
        {label}
        {sub && <span className="text-[11px] text-text-disabled ml-1">{sub}</span>}
      </span>
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-[12px] font-mono text-text-primary tabular-nums">{value}</span>
        <span className="text-[10px] font-mono text-text-disabled">{unit}</span>
        <span className="bg-accent/10 text-accent text-[10px] rounded px-1 font-mono">derivado</span>
      </div>
    </div>
  );
}

export function SteelBeamsInputs({ state, setField }: SteelBeamsInputsProps) {
  const availableSizes = getSizesForTipo(state.tipo);

  // When tipo changes, snap size to first available if current is invalid
  useEffect(() => {
    if (!availableSizes.includes(state.size)) {
      setField('size', availableSizes[0] ?? 160);
    }
  }, [state.tipo]); // eslint-disable-line react-hooks/exhaustive-deps

  const deltaAdm = (state.L / 300).toFixed(1);

  // Load generator derivation (for display only — effectiveInputs in index.tsx drives calc)
  const isGenValid = state.bTrib > 0 && state.gk >= 0 && state.qk >= 0 && state.L > 0;
  const derived = isGenValid ? deriveFromLoads(state) : null;

  const fmt = (v: number, d = 1) => v.toFixed(d);
  const derivedStr = (v: number | undefined, d = 1) =>
    derived && v !== undefined ? fmt(v, d) : '--';

  return (
    <div className="flex flex-col" aria-label="Datos de entrada — Viga de acero">

      {/* MODE TAB BAR */}
      <div role="tablist" className="flex rounded border border-border-main mb-3 shrink-0 overflow-hidden">
        <button
          type="button"
          role="tab"
          aria-selected={state.loadGenActive}
          onClick={() => setField('loadGenActive', true)}
          className={`flex-1 py-1.5 text-[11px] font-semibold text-center transition-colors
            ${state.loadGenActive
              ? 'bg-accent/10 text-accent'
              : 'text-text-disabled hover:text-text-secondary'}`}
        >
          Generador de cargas
        </button>
        <div className="w-px bg-border-main shrink-0" />
        <button
          type="button"
          role="tab"
          aria-selected={!state.loadGenActive}
          onClick={() => {
            if (state.loadGenActive && derived) {
              setField('MEd',  derived.MEd);
              setField('VEd',  derived.VEd);
              setField('Mser', derived.Mser);
            }
            setField('loadGenActive', false);
          }}
          className={`flex-1 py-1.5 text-[11px] font-semibold text-center transition-colors
            ${!state.loadGenActive
              ? 'bg-accent/10 text-accent'
              : 'text-text-disabled hover:text-text-secondary'}`}
        >
          Introducción manual
        </button>
      </div>

      {state.loadGenActive && (
        <div id="sb-load-gen-panel">
          {/* Use category */}
          <SelectField
            label="Categoría de uso"
            field="useCategory"
            value={state.useCategory}
            options={USE_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
            setField={(field, val) => {
              setField(field, val);
              const cat = USE_CATEGORIES.find((c) => c.value === val);
              if (cat && cat.qk !== null) setField('qk', cat.qk);
            }}
          />

          {/* Permanent load */}
          <NumField
            label="g"
            sub="(perm. adicional)"
            field="gk"
            value={state.gk}
            unit="kN/m²"
            min={0}
            setField={setField}
          />

          {/* Variable load */}
          <NumField
            label="q"
            sub="(sobrecarga uso)"
            field="qk"
            value={state.qk}
            unit="kN/m²"
            min={0}
            setField={(field, val) => {
              setField(field, val);
              setField('useCategory', 'custom');
            }}
          />

          {/* Tributary width */}
          <NumField
            label="b"
            sub="(ancho trib.)"
            field="bTrib"
            value={state.bTrib}
            unit="m"
            min={0}
            setField={setField}
          />

          {/* L is shared with Flecha ELS — shown as info */}
          <div className="flex items-center justify-between py-0.75 gap-2">
            <span className="text-[13px] text-text-disabled whitespace-nowrap shrink-0">
              L <span className="text-[11px] ml-1">(→ Flecha ELS)</span>
            </span>
            <span className="text-[12px] font-mono text-text-disabled tabular-nums">
              {(state.L / 1000).toFixed(2)} m
            </span>
          </div>

          {/* Derivation display — CTE DB-SE */}
          <div className="bg-bg-elevated/40 rounded px-2 py-1.5 mt-2 mb-1 text-[11px] font-mono text-text-secondary">
            <div className="text-[10px] text-text-disabled mb-1 uppercase tracking-[0.06em]">
              Derivación (CTE DB-SE)
            </div>
            <div>Gk = {fmt(state.gk)} × {fmt(state.bTrib)} = {derivedStr(derived?.Gk_line)} kN/m</div>
            <div>Qk = {fmt(state.qk)} × {fmt(state.bTrib)} = {derivedStr(derived?.Qk_line)} kN/m</div>
            <div>
              wEd = 1.35×{derivedStr(derived?.Gk_line)} + 1.50×{derivedStr(derived?.Qk_line)} ={' '}
              {derivedStr(derived?.wEd)} kN/m
              <span className="text-text-disabled ml-1">[γG=1.35, γQ=1.50]</span>
            </div>
            <div className="border-t border-border-sub mt-1 pt-1">
              <div>MEd  = {derivedStr(derived?.MEd, 1)} kNm</div>
              <div>VEd  = {derivedStr(derived?.VEd, 1)} kN</div>
              <div>
                Mser = {derivedStr(derived?.Mser, 1)} kNm
                <span className="text-text-disabled ml-1">[comb. característica]</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PERFIL */}
      <SectionHeader label="Perfil" />
      <SelectField
        label="Tipo"
        field="tipo"
        value={state.tipo}
        options={(['IPE', 'HEA', 'HEB'] as const).map((t) => ({ value: t, label: t }))}
        setField={setField}
      />
      <SelectField
        label="Tamaño"
        field="size"
        value={state.size}
        options={availableSizes.map((s) => ({ value: s, label: `${state.tipo} ${s}` }))}
        setField={setField}
      />

      {/* MATERIAL */}
      <SectionHeader label="Material" />
      <SelectField
        label="Acero"
        field="steel"
        value={state.steel}
        options={(['S275', 'S355'] as const).map((s) => ({ value: s, label: s }))}
        setField={setField}
      />

      {/* SOLICITACIONES ELU */}
      <SectionHeader label="Solicitaciones ELU" />
      {state.loadGenActive ? (
        <>
          <DerivedRow
            label="MEd"
            sub="(ELU)"
            value={derivedStr(derived?.MEd, 1)}
            unit="kNm"
          />
          <DerivedRow
            label="VEd"
            sub="(ELU)"
            value={derivedStr(derived?.VEd, 1)}
            unit="kN"
          />
        </>
      ) : (
        <>
          <NumField
            label="MEd"
            sub="(ELU)"
            field="MEd"
            value={state.MEd}
            unit="kNm"
            min={0}
            setField={setField}
          />
          <NumField
            label="VEd"
            sub="(ELU)"
            field="VEd"
            value={state.VEd}
            unit="kN"
            min={0}
            setField={setField}
          />
        </>
      )}

      {/* PANDEO LATERAL (LTB) */}
      <SectionHeader label="Pandeo lateral (LTB)" />
      {/* Lcr stored in mm, displayed in m (same pattern as L) */}
      <div className="flex items-center justify-between py-0.75 gap-2">
        <label
          htmlFor="sb-input-Lcr"
          className="text-[13px] text-text-secondary whitespace-nowrap shrink-0"
        >
          Lcr
          <span className="text-[11px] text-text-disabled ml-1">(longitud)</span>
        </label>
        <div className="flex shrink-0">
          <input
            id="sb-input-Lcr"
            type="number"
            value={+(state.Lcr / 1000).toFixed(2)}
            min={0.1}
            step={0.1}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (!isNaN(n) && n > 0) setField('Lcr', Math.round(n * 1000));
            }}
            className="w-18 text-right bg-bg-primary border border-border-main rounded-l px-1.75 py-1 text-[12px] font-mono text-text-primary outline-none focus:border-accent transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            aria-label="Lcr (longitud de pandeo lateral) en metros"
          />
          <span className="bg-bg-elevated border border-l-0 border-border-main rounded-r px-1.25 py-1 text-[10px] text-text-disabled font-mono whitespace-nowrap flex items-center">
            m
          </span>
        </div>
      </div>
      <SelectField
        label="Tipo carga"
        field="loadTypeLTB"
        value={state.loadTypeLTB}
        disabled={state.loadGenActive}
        options={[
          { value: 'uniform', label: 'Uniforme (C₁=1.13)' },
          { value: 'point',   label: 'Puntual (C₁=1.35)' },
        ]}
        setField={setField}
      />

      {/* FLECHA ELS */}
      <SectionHeader label="Flecha ELS" />
      {state.loadGenActive ? (
        <DerivedRow
          label="Mser"
          sub="(ELS)"
          value={derivedStr(derived?.Mser, 1)}
          unit="kNm"
        />
      ) : (
        <NumField
          label="Mser"
          sub="(ELS)"
          field="Mser"
          value={state.Mser}
          unit="kNm"
          min={0}
          setField={setField}
        />
      )}
      {/* L field — stored in mm, displayed in m */}
      <div className="flex items-center justify-between py-0.75 gap-2">
        <label
          htmlFor="sb-input-L"
          className="text-[13px] text-text-secondary whitespace-nowrap shrink-0"
        >
          L
          <span className="text-[11px] text-text-disabled ml-1">(luz viga)</span>
        </label>
        <div className="flex shrink-0">
          <input
            id="sb-input-L"
            type="number"
            value={+(state.L / 1000).toFixed(2)}
            min={0.5}
            step={0.1}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (!isNaN(n) && n > 0) setField('L', Math.round(n * 1000));
            }}
            className="w-18 text-right bg-bg-primary border border-border-main rounded-l px-1.75 py-1 text-[12px] font-mono text-text-primary outline-none focus:border-accent transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            aria-label="L (luz viga) en metros"
          />
          <span className="bg-bg-elevated border border-l-0 border-border-main rounded-r px-1.25 py-1 text-[10px] text-text-disabled font-mono whitespace-nowrap flex items-center">
            m
          </span>
        </div>
      </div>
      <SelectField
        label="Tipo carga"
        field="loadTypeDefl"
        value={state.loadTypeDefl}
        disabled={state.loadGenActive}
        options={[
          { value: 'uniform', label: 'Uniforme (5/48)' },
          { value: 'point',   label: 'Puntual centro (1/12)' },
        ]}
        setField={setField}
      />
      <InfoRow label="δadm = L/300" value={`${deltaAdm} mm`} />
    </div>
  );
}
