import { listar } from '../../lib/proyecto';
import { useProyectoActivo } from '../../lib/proyecto/useProyectoActivo';

/**
 * Banda persistente cuando OTRA pestaña ha cambiado la obra activa. Esta
 * pestaña sigue mostrando la anterior, y `memoria-dbse` ya relee obra y sobres
 * en cada `storage` y cada `focus`: sin aviso, el usuario mezcla dos obras sin
 * saberlo. Vive en `AppShell`, fuera del `<Suspense>` de las rutas.
 *
 * Mientras la banda está puesta, la app NO escribe ninguna clave de la obra
 * (`vigilarPestanaDesfasada` en `lib/proyecto`), así que el texto lo dice en
 * pasado y no como un consejo: lo que se teclee aquí ya no se está guardando.
 */
export function BandaProyecto() {
  const { activo, desfasada } = useProyectoActivo();
  if (!desfasada) return null;
  const nombre = activo === null ? null : (listar().find((e) => e.id === activo)?.nombre ?? null);
  return (
    <div
      role="alert"
      className="flex items-center gap-3 px-4 py-2 shrink-0 border-b-2 border-state-warn bg-tint-warn text-state-warn text-xs"
    >
      <span className="font-mono uppercase tracking-wider text-[10px] shrink-0">Otra obra</span>
      <span className="flex-1">
        {activo === null
          ? 'En otra pestaña se ha cerrado la obra. Esta pestaña sigue mostrando la anterior y ha dejado de guardar los cambios: recárgala.'
          : `En otra pestaña se ha abierto ${nombre ? `«${nombre}»` : 'otra obra'}. Esta pestaña sigue mostrando la anterior y ha dejado de guardar los cambios: recárgala.`}
      </span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="shrink-0 font-mono uppercase tracking-wider text-[10px] underline underline-offset-2 hover:opacity-80"
      >
        Recargar
      </button>
    </div>
  );
}
