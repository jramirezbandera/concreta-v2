/**
 * La maqueta del anejo (`lib/anejo/maqueta`): la sección la decide el módulo,
 * la memoria va delante, la numeración se deriva del orden y de «incluir»,
 * mover es dentro de la sección, y el plan del índice cuenta páginas sin
 * dibujar (con la cabecera de sección que nunca se queda sola al pie). Y las
 * operaciones nuevas del índice: reordenar, incluir, y la suscripción que
 * usa la pantalla.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  escribirAnejo,
  fijarIncluida,
  instantaneaAnejo,
  leerAnejo,
  reordenarPiezas,
  suscribirAnejo,
  type Pieza,
} from '../../lib/anejo';
import {
  capitulosDe,
  emplazamientoDe,
  enOrdenDeDocumento,
  entradasDe,
  MAQUETA_INDICE,
  moverEnSeccion,
  numerosDeCapitulo,
  planIndice,
  resumenDe,
  seccionDePieza,
} from '../../lib/anejo/maqueta';
import { obraVacia } from '../../lib/obra';
import { _reiniciarAlmacenParaTests } from '../../lib/storage/seguro';

function pieza(id: string, modulo: string, extra: Partial<Pieza> = {}): Pieza {
  return {
    id,
    modulo,
    clave: modulo.replace('concreta-', ''),
    titulo: `Pieza ${id}`,
    ts: '2026-09-08T10:00:00.000Z',
    esquema: '1',
    blobId: `b-${id}`,
    paginas: 2,
    huella: null,
    incluida: true,
    ...extra,
  };
}

const viga = (id: string, extra?: Partial<Pieza>) => pieza(id, 'concreta-rc-beams', extra);
const viento = (id: string, extra?: Partial<Pieza>) => pieza(id, 'concreta-viento-nieve', extra);
const materiales = (id: string, extra?: Partial<Pieza>) => pieza(id, 'concreta-materiales', extra);

beforeEach(() => {
  localStorage.clear();
  _reiniciarAlmacenParaTests();
});

describe('secciones y orden del documento', () => {
  it('la sección la decide el módulo; uno desconocido va con las piezas', () => {
    expect(seccionDePieza(viga('a'))).toBe('piezas');
    expect(seccionDePieza(viento('b'))).toBe('memoria');
    expect(seccionDePieza(pieza('c', 'concreta-de-otra-version'))).toBe('piezas');
  });

  it('la memoria va delante aunque se guardara después, y cada sección conserva su orden', () => {
    const orden = enOrdenDeDocumento([viga('v1'), viga('v2'), viento('m1'), materiales('m2')]).map((p) => p.id);
    expect(orden).toEqual(['m1', 'm2', 'v1', 'v2']);
  });

  it('los capítulos se numeran seguidos y sólo las incluidas', () => {
    const numeros = numerosDeCapitulo([viga('v1'), viga('v2', { incluida: false }), viento('m1'), viga('v3')]);
    expect([...numeros.entries()]).toEqual([
      ['m1', 1],
      ['v1', 2],
      ['v3', 3],
    ]);
    expect(numeros.has('v2')).toBe(false);
  });
});

describe('moverEnSeccion', () => {
  const lista = [viga('v1'), viga('v2'), viga('v3'), viento('m1')];

  it('mueve dentro de su sección y devuelve el orden completo, memoria delante', () => {
    expect(moverEnSeccion(lista, 'v3', 1)).toEqual(['m1', 'v3', 'v1', 'v2']);
    expect(moverEnSeccion(lista, 'v1', 2)).toEqual(['m1', 'v2', 'v1', 'v3']);
  });

  it('acota la posición al tamaño de la sección', () => {
    expect(moverEnSeccion(lista, 'v1', 99)).toEqual(['m1', 'v2', 'v3', 'v1']);
    expect(moverEnSeccion(lista, 'v3', -4)).toEqual(['m1', 'v3', 'v1', 'v2']);
  });

  it('null si no cambia nada o la pieza no existe', () => {
    expect(moverEnSeccion(lista, 'v2', 2)).toBeNull();
    expect(moverEnSeccion(lista, 'm1', 3)).toBeNull();
    expect(moverEnSeccion(lista, 'zz', 1)).toBeNull();
  });
});

describe('planIndice', () => {
  const capitulos = (n: number, seccion: 'memoria' | 'piezas') =>
    Array.from({ length: n }, (_, i) => ({ id: `${seccion}-${i}`, seccion }));

  it('nueve piezas caben en una página; sesenta necesitan tres', () => {
    expect(planIndice([...capitulos(5, 'memoria'), ...capitulos(4, 'piezas')]).paginas).toBe(1);
    expect(planIndice(capitulos(60, 'piezas')).paginas).toBe(3);
  });

  it('cada entrada tiene su página y su y, en orden y sin pisar el suelo', () => {
    const plan = planIndice(capitulos(60, 'piezas'));
    expect(plan.entradas).toHaveLength(60);
    let anterior = { pagina: 0, y: -1 };
    for (const e of plan.entradas) {
      const avanza = e.posicion.pagina > anterior.pagina || (e.posicion.pagina === anterior.pagina && e.posicion.y > anterior.y);
      expect(avanza).toBe(true);
      expect(e.posicion.y + MAQUETA_INDICE.altoEntrada).toBeLessThanOrEqual(MAQUETA_INDICE.suelo);
      anterior = e.posicion;
    }
  });

  it('la cabecera de una sección nunca se queda sola al pie: salta con su primera entrada', () => {
    // 24 capítulos de memoria dejan 11 mm libres: cabe una entrada, no una cabecera con su entrada.
    const plan = planIndice([...capitulos(24, 'memoria'), ...capitulos(2, 'piezas')]);
    expect(plan.secciones[0].posicion.pagina).toBe(1);
    expect(plan.secciones[1].posicion.pagina).toBe(2);
    expect(plan.secciones[1].posicion.y).toBe(MAQUETA_INDICE.yContinuacion);
    expect(plan.paginas).toBe(2);
  });

  it('una sección sin capítulos no ocupa sitio', () => {
    const plan = planIndice(capitulos(3, 'piezas'));
    expect(plan.secciones.map((s) => s.seccion)).toEqual(['piezas']);
  });
});

describe('entradasDe y resumenDe', () => {
  it('numera desde la primera página y encadena las páginas reales, no las del índice', () => {
    const caps = capitulosDe([viga('v1', { paginas: 2 }), viga('v2', { paginas: 9 })]);
    const entradas = entradasDe(caps, new Map([['v2', 1]]), 3);
    expect(entradas.map((e) => [e.numero, e.pagina, e.paginas])).toEqual([
      [1, 3, 2],
      [2, 5, 1],
    ]);
    expect(entradas[0].capitulo).toBe('Vigas de hormigón');
  });

  it('el resumen: nada que generar, o portada + índice + cálculo', () => {
    expect(resumenDe([])).toEqual({ capitulos: 0, paginasCalculo: 0, paginasIndice: 0, total: 0 });
    expect(resumenDe([viga('v1', { incluida: false })]).total).toBe(0);
    const r = resumenDe([viga('v1', { paginas: 3 }), viento('m1', { paginas: 4 }), viga('v2', { incluida: false })]);
    expect(r).toEqual({ capitulos: 2, paginasCalculo: 7, paginasIndice: 1, total: 9 });
  });
});

describe('emplazamientoDe', () => {
  it('municipio con provincia, sólo uno de los dos, o nada', () => {
    expect(emplazamientoDe({ ...obraVacia(), municipio: 'Dos Hermanas', provincia: '41' })).toBe('Dos Hermanas (Sevilla)');
    expect(emplazamientoDe({ ...obraVacia(), provincia: '41' })).toBe('Sevilla');
    expect(emplazamientoDe({ ...obraVacia(), municipio: 'Sevilla', provincia: '41' })).toBe('Sevilla');
    expect(emplazamientoDe({ ...obraVacia(), municipio: 'Ávila' })).toBe('Ávila');
    expect(emplazamientoDe(obraVacia())).toBe('');
    expect(emplazamientoDe(null)).toBe('');
  });
});

describe('reordenar e incluir en el índice', () => {
  it('reordenarPiezas escribe el orden dado y deja al final, en su orden, las no nombradas', () => {
    escribirAnejo({ v: 1, piezas: [viga('a'), viga('b'), viga('c'), viga('d')] });
    expect(reordenarPiezas(['c', 'a', 'desconocida'])).toBe(true);
    expect(leerAnejo().piezas.map((p) => p.id)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('fijarIncluida cambia la casilla y no escribe si no hay cambio', () => {
    escribirAnejo({ v: 1, piezas: [viga('a')] });
    expect(fijarIncluida('a', false)).toBe(true);
    expect(leerAnejo().piezas[0].incluida).toBe(false);
    expect(fijarIncluida('a', false)).toBe(true);
    expect(fijarIncluida('zz', true)).toBe(false);
  });

  it('la instantánea es estable mientras no cambie el índice, y la suscripción avisa al escribir', () => {
    const oyente = vi.fn();
    const soltar = suscribirAnejo(oyente);
    const antes = instantaneaAnejo();
    expect(instantaneaAnejo()).toBe(antes);
    escribirAnejo({ v: 1, piezas: [viga('a')] });
    expect(oyente).toHaveBeenCalledTimes(1);
    const despues = instantaneaAnejo();
    expect(despues).not.toBe(antes);
    expect(despues.piezas.map((p) => p.id)).toEqual(['a']);
    expect(instantaneaAnejo()).toBe(despues);
    soltar();
    escribirAnejo({ v: 1, piezas: [] });
    expect(oyente).toHaveBeenCalledTimes(1);
  });

  it('un cambio desde otra pestaña (`storage`) también avisa', () => {
    const oyente = vi.fn();
    const soltar = suscribirAnejo(oyente);
    window.dispatchEvent(new StorageEvent('storage', { key: 'concreta-anejo' }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'otra-clave' }));
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(oyente).toHaveBeenCalledTimes(2);
    soltar();
  });
});
