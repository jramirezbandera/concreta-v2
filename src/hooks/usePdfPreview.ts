import { useState, useCallback, useEffect, useRef } from 'react';
import { showToast } from '../components/ui/Toast';
import type { PdfResult } from '../lib/pdf/utils';

/**
 * Dispara la descarga del blob con el nombre elegido por el usuario.
 *
 * El ancla DEBE estar insertada en el documento antes del `click()`: Firefox
 * (y Safari) ignoran el atributo `download` — y a veces el click entero — en
 * anclas desconectadas del DOM, y el archivo acaba con el UUID del blob.
 */
function triggerDownload(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Margen para que el navegador lea el blob antes de que lo revoquemos. */
const REVOKE_DELAY_MS = 1000;

export function usePdfPreview(
  exportFn: (title?: string) => Promise<PdfResult>,
  valid: boolean,
) {
  const [pdfExporting, setPdfExporting] = useState(false);
  const [pdfPreview, setPdfPreview] = useState<PdfResult | null>(null);

  // Un único revoke, al desmontar. Antes el efecto dependía de `pdfPreview`, de
  // modo que su cleanup corría en CADA cambio de estado: `handleDownloadPdf`
  // llamaba a setPdfPreview(null) y React revocaba el blob en el mismo tick del
  // click, abortando la descarga recién iniciada.
  const liveUrl = useRef<string | null>(null);
  useEffect(() => { liveUrl.current = pdfPreview?.blobUrl ?? null; }, [pdfPreview]);
  useEffect(() => () => {
    if (liveUrl.current) URL.revokeObjectURL(liveUrl.current);
  }, []);

  // `title` opcional: los módulos con TitlePromptModal lo pasan al confirmar; el
  // resto llama sin argumento y su exportFn lo ignora (retrocompatible).
  const handleExportPdf = useCallback(async (title?: string) => {
    if (!valid) {
      showToast('Los datos de entrada no son válidos', { autoDismiss: 3000 });
      return;
    }
    setPdfExporting(true);
    try {
      const result = await exportFn(title);
      if (window.innerWidth < 768) {
        // Mobile: direct download, no preview
        triggerDownload(result.blobUrl, result.filename);
        setTimeout(() => URL.revokeObjectURL(result.blobUrl), REVOKE_DELAY_MS);
      } else {
        setPdfPreview(result);
      }
    } catch (e) {
      console.error('PDF export failed:', e);
      showToast('Error al generar el PDF', { autoDismiss: 4000 });
    } finally {
      setPdfExporting(false);
    }
  }, [exportFn, valid]);

  const handleDownloadPdf = useCallback(() => {
    if (!pdfPreview) return;
    const { blobUrl, filename } = pdfPreview;
    triggerDownload(blobUrl, filename);
    setPdfPreview(null);
    setTimeout(() => URL.revokeObjectURL(blobUrl), REVOKE_DELAY_MS);
  }, [pdfPreview]);

  const closePdfPreview = useCallback(() => {
    if (pdfPreview) URL.revokeObjectURL(pdfPreview.blobUrl);
    setPdfPreview(null);
  }, [pdfPreview]);

  return { pdfExporting, pdfPreview, handleExportPdf, handleDownloadPdf, closePdfPreview };
}
