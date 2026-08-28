// Editor de plantas y cargas — el cuadro grande del art. 3.2.
//
// ─────────────────────────────────────────────────────────────────────────────
// POR QUÉ SALE DEL PANEL LATERAL
// ─────────────────────────────────────────────────────────────────────────────
// La primera versión metía las plantas en la barra de la izquierda, 288 px de
// ancho, con una tarjeta por planta y dentro de cada tarjeta una fila por
// componente de carga: el desplegable de categoría, la q, la fracción y el
// botón de incluir/excluir, todo en línea. En un edificio de diez plantas eso
// son cuarenta filas de cuatro controles en 288 px: el desplegable se corta a
// «Permanei», la fracción y el peso se pelean por el mismo hueco y no hay forma
// de ver dos plantas a la vez para compararlas.
//
// Aquí el ancho deja de ser el problema y aparece lo que en la barra no cabía:
//
//   · el ALZADO, que es como se lee un edificio. Cada planta es una banda a su
//     altura real y con una barra proporcional a su peso sísmico: de un vistazo
//     se ve dónde está la masa y si alguna cota se ha ido.
//   · el DESGLOSE del peso a la vista —Σ q·fracción, por el área, igual a P—,
//     que es el mismo número que sube al cortante basal y ahora se puede seguir
//     con el dedo.
//   · dos acciones que en la barra no cabían y que son la mitad del trabajo
//     real: duplicar una planta y copiar sus cargas a las demás. Un edificio de
//     viviendas son diez plantas iguales.
//
// Los cambios se guardan según se teclean —como en todo el módulo—, así que no
// hay «aceptar» ni «cancelar»: cerrar es sólo cerrar.

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Layers, Plus, Trash2, X } from 'lucide-react';
import { FRACCION_MASA } from '../../lib/codes/seismic/ncse02';
import type { CategoriaMasa } from '../../lib/codes/seismic/types';
import { Campo, NumIn, SELECT_CLS } from './campos';
import { dec } from './formato';
import {
  newId,
  pesoDePlanta,
  pesoSismicoTotal,
  type PlantaUI,
  type SeismicState,
} from './state';

const CATEGORIAS: { v: CategoriaMasa; t: string }[] = [
  { v: 'permanente', t: 'Permanente' },
  { v: 'tabiqueria', t: 'Tabiquería' },
  { v: 'uso-residencial', t: 'Uso · residencial' },
  { v: 'uso-publico', t: 'Uso · público' },
  { v: 'uso-aglomeracion', t: 'Uso · aglomeración' },
  { v: 'uso-almacen', t: 'Uso · almacén' },
  { v: 'nieve-persistente', t: 'Nieve persistente' },
  { v: 'agua', t: 'Agua' },
];

/** Altura en píxeles de la banda de una planta: su dh, con suelo y techo. */
const ALTO_BANDA = (dh: number) => Math.round(Math.min(84, Math.max(34, dh * 12)));

// ── Alzado ───────────────────────────────────────────────────────────────────

/**
 * El edificio, planta a planta y cada una a su altura.
 *
 * Botones de verdad y no un `<svg>` con `onClick`: esto es un control de
 * entrada, y con botones se tabula, se enfoca y se lee con lector de pantalla
 * sin escribir nada a mano. La banda de cada planta va desde la cota de la de
 * debajo hasta la suya, que es la altura FÍSICA de esa planta.
 */
