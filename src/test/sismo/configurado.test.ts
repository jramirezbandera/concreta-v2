/**
 * Cuándo el sismo tiene algo que decir de ESTA obra.
 *
 * Tres líneas base: el arranque (el edificio del ejemplo SIN municipio), el
 * blanco (una planta, sin municipio, ab = 0) y el emplazamiento pendiente.
 * Ninguna es un cálculo. Hasta el 13-09-2026 sólo se comparaba con la primera,
 * así que un sismo en blanco pasaba por configurado y publicaba un sismo exento
 * como si alguien lo hubiera calculado.
 *
 * Desde el 15-09-2026 el emplazamiento NO configura: el municipio puede llegar
 * de la obra sin que nadie lo elija, y si contara, abrir el módulo con la obra
 * en Sevilla publicaría las diez plantas de 300 m² del ejemplo como un cálculo
 * de esa obra. Lo que configura es tocar el edificio con el emplazamiento
 * resuelto.
 */

import { describe, expect, it } from 'vitest';
import {
  blankSeismicState,
  defaultSeismicState,
  ejemploSeismicState,
  emplazamientoPendiente,
  esEnBlanco,
  esEstadoInicial,
  estaConfigurado,
} from '../../features/seismic-ncse02/state';

const sevilla = { municipioIne: '41091', municipioNombre: 'Sevilla', ab: 0.07 };

describe('estaConfigurado (sismo)', () => {
  it('el arranque no está configurado, y tiene el emplazamiento pendiente', () => {
    const d = defaultSeismicState();
    expect(esEstadoInicial(d)).toBe(true);
    expect(emplazamientoPendiente(d)).toBe(true);
    expect(estaConfigurado(d)).toBe(false);
  });

  it('el ejemplo (Granada) es el mismo edificio: tampoco', () => {
    const e = ejemploSeismicState();
    expect(esEstadoInicial(e)).toBe(true);
    expect(emplazamientoPendiente(e)).toBe(false);
    expect(estaConfigurado(e)).toBe(false);
  });

  it('el blanco tampoco', () => {
    const b = blankSeismicState();
    expect(esEstadoInicial(b)).toBe(false);
    expect(esEnBlanco(b)).toBe(true);
    expect(estaConfigurado(b)).toBe(false);
  });

  it('elegir municipio sobre el edificio de arranque NO configura', () => {
    expect(estaConfigurado({ ...defaultSeismicState(), ...sevilla })).toBe(false);
  });

  it('tocar el edificio sin emplazamiento tampoco: la puerta está sin decidir', () => {
    const s = { ...defaultSeismicState(), H: 24 };
    expect(esEstadoInicial(s)).toBe(false);
    expect(emplazamientoPendiente(s)).toBe(true);
    expect(estaConfigurado(s)).toBe(false);
  });

  it('edificio tocado + municipio, o ab a mano, ya es configurar', () => {
    expect(estaConfigurado({ ...defaultSeismicState(), ...sevilla, H: 24 })).toBe(true);
    expect(estaConfigurado({ ...blankSeismicState(), ab: 0.12, K: 1 })).toBe(true);
  });
});
