/**
 * La pantalla del anejo de cálculo (`/proyecto/anejo`, design doc F6).
 *
 * Aquí no se calcula nada: se ORDENA lo que los módulos ya guardaron con
 * «Guardar en el anejo» y se monta el PDF. Lista en dos secciones —memoria
 * justificativa y cálculos de pieza—, numeración derivada del orden, estado
 * «al día / recalcular» por pieza, y un panel a la derecha con lo que va a
 * salir (capítulos, páginas, portada) antes de generar nada. Los datos de la
 * portada son los de la obra y se editan en Datos de obra, no aquí.
 *
 * Generar: progreso fila a fila y la página sin bloquear; si algo falla, la
 * fila culpable se pone en rojo con su motivo y una salida («Generar sin esta
 * pieza»). El índice se verifica contra las páginas reales antes de entregar
 * nada (`lib/anejo/generar`, T8): se aborta antes que entregar un índice mal.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { FileDown } from 'lucide-react';
import { useDrawer } from '../../components/layout/AppShell';
import { Topbar } from '../../components/layout/Topbar';
import { showToast } from '../../components/ui/Toast';
import {
  estadoDePieza,
  fijarIncluida,
  hayTrabajoSinGuardar,
  motivoDeNoAbrir,
  piezaAbierta,
  renombrarPieza,
  piezasSinPdf,
  quitarPieza,
  reordenarPiezas,
  restaurarPieza,
  type FalloRenombrar,
  type FalloRestaurar,
  rutaDeModulo,
  type EstadoPieza,
  type Pieza,
} from '../../lib/anejo';
import { moverEnSeccion, numerosDeCapitulo, piezasDeSeccion, resumenDe, seccionDePieza } from '../../lib/anejo/maqueta';
import { useAnejo } from '../../lib/anejo/useAnejo';
import { leerBlob } from '../../lib/anejo/blobs';
import { descargarBlob } from '../../lib/export/descargar';
import { titledFilename } from '../../lib/export/filename';
import { leerObra } from '../../lib/obra';
import { pestanaDesfasada } from '../../lib/proyecto';
import { useNombreObra, useProyectoActivo } from '../../lib/proyecto/useProyectoActivo';
import { ListaPiezas } from './ListaPiezas';
import { PdfPreviewModal } from '../../components/ui/PdfPreviewModal';
import { PanelResumen } from './PanelResumen';
import { useGenerarAnejo } from './useGenerarAnejo';

const SIN_SITIO = 'No se pudo guardar el cambio. Libera espacio en el navegador.';
const DESFASADA = 'Otra pestaña ha cambiado de obra. Recarga antes de generar.';
const DESFASADA_CAMBIO = 'Otra pestaña ha cambiado de obra: esta ya no guarda cambios. Recárgala.';

/**
 * Por qué no se pudo escribir el índice. Con la pestaña desfasada la app deja
 * de escribir las claves de la obra a propósito (`vigilarPestanaDesfasada`), y
 * decir «libera espacio» ahí sería mentir sobre la causa.
 */
const motivoDeNoGuardar = () => (pestanaDesfasada() ? DESFASADA_CAMBIO : SIN_SITIO);

/** El nombre con el que se descarga el PDF de una pieza suelta desde el visor. */
const nombreDeFichero = (pieza: Pieza) => titledFilename(pieza.titulo, 'capitulo-del-anejo.pdf');

/** Por qué una pieza no se puede abrir en su módulo, dicho en lenguaje de obra. */
const NO_ABRIBLE: Record<'desconocido' | 'esquema' | 'sin-datos', string> = {
  desconocido: 'Es de un módulo que esta versión de Concreta no tiene.',
  esquema: 'Se calculó con una versión anterior de Concreta, y el módulo de hoy ya no sabe leer sus datos.',
  'sin-datos': 'Se guardó antes de que las piezas llevaran sus datos dentro: de ésta sólo queda el PDF.',
};

/** Por qué no se ha podido renombrar el capítulo, en lenguaje de obra. */
function motivoDeNoRenombrar(motivo: FalloRenombrar): string {
  switch (motivo) {
    case 'desfasada':
      return DESFASADA_CAMBIO;
    case 'sin-pieza':
      return 'Esa pieza ya no está en el anejo.';
    case 'sin-pdf':
      return 'El PDF de esa pieza no está en esta máquina: ábrela en su módulo y vuelve a exportarla.';
    case 'sitio':
    case 'almacen':
      return 'No hay sitio para guardar el PDF renombrado. Libera espacio en el navegador.';
    case 'vacio':
      return 'El capítulo tiene que tener nombre.';
    case 'no-cabe':
      return 'El nombre anterior es demasiado largo para sustituirlo dentro del PDF sin dejar rastro. Ábrela en su módulo y vuelve a exportarla.';
    default:
      // 'sin-banda' y 'sin-marca': el PDF no tiene dónde escribir el nombre.
      return 'Ese PDF se exportó sin nombre, así que no tiene dónde escribirlo. Ábrelo en su módulo y vuelve a exportarlo.';
  }
}

