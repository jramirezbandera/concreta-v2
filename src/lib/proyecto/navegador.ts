/**
 * Lo que el cambio de obra le pide al navegador. Separado del contenedor para
 * que los tests lo sustituyan (`vi.mock`) y para que `lib/proyecto` no dependa
 * de `window`.
 */

/**
 * Cambiar de obra termina en una recarga: en una PWA con todo el estado en
 * localStorage, la recarga es el remount correcto y completo (limpia también
 * las variables de módulo y los oyentes acumulados de `storage`/`focus`).
 */
export function recargar(): void {
  window.location.reload();
}

/**
 * ¿Hay una versión nueva de la app esperando (service worker en `waiting`)?
 * La recarga del cambio de obra la activaría justo después de haber comprobado
 * los esquemas contra la versión vieja: hay que decirlo en el mismo diálogo.
 */
export async function hayActualizacionEnEspera(): Promise<boolean> {
  try {
    const sw = navigator.serviceWorker;
    if (!sw) return false;
    const registro = await sw.getRegistration();
    return Boolean(registro?.waiting);
  } catch {
    return false;
  }
}
