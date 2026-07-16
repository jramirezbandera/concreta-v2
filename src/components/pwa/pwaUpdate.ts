import { showToast } from '../ui/Toast';

/** Firma de `updateServiceWorker` que expone `useRegisterSW`. */
export type UpdateServiceWorker = (reloadPage?: boolean) => void;

/**
 * Avisa de una versión nueva reutilizando el toast de la app.
 *
 * Es PERSISTENTE (sin `autoDismiss`): una calculadora de mesa suele tener datos
 * a medio introducir, así que nunca recargamos por sorpresa — la recarga solo
 * ocurre si el usuario pulsa "Actualizar".
 *
 * `updateServiceWorker(true)` envía SKIP_WAITING al worker en espera; este se
 * activa, `cleanupOutdatedCaches` descarta el precache anterior y
 * vite-plugin-pwa recarga la página para servir el bundle recién precacheado.
 */
export function presentUpdatePrompt(updateServiceWorker: UpdateServiceWorker): void {
  showToast('Hay una nueva versión de Concreta disponible.', {
    action: {
      label: 'Actualizar',
      onClick: () => updateServiceWorker(true),
    },
  });
}