/** Y por qué no se ha podido abrir cuando ya se había intentado. */
function motivoDeNoRestaurar(motivo: FalloRestaurar): string {
  switch (motivo) {
    case 'desfasada':
      return DESFASADA_CAMBIO;
    case 'sitio':
      return 'No hay sitio para abrir la pieza. Libera espacio en el navegador.';
    case 'sin-pieza':
      return 'Esa pieza ya no está en el anejo.';
    default:
      return NO_ABRIBLE[motivo];
  }
}

function BotonGenerar({ ocupado, motivoBloqueo, onClick }: { ocupado: boolean; motivoBloqueo: string | null; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={motivoBloqueo !== null}
      title={motivoBloqueo ?? 'Montar el PDF del anejo: portada, índice y las piezas marcadas'}
      aria-label="Generar anejo"
      className="inline-flex items-center gap-1.5 rounded border border-accent/45 bg-accent/12 px-3 py-1.5 text-[12px] font-semibold text-accent transition-colors hover:border-accent/60 hover:bg-accent/20 disabled:opacity-40 disabled:hover:border-accent/45 disabled:hover:bg-accent/12"
    >
      {ocupado ? (
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-hidden="true" />
      ) : (
        <FileDown size={14} aria-hidden="true" />
      )}
      <span className="hidden sm:inline">{ocupado ? 'Generando…' : 'Generar anejo'}</span>
    </button>
  );
}

