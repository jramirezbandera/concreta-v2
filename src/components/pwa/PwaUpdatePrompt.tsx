import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { presentUpdatePrompt } from './pwaUpdate';

// Las pestañas de una herramienta de mesa viven abiertas horas y no recargan
// solas. Cada deploy reescribe sw.js con revisiones nuevas del precache, así que
// re-pedir sw.js periódicamente es lo que dispara el "hay versión nueva" en una
// pestaña que estaba abierta durante el deploy. 1 h equilibra frescura y ruido.
const UPDATE_POLL_MS = 60 * 60 * 1000;

/**
 * Registra el service worker y avisa cuando hay una versión nueva.
 *
 * Montado una vez en la raíz de la app (App.tsx). No pinta nada por sí mismo:
 * delega el aviso en el sistema de toasts. Ver notas en vite.config.ts
 * (registerType: "prompt" + injectRegister: false).
 */
export function PwaUpdatePrompt() {
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const promptedRef = useRef(false);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      registrationRef.current = registration;
      setInterval(() => {
        void registration.update().catch(() => {});
      }, UPDATE_POLL_MS);
    },
  });

  // Re-comprobar al recuperar el foco/visibilidad: capta un deploy que aterrizó
  // mientras la PWA estaba en segundo plano, sin esperar al ciclo de sondeo.
  useEffect(() => {
    const recheck = () => {
      if (document.visibilityState === 'visible') {
        void registrationRef.current?.update().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', recheck);
    window.addEventListener('focus', recheck);
    return () => {
      document.removeEventListener('visibilitychange', recheck);
      window.removeEventListener('focus', recheck);
    };
  }, []);

  // Enseñar el toast una sola vez cuando el worker en espera indica versión nueva.
  useEffect(() => {
    if (!needRefresh || promptedRef.current) return;
    promptedRef.current = true;
    presentUpdatePrompt(updateServiceWorker);
  }, [needRefresh, updateServiceWorker]);

  return null;
}
