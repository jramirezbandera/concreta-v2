/**
 * Los adaptadores del anejo (`lib/anejo/modules`): uno por entrada de la tabla
 * de claves y ninguno de más, los cinco capítulos de la MEMORIA JUSTIFICATIVA
 * y sólo ellos en `memoria`, y las dos lecturas del estado que el anejo
 * necesita: el título guardado y la huella que decide «RECALCULAR».
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { moduleRegistry } from '../../data/moduleRegistry';
import { CLAVES_PROYECTO, entradaDe, MODULOS_SIN_REGISTRO } from '../../data/proyectoKeys';
import { clavesDeDato, datosDeModulo, definirAdaptador, huellaDeModulo } from '../../lib/anejo/adaptador';
import { ADAPTADORES_ANEJO, adaptadorDe, buscarAdaptador } from '../../lib/anejo/modules';
import { _reiniciarAlmacenParaTests } from '../../lib/storage/seguro';

/** Los enumerados en el design doc (F6) como capítulos de la memoria justificativa. */
const MEMORIA_JUSTIFICATIVA = [
  'concreta-materiales',
  'concreta-viento-nieve',
  'concreta-cargas-planta',
  'concreta-seismic',
  'concreta-memoria-dbse',
];

beforeEach(() => {
  localStorage.clear();
  _reiniciarAlmacenParaTests();
});

describe('cobertura de la tabla', () => {
  it('hay exactamente un adaptador por entrada de CLAVES_PROYECTO (menos el propio anejo), y ninguno de más', () => {
    const esperados = CLAVES_PROYECTO.map((e) => e.modulo).filter((m) => !MODULOS_SIN_REGISTRO.includes(m));
    const modulos = ADAPTADORES_ANEJO.map((a) => a.modulo);
    expect([...modulos].sort()).toEqual([...esperados].sort());
    expect(new Set(modulos).size).toBe(modulos.length);
  });

  it('cada adaptador apunta a su fila de la tabla y a un módulo del registro', () => {
    for (const a of ADAPTADORES_ANEJO) {
      expect(a.entrada, a.modulo).toBe(entradaDe(a.modulo));
      expect(moduleRegistry.some((m) => m.key === a.modulo), `${a.modulo} no está en moduleRegistry`).toBe(true);
    }
  });

  it('los cinco capítulos de la MEMORIA JUSTIFICATIVA, y sólo ellos, van a la sección memoria', () => {
    const memoria = ADAPTADORES_ANEJO.filter((a) => a.seccion === 'memoria').map((a) => a.modulo);
    expect([...memoria].sort()).toEqual([...MEMORIA_JUSTIFICATIVA].sort());
  });

  it('los capítulos tienen rótulo, y ninguno se repite', () => {
    const capitulos = ADAPTADORES_ANEJO.map((a) => a.capitulo);
    for (const c of capitulos) expect(c.trim().length).toBeGreaterThan(0);
    expect(new Set(capitulos).size).toBe(capitulos.length);
  });

  it('adaptadorDe lanza y buscarAdaptador devuelve undefined con un módulo desconocido', () => {
    expect(() => adaptadorDe('concreta-no-existe')).toThrow(/no tiene adaptador/);
    expect(buscarAdaptador('concreta-no-existe')).toBeUndefined();
    expect(adaptadorDe('concreta-rc-beams').capitulo).toBe('Vigas de hormigón');
  });

  it('definirAdaptador lanza si el módulo no está en la tabla o no declara capítulo', () => {
    expect(() => definirAdaptador({ modulo: 'concreta-no-existe', seccion: 'piezas', capitulo: 'X' })).toThrow(/CLAVES_PROYECTO/);
    expect(() => definirAdaptador({ modulo: 'concreta-rc-beams', seccion: 'piezas', capitulo: '  ' })).toThrow(/capítulo/);
  });
});

describe('tituloGuardado', () => {
  it('un módulo de useModuleState lee `title` de su estado', () => {
    const a = adaptadorDe('concreta-rc-beams');
    expect(a.tituloGuardado()).toBeNull();
    localStorage.setItem('rc-beams', JSON.stringify({ title: '  Viga V-1 ', L: 6 }));
    expect(a.tituloGuardado()).toBe('Viga V-1');
    localStorage.setItem('rc-beams', JSON.stringify({ title: '', L: 6 }));
    expect(a.tituloGuardado()).toBeNull();
    localStorage.setItem('rc-beams', 'esto no es json');
    expect(a.tituloGuardado()).toBeNull();
  });

  it('un módulo de useDocTitle lee su satélite *-title', () => {
    const a = adaptadorDe('concreta-slope-stability');
    localStorage.setItem('concreta-slope-stability', JSON.stringify({ title: 'no cuenta' }));
    expect(a.tituloGuardado()).toBeNull();
    localStorage.setItem('concreta-slope-title', 'Talud norte');
    expect(a.tituloGuardado()).toBe('Talud norte');
  });

  it('la ficha DB SE no tiene título: null siempre', () => {
    localStorage.setItem('concreta-memoria-dbse-model', JSON.stringify({ title: 'no cuenta' }));
    expect(adaptadorDe('concreta-memoria-dbse').tituloGuardado()).toBeNull();
  });
});

