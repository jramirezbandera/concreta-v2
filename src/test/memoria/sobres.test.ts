/**
 * El guardián de `features/memoria-dbse/sobres.ts`: las claves y versiones de
 * publicación van escritas a mano allí (para no arrastrar el `state.ts` de
 * sismo, con sus 116 KB de hazard, al chunk de la ficha) y aquí se comprueba
 * que coinciden con las de origen. Si un módulo sube su `PUB_VERSION`, este
 * test es el que avisa de que la ficha se quedaría leyendo `null`.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import * as cargas from '../../features/cargas-planta/state';
import * as materiales from '../../features/materiales/state';
import { leerSobres, MODULOS } from '../../features/memoria-dbse/sobres';
import * as sismo from '../../features/seismic-ncse02/state';
import * as viento from '../../features/viento-nieve/state';
import { moduleRegistry } from '../../data/moduleRegistry';
import { clavePublicacion } from '../../lib/pub';

beforeEach(() => {
  localStorage.clear();
});

describe('las constantes literales coinciden con las de cada módulo', () => {
  it.each([
    ['materiales', materiales.MODULO_PUB, materiales.PUB_VERSION],
    ['vientoNieve', viento.MODULO_PUB, viento.PUB_VERSION],
    ['cargasPlanta', cargas.MODULO_PUB, cargas.PUB_VERSION],
    ['sismo', sismo.MODULO_PUB, sismo.PUB_VERSION],
  ] as const)('%s', (clave, modulo, version) => {
    expect(MODULOS[clave].modulo).toBe(modulo);
    expect(MODULOS[clave].version).toBe(version);
  });

  it('las rutas de «Abrir el módulo» existen en el registro', () => {
    const rutas = moduleRegistry.map((m) => m.route);
    for (const m of Object.values(MODULOS)) expect(rutas, m.ruta).toContain(m.ruta);
  });
});

describe('leerSobres', () => {
  it('sin nada publicado, cuatro nulls', () => {
    expect(leerSobres()).toEqual({ materiales: null, vientoNieve: null, cargasPlanta: null, sismo: null });
  });

  it('lee el sobre real de sismo y rechaza uno de otro módulo en su clave', () => {
    const s = sismo.defaultSeismicState();
    sismo.publicarResultado(s, sismo.evaluarSismo(s));
    expect(leerSobres().sismo?.datos.ab).toBe(0.23);
    localStorage.setItem(clavePublicacion('sismo'), JSON.stringify({ v: 1, ts: 'x', modulo: 'viento-nieve', obra: {}, datos: {} }));
    expect(leerSobres().sismo).toBeNull();
  });
});
