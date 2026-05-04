// Inputs panel para el módulo de muros de fábrica.
// Replica el diseño del prototipo: secciones colapsables (Fábrica, Muro
// global, Acciones ELU, Plantas, Forjado, Cargas puntuales, Huecos) con CRUD.

import { CollapsibleSection } from '../../components/ui/CollapsibleSection';
import {
  TABLA_4_4,
  FB_VALUES,
  FM_PARA_FB,
  resolverFabrica,
  eMin,
  type MasonryWallState,
  type Hueco,
  type Puntual,
  type PlantaResult,
} from '../../lib/calculations/masonryWalls';

interface NumFieldProps {
  label: string;
  sub?: string;
  value: number;
  unit?: string;
  onChange: (v: number) => void;
  refNorma?: string;
}

function NumField({ label, sub, value, unit, onChange, refNorma }: NumFieldProps) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 py-1">
        <div className="min-w-0 flex flex-col">
          <span className="text-[12px] text-text-secondary truncate" title={sub}>
            <span className="font-mono">{label}</span>
            {sub && <span className="text-text-disabled"> · {sub}</span>}
          </span>
          {refNorma && <span className="text-[10px] font-mono text-text-disabled">{refNorma}</span>}
        </div>
        <div className="flex shrink-0">
          <input
            type="text"
            value={value}
            onChange={(e) => {
              const n = parseFloat(e.target.value);
              if (!isNaN(n)) onChange(n);
              else if (e.target.value === '' || e.target.value === '-') onChange(0);
            }}
            className="w-16 text-right bg-bg-primary border border-border-main rounded-l px-2 py-1 text-[12px] font-mono text-text-primary outline-none focus:border-accent"
          />
          <span className="bg-bg-elevated border border-l-0 border-border-main rounded-r px-1.5 py-1 text-[10px] font-mono text-text-disabled flex items-center">
            {unit}
          </span>
        </div>
      </div>
    </div>
  );
}

interface SelFieldProps<T extends string | number> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  refNorma?: string;
}

function SelField<T extends string | number>({ label, value, options, onChange, refNorma }: SelFieldProps<T>) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 py-1 min-w-0">
        <span className="text-[12px] text-text-secondary truncate min-w-0">{label}</span>
        <select
          value={String(value)}
          onChange={(e) => {
            const raw = e.target.value;
            const asNum = Number(raw);
            onChange((isNaN(asNum) ? raw : asNum) as T);
          }}
          className="bg-bg-primary border border-border-main rounded px-2 py-1 text-[12px] font-mono text-text-primary outline-none focus:border-accent cursor-pointer max-w-[150px] truncate"
        >
          {options.map((o) => (
            <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
          ))}
        </select>
      </div>
      {refNorma && <span className="text-[10px] font-mono text-text-disabled block pl-1 mb-1">{refNorma}</span>}
    </div>
  );
}

interface MiniBtnProps {
  children: React.ReactNode;
  onClick: () => void;
  variant?: 'default' | 'primary' | 'danger';
  title?: string;
}

function MiniBtn({ children, onClick, variant = 'default', title }: MiniBtnProps) {
  const styles: Record<NonNullable<MiniBtnProps['variant']>, string> = {
    default: 'text-text-secondary border-border-main hover:border-accent hover:text-accent',
    primary: 'text-accent border-accent/40 bg-accent/5 hover:border-accent hover:text-accent',
    danger:  'text-state-fail border-border-main hover:border-state-fail hover:text-state-fail',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`text-[10px] font-mono px-1.5 py-0.5 rounded leading-none border transition-colors cursor-pointer ${styles[variant]}`}
    >
      {children}
    </button>
  );
}

interface Props {
  state: MasonryWallState;
  setState: React.Dispatch<React.SetStateAction<MasonryWallState>>;
  selectedPlantaIdx: number;
  selectedHueco: string | null;
  setSelectedHueco: (id: string | null) => void;
  setSelectedPlantaIdx: (i: number) => void;
  plantasCalc: PlantaResult[];
  onAddPlanta: () => void;
  onRemovePlanta: (i: number) => void;
  onAddHueco: (plIdx: number, tipo: 'puerta' | 'ventana') => void;
  onRemoveHueco: (plIdx: number, id: string) => void;
  onAddPuntual: (plIdx: number) => void;
  onRemovePuntual: (plIdx: number, id: string) => void;
}

