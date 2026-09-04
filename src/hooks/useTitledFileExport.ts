import { useCallback, useState } from 'react';
import { showToast } from '../components/ui/Toast';
import { descargarBlob, type ResultadoExport } from '../lib/export/descargar';

interface TitledFileExportOptions {
  /** Genera el fichero con el título dado (undefined ⇒ sin título). */
  exportFn: (title?: string) => Promise<ResultadoExport>;
  /** ¿Se puede exportar? Se comprueba ANTES de abrir el modal, para no dejar
   *  que el usuario escriba un título y luego choque con el toast. */
  valid: boolean;
  /** Persiste el título elegido, para pre-rellenar el próximo export. */
  onTitleChange: (title: string) => void;
  /** Mensaje del toast cuando `valid` es false. */
  invalidMessage?: string;
  /** Cómo se llama el formato en el toast de error: «Word», «Excel»… */
  formatoLabel?: string;
}

/**
 * "Preguntar el título al exportar", para los formatos que NO se previsualizan.
 *
 * Es el hermano de `useTitledPdfExport`, no una copia por pereza: los dos flujos
 * son estructuralmente distintos. El PDF se previsualiza en un modal y la
 * descarga es un segundo gesto del usuario; un .docx o un .xlsx no se pueden
 * previsualizar en el navegador, así que confirmar el título genera y descarga
 * de una vez. Meter esa bifurcación dentro de `usePdfPreview` habría sido un
 * `if (formato)` en un hook que hoy es limpio. Lo que sí comparten —el ancla
 * conectada al DOM y el revoke diferido— vive en `lib/export/descargar`.
 *
 * El hook no sabe qué formato genera y es a propósito: el `import()` de la
 * librería vive dentro del `exportFn` que pasa el módulo, así el chunk sigue
 * siendo perezoso y el hook no arrastra medio megabyte a quien sólo quiere el
 * estado del modal.
 */
export function useTitledFileExport({
  exportFn,
  valid,
  onTitleChange,
  invalidMessage,
  formatoLabel = 'documento',
}: TitledFileExportOptions) {
  const [exportando, setExportando] = useState(false);
  const [titleOpen, setTitleOpen] = useState(false);

  const openExport = useCallback(() => {
    if (!valid) {
      showToast(invalidMessage ?? 'Los datos de entrada no son válidos', { autoDismiss: 3000 });
      return;
    }
    setTitleOpen(true);
  }, [valid, invalidMessage]);

  const confirmTitle = useCallback(
    async (title: string) => {
      onTitleChange(title);
      setExportando(true);
      try {
        descargarBlob(await exportFn(title));
        setTitleOpen(false);
      } catch (e) {
        // El modal se queda abierto a propósito: el título escrito no se pierde
        // y el usuario puede reintentar sin volver a teclearlo.
        console.error('Export failed:', e);
        showToast(`Error al generar el ${formatoLabel}`, { autoDismiss: 4000 });
      } finally {
        setExportando(false);
      }
    },
    [onTitleChange, exportFn, formatoLabel],
  );

  const closeTitle = useCallback(() => setTitleOpen(false), []);

  return { exportando, titleOpen, openExport, confirmTitle, closeTitle };
}
