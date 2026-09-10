/**
 * La lista de piezas del anejo, en dos secciones, ordenable.
 *
 * Reordenar tiene TRES entradas (D4), porque el orden manda sobre la
 * numeración del documento entregado y no puede depender de tener ratón:
 * botones de subir y bajar por fila (44 px), «Mover a…» con la posición
 * tecleada para listas largas (D5), y el arrastre por el asa como atajo de
 * ratón. Las cabeceras de sección son `sticky`, y como cada una vive en su
 * propia `<section>`, sólo se pega la de la sección en la que estás.
 *
 * Las filas cuentan su estado con texto, no sólo con color: «AL DÍA» /
 * «RECALCULAR» como badge inline, la fila sin PDF o culpable de un fallo en
 * rojo con el motivo en su sitio y una salida.
 */

import { useState, type DragEvent, type FormEvent } from 'react';
import { Check, ChevronDown, ChevronUp, Eye, GripVertical, PenLine, Trash2 } from 'lucide-react';
import { Link } from 'react-router';
import { getModuleByKey } from '../../data/moduleRegistry';
import type { EstadoPieza, Pieza } from '../../lib/anejo';
import { capituloDePieza, piezasDeSeccion, SECCIONES, seccionDePieza, type Seccion } from '../../lib/anejo/maqueta';
import { AnadirCalculo, VacioMemoria, VacioPiezas } from './EstadoVacio';
import type { EstadoGeneracion } from './useGenerarAnejo';

export interface ListaPiezasProps {
  piezas: readonly Pieza[];
  numeros: ReadonlyMap<string, number>;
  estados: ReadonlyMap<string, EstadoPieza>;
  /** Piezas cuyo PDF no está en esta máquina. */
  sinPdf: ReadonlySet<string>;
  generacion: EstadoGeneracion;
  /** Por qué NO se puede abrir cada pieza en su módulo; `null` si se puede. */
  noAbrible: (pieza: Pieza) => string | null;
  /** La que el módulo tiene abierta ahora mismo. */
  abierta: (pieza: Pieza) => boolean;
  onVerPdf: (pieza: Pieza) => void;
  onRenombrar: (pieza: Pieza, titulo: string) => void;
  /** Si abrirla pisaría un cálculo que no está guardado en ninguna pieza. */
  avisar: (pieza: Pieza) => boolean;
  onAbrir: (pieza: Pieza) => void;
  onIrAlModulo: (pieza: Pieza) => void;
  /** Mover la pieza a la posición (1 = la primera) dentro de su sección. */
  onMover: (pieza: Pieza, posicion: number) => void;
  onIncluir: (pieza: Pieza, incluida: boolean) => void;
  onQuitar: (pieza: Pieza) => void;
  /** «Generar sin esta pieza»: la deja fuera y vuelve a generar. */
  onGenerarSin: (pieza: Pieza) => void;
}

