/**
 * El contrato de publicación entre módulos: sobre versionado, lectura
 * defensiva y rechazo por versión. Nace con «Viento y nieve»; la ficha DB SE
 * y el cuadro de acciones lo consumirán tal cual.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { clavePublicacion, leerPublicacion, publicar, retirarPublicacion } from '../../lib/pub';

beforeEach(() => {
  localStorage.clear();
});

describe('publicar / leerPublicacion', () => {
  it('ida y vuelta con sobre completo: v, ts, modulo, obra y datos', () => {
    const antes = Date.now();
    const sobre = publicar('viento-nieve', 1, { qb: 0.42 }, { provincia: 'Madrid', ine: '28' });
    expect(sobre).not.toBeNull();
    expect(localStorage.getItem(clavePublicacion('viento-nieve'))).not.toBeNull();

    const leido = leerPublicacion<{ qb: number }>('viento-nieve');
    expect(leido).toEqual(sobre);
    expect(leido!.datos.qb).toBe(0.42);
    expect(leido!.obra).toEqual({ municipio: null, provincia: 'Madrid', ine: '28' });
    expect(Date.parse(leido!.ts)).toBeGreaterThanOrEqual(antes - 1000);
  });

  it('con la versión pedida: la buena pasa, la otra devuelve null', () => {
    publicar('viento-nieve', 2, {});
    expect(leerPublicacion('viento-nieve', 2)).not.toBeNull();
    expect(leerPublicacion('viento-nieve', 1)).toBeNull();
    expect(leerPublicacion('viento-nieve')).not.toBeNull();
  });

  it('no hay publicación, basura o sobre de otro módulo: null, nunca una excepción', () => {
    expect(leerPublicacion('materiales')).toBeNull();
    localStorage.setItem(clavePublicacion('materiales'), '{no es json');
    expect(leerPublicacion('materiales')).toBeNull();
    localStorage.setItem(clavePublicacion('materiales'), JSON.stringify({ v: 1 }));
    expect(leerPublicacion('materiales')).toBeNull();
    localStorage.setItem(
      clavePublicacion('materiales'),
      JSON.stringify({ v: 1, ts: 'x', modulo: 'otro', obra: {}, datos: {} }),
    );
    expect(leerPublicacion('materiales')).toBeNull();
  });

  it('retirar borra la clave', () => {
    publicar('viento-nieve', 1, {});
    retirarPublicacion('viento-nieve');
    expect(leerPublicacion('viento-nieve')).toBeNull();
  });

  it('la clave lleva el prefijo del capítulo', () => {
    expect(clavePublicacion('viento-nieve')).toBe('concreta-pub-viento-nieve');
  });
});