describe('huellaDeModulo', () => {
  it('null sin nada guardado; cambia con el estado; no cambia con el título', () => {
    const a = adaptadorDe('concreta-rc-beams');
    expect(huellaDeModulo(a)).toBeNull();
    localStorage.setItem('rc-beams', JSON.stringify({ title: 'V-1', L: 6 }));
    const h1 = huellaDeModulo(a);
    expect(h1).toMatch(/^[0-9a-f]{8}$/);
    localStorage.setItem('rc-beams', JSON.stringify({ L: 6, title: 'Otro nombre' }));
    expect(huellaDeModulo(a)).toBe(h1);
    localStorage.setItem('rc-beams', JSON.stringify({ title: 'V-1', L: 7 }));
    expect(huellaDeModulo(a)).not.toBe(h1);
  });

  it('el satélite de dato entra (suelo de micropilotes); el título y el sobre publicado, no', () => {
    const micro = adaptadorDe('concreta-micropiles');
    localStorage.setItem('micropiles', JSON.stringify({ n: 4 }));
    const h1 = huellaDeModulo(micro);
    localStorage.setItem('concreta-micropiles-soil', '[{"id":1}]');
    const h2 = huellaDeModulo(micro);
    expect(h2).not.toBe(h1);

    const viento = adaptadorDe('concreta-viento-nieve');
    localStorage.setItem('concreta-viento-nieve-model', JSON.stringify({ v: 1 }));
    const v1 = huellaDeModulo(viento);
    localStorage.setItem('concreta-viento-nieve-title', 'Nave');
    localStorage.setItem('concreta-pub-viento-nieve', '{"sobre":1}');
    expect(huellaDeModulo(viento)).toBe(v1);
  });

  it('un estado que no es JSON también tiene huella', () => {
    const a = adaptadorDe('concreta-fem-2d');
    localStorage.setItem('concreta-fem-2d-design', 'crudo');
    expect(huellaDeModulo(a)).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('los datos que la pieza se lleva', () => {
  it('son la clave principal y sus satélites, sin los sobres publicados', () => {
    expect(clavesDeDato(adaptadorDe('concreta-viento-nieve').entrada)).toEqual([
      'concreta-viento-nieve-model',
      'concreta-viento-nieve-title',
    ]);
    expect(clavesDeDato(adaptadorDe('concreta-micropiles').entrada)).toEqual(['micropiles', 'concreta-micropiles-soil']);
    expect(clavesDeDato(adaptadorDe('concreta-rc-beams').entrada)).toEqual(['rc-beams']);
  });

  it('guardan el nombre del documento y la versión de esquema, que la huella no mira', () => {
    const viento = adaptadorDe('concreta-viento-nieve');
    localStorage.setItem('concreta-viento-nieve-model', '{"v":1}');
    localStorage.setItem('concreta-viento-nieve-model-version', '1');
    localStorage.setItem('concreta-viento-nieve-title', 'Nave en Ávila');
    localStorage.setItem('concreta-pub-viento-nieve', '{"sobre":1}');
    expect(datosDeModulo(viento)).toEqual({
      'concreta-viento-nieve-model': '{"v":1}',
      'concreta-viento-nieve-title': 'Nave en Ávila',
      'concreta-viento-nieve-model-version': '1',
    });
  });

  it('sin estado guardado no hay datos, y la versión sola no cuenta como estado', () => {
    const vigas = adaptadorDe('concreta-rc-beams');
    expect(datosDeModulo(vigas)).toBeNull();
    localStorage.setItem('rc-beams-version', '1');
    expect(datosDeModulo(vigas)).toBeNull();
  });

  it('en los 25 módulos: toda clave de dato entra en el snapshot, y mueve la huella salvo la del nombre', () => {
    for (const a of ADAPTADORES_ANEJO) {
      for (const clave of clavesDeDato(a.entrada)) {
        localStorage.clear();
        _reiniciarAlmacenParaTests();
        localStorage.setItem(a.entrada.clave, '{"x":1}');
        const antes = huellaDeModulo(a);
        localStorage.setItem(clave, clave === a.entrada.clave ? '{"x":2}' : 'valor');
        const donde = `${a.modulo} / ${clave}`;
        const datos = datosDeModulo(a);
        expect(datos, donde).not.toBeNull();
        expect(Object.keys(datos!), donde).toContain(clave);
        if (clave.endsWith('-title')) expect(huellaDeModulo(a), donde).toBe(antes);
        else expect(huellaDeModulo(a), donde).not.toBe(antes);
      }
    }
  });
});
