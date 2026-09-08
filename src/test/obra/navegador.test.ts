/**
 * `hayActualizacionEnEspera()` (eng-review T4): la recarga del cambio de obra
 * activaría un service worker en `waiting` justo después de comprobar los
 * esquemas contra la versión vieja; hay que saberlo antes.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { hayActualizacionEnEspera } from '../../lib/proyecto/navegador';

function conServiceWorker(valor: unknown) {
  Object.defineProperty(navigator, 'serviceWorker', { value: valor, configurable: true });
}

afterEach(() => {
  conServiceWorker(undefined);
});

describe('hayActualizacionEnEspera', () => {
  it('sin service worker: false', async () => {
    conServiceWorker(undefined);
    expect(await hayActualizacionEnEspera()).toBe(false);
  });

  it('con un worker en espera: true', async () => {
    conServiceWorker({ getRegistration: async () => ({ waiting: {} }) });
    expect(await hayActualizacionEnEspera()).toBe(true);
  });

  it('registrado pero sin nada esperando: false', async () => {
    conServiceWorker({ getRegistration: async () => ({ waiting: null }) });
    expect(await hayActualizacionEnEspera()).toBe(false);
    conServiceWorker({ getRegistration: async () => undefined });
    expect(await hayActualizacionEnEspera()).toBe(false);
  });

  it('si la consulta falla: false, sin lanzar', async () => {
    conServiceWorker({
      getRegistration: async () => {
        throw new Error('sin permiso');
      },
    });
    expect(await hayActualizacionEnEspera()).toBe(false);
  });
});
