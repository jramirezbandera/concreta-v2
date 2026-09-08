import { useEffect, useRef } from 'react';
import { showToast } from '../ui/Toast';
import { useEstadoAlmacen } from '../../lib/storage/useEstadoAlmacen';
import type { MotivoFallo } from '../../lib/storage/seguro';

/**
 * Banda persistente mientras el almacenamiento falle, y toast al fallar y al
 * recuperarse. Vive en `AppShell`, fuera del `<Suspense>` de las rutas: es lo
 * único que no puede parpadear al navegar, porque avisa de que lo que hay en
 * pantalla NO se está guardando.
 *
 * El toast sale sólo en la transición (bien → mal) y como mucho una vez cada
 * 30 s: con la cuota llena falla cada pulsación, y un toast por pulsación sería
 * ruido, no aviso. La banda es la que se queda.
 */

const TEXTO: Record<MotivoFallo, string> = {
  cuota: 'Los cambios no se están guardando: el almacenamiento del navegador está lleno. Exporta lo que tengas antes de cerrar la pestaña.',
  'no-disponible':
    'Los cambios no se están guardando: el navegador no permite guardar datos (modo privado o almacenamiento bloqueado).',
};

const TOAST_FALLO: Record<MotivoFallo, string> = {
  cuota: 'No se ha podido guardar: el almacenamiento del navegador está lleno',
  'no-disponible': 'No se ha podido guardar: el navegador no permite guardar datos',
};

const TOAST_CADA_MS = 30_000;

export function BandaAlmacen() {
  const { fallo } = useEstadoAlmacen();
  const falloPrevio = useRef<MotivoFallo | null>(null);
  const ultimoToast = useRef(0);

  useEffect(() => {
    const previo = falloPrevio.current;
    falloPrevio.current = fallo;
    if (fallo !== null && fallo !== previo) {
      const ahora = Date.now();
      if (ahora - ultimoToast.current >= TOAST_CADA_MS) {
        ultimoToast.current = ahora;
        showToast(TOAST_FALLO[fallo], { autoDismiss: 6000 });
      }
    } else if (fallo === null && previo !== null) {
      showToast('El almacenamiento vuelve a funcionar: los cambios se guardan', { autoDismiss: 4000 });
    }
  }, [fallo]);

  if (fallo === null) return null;
  return (
    <div
      role="alert"
      className="flex items-center gap-3 px-4 py-2 shrink-0 border-b-2 border-state-fail bg-tint-fail text-state-fail text-xs"
    >
      <span className="font-mono uppercase tracking-wider text-[10px] shrink-0">Sin guardar</span>
      <span>{TEXTO[fallo]}</span>
    </div>
  );
}
