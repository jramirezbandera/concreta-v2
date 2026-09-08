import { useState } from 'react';
import { showToast } from '../../components/ui/Toast';
import { ErrorDeAnejo } from '../../lib/anejo/errores';
import type { Pieza } from '../../lib/anejo/types';
import { descargarBlob } from '../../lib/export/descargar';
import type { Obra } from '../../lib/obra';

export type EstadoGeneracion =
  | { fase: 'inactivo' }
  /** Generando: `hechas` son las piezas que ya han entrado en el documento (progreso fila a fila, D2). */
  | { fase: 'generando'; hechas: ReadonlySet<string> }
  /** Falló. Con `piezaId`, la fila culpable se pone en rojo con el motivo y la salida; sin él, el panel lo cuenta. */
  | { fase: 'error'; piezaId: string | null; mensaje: string }
  | { fase: 'hecho'; blob: Blob; filename: string; paginas: number; ts: number };

export interface PeticionGenerar {
  piezas: readonly Pieza[];
  obra: Obra | null;
  nombreObra: string;
}

/**
 * Generar el anejo desde la pantalla: el montaje (`lib/anejo/generar`) entra
 * por `import()` al pulsar, el progreso marca las filas conforme entran, el
 * PDF se descarga al terminar y se guarda para «Descargar otra vez». La
 * pantalla no se bloquea mientras tanto.
 */
export function useGenerarAnejo() {
  const [estado, setEstado] = useState<EstadoGeneracion>({ fase: 'inactivo' });

  const generar = async (p: PeticionGenerar): Promise<boolean> => {
    setEstado({ fase: 'generando', hechas: new Set() });
    try {
      const { generarAnejo } = await import('../../lib/anejo/generar');
      const r = await generarAnejo({
        piezas: p.piezas,
        obra: p.obra,
        nombreObra: p.nombreObra,
        onParte: (id) =>
          setEstado((actual) =>
            actual.fase === 'generando' ? { fase: 'generando', hechas: new Set([...actual.hechas, id]) } : actual,
          ),
      });
      descargarBlob({ blob: r.blob, filename: r.filename });
      setEstado({ fase: 'hecho', blob: r.blob, filename: r.filename, paginas: r.paginas, ts: Date.now() });
      showToast(`Anejo generado: ${r.paginas} páginas`, { autoDismiss: 4000 });
      return true;
    } catch (e) {
      if (e instanceof ErrorDeAnejo) {
        setEstado({ fase: 'error', piezaId: e.piezaId, mensaje: e.message });
        if (e.piezaId === null) showToast(e.message, { autoDismiss: 6000 });
      } else {
        console.error('anejo: no se pudo generar', e);
        setEstado({ fase: 'error', piezaId: null, mensaje: 'No se pudo generar el anejo.' });
        showToast('No se pudo generar el anejo.', { autoDismiss: 6000 });
      }
      return false;
    }
  };

  const descargarOtraVez = () => {
    if (estado.fase === 'hecho') descargarBlob({ blob: estado.blob, filename: estado.filename });
  };

  return { estado, generar, descargarOtraVez };
}
