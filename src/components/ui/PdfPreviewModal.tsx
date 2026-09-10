import { useEffect, useState } from 'react';
import { BookPlus, Check, FileText, X, Download } from 'lucide-react';
import { useGuardarEnAnejo } from '../../hooks/useGuardarEnAnejo';
import { destinoDeGuardado, type DestinoGuardado } from '../../lib/anejo';
import { blobDeUrl } from '../../lib/anejo/bytes';
import { useModuloEnPantalla } from '../../lib/anejo/useModuloEnPantalla';
import { volcarPendientes } from '../../lib/storage/seguro';
import { showToast } from './Toast';

interface PdfPreviewModalProps {
  blobUrl: string;
  filename: string;
  pageCount: number;
  onDownload: () => void;
  onClose: () => void;
}

export function PdfPreviewModal({ blobUrl, filename, pageCount, onClose, onDownload }: PdfPreviewModalProps) {
  // «Guardar en el anejo» (design doc, F5): el PDF que se está viendo, tal
  // cual, al anejo de la obra. El módulo lo dice la ruta —ningún módulo pasa
  // nada— y el título es el que el módulo acaba de persistir al confirmarlo.
  const adaptador = useModuloEnPantalla();
  const anejo = useGuardarEnAnejo();
  const [enAnejo, setEnAnejo] = useState(false);

  // Qué va a hacer el botón: estrenar capítulo o pisar el que el módulo tiene
  // abierto. Se lee al pintar, sin estado ni efecto, porque el nombre ya está
  // en el almacén: `useTitledPdfExport` lo vuelca al confirmarlo, justo antes
  // de mandar a generar este PDF.
  const destino = adaptador ? destinoDeGuardado(adaptador.modulo, adaptador.tituloGuardado() ?? '') : null;

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Escape key. Con el diálogo del nombre de la obra abierto, Escape es suyo.
  const dialogoAbierto = anejo.dialogoAbierto;
  useEffect(() => {
    if (dialogoAbierto) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, dialogoAbierto]);

  const guardarEnAnejo = async () => {
    if (!adaptador) return;
    let blob: Blob;
    try {
      blob = await blobDeUrl(blobUrl);
    } catch (e) {
      console.error('No se pudo leer el PDF de la previsualización:', e);
      showToast('No se pudo leer el PDF para guardarlo en el anejo', { autoDismiss: 4000 });
      return;
    }
    // El título se persistió al confirmarlo, pero los módulos de useModuleState
    // escriben con 300 ms de retraso: se vuelca antes de leerlo.
    volcarPendientes();
    const r = await anejo.guardar({
      modulo: adaptador.modulo,
      titulo: adaptador.tituloGuardado() ?? '',
      blob,
      paginas: pageCount,
    });
    if (r.ok) setEnAnejo(true);
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-bg-surface rounded-lg shadow-2xl flex flex-col max-w-6xl w-[95vw] h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-border-main shrink-0">
          <FileText size={16} className="text-text-secondary shrink-0" />
          <span className="text-sm font-medium text-text-primary shrink-0">Previsualización PDF</span>
          <span className="text-xs text-text-secondary shrink-0">A4 · {pageCount} página{pageCount !== 1 ? 's' : ''}</span>
          {/* El nombre real de descarga. La barra del visor de Chrome guarda con
            * el UUID del blob; sólo este botón respeta el título del elemento. */}
          <span
            className="flex-1 min-w-0 truncate text-xs font-mono text-text-secondary"
            title={filename}
          >
            {filename}
          </span>
          {adaptador && (
            <button
              onClick={guardarEnAnejo}
              disabled={anejo.guardando || enAnejo}
              title={enAnejo ? 'Ya está en el anejo de esta obra' : explicacionDe(destino, adaptador.capitulo)}
              className="inline-flex items-center gap-1.5 shrink-0 rounded px-4 py-1.5 text-sm text-accent disabled:opacity-60 transition-all"
              style={{
                border: '1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)',
                background: 'color-mix(in srgb, var(--color-accent) 6%, transparent)',
              }}
            >
              {anejo.guardando ? (
                <span className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" aria-hidden="true" />
              ) : enAnejo ? (
                <Check size={14} aria-hidden="true" />
              ) : (
                <BookPlus size={14} aria-hidden="true" />
              )}
              {enAnejo ? 'En el anejo' : rotuloDe(destino)}
            </button>
          )}
          <button
            onClick={onDownload}
            title={`Descargar como ${filename}`}
            className="flex items-center gap-1.5 shrink-0 bg-bg-elevated hover:bg-bg-primary border border-border-main rounded px-4 py-1.5 text-sm text-text-primary transition-colors"
          >
            <Download size={14} />
            Descargar
          </button>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1.5 rounded hover:bg-bg-elevated text-text-secondary hover:text-text-primary transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* PDF iframe */}
        <iframe
          src={blobUrl}
          className="flex-1 w-full min-h-0 rounded-b-lg bg-white"
          title="PDF preview"
        />
        {anejo.dialogo}
      </div>
    </div>
  );
}

/**
 * Lo que pone el botón. Sale de `destinoDeGuardado`, el mismo que decide lo que
 * el botón HACE: por eso lo que se lee es lo que pasa, y no hay ninguna regla
 * sobre el nombre que el usuario tenga que aprenderse.
 *
 * Mientras el destino no está resuelto —un frame, o un módulo sin adaptador—
 * pone lo de siempre, que es además lo que hará.
 */
function rotuloDe(destino: DestinoGuardado | null): string {
  if (destino?.tipo === 'actualiza') {
    return destino.numero === null ? 'Actualizar el capítulo' : `Actualizar el capítulo ${destino.numero}`;
  }
  return destino?.desde ? 'Guardar como pieza nueva' : 'Guardar en el anejo';
}

/** Y el porqué, al pasar por encima: lo que se actualiza, o lo que se queda como está. */
function explicacionDe(destino: DestinoGuardado | null, capitulo: string): string {
  if (destino?.tipo === 'actualiza') {
    return `Sustituir el PDF y los datos de «${destino.pieza.titulo}» en el anejo, en su mismo sitio`;
  }
  if (destino?.desde) {
    return `Añadir una pieza nueva al anejo: le has cambiado el nombre, así que «${destino.desde.titulo}» se queda como está`;
  }
  return `Guardar este PDF como capítulo «${capitulo}» del anejo de la obra`;
}
