/**
 * Cambio de obra atómico (eng-review T3): guardar A, centinela, escribir B,
 * borrar sobrantes sólo si todo fue bien, quitar el centinela. Si la cuota
 * salta a mitad, la A sigue entera en su archivo y se vuelve a desplegar; si
 * ni eso, el centinela se queda y el arranque lo repara. Nunca una quimera.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLAVE_DESPLEGANDO } from '../../data/proyectoKeys';
import { guardarObra, leerObra } from '../../lib/obra';
import {
  _reiniciarProyectoParaTests,
  cambiarDeProyecto,
  cargar,
  despliegueInterrumpido,
  fijarProyectoActivo,
  guardar,
  hayTrabajoVivo,
  proyectoActivo,
  proyectoNuevo,
  repararAlArrancar,
  serializar,
  type ProyectoFile,
} from '../../lib/proyecto';
import { _reiniciarAlmacenParaTests, escribirClaveDiferida, leerClave } from '../../lib/storage/seguro';

const CLAVES_A = { 'rc-beams': '{"L":6}', 'rc-beams-version': '1', 'concreta-pub-materiales': '{"v":1}' };
const CLAVES_B = { 'rc-columns': '{"b":30}', 'rc-columns-version': '1', forjados: '{"f":1}', 'forjados-version': '1' };

/** A viva y archivada como proyecto activo; B archivada. */
function escenario(): { b: ProyectoFile } {
  for (const [k, v] of Object.entries(CLAVES_A)) localStorage.setItem(k, v);
  guardarObra({ denominacion: 'Nave A' });
  fijarProyectoActivo('a');
  guardar(serializar('a'));
  const b = proyectoNuevo('Nave B');
  b.id = 'b';
  b.claves = { ...CLAVES_B };
  guardar(b);
  return { b };
}

const vivas = (claves: Record<string, string>) => Object.entries(claves).every(([k, v]) => leerClave(k) === v);
const ninguna = (claves: Record<string, string>) => Object.keys(claves).every((k) => leerClave(k) === null);

function cuotaLlenaEn(clave: string) {
  return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
    if (k === clave) throw new DOMException('QuotaExceededError', 'QuotaExceededError');
    // Escritura real, sin pasar por el espía.
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(this), 'setItem'); // no-op: documenta la intención
    real.call(this, k, v);
  });
}
const real = Storage.prototype.setItem;

