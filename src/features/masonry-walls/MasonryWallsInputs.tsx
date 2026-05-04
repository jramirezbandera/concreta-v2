// Inputs panel para el módulo de muros de fábrica.
// Replica el diseño del prototipo: secciones colapsables (Fábrica, Muro
// global, Acciones ELU, Plantas, Forjado, Cargas puntuales, Huecos) con CRUD.

import { useEffect, useState } from 'react';
import { CollapsibleSection } from '../../components/ui/CollapsibleSection';
import {
  TABLA_4_4,
  FB_VALUES,
  FM_PARA_FB,
  CATEGORIA_LABELS,
  EJECUCION_LABELS,
  GAMMA_M_TABLA,
  findGammaMCell,
  lookupGammaM,
  resolverFabrica,
  eMin,
  detectarHuecosSolapados,
  type CategoriaControl,
  type ClaseEjecucion,
  type MasonryWallState,
  type Hueco,
  type Puntual,
  type PlantaResult,
} from '../../lib/calculations/masonryWalls';

interface NumFieldProps {
  label: string;
  sub?: string;
  /** Valor en las unidades de almacenamiento del state (mm para geometría). */
  value: number;
  unit?: string;
  /** Valor a mostrar = value · scale. Permite que el state guarde mm pero el
   *  usuario edite metros (scale=0.001) o cm (scale=0.1). El onChange devuelve
   *  el valor en unidades de almacenamiento (mm). Default 1 (sin conversión). */
  scale?: number;
  /** Decimales en el display. Default: 0 si scale=1, 2 si scale<1. */
  decimals?: number;
  onChange: (v: number) => void;
  refNorma?: string;
}

