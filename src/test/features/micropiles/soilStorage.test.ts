// Persistencia del soil de Micropilotes — loadSoil / saveSoil.
//
// Cubre los 5 fallbacks (clave ausente, JSON inválido, no-array, array
// vacío, shape inválida) y verifica que el round-trip preserva todos
// los campos exactamente (esto es lo que el usuario pidió en el item 5
// del backlog: "rehidrata el soil sin perder campos").

import { describe, expect, it, beforeEach } from 'vitest';
import { loadSoil, saveSoil, SOIL_STORAGE_KEY } from '../../../features/micropiles/soilStorage';
import { micropilesSoilDefaults, type SoilLayer } from '../../../data/defaults';

beforeEach(() => {
  localStorage.clear();
});

describe('loadSoil', () => {
  it('devuelve defaults FTUX cuando localStorage está vacío', () => {
    const r = loadSoil();
    expect(r).toEqual(micropilesSoilDefaults);
  });

  it('devuelve UNA COPIA de los defaults (mutar el resultado no contamina futuras llamadas)', () => {
    const r1 = loadSoil();
    r1[0].thickness = 999;
    const r2 = loadSoil();
    expect(r2[0].thickness).toBe(micropilesSoilDefaults[0].thickness);
  });

  it('devuelve defaults si el JSON no parsea', () => {
    localStorage.setItem(SOIL_STORAGE_KEY, 'this is not json {');
    expect(loadSoil()).toEqual(micropilesSoilDefaults);
  });

  it('devuelve defaults si el contenido no es un array', () => {
    localStorage.setItem(SOIL_STORAGE_KEY, JSON.stringify({ not: 'an array' }));
    expect(loadSoil()).toEqual(micropilesSoilDefaults);
  });

  it('devuelve defaults si el array está vacío', () => {
    localStorage.setItem(SOIL_STORAGE_KEY, JSON.stringify([]));
    expect(loadSoil()).toEqual(micropilesSoilDefaults);
  });

  it('devuelve defaults si un layer tiene un campo no-número', () => {
    const corrupted = [
      { ...micropilesSoilDefaults[0], gamma: 'not a number' },
    ];
    localStorage.setItem(SOIL_STORAGE_KEY, JSON.stringify(corrupted));
    expect(loadSoil()).toEqual(micropilesSoilDefaults);
  });

  it('devuelve defaults si un layer tiene un campo NaN/Infinity', () => {
    const corrupted = [
      { ...micropilesSoilDefaults[0], phi: NaN },
    ];
    // NaN no es serializable directamente, pero JSON.stringify lo convierte
    // a null. El validador rechaza null → fallback. (Verifica el guard).
    localStorage.setItem(SOIL_STORAGE_KEY, JSON.stringify(corrupted));
    expect(loadSoil()).toEqual(micropilesSoilDefaults);
  });

  it('devuelve defaults si type no es "granular" ni "cohesive"', () => {
    const corrupted = [
      { ...micropilesSoilDefaults[0], type: 'rocky' },
    ];
    localStorage.setItem(SOIL_STORAGE_KEY, JSON.stringify(corrupted));
    expect(loadSoil()).toEqual(micropilesSoilDefaults);
  });

  it('devuelve defaults si falta cualquiera de los 8 campos requeridos', () => {
    const fields: (keyof SoilLayer)[] = ['id', 'type', 'thickness', 'gamma', 'c', 'phi', 'Nspt', 'su', 'rflim'];
    for (const f of fields) {
      const partial = { ...micropilesSoilDefaults[0] } as Record<string, unknown>;
      delete partial[f as string];
      localStorage.setItem(SOIL_STORAGE_KEY, JSON.stringify([partial]));
      expect(loadSoil(), `falta campo ${String(f)}`).toEqual(micropilesSoilDefaults);
    }
  });

  it('un único layer corrupto invalida TODO el array (no devuelve los buenos)', () => {
    // Estrategia conservadora: si CUALQUIER layer está corrupto, descartar
    // todo el storage y volver a defaults. Mejor "perder" un perfil bien
    // guardado que dejar pasar uno con campos garbage.
    const mixed = [
      { ...micropilesSoilDefaults[0] },                    // OK
      { ...micropilesSoilDefaults[1], gamma: 'broken' },   // corrupto
    ];
    localStorage.setItem(SOIL_STORAGE_KEY, JSON.stringify(mixed));
    expect(loadSoil()).toEqual(micropilesSoilDefaults);
  });
});

describe('saveSoil + loadSoil round-trip', () => {
  it('preserva los 4 estratos FTUX byte a byte', () => {
    saveSoil(micropilesSoilDefaults);
    expect(loadSoil()).toEqual(micropilesSoilDefaults);
  });

  it('preserva un perfil custom de 6 estratos sin perder campos', () => {
    const custom: SoilLayer[] = [
      { id: 1, type: 'granular', thickness:  1.5, gamma: 18.0, c:   0,  phi: 28, Nspt:  5, su:    0, rflim: 0.05 },
      { id: 2, type: 'cohesive', thickness:  3.2, gamma: 19.5, c:  35,  phi: 24, Nspt: 12, su:   70, rflim: 0.12 },
      { id: 3, type: 'granular', thickness:  4.0, gamma: 20.1, c:   0,  phi: 32, Nspt: 25, su:    0, rflim: 0.18 },
      { id: 4, type: 'cohesive', thickness:  5.7, gamma: 20.5, c: 120,  phi: 26, Nspt: 30, su:  150, rflim: 0.22 },
      { id: 5, type: 'granular', thickness:  8.1, gamma: 21.0, c:   0,  phi: 35, Nspt: 40, su:    0, rflim: 0.28 },
      { id: 6, type: 'cohesive', thickness: 10.0, gamma: 21.5, c: 200,  phi: 28, Nspt: 50, su:  300, rflim: 0.35 },
    ];
    saveSoil(custom);
    const r = loadSoil();
    expect(r).toHaveLength(6);
    expect(r).toEqual(custom);
    // Verificación explícita campo a campo del último estrato (el que más
    // veces se cae en bugs de serialización cuando es el "extra"):
    expect(r[5]).toMatchObject({
      id: 6, type: 'cohesive', thickness: 10.0, gamma: 21.5,
      c: 200, phi: 28, Nspt: 50, su: 300, rflim: 0.35,
    });
  });

  it('save sobrescribe — el último save gana', () => {
    saveSoil(micropilesSoilDefaults);
    const modified: SoilLayer[] = [{ ...micropilesSoilDefaults[0], thickness: 99 }];
    saveSoil(modified);
    expect(loadSoil()).toEqual(modified);
  });

  it('save preserva decimales no-redondos (no hay rounding silencioso)', () => {
    const precise: SoilLayer[] = [
      { id: 1, type: 'granular', thickness: 2.345678, gamma: 19.999, c: 0, phi: 22.5, Nspt: 0, su: 0, rflim: 0.123456 },
    ];
    saveSoil(precise);
    const r = loadSoil();
    expect(r[0].thickness).toBe(2.345678);
    expect(r[0].rflim).toBe(0.123456);
  });
});
