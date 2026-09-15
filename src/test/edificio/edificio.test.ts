/**
 * El edificio compartido (`concreta-edificio`): lectura defensiva, las cotas
 * que se derivan de las alturas, los forjados que ve el viento, el store que
 * avisa en la misma pestaña, y que la clave viaja en el `.concreta` como
 * satélite de Cargas por planta.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CLAVE_EDIFICIO } from '../../data/proyectoKeys';
import {
  ALTURA_PLANTA_TIPO,
  alturasQueFaltan,
  cotasEdificio,
  EDIFICIO_KEY,
  edificioInicial,
  esEdificioInicial,
  forjadosSobreRasante,
  guardarEdificio,
  instantaneaEdificio,
  leerEdificio,
  mismoEdificio,
  normalizarEdificio,
  suscribirEdificio,
  type Edificio,
  type PlantaEdificio,
  type TipoPlanta,
} from '../../lib/edificio';
import { _reiniciarProyectoParaTests, desplegar, proyectoNuevo, serializar } from '../../lib/proyecto';
import { _reiniciarAlmacenParaTests } from '../../lib/storage/seguro';

beforeEach(() => {
  localStorage.clear();
  _reiniciarAlmacenParaTests();
  _reiniciarProyectoParaTests();
});

/** Una planta de prueba, con id explícito para poder comparar. */
const planta = (id: string, nombre: string, tipo: TipoPlanta, altura: number | null): PlantaEdificio => ({ id, nombre, tipo, altura });

/** Dos plantas y su cubierta, de arriba abajo: el edificio de arranque con ids fijos. */
const tres = (): Edificio => ({
  plantas: [planta('c', 'Cubierta', 'cubierta', null), planta('p1', 'Planta Primera', 'planta', 3), planta('pb', 'Planta Baja', 'planta', 3)],
});

describe('lectura defensiva', () => {
  it('sin nada guardado: null; con basura o con otra versión: null; y lo guardado se lee igual', () => {
    expect(leerEdificio()).toBeNull();
    localStorage.setItem(EDIFICIO_KEY, '{');
    expect(leerEdificio()).toBeNull();
    localStorage.setItem(EDIFICIO_KEY, JSON.stringify({ v: 99, plantas: [] }));
    expect(leerEdificio()).toBeNull();
    guardarEdificio(tres());
    expect(leerEdificio()).toEqual(tres());
    expect(EDIFICIO_KEY).toBe(CLAVE_EDIFICIO);
  });

  it('normalizar tolera campo a campo: tipo desconocido → planta, altura rara → null, id nuevo si falta', () => {
    const e = normalizarEdificio({ plantas: [{ nombre: 'Ático', tipo: 'terraza', altura: 'alta' }, { id: 'x', tipo: 'sotano', altura: -2 }, 'no'] });
    expect(e.plantas.map((p) => [p.nombre, p.tipo, p.altura])).toEqual([
      ['Ático', 'planta', null],
      ['Planta 2', 'sotano', null],
      ['Planta 3', 'planta', null],
    ]);
    expect(e.plantas[0].id).toMatch(/^p/);
    expect(e.plantas[1].id).toBe('x');
    expect(normalizarEdificio(null)).toEqual({ plantas: [] });
    expect(normalizarEdificio({ plantas: 'no' })).toEqual({ plantas: [] });
  });

  it('el de arranque se reconoce por contenido, no por ids, y deja de serlo al tocar una altura', () => {
    const a = edificioInicial();
    const b = edificioInicial();
    expect(a.plantas.map((p) => p.id)).not.toEqual(b.plantas.map((p) => p.id));
    expect(esEdificioInicial(a)).toBe(true);
    expect(esEdificioInicial(b)).toBe(true);
    expect(esEdificioInicial(tres())).toBe(true);
    b.plantas[2].altura = 3.5;
    expect(esEdificioInicial(b)).toBe(false);
    expect(ALTURA_PLANTA_TIPO).toBe(3);
  });

  it('mismoEdificio compara planta a planta, ids incluidos', () => {
    expect(mismoEdificio(tres(), tres())).toBe(true);
    expect(mismoEdificio(tres(), null)).toBe(false);
    expect(mismoEdificio(null, null)).toBe(true);
    const otro = tres();
    otro.plantas[1].id = 'z';
    expect(mismoEdificio(tres(), otro)).toBe(false);
  });
});

