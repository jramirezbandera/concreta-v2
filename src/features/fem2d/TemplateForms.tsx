// FEM 2D — parametric template forms (the "Nueva estructura" draft UI).
//
// Born as the module's main input panel in the parametric-first era (T10); with
// the free editor the templates became SEEDS, so this whole panel now lives
// inside NewStructureDialog as the draft form: topology selector + the active
// template's parameter set + self-weight toggle. Controlled component over a
// Fem2DUiState draft — never touches the live model (the dialog builds the
// model on confirm via buildModelFromState).
//
// Profile selection is the shared two-step familia+tamaño pattern (family
// lists live in ./profiles) — the member inspector mirrors it.

import type { JSX } from 'react';
import { AlertTriangle } from 'lucide-react';
import { CollapsibleSection } from '../../components/ui/CollapsibleSection';
import { InputLabel } from '../../components/ui/InputLabel';
import { UnitNumberInput } from '../../components/units/UnitNumberInput';
import {
  AXIAL_FAMILIES,
  BENDING_FAMILIES,
  familyOfKey,
  nearestInFamily,
  steelEntriesByFamily,
  type SteelFamily,
} from './profiles';
import { FEM2D_TEMPLATES, type GableParams, type MultistoryParams, type PortalFrameParams, type PrattTrussParams } from './templates';
import { TEMPLATE_ORDER, type Fem2DUiState } from './uiState';
import type { Fem2DTemplateId } from './types';

interface TemplateDraftFormProps {
  value: Fem2DUiState;
  onChange: (next: Fem2DUiState) => void;
  /** validateActive(state) — drives the "datos no válidos" banner. */
  errors: string[];
}

const STEEL_OPTIONS = [
  { value: 'S275', label: 'S275' },
  { value: 'S355', label: 'S355' },
];
const FIXITY_OPTIONS = [
  { value: 'fixed', label: 'Empotrada' },
  { value: 'pinned', label: 'Articulada' },
];

// ── Reusable labeled <select> (mirrors the slope-module select styling) ───────