export function AnejoModule() {
  const { openDrawer } = useDrawer();
  const navegar = useNavigate();
  const anejo = useAnejo();
  const nombreObra = useNombreObra();
  const { desfasada } = useProyectoActivo();
  const obra = leerObra();
  const [sinPdf, setSinPdf] = useState<ReadonlySet<string>>(() => new Set());
  const [anuncio, setAnuncio] = useState('');
  const [viendo, setViendo] = useState<{ pieza: Pieza; url: string; blob: Blob } | null>(null);
  const generacion = useGenerarAnejo();

  // Las piezas cuyo PDF no está en esta máquina (obra traída de otra, datos
  // del sitio borrados): fila roja con la salida. Se vuelve a mirar cada vez
  // que el índice cambia.
  useEffect(() => {
    let vivo = true;
    piezasSinPdf(anejo)
      .then((s) => {
        if (vivo) setSinPdf(s);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [anejo]);

  const estados: ReadonlyMap<string, EstadoPieza> = new Map(anejo.piezas.map((p) => [p.id, estadoDePieza(p)]));
  const numeros = numerosDeCapitulo(anejo.piezas);
  const resumen = resumenDe(anejo.piezas);
  const deVersionAnterior = anejo.piezas.filter((p) => p.incluida && estados.get(p.id) === 'version-anterior').length;
  const generando = generacion.estado.fase === 'generando';

  const motivoBloqueo = generando
    ? 'Generando el anejo…'
    : resumen.capitulos === 0
      ? 'Nada que generar: marca al menos una pieza para incluir.'
      : desfasada
        ? DESFASADA
        : null;

  const mover = (pieza: Pieza, posicion: number) => {
    const orden = moverEnSeccion(anejo.piezas, pieza.id, posicion);
    if (!orden) return;
    if (!reordenarPiezas(orden)) {
      showToast(motivoDeNoGuardar(), { autoDismiss: 5000 });
      return;
    }
    const propias = piezasDeSeccion(anejo.piezas, seccionDePieza(pieza));
    const destino = Math.min(Math.max(Math.trunc(posicion), 1), propias.length);
    setAnuncio(`«${pieza.titulo}» movida a la posición ${destino} de ${propias.length}`);
  };

  const incluir = (pieza: Pieza, incluida: boolean) => {
    if (!fijarIncluida(pieza.id, incluida)) showToast(motivoDeNoGuardar(), { autoDismiss: 5000 });
  };

  const quitar = async (pieza: Pieza) => {
    if (await quitarPieza(pieza.id)) {
      showToast(`«${pieza.titulo}» quitada del anejo`, { autoDismiss: 3000 });
      setAnuncio(`«${pieza.titulo}» quitada del anejo`);
    } else {
      showToast(pestanaDesfasada() ? DESFASADA_CAMBIO : 'No se pudo quitar la pieza del anejo.', { autoDismiss: 5000 });
    }
  };

  // Abrir una pieza en su módulo. Los capítulos de MEMORIA no restauran nada:
  // son uno por obra y el módulo ya es su sitio, así que llevar allí es todo lo
  // que hay que hacer —y así abrirlos no puede echar atrás trabajo posterior.
  const abrir = (pieza: Pieza) => {
    if (seccionDePieza(pieza) === 'memoria') return irAlModulo(pieza);
    const r = restaurarPieza(pieza.id);
    if (!r.ok) {
      showToast(motivoDeNoRestaurar(r.motivo), { autoDismiss: 6000 });
      return;
    }
    setAnuncio(`«${pieza.titulo}» abierta en su módulo`);
    navegar(r.ruta);
  };

  const irAlModulo = (pieza: Pieza) => {
    const ruta = rutaDeModulo(pieza.modulo);
    if (ruta === null) {
      showToast('Esa pieza es de un módulo que esta versión de Concreta no tiene.', { autoDismiss: 5000 });
      return;
    }
    navegar(ruta);
  };

  /**
   * Por qué no se puede abrir, en lenguaje de obra; `null` si se puede. Un
   * capítulo de memoria se abre siempre: lleva a su módulo sin restaurar nada,
   * y para eso no hacen falta ni datos ni que el esquema cuadre.
   */
  const noAbrible = (pieza: Pieza): string | null => {
    if (rutaDeModulo(pieza.modulo) === null) return NO_ABRIBLE.desconocido;
    if (seccionDePieza(pieza) === 'memoria') return null;
    const motivo = motivoDeNoAbrir(pieza);
    return motivo === null ? null : NO_ABRIBLE[motivo];
  };

  const renombrar = async (pieza: Pieza, titulo: string) => {
    const r = await renombrarPieza(pieza.id, titulo);
    if (r.ok) {
      showToast(`Capítulo renombrado: «${r.pieza.titulo}»`, { autoDismiss: 3000 });
      setAnuncio(`«${pieza.titulo}» renombrada a «${r.pieza.titulo}»`);
      return;
    }
    showToast(motivoDeNoRenombrar(r.motivo), { autoDismiss: 6000 });
  };

  // El PDF guardado, en el mismo modal de previsualización de los módulos. Ahí
  // el botón «Guardar en el anejo» no sale: lo enseña sólo cuando la ruta es la
  // de un módulo, y ésta no lo es.
  const verPdf = async (pieza: Pieza) => {
    const blob = await leerBlob(pieza.blobId).catch(() => null);
    if (blob === null) {
      showToast('El PDF de esa pieza no está en esta máquina.', { autoDismiss: 5000 });
      return;
    }
    setViendo({ pieza, url: URL.createObjectURL(blob), blob });
  };

  const cerrarPdf = () => {
    if (viendo) URL.revokeObjectURL(viendo.url);
    setViendo(null);
  };

  const generarCon = (piezas: readonly Pieza[]) => {
    if (pestanaDesfasada()) {
      showToast(DESFASADA, { autoDismiss: 5000 });
      return;
    }
    void generacion.generar({ piezas, obra, nombreObra: nombreObra ?? '' });
  };

  const generar = () => generarCon(anejo.piezas);

  // «Generar sin esta pieza»: la deja fuera (y así queda) y vuelve a montar
  // con la lista ya cambiada, sin esperar al re-render.
  const generarSin = (pieza: Pieza) => {
    incluir(pieza, false);
    generarCon(anejo.piezas.map((p) => (p.id === pieza.id ? { ...p, incluida: false } : p)));
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Topbar
        moduleGroup="Proyecto"
        moduleLabel="Anejo de cálculo"
        onMenuOpen={openDrawer}
        exportMenu={<BotonGenerar ocupado={generando} motivoBloqueo={motivoBloqueo} onClick={generar} />}
      />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[880px] px-3 pb-6 pt-1 sm:px-5">
            <p className="sr-only" aria-live="polite">
              {anuncio}
            </p>
            <ListaPiezas
              piezas={anejo.piezas}
              numeros={numeros}
              estados={estados}
              sinPdf={sinPdf}
              generacion={generacion.estado}
              noAbrible={noAbrible}
              abierta={(pieza) => piezaAbierta(pieza.modulo)?.id === pieza.id}
              avisar={(pieza) => seccionDePieza(pieza) !== 'memoria' && hayTrabajoSinGuardar(pieza.modulo)}
              onVerPdf={(pieza) => void verPdf(pieza)}
              onRenombrar={(pieza, titulo) => void renombrar(pieza, titulo)}
              onAbrir={abrir}
              onIrAlModulo={irAlModulo}
              onMover={mover}
              onIncluir={incluir}
              onQuitar={(p) => void quitar(p)}
              onGenerarSin={generarSin}
            />
          </div>
        </main>
        <PanelResumen
          nombreObra={nombreObra}
          obra={obra}
          resumen={resumen}
          deVersionAnterior={deVersionAnterior}
          motivoBloqueo={motivoBloqueo}
          generacion={generacion.estado}
          onDescargarOtraVez={generacion.descargarOtraVez}
        />
      </div>
      {viendo && (
        <PdfPreviewModal
          blobUrl={viendo.url}
          filename={nombreDeFichero(viendo.pieza)}
          pageCount={viendo.pieza.paginas}
          onDownload={() => descargarBlob({ blob: viendo.blob, filename: nombreDeFichero(viendo.pieza) })}
          onClose={cerrarPdf}
        />
      )}
    </div>
  );
}