describe('las cotas', () => {
  it('la planta sobre rasante más baja está a ±0,00 y hacia arriba se suman las alturas de debajo', () => {
    expect(cotasEdificio(tres().plantas)).toEqual([6, 3, 0]);
  });

  it('los sótanos cuelgan restando su propia altura', () => {
    const e = tres();
    e.plantas.push(planta('s1', 'Sótano -1', 'sotano', 3), planta('s2', 'Sótano -2', 'sotano', 2.5));
    expect(cotasEdificio(e.plantas)).toEqual([6, 3, 0, -3, -5.5]);
  });

  it('una altura que falta deja sin cota lo que está por encima, y sólo eso', () => {
    const e = tres();
    e.plantas[1].altura = null; // la primera no dice cuánto mide
    expect(cotasEdificio(e.plantas)).toEqual([null, 3, 0]);
    e.plantas[2].altura = null; // y la baja tampoco
    expect(cotasEdificio(e.plantas)).toEqual([null, null, 0]);
  });

  it('un edificio enterrado entero toma el forjado de arriba a ±0,00; sin plantas no hay cotas', () => {
    expect(cotasEdificio([planta('a', 'Sótano -1', 'sotano', 3), planta('b', 'Sótano -2', 'sotano', 3)])).toEqual([0, -3]);
    expect(cotasEdificio([])).toEqual([]);
  });
});

describe('lo que ve el viento', () => {
  it('los forjados sobre rasante por encima del suelo, de abajo arriba: ni el de cota 0 ni los sótanos', () => {
    const e = tres();
    e.plantas.push(planta('s1', 'Sótano -1', 'sotano', 3));
    expect(forjadosSobreRasante(e)).toEqual([
      { id: 'p1', nombre: 'Planta Primera', h: 3 },
      { id: 'c', nombre: 'Cubierta', h: 6 },
    ]);
    expect(alturasQueFaltan(e)).toEqual([]);
  });

  it('un forjado sin cota se queda fuera y su planta se nombra como la que falta', () => {
    const e = tres();
    e.plantas[1].altura = null;
    expect(forjadosSobreRasante(e)).toEqual([{ id: 'p1', nombre: 'Planta Primera', h: 3 }]);
    expect(alturasQueFaltan(e)).toEqual(['Planta Primera']);
  });

  it('la altura de la planta de arriba del todo y la de un sótano no hacen falta', () => {
    const e = tres();
    e.plantas.push(planta('s1', 'Sótano -1', 'sotano', null));
    expect(alturasQueFaltan(e)).toEqual([]);
    // Dos cubiertas: la de abajo sí tiene planta encima, así que su altura cuenta.
    const dos: Edificio = { plantas: [planta('a', 'Cubierta ático', 'cubierta', null), planta('b', 'Cubierta', 'cubierta', null), planta('c', 'Planta Baja', 'planta', 3)] };
    expect(alturasQueFaltan(dos)).toEqual(['Cubierta']);
  });

  it('un nombre en blanco sale como «Planta n» para que el motor tenga algo que rotular', () => {
    const e: Edificio = { plantas: [planta('a', '  ', 'cubierta', null), planta('b', 'Planta Baja', 'planta', 3)] };
    expect(forjadosSobreRasante(e)).toEqual([{ id: 'a', nombre: 'Planta 1', h: 3 }]);
  });
});

describe('el store', () => {
  it('guardar avisa a los oyentes de esta pestaña, y la instantánea es estable mientras no cambie', () => {
    const fn = vi.fn();
    const soltar = suscribirEdificio(fn);
    const antes = instantaneaEdificio();
    expect(antes).toBeNull();
    expect(instantaneaEdificio()).toBe(antes);
    guardarEdificio(tres());
    expect(fn).toHaveBeenCalledTimes(1);
    const despues = instantaneaEdificio();
    expect(despues).toEqual(tres());
    expect(instantaneaEdificio()).toBe(despues);
    soltar();
    guardarEdificio(tres());
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('viaja con la obra', () => {
  it('va en las claves del .concreta y se borra al desplegar una obra que no lo trae', () => {
    guardarEdificio(tres());
    const p = serializar('a');
    expect(p.claves).toHaveProperty(CLAVE_EDIFICIO);
    expect(JSON.parse(p.claves[CLAVE_EDIFICIO]).plantas).toHaveLength(3);

    const r = desplegar(proyectoNuevo('Otra'));
    expect(r.ok).toBe(true);
    expect(leerEdificio()).toBeNull();

    expect(desplegar(p).ok).toBe(true);
    expect(leerEdificio()).toEqual(tres());
  });
});
