/**
 * Importar un `.concreta.json` (eng-review T2): el fichero es entrada NO
 * confiable. Se valida con mensajes para el usuario, y al desplegar sólo
 * entran claves de proyecto: la clave BYOK del usuario no se toca.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { _reiniciarProyectoParaTests, desplegar, ErrorDeProyecto, importar, proyectoNuevo } from '../../lib/proyecto';
import { textoDeExportacion } from '../../lib/proyecto/fichero';
import { _reiniciarAlmacenParaTests, leerClave } from '../../lib/storage/seguro';

function ficheroCon(cambios: Record<string, unknown>): string {
  const base: Record<string, unknown> = {
    formato: 'concreta-proyecto',
    v: 1,
    id: 'de-un-colega',
    app: '260906.4',
    ts: '2026-09-07T10:00:00.000Z',
    nombre: 'Lo que diga el fichero',
    obra: { denominacion: 'Nave Z', municipio: 'Dos Hermanas' },
    claves: { 'rc-beams': '{"L":8}', 'rc-beams-version': '1' },
    esquemas: { 'rc-beams': '1' },
  };
  return JSON.stringify({ ...base, ...cambios });
}

beforeEach(() => {
  localStorage.clear();
  _reiniciarAlmacenParaTests();
  _reiniciarProyectoParaTests();
});

describe('importar', () => {
  it('un fichero manipulado con la clave BYOK dentro: se descarta, se cuenta, y la del usuario no cambia', () => {
    localStorage.setItem('concreta-ai-settings', '{"key":"sk-mia"}');
    localStorage.setItem('concreta-theme', 'dark');
    const p = importar(
      ficheroCon({
        claves: {
          'rc-beams': '{"L":8}',
          'concreta-ai-settings': '{"key":"sk-robada"}',
          'concreta-theme': 'light',
          'concreta-proyectos': '[]',
        },
      }),
    );
    const r = desplegar(p);
    expect(r.ok).toBe(true);
    expect(r.escritas).toBe(1);
    expect(r.descartadas.sort()).toEqual(['concreta-ai-settings', 'concreta-proyectos', 'concreta-theme']);
    expect(leerClave('concreta-ai-settings')).toBe('{"key":"sk-mia"}');
    expect(leerClave('concreta-theme')).toBe('dark');
    expect(leerClave('rc-beams')).toBe('{"L":8}');
  });

  it('el nombre se rederiva de la denominación: dos copias del mismo dato divergen', () => {
    expect(importar(ficheroCon({})).nombre).toBe('Nave Z');
    expect(importar(ficheroCon({ obra: { denominacion: '' } })).nombre).toBe('Sin nombre');
  });

  it('la obra se normaliza y lo que falta cae al vacío, nunca lanza', () => {
    const p = importar(ficheroCon({ obra: { denominacion: 'Solo nombre', ine: '12', altitud: 'alto' } }));
    expect(p.obra).toEqual({ denominacion: 'Solo nombre', municipio: '', ine: null, provincia: '', altitud: null, uso: '' });
    expect(importar(ficheroCon({ obra: 'nada' })).obra.denominacion).toBe('');
  });

  it('valores que no son cadena se descartan; esquemas es opcional', () => {
    const p = importar(ficheroCon({ claves: { 'rc-beams': 5, 'rc-columns': '{}' }, esquemas: undefined }));
    expect(p.claves).toEqual({ 'rc-columns': '{}' });
    expect(p.esquemas).toEqual({});
  });

  it('rechaza con un mensaje lo que no es un proyecto', () => {
    expect(() => importar('{no es json')).toThrow(/JSON/);
    expect(() => importar('[]')).toThrow(ErrorDeProyecto);
    expect(() => importar(ficheroCon({ formato: 'otro' }))).toThrow(/cabecera/);
    expect(() => importar(ficheroCon({ v: 2 }))).toThrow(/versión del formato \(2\)/);
    expect(() => importar(ficheroCon({ id: 'activo' }))).toThrow(/identificador/);
    expect(() => importar(ficheroCon({ id: 'a/b' }))).toThrow(/identificador/);
    expect(() => importar(ficheroCon({ id: 7 }))).toThrow(/identificador/);
    expect(() => importar(ficheroCon({ claves: 'nada' }))).toThrow(/bloque de claves/);
  });

  it('lo que exporta la app se importa tal cual', () => {
    const p = proyectoNuevo('Ida y vuelta');
    p.claves = { forjados: '{"x":1}', 'forjados-version': '1' };
    p.esquemas = { forjados: '1' };
    expect(importar(textoDeExportacion(p))).toEqual(p);
  });
});
