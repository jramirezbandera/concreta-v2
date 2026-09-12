/**
 * La cola de «Siguiente hueco» sobre un árbol de valores a mano: qué entra,
 * en qué orden, qué acción resuelve cada uno y qué dice el aviso de bloqueo.
 */

import { describe, expect, it } from 'vitest';
import { bloqueanExportar, colaHuecos, contarHuecos, mensajeAviso, mensajeBloqueo, siguienteHueco } from '../../lib/memoria/huecos';
import { bloquea, pendiente, type Valor } from '../../lib/memoria/model';

const v = <T>(valor: T | null, estado: Valor<T>['estado'], origen: Valor<T>['origen'], id?: string, etiqueta?: string): Valor<T> => ({
  valor,
  estado,
  origen,
  ...(id ? { id, etiqueta: etiqueta ?? id, apartado: 'sec' as const } : {}),
});

describe('colaHuecos', () => {
  it('sólo entran los valores con id cuyo estado bloquea, en orden de inserción', () => {
    const datos = {
      a: v('x', 'ok', 'tecleado', 'obra.a'),
      b: v(null, 'falta', 'tecleado', 'obra.b', 'Empresa'),
      c: v('y', 'heredado', 'heredado', 'obra.c'),
      d: v(3, 'derivado', 'norma'),
      e: { anidado: v(true, 'revisar', 'materiales', 'pub.materiales', 'Cuadro de materiales') },
      f: v(null, 'falta', 'sismo', 'pub.sismo', 'Acción sísmica'),
    };
    expect(colaHuecos(datos).map((h) => [h.id, h.estado, h.accion])).toEqual([
      ['obra.b', 'falta', 'teclear'],
      ['obra.c', 'heredado', 'confirmar'],
      ['pub.materiales', 'revisar', 'usarPublicado'],
      ['pub.sismo', 'falta', 'publicarModulo'],
    ]);
    expect(colaHuecos(datos)[0].etiqueta).toBe('Empresa');
  });

  it('un derivado sin id nunca es hueco aunque su estado sea falta', () => {
    expect(colaHuecos({ x: v(null, 'falta', 'norma') })).toEqual([]);
  });

  it('el mismo id no entra dos veces: la fuente y lo que deriva de ella son UN hueco', () => {
    const datos = {
      fuentes: { cargas: v(false, 'falta', 'cargas-planta', 'pub.cargasPlanta') },
      niveles: v(null, 'falta', 'cargas-planta', 'pub.cargasPlanta'),
      forjados: v(null, 'falta', 'cargas-planta', 'pub.cargasPlanta'),
    };
    expect(colaHuecos(datos)).toHaveLength(1);
  });

  it('baja por el valor de un valor: una tipología de forjado con sus campos residuales', () => {
    const datos = {
      forjados: v([{ intereje: v(null, 'falta', 'tecleado', 'obra.forjados.reticular-30.intereje') }], 'derivado', 'cargas-planta'),
    };
    expect(colaHuecos(datos).map((h) => h.id)).toEqual(['obra.forjados.reticular-30.intereje']);
  });
});

describe('siguienteHueco', () => {
  const huecos = colaHuecos({
    a: v(null, 'falta', 'tecleado', 'obra.a'),
    b: v(null, 'falta', 'tecleado', 'obra.b'),
    c: v(null, 'falta', 'tecleado', 'obra.c'),
  });

  it('sin foco, el primero; con foco en uno, el siguiente; desde el último, el primero (cíclico)', () => {
    expect(siguienteHueco(huecos, null)?.id).toBe('obra.a');
    expect(siguienteHueco(huecos, 'obra.a')?.id).toBe('obra.b');
    expect(siguienteHueco(huecos, 'obra.c')?.id).toBe('obra.a');
  });

  it('con el foco en algo que no es hueco, el primero; sin huecos, null', () => {
    expect(siguienteHueco(huecos, 'obra.z')?.id).toBe('obra.a');
    expect(siguienteHueco([], null)).toBeNull();
  });
});

describe('contador y mensaje de bloqueo', () => {
  it('cuenta por estado y redacta en singular o plural', () => {
    const huecos = colaHuecos({
      a: v(null, 'falta', 'tecleado', 'obra.a'),
      b: v(null, 'falta', 'tecleado', 'obra.b'),
      c: v('x', 'heredado', 'heredado', 'obra.c'),
      d: v(true, 'revisar', 'sismo', 'pub.sismo'),
    });
    expect(contarHuecos(huecos)).toEqual({ total: 4, faltan: 2, heredados: 1, revisar: 1 });
    expect(mensajeBloqueo(huecos)).toBe('Faltan 2 datos por rellenar.');
    expect(mensajeBloqueo(huecos.slice(0, 1))).toBe('Falta 1 dato por rellenar.');
    expect(mensajeBloqueo([])).toBeNull();
    expect(mensajeAviso(huecos)).toBe('1 dato de la obra anterior sin confirmar y 1 publicación calculada en otro sitio');
  });

  it('sólo las FALTAS cierran la puerta: lo ámbar se avisa y se imprime', () => {
    const ambar = colaHuecos({
      c: v('x', 'heredado', 'heredado', 'obra.c'),
      d: v(true, 'revisar', 'sismo', 'pub.sismo'),
    });
    // Siguen siendo huecos —entran en la cola y en el contador—, pero no
    // impiden entregar el documento: lo que hay se imprime.
    expect(ambar).toHaveLength(2);
    expect(pendiente('heredado')).toBe(true);
    expect(pendiente('revisar')).toBe(true);
    expect(bloquea('heredado')).toBe(false);
    expect(bloquea('revisar')).toBe(false);
    expect(bloquea('falta')).toBe(true);
    expect(bloqueanExportar(ambar)).toBe(false);
    expect(mensajeBloqueo(ambar)).toBeNull();
    expect(mensajeAviso(ambar)).not.toBeNull();
  });
});
