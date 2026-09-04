/**
 * El contexto de obra compartido (`concreta-obra`): lectura defensiva y
 * fusión de cambios. Los módulos lo heredan como valor por defecto.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { guardarObra, leerObra, normalizarObra, OBRA_KEY, obraConEmplazamiento, obraVacia } from '../../lib/obra';

beforeEach(() => {
  localStorage.clear();
});

describe('leerObra / guardarObra', () => {
  it('sin obra guardada: null', () => {
    expect(leerObra()).toBeNull();
    expect(obraConEmplazamiento(null)).toBe(false);
  });

  it('guardar funde con lo anterior y lee lo mismo', () => {
    guardarObra({ provincia: '41', municipio: 'Sevilla', altitud: 10 });
    guardarObra({ denominacion: 'Bloque de 24 viviendas' });
    expect(leerObra()).toEqual({
      ...obraVacia(),
      provincia: '41',
      municipio: 'Sevilla',
      altitud: 10,
      denominacion: 'Bloque de 24 viviendas',
    });
    expect(obraConEmplazamiento(leerObra())).toBe(true);
  });

  it('basura, versión desconocida o campos de otro tipo: se cae al vacío sin lanzar', () => {
    localStorage.setItem(OBRA_KEY, '{');
    expect(leerObra()).toBeNull();
    localStorage.setItem(OBRA_KEY, JSON.stringify({ v: 99, obra: { provincia: '28' } }));
    expect(leerObra()).toBeNull();
    expect(normalizarObra({ provincia: 'Madrid', altitud: 'alta', ine: '28', municipio: 3 })).toEqual(obraVacia());
    expect(normalizarObra({ provincia: '28', altitud: 660, ine: '28079' })).toMatchObject({
      provincia: '28',
      altitud: 660,
      ine: '28079',
    });
  });
});