function NumField({ label, sub, value, unit, scale = 1, decimals, onChange, refNorma }: NumFieldProps) {
  // Cadena local controlada (mismo patrón que empresillado): permite estados
  // intermedios mientras el usuario escribe ("5.", "1.2"), y solo dispara
  // onChange cuando el valor parsea limpio. onBlur canonicaliza si quedó algo
  // inválido. useEffect sincroniza si el `value` cambia desde fuera.
  const initial = String(value * scale);
  const [localStr, setLocalStr] = useState<string>(initial);

  useEffect(() => {
    // Si el valor parseado coincide con el almacenado, no sobreescribir lo
    // que el usuario está tecleando (preserva "5." y "5.0" mientras escribe).
    const parsed = parseFloat(localStr);
    const storedFromLocal = isNaN(parsed) ? null : parsed / scale;
    if (storedFromLocal !== value) {
      setLocalStr(String(value * scale));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, scale]);

  void decimals;

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
            inputMode="decimal"
            value={localStr}
            onChange={(e) => {
              const raw = e.target.value;
              setLocalStr(raw); // siempre actualiza el display
              const n = parseFloat(raw);
              if (!isNaN(n)) onChange(n / scale);
              // Si raw es '', '-', '5.' (parseFloat=5, no NaN) etc., no
              // hacemos nada con el state mientras tanto.
            }}
            onBlur={() => {
              const n = parseFloat(localStr);
              if (isNaN(n)) setLocalStr(String(value * scale));
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

  // Hint "caso de ejemplo": cuando los parámetros globales del muro siguen en
  // los valores por defecto (L=6m, t=24cm, 4 plantas, γM=2.5), asumimos que el
  // usuario aún no ha tocado nada y se lo recordamos. Tocar cualquiera de
  // estos campos oculta el hint sin necesidad de un flag persistente.
  const isPristine =
    state.L === 6000 &&
    state.t === 240 &&
    state.plantas.length === 4 &&
    state.gamma_M === 2.5;

  return (
    <div className="px-4 py-3 min-w-0">
      {isPristine && (
        <div className="mb-2 rounded border border-accent/25 bg-accent/5 px-2 py-1.5 text-[11px] text-text-secondary leading-snug">
          <span className="font-mono text-accent text-[10px] uppercase mr-1.5" style={{ letterSpacing: '0.07em' }}>
            Caso de ejemplo
          </span>
          Edita los inputs para tu caso real. El veredicto se actualiza al instante.
        </div>
      )}
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
        {/* γM selector según CTE Tabla 4.8 — categoría de control × clase de
            ejecución. La UI detecta si el γM actual coincide con una celda y
            preselecciona; si el usuario teclea un valor distinto, modo "Pers."
            queda activo y se preserva el valor exacto. */}
        {(() => {
          const cell = findGammaMCell(state.gamma_M);
          const isCustom = cell == null;
          return (
            <>
              <SelField<string>
                label="γM categoría · ejec."
                value={isCustom ? 'custom' : `${cell.cat}-${cell.ejec}`}
                onChange={(v) => {
                  if (v === 'custom') return; // user has to type a number to enter custom mode
                  const [c, e] = (v as string).split('-') as [CategoriaControl, ClaseEjecucion];
                  set('gamma_M', lookupGammaM(c, e));
                }}
                options={[
                  ...(['I', 'II', 'III'] as CategoriaControl[]).flatMap((c) =>
                    (['A', 'B'] as ClaseEjecucion[]).map((e) => ({
                      value: `${c}-${e}`,
                      label: `Cat. ${c} · ej. ${e} (γM=${GAMMA_M_TABLA[c][e]})`,
                    })),
                  ),
                  { value: 'custom', label: 'Personalizado…' },
                ]}
                refNorma="§4.6.7 · Tabla 4.8"
              />
              <NumField
                label="γM"
                sub={cell ? `${CATEGORIA_LABELS[cell.cat].split(' — ')[0]} · ${EJECUCION_LABELS[cell.ejec].split(' — ')[0]}` : 'personalizado'}
                value={state.gamma_M}
                unit=""
                onChange={(v) => set('gamma_M', v)}
              />
            </>
          );
        })()}

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
        <NumField label="L" sub="longitud" value={state.L} unit="m"  scale={0.001} decimals={2}
          onChange={(v) => set('L', v)} />
        <NumField label="t" sub="espesor"  value={state.t} unit="cm" scale={0.1}   decimals={1}
          onChange={(v) => set('t', v)} />
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
            // Cuando el state es inválido (t=0, fk=null, etc.) plantasCalc
            // es []. Sin guard, plantasCalc[i] es undefined y .machones peta.
            const cs = plantasCalc[i];
            const eMax = cs ? Math.max(...cs.machones.map((m) => m.etaMax)) : 0;
            const stCol = !cs
              ? 'var(--color-text-disabled)'
              : eMax >= 1 ? 'var(--color-state-fail)' : eMax >= 0.8 ? 'var(--color-state-warn)' : 'var(--color-state-ok)';
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
                    {cs ? `${(eMax * 100).toFixed(0)}%` : '—'}
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
            <NumField label="H"   sub="altura libre"  value={plantaSel.H}       unit="m"    scale={0.001} decimals={2}
              onChange={(v) => setPlanta(selectedPlantaIdx, 'H', v)} />
            <NumField label="q_G" sub="permanente Gk" value={plantaSel.q_G}     unit="kN/m"
              onChange={(v) => setPlanta(selectedPlantaIdx, 'q_G', v)} />
            <NumField label="q_Q" sub="variable Qk"   value={plantaSel.q_Q}     unit="kN/m"
              onChange={(v) => setPlanta(selectedPlantaIdx, 'q_Q', v)} />
            <NumField label="a"   sub="apoyo"         value={plantaSel.a_apoyo} unit="cm"   scale={0.1}   decimals={1}
              onChange={(v) => setPlanta(selectedPlantaIdx, 'a_apoyo', v)} />
            <NumField label="e_a" sub="penetración"   value={plantaSel.e_apoyo} unit="cm"   scale={0.1}   decimals={1}
              onChange={(v) => setPlanta(selectedPlantaIdx, 'e_apoyo', v)} />
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
                <NumField label="x"   sub="pos."          value={p.x}       unit="m"  scale={0.001} decimals={2}
                  onChange={(v) => setPuntual(selectedPlantaIdx, p.id, 'x', v)} />
                <NumField label="P_G" sub="permanente Gk" value={p.P_G}     unit="kN"
                  onChange={(v) => setPuntual(selectedPlantaIdx, p.id, 'P_G', v)} />
                <NumField label="P_Q" sub="variable Qk"   value={p.P_Q}     unit="kN"
                  onChange={(v) => setPuntual(selectedPlantaIdx, p.id, 'P_Q', v)} />
                <NumField label="b"   sub="apoyo"         value={p.b_apoyo} unit="cm" scale={0.1}   decimals={1}
                  onChange={(v) => setPuntual(selectedPlantaIdx, p.id, 'b_apoyo', v)} />
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
            {/* Warning si dos huecos se solapan: el motor mergea su unión en
                un solo intervalo, así que el cálculo es estable, pero el
                usuario no se da cuenta de que su modelo es ambiguo. */}
            {(() => {
              const pares = detectarHuecosSolapados(plantaSel.huecos);
              if (pares.length === 0) return null;
              const idShort = (id: string) => id.slice(-4);
              return (
                <div className="rounded border border-state-warn/60 bg-state-warn/5 px-2 py-1.5 mb-2 text-[10px] font-mono text-state-warn leading-tight flex gap-2">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5" aria-hidden="true">
                    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <div>
                    Huecos solapados (el motor calcula su unión como un único hueco):
                    <ul className="mt-1 ml-3 list-disc">
                      {pares.map((p, i) => (
                        <li key={i}>{idShort(p.a)} ↔ {idShort(p.b)}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              );
            })()}
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
                      <NumField label="x" sub="pos." value={h.x} unit="m" scale={0.001} decimals={2}
                        onChange={(v) => setHueco(selectedPlantaIdx, h.id, 'x', v)} />
                      {h.tipo === 'ventana' && (
                        <NumField label="y" sub="alféizar" value={h.y} unit="m" scale={0.001} decimals={2}
                          onChange={(v) => setHueco(selectedPlantaIdx, h.id, 'y', v)} />
                      )}
                      <NumField label="w" sub="ancho" value={h.w} unit="m" scale={0.001} decimals={2}
                        onChange={(v) => setHueco(selectedPlantaIdx, h.id, 'w', v)} />
                      {h.tipo === 'ventana' && (
                        <NumField label="h" sub="alto" value={h.h} unit="m" scale={0.001} decimals={2}
                          onChange={(v) => setHueco(selectedPlantaIdx, h.id, 'h', v)} />
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
