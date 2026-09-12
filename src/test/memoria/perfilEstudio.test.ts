/**
 * El rescate del perfil del despacho (F0 del rediseño del panel de obra).
 *
 * El perfil vivía DENTRO del estado de la ficha DB SE, y `cargarEstado()`
 * descarta el estado entero cuando la versión de esquema no cuadra. La próxima
 * fase sube esa versión a sabiendas, así que sin este rescate todo el mundo se
 * despertaría con la plantilla colegial y sin forma de recuperar lo suyo.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { CLAVE_ESTUDIO } from '../../data/proyectoKeys';
import {
  cargarEstado,
  guardarEstado,
  guardarPerfilEstudio,
  leerPerfilEstudio,
  SCHEMA_VERSION,
  SCHEMA_VERSION_KEY,
  STORAGE_KEY,
} from '../../features/memoria-dbse/state';
import { estadoPorDefecto, perfilEstudioPorDefecto, type PerfilEstudio } from '../../lib/memoria/estado';
import { _reiniciarAlmacenParaTests, escribirClave, leerClave } from '../../lib/storage/seguro';

/** Un perfil que costó una tarde: otro programa, otra redistribución, otro desplome. */
function afinado(nombre = 'Tricalc'): PerfilEstudio {
  const p = perfilEstudioPorDefecto();
  return {
    ...p,
    programa: { ...p.programa, nombre, empresa: 'Ramírez Bandera S.L.P.' },
    redistribucion: 10,
    desplome: '1/750',
  };
}

/** Deja en el almacén un estado guardado con esa versión de esquema y ese perfil dentro. */
function guardadoCon(version: string, estudio: unknown): void {
  escribirClave(STORAGE_KEY, JSON.stringify({ ...estadoPorDefecto(null), estudio }));
  escribirClave(SCHEMA_VERSION_KEY, version);
}

/** Cualquier versión que no sea la viva: es lo que hará la subida de la fase siguiente. */
const VERSION_VIEJA = `${SCHEMA_VERSION}-vieja`;

beforeEach(() => {
  localStorage.clear();
  _reiniciarAlmacenParaTests();
});

describe('el perfil del despacho sobrevive al descarte por versión', () => {
  it('un estado de una versión anterior deja SU perfil en la clave global, no el colegial', () => {
    guardadoCon(VERSION_VIEJA, afinado());

    const estado = cargarEstado();

    expect(leerPerfilEstudio()?.programa.nombre).toBe('Tricalc');
    expect(leerPerfilEstudio()?.desplome).toBe('1/750');
    // Y la ficha que se le devuelve al usuario arranca ya con ese perfil.
    expect(estado.estudio.programa.empresa).toBe('Ramírez Bandera S.L.P.');
    expect(estado.estudio.redistribucion).toBe(10);
  });

  it('el rescate NO pisa un perfil global que ya existe', () => {
    guardarPerfilEstudio(afinado('el bueno'));
    guardadoCon(VERSION_VIEJA, afinado('el viejo de dentro del estado'));

    cargarEstado();

    expect(leerPerfilEstudio()?.programa.nombre).toBe('el bueno');
  });

  it('un estado sin perfil dentro no escribe nada: la clave sigue libre para el rescate de verdad', () => {
    escribirClave(STORAGE_KEY, JSON.stringify({ obra: {}, ayuda: true }));
    escribirClave(SCHEMA_VERSION_KEY, VERSION_VIEJA);

    cargarEstado();

    expect(leerClave(CLAVE_ESTUDIO)).toBeNull();
  });

  it('sin nada guardado, el perfil es el colegial y la clave global no se inventa', () => {
    expect(cargarEstado().estudio).toEqual(perfilEstudioPorDefecto());
    expect(leerPerfilEstudio()).toBeNull();
  });
});

describe('la clave global se mantiene al día', () => {
  it('guardar la ficha refleja el perfil en la clave global', () => {
    guardarEstado({ ...estadoPorDefecto(null), estudio: afinado() });

    expect(leerPerfilEstudio()?.desplome).toBe('1/750');
  });

  it('editar el perfil DESPUÉS del rescate y luego subir la versión conserva la última edición', () => {
    // 1. Estado viejo con el perfil de siempre: al abrir, se rescata.
    guardadoCon(VERSION_VIEJA, afinado('el de antes'));
    const rescatado = cargarEstado();
    expect(leerPerfilEstudio()?.programa.nombre).toBe('el de antes');

    // 2. El usuario cambia de programa de cálculo y la ficha se guarda con la
    //    versión viva. Sin la sincronización de `guardarEstado`, la clave
    //    global se quedaría en «el de antes».
    guardarEstado({ ...rescatado, estudio: afinado('el de ahora') });

    // 3. Llega la subida de versión y el estado se descarta.
    escribirClave(SCHEMA_VERSION_KEY, VERSION_VIEJA);

    expect(cargarEstado().estudio.programa.nombre).toBe('el de ahora');
  });
});