function Alzado({
  plantas,
  pesos,
  sotanos,
  selId,
  onSelect,
}: {
  plantas: PlantaUI[];
  pesos: Map<string, number>;
  sotanos: number;
  selId: string | null;
  onSelect: (id: string) => void;
}) {
  // Ordenadas por altura, que es el orden en que se mira un edificio. El array
  // del estado NO tiene por qué estarlo —el motor las ordena por su cuenta— y
  // dibujarlo tal cual pone la cubierta en medio en cuanto se edita una cota.
  const bandas = useMemo(() => {
    const orden = [...plantas].sort((a, b) => a.h - b.h);
    return orden.map((p, k) => ({ p, dh: p.h - (k === 0 ? 0 : orden[k - 1].h) }));
  }, [plantas]);

  const Pmax = Math.max(1, ...bandas.map((b) => pesos.get(b.p.id) ?? 0));

  return (
    <div className="pt-3 pb-2 px-2">
      {[...bandas].reverse().map(({ p, dh }) => {
        const P = pesos.get(p.id) ?? 0;
        const sel = p.id === selId;
        // dh <= 0 significa que esta planta no queda por encima de la anterior.
        // El motor las ordena y sigue calculando, así que el dato roto no lo
        // delata ningún número. Aquí sí se ve.
        const malaCota = dh <= 0;
        return (
          <div key={p.id} className="flex items-stretch" style={{ height: `${ALTO_BANDA(dh)}px` }}>
            <div className="w-11 shrink-0 relative">
              <span className="absolute right-1.5 top-0 -translate-y-1/2 text-[9px] font-mono text-text-disabled">
                {dec(p.h, 2)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onSelect(p.id)}
              aria-pressed={sel}
              aria-label={`${p.nombre}: cota ${dec(p.h, 2)} m, peso ${dec(P, 0)} kN`}
              title={
                malaCota
                  ? 'Esta planta no queda por encima de la de debajo: revisa su cota h'
                  : undefined
              }
              className={[
                'relative flex-1 min-w-0 border-t text-left overflow-hidden cursor-pointer transition-colors',
                sel ? 'border-accent' : 'border-border-main hover:border-accent/40',
              ].join(' ')}
              style={{
                background: sel ? 'var(--color-tint-accent)' : 'transparent',
                borderLeft: sel ? '2px solid var(--color-accent)' : '2px solid transparent',
              }}
            >
              {/* La barra ES el peso: proporcional a P y con el mismo origen. */}
              <span
                aria-hidden="true"
                className="absolute left-0 bottom-0 top-px pointer-events-none"
                style={{
                  width: `${(P / Pmax) * 100}%`,
                  background: sel
                    ? 'color-mix(in srgb, var(--color-accent) 22%, transparent)'
                    : 'color-mix(in srgb, var(--color-accent) 9%, transparent)',
                }}
              />
              <span className="relative flex items-center justify-between h-full gap-2 px-2">
                <span
                  className={[
                    'truncate text-[11px]',
                    sel ? 'text-text-primary' : 'text-text-secondary',
                  ].join(' ')}
                >
                  {malaCota ? <span className="text-state-warn">⚠ </span> : null}
                  {p.nombre}
                </span>
                <span className="shrink-0 text-[10px] font-mono text-text-disabled">
                  {dec(P, 0)} kN
                </span>
              </span>
            </button>
          </div>
        );
      })}

      {/* Rasante */}
      <div className="flex items-stretch">
        <div className="w-11 shrink-0 relative">
          <span className="absolute right-1.5 top-0 -translate-y-1/2 text-[9px] font-mono text-text-disabled">
            0,00
          </span>
        </div>
        <div className="flex-1 border-t-2 border-border-main">
          <div
            className="h-2.5"
            style={{
              backgroundImage:
                'repeating-linear-gradient(45deg, var(--color-border-main) 0 1px, transparent 1px 5px)',
            }}
          />
        </div>
      </div>

      {/*
        Los sótanos se dibujan pero no se editan: no aportan masa a la cadena de
        fuerzas —la tabla son las plantas SOBRE rasante— y su único papel es
        contar para el `n total` de la pasarela del art. 3.5.1. Verlos ahí evita
        la pregunta de por qué no aparecen.
      */}
      {Array.from({ length: Math.max(0, Math.trunc(sotanos)) }).map((_, i) => (
        <div key={i} className="flex items-stretch mt-1">
          <div className="w-11 shrink-0" />
          <div className="flex-1 h-7 border border-dashed border-border-sub rounded-sm flex items-center px-2">
            <span className="text-[10px] text-text-disabled truncate">Sótano {i + 1}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Cuadro ───────────────────────────────────────────────────────────────────

export function PlantasModal({
  state,
  setState,
  onClose,
}: {
  state: SeismicState;
  setState: (fn: (s: SeismicState) => SeismicState) => void;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [selId, setSelId] = useState<string | null>(state.plantas[0]?.id ?? null);
  /** Confirmación en dos pasos de «copiar a las demás», que sí machaca datos. */
  const [confirmarCopia, setConfirmarCopia] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  // Escape cierra, el scroll del fondo se bloquea y el foco vuelve al botón que
  // abrió el cuadro. Mismo contrato que ConfirmDialog y PdfPreviewModal.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const disparador = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      disparador?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pesos = useMemo(
    () => new Map(state.plantas.map((p) => [p.id, pesoDePlanta(p)])),
    [state.plantas],
  );
  const sumaP = useMemo(() => pesoSismicoTotal(state), [state]);

  // La selección se sigue por ID y NO por posición: duplicar, borrar o mover una
  // cota reordena el alzado, y con un índice se acabaría editando una planta
  // distinta de la que está resaltada.
  const sel = state.plantas.find((p) => p.id === selId) ?? state.plantas[0] ?? null;

  const cambiar = (id: string, fn: (p: PlantaUI) => PlantaUI) =>
    setState((s) => ({ ...s, plantas: s.plantas.map((p) => (p.id === id ? fn(p) : p)) }));

  /** dh de la planta más alta, para que la nueva herede el mismo entrepiso. */
  const dhArriba = () => {
    const orden = [...state.plantas].sort((a, b) => a.h - b.h);
    const n = orden.length;
    if (n === 0) return 3;
    const dh = n === 1 ? orden[0].h : orden[n - 1].h - orden[n - 2].h;
    return dh > 0 ? dh : 3;
  };

  const anadir = () => {
    const arriba = [...state.plantas].sort((a, b) => a.h - b.h).pop();
    const nueva: PlantaUI = {
      ...(arriba ?? { h: 0, area: 100, componentes: [], P: 0, pesoManual: false }),
      componentes: (arriba?.componentes ?? []).map((c) => ({ ...c })),
      id: newId(),
      nombre: `Planta ${state.plantas.length + 1}`,
      h: (arriba?.h ?? 0) + dhArriba(),
    };
    // `n` no se toca aquí: sale de contar `plantas`. Actualizarlo a mano en el
    // botón de añadir —y no en el de borrar— era la mitad de la
    // desincronización que hacía saltar la pasarela del art. 3.5.1.
    setState((s) => ({ ...s, plantas: [...s.plantas, nueva] }));
    setSelId(nueva.id);
    setAviso(null);
  };

  const duplicar = () => {
    if (!sel) return;
    // La copia va ENCIMA DEL EDIFICIO, no encima de la planta seleccionada:
    // aquí las cotas son absolutas, y duplicar una planta intermedia a `h + dh`
    // la deja en la misma cota que la que ya estaba ahí. Dos plantas a la misma
    // altura calculan —el motor las ordena y sigue— pero no significan nada.
    const hMax = state.plantas.reduce((a, p) => Math.max(a, p.h), 0);
    const copia: PlantaUI = {
      ...sel,
      componentes: (sel.componentes ?? []).map((c) => ({ ...c })),
      id: newId(),
      nombre: `Planta ${state.plantas.length + 1}`,
      h: hMax + dhArriba(),
    };
    setState((s) => ({ ...s, plantas: [...s.plantas, copia] }));
    setSelId(copia.id);
    setAviso(null);
  };

  const borrar = (id: string) => {
    // La selección salta a la vecina de abajo, o a la de arriba si no la hay:
    // quedarse sin planta seleccionada vacía el panel derecho y obliga a volver
    // a pinchar para seguir trabajando.
    const orden = [...state.plantas].sort((a, b) => a.h - b.h);
    const k = orden.findIndex((p) => p.id === id);
    const vecina = orden[k - 1] ?? orden[k + 1] ?? null;
    setState((s) => ({ ...s, plantas: s.plantas.filter((p) => p.id !== id) }));
    setSelId(vecina?.id ?? null);
    setAviso(null);
  };

  /**
   * Copiar la definición de peso de la planta seleccionada al resto.
   *
   * Va ENTERA —modo, área, componentes y P— y no sólo los componentes: copiar
   * las cargas a una planta que tiene el peso metido a mano en kN no cambiaría
   * nada, y el botón quedaría sin efecto sobre media tabla sin decir por qué.
   */
  const copiarATodas = () => {
    if (!sel) return;
    const n = state.plantas.length - 1;
    setState((s) => ({
      ...s,
      plantas: s.plantas.map((p) =>
        p.id === sel.id
          ? p
          : {
              ...p,
              pesoManual: sel.pesoManual,
              P: sel.P,
              area: sel.area,
              componentes: (sel.componentes ?? []).map((c) => ({ ...c })),
            },
      ),
    }));
    setConfirmarCopia(false);
    setAviso(`Cargas de ${sel.nombre} copiadas a ${n} planta${n === 1 ? '' : 's'}.`);
  };

  const componentes = sel?.componentes ?? [];
  const sumaQ = componentes.reduce(
    (a, c) => a + (c.excluida ? 0 : FRACCION_MASA[c.categoria] * c.q),
    0,
  );
  const Psel = sel ? (pesos.get(sel.id) ?? 0) : 0;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-2 sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="plantas-modal-heading"
        onClick={(e) => e.stopPropagation()}
        className="bg-bg-surface rounded-lg shadow-2xl border border-border-main w-full max-w-5xl h-[90vh] max-h-[860px] flex flex-col outline-none"
      >
        {/* Cabecera */}
        <div className="flex items-center gap-3 px-4 sm:px-5 py-3 border-b border-border-main shrink-0">
          <Layers size={16} className="text-text-secondary shrink-0" aria-hidden="true" />
          <span
            id="plantas-modal-heading"
            className="text-sm font-medium text-text-primary shrink-0"
          >
            Plantas y cargas
          </span>
          <span className="text-[11px] font-mono text-text-disabled shrink-0 max-sm:hidden">
            art. 3.2
          </span>
          <div className="flex-1" />
          <span className="text-[11px] text-text-disabled shrink-0 max-sm:hidden">
            {state.plantas.length} planta{state.plantas.length === 1 ? '' : 's'}
          </span>
          <span className="text-[11px] font-mono text-accent shrink-0">Σ P = {dec(sumaP, 0)} kN</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1.5 rounded hover:bg-bg-elevated text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          {/* Alzado */}
          <div className="lg:w-64 shrink-0 flex flex-col min-h-0 border-b lg:border-b-0 lg:border-r border-border-main">
            <div className="flex items-baseline justify-between px-3 pt-3 shrink-0">
              <span className="text-[10px] uppercase tracking-[0.07em] text-text-disabled">
                Alzado
              </span>
              <span className="text-[9px] text-text-disabled">barra ∝ P</span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto scroll-hide max-lg:max-h-52">
              <Alzado
                plantas={state.plantas}
                pesos={pesos}
                sotanos={state.sotanos}
                selId={sel?.id ?? null}
                onSelect={(id) => {
                  setSelId(id);
                  setConfirmarCopia(false);
                  setAviso(null);
                }}
              />
            </div>
            <div className="shrink-0 px-3 py-2.5 border-t border-border-sub">
              <button
                type="button"
                onClick={anadir}
                className="w-full flex items-center justify-center gap-1.5 text-[11px] py-1.5 rounded border border-dashed border-border-main text-text-disabled hover:border-accent hover:text-accent transition-colors cursor-pointer"
              >
                <Plus size={12} aria-hidden="true" />+ planta
              </button>
              {state.sotanos > 0 ? (
                <p className="mt-2 text-[9px] leading-snug text-text-disabled">
                  Los sótanos no aportan masa: sólo cuentan para el{' '}
                  <span className="font-mono">n total</span> del art. 3.5.1.
                </p>
              ) : null}
            </div>
          </div>

          {/* Detalle de la planta seleccionada */}
          <div className="flex-1 min-w-0 overflow-y-auto scroll-hide px-4 sm:px-5 py-4">
            {!sel ? (
              <p className="text-[12px] text-text-secondary">
                No queda ninguna planta. Añade la primera con «+ planta».
              </p>
            ) : (
              <div className="space-y-4">
                <div className="flex items-end gap-3 flex-wrap">
                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                    <label
                      htmlFor="planta-nombre"
                      className="text-[10px] uppercase tracking-[0.07em] text-text-disabled"
                    >
                      Planta
                    </label>
                    <input
                      id="planta-nombre"
                      type="text"
                      value={sel.nombre}
                      onChange={(e) => cambiar(sel.id, (x) => ({ ...x, nombre: e.target.value }))}
                      aria-label="Nombre de la planta"
                      className="w-full min-w-0 bg-bg-primary border border-border-main rounded px-2 py-1 text-[13px] text-text-primary outline-none hover:border-accent/40 focus:border-accent transition-colors"
                    />
                  </div>
                  {/* Ni la cota, ni la superficie, ni el peso admiten negativos:
                      no son casos límite, son datos rotos que el motor propaga
                      sin quejarse hasta el cortante basal. */}
                  <Campo
                    label="h"
                    sub="cota sobre rasante"
                    unit="m"
                    value={sel.h}
                    min={0}
                    onChange={(v) => cambiar(sel.id, (x) => ({ ...x, h: v }))}
                  />
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-[0.07em] text-text-disabled">
                      P · peso sísmico
                    </span>
                    <span className="text-[15px] font-mono text-accent tabular-nums py-0.5">
                      {dec(Psel, 0)} kN
                    </span>
                  </div>
                </div>

                {/* Cómo se define el peso de esta planta */}
                <div className="flex items-center gap-1.5">
                  {[
                    { manual: false, t: 'Área × cargas' },
                    { manual: true, t: 'Peso directo en kN' },
                  ].map((o) => (
                    <button
                      key={o.t}
                      type="button"
                      onClick={() => cambiar(sel.id, (x) => ({ ...x, pesoManual: o.manual }))}
                      aria-pressed={sel.pesoManual === o.manual}
                      className={[
                        'px-2.5 py-1 text-[11px] rounded border transition-colors cursor-pointer',
                        sel.pesoManual === o.manual
                          ? 'border-accent text-text-primary bg-bg-elevated'
                          : 'border-border-main text-text-disabled hover:border-accent/40',
                      ].join(' ')}
                    >
                      {o.t}
                    </button>
                  ))}
                </div>

                {sel.pesoManual ? (
                  <Campo
                    label="P"
                    sub="peso sísmico de la planta"
                    unit="kN"
                    value={sel.P ?? 0}
                    min={0}
                    onChange={(v) => cambiar(sel.id, (x) => ({ ...x, P: v }))}
                    ancho="w-28"
                  />
                ) : (
                  <div className="space-y-3">
                    <Campo
                      label="Área"
                      sub="superficie en planta"
                      unit="m²"
                      value={sel.area ?? 0}
                      min={0}
                      onChange={(v) => cambiar(sel.id, (x) => ({ ...x, area: v }))}
                      ancho="w-28"
                    />

                    {/*
                      La fracción del art. 3.2 NO es el psi_2 del CTE. Se
                      reutiliza la taxonomía de categorías de uso, no sus
                      valores: psi gobierna la COMBINACIÓN de acciones y la
                      fracción gobierna qué parte de la sobrecarga es MASA.
                      Aplicar 0,5·Q en las dos es el error natural, y no lo
                      delata ningún número raro.
                    */}
                    <p className="text-[10px] leading-snug text-text-disabled border border-border-sub rounded px-2.5 py-2">
                      La fracción es la del <span className="font-mono">art. 3.2</span> y decide qué
                      parte de la sobrecarga es{' '}
                      <strong className="text-text-secondary">masa</strong>. No es el{' '}
                      <span className="font-mono">ψ₂</span> del CTE, que gobierna la gravedad
                      concomitante del art. 3.4 y entra entera.
                    </p>

                    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto_auto_auto] items-center gap-x-2 gap-y-1.5">
                      <span className="text-[9px] uppercase tracking-[0.07em] text-text-disabled">
                        Componente
                      </span>
                      <span className="text-[9px] uppercase tracking-[0.07em] text-text-disabled text-right">
                        q · kN/m²
                      </span>
                      <span className="text-[9px] uppercase tracking-[0.07em] text-text-disabled text-center">
                        fracc.
                      </span>
                      <span className="text-[9px] uppercase tracking-[0.07em] text-text-disabled text-right">
                        q · fracc.
                      </span>
                      <span aria-hidden="true" />
                      <span aria-hidden="true" />

                      {componentes.map((c, j) => (
                        <Fragment key={j}>
                          <select
                            value={c.categoria}
                            onChange={(e) =>
                              cambiar(sel.id, (x) => ({
                                ...x,
                                componentes: (x.componentes ?? []).map((y, m) =>
                                  m === j ? { ...y, categoria: e.target.value as CategoriaMasa } : y,
                                ),
                              }))
                            }
                            className={`${SELECT_CLS} w-full min-w-0`}
                            aria-label={`Categoría del componente ${j + 1}`}
                          >
                            {CATEGORIAS.map((o) => (
                              <option key={o.v} value={o.v}>
                                {o.t}
                              </option>
                            ))}
                          </select>
                          <NumIn
                            value={c.q}
                            min={0}
                            ancho="w-16"
                            etiqueta={`Carga del componente ${j + 1} en kN/m²`}
                            onChange={(n) =>
                              cambiar(sel.id, (x) => ({
                                ...x,
                                componentes: (x.componentes ?? []).map((y, m) =>
                                  m === j ? { ...y, q: n } : y,
                                ),
                              }))
                            }
                          />
                          <span className="text-[10px] text-text-disabled font-mono text-center">
                            ×{dec(FRACCION_MASA[c.categoria], 1)}
                          </span>
                          <span
                            className={[
                              'w-14 text-right text-[11px] font-mono tabular-nums',
                              c.excluida
                                ? 'text-text-disabled line-through'
                                : 'text-text-secondary',
                            ].join(' ')}
                          >
                            {dec(FRACCION_MASA[c.categoria] * c.q, 2)}
                          </span>
                          {/*
                            La exclusión es POR PLANTA y es una decisión
                            declarada: el art. 3.2 sólo cuenta las sobrecargas
                            "siempre que tengan un efecto desfavorable". El PDF
                            la recoge como declaración del proyectista, no como
                            cálculo.
                          */}
                          <button
                            type="button"
                            onClick={() =>
                              cambiar(sel.id, (x) => ({
                                ...x,
                                componentes: (x.componentes ?? []).map((y, m) =>
                                  m === j ? { ...y, excluida: !y.excluida } : y,
                                ),
                              }))
                            }
                            title={
                              c.excluida
                                ? 'Excluida por el proyectista: no aporta masa'
                                : 'Incluida en la masa sísmica'
                            }
                            aria-label={`Componente ${j + 1}: ${c.excluida ? 'excluida' : 'incluida'}`}
                            className={[
                              'px-1.5 py-1 text-[10px] rounded border transition-colors cursor-pointer',
                              c.excluida
                                ? 'border-state-warn text-state-warn'
                                : 'border-border-main text-text-disabled hover:border-accent/40',
                            ].join(' ')}
                          >
                            {c.excluida ? 'excl.' : 'incl.'}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              cambiar(sel.id, (x) => ({
                                ...x,
                                componentes: (x.componentes ?? []).filter((_, m) => m !== j),
                              }))
                            }
                            aria-label={`Quitar componente ${j + 1}`}
                            className="p-1 rounded text-text-disabled hover:text-state-fail transition-colors cursor-pointer"
                          >
                            <X size={12} aria-hidden="true" />
                          </button>
                        </Fragment>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        cambiar(sel.id, (x) => ({
                          ...x,
                          componentes: [...(x.componentes ?? []), { categoria: 'permanente', q: 0 }],
                        }))
                      }
                      className="text-[11px] text-text-disabled hover:text-accent transition-colors cursor-pointer"
                    >
                      + componente
                    </button>

                    {/* El peso, con el cálculo a la vista: el número que sale al
                        alzado y el que sube al cortante basal es este mismo. */}
                    <div className="border-t border-border-sub pt-2.5 text-[11px] font-mono tabular-nums text-text-secondary">
                      Σ q·fracc. = {dec(sumaQ, 2)} kN/m²
                      <span className="text-text-disabled"> × {dec(sel.area ?? 0, 0)} m² = </span>
                      <span className="text-accent">{dec(Psel, 0)} kN</span>
                    </div>
                  </div>
                )}

                {/* Acciones sobre la planta */}
                <div className="border-t border-border-sub pt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={duplicar}
                    title={`Añade una planta encima del edificio con los mismos datos que ${sel.nombre}`}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] rounded border border-border-main text-text-secondary hover:border-accent/40 hover:text-text-primary transition-colors cursor-pointer"
                  >
                    <Copy size={12} aria-hidden="true" />
                    Duplicar
                  </button>
                  {state.plantas.length > 1 ? (
                    confirmarCopia ? (
                      <button
                        type="button"
                        onClick={copiarATodas}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] rounded border border-state-warn text-state-warn transition-colors cursor-pointer"
                      >
                        Sobrescribir las {state.plantas.length - 1} restantes
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmarCopia(true)}
                        title="Copia el área y las cargas de esta planta a todas las demás"
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] rounded border border-border-main text-text-secondary hover:border-accent/40 hover:text-text-primary transition-colors cursor-pointer"
                      >
                        <Layers size={12} aria-hidden="true" />
                        Copiar cargas a las demás
                      </button>
                    )
                  ) : null}
                  <div className="flex-1" />
                  <button
                    type="button"
                    onClick={() => borrar(sel.id)}
                    aria-label={`Eliminar ${sel.nombre}`}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] rounded border border-border-main text-text-disabled hover:border-state-fail hover:text-state-fail transition-colors cursor-pointer"
                  >
                    <Trash2 size={12} aria-hidden="true" />
                    Eliminar planta
                  </button>
                </div>

                {aviso ? (
                  <p className="text-[10px] text-text-disabled" role="status">
                    {aviso}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </div>

        {/* Pie */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-t border-border-main shrink-0">
          <span className="text-[10px] text-text-disabled truncate">
            Los cambios se guardan según se escriben.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded text-sm text-accent transition-all cursor-pointer"
            style={{
              border: '1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)',
              background: 'color-mix(in srgb, var(--color-accent) 6%, transparent)',
            }}
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}