export function ListaPiezas(props: ListaPiezasProps) {
  const [arrastrando, setArrastrando] = useState<Pieza | null>(null);
  const [destino, setDestino] = useState<string | null>(null);

  const mismaSeccion = (a: Pieza, b: Pieza) => seccionDePieza(a) === seccionDePieza(b);

  const alEmpezar = (e: DragEvent<HTMLLIElement>, p: Pieza) => {
    setArrastrando(p);
    try {
      e.dataTransfer.effectAllowed = 'move';
      // Firefox no inicia el arrastre sin datos. jsdom no tiene dataTransfer.
      e.dataTransfer.setData('text/plain', p.id);
    } catch {
      /* sin dataTransfer: el estado de React basta */
    }
  };
  const alPasar = (e: DragEvent<HTMLLIElement>, p: Pieza) => {
    if (!arrastrando || arrastrando.id === p.id || !mismaSeccion(arrastrando, p)) return;
    e.preventDefault();
    if (destino !== p.id) setDestino(p.id);
  };
  const alSoltar = (e: DragEvent<HTMLLIElement>, p: Pieza) => {
    e.preventDefault();
    if (arrastrando && arrastrando.id !== p.id && mismaSeccion(arrastrando, p)) {
      const posicion = piezasDeSeccion(props.piezas, seccionDePieza(p)).findIndex((x) => x.id === p.id) + 1;
      props.onMover(arrastrando, posicion);
    }
    setArrastrando(null);
    setDestino(null);
  };
  const alTerminar = () => {
    setArrastrando(null);
    setDestino(null);
  };

  return (
    <div>
      {SECCIONES.map((s) => {
        const propias = piezasDeSeccion(props.piezas, s.id);
        return (
          <SeccionLista key={s.id} seccion={s} piezas={propias}>
            {propias.map((p, i) => (
              <FilaPieza
                key={p.id}
                pieza={p}
                posicion={i + 1}
                total={propias.length}
                numero={props.numeros.get(p.id) ?? null}
                estado={props.estados.get(p.id) ?? 'version-anterior'}
                faltaPdf={props.sinPdf.has(p.id)}
                error={props.generacion.fase === 'error' && props.generacion.piezaId === p.id ? props.generacion.mensaje : null}
                entrada={
                  props.generacion.fase === 'generando' && p.incluida ? (props.generacion.hechas.has(p.id) ? 'hecha' : 'pendiente') : null
                }
                arrastrada={arrastrando?.id === p.id}
                esDestino={destino === p.id}
                noAbrible={props.noAbrible(p)}
                abierta={props.abierta(p)}
                avisar={props.avisar(p)}
                onVerPdf={props.onVerPdf}
                onRenombrar={props.onRenombrar}
                onAbrir={props.onAbrir}
                onIrAlModulo={props.onIrAlModulo}
                onMover={props.onMover}
                onIncluir={props.onIncluir}
                onQuitar={props.onQuitar}
                onGenerarSin={props.onGenerarSin}
                onDragStart={alEmpezar}
                onDragOver={alPasar}
                onDrop={alSoltar}
                onDragEnd={alTerminar}
              />
            ))}
          </SeccionLista>
        );
      })}
      <AnadirCalculo />
    </div>
  );
}

function SeccionLista({ seccion, piezas, children }: { seccion: Seccion; piezas: readonly Pieza[]; children: React.ReactNode }) {
  const incluidas = piezas.filter((p) => p.incluida);
  const paginas = incluidas.reduce((s, p) => s + p.paginas, 0);
  const idCabecera = `anejo-seccion-${seccion.id}`;
  return (
    <section aria-labelledby={idCabecera}>
      <header className="sticky top-0 z-10 flex items-baseline justify-between gap-3 border-b border-border-sub bg-bg-primary px-3 pb-1.5 pt-3">
        <h2 id={idCabecera} className="m-0 text-[10px] font-semibold uppercase text-text-disabled" style={{ letterSpacing: '0.08em' }}>
          {seccion.rotulo}
        </h2>
        <span className="font-mono text-[11px] tabular-nums text-text-disabled">
          {piezas.length === 0
            ? 'sin piezas'
            : `${incluidas.length} de ${piezas.length} · ${paginas} ${paginas === 1 ? 'pág.' : 'págs.'}`}
        </span>
      </header>
      {piezas.length === 0 ? (
        seccion.id === 'memoria' ? (
          <VacioMemoria />
        ) : (
          <VacioPiezas />
        )
      ) : (
        <ol role="list" aria-label={seccion.rotulo} className="m-0 list-none p-0">
          {children}
        </ol>
      )}
    </section>
  );
}

const BOTON_FILA =
  'inline-flex items-center justify-center min-w-11 h-11 rounded text-text-disabled hover:text-text-primary focus-visible:text-text-primary disabled:opacity-30 disabled:hover:text-text-disabled transition-colors';
const BOTON_SALIDA = 'rounded border border-border-main bg-bg-primary px-2 py-0.5 text-[11.5px] text-text-primary hover:bg-bg-elevated transition-colors';
const ENLACE = 'text-accent hover:text-accent-hover underline-offset-2 hover:underline';

const INSIGNIA = 'inline-flex shrink-0 items-center gap-1.5 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold';

/**
 * La insignia de la fila. Ya no dice «AL DÍA», porque una pieza lleva su PDF y
 * sus datos juntos y no puede contradecirse a sí misma: decirlo en todas las
 * filas sería ruido. Sólo aparece cuando hay algo que contar.
 */