function LabeledSelect({
  id, label, sub, help, value, onChange, options,
}: {
  id: string;
  label: string;
  sub?: string;
  help?: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}): JSX.Element {
  return (
    <div className="flex flex-col gap-1 py-0.75 min-w-0">
      <InputLabel htmlFor={id} label={label} sub={sub} help={help} />
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-bg-primary border border-border-main rounded px-2 py-1 text-[12px] font-mono text-text-primary outline-none hover:border-accent/40 focus:border-accent transition-colors w-full"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

/** Two-step familia + tamaño profile selector (same pattern as the member
 *  inspector). Switching family snaps to the nearest-stiffness entry. */
function ProfilePairSelect({ idBase, label, help, value, onChange, axial = false }: {
  idBase: string;
  label: string;
  help?: string;
  value: string;
  onChange: (key: string) => void;
  /** true = two-force selector (adds the L family). */
  axial?: boolean;
}): JSX.Element {
  const families = axial ? AXIAL_FAMILIES : BENDING_FAMILIES;
  const current = familyOfKey(value);
  const famOptions = current && !families.includes(current) ? [current, ...families] : families;
  const fam = current ?? families[0];
  return (
    <div className="grid grid-cols-2 gap-1.5">
      <LabeledSelect
        id={`${idBase}-fam`}
        label={label}
        help={help}
        value={fam}
        onChange={(f) => onChange(nearestInFamily(f as SteelFamily, value).key)}
        options={famOptions.map((f) => ({ value: f, label: f }))}
      />
      <LabeledSelect
        id={`${idBase}-size`}
        label="Tamaño"
        value={value}
        onChange={onChange}
        options={steelEntriesByFamily(fam).map((e) => ({ value: e.key, label: e.sizeLabel }))}
      />
    </div>
  );
}

// ── Per-template forms ────────────────────────────────────────────────────────

function PortalForm({ p, set }: { p: PortalFrameParams; set: (patch: Partial<PortalFrameParams>) => void }): JSX.Element {
  return (
    <>
      <CollapsibleSection label="Geometría" refNorma="pórtico simple">
        <UnitNumberInput label="L" sub="luz" unit="m" value={p.span} onChange={(n) => set({ span: n })} min={3} max={30} />
        <UnitNumberInput label="h" sub="altura" unit="m" value={p.height} onChange={(n) => set({ height: n })} min={2} max={10} />
        <LabeledSelect id="fem2d-portal-base" label="Base" help="Empotrada o articulada en los arranques de pilar." value={p.baseFixity} onChange={(v) => set({ baseFixity: v as PortalFrameParams['baseFixity'] })} options={FIXITY_OPTIONS} />
      </CollapsibleSection>
      <CollapsibleSection label="Perfiles" refNorma="CE Anejo 22">
        <ProfilePairSelect idBase="fem2d-portal-col" label="Pilar" value={p.columnProfileKey} onChange={(v) => set({ columnProfileKey: v })} />
        <ProfilePairSelect idBase="fem2d-portal-beam" label="Dintel" value={p.beamProfileKey} onChange={(v) => set({ beamProfileKey: v })} />
        <LabeledSelect id="fem2d-portal-steel" label="Acero" value={p.steel} onChange={(v) => set({ steel: v as PortalFrameParams['steel'] })} options={STEEL_OPTIONS} />
        <UnitNumberInput label="s" sub="correas (arriostr. ala)" unit="m" help="Separación de correas que arriostran el ala comprimida del dintel (limita el pandeo lateral)." value={p.beamLtbSpacing} onChange={(n) => set({ beamLtbSpacing: n })} min={0.1} max={30} />
      </CollapsibleSection>
      <CollapsibleSection label="Cargas" refNorma="CTE DB-SE-AE">
        <UnitNumberInput label="g" sub="permanente dintel" quantity="linearLoad" value={p.beamDeadLoad} onChange={(n) => set({ beamDeadLoad: n })} min={0} />
        <UnitNumberInput label="q" sub="sobrecarga dintel" quantity="linearLoad" value={p.beamLiveLoad} onChange={(n) => set({ beamLiveLoad: n })} min={0} />
        <UnitNumberInput label="W" sub="viento en cabeza" quantity="force" help="Fuerza horizontal de viento en el alero izquierdo. Signo: + hacia la derecha." value={p.windEaveForce} onChange={(n) => set({ windEaveForce: n })} />
      </CollapsibleSection>
    </>
  );
}

function GableForm({ p, set }: { p: GableParams; set: (patch: Partial<GableParams>) => void }): JSX.Element {
  return (
    <>
      <CollapsibleSection label="Geometría" refNorma="pórtico a dos aguas">
        <UnitNumberInput label="L" sub="luz" unit="m" value={p.span} onChange={(n) => set({ span: n })} min={4} max={30} />
        <UnitNumberInput label="h" sub="alero" unit="m" value={p.eaveHeight} onChange={(n) => set({ eaveHeight: n })} min={2} max={10} />
        <UnitNumberInput label="hc" sub="cumbrera" unit="m" help="Altura de cumbrera (debe superar el alero)." value={p.ridgeHeight} onChange={(n) => set({ ridgeHeight: n })} min={2} max={15} />
        <LabeledSelect id="fem2d-gable-base" label="Base" value={p.baseFixity} onChange={(v) => set({ baseFixity: v as GableParams['baseFixity'] })} options={FIXITY_OPTIONS} />
      </CollapsibleSection>
      <CollapsibleSection label="Perfiles" refNorma="CE Anejo 22">
        <ProfilePairSelect idBase="fem2d-gable-col" label="Pilar" value={p.columnProfileKey} onChange={(v) => set({ columnProfileKey: v })} />
        <ProfilePairSelect idBase="fem2d-gable-rafter" label="Faldón" value={p.rafterProfileKey} onChange={(v) => set({ rafterProfileKey: v })} />
        <LabeledSelect id="fem2d-gable-steel" label="Acero" value={p.steel} onChange={(v) => set({ steel: v as GableParams['steel'] })} options={STEEL_OPTIONS} />
        <UnitNumberInput label="s" sub="correas (arriostr. faldón)" unit="m" value={p.rafterLtbSpacing} onChange={(n) => set({ rafterLtbSpacing: n })} min={0.1} max={30} />
      </CollapsibleSection>
      <CollapsibleSection label="Cargas" refNorma="CTE DB-SE-AE">
        <UnitNumberInput label="g" sub="permanente faldón" quantity="linearLoad" value={p.rafterDeadLoad} onChange={(n) => set({ rafterDeadLoad: n })} min={0} />
        <UnitNumberInput label="S" sub="nieve (por longitud)" quantity="linearLoad" help="Nieve por unidad de longitud de faldón. Pre-convierte la nieve en proyección horizontal (w·cosθ) — v1 no lo hace por ti." value={p.rafterSnowLoad} onChange={(n) => set({ rafterSnowLoad: n })} min={0} />
        <UnitNumberInput label="W" sub="viento en cabeza" quantity="force" value={p.windEaveForce} onChange={(n) => set({ windEaveForce: n })} />
        <UnitNumberInput label="w⊥" sub="presión viento faldón" quantity="linearLoad" help="Presión de viento perpendicular al faldón a barlovento. Signo: + = presión hacia la cubierta." value={p.windRafterPressure} onChange={(n) => set({ windRafterPressure: n })} />
      </CollapsibleSection>
    </>
  );
}

function MultistoryForm({ p, set }: { p: MultistoryParams; set: (patch: Partial<MultistoryParams>) => void }): JSX.Element {
  // Changing the story count must resize the per-story wind vector: pad new
  // storeys with 0, drop removed ones. Done here so windStoryForces.length always
  // equals nStories (the template's validate() rejects a mismatch).
  const setStories = (n: number) => {
    const next = [...p.windStoryForces];
    while (next.length < n) next.push(0);
    next.length = Math.max(0, n);
    set({ nStories: n, windStoryForces: next });
  };
  const setWind = (i: number, v: number) => {
    const next = [...p.windStoryForces];
    next[i] = v;
    set({ windStoryForces: next });
  };
  return (
    <>
      <CollapsibleSection label="Geometría" refNorma="pórtico de plantas">
        <UnitNumberInput label="nv" sub="vanos" value={p.nBays} onChange={(n) => set({ nBays: n })} integer min={1} max={4} step={1} clamp unit="ud" />
        <UnitNumberInput label="np" sub="plantas" value={p.nStories} onChange={setStories} integer min={1} max={5} step={1} clamp unit="ud" />
        <UnitNumberInput label="b" sub="luz de vano" unit="m" value={p.bayWidth} onChange={(n) => set({ bayWidth: n })} min={3} max={12} />
        <UnitNumberInput label="hp" sub="altura de planta" unit="m" value={p.storyHeight} onChange={(n) => set({ storyHeight: n })} min={2.2} max={6} />
        <LabeledSelect id="fem2d-multi-base" label="Base" value={p.baseFixity} onChange={(v) => set({ baseFixity: v as MultistoryParams['baseFixity'] })} options={FIXITY_OPTIONS} />
      </CollapsibleSection>
      <CollapsibleSection label="Perfiles" refNorma="CE Anejo 22">
        <ProfilePairSelect idBase="fem2d-multi-col" label="Pilar" value={p.columnProfileKey} onChange={(v) => set({ columnProfileKey: v })} />
        <ProfilePairSelect idBase="fem2d-multi-beam" label="Viga" value={p.beamProfileKey} onChange={(v) => set({ beamProfileKey: v })} />
        <LabeledSelect id="fem2d-multi-steel" label="Acero" value={p.steel} onChange={(v) => set({ steel: v as MultistoryParams['steel'] })} options={STEEL_OPTIONS} />
        <UnitNumberInput label="s" sub="arriostr. ala vigas" unit="m" value={p.beamLtbSpacing} onChange={(n) => set({ beamLtbSpacing: n })} min={0.1} max={30} />
      </CollapsibleSection>
      <CollapsibleSection label="Cargas" refNorma="CTE DB-SE-AE">
        <UnitNumberInput label="g" sub="permanente forjado" quantity="linearLoad" value={p.floorDeadLoad} onChange={(n) => set({ floorDeadLoad: n })} min={0} />
        <UnitNumberInput label="q" sub="sobrecarga forjado" quantity="linearLoad" value={p.floorLiveLoad} onChange={(n) => set({ floorLiveLoad: n })} min={0} />
        <p className="text-[10px] text-text-disabled leading-snug px-0.5 pt-1">Viento por planta (fuerza horizontal, + hacia la derecha):</p>
        {p.windStoryForces.map((f, i) => (
          <UnitNumberInput key={i} label={`W${i + 1}`} sub={`planta ${i + 1}`} quantity="force" value={f} onChange={(v) => setWind(i, v)} />
        ))}
      </CollapsibleSection>
    </>
  );
}

function PrattForm({ p, set }: { p: PrattTrussParams; set: (patch: Partial<PrattTrussParams>) => void }): JSX.Element {
  return (
    <>
      <CollapsibleSection label="Geometría" refNorma="cercha Pratt">
        <UnitNumberInput label="L" sub="luz" unit="m" value={p.span} onChange={(n) => set({ span: n })} min={4} max={30} />
        <UnitNumberInput label="c" sub="canto" unit="m" value={p.height} onChange={(n) => set({ height: n })} min={0.5} max={5} />
        <UnitNumberInput label="n" sub="paneles (par)" value={p.nPanels} onChange={(n) => set({ nPanels: n })} integer min={4} max={12} step={2} clamp unit="ud" help="Número de paneles (par, 4–12)." />
      </CollapsibleSection>
      <CollapsibleSection label="Perfiles" refNorma="CE Anejo 22">
        <ProfilePairSelect idBase="fem2d-pratt-chord" label="Cordones" value={p.chordProfileKey} onChange={(v) => set({ chordProfileKey: v })} />
        <ProfilePairSelect idBase="fem2d-pratt-web" label="Celosía" help="Diagonales y montantes (solo axil): admite angulares L y tubos." value={p.webProfileKey} onChange={(v) => set({ webProfileKey: v })} axial />
        <LabeledSelect id="fem2d-pratt-steel" label="Acero" value={p.steel} onChange={(v) => set({ steel: v as PrattTrussParams['steel'] })} options={STEEL_OPTIONS} />
      </CollapsibleSection>
      <CollapsibleSection label="Cargas" refNorma="CTE DB-SE-AE">
        <UnitNumberInput label="g" sub="permanente cubierta" quantity="linearLoad" value={p.roofDeadLoad} onChange={(n) => set({ roofDeadLoad: n })} min={0} />
        <UnitNumberInput label="q" sub="sobrecarga cubierta" quantity="linearLoad" value={p.roofLiveLoad} onChange={(n) => set({ roofLiveLoad: n })} min={0} />
        <UnitNumberInput label="gt" sub="techo (cordón inf.)" quantity="linearLoad" value={p.ceilingLoad} onChange={(n) => set({ ceilingLoad: n })} min={0} />
      </CollapsibleSection>
    </>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export function TemplateDraftForm({ value, onChange, errors }: TemplateDraftFormProps): JSX.Element {
  const tid = value.templateId;

  const selectTemplate = (id: Fem2DTemplateId) => onChange({ ...value, templateId: id });

  // Update the active template's params (typed dispatch — the union index can't
  // prove params[tid] matches each form's param type, so patch per branch).
  const patch = <T,>(next: Partial<T>) =>
    onChange({ ...value, params: { ...value.params, [tid]: { ...(value.params[tid] as object), ...next } } });

  return (
    <div className="flex flex-col gap-1">

      {/* Validation banner (shared markup with slope). */}
      {errors.length > 0 && (
        <div className="mb-1 rounded border border-state-fail/40 bg-state-fail/5 px-2.5 py-2">
          <div className="flex items-start gap-1.5">
            <AlertTriangle size={13} className="text-state-fail mt-0.5 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <div className="text-[12px] font-semibold text-state-fail leading-snug">Datos no válidos</div>
              <ul className="text-[11px] text-text-secondary mt-0.5 leading-snug list-disc pl-4">
                {errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Topology selector — 2×2 grid of templates. */}
      <CollapsibleSection label="Topología" refNorma="paramétrico">
        <div className="grid grid-cols-2 gap-1.5 py-1">
          {TEMPLATE_ORDER.map((id) => {
            const active = id === tid;
            return (
              <button
                key={id}
                type="button"
                onClick={() => selectTemplate(id)}
                aria-pressed={active}
                title={FEM2D_TEMPLATES[id].description}
                className={[
                  'rounded border px-2 py-2 text-left text-[11.5px] font-medium leading-snug transition-colors min-h-11',
                  active
                    ? 'bg-accent/15 text-accent border-accent/40'
                    : 'bg-bg-elevated text-text-secondary border-border-main hover:text-text-primary hover:border-accent/30',
                ].join(' ')}
              >
                {FEM2D_TEMPLATES[id].name}
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between py-0.75 gap-2 min-w-0">
          <InputLabel label="Peso propio" sub="miembros" help="Incluye el peso propio de los perfiles como una hipótesis G." />
          <button
            type="button"
            onClick={() => onChange({ ...value, selfWeight: !value.selfWeight })}
            aria-pressed={value.selfWeight}
            className={`px-3 py-1 rounded text-[11px] font-semibold font-mono transition-colors shrink-0 ${
              value.selfWeight
                ? 'bg-accent/15 text-accent border border-accent/40'
                : 'bg-bg-elevated text-text-disabled border border-border-main'
            }`}
          >
            {value.selfWeight ? 'Incluido' : 'Omitido'}
          </button>
        </div>
      </CollapsibleSection>

      {/* Active template form. */}
      {tid === 'portal-frame' && <PortalForm p={value.params['portal-frame']} set={(x) => patch<PortalFrameParams>(x)} />}
      {tid === 'gable' && <GableForm p={value.params['gable']} set={(x) => patch<GableParams>(x)} />}
      {tid === 'multistory' && <MultistoryForm p={value.params['multistory']} set={(x) => patch<MultistoryParams>(x)} />}
      {tid === 'pratt-truss' && <PrattForm p={value.params['pratt-truss']} set={(x) => patch<PrattTrussParams>(x)} />}
    </div>
  );
}
