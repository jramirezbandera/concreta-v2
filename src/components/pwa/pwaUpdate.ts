import { showToast } from '../ui/Toast';

/** Firma de `updateServiceWorker` que expone `useRegisterSW`. */
export type UpdateServiceWorker = (reloadPage?: boolean) => void;

// Margen para que el worker en espera pase a ACTIVO tras el SKIP_WAITING cuando
// la pestaña NO estaba controlada por un SW (primera visita o un recargado
// forzado que salta el SW): en ese caso no llega ningún `controllerchange` que
// dispare la recarga, así que recargamos nosotros al agotar el plazo. En una
// pestaña ya controlada el `controllerchange` llega en ~ms y recargamos mucho
// antes de cumplirse este tiempo.
const ACTIVATION_FALLBACK_MS = 3000;

/**
 * Avisa de una versión nueva reutilizando el toast de la app.
 *
 * Es PERSISTENTE (sin `autoDismiss`): una calculadora de mesa suele tener datos
 * a medio introducir, así que nunca recargamos por sorpresa — la recarga solo
 * ocurre si el usuario pulsa "Actualizar".
 */
export function presentUpdatePrompt(updateServiceWorker: UpdateServiceWorker): void {
  showToast('Hay una nueva versión de Concreta disponible.', {
    action: {
      label: 'Actualizar',
      onClick: () => applyUpdate(updateServiceWorker),
    },
  });
}

/**
 * Aplica la actualización pendiente y recarga la página.
 *
 * OJO: `updateServiceWorker(true)` de vite-plugin-pwa NO recarga por sí mismo.
 * Solo envía `SKIP_WAITING` al worker en espera (este llama a `self.skipWaiting`
 * y `cleanupOutdatedCaches` purga el precache anterior) y delega la recarga en
 * workbox-window, que la hace al recibir el evento `controlling` PERO SOLO si
 * `event.isUpdate` es verdadero. Y ese flag vale
 * `Boolean(navigator.serviceWorker.controller)` capturado EN EL REGISTRO: si la
 * pestaña se cargó sin control de SW (primera visita, o un Ctrl+Shift+R que
 * salta el SW), `isUpdate` es falso, el worker nuevo no reclama una pestaña sin
 * controlar, no hay `controllerchange` y la recarga de workbox NUNCA se dispara
 * → el botón "Actualizar" no hacía nada.
 *
 * Nos hacemos cargo de la recarga sin depender de `isUpdate`:
 *  - En cuanto el worker nuevo toma el control (`controllerchange`), recargamos.
 *  - Si ese evento no llega (pestaña sin controlar), recargamos por plazo: el
 *    usuario ya pidió actualizar y para entonces el SW nuevo ya está activo.
 */
export function applyUpdate(updateServiceWorker: UpdateServiceWorker): void {
  let done = false;
  const reload = () => {
    if (done) return; // recargar una sola vez, gane la carrera quien la gane
    done = true;
    window.location.reload();
  };

  navigator.serviceWorker?.addEventListener('controllerchange', reload, { once: true });
  setTimeout(reload, ACTIVATION_FALLBACK_MS);

  updateServiceWorker(true);
}
