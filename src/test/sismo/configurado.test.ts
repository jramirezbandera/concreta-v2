/**
 * Cuándo el sismo tiene algo que decir de ESTA obra.
 *
 * Dos líneas base, como pedía E13: el arranque (Granada, ab = 0,23 g, diez
 * plantas) y el blanco (sin municipio, ab = 0). Ninguna de las dos es un
 * cálculo. Hasta el 13-09-2026 sólo se comparaba con la primera, así que un
 * sismo en blanco pasaba por configurado y publicaba un sismo exento como si
 * alguien lo hubiera calculado.
 */

import { describe, expect, it } from 'vitest';
import { blankSeismicState, defaultSeismicState, esEnBlanco, esEstadoInicial, estaConfigurado } from '../../features/seismic-ncse02/state';

describe('estaConfigurado (sismo)', () => {
  it('el arranque no está configurado', () => {
    expect(esEstadoInicial(defaultSeismicState())).toBe(true);
    expect(estaConfigurado(defaultSeismicState())).toBe(false);
  });

  it('el blanco tampoco', () => {
    const b = blankSeismicState();
    expect(esEstadoInicial(b)).toBe(false);
    expect(esEnBlanco(b)).toBe(true);
    expect(estaConfigurado(b)).toBe(false);
  });

  it('elegir otro municipio, o meter ab a mano, ya es configurar', () => {
    expect(estaConfigurado({ ...defaultSeismicState(), municipioIne: '41004', municipioNombre: 'Sevilla', ab: 0.07 })).toBe(true);
    expect(estaConfigurado({ ...blankSeismicState(), ab: 0.12, K: 1 })).toBe(true);
  });
});
