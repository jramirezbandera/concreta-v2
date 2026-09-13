/**
 * El store de publicaciones: la marca que `useSyncExternalStore` compara.
 *
 * Lo que se protege: que publicar desde esta pestaña la mueva, y que lo que
 * llega de OTRA pestaña por `storage` la mueva TAMBIÉN. Del 12 al 13-09-2026
 * el oyente de `storage` avisaba sin mover la marca, y como el hook compara
 * instantáneas, el aviso se perdía: la otra pestaña no repintaba nunca.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { publicar, retirarPublicacion, suscribirPubs, versionDePubs } from '../../lib/pub';
import { _reiniciarAlmacenParaTests } from '../../lib/storage/seguro';

beforeEach(() => {
  localStorage.clear();
  _reiniciarAlmacenParaTests();
});

describe('versionDePubs', () => {
  it('se mueve al publicar y al retirar, y avisa a los suscritos', () => {
    let avisos = 0;
    const baja = suscribirPubs(() => {
      avisos += 1;
    });
    const antes = versionDePubs();

    publicar('prueba', 1, { x: 1 });
    expect(versionDePubs()).toBe(antes + 1);
    retirarPublicacion('prueba');
    expect(versionDePubs()).toBe(antes + 2);
    expect(avisos).toBe(2);
    baja();
  });

  it('lo que llega de otra pestaña por `storage` también la mueve', () => {
    let avisos = 0;
    const baja = suscribirPubs(() => {
      avisos += 1;
    });
    const antes = versionDePubs();

    window.dispatchEvent(new StorageEvent('storage', { key: 'concreta-pub-sismo', newValue: '{}' }));
    expect(versionDePubs()).toBe(antes + 1);
    expect(avisos).toBe(1);

    // Una clave ajena no es cosa de este store.
    window.dispatchEvent(new StorageEvent('storage', { key: 'concreta-theme', newValue: 'dark' }));
    expect(versionDePubs()).toBe(antes + 1);

    // `key: null` es el `clear()` del cambio de obra.
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(versionDePubs()).toBe(antes + 2);
    baja();
  });
});
