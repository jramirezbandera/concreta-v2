import { useState, useCallback, useEffect } from 'react';
import { showToast } from '../components/ui/Toast';
import type { PdfResult } from '../lib/pdf/utils';

export function usePdfPreview(
  exportFn: () => Promise<PdfResult>,
  valid: boolean,
) {
  const [pdfExporting, setPdfExporting] = useState(false);
  const [pdfPreview, setPdfPreview] = useState<PdfResult | null>(null);

  // Revoke blob URL on unmount (prevents leak on navigation)
  useEffect(() => {
    return () => {
      if (pdfPreview) URL.revokeObjectURL(pdfPreview.blobUrl);
    };
  }, [pdfPreview]);

  const handleExportPdf = useCallback(async () => {
    if (!valid) {
      showToast('Los datos de entrada no son válidos', { autoDismiss: 3000 });
      return;
    }
    setPdfExporting(true);
    try {
      const result = await exportFn();
      if (window.innerWidth < 768) {
        // Mobile: direct download, no preview
        const a = document.createElement('a');
        a.href = result.blobUrl;
        a.download = result.filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(result.blobUrl), 200);
      } else {
        setPdfPreview(result);
      }
    } catch {
      showToast('Error al generar el PDF', { autoDismiss: 4000 });
    } finally {
      setPdfExporting(false);
    }
  }, [exportFn, valid]);

  const handleDownloadPdf = useCallback(() => {
    if (!pdfPreview) return;
    const a = document.createElement('a');
    a.href = pdfPreview.blobUrl;
    a.download = pdfPreview.filename;
    a.click();
    const url = pdfPreview.blobUrl;
    setPdfPreview(null);
    setTimeout(() => URL.revokeObjectURL(url), 200);
  }, [pdfPreview]);

  const closePdfPreview = useCallback(() => {
    if (pdfPreview) URL.revokeObjectURL(pdfPreview.blobUrl);
    setPdfPreview(null);
  }, [pdfPreview]);

  return { pdfExporting, pdfPreview, handleExportPdf, handleDownloadPdf, closePdfPreview };
}
