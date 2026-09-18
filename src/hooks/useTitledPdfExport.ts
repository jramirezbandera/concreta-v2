import { useCallback, useState } from 'react';
import { showToast } from '../components/ui/Toast';
import { propsTituloAnejo } from '../components/layout/opcionAnejo';
import { blobDeUrl } from '../lib/anejo/bytes';
import { useModuloEnPantalla } from '../lib/anejo/useModuloEnPantalla';
import { volcarPendientes } from '../lib/storage/seguro';
import { useGuardarEnAnejo } from './useGuardarEnAnejo';
import { usePdfPreview } from './usePdfPreview';
import type { PdfResult } from '../lib/pdf/utils';

/** A dónde va el PDF que se está pidiendo: al disco (pasando por el visor) o al anejo. */
export type DestinoExport = 'pdf' | 'anejo';

interface TitledPdfExportOptions {
  /** Genera el PDF con el título dado (undefined ⇒ usa el título persistido). */
  exportFn: (title?: string) => Promise<PdfResult>;
  /** ¿Son válidos los datos de entrada? Se comprueba ANTES de abrir el modal
   *  para no dejar que el usuario escriba un título y luego choque con el toast
   *  "datos no válidos" (los módulos con `valid` dinámico lo pasan calculado). */
  valid: boolean;
  /** Persiste el título elegido (normalmente `setField('title', t)`), para
   *  pre-rellenar el próximo export, sobrevivir recarga y viajar en el enlace. */
  onTitleChange: (title: string) => void;
  /** Mensaje del toast cuando `valid` es false. Opcional: los módulos con más
   *  de un motivo de invalidez (p.ej. anchor-plate: sin datos vs SIN SOLUCIÓN)
   *  pasan el motivo real en lugar del genérico. */
  invalidMessage?: string;
}

/**
 * Compositor de "preguntar el título al exportar". Envuelve `usePdfPreview` y
 * añade el estado del `TitlePromptModal`: la barra llama a `openExport` (que
 * valida y abre el modal); al confirmar se persiste el título y se dispara la
 * generación con él. Único punto que cablea el gate de validez, así ningún
 * módulo lo olvida (regresión "escribo el título y luego INVALID").
 *
 * Y el PDF tiene DOS destinos, que es lo que el desplegable «Exportar» pone
 * delante: bajar al disco —previsualización incluida— o entrar en el anejo de
 * la obra como capítulo. `openExport` recibe cuál, y todo lo demás (validar,
 * pedir el nombre, generar) es el mismo camino. Guardar en el anejo NO pasa
 * por el visor: eran cinco gestos (exportar, nombre, confirmar, esperar el
 * PDF, guardar) para lo que es un destino, y ahora son tres. El botón de
 * dentro del visor sigue donde estaba, para quien ya tiene el PDF delante.
 *
 * Quién es el módulo no lo pregunta a nadie: lo dice la ruta
 * (`useModuloEnPantalla`), igual que en la previsualización. Fuera de un
 * router —o en un módulo sin adaptador— el destino «anejo» sencillamente no
 * existe, y el menú tampoco lo ofrece.
 *
 * Devuelve además todo lo de `usePdfPreview` (pdfExporting, pdfPreview,
 * handleDownloadPdf, closePdfPreview) para que el módulo siga renderizando el
 * `PdfPreviewModal` como hasta ahora.
 */
export function useTitledPdfExport({ exportFn, valid, onTitleChange, invalidMessage }: TitledPdfExportOptions) {
  const pdf = usePdfPreview(exportFn, valid);
  const [titleOpen, setTitleOpen] = useState(false);
  const [destino, setDestino] = useState<DestinoExport>('pdf');
  const adaptador = useModuloEnPantalla();
  const anejo = useGuardarEnAnejo();

  const openExport = useCallback(
    (d: DestinoExport = 'pdf') => {
      if (!valid) {
        showToast(invalidMessage ?? 'Los datos de entrada no son válidos', { autoDismiss: 3000 });
        return;
      }
      // Defensivo: el botón de la topbar pasa el evento del click como primer
      // argumento, y un MouseEvent no es un destino.
      setDestino(d === 'anejo' && adaptador ? 'anejo' : 'pdf');
      setTitleOpen(true);
    },
    [valid, invalidMessage, adaptador],
  );

  const confirmTitle = useCallback(
    async (title: string) => {
      onTitleChange(title);
      // Y se VUELCA, en vez de dejarlo 300 ms en la cola de `useModuleState`.
      // El nombre lo acaba de confirmar el usuario a propósito: no hay nada que
      // agrupar. Y desde aquí hasta el anejo hay quien lo lee del almacén para
      // saber si esta exportación actualiza el capítulo abierto o estrena uno;
      // con el nombre todavía en la cola, se guardaría con el ANTERIOR.
      volcarPendientes();
      if (destino === 'pdf' || !adaptador) {
        setTitleOpen(false);
        void pdf.handleExportPdf(title);
        return;
      }
      // Al anejo: se genera con el modal abierto —el botón enseña «Generando…»,
      // como en cualquier otro formato— y se cierra antes de guardar, para que
      // el diálogo del nombre de la obra no se apile encima.
      const resultado = await pdf.generarPdf(title);
      if (!resultado) return; // El toast del error ya lo puso `generarPdf`.
      setTitleOpen(false);
      try {
        const blob = await blobDeUrl(resultado.blobUrl);
        await anejo.guardar({ modulo: adaptador.modulo, titulo: title, blob, paginas: resultado.pageCount });
      } catch (e) {
        console.error('No se pudo guardar el PDF en el anejo:', e);
        showToast('No se pudo leer el PDF para guardarlo en el anejo', { autoDismiss: 4000 });
      } finally {
        URL.revokeObjectURL(resultado.blobUrl);
      }
    },
    [onTitleChange, pdf, destino, adaptador, anejo],
  );

  const closeTitle = useCallback(() => setTitleOpen(false), []);

  return {
    ...pdf,
    titleOpen,
    openExport,
    confirmTitle,
    closeTitle,
    /** A dónde va lo que se está exportando ahora mismo. */
    destino,
    /**
     * Lo que hay que derramar sobre el `TitlePromptModal` para que diga a
     * dónde va esto. Vacío cuando el destino es el disco: entonces el modal
     * dice lo de siempre, «Se descargará como …».
     */
    propsTitulo: destino === 'anejo' && adaptador ? propsTituloAnejo(adaptador) : {},
    /** El diálogo del nombre de la obra, si hace falta crearla. El módulo lo renderiza. */
    anejoDialogo: anejo.dialogo,
  };
}
