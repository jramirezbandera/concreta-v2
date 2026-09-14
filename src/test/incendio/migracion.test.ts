/**
 * La mudanza del fuego, que es la parte con riesgo de verdad: mueve datos que
 * ya están en obras reales.
 *
 * Nadie debe perder la R que escribió la semana pasada, y nadie debe ver
 * reaparecer la que borró a propósito. Las dos cosas dependen de la misma
 * marca, `concreta-incendio-migrado`, y de que sea un SATÉLITE DE PROYECTO:
 * `desplegar()` reemplaza las claves de proyecto al abrir un `.concreta`, así
 * que una marca global suprimiría la migración en la obra siguiente.
 *
 * Se prueban las tres generaciones que puede traer lo guardado:
 *
 *   1. `resistenciaFuego`, un número suelto (hasta el 10-09-2026);
 *   2. `exigenciasFuego`, la lista con ámbito (hasta el 13-09-2026);
 *   3. `exigenciasFuegoLegado`, ya jubilada.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { leerExigenciasFuegoLegado } from '../../features/materiales/legadoFuego';
import {
  SCHEMA_VERSION_KEY as MAT_VERSION_KEY,
  STORAGE_KEY as MAT_KEY,
} from '../../features/materiales/state';
import {
  CLAVE_MIGRADO,
  SCHEMA_VERSION,
  SCHEMA_VERSION_KEY,
  STORAGE_KEY,
  adoptarLegado,
  cargarEstado,
  defaultIncendioState,
} from '../../features/incendio/state';
import { AMBITO_TODA_LA_ESTRUCTURA } from '../../lib/incendio/exigencias';
import { escribirClave } from '../../lib/storage/seguro';

/** Deja escrito un cuadro de materiales de la generación que se le pida. */
function cuadroGuardado(campos: Record<string, unknown>) {
  escribirClave(MAT_KEY, JSON.stringify(campos));
  escribirClave(MAT_VERSION_KEY, '1');
}

function incendioGuardado(estado: unknown) {
  escribirClave(STORAGE_KEY, JSON.stringify(estado));
  escribirClave(SCHEMA_VERSION_KEY, SCHEMA_VERSION);
}

beforeEach(() => {
  localStorage.clear();
});

describe('las claves del cuadro de materiales, escritas a mano', () => {
  it('siguen siendo las de verdad', () => {
    // `legadoFuego.ts` no puede resolverlas por `entradaDe()` —el guardia de
    // proyectoKeys clasifica cada argumento de `leerClave` y una clave
    // dinámica cae fuera—, así que van literales. Este test es el pegamento.
    expect(MAT_KEY).toBe('concreta-materiales-model');
    expect(MAT_VERSION_KEY).toBe('concreta-materiales-model-version');
  });
});

describe('leer el legado', () => {
  it('la R suelta se hereda como una exigencia de toda la estructura', () => {
    cuadroGuardado({ resistenciaFuego: 60 });
    expect(leerExigenciasFuegoLegado()).toEqual([
      { ambito: AMBITO_TODA_LA_ESTRUCTURA, minutos: 60 },
    ]);
  });

  it('la lista con ámbito se hereda entera, y las filas a medias se caen', () => {
    cuadroGuardado({
      exigenciasFuego: [
        { id: 'f1', ambito: 'Sótano', minutos: 120 },
        { id: 'f2', ambito: 'Cubierta', minutos: null },
        { id: 'f3', ambito: '   ', minutos: 60 },
      ],
    });
    expect(leerExigenciasFuegoLegado()).toEqual([{ ambito: 'Sótano', minutos: 120 }]);
  });

  it('la lista ya jubilada manda sobre la vieja', () => {
    cuadroGuardado({
      exigenciasFuegoLegado: [{ id: 'f1', ambito: 'Sótano', minutos: 90 }],
      exigenciasFuego: [{ id: 'f9', ambito: 'Vieja', minutos: 30 }],
    });
    expect(leerExigenciasFuegoLegado()).toEqual([{ ambito: 'Sótano', minutos: 90 }]);
  });

  it('una R que no estaba en el desplegable viejo no se hereda', () => {
    cuadroGuardado({ resistenciaFuego: 45 });
    expect(leerExigenciasFuegoLegado()).toEqual([]);
    cuadroGuardado({ resistenciaFuego: 'R60' });
    expect(leerExigenciasFuegoLegado()).toEqual([]);
  });

  it('sin cuadro guardado, o con otra versión de esquema, no hay legado', () => {
    expect(leerExigenciasFuegoLegado()).toEqual([]);
    escribirClave(MAT_KEY, JSON.stringify({ resistenciaFuego: 60 }));
    escribirClave(MAT_VERSION_KEY, '2');
    expect(leerExigenciasFuegoLegado()).toEqual([]);
  });

  it('de un JSON roto no sale una excepción, sale nada', () => {
    escribirClave(MAT_KEY, '{ esto no es json');
    escribirClave(MAT_VERSION_KEY, '1');
    expect(leerExigenciasFuegoLegado()).toEqual([]);
  });
});

describe('adoptarLegado', () => {
  it('no pisa lo que ya haya en el módulo', () => {
    const base = { ...defaultIncendioState(), exigencias: [{ id: 'x', ambito: 'Mía', minutos: 30 }] };
    expect(adoptarLegado(base, [{ ambito: 'Sótano', minutos: 120 }])).toBe(base);
  });

  it('sin legado devuelve el mismo objeto', () => {
    const base = defaultIncendioState();
    expect(adoptarLegado(base, [])).toBe(base);
  });
});

describe('la migración al cargar', () => {
  it('adopta el legado la primera vez y deja la marca', () => {
    cuadroGuardado({ exigenciasFuego: [{ id: 'f1', ambito: 'Sótano', minutos: 120 }] });
    const s = cargarEstado();
    expect(s.exigencias).toEqual([
      { id: expect.any(String), ambito: 'Sótano', minutos: 120 },
    ]);
    expect(localStorage.getItem(CLAVE_MIGRADO)).toBe('1');
  });

  it('no duplica al volver a cargar', () => {
    cuadroGuardado({ exigenciasFuego: [{ id: 'f1', ambito: 'Sótano', minutos: 120 }] });
    cargarEstado();
    expect(cargarEstado().exigencias).toHaveLength(1);
    expect(cargarEstado().exigencias).toHaveLength(1);
  });

  it('lo borrado a propósito NO reaparece', () => {
    // Es el caso que obliga a que la marca sea explícita: si fuese implícita
    // («ya hay modelo de incendio»), al quedarse el módulo sin exigencias
    // volvería a mirar el cuadro de materiales y las resucitaría.
    cuadroGuardado({ exigenciasFuego: [{ id: 'f1', ambito: 'Sótano', minutos: 120 }] });
    cargarEstado();
    incendioGuardado({ exigencias: [], ayuda: false });
    expect(cargarEstado().exigencias).toEqual([]);
  });

  it('la marca se pone aunque no hubiera legado que adoptar', () => {
    expect(cargarEstado().exigencias).toEqual([]);
    expect(localStorage.getItem(CLAVE_MIGRADO)).toBe('1');
  });

  it('lo adoptado queda guardado, no sólo devuelto', () => {
    cuadroGuardado({ resistenciaFuego: 90 });
    cargarEstado();
    const guardado = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    expect(guardado.exigencias).toEqual([
      { id: expect.any(String), ambito: AMBITO_TODA_LA_ESTRUCTURA, minutos: 90 },
    ]);
  });
});
