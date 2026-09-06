// Editor de la geometría en planta — dimensiones, planos resistentes y rigideces.
//
// ─────────────────────────────────────────────────────────────────────────────
// POR QUÉ SALE DEL PANEL LATERAL, Y POR QUÉ CAMBIA LA CONVENCIÓN DE ENTRADA
// ─────────────────────────────────────────────────────────────────────────────
// Mismo argumento que las plantas (ver PlantasModal.tsx): en 288 px la lista de
// planos era una tabla ciega de números. Pero aquí había un problema peor que el
// ancho: la coordenada se pedía CON SIGNO respecto al centro, que es la
// convención del motor (la de γ_a, art. 3.7.5) y no la de nadie que mide un
// plano. Un proyectista mide desde la fachada; el signo respecto al centro lo
// tenía que calcular de cabeza, y un signo cambiado no lo delata ningún número
// —sale un γ_a y a correr—.
//
// En este cuadro la coordenada se teclea DESDE EL BORDE (0 en la fachada
// izquierda o inferior, según la dirección) y el signo respecto al centro es un
// derivado que se enseña al lado. El estado no cambia: sigue guardando la
// coordenada firmada, que es lo que piden el motor, el enlace compartido y el
// PDF. Sólo cambia la pregunta que se le hace al usuario.
//
// La planta dibujada al lado es la misma `PlantaSVG` de la pantalla y reacciona
// tecla a tecla: la comprobación de "¿está el plano donde yo creo?" deja de ser
// mental.
//
// Los cambios se guardan según se teclean —como en todo el módulo—, así que no
// hay «aceptar» ni «cancelar»: cerrar es sólo cerrar (y dejar los planos en su orden
// de planta, ver `ordenar`).

import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Ruler, X } from 'lucide-react';
import { HelpTooltip } from '../../components/ui/HelpTooltip';
import { useContainerWidth } from '../../hooks/useContainerWidth';
import type { ElementoResistente } from '../../lib/codes/seismic/types';
import { Campo, NumIn } from './campos';
import { dec, pct } from './formato';
import { PlantaSVG } from './SeismicSVG';
import {
  excentricidadDe,
  newId,
  ordenarElementos,
  type DireccionUI,
  type SeismicEvaluation,
  type SeismicState,
} from './state';

/**
 * Borde ↔ centro sin ruido flotante.
 *
 * La conversión es una resta y una suma con L/2, y en IEEE `(b − h) + h` no
 * siempre devuelve `b`: sin redondeo, teclear «0,1» dejaba en el campo
 * «0,10000000000000053» bajo el cursor, porque `useCampoNumerico` resincroniza
 * cuando lo tecleado no ES el valor. Seis decimales están varios órdenes por
 * debajo de lo que significa un metro medido en obra.
 */
const redondear = (v: number) => Math.round(v * 1e6) / 1e6;
const aBorde = (x: number, Lperp: number) => redondear(x + Lperp / 2);
const aCentro = (borde: number, Lperp: number) => redondear(borde - Lperp / 2);

/** `x = -7,50 m`, el derivado que mantiene a la vista la convención del motor. */
const rotuloCentro = (x: number) => `x = ${dec(x, 2)} m`;

