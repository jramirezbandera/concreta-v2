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
import { FileDown } from 'lucide-react';
import { useDrawer } from '../../components/layout/AppShell';
import { Topbar } from '../../components/layout/Topbar';
import { showToast } from '../../components/ui/Toast';
import { estadoDePieza, fijarIncluida, piezasSinPdf, quitarPieza, reordenarPiezas, type EstadoPieza, type Pieza } from '../../lib/anejo';
import { moverEnSeccion, numerosDeCapitulo, piezasDeSeccion, resumenDe, seccionDePieza } from '../../lib/anejo/maqueta';
import { useAnejo } from '../../lib/anejo/useAnejo';
import { leerObra } from '../../lib/obra';
import { pestanaDesfasada } from '../../lib/proyecto';
import { useNombreObra, useProyectoActivo } from '../../lib/proyecto/useProyectoActivo';
import { ListaPiezas } from './ListaPiezas';
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
  const anejo = useAnejo();
  const nombreObra = useNombreObra();
  const { desfasada } = useProyectoActivo();
  const obra = leerObra();
  const [sinPdf, setSinPdf] = useState<ReadonlySet<string>>(() => new Set());
  const [anuncio, setAnuncio] = useState('');
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
  const porRecalcular = anejo.piezas.filter((p) => p.incluida && estados.get(p.id) === 'recalcular').length;
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
          porRecalcular={porRecalcular}
          motivoBloqueo={motivoBloqueo}
          generacion={generacion.estado}
          onDescargarOtraVez={generacion.descargarOtraVez}
        />
      </div>
    </div>
  );
}
