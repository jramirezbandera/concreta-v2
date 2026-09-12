/**
 * Por dónde entra la app.
 *
 * `start_url` del manifiesto es `/`, y `/` pinta la landing comercial: el
 * usuario que abre Concreta el lunes NO pasa por el comodín de `App.tsx`,
 * llega a la landing y entra por un CTA. Por eso la ruta de entrada tiene que
 * mirar si hay obra en vez de ser una constante.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { CLAVE_PROYECTO_ACTIVO } from '../../data/proyectoKeys';
import { hayObra, RUTA_OBRA, rutaDeEntrada } from '../../lib/obra/entrada';
import { guardarObra } from '../../lib/obra';
import { APP_ROUTE } from '../../pages/landing/constants';
import { _reiniciarAlmacenParaTests, escribirClave } from '../../lib/storage/seguro';

beforeEach(() => {
  localStorage.clear();
  _reiniciarAlmacenParaTests();
});

describe('rutaDeEntrada', () => {
  it('sin obra, exactamente donde aterrizaba antes: el visitante frío no cambia de sitio', () => {
    expect(hayObra()).toBe(false);
    expect(rutaDeEntrada()).toBe(APP_ROUTE);
  });

  it('con una obra guardada, su panel', () => {
    escribirClave(CLAVE_PROYECTO_ACTIVO, 'abc-123');
    expect(rutaDeEntrada()).toBe(RUTA_OBRA);
  });

  it('con datos de obra tecleados y sin guardarla todavía, también', () => {
    guardarObra({ denominacion: 'Nave en Dos Hermanas' });
    expect(rutaDeEntrada()).toBe(RUTA_OBRA);
  });

  it('una obra vacía de verdad no cuenta', () => {
    guardarObra({ uso: 'Nave industrial' });
    expect(rutaDeEntrada()).toBe(APP_ROUTE);
  });

  it('basura en la clave no lanza', () => {
    escribirClave('concreta-obra', '{no es json');
    expect(rutaDeEntrada()).toBe(APP_ROUTE);
  });
});
