import { useState, useEffect } from 'react';
import { type PileCapInputs } from '../../data/defaults';
import { autoCapDims, minEdgeDistance } from '../../lib/calculations/pileCap';
import { availableFck } from '../../data/materials';
import { availableBarDiams } from '../../data/rebar';
import { LABELS, type LabelKey } from '../../lib/text/labels';
import { CollapsibleSection } from '../../components/ui/CollapsibleSection';
import { InputLabel } from '../../components/ui/InputLabel';
import { UnitNumberInput } from '../../components/units/UnitNumberInput';

interface Props {
  state:    PileCapInputs;
  setField: <K extends keyof PileCapInputs>(field: K, value: PileCapInputs[K]) => void;
}

// ── NumField ──────────────────────────────────────────────────────────────────

function NumField({
  labelKey, label, sub, help, field, value, unit, setField,
}: {
  labelKey?: LabelKey;
  label?: string; sub?: string; help?: string; field: keyof PileCapInputs;
  value: number; unit?: string; setField: Props['setField'];
}) {
  const resolved = labelKey
    ? { label: LABELS[labelKey].sym, sub: LABELS[labelKey].descShort, unit: LABELS[labelKey].unit }
    : { label: label ?? '', sub, unit: unit ?? '' };
  const unitText = resolved.unit === '—' ? '' : resolved.unit;
  const [localStr, setLocalStr] = useState(() => String(value));

  useEffect(() => { setLocalStr(String(value)); }, [value]);

  return (
    <div className="flex items-center justify-between py-0.75 max-lg:min-h-11 gap-2">
      <InputLabel
        htmlFor={`pc-${field}`}
        labelKey={labelKey}
        label={labelKey ? undefined : resolved.label}
        sub={labelKey ? undefined : resolved.sub}
        help={help}
      />
      <div className="flex shrink-0">
        <input
          id={`pc-${field}`}
          type="text"
          inputMode="decimal"
          value={localStr}
          onChange={(e) => {
            setLocalStr(e.target.value);
            const n = parseFloat(e.target.value);
            if (!isNaN(n)) setField(field, n);
          }}
          onBlur={() => {
            const n = parseFloat(localStr);
            if (isNaN(n)) setLocalStr(String(value));
          }}
          className="w-15 text-right bg-bg-primary border border-border-main rounded-l px-1.75 py-1 text-[12px] font-mono text-text-primary outline-none hover:border-accent/40 hover:bg-bg-elevated focus:border-accent focus:bg-bg-elevated transition-colors"
          aria-label={`${resolved.label} (${unitText})`}
        />
        <span className="bg-bg-elevated border border-l-0 border-border-main rounded-r px-1.25 py-1 text-[10px] text-text-disabled font-mono whitespace-nowrap flex items-center">
          {unitText}
        </span>
      </div>
    </div>
  );
}

// ── SelectField ───────────────────────────────────────────────────────────────