function Badge({ estado, abierta }: { estado: EstadoPieza; abierta: boolean }) {
  if (estado === 'version-anterior') {
    return (
      <span
        className={`${INSIGNIA} bg-state-warn/10 text-state-warn`}
        style={{ letterSpacing: '0.02em' }}
        title="Este cálculo se hizo con una versión anterior de Concreta. El módulo de hoy ya no sabe leer sus datos, así que no se puede abrir ni renombrar: si hace falta tocarlo, hay que rehacerlo."
      >
        VERSIÓN ANTERIOR
      </span>
    );
  }
  if (!abierta) return null;
  return (
    <span
      className={`${INSIGNIA} bg-accent/10 text-accent`}
      style={{ letterSpacing: '0.02em' }}
      title="Es la que tienes abierta en su módulo: al exportar desde ahí se actualiza este capítulo, no se añade otro."
    >
      ABIERTA
    </span>
  );
}

interface FilaPiezaProps {
  pieza: Pieza;
  /** Posición dentro de su sección, desde 1. */
  posicion: number;
  total: number;
  numero: number | null;
  estado: EstadoPieza;
  faltaPdf: boolean;
  error: string | null;
  entrada: 'pendiente' | 'hecha' | null;
  arrastrada: boolean;
  esDestino: boolean;
  /** Por qué NO se puede abrir en su módulo, o `null` si se puede. */
  noAbrible: string | null;
  /** Si es la que el módulo tiene abierta ahora. */
  abierta: boolean;
  onVerPdf: (pieza: Pieza) => void;
  onRenombrar: (pieza: Pieza, titulo: string) => void;
  /** Si abrirla pisaría un cálculo que no está guardado en ninguna pieza. */
  avisar: boolean;
  onAbrir: (pieza: Pieza) => void;
  /** Llevar al módulo SIN restaurar, para poder guardar lo que hay a medias. */
  onIrAlModulo: (pieza: Pieza) => void;
  onMover: (pieza: Pieza, posicion: number) => void;
  onIncluir: (pieza: Pieza, incluida: boolean) => void;
  onQuitar: (pieza: Pieza) => void;
  onGenerarSin: (pieza: Pieza) => void;
  onDragStart: (e: DragEvent<HTMLLIElement>, pieza: Pieza) => void;
  onDragOver: (e: DragEvent<HTMLLIElement>, pieza: Pieza) => void;
  onDrop: (e: DragEvent<HTMLLIElement>, pieza: Pieza) => void;
  onDragEnd: () => void;
}

