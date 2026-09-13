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
  adoptarPerfilDeLaObra,
  cargarEstado,
  dejarMiPerfilEnLaObra,
  guardarEstado,
  guardarPerfilEstudio,
  leerPerfilEstudio,
  perfilDeLaObraDifiere,
  SCHEMA_VERSION,
  SCHEMA_VERSION_KEY,
  STORAGE_KEY,
} from '../../features/memoria-dbse/state';
import { diferenciasDePerfil, estadoPorDefecto, perfilEstudioPorDefecto, type PerfilEstudio } from '../../lib/memoria/estado';
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

describe('la clave global es de Mi estudio, no de la ficha', () => {
  it('guardar la ficha NO toca la clave global', () => {
    // Hasta el 13-09-2026 `guardarEstado` reflejaba `state.estudio` en la
    // clave: desde que la ficha no edita el perfil, eso sólo servía para que
    // una pestaña abierta con el perfil viejo pisara el nuevo con una tecla.
    guardarPerfilEstudio(afinado('el nuevo'));
    guardarEstado({ ...estadoPorDefecto(null), estudio: afinado('el viejo, de una pestaña rezagada') });

    expect(leerPerfilEstudio()?.programa.nombre).toBe('el nuevo');
  });

  it('editar el perfil en Mi estudio DESPUÉS del rescate y luego subir la versión conserva la última edición', () => {
    // 1. Estado viejo con el perfil de siempre: al abrir, se rescata.
    guardadoCon(VERSION_VIEJA, afinado('el de antes'));
    cargarEstado();
    expect(leerPerfilEstudio()?.programa.nombre).toBe('el de antes');

    // 2. El usuario cambia de programa en Mi estudio.
    guardarPerfilEstudio(afinado('el de ahora'));

    // 3. Llega la subida de versión y el estado se descarta.
    escribirClave(SCHEMA_VERSION_KEY, VERSION_VIEJA);

    expect(cargarEstado().estudio.programa.nombre).toBe('el de ahora');
  });
});

describe('la copia del perfil que trae la obra se conserva hasta que el usuario decide', () => {
  it('guardar la ficha no la sustituye por la proyección', () => {
    // El `.concreta` de un compañero, abierto aquí: la ficha carga con MI
    // perfil proyectado, y cualquier guardado —el efecto de forjados al entrar,
    // una tecla— escribía ese perfil encima de la copia de él. La banda de la
    // diferencia moría antes de que nadie decidiera nada.
    guardarPerfilEstudio(afinado('el mío'));
    guardadoCon(SCHEMA_VERSION, afinado('el suyo'));
    const s = cargarEstado();
    expect(s.estudio.programa.nombre).toBe('el mío');

    expect(guardarEstado(s)).toBe(true);

    expect(perfilDeLaObraDifiere()).toEqual(expect.arrayContaining(['el programa de cálculo']));
    // Y «Adoptar el de esta obra» sigue teniendo qué adoptar.
    expect(adoptarPerfilDeLaObra()).toBe(true);
    expect(leerPerfilEstudio()?.programa.nombre).toBe('el suyo');
  });

  it('«Dejar el mío» es la decisión persistida: la obra pasa a estar guardada con el de esta máquina', () => {
    guardarPerfilEstudio(afinado('el mío'));
    guardadoCon(SCHEMA_VERSION, afinado('el suyo'));
    expect(perfilDeLaObraDifiere()).not.toEqual([]);

    expect(dejarMiPerfilEnLaObra()).toBe(true);

    expect(perfilDeLaObraDifiere()).toEqual([]);
    expect(leerPerfilEstudio()?.programa.nombre).toBe('el mío');
  });

  it('una ficha nueva se guarda con el perfil de esta máquina, y desde entonces ésa es su copia', () => {
    guardarPerfilEstudio(afinado('el mío'));
    guardarEstado(cargarEstado());
    expect(perfilDeLaObraDifiere()).toEqual([]);

    // Afinarlo después es exactamente el caso «obras propias hechas antes de
    // afinarlo»: se avisa, y se decide.
    guardarPerfilEstudio(afinado('el mío, afinado'));
    expect(perfilDeLaObraDifiere()).toEqual(expect.arrayContaining(['el programa de cálculo']));
  });
});

describe('el perfil es del despacho, no de la obra', () => {
  it('lo que traiga el fichero NO manda: se imprime el de esta máquina', () => {
    // El `.concreta` de un compañero trae SU perfil dentro; la clave global no
    // viaja, porque es preferencia de esta máquina.
    guardarPerfilEstudio(afinado('el mío'));
    guardadoCon(SCHEMA_VERSION, afinado('el suyo'));

    expect(cargarEstado().estudio.programa.nombre).toBe('el mío');
  });

  it('pero se dice en qué se diferencian, para poder mirarlo', () => {
    guardarPerfilEstudio(perfilEstudioPorDefecto());
    guardadoCon(SCHEMA_VERSION, afinado('el suyo'));

    const d = perfilDeLaObraDifiere();
    expect(d).toContain('el programa de cálculo');
    expect(d).toContain('la redistribución de momentos');
    expect(d).toContain('el desplome límite');
    // Y lo que no cambia no se nombra.
    expect(d).not.toContain('las cuantías');
  });

  it('con el mismo perfil no hay nada que decir', () => {
    guardarPerfilEstudio(afinado());
    guardadoCon(SCHEMA_VERSION, afinado());
    expect(perfilDeLaObraDifiere()).toEqual([]);
  });

  it('«adoptar el de esta obra» lo promociona a la clave global', () => {
    guardarPerfilEstudio(perfilEstudioPorDefecto());
    guardadoCon(SCHEMA_VERSION, afinado('el suyo'));

    expect(adoptarPerfilDeLaObra()).toBe(true);
    expect(leerPerfilEstudio()?.programa.nombre).toBe('el suyo');
    expect(perfilDeLaObraDifiere()).toEqual([]);
  });

  it('diferenciasDePerfil compara por áreas, no campo a campo', () => {
    const a = perfilEstudioPorDefecto();
    expect(diferenciasDePerfil(a, a)).toEqual([]);
    expect(diferenciasDePerfil(a, { ...a, cuantias: 'otra cosa' })).toEqual(['las cuantías']);
  });
});
