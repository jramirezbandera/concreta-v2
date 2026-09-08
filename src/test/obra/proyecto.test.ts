/**
 * El contenedor de proyectos (`lib/proyecto`): serializar, desplegar, el
 * archivo local de una clave por obra, y el ciclo exportar → borrar → importar
 * que es el seguro de todo el plan.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLAVE_INDICE_PROYECTOS, CLAVE_OBRA, PREFIJO_PROYECTO } from '../../data/proyectoKeys';
import { guardarObra, leerObra } from '../../lib/obra';
import {
  _reiniciarProyectoParaTests,
  borrar,
  cargar,
  desajustesDeEsquema,
  desplegar,
  guardar,
  hayTrabajoVivo,
  importar,
  listar,
  proyectoNuevo,
  repararIndice,
  serializar,
  type ProyectoFile,
} from '../../lib/proyecto';
import { nombreDeFichero, textoDeExportacion } from '../../lib/proyecto/fichero';
import { _reiniciarAlmacenParaTests, escribirClaveDiferida, leerClave } from '../../lib/storage/seguro';

/** Claves de proyecto de la obra A, incluidas versión, satélites y un sobre. */
const CLAVES_A: Record<string, string> = {
  'rc-beams': '{"L":6}',
  'rc-beams-version': '1',
  micropiles: '{"n":4}',
  'micropiles-version': '9',
  'concreta-micropiles-soil': '[{"id":1}]',
  'concreta-pub-materiales': '{"v":1}',
  'concreta-slope-title': 'Talud norte',
};

function sembrarObraA() {
  for (const [k, v] of Object.entries(CLAVES_A)) localStorage.setItem(k, v);
  localStorage.setItem('concreta-theme', 'dark');
  localStorage.setItem('concreta-ai-settings', '{"key":"sk-secreta"}');
  guardarObra({ denominacion: 'Nave A', municipio: 'Sevilla' });
}

function ficheroB(): ProyectoFile {
  const p = proyectoNuevo('Nave B');
  p.id = 'b';
  p.claves = { 'rc-columns': '{"b":30}', 'rc-columns-version': '1' };
  p.esquemas = { 'rc-columns': '1' };
  return p;
}

const setItemReal = Storage.prototype.setItem;

/** Cuota llena SÓLO en esa clave; el resto se escribe de verdad. */
function cuotaLlenaEn(clave: string) {
  return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
    if (k === clave) throw new DOMException('QuotaExceededError', 'QuotaExceededError');
    setItemReal.call(this, k, v);
  });
}

