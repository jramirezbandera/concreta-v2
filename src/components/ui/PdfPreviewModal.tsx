import { useEffect } from 'react';
import { FileText, X, Download } from 'lucide-react';

interface PdfPreviewModalProps {
  blobUrl: string;
  filename: string;
  pageCount: number;
  onDownload: () => void;
  onClose: () => void;
}

export function PdfPreviewModal({ blobUrl, pageCount, onClose, onDownload }: PdfPreviewModalProps) {
  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

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
          <FileText size={16} className="text-text-secondary" />
          <span className="text-sm font-medium text-text-primary">Previsualización PDF</span>
          <span className="text-xs text-text-secondary">A4 · {pageCount} página{pageCount !== 1 ? 's' : ''}</span>
          <div className="flex-1" />
          <button
            onClick={onDownload}
            className="flex items-center gap-1.5 bg-bg-elevated hover:bg-bg-primary border border-border-main rounded px-4 py-1.5 text-sm text-text-primary transition-colors"
          >
            <Download size={14} />
            Descargar
          </button>
          <button
            onClick={onClose}
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
      </div>
    </div>
  );
}
