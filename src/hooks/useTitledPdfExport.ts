import { useCallback, useState } from 'react';
import { showToast } from '../components/ui/Toast';
import { volcarPendientes } from '../lib/storage/seguro';
import { usePdfPreview } from './usePdfPreview';
import type { PdfResult } from '../lib/pdf/utils';

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
 * Devuelve además todo lo de `usePdfPreview` (pdfExporting, pdfPreview,
 * handleDownloadPdf, closePdfPreview) para que el módulo siga renderizando el
 * `PdfPreviewModal` como hasta ahora.
 */
export function useTitledPdfExport({ exportFn, valid, onTitleChange, invalidMessage }: TitledPdfExportOptions) {
  const pdf = usePdfPreview(exportFn, valid);
  const [titleOpen, setTitleOpen] = useState(false);

  const openExport = useCallback(() => {
    if (!valid) {
      showToast(invalidMessage ?? 'Los datos de entrada no son válidos', { autoDismiss: 3000 });
      return;
    }
    setTitleOpen(true);
  }, [valid, invalidMessage]);

  const confirmTitle = useCallback(
    (title: string) => {
      onTitleChange(title);
      // Y se VUELCA, en vez de dejarlo 300 ms en la cola de `useModuleState`.
      // El nombre lo acaba de confirmar el usuario a propósito: no hay nada que
      // agrupar. Y desde aquí hasta el botón «Guardar en el anejo» hay quien lo
      // lee del almacén para saber si esta exportación actualiza el capítulo
      // abierto o estrena uno; con el nombre todavía en la cola, ese botón
      // rotularía con el nombre ANTERIOR y prometería lo que no va a hacer.
      volcarPendientes();
      setTitleOpen(false);
      void pdf.handleExportPdf(title);
    },
    [onTitleChange, pdf],
  );

  const closeTitle = useCallback(() => setTitleOpen(false), []);

  return { ...pdf, titleOpen, openExport, confirmTitle, closeTitle };
}