export function MasonryWallsInputs({
  state, setState,
  selectedPlantaIdx, selectedHueco,
  setSelectedHueco, setSelectedPlantaIdx,
  plantasCalc,
  onAddPlanta, onRemovePlanta,
  onAddHueco, onRemoveHueco,
  onAddPuntual, onRemovePuntual,
}: Props) {
  const set = <K extends keyof MasonryWallState>(k: K, v: MasonryWallState[K]) =>
    setState((s) => ({ ...s, [k]: v }));

  const setPlanta = <K extends keyof MasonryWallState['plantas'][number]>(
    idx: number, k: K, v: MasonryWallState['plantas'][number][K],
  ) => setState((s) => ({
    ...s,
    plantas: s.plantas.map((p, i) => (i === idx ? { ...p, [k]: v } : p)),
  }));

  const setHueco = <K extends keyof Hueco>(
    plIdx: number, id: string, k: K, v: Hueco[K],
  ) => setState((s) => ({
    ...s,
    plantas: s.plantas.map((p, i) =>
      i === plIdx
        ? { ...p, huecos: p.huecos.map((h) => (h.id === id ? { ...h, [k]: v } : h)) }
        : p,
    ),
  }));

  const setPuntual = <K extends keyof Puntual>(
    plIdx: number, id: string, k: K, v: Puntual[K],
  ) => setState((s) => ({
    ...s,
    plantas: s.plantas.map((p, i) =>
      i === plIdx
        ? { ...p, puntuales: p.puntuales.map((q) => (q.id === id ? { ...q, [k]: v } : q)) }
        : p,
    ),
  }));

  const fab = resolverFabrica(state);
  const plantaSel = state.plantas[selectedPlantaIdx];
  const plantaCalcSel = plantasCalc[selectedPlantaIdx];
  const fmDisponibles = FM_PARA_FB[state.fb] || [];

  return (
    <div className="px-4 py-3 min-w-0">
      {/* Fábrica · Tabla 4.4 / Personalizada */}
      <CollapsibleSection label="Fábrica" refNorma="§4.6 · Tabla 4.4">
        <div className="flex gap-1 mb-2">
          {(['tabla', 'custom'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => set('fabricaModo', m)}
              className="flex-1 text-[11px] py-1 rounded font-mono cursor-pointer border transition-colors"
              style={{
                color: state.fabricaModo === m ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                background: state.fabricaModo === m ? 'rgba(56,189,248,0.08)' : 'transparent',
                borderColor: state.fabricaModo === m ? 'var(--color-accent)' : 'var(--color-border-main)',
              }}
            >
              {m === 'tabla' ? 'Tabla 4.4' : 'Personalizada'}
            </button>
          ))}
        </div>

        {state.fabricaModo === 'tabla' ? (
          <>
            <SelField
              label="Pieza"
              value={state.pieza}
              onChange={(v) => set('pieza', v as MasonryWallState['pieza'])}
              options={Object.entries(TABLA_4_4).map(([k, v]) => ({ value: k as MasonryWallState['pieza'], label: v.label }))}
            />
            <SelField
              label="fb (pieza)"
              value={state.fb}
              onChange={(v) => {
                const fbN = Number(v);
                const fms = FM_PARA_FB[fbN];
                const newFm = fms.includes(state.fm) ? state.fm : fms[0];
                setState((s) => ({ ...s, fb: fbN, fm: newFm }));
              }}
              options={FB_VALUES.map((v) => ({ value: v, label: `${v} N/mm²` }))}
            />
            <SelField
              label="fm (mortero)"
              value={state.fm}
              onChange={(v) => set('fm', Number(v))}
              options={fmDisponibles.map((v) => ({ value: v, label: `${v} N/mm²` }))}
            />
          </>
        ) : (
          <>
            <NumField label="fk" sub="caract." value={state.fk_custom} unit="N/mm²" onChange={(v) => set('fk_custom', v)} />
            <NumField label="γ"  sub="peso esp." value={state.gamma_custom} unit="kN/m³" onChange={(v) => set('gamma_custom', v)} />
          </>
        )}
        <NumField label="γM" sub="seguridad" value={state.gamma_M} unit="" onChange={(v) => set('gamma_M', v)} refNorma="§4.6.7" />

        <div className="rounded border border-border-main p-2 mt-2 mb-1 bg-bg-primary">
          <div className="flex items-center justify-between text-[10px] font-mono">
            <span className="text-text-disabled">fk</span>
            <span style={{ color: fab.fk ? 'var(--color-text-primary)' : 'var(--color-state-fail)' }}>
              {fab.fk ? `${fab.fk} N/mm²` : 'no aplicable'}
            </span>
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono">
            <span className="text-text-disabled">f_d = fk/γM</span>
            <span>{fab.fk ? (fab.fk / state.gamma_M).toFixed(2) : '—'} N/mm²</span>
          </div>
        </div>
      </CollapsibleSection>

      {/* Muro global */}
      <CollapsibleSection label="Muro · global" refNorma="§5.2.4">
        <NumField label="L" sub="longitud" value={state.L} unit="mm" onChange={(v) => set('L', v)} />
        <NumField label="t" sub="espesor"  value={state.t} unit="mm" onChange={(v) => set('t', v)} />
        <p className="text-[10px] text-text-disabled leading-tight pl-1 mb-1">
          e_min = max(0,05·t, 20mm) = {eMin(state.t).toFixed(0)} mm · §5.2.3
        </p>
      </CollapsibleSection>

      {/* Acciones */}
      <CollapsibleSection label="Acciones · combinación ELU" refNorma="DB-SE §4.2.4">
        <div className="rounded border border-border-main bg-bg-primary px-2 py-1.5 mb-2">
          <p className="text-[10px] text-text-secondary leading-snug font-mono">
            Cargas en <span className="text-accent">valores característicos</span> (sin mayorar).
          </p>
          <p className="text-[10px] text-text-disabled leading-snug font-mono mt-1">
            q<sub>d</sub> = γ<sub>G</sub>·G<sub>k</sub> + γ<sub>Q</sub>·Q<sub>k</sub>
          </p>
        </div>
        <NumField label="γG" sub="permanente" value={state.gamma_G} unit="" onChange={(v) => set('gamma_G', v)} />
        <NumField label="γQ" sub="variable"   value={state.gamma_Q} unit="" onChange={(v) => set('gamma_Q', v)} />
      </CollapsibleSection>

      {/* Plantas list + CRUD */}
      <CollapsibleSection label="Plantas del edificio" refNorma="§5.2">
        <div className="flex flex-col gap-1">
          {state.plantas.map((pl, i) => {
            const cs = plantasCalc[i];
            const eMax = Math.max(...cs.machones.map((m) => m.etaMax));
            const stCol = eMax >= 1 ? 'var(--color-state-fail)' : eMax >= 0.8 ? 'var(--color-state-warn)' : 'var(--color-state-ok)';
            const isSel = selectedPlantaIdx === i;
            const esCubierta = i === state.plantas.length - 1;
            return (
              <div key={pl.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => { setSelectedPlantaIdx(i); setSelectedHueco(null); }}
                  className="flex-1 flex items-center justify-between rounded px-2 py-1.5 text-[11px] cursor-pointer border transition-colors"
                  style={{
                    background: isSel ? 'rgba(56,189,248,0.08)' : 'transparent',
                    borderColor: isSel ? 'var(--color-accent)' : 'var(--color-border-main)',
                  }}
                >
                  <span className="font-mono" style={{ color: isSel ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}>
                    {pl.nombre}
                  </span>
                  <span className="font-mono tabular-nums" style={{ color: stCol }}>
                    {(eMax * 100).toFixed(0)}%
                  </span>
                </button>
                {!esCubierta && state.plantas.length > 2 && (
                  <MiniBtn variant="danger" onClick={() => onRemovePlanta(i)} title="Eliminar planta">×</MiniBtn>
                )}
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onAddPlanta}
          className="w-full mt-2 text-[11px] font-mono py-1.5 rounded border border-dashed border-border-main text-text-disabled hover:border-accent hover:text-accent cursor-pointer transition-colors"
        >
          + Añadir planta
        </button>
      </CollapsibleSection>

      {plantaSel && (
        <>
          <CollapsibleSection label={`Forjado · ${plantaSel.nombre}`} refNorma="§5.2.3">
            <NumField label="H"   sub="altura libre"  value={plantaSel.H}       unit="mm"   onChange={(v) => setPlanta(selectedPlantaIdx, 'H', v)} />
            <NumField label="q_G" sub="permanente Gk" value={plantaSel.q_G}     unit="kN/m" onChange={(v) => setPlanta(selectedPlantaIdx, 'q_G', v)} />
            <NumField label="q_Q" sub="variable Qk"   value={plantaSel.q_Q}     unit="kN/m" onChange={(v) => setPlanta(selectedPlantaIdx, 'q_Q', v)} />
            <NumField label="a"   sub="apoyo"         value={plantaSel.a_apoyo} unit="mm"   onChange={(v) => setPlanta(selectedPlantaIdx, 'a_apoyo', v)} />
            <NumField label="e_a" sub="penetración"   value={plantaSel.e_apoyo} unit="mm"   onChange={(v) => setPlanta(selectedPlantaIdx, 'e_apoyo', v)} />
            {plantaCalcSel && (
              <p className="text-[10px] text-text-disabled leading-tight pl-1 mt-1">
                q<sub>d</sub> = {(state.gamma_G * (plantaSel.q_G || 0) + state.gamma_Q * (plantaSel.q_Q || 0)).toFixed(2)} kN/m<br />
                Reparto k = {plantaCalcSel.k_reparto.toFixed(2)}<br />
                e_cabeza = {plantaCalcSel.e_cabeza.toFixed(0)} mm · e_pie = {plantaCalcSel.e_pie.toFixed(0)} mm
              </p>
            )}
          </CollapsibleSection>

          <CollapsibleSection label="Cargas puntuales" refNorma="§5.4">
            {plantaSel.puntuales.length === 0 && (
              <div className="text-[11px] text-text-disabled py-1">Sin cargas puntuales en esta planta.</div>
            )}
            {plantaSel.puntuales.map((p, i) => (
              <div key={p.id} className="border-l border-border-main pl-2 mb-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-mono text-text-disabled">P{i + 1}</span>
                  <MiniBtn variant="danger" onClick={() => onRemovePuntual(selectedPlantaIdx, p.id)}>eliminar</MiniBtn>
                </div>
                <NumField label="x"   sub="pos."          value={p.x}      unit="mm" onChange={(v) => setPuntual(selectedPlantaIdx, p.id, 'x', v)} />
                <NumField label="P_G" sub="permanente Gk" value={p.P_G}    unit="kN" onChange={(v) => setPuntual(selectedPlantaIdx, p.id, 'P_G', v)} />
                <NumField label="P_Q" sub="variable Qk"   value={p.P_Q}    unit="kN" onChange={(v) => setPuntual(selectedPlantaIdx, p.id, 'P_Q', v)} />
                <NumField label="b"   sub="apoyo"         value={p.b_apoyo} unit="mm" onChange={(v) => setPuntual(selectedPlantaIdx, p.id, 'b_apoyo', v)} />
                <p className="text-[10px] text-text-disabled leading-tight pl-1 mt-0.5">
                  P<sub>d</sub> = {(state.gamma_G * (p.P_G || 0) + state.gamma_Q * (p.P_Q || 0)).toFixed(1)} kN
                </p>
              </div>
            ))}
            <button
              type="button"
              onClick={() => onAddPuntual(selectedPlantaIdx)}
              className="w-full mt-1 text-[11px] font-mono py-1.5 rounded border border-dashed border-border-main text-text-disabled hover:border-accent hover:text-accent cursor-pointer transition-colors"
            >
              + Añadir carga
            </button>
          </CollapsibleSection>

          <CollapsibleSection label="Huecos">
            {plantaSel.huecos.length === 0 && (
              <div className="text-[11px] text-text-disabled py-1">Sin huecos en esta planta.</div>
            )}
            {plantaSel.huecos.map((h) => {
              const sel = selectedHueco === h.id;
              return (
                <div key={h.id} className="mb-2">
                  <div className="flex items-center justify-between mb-1">
                    <button
                      type="button"
                      onClick={() => setSelectedHueco(sel ? null : h.id)}
                      className="text-[10px] font-mono cursor-pointer"
                      style={{ color: sel ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}
                    >
                      {h.tipo === 'puerta' ? '▮ Puerta' : '◫ Ventana'} · {h.id.slice(-4)}
                    </button>
                    <MiniBtn variant="danger" onClick={() => onRemoveHueco(selectedPlantaIdx, h.id)}>eliminar</MiniBtn>
                  </div>
                  {sel && (
                    <div className="border-l border-accent pl-2">
                      <SelField
                        label="Tipo"
                        value={h.tipo}
                        onChange={(v) => setHueco(selectedPlantaIdx, h.id, 'tipo', v as Hueco['tipo'])}
                        options={[{ value: 'puerta', label: 'Puerta' }, { value: 'ventana', label: 'Ventana' }]}
                      />
                      <NumField label="x" sub="pos." value={h.x} unit="mm" onChange={(v) => setHueco(selectedPlantaIdx, h.id, 'x', v)} />
                      {h.tipo === 'ventana' && (
                        <NumField label="y" sub="alféizar" value={h.y} unit="mm" onChange={(v) => setHueco(selectedPlantaIdx, h.id, 'y', v)} />
                      )}
                      <NumField label="w" sub="ancho" value={h.w} unit="mm" onChange={(v) => setHueco(selectedPlantaIdx, h.id, 'w', v)} />
                      {h.tipo === 'ventana' && (
                        <NumField label="h" sub="alto" value={h.h} unit="mm" onChange={(v) => setHueco(selectedPlantaIdx, h.id, 'h', v)} />
                      )}
                      {/* Info del dintel */}
                      {(() => {
                        const d = plantaCalcSel?.dinteles.find((x) => x.id === h.id);
                        if (!d) return null;
                        return (
                          <div className="mt-2 rounded border border-state-warn/60 p-2 bg-state-warn/5">
                            <div className="text-[10px] font-mono text-state-warn mb-1 uppercase" style={{ letterSpacing: '0.08em' }}>
                              Dintel · luz {d.luz} mm
                            </div>
                            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] font-mono">
                              <span className="text-text-secondary">q_dintel</span>
                              <span className="text-right tabular-nums">{d.q_dintel.toFixed(1)} kN/m</span>
                              <span className="text-text-secondary">g_muro_sobre</span>
                              <span className="text-right tabular-nums">{d.g_propio.toFixed(2)} kN/m</span>
                              <span className="text-text-secondary">h_muro_sobre</span>
                              <span className="text-right tabular-nums">{d.h_muro_sobre.toFixed(0)} mm</span>
                              <span className="text-text-secondary">M_Ed</span>
                              <span className="text-right tabular-nums">{d.M_Ed.toFixed(2)} kN·m</span>
                              <span className="text-text-secondary">V_Ed</span>
                              <span className="text-right tabular-nums">{d.V_Ed.toFixed(1)} kN</span>
                              <span className="text-text-secondary">R apoyo</span>
                              <span className="text-right tabular-nums" style={{ color: 'var(--color-state-warn)' }}>
                                {d.R_apoyo.toFixed(1)} kN
                              </span>
                            </div>
                            <p className="text-[9px] text-text-disabled mt-1.5 leading-tight">
                              Reacciones aplicadas a los machones adyacentes
                            </p>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })}
            <div className="flex gap-1 mt-1">
              <button
                type="button"
                onClick={() => onAddHueco(selectedPlantaIdx, 'ventana')}
                className="flex-1 text-[11px] font-mono py-1.5 rounded border border-dashed border-border-main text-text-disabled hover:border-accent hover:text-accent cursor-pointer transition-colors"
              >
                + Ventana
              </button>
              <button
                type="button"
                onClick={() => onAddHueco(selectedPlantaIdx, 'puerta')}
                className="flex-1 text-[11px] font-mono py-1.5 rounded border border-dashed border-border-main text-text-disabled hover:border-accent hover:text-accent cursor-pointer transition-colors"
              >
                + Puerta
              </button>
            </div>
          </CollapsibleSection>
        </>
      )}
    </div>
  );
}