function FilaPieza(f: FilaPiezaProps) {
  const { pieza } = f;
  const [moviendo, setMoviendo] = useState(false);
  const [posicionNueva, setPosicionNueva] = useState('');
  const [confirmandoQuitar, setConfirmandoQuitar] = useState(false);
  const [confirmandoAbrir, setConfirmandoAbrir] = useState(false);
  const [renombrando, setRenombrando] = useState<string | null>(null);
  const modulo = getModuleByKey(pieza.modulo);
  const roja = f.faltaPdf || f.error !== null;
  const fecha = new Date(pieza.ts);
  const fechaTexto = Number.isNaN(fecha.getTime()) ? '' : fecha.toLocaleDateString('es-ES');

  const confirmarMover = (e: FormEvent) => {
    e.preventDefault();
    const n = Number.parseInt(posicionNueva, 10);
    if (Number.isFinite(n)) f.onMover(pieza, n);
    setMoviendo(false);
    setPosicionNueva('');
  };

  return (
    <li
      role="listitem"
      aria-label={`${f.numero !== null ? `Capítulo ${f.numero}: ` : ''}${pieza.titulo}`}
      draggable
      onDragStart={(e) => f.onDragStart(e, pieza)}
      onDragOver={(e) => f.onDragOver(e, pieza)}
      onDrop={(e) => f.onDrop(e, pieza)}
      onDragEnd={f.onDragEnd}
      className={[
        // En estrecho los botones bajan a su propia línea. Son siete de 44 px:
        // en la misma fila que el título no dejan sitio ni para el nombre del
        // capítulo, que es lo único que de verdad hay que leer.
        'group grid grid-cols-[14px_28px_minmax(0,1fr)] sm:grid-cols-[14px_28px_minmax(0,1fr)_auto] items-center gap-x-2 border-b border-border-sub px-2 py-0.5 transition-colors',
        roja ? 'bg-state-fail/5' : f.esDestino ? 'bg-accent/5' : 'hover:bg-bg-elevated',
        f.arrastrada ? 'opacity-50' : '',
      ].join(' ')}
    >
      <span className="cursor-grab text-text-disabled" aria-hidden="true" title="Arrastrar para reordenar">
        <GripVertical size={14} />
      </span>
      <span className={['text-right font-mono text-[12px] tabular-nums', f.numero === null ? 'text-text-disabled' : 'text-text-secondary'].join(' ')}>
        {f.numero ?? '—'}
      </span>

      <div className="min-w-0 py-1">
        <div className="flex min-w-0 items-center gap-2">
          {f.noAbrible === null ? (
            <button
              type="button"
              onClick={() => (f.avisar ? setConfirmandoAbrir(true) : f.onAbrir(pieza))}
              title={`Abrir «${pieza.titulo}» en su módulo, con los datos con los que se calculó`}
              // Subrayado punteado en reposo: sin él el título se lee igual que
              // el de una pieza que NO se puede abrir, y la función entera
              // depende de que se descubra que ahí se pincha.
              className={[
                'truncate rounded text-left text-[13px] underline decoration-dotted decoration-text-disabled underline-offset-[3px]',
                'hover:decoration-solid hover:decoration-accent hover:text-accent transition-colors',
                pieza.incluida ? 'text-text-primary' : 'text-text-disabled',
              ].join(' ')}
            >
              {pieza.titulo}
            </button>
          ) : (
            <span
              title={f.noAbrible}
              className={['truncate text-[13px]', pieza.incluida ? 'text-text-primary' : 'text-text-disabled'].join(' ')}
            >
              {pieza.titulo}
            </span>
          )}
          <Badge estado={f.estado} abierta={f.abierta} />
          {f.entrada === 'hecha' && (
            <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[10px] text-state-ok">
              <Check size={12} aria-hidden="true" /> en el documento
            </span>
          )}
          {f.entrada === 'pendiente' && <span className="shrink-0 font-mono text-[10px] text-text-disabled">esperando…</span>}
        </div>
        <div className="truncate font-mono text-[11px] text-text-disabled">
          {capituloDePieza(pieza)} · {pieza.paginas} {pieza.paginas === 1 ? 'pág.' : 'págs.'}
          {fechaTexto && ` · ${fechaTexto}`}
        </div>

        {f.faltaPdf && (
          <p className="m-0 mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-state-fail">
            <span>Falta el PDF guardado: vuelve a guardarla desde el módulo.</span>
            {modulo && (
              <Link to={modulo.route} className={ENLACE}>
                Ir a {modulo.label}
              </Link>
            )}
            {pieza.incluida && (
              <button type="button" className={BOTON_SALIDA} onClick={() => f.onIncluir(pieza, false)}>
                Dejar fuera
              </button>
            )}
          </p>
        )}
        {f.error !== null && (
          <p className="m-0 mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-state-fail" role="alert">
            <span>{f.error}</span>
            <button type="button" className={BOTON_SALIDA} onClick={() => f.onGenerarSin(pieza)}>
              Generar sin esta pieza
            </button>
          </p>
        )}
        {moviendo && (
          <form className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-text-secondary" onSubmit={confirmarMover}>
            <label className="flex items-center gap-1.5">
              Mover a la posición
              <input
                type="number"
                min={1}
                max={f.total}
                value={posicionNueva}
                onChange={(e) => setPosicionNueva(e.target.value)}
                autoFocus
                aria-label={`Nueva posición de «${pieza.titulo}» (de 1 a ${f.total})`}
                className="w-14 rounded border border-border-main bg-bg-primary px-1.5 py-0.5 font-mono text-[12px] tabular-nums text-text-primary focus:border-accent focus:outline-none"
              />
              de {f.total}
            </label>
            <button type="submit" className={BOTON_SALIDA}>
              Mover
            </button>
            <button type="button" className="text-text-secondary hover:text-text-primary" onClick={() => setMoviendo(false)}>
              Cancelar
            </button>
          </form>
        )}
        {renombrando !== null && (
          <form
            className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-text-secondary"
            onSubmit={(e) => {
              e.preventDefault();
              const nuevo = renombrando.trim();
              setRenombrando(null);
              if (nuevo && nuevo !== pieza.titulo) f.onRenombrar(pieza, nuevo);
            }}
          >
            <label className="flex items-center gap-1.5">
              Nombre del capítulo
              <input
                autoFocus
                value={renombrando}
                onChange={(e) => setRenombrando(e.target.value)}
                aria-label={`Nombre del capítulo «${pieza.titulo}»`}
                className="w-56 rounded border border-border-main bg-bg-primary px-1.5 py-0.5 text-text-primary outline-none focus:border-accent"
              />
            </label>
            <button type="submit" className={BOTON_SALIDA} disabled={renombrando.trim().length === 0}>
              Renombrar
            </button>
            <button type="button" className="text-text-secondary hover:text-text-primary" onClick={() => setRenombrando(null)}>
              Cancelar
            </button>
            <span className="basis-full text-text-disabled">Cambia también el nombre que va arriba en el PDF.</span>
          </form>
        )}
        {confirmandoAbrir && (
          <p className="m-0 mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-text-secondary">
            <span>
              En {capituloDePieza(pieza)} tienes un cálculo que no está guardado en el anejo. Si abres «{pieza.titulo}», se pierde.
            </span>
            <button
              type="button"
              className={BOTON_SALIDA}
              onClick={() => {
                setConfirmandoAbrir(false);
                f.onIrAlModulo(pieza);
              }}
            >
              Ir a guardarlo primero
            </button>
            <button
              type="button"
              className={BOTON_SALIDA}
              onClick={() => {
                setConfirmandoAbrir(false);
                f.onAbrir(pieza);
              }}
            >
              Abrir igualmente
            </button>
            <button type="button" className="text-text-secondary hover:text-text-primary" onClick={() => setConfirmandoAbrir(false)}>
              Cancelar
            </button>
          </p>
        )}
        {confirmandoQuitar && (
          <p className="m-0 mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-text-secondary">
            <span>Quitar «{pieza.titulo}» del anejo y borrar su PDF guardado.</span>
            <button
              type="button"
              className={`${BOTON_SALIDA} text-state-fail`}
              onClick={() => {
                setConfirmandoQuitar(false);
                f.onQuitar(pieza);
              }}
            >
              Quitar
            </button>
            <button type="button" className="text-text-secondary hover:text-text-primary" onClick={() => setConfirmandoQuitar(false)}>
              Cancelar
            </button>
          </p>
        )}
      </div>

      <div className="col-span-3 flex items-center justify-end sm:col-span-1 sm:justify-start">
        <button type="button" className={BOTON_FILA} aria-label={`Subir «${pieza.titulo}»`} disabled={f.posicion === 1} onClick={() => f.onMover(pieza, f.posicion - 1)}>
          <ChevronUp size={14} aria-hidden="true" />
        </button>
        <button type="button" className={BOTON_FILA} aria-label={`Bajar «${pieza.titulo}»`} disabled={f.posicion === f.total} onClick={() => f.onMover(pieza, f.posicion + 1)}>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`${BOTON_FILA} px-1.5 font-mono text-[10px]`}
          aria-label={`Mover «${pieza.titulo}» a otra posición`}
          aria-expanded={moviendo}
          onClick={() => setMoviendo((v) => !v)}
        >
          Mover a…
        </button>
        <button
          type="button"
          className={BOTON_FILA}
          aria-label={`Ver el PDF de «${pieza.titulo}»`}
          title="Ver el PDF guardado, sin salir del anejo"
          disabled={f.faltaPdf}
          onClick={() => f.onVerPdf(pieza)}
        >
          <Eye size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={BOTON_FILA}
          aria-label={`Renombrar el capítulo «${pieza.titulo}»`}
          title={
            pieza.tituloEnPdf
              ? 'Cambiar el nombre del capítulo, también dentro del PDF'
              : 'Este PDF se exportó sin nombre, así que no tiene dónde escribirlo. Ábrelo en su módulo y vuelve a exportarlo.'
          }
          disabled={!pieza.tituloEnPdf}
          onClick={() => setRenombrando(pieza.titulo)}
        >
          <PenLine size={14} aria-hidden="true" />
        </button>
        <button type="button" className={BOTON_FILA} aria-label={`Quitar «${pieza.titulo}» del anejo`} onClick={() => setConfirmandoQuitar(true)}>
          <Trash2 size={14} aria-hidden="true" />
        </button>
        <label className="inline-flex h-11 w-11 cursor-pointer items-center justify-center">
          <input
            type="checkbox"
            checked={pieza.incluida}
            onChange={(e) => f.onIncluir(pieza, e.target.checked)}
            aria-label={`Incluir «${pieza.titulo}» en el anejo`}
            className="h-3.5 w-3.5 accent-[var(--color-accent)]"
          />
        </label>
      </div>
    </li>
  );
}