function SelectField({
  labelKey, label, help, field, value, options, setField,
}: {
  labelKey?: LabelKey;
  label?: string; help?: string; field: keyof PileCapInputs; value: string | number;
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
        htmlFor={`pc-sel-${field}`}
        labelKey={labelKey}
        label={labelKey ? undefined : resolved.label}
        sub={labelKey ? undefined : resolved.sub}
        help={help}
      />
      <select
        id={`pc-sel-${field}`}
        value={value}
        onChange={(e) => {
          const raw = e.target.value;
          const asNum = Number(raw);
          // Cast: option values are controlled by the caller and match Inputs[field]'s union.
          setField(field, (isNaN(asNum) ? raw : asNum) as PileCapInputs[typeof field]);
        }}
        className="shrink-0 bg-bg-primary border border-border-main rounded pl-2 pr-6 py-1 text-[12px] font-mono text-text-primary outline-none hover:border-accent/40 hover:bg-bg-elevated focus:border-accent focus:bg-bg-elevated cursor-pointer transition-colors"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

const N_OPTIONS = [2, 3, 4] as const;

export function PileCapInputsPanel({ state, setField }: Props) {
  const n = state.n as number;
  const plateOn = (state.plate_on as boolean | undefined) ?? false;
  const dimsAuto = (state.dims_auto as boolean | undefined) ?? true;
  // Dimensiones auto vigentes: se muestran en modo auto y siembran los campos
  // manuales al cambiar de modo (punto de partida redondeado a 5 cm).
  const auto = autoCapDims(
    n, state.s as number, state.d_p as number,
    state.b_col as number, state.h_col as number,
  );
  const eMin = minEdgeDistance(state.d_p as number);

  const fckOptions = availableFck.map((v) => ({ value: v, label: `${v} MPa` }));
  const fykOptions = [{ value: 500, label: '500 MPa' }, { value: 400, label: '400 MPa' }];
  const barOptions = availableBarDiams.map((v) => ({ value: v, label: `Ø${v} mm` }));

  return (
    <div className="flex flex-col gap-0">

      {/* n picker — segmented control */}
      <CollapsibleSection label="Número de micropilotes">
        <div
          role="radiogroup"
          aria-label="Número de micropilotes"
          className="flex rounded border border-border-main mb-3 shrink-0 overflow-hidden"
        >
          {N_OPTIONS.map((opt) => {
            const isActive = n === opt;
            return (
              <button
                key={opt}
                type="button"
                role="radio"
                aria-checked={isActive}
                onClick={() => setField('n', opt)}
                className={[
                  'flex-1 py-2 text-center transition-colors border-r border-border-main last:border-r-0',
                  isActive
                    ? 'bg-accent/10 text-accent font-semibold'
                    : 'text-text-disabled hover:text-text-secondary',
                ].join(' ')}
              >
                <span className="text-[12px] font-mono">{opt}</span>
              </button>
            );
          })}
        </div>
      </CollapsibleSection>

      {/* Geometry */}
      <CollapsibleSection label="Geometría">
        <NumField label="d_p"    sub="Diám. pilote"     field="d_p"    value={state.d_p as number}    unit="mm"  setField={setField}
          help="Diámetro del pilote. Define la geometría del grupo y la posición de los nudos del modelo." />

        {/* Placa de reparto en cabeza de micro: agranda el apoyo del nodo
          * comprimido (la biela se comprueba sobre la placa, no sobre el tubo) */}
        <div className="flex items-center justify-between py-0.75 max-lg:min-h-11 gap-2">
          <InputLabel
            htmlFor="pc-plate-mode"
            label="Placa reparto"
            sub="Cabeza de micro"
            help="Placa soldada en la cabeza del micropilote (con cartelas) que reparte la carga: el nodo comprimido de la biela se comprueba sobre el área de la placa en lugar de la sección del tubo. Su espesor, cartelas y soldadura se dimensionan aparte."
          />
          <div
            id="pc-plate-mode"
            role="radiogroup"
            aria-label="Placa de reparto en cabeza de micropilote"
            className="flex rounded border border-border-main overflow-hidden shrink-0"
          >
            {([
              { on: false, label: 'No' },
              { on: true,  label: 'Sí' },
            ] as const).map((opt) => {
              const isActive = plateOn === opt.on;
              return (
                <button
                  key={opt.label}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  onClick={() => {
                    if (plateOn === opt.on) return;
                    setField('plate_on', opt.on);
                    if (opt.on && (state.d_plate as number) < (state.d_p as number)) {
                      // Semilla: placa que cubre el micro con vuelo razonable
                      setField('d_plate', Math.ceil(((state.d_p as number) + 100) / 10) * 10);
                    }
                  }}
                  className={[
                    'px-2.5 py-1 text-[11px] font-mono transition-colors border-r border-border-main last:border-r-0',
                    isActive
                      ? 'bg-accent/10 text-accent font-semibold'
                      : 'text-text-disabled hover:text-text-secondary',
                  ].join(' ')}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {plateOn && (
          <>
            <SelectField
              label="Forma placa" field="plate_shape"
              value={state.plate_shape as string}
              options={[
                { value: 'circ', label: 'Circular (Ø)' },
                { value: 'cuad', label: 'Cuadrada (lado)' },
              ]}
              setField={setField}
              help="Forma de la placa de reparto. El área del nodo es π·Ø²/4 (circular) o lado² (cuadrada)."
            />
            <NumField
              label={state.plate_shape === 'cuad' ? 'a_placa' : 'Ø_placa'}
              sub={state.plate_shape === 'cuad' ? 'Lado placa' : 'Diám. placa'}
              field="d_plate" value={state.d_plate as number} unit="mm" setField={setField}
              help="Dimensión de la placa de reparto (Ø si es circular, lado si es cuadrada). Debe cubrir la cabeza del micro (≥ d_p), no solaparse con la placa contigua (≤ s) y caber en planta."
            />
          </>
        )}

        <NumField label="s"      sub="Sep. c/c"         field="s"      value={state.s as number}      unit="mm"  setField={setField}
          help="Separación entre ejes de pilotes (centro a centro). Determina el brazo del tirante." />
        <NumField labelKey="h_encepado" field="h_enc"  value={state.h_enc as number}  setField={setField} />
        <NumField labelKey="b_col"      field="b_col"  value={state.b_col as number}  setField={setField} />
        <NumField labelKey="h_col"      field="h_col"  value={state.h_col as number}  setField={setField} />

        {/* Dimensiones en planta: auto (e_min a borde + redondeo 5 cm) o manual */}
        <div className="flex items-center justify-between py-0.75 max-lg:min-h-11 gap-2 mt-1">
          <InputLabel
            htmlFor="pc-dims-mode"
            label="Lx × Ly"
            sub="Dims. en planta"
            help={`Automático: dimensiones mínimas con la distancia de eje de pilote a borde de buena práctica (e ≥ ${eMin.toFixed(0)} mm), redondeadas hacia arriba a 5 cm. Manual: defines Lx y Ly; la distancia a borde se comprueba como verificación en resultados.`}
          />
          <div
            id="pc-dims-mode"
            role="radiogroup"
            aria-label="Modo de dimensiones en planta"
            className="flex rounded border border-border-main overflow-hidden shrink-0"
          >
            {([
              { auto: true,  label: 'Auto' },
              { auto: false, label: 'Manual' },
            ] as const).map((opt) => {
              const isActive = dimsAuto === opt.auto;
              return (
                <button
                  key={opt.label}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  onClick={() => {
                    if (dimsAuto === opt.auto) return;
                    setField('dims_auto', opt.auto);
                    if (!opt.auto) {
                      // Al pasar a manual, partir de las dims auto vigentes
                      setField('L_x', auto.L_x);
                      setField('L_y', auto.L_y);
                    }
                  }}
                  className={[
                    'px-2.5 py-1 text-[11px] font-mono transition-colors border-r border-border-main last:border-r-0',
                    isActive
                      ? 'bg-accent/10 text-accent font-semibold'
                      : 'text-text-disabled hover:text-text-secondary',
                  ].join(' ')}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {dimsAuto ? (
          <p className="text-[10px] text-text-secondary leading-relaxed py-0.75">
            Auto: {auto.L_x} × {auto.L_y} mm (e ≥ {eMin.toFixed(0)} mm a borde, redondeo a 5 cm)
          </p>
        ) : (
          <>
            <NumField label="L_x" sub="Ancho planta (x)" field="L_x" value={state.L_x as number} unit="mm" setField={setField}
              help="Dimensión del encepado en la dirección x (la de los pilotes con n=2). La distancia de eje de pilote a borde resultante se comprueba en resultados." />
            <NumField label="L_y" sub="Largo planta (y)" field="L_y" value={state.L_y as number} unit="mm" setField={setField}
              help="Dimensión del encepado en la dirección y. Debe alojar el pilar y respetar la distancia a borde." />
          </>
        )}
      </CollapsibleSection>

      {/* Loads — Mx y My SIEMPRE visibles (fix auditoría #76: con n=2 el campo
        * My quedaba oculto pero el valor persistido seguía alterando las
        * reacciones; y Mx oculto impedía poner a cero el momento que el motor
        * rechaza para n=2). R_adm vive aquí: es la resistencia de cálculo del
        * pilote frente a la demanda ELU (fix auditoría #84). */}
      <CollapsibleSection label="Acciones de diseño (ELU)">
        <UnitNumberInput
          labelKey="NEd" field="N_Ed"
          value={state.N_Ed as number} quantity="force"
          onChange={(v) => setField('N_Ed', v)}
        />
        <UnitNumberInput
          labelKey="Mx_Ed_plan" field="Mx_Ed"
          value={state.Mx_Ed as number} quantity="moment"
          onChange={(v) => setField('Mx_Ed', v)}
        />
        <UnitNumberInput
          labelKey="My_Ed_plan" field="My_Ed"
          value={state.My_Ed as number} quantity="moment"
          onChange={(v) => setField('My_Ed', v)}
        />
        <UnitNumberInput
          label="R_c,Rd" sub="Resist. cálculo pilote" field="R_adm"
          help="Resistencia de cálculo a compresión de un pilote (ELU). La reacción de cada pilote no debe superarla."
          value={state.R_adm as number} quantity="force"
          onChange={(v) => setField('R_adm', v)}
        />
      </CollapsibleSection>

      {/* Materials */}
      <CollapsibleSection label="Materiales">
        <SelectField labelKey="fck" field="fck" value={state.fck as number} options={fckOptions} setField={setField} />
        <SelectField labelKey="fyk" field="fyk" value={state.fyk as number} options={fykOptions} setField={setField} />
      </CollapsibleSection>

      {/* Reinforcement */}
      <CollapsibleSection label="Armadura tirantes">
        <SelectField labelKey="bar_diameter_tie" field="phi_tie" value={state.phi_tie as number} options={barOptions} setField={setField} />
        <NumField labelKey="cover_mechanical" field="cover"  value={state.cover as number}  setField={setField} />

        {n === 2 && (
          <p className="text-[10px] text-text-secondary mt-3 leading-relaxed">
            n=2: 2 pilotes alineados en X. Mx_Ed debe ser 0 (staticamente inadmisible). Usar n=4 para momento biaxial.
          </p>
        )}
      </CollapsibleSection>
    </div>
  );
}