beforeEach(() => {
  localStorage.clear();
  _reiniciarAlmacenParaTests();
  _reiniciarProyectoParaTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('serializar', () => {
  it('envasa las claves de proyecto CRUDAS (estado, versión, satélites, sobres) y nada más', () => {
    sembrarObraA();
    const p = serializar('a');
    expect(p.formato).toBe('concreta-proyecto');
    expect(p.v).toBe(1);
    expect(p.id).toBe('a');
    expect(p.claves).toEqual(CLAVES_A);
    expect(p.claves).not.toHaveProperty('concreta-theme');
    expect(p.claves).not.toHaveProperty('concreta-ai-settings');
    expect(p.claves).not.toHaveProperty(CLAVE_OBRA);
  });

  it('el campo app lleva la versión de calendario de package.json, no "dev" (el define de vite.config)', () => {
    expect(serializar('a').app).toMatch(/^\d{6}\.\d+$/);
    expect(proyectoNuevo().app).toMatch(/^\d{6}\.\d+$/);
  });

  it('la obra va en la raíz y el nombre es su denominación', () => {
    sembrarObraA();
    const p = serializar('a');
    expect(p.obra.denominacion).toBe('Nave A');
    expect(p.obra.municipio).toBe('Sevilla');
    expect(p.nombre).toBe('Nave A');
    expect(serializar('x').nombre).toBe('Nave A');
    localStorage.clear();
    expect(serializar('vacio').nombre).toBe('Sin nombre');
  });

  it('esquemas: la versión guardada de cada módulo presente, o la viva si no tiene guarda', () => {
    sembrarObraA();
    localStorage.setItem('concreta-composite-section', '{}'); // sin clave de versión
    localStorage.setItem('forjados', '{}'); // con guarda pero sin la clave de versión escrita
    const p = serializar('a');
    expect(p.esquemas).toEqual({ 'rc-beams': '1', micropiles: '9', 'concreta-composite-section': '1', forjados: '1' });
  });

  it('vuelca antes la cola diferida: lo tecleado en los últimos 300 ms también es proyecto', () => {
    sembrarObraA();
    escribirClaveDiferida('rc-beams', '{"L":7}');
    expect(serializar('a').claves['rc-beams']).toBe('{"L":7}');
  });

  it('con otros tres proyectos en el archivo, el fichero no crece con ellos', () => {
    sembrarObraA();
    const solo = textoDeExportacion(serializar('a')).length;
    for (const n of ['X', 'Y', 'Z']) {
      const q = proyectoNuevo(n);
      q.claves = { 'rc-beams': '{"L":99999}'.repeat(50) };
      expect(guardar(q)).toBe(true);
    }
    const p = serializar('a');
    expect(Object.keys(p.claves).some((k) => k.startsWith(PREFIJO_PROYECTO))).toBe(false);
    expect(p.claves).not.toHaveProperty(CLAVE_INDICE_PROYECTOS);
    expect(textoDeExportacion(p).length).toBe(solo);
  });
});

describe('desplegar', () => {
  it('es REEMPLAZO: escribe lo que trae, borra lo que no trae, y reconstruye la obra desde la raíz', () => {
    sembrarObraA();
    const r = desplegar(ficheroB());
    expect(r).toEqual({ ok: true, escritas: 2, descartadas: [], borradas: Object.keys(CLAVES_A).length });
    expect(leerClave('rc-columns')).toBe('{"b":30}');
    for (const k of Object.keys(CLAVES_A)) expect(leerClave(k), k).toBeNull();
    expect(leerObra()).toMatchObject({ denominacion: 'Nave B', municipio: '' }); // sustituida, no fundida
  });

  it('si la obra no cabe, NO da el despliegue por bueno ni borra la anterior', () => {
    sembrarObraA();
    cuotaLlenaEn(CLAVE_OBRA);
    const r = desplegar(ficheroB());

    // Sin esto, las claves de B quedaban vivas con la obra de A en la cabecera
    // de todos sus documentos, y el contenedor decía que había ido bien.
    expect(r.ok).toBe(false);
    expect(r.falloEn).toBe(CLAVE_OBRA);
    expect(r.borradas).toBe(0);
    expect(leerObra()?.denominacion).toBe('Nave A');
    for (const k of Object.keys(CLAVES_A)) expect(leerClave(k), k).not.toBeNull();
  });

  it('filtra lo que no es de proyecto y lo cuenta: la clave BYOK no cambia', () => {
    sembrarObraA();
    const b = ficheroB();
    b.claves['concreta-ai-settings'] = '{"key":"robada"}';
    b.claves['concreta-theme'] = 'light';
    b.claves[CLAVE_OBRA] = '{"v":1,"obra":{"denominacion":"colada"}}';
    const r = desplegar(b);
    expect(r.ok).toBe(true);
    expect(r.descartadas.sort()).toEqual(['concreta-ai-settings', 'concreta-obra', 'concreta-theme']);
    expect(leerClave('concreta-ai-settings')).toBe('{"key":"sk-secreta"}');
    expect(leerClave('concreta-theme')).toBe('dark');
    expect(leerObra()?.denominacion).toBe('Nave B');
  });

  it('un proyecto nuevo desplegado deja la app sin trabajo vivo', () => {
    sembrarObraA();
    expect(hayTrabajoVivo()).toBe(true);
    desplegar(proyectoNuevo('Obra limpia'));
    expect(hayTrabajoVivo()).toBe(false);
    expect(leerObra()?.denominacion).toBe('Obra limpia');
  });

  it('vuelca la cola ANTES de escribir: lo pendiente de la obra anterior no pisa a la nueva', () => {
    sembrarObraA();
    escribirClaveDiferida('rc-columns', '{"b":"de-A"}');
    desplegar(ficheroB());
    expect(leerClave('rc-columns')).toBe('{"b":30}');
  });
});

describe('archivo local: una clave por obra + índice', () => {
  it('guardar escribe UNA clave y pone el proyecto el primero; cargar y borrar', () => {
    const p1 = proyectoNuevo('Primera');
    p1.id = 'p1';
    p1.ts = '2026-09-01T00:00:00.000Z';
    const p2 = proyectoNuevo('Segunda');
    p2.id = 'p2';
    p2.ts = '2026-09-02T00:00:00.000Z';
    expect(guardar(p1)).toBe(true);
    expect(guardar(p2)).toBe(true);
    const archivadas = Object.keys(localStorage).filter((k) => k.startsWith(PREFIJO_PROYECTO));
    expect(archivadas.sort()).toEqual(['concreta-proyecto-p1', 'concreta-proyecto-p2']);
    expect(listar().map((e) => e.id)).toEqual(['p2', 'p1']);
    expect(cargar('p1')).toEqual(p1);
    expect(cargar('no-existe')).toBeNull();
    expect(borrar('p1')).toBe(true);
    expect(leerClave('concreta-proyecto-p1')).toBeNull();
    expect(listar().map((e) => e.id)).toEqual(['p2']);
  });

  it('guardar dos veces el mismo id no duplica el índice y actualiza el nombre', () => {
    const p = proyectoNuevo('Antes');
    p.id = 'p';
    guardar(p);
    p.nombre = 'Después';
    guardar(p);
    expect(listar()).toHaveLength(1);
    expect(listar()[0].nombre).toBe('Después');
  });

  it('repararIndice reconstruye el índice desde las claves y salta los ficheros corruptos', () => {
    const p1 = proyectoNuevo('Primera');
    p1.id = 'p1';
    const p2 = proyectoNuevo('Segunda');
    p2.id = 'p2';
    guardar(p1);
    guardar(p2);
    expect(repararIndice()).toBe(false); // ya coincide
    localStorage.removeItem(CLAVE_INDICE_PROYECTOS);
    localStorage.setItem(`${PREFIJO_PROYECTO}zzz`, '{no es json');
    expect(listar()).toEqual([]);
    expect(repararIndice()).toBe(true);
    expect(listar().map((e) => e.id).sort()).toEqual(['p1', 'p2']);
  });
});

describe('esquemas', () => {
  it('desajustesDeEsquema nombra el módulo que se abrirá en blanco, e ignora claves desconocidas', () => {
    const p = proyectoNuevo('X');
    p.esquemas = { 'rc-beams': '0', micropiles: '9', desconocida: '3' };
    expect(desajustesDeEsquema(p)).toEqual([{ modulo: 'concreta-rc-beams', clave: 'rc-beams', guardada: '0', viva: '1' }]);
  });
});

describe('el ciclo exportar → borrar → importar', () => {
  it('el proyecto sale idéntico, vigas incluidas', () => {
    sembrarObraA();
    const original = serializar('a');
    const texto = textoDeExportacion(original);
    expect(texto).toContain('\n  '); // legible en un editor de texto

    localStorage.clear();
    _reiniciarAlmacenParaTests();
    expect(hayTrabajoVivo()).toBe(false);

    const leido = importar(texto);
    expect(leido).toEqual(original);
    expect(desplegar(leido).ok).toBe(true);

    const vuelto = serializar('a');
    expect(vuelto.claves).toEqual(original.claves);
    expect(vuelto.obra).toEqual(original.obra);
    expect(vuelto.esquemas).toEqual(original.esquemas);
    expect(vuelto.nombre).toBe(original.nombre);
  });

  it('el nombre del fichero sale de la denominación, sin acentos ni signos', () => {
    const p = proyectoNuevo('Reposición de nave industrial (fase 2)');
    expect(nombreDeFichero(p)).toBe('reposicion-de-nave-industrial-fase-2.concreta.json');
    expect(nombreDeFichero(proyectoNuevo(''))).toBe('sin-nombre.concreta.json');
  });
});