export function GeometriaModal({
  state,
  setState,
  evaluacion,
  onClose,
}: {
  state: SeismicState;
  setState: (fn: (s: SeismicState) => SeismicState) => void;
  evaluacion: SeismicEvaluation;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [eje, setEje] = useState<'x' | 'y'>('x');
  /** Nº de planos del generador. Vive aquí: no es un dato del edificio. */
  const [nGen, setNGen] = useState(4);
  /** Confirmación en dos pasos del reparto uniforme, que sí machaca la lista. */
  const [confirmarReparto, setConfirmarReparto] = useState(false);

  /**
   * Los planos se ordenan por su posición cuando el foco SALE de la tabla y al
   * cerrar; nunca tecla a tecla. Así el número de cada plano es su orden en
   * planta —lo que espera quien los llama «pórtico 1, 2, 3»— sin que la fila
   * salte bajo el cursor a mitad de escribir «15».
   */
  const ordenar = useCallback(
    () =>
      setState((s) => {
        const d = s[eje];
        const elementos = ordenarElementos(d.elementos);
        return elementos === d.elementos ? s : { ...s, [eje]: { ...d, elementos } };
      }),
    [setState, eje],
  );
  const cerrar = useCallback(() => {
    ordenar();
    onClose();
  }, [ordenar, onClose]);

  // Escape cierra, el scroll del fondo se bloquea y el foco vuelve al botón que
  // abrió el cuadro. Mismo contrato que PlantasModal y ConfirmDialog.
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
      if (e.key === 'Escape') cerrar();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cerrar]);

  const [lienzoRef, anchoLienzo] = useContainerWidth();
  const anchoSvg =
    anchoLienzo && anchoLienzo > 0 ? Math.max(240, Math.min(460, anchoLienzo - 8)) : 380;

  const dir = state[eje];
  const otro = eje === 'x' ? 'y' : 'x';
  /** Los planos de esta dirección se reparten sobre la dimensión PERPENDICULAR. */
  const Lperp = state[otro].L;
  const E = eje.toUpperCase();
  const bordeNombre = eje === 'x' ? 'inferior' : 'izquierdo';

  const setDir = (fn: (d: DireccionUI) => DireccionUI) =>
    setState((s) => ({ ...s, [eje]: fn(s[eje]) }));

  const cambiarElemento = (i: number, fn: (el: ElementoResistente) => ElementoResistente) =>
    setDir((d) => ({ ...d, elementos: d.elementos.map((el, m) => (m === i ? fn(el) : el)) }));

  const anadir = () => {
    // El plano nuevo continúa la crujía: se coloca a un vano del último (el
    // último en el sentido de la medición, no el último tecleado), y si eso se
    // sale del edificio, en el propio borde. Nacer en x = 0 —el centro— ponía
    // el plano nuevo encima de uno existente en cualquier planta simétrica.
    const bordes = dir.elementos.map((el) => aBorde(el.x, Lperp)).sort((a, b) => a - b);
    const n = bordes.length;
    const vano = n >= 2 ? bordes[n - 1] - bordes[n - 2] : Lperp / 2 || 5;
    const borde = n === 0 ? 0 : Math.min(redondear(bordes[n - 1] + vano), Lperp);
    setDir((d) => ({
      ...d,
      elementos: [...d.elementos, { id: newId(), x: aCentro(borde, Lperp), k: 1 }],
    }));
    setConfirmarReparto(false);
  };

  const quitar = (i: number) => {
    setDir((d) => ({ ...d, elementos: d.elementos.filter((_, m) => m !== i) }));
    setConfirmarReparto(false);
  };

  /**
   * n planos a vanos iguales, de fachada a fachada. Es el pórtico regular que
   * es el 90 % de los casos, y con él la lista entera se teclea en un número.
   */
  const repartir = () => {
    const n = Math.max(1, Math.trunc(nGen));
    const elementos: ElementoResistente[] = Array.from({ length: n }, (_, i) => ({
      id: newId(),
      x: aCentro(n === 1 ? Lperp / 2 : (i * Lperp) / (n - 1), Lperp),
      k: 1,
    }));
    setDir((d) => ({ ...d, elementos }));
    setConfirmarReparto(false);
  };

  // La excentricidad del requisito (6), en vivo y con la dimensión CRUZADA: los
  // planos de X se reparten sobre el eje Y, así que su excentricidad se mide
  // contra L de la dirección Y. Ver `excentricidadDe`.
  const exc = excentricidadDe(dir, Lperp);
  const excRel = exc && exc.dimension > 0 ? exc.e / exc.dimension : null;
  const Le = evaluacion.resultado?.[eje].Le;

  // Vanos entre planos consecutivos, EN EL ORDEN DE LA PLANTA. La tabla sólo
  // se ordena al salir de ella (ver `ordenar`): mientras se teclea puede ir
  // desordenada, así que la lectura ordenada se calcula aquí aparte.
  const bordes = dir.elementos.map((el) => aBorde(el.x, Lperp)).sort((a, b) => a - b);
  const vanos = bordes.slice(1).map((b, i) => redondear(b - bordes[i]));

  const kUniforme = dir.elementos.length > 0 && dir.elementos.every((el) => el.k === dir.elementos[0].k);

  /** B sólo pinta en las expresiones (3) y (5) del art. 3.7.2.2. */
  const usaB = state.sistema === 'porticos-ha-pantallas' || state.sistema === 'acero-triangulado';

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-2 sm:p-4"
      onClick={cerrar}
      role="presentation"
    >
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="geometria-modal-heading"
        onClick={(e) => e.stopPropagation()}
        className="bg-bg-surface rounded-lg shadow-2xl border border-border-main w-full max-w-5xl h-[90vh] max-h-[860px] flex flex-col outline-none"
      >
        {/* Cabecera */}
        <div className="flex items-center gap-3 px-4 sm:px-5 py-3 border-b border-border-main shrink-0">
          <Ruler size={16} className="text-text-secondary shrink-0" aria-hidden="true" />
          <span
            id="geometria-modal-heading"
            className="text-sm font-medium text-text-primary shrink-0"
          >
            Geometría en planta
          </span>
          <span className="text-[11px] font-mono text-text-disabled shrink-0 max-sm:hidden">
            art. 3.5.1 (6) · 3.7.5
          </span>
          <div className="flex-1" />
          <span className="text-[11px] font-mono text-accent shrink-0">
            {dec(state.x.L, 2)} × {dec(state.y.L, 2)} m
          </span>
          <button
            type="button"
            onClick={cerrar}
            aria-label="Cerrar"
            className="p-1.5 rounded hover:bg-bg-elevated text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          {/* La planta, en vivo */}
          <div className="lg:w-[480px] shrink-0 flex flex-col min-h-0 border-b lg:border-b-0 lg:border-r border-border-main">
            {/*
              `my-auto` centra el dibujo en la altura sobrante del cuadro (fija,
              90vh): sin él la planta quedaba pegada arriba con medio panel de
              vacío debajo. Cuando no cabe, los márgenes colapsan a 0 y el
              contenedor hace scroll desde arriba, que es el comportamiento
              correcto. El wrapper conserva `w-full` porque de su ancho se mide
              el tamaño del SVG.
            */}
            <div className="flex-1 min-h-0 overflow-y-auto scroll-hide flex flex-col px-3 pt-3 max-lg:max-h-72">
              <div ref={lienzoRef} className="w-full my-auto pb-3">
                <PlantaSVG state={state} evaluacion={evaluacion} eje={eje} width={anchoSvg} />
              </div>
            </div>
            {/*
              Las dimensiones viven bajo el dibujo y no en la columna de la
              dirección: L_X y L_Y son de la PLANTA, no de un sismo. Repartirlas
              por dirección era lo que dejaba que L_X = 20 conviviera con unos
              planos de Y repartidos sobre 15.
            */}
            <div className="shrink-0 px-4 py-3 border-t border-border-sub flex items-end gap-3 flex-wrap">
              <Campo
                label="L_X"
                sub="dimensión en X"
                help="Dimensión del edificio en planta según el eje X, en metros. Interviene en la estimación de T_F (art. 3.7.2.2) y da la referencia del requisito de excentricidad del sismo en Y."
                unit="m"
                value={state.x.L}
                min={0}
                onChange={(v) => setState((s) => ({ ...s, x: { ...s.x, L: v } }))}
              />
              <Campo
                label="L_Y"
                sub="dimensión en Y"
                help="Dimensión del edificio en planta según el eje Y, en metros. Interviene en la estimación de T_F (art. 3.7.2.2) y da la referencia del requisito de excentricidad del sismo en X."
                unit="m"
                value={state.y.L}
                min={0}
                onChange={(v) => setState((s) => ({ ...s, y: { ...s.y, L: v } }))}
              />
              <p className="text-[9px] leading-snug text-text-disabled flex-1 min-w-40 pb-0.5">
                El centro de masas se toma en el centro geométrico: las coordenadas de los planos se
                miden desde las fachadas.
              </p>
            </div>
          </div>

          {/* Los planos de la dirección elegida */}
          <div className="flex-1 min-w-0 overflow-y-auto scroll-hide px-4 sm:px-5 py-4">
            <div className="space-y-4">
              {/* Qué sismo se está resistiendo */}
              <div className="flex items-center gap-1.5">
                {(['x', 'y'] as const).map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => {
                      setEje(e);
                      setConfirmarReparto(false);
                    }}
                    aria-pressed={eje === e}
                    className={[
                      'px-2.5 py-1 text-[11px] rounded border transition-colors cursor-pointer',
                      eje === e
                        ? 'border-accent text-text-primary bg-bg-elevated'
                        : 'border-border-main text-text-disabled hover:border-accent/40',
                    ].join(' ')}
                  >
                    Sismo en {e.toUpperCase()}
                  </button>
                ))}
              </div>

              {/* Nota de contexto en texto plano: una caja con borde aquí es una
                  tarjeta decorativa (DESIGN.md), y compite con la tabla. */}
              <p className="text-[10px] leading-snug text-text-disabled">
                Los planos que resisten el sismo en <span className="font-mono">{E}</span> se
                reparten a lo largo del otro eje: su posición se mide{' '}
                <strong className="text-text-secondary">desde el borde {bordeNombre}</strong> de la
                planta, de 0 a {dec(Lperp, 2)} m. Con todas las rigideces iguales el reparto es{' '}
                <span className="font-mono">F_k / nº de planos</span>: dar rigideces es una mejora
                opcional.
              </p>

              {/* La tabla de planos. Se ordena cuando el foco se va FUERA de
                  ella (a otro campo, a una pestaña, al lienzo), no al pasar de
                  la posición a la rigidez de la misma fila. */}
              <div
                className="grid grid-cols-[1rem_auto_auto_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1.5"
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) ordenar();
                }}
              >
                <span aria-hidden="true" />
                <span className="text-[9px] uppercase tracking-[0.07em] text-text-disabled">
                  desde el borde {bordeNombre}
                </span>
                {/*
                  «Rigidez» a secas dejaba al usuario preguntándose en qué
                  unidades va. La respuesta —en ninguna, sólo cuentan las
                  proporciones— es exactamente lo que cuenta el tooltip.
                */}
                <span className="flex items-center gap-1 text-[9px] uppercase tracking-[0.07em] text-text-disabled">
                  k · rigidez relativa
                  <HelpTooltip
                    text="Rigidez lateral relativa del plano, SIN unidades: sólo importan las proporciones entre planos. Con todas iguales (1) el reparto es uniforme; un plano el doble de rígido que otro se lleva el doble de fuerza (antes del término de torsión γ_a). Si conoces las rigideces reales, vale cualquier medida proporcional — E·I/h³, kN/m por plano…"
                    refText="art. 3.7.5"
                    fieldLabel="k, rigidez relativa"
                  />
                </span>
                <span className="text-[9px] uppercase tracking-[0.07em] text-text-disabled text-right">
                  respecto al centro
                </span>
                <span aria-hidden="true" />

                {dir.elementos.map((el, i) => {
                  const fuera = Math.abs(el.x) > Lperp / 2 + 1e-6;
                  return (
                    <div key={el.id} className="contents">
                      <span className="text-[10px] text-text-disabled font-mono">{i + 1}</span>
                      <div className="flex items-center gap-1">
                        <NumIn
                          value={aBorde(el.x, Lperp)}
                          ancho="w-18"
                          etiqueta={`Plano ${i + 1}: posición desde el borde ${bordeNombre}, en metros`}
                          onChange={(n) => cambiarElemento(i, (x) => ({ ...x, x: aCentro(n, Lperp) }))}
                        />
                        <span className="text-[9px] text-text-disabled font-mono">m</span>
                      </div>
                      <NumIn
                        value={el.k}
                        min={0}
                        ancho="w-14"
                        etiqueta={`Rigidez relativa del plano ${i + 1}`}
                        onChange={(n) => cambiarElemento(i, (x) => ({ ...x, k: n }))}
                      />
                      {/*
                        El derivado con signo se queda a la vista: es la
                        convención del motor, del PDF y de la Norma, y quien
                        venga de la forma antigua la reconoce aquí.
                      */}
                      <span
                        className={[
                          'text-right text-[10px] font-mono tabular-nums truncate',
                          fuera ? 'text-state-fail' : 'text-text-disabled',
                        ].join(' ')}
                        title={
                          fuera
                            ? 'Este plano cae fuera de la planta: revisa su posición'
                            : 'Coordenada firmada respecto al centro, la del art. 3.7.5'
                        }
                      >
                        {fuera ? '⚠ ' : ''}
                        {rotuloCentro(el.x)}
                      </span>
                      <button
                        type="button"
                        onClick={() => quitar(i)}
                        aria-label={`Quitar el plano ${i + 1}`}
                        className="p-1 rounded text-text-disabled hover:text-state-fail transition-colors cursor-pointer"
                      >
                        <X size={12} aria-hidden="true" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {dir.elementos.length === 0 ? (
                <p className="text-[11px] text-text-secondary">
                  Sin planos no hay reparto ni excentricidad que comprobar: el requisito (6) queda
                  en manos de la declaración.
                </p>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={anadir}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] rounded border border-dashed border-border-main text-text-disabled hover:border-accent hover:text-accent transition-colors cursor-pointer"
                >
                  {/* El icono YA es el «+»: repetirlo en el texto pintaba «+ + plano». */}
                  <Plus size={12} aria-hidden="true" />
                  Añadir plano
                </button>
                <div className="flex items-center gap-1.5 ml-auto">
                  {/* El número sin rótulo era una caja huérfana flotando junto al botón. */}
                  <span className="text-[9px] uppercase tracking-[0.07em] text-text-disabled">
                    planos
                  </span>
                  <NumIn
                    value={nGen}
                    min={1}
                    ancho="w-10"
                    etiqueta="Número de planos a repartir uniformemente"
                    onChange={(n) => {
                      setNGen(n);
                      setConfirmarReparto(false);
                    }}
                  />
                  {confirmarReparto && dir.elementos.length > 0 ? (
                    <button
                      type="button"
                      onClick={repartir}
                      className="px-2.5 py-1.5 text-[11px] rounded border border-state-warn text-state-warn transition-colors cursor-pointer"
                    >
                      Sustituir los {dir.elementos.length} actuales
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        dir.elementos.length > 0 ? setConfirmarReparto(true) : repartir()
                      }
                      title="Planos a vanos iguales, de fachada a fachada, con rigidez 1"
                      className="px-2.5 py-1.5 text-[11px] rounded border border-border-main text-text-secondary hover:border-accent/40 hover:text-text-primary transition-colors cursor-pointer"
                    >
                      Repartir uniformemente
                    </button>
                  )}
                </div>
              </div>

              {/* Lo que se deduce de la lista, en vivo. El separador rotulado es
                  el mismo que parte los bloques del panel lateral: decides
                  arriba, se deduce debajo. */}
              <div>
                <div className="flex items-center gap-2 pb-1.5" aria-hidden="true">
                  <div className="h-px flex-1 bg-border-sub" />
                  <span className="text-[9px] uppercase tracking-[0.09em] text-text-disabled">
                    se deduce
                  </span>
                  <div className="h-px flex-1 bg-border-sub" />
                </div>
                <div className="space-y-1 text-[11px] font-mono tabular-nums">
                  {vanos.length > 0 ? (
                    <div className="text-text-secondary">
                      vanos: {vanos.map((v) => dec(v, 2)).join(' · ')} m
                    </div>
                  ) : null}
                  {/*
                    La excentricidad ES el requisito (6) y por eso se enseña aquí,
                    donde se está moviendo lo que la produce, y no sólo en el
                    bloque de aplicabilidad tres pantallas más abajo.
                  */}
                  {exc && excRel !== null ? (
                    <div
                      className={excRel > 0.1 ? 'text-state-fail' : 'text-text-secondary'}
                      title={`Requisito (6) del art. 3.5.1: excentricidad del centro de rigidez inferior al 10 % de la dimensión en planta L_${otro.toUpperCase()}`}
                    >
                      e = {dec(exc.e, 2)} m · {pct(excRel)} de L_{otro.toUpperCase()}{' '}
                      <span className="text-text-disabled">· límite 10 %</span>
                    </div>
                  ) : null}
                  {Le !== undefined ? (
                    <div className="text-text-disabled">
                      L_e = {dec(Le, 2)} m · {kUniforme ? 'reparto uniforme (k iguales)' : 'rigideces distintas'}
                    </div>
                  ) : null}
                </div>
              </div>

              {/*
                B sólo existe en las expresiones (3) y (5) de T_F —pórticos de HA
                con pantallas y acero triangulado—. Para cualquier otro sistema
                no afecta a NADA, y un campo que no afecta a nada no se pregunta:
                era la fuente directa del «no sé en qué influye esto». Aparece
                solo al elegir uno de esos dos sistemas, y al final del panel
                porque delante de la tabla parecía un dato más de la planta.
              */}
              {usaB ? (
                <div className="border-t border-border-sub pt-3">
                  <Campo
                    label={`B_${E}`}
                    sub={
                      state.sistema === 'acero-triangulado'
                        ? 'ancho de los planos triangulados'
                        : 'ancho de las pantallas'
                    }
                    help={`Dimensión en planta, en metros y medida en el sentido de la oscilación, de ${
                      state.sistema === 'acero-triangulado'
                        ? 'los planos triangulados'
                        : 'las pantallas rigidizadoras'
                    } que arriostran esta dirección. Sólo interviene en la estimación del período T_F con este sistema (art. 3.7.2.2): a más B, edificio más rígido y T_F más corto. No cambia el reparto de fuerzas entre planos.`}
                    unit="m"
                    value={dir.B}
                    min={0}
                    onChange={(v) => setDir((d) => ({ ...d, B: v }))}
                  />
                  <p className="mt-1.5 text-[9px] leading-snug text-text-disabled">
                    Sólo afecta al T_F estimado en {E} con el sistema «
                    {state.sistema === 'acero-triangulado'
                      ? 'Acero triangulado'
                      : 'Pórticos de HA con pantallas'}
                    ». Cero si no hay.
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