beforeEach(() => {
  localStorage.clear();
  _reiniciarAlmacenParaTests();
  _reiniciarProyectoParaTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('cambiarDeProyecto', () => {
  it('camino feliz: A se guarda con lo pendiente, B queda viva, A desaparece del almacén vivo', () => {
    const { b } = escenario();
    escribirClaveDiferida('rc-beams', '{"L":9}'); // tecleado hace <300 ms
    const r = cambiarDeProyecto(b);
    expect(r.ok).toBe(true);
    expect(r.paso).toBe('hecho');
    expect(cargar('a')?.claves['rc-beams']).toBe('{"L":9}');
    expect(vivas(CLAVES_B)).toBe(true);
    expect(ninguna(CLAVES_A)).toBe(true);
    expect(leerObra()?.denominacion).toBe('Nave B');
    expect(proyectoActivo()).toBe('b');
    expect(despliegueInterrumpido()).toBeNull();
  });

  it('cuota llena a mitad de B: la A vuelve entera, el activo sigue en A y no queda centinela', () => {
    const { b } = escenario();
    cuotaLlenaEn('forjados'); // la tercera clave de B
    const r = cambiarDeProyecto(b);
    expect(r.ok).toBe(false);
    expect(r.paso).toBe('desplegar');
    expect(r.despliegue?.falloEn).toBe('forjados');
    expect(r.recuperado).toBe(true);
    expect(vivas(CLAVES_A)).toBe(true);
    expect(ninguna(CLAVES_B)).toBe(true); // ni las dos que sí se escribieron
    expect(leerObra()?.denominacion).toBe('Nave A');
    expect(proyectoActivo()).toBe('a');
    expect(despliegueInterrumpido()).toBeNull();
    expect(cargar('a')?.claves).toEqual(CLAVES_A);
  });

  it('cuota llena al guardar la A: no se toca nada y se dice en qué paso', () => {
    const { b } = escenario();
    cuotaLlenaEn('concreta-proyecto-a');
    const r = cambiarDeProyecto(b);
    expect(r).toMatchObject({ ok: false, paso: 'guardar-actual' });
    expect(vivas(CLAVES_A)).toBe(true);
    expect(ninguna(CLAVES_B)).toBe(true);
    expect(proyectoActivo()).toBe('a');
    expect(leerClave(CLAVE_DESPLEGANDO)).toBeNull();
  });

  it('sin proyecto activo, el trabajo vivo se sustituye: quien llama debe haber preguntado antes', () => {
    for (const [k, v] of Object.entries(CLAVES_A)) localStorage.setItem(k, v);
    const b = proyectoNuevo('Nave B');
    b.id = 'b';
    b.claves = { ...CLAVES_B };
    expect(hayTrabajoVivo()).toBe(true);
    const r = cambiarDeProyecto(b);
    expect(r.ok).toBe(true);
    expect(ninguna(CLAVES_A)).toBe(true);
    expect(proyectoActivo()).toBe('b');
  });

  it('avisa de los desajustes de esquema del destino, y aun así despliega', () => {
    const { b } = escenario();
    b.esquemas = { 'rc-columns': '0' };
    const r = cambiarDeProyecto(b);
    expect(r.ok).toBe(true);
    expect(r.desajustes).toEqual([{ modulo: 'concreta-rc-columns', clave: 'rc-columns', guardada: '0', viva: '1' }]);
  });
});

describe('repararAlArrancar', () => {
  it('con centinela y el destino archivado: vuelve a desplegar el destino', () => {
    const { b } = escenario();
    // Quimera: B a medias sobre A, y el centinela puesto.
    localStorage.setItem('rc-columns', '{"b":30}');
    localStorage.setItem(CLAVE_DESPLEGANDO, JSON.stringify({ de: 'a', a: 'b', ts: '2026-09-08T00:00:00Z' }));
    const informe = repararAlArrancar();
    expect(informe.recuperacion?.resultado).toBe('destino');
    expect(vivas(b.claves)).toBe(true);
    expect(ninguna(CLAVES_A)).toBe(true);
    expect(proyectoActivo()).toBe('b');
    expect(despliegueInterrumpido()).toBeNull();
  });

  it('sin el archivo del destino: vuelve a la obra de origen', () => {
    escenario();
    localStorage.removeItem('concreta-proyecto-b');
    localStorage.setItem('rc-columns', '{"b":30}');
    localStorage.setItem(CLAVE_DESPLEGANDO, JSON.stringify({ de: 'a', a: 'b', ts: '' }));
    const informe = repararAlArrancar();
    expect(informe.recuperacion?.resultado).toBe('origen');
    expect(vivas(CLAVES_A)).toBe(true);
    expect(leerClave('rc-columns')).toBeNull();
    expect(proyectoActivo()).toBe('a');
    expect(despliegueInterrumpido()).toBeNull();
  });

  it('sin ningún archivo: el centinela se queda para que se vea', () => {
    localStorage.setItem(CLAVE_DESPLEGANDO, JSON.stringify({ de: null, a: 'b', ts: '' }));
    const informe = repararAlArrancar();
    expect(informe.recuperacion?.resultado).toBe('fallido');
    expect(despliegueInterrumpido()).not.toBeNull();
  });

  it('sin centinela y con el índice perdido: lo reconstruye y no toca lo vivo', () => {
    escenario();
    localStorage.removeItem('concreta-proyectos');
    const informe = repararAlArrancar();
    expect(informe).toEqual({ indiceReparado: true, recuperacion: null });
    expect(vivas(CLAVES_A)).toBe(true);
  });
});
