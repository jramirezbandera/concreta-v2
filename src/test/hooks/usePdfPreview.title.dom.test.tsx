// usePdfPreview — el título llega al filename en AMBAS ramas.
//
// El hook bifurca por window.innerWidth: < 768 descarga directa (crea un <a> y
// lo pulsa), >= 768 muestra el modal de preview. Esta prueba fija que el título
// pasado a handleExportPdf(title) se propaga al filename en las dos ramas — el
// punto donde se cuelan regresiones al propagar a los otros módulos.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { usePdfPreview } from '../../hooks/usePdfPreview';
import { titledFilename, type PdfResult } from '../../lib/pdf/utils';

const FALLBACK = 'fallback.pdf';
const exportFn = async (title?: string): Promise<PdfResult> => ({
  blobUrl: 'blob:mock',
  filename: titledFilename(title ?? '', FALLBACK),
  pageCount: 1,
});

function Harness() {
  const { handleExportPdf, pdfPreview } = usePdfPreview(exportFn, true);
  return (
    <div>
      <button onClick={() => handleExportPdf('Dintel de ventana')}>go</button>
      <span data-testid="preview">{pdfPreview?.filename ?? ''}</span>
    </div>
  );
}

function setInnerWidth(w: number) {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true });
}

afterEach(() => {
  vi.restoreAllMocks();
  setInnerWidth(1024);
});

describe('usePdfPreview — título en el filename', () => {
  it('móvil (innerWidth < 768): descarga directa con el filename del título', async () => {
    setInnerWidth(500);
    let downloaded = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloaded = this.download;
    });
    render(<Harness />);
    await userEvent.click(screen.getByText('go'));
    expect(downloaded).toBe('dintel-de-ventana.pdf');
    // En móvil NO se muestra el modal de preview.
    expect(screen.getByTestId('preview').textContent).toBe('');
  });

  it('desktop (innerWidth >= 768): abre preview con el filename del título', async () => {
    setInnerWidth(1024);
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    render(<Harness />);
    await userEvent.click(screen.getByText('go'));
    expect(screen.getByTestId('preview').textContent).toBe('dintel-de-ventana.pdf');
    // En desktop NO se descarga directamente al exportar.
    expect(clickSpy).not.toHaveBeenCalled();
  });
});
