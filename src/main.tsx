import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { repararAlArrancar, vigilarPestanaDesfasada } from './lib/proyecto';

// Antes de renderizar nada: cerrar la escritura de las claves de obra si otra
// pestaña cambia de obra por debajo, y, si un cambio se quedó a medias
// (centinela), volver a desplegarlo; el índice se reconstruye si diverge.
//
// Envuelto: pase lo que pase con el almacenamiento, la app tiene que pintar.
// Un navegador que bloquea `localStorage` deja la app en modo memoria, con su
// banda de aviso, no en una pantalla en blanco.
try {
  vigilarPestanaDesfasada();
  repararAlArrancar();
} catch (e) {
  console.error('Concreta: fallo al reparar el arranque', e);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
