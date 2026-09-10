/**
 * La tabla única de claves (`src/data/proyectoKeys.ts`) y sus tres guardas.
 *
 *  1. Copia CONGELADA de las versiones vivas. Subir una versión exige tocar
 *     también este fichero, a propósito. El map derivado se compara entero y
 *     valor a valor: comparar sólo las claves dejaría pasar que las seis
 *     entradas con versión ≠ '1' se fuesen a '1' y reseteasen a todos los usuarios.
 *  2. Enumeración por fuente. Cada clave de localStorage que escribe el código
 *     (literal, constante o plantilla resoluble) tiene que estar clasificada en
 *     uno de los tres cubos. El módulo 26 que escriba sin darse de alta falla aquí.
 *  3. Coherencia interna: registro ↔ tabla, ninguna clave en dos cubos,
 *     `useModuleState` con `clave === idEsquema` y sufijo `-version`, y las
 *     claves del contenedor fuera de lo que viaja.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getModuleSchemaVersion, MODULE_SCHEMA_VERSIONS, moduleRegistry } from '../../data/moduleRegistry';
import {
  CLAVE_DESPLEGANDO,
  CLAVE_INDICE_PROYECTOS,
  CLAVE_OBRA,
  CLAVE_PROYECTO_ACTIVO,
  CLAVES_INFRAESTRUCTURA,
  CLAVES_PREFERENCIA,
  CLAVES_PROYECTO,
  clasificarClave,
  clavesDeProyecto,
  entradaDe,
  entradaPorClave,
  MODULOS_SIN_REGISTRO,
  PREFIJO_PROYECTO,
  PREFIJO_PUB,
  versionViva,
} from '../../data/proyectoKeys';
import { OBRA_KEY } from '../../lib/obra';
import { clavePublicacion, PREFIJO_PUB as PREFIJO_PUB_LIB } from '../../lib/pub';
import * as cargasPlanta from '../../features/cargas-planta/state';
import * as materiales from '../../features/materiales/state';
import * as memoriaDbse from '../../features/memoria-dbse/state';
import * as vientoNieve from '../../features/viento-nieve/state';

// ---------------------------------------------------------------------------
// 1. Copias congeladas (2026-09-08, el día que el map pasó a derivarse de la tabla)
// ---------------------------------------------------------------------------
//
// Si un test de este bloque falla, o has subido una versión a propósito
// (actualiza ESTA copia en el mismo commit) o la tabla ha perdido o cambiado
// una entrada, y eso descarta lo guardado de ese módulo para todos los usuarios.

const MAP_CONGELADO: Record<string, string> = {
  'rc-beams': '1',
  'rc-columns': '1',
  'steel-beams': '1',
  'steel-columns': '1',
  'isolated-footing': '2',
  'retaining-wall': '2',
  'punching': '2',
  'forjados': '1',
  'composite-section': '1',
  'pile-cap': '1',
  'micropiles': '9',
  'empresillado': '1',
  'masonry-walls': '1',
  'timber-beams': '1',
  'timber-columns': '1',
  'anchor-plate': '1',
  'fem-2d': '1',
  'fem2d': '2',
  'slope-stability': '2',
  'rockfill-wall': '1',
};

const VERSIONES_CONGELADAS: Record<string, string> = {
  'concreta-materiales': '1',
  'concreta-memoria-dbse': '1',
  'concreta-seismic': '1',
  'concreta-viento-nieve': '1',
  'concreta-cargas-planta': '1',
  'concreta-rc-beams': '1',
  'concreta-rc-columns': '1',
  'concreta-steel-beams': '1',
  'concreta-steel-columns': '1',
  'concreta-footings': '2',
  'concreta-retaining-wall': '2',
  'concreta-punching': '2',
  'concreta-forjados': '1',
  'concreta-pile-cap': '1',
  'concreta-micropiles': '9',
  'concreta-empresillado': '1',
  'concreta-timber-beams': '1',
  'concreta-timber-columns': '1',
  'concreta-anchor-plate': '1',
  'concreta-rockfill-wall': '1',
  'concreta-composite-section': '1',
  'concreta-masonry-walls': '1',
  'concreta-fem-2d': '1',
  'concreta-fem2d': '2',
  'concreta-slope-stability': '2',
  'concreta-anejo': '1',
};

/** Las cinco entradas cuyo `idEsquema` no coincide ni con `clave` ni con `modulo`. */
const LAS_CINCO_RARAS = [
  'concreta-composite-section',
  'concreta-masonry-walls',
  'concreta-fem-2d',
  'concreta-fem2d',
  'concreta-slope-stability',
];

describe('proyectoKeys — copia congelada', () => {
  it('MODULE_SCHEMA_VERSIONS derivado coincide entero, valor a valor, con la copia congelada', () => {
    expect(MODULE_SCHEMA_VERSIONS).toEqual(MAP_CONGELADO);
    expect(Object.keys(MODULE_SCHEMA_VERSIONS)).toHaveLength(20);
  });

  it('las versiones vivas por módulo coinciden con la copia congelada (incluidos los que no pasan por el map)', () => {
    const vivas = Object.fromEntries(CLAVES_PROYECTO.map((e) => [e.modulo, e.versionViva]));
    expect(vivas).toEqual(VERSIONES_CONGELADAS);
  });

  it('las seis entradas con versión ≠ 1 siguen sin ser 1', () => {
    expect(getModuleSchemaVersion('isolated-footing')).toBe('2');
    expect(getModuleSchemaVersion('retaining-wall')).toBe('2');
    expect(getModuleSchemaVersion('punching')).toBe('2');
    expect(getModuleSchemaVersion('micropiles')).toBe('9');
    expect(getModuleSchemaVersion('fem2d')).toBe('2');
    expect(getModuleSchemaVersion('slope-stability')).toBe('2');
  });

  it('un id de esquema desconocido LANZA en vez de caer a 1', () => {
    expect(() => getModuleSchemaVersion('no-existe')).toThrow(/no está en proyectoKeys/);
    expect(() => versionViva('concreta-no-existe')).toThrow(/no está en CLAVES_PROYECTO/);
  });
});

// ---------------------------------------------------------------------------
// 2. Enumeración por fuente
// ---------------------------------------------------------------------------

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TEST_DIR = path.join(SRC_DIR, 'test');

/** Ficheros en los que una clave dinámica (argumento no resoluble) es legítima. */
const AYUDANTES_CON_CLAVE_DINAMICA = new Set([
  'hooks/useModuleState.ts', // <clave> y <clave>-version, por parámetro
  'hooks/useDocTitle.ts', // storageKey, por parámetro
  'lib/pub/index.ts', // concreta-pub-<modulo>
  'lib/storage/seguro.ts', // localStorage.*(clave), por parámetro: es el único que lo toca
  'lib/proyecto/index.ts', // el contenedor: enumera y escribe claves de proyecto y concreta-proyecto-<id>
  'lib/anejo/adaptador.ts', // el anejo lee el estado de cada módulo por su fila de la tabla (título y huella)
  'lib/anejo/index.ts', // restaurar una pieza REESCRIBE las claves de su módulo, también por su fila de la tabla
]);

function fuentes(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (full === TEST_DIR) continue;
      out.push(...fuentes(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry) && !/\.d\.ts$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const RE_CONST = /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::\s*string)?\s*=\s*(['"`])((?:(?!\2)[^\\\n]|\\.)*)\2/g;

const RE_ALIAS = /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::\s*string)?\s*=\s*([A-Za-z_$][\w$]*)\s*;/g;

/** Constantes exportadas por la tabla: el fichero que las importa las tiene resueltas. */
const SEMILLAS: ReadonlyArray<[string, string]> = [
  ['CLAVE_OBRA', CLAVE_OBRA],
  ['CLAVE_INDICE_PROYECTOS', CLAVE_INDICE_PROYECTOS],
  ['CLAVE_PROYECTO_ACTIVO', CLAVE_PROYECTO_ACTIVO],
  ['CLAVE_DESPLEGANDO', CLAVE_DESPLEGANDO],
  ['PREFIJO_PROYECTO', PREFIJO_PROYECTO],
  ['PREFIJO_PUB', PREFIJO_PUB],
];

/** Constantes de cadena del fichero, con las plantillas `${OTRA}` y los alias `const X = Y;` resueltos. */
function constantes(src: string): Map<string, string> {
  const crudas = new Map<string, string>(SEMILLAS);
  for (const m of src.matchAll(RE_CONST)) crudas.set(m[1], m[3]);
  const alias = new Map<string, string>();
  for (const m of src.matchAll(RE_ALIAS)) alias.set(m[1], m[2]);
  const resueltas = new Map<string, string>();
  const resolver = (nombre: string, pila: string[]): string | undefined => {
    if (resueltas.has(nombre)) return resueltas.get(nombre);
    if (pila.includes(nombre)) return undefined;
    const destino = alias.get(nombre);
    if (destino !== undefined && !crudas.has(nombre)) {
      const r = resolver(destino, [...pila, nombre]);
      if (r !== undefined) resueltas.set(nombre, r);
      return r;
    }
    const cruda = crudas.get(nombre);
    if (cruda === undefined) return undefined;
    let ok = true;
    const valor = cruda.replace(/\$\{\s*([A-Za-z_$][\w$]*)\s*\}/g, (_, ref: string) => {
      const r = resolver(ref, [...pila, nombre]);
      if (r === undefined) ok = false;
      return r ?? '';
    });
    if (!ok || valor.includes('${')) return undefined;
    resueltas.set(nombre, valor);
    return valor;
  };
  for (const nombre of crudas.keys()) resolver(nombre, []);
  for (const nombre of alias.keys()) resolver(nombre, []);
  return resueltas;
}

/** La clave si el argumento se resuelve estáticamente; `null` si es dinámico. */
function resolverArg(arg: string, consts: Map<string, string>): string | null {
  const a = arg.trim();
  let m = /^(['"])((?:(?!\1)[^\\\n]|\\.)*)\1$/.exec(a);
  if (m) return m[2];
  m = /^`([^`$]*)`$/.exec(a);
  if (m) return m[1];
  m = /^([A-Za-z_$][\w$]*)$/.exec(a);
  if (m) return consts.get(m[1]) ?? null;
  return null;
}

interface Hallazgo {
  donde: string;
  clave: string;
}

interface Barrido {
  ficheros: number;
  accesos: Hallazgo[]; // leerClave/escribirClave/… con clave resuelta
  dinamicosFuera: Hallazgo[]; // acceso con clave dinámica fuera de los ayudantes
  crudosFuera: Hallazgo[]; // localStorage.* fuera de lib/storage/seguro.ts
  hooks: Hallazgo[]; // useModuleState('literal')
  titulos: Hallazgo[]; // useDocTitle('literal')
  publicaciones: Hallazgo[]; // publicar(MODULO) resuelto a su módulo
  versionesLocales: Hallazgo[]; // SCHEMA_VERSION = 'n' declarado en local
}

// La API de lib/storage/seguro, y el localStorage crudo que sólo debe quedar dentro de ella.
const RE_ACCESO =
  /\b(?:(?:window\.)?localStorage\.(?:setItem|getItem|removeItem)|leerClave|escribirClave|escribirClaveDiferida|borrarClave)\(\s*([^,)]+)/g;
const RE_CRUDO = /\blocalStorage\.(?:setItem|getItem|removeItem|clear|key)\(/g;
const SEGURO = 'lib/storage/seguro.ts';
const RE_HOOK = /\buseModuleState(?:<[^>]*>)?\(\s*(['"])([^'"]+)\1/g;
const RE_TITULO = /\buseDocTitle\(\s*(['"])([^'"]+)\1/g;
const RE_PUBLICAR = /\bpublicar(?:<[^>]*>)?\(\s*([^,)]+)/g;
const RE_VERSION_LOCAL = /\bSCHEMA(?:_VERSION)?\s*=\s*['"]\d+['"]/g;

function barrer(): Barrido {
  const b: Barrido = { ficheros: 0, accesos: [], dinamicosFuera: [], crudosFuera: [], hooks: [], titulos: [], publicaciones: [], versionesLocales: [] };
  for (const fichero of fuentes(SRC_DIR)) {
    b.ficheros += 1;
    const rel = path.relative(SRC_DIR, fichero).split(path.sep).join('/');
    const src = readFileSync(fichero, 'utf8');
    const consts = constantes(src);
    const donde = (indice: number) => `${rel}:${src.slice(0, indice).split('\n').length}`;

    for (const m of src.matchAll(RE_ACCESO)) {
      const clave = resolverArg(m[1], consts);
      if (clave !== null) b.accesos.push({ donde: donde(m.index ?? 0), clave });
      else if (!AYUDANTES_CON_CLAVE_DINAMICA.has(rel)) b.dinamicosFuera.push({ donde: donde(m.index ?? 0), clave: m[1].trim() });
    }
    if (rel !== SEGURO) {
      for (const m of src.matchAll(RE_CRUDO)) b.crudosFuera.push({ donde: donde(m.index ?? 0), clave: m[0] });
    }
    for (const m of src.matchAll(RE_HOOK)) b.hooks.push({ donde: donde(m.index ?? 0), clave: m[2] });
    for (const m of src.matchAll(RE_TITULO)) b.titulos.push({ donde: donde(m.index ?? 0), clave: m[2] });
    for (const m of src.matchAll(RE_PUBLICAR)) {
      const modulo = resolverArg(m[1], consts);
      if (modulo !== null) b.publicaciones.push({ donde: donde(m.index ?? 0), clave: modulo });
    }
    for (const m of src.matchAll(RE_VERSION_LOCAL)) b.versionesLocales.push({ donde: donde(m.index ?? 0), clave: m[0] });
  }
  return b;
}

const barrido = barrer();
const listar = (h: Hallazgo[]) => h.map((x) => `${x.donde}  ${x.clave}`).join('\n');

describe('proyectoKeys — enumeración por fuente', () => {
  it('el barrido no es vacío (guarda contra un test que pasa sin mirar nada)', () => {
    expect(barrido.ficheros).toBeGreaterThan(100);
    expect(new Set(barrido.accesos.map((a) => a.clave)).size).toBeGreaterThanOrEqual(30);
    expect(barrido.hooks.length).toBeGreaterThanOrEqual(15);
    expect(barrido.titulos.length).toBeGreaterThanOrEqual(8);
    expect(barrido.publicaciones.length).toBeGreaterThanOrEqual(4);
  });

  it('toda clave que el código escribe o lee está clasificada en uno de los tres cubos', () => {
    const sinClasificar = barrido.accesos.filter((a) => clasificarClave(a.clave) === null);
    expect(listar(sinClasificar), 'claves sin dar de alta en proyectoKeys.ts').toBe('');
  });

  it('localStorage crudo sólo dentro de lib/storage/seguro.ts (la regla de ESLint, comprobada también aquí)', () => {
    expect(listar(barrido.crudosFuera), 'acceso directo a localStorage fuera de seguro.ts').toBe('');
  });

  it('las claves dinámicas sólo viven en los ayudantes conocidos', () => {
    expect(listar(barrido.dinamicosFuera), 'acceso a localStorage con clave no resoluble fuera de los ayudantes').toBe('');
  });

  it('cada useModuleState(literal) es una entrada con clave === idEsquema y guarda <clave>-version', () => {
    for (const h of barrido.hooks) {
      const e = entradaPorClave(h.clave);
      expect(e, `${h.donde}: '${h.clave}' no está en CLAVES_PROYECTO`).toBeDefined();
      expect(e?.idEsquema, h.donde).toBe(h.clave);
      expect(e?.claveVersion, h.donde).toBe(`${h.clave}-version`);
      expect(MODULE_SCHEMA_VERSIONS[h.clave], h.donde).toBe(e?.versionViva);
    }
  });

  it('cada useDocTitle(literal) es un satélite de proyecto', () => {
    for (const h of barrido.titulos) {
      expect(clasificarClave(h.clave), `${h.donde}: '${h.clave}'`).toBe('proyecto');
      expect(clavesDeProyecto(), h.donde).toContain(h.clave);
    }
  });

  it('cada publicar(modulo) tiene su sobre concreta-pub-<modulo> como satélite explícito', () => {
    for (const h of barrido.publicaciones) {
      expect(clavesDeProyecto(), `${h.donde}: publica '${h.clave}'`).toContain(`${PREFIJO_PUB}${h.clave}`);
    }
  });

  it('ningún módulo declara su versión de esquema en local: se importa de la tabla', () => {
    expect(listar(barrido.versionesLocales), 'SCHEMA_VERSION literal fuera de proyectoKeys.ts').toBe('');
  });
});

// ---------------------------------------------------------------------------
// 3. Coherencia interna
// ---------------------------------------------------------------------------

describe('proyectoKeys — coherencia', () => {
  it('todo módulo del registro tiene entrada, y toda entrada es de un módulo del registro (o está en la lista de excepciones)', () => {
    const registro = new Set(moduleRegistry.map((m) => m.key));
    for (const m of moduleRegistry) expect(entradaDe(m.key), `${m.key} (${m.route}) sin entrada`).toBeDefined();
    for (const e of CLAVES_PROYECTO) {
      expect(registro.has(e.modulo) || MODULOS_SIN_REGISTRO.includes(e.modulo), `${e.modulo} no es moduleRegistry.key`).toBe(true);
    }
    expect(moduleRegistry).toHaveLength(25);
  });

  it('ninguna clave aparece dos veces ni en dos cubos', () => {
    const todas = [...clavesDeProyecto(), ...CLAVES_PREFERENCIA, ...CLAVES_INFRAESTRUCTURA];
    const repetidas = todas.filter((k, i) => todas.indexOf(k) !== i);
    expect(repetidas).toEqual([]);
    const modulos = CLAVES_PROYECTO.map((e) => e.modulo);
    expect(new Set(modulos).size).toBe(modulos.length);
  });

  it('las cinco raras tienen idEsquema distinto de clave y de modulo; el resto, idEsquema === clave', () => {
    for (const e of CLAVES_PROYECTO) {
      if (e.idEsquema === null) continue;
      if (LAS_CINCO_RARAS.includes(e.modulo)) {
        expect(e.idEsquema, e.modulo).not.toBe(e.clave);
        expect(e.idEsquema, e.modulo).not.toBe(e.modulo);
      } else {
        expect(e.idEsquema, e.modulo).toBe(e.clave);
        expect(e.claveVersion, e.modulo).toBe(`${e.clave}-version`);
      }
    }
    expect(CLAVES_PROYECTO.filter((e) => LAS_CINCO_RARAS.includes(e.modulo))).toHaveLength(5);
  });

  it('los módulos con persistidor propio leen clave, versión y guarda de la tabla', () => {
    const casos: Array<[string, { STORAGE_KEY: string; SCHEMA_VERSION_KEY: string; SCHEMA_VERSION: string }]> = [
      ['concreta-cargas-planta', cargasPlanta],
      ['concreta-materiales', materiales],
      ['concreta-memoria-dbse', memoriaDbse],
      ['concreta-viento-nieve', vientoNieve],
    ];
    for (const [modulo, mod] of casos) {
      const e = entradaDe(modulo);
      expect(e, modulo).toBeDefined();
      expect(mod.STORAGE_KEY, modulo).toBe(e?.clave);
      expect(mod.SCHEMA_VERSION_KEY, modulo).toBe(e?.claveVersion);
      expect(mod.SCHEMA_VERSION, modulo).toBe(versionViva(modulo));
    }
  });

  it('lib/obra y lib/pub leen sus claves de la tabla', () => {
    expect(OBRA_KEY).toBe(CLAVE_OBRA);
    expect(PREFIJO_PUB_LIB).toBe(PREFIJO_PUB);
    expect(clavesDeProyecto()).toContain(clavePublicacion('sismo'));
    expect(clasificarClave(clavePublicacion('lo-que-sea'))).toBe('proyecto');
  });

  it('las claves del contenedor son infraestructura y NUNCA viajan en claves', () => {
    for (const k of [CLAVE_OBRA, CLAVE_INDICE_PROYECTOS, CLAVE_PROYECTO_ACTIVO, CLAVE_DESPLEGANDO, `${PREFIJO_PROYECTO}abc-123`]) {
      expect(clasificarClave(k), k).toBe('infraestructura');
      expect(clavesDeProyecto(), k).not.toContain(k);
    }
    expect(CLAVE_PROYECTO_ACTIVO.startsWith(PREFIJO_PROYECTO)).toBe(true);
    expect(CLAVE_INDICE_PROYECTOS.startsWith(PREFIJO_PROYECTO)).toBe(false);
  });

  it('la clave BYOK y el resto de preferencias no viajan', () => {
    expect(clasificarClave('concreta-ai-settings')).toBe('preferencia');
    for (const k of CLAVES_PREFERENCIA) expect(clavesDeProyecto(), k).not.toContain(k);
  });

  it('clasificación de muestra', () => {
    expect(clasificarClave('rc-beams')).toBe('proyecto');
    expect(clasificarClave('rc-beams-version')).toBe('proyecto');
    expect(clasificarClave('concreta-micropiles-soil')).toBe('proyecto');
    expect(clasificarClave('concreta-slope-title')).toBe('proyecto');
    expect(clasificarClave('concreta-theme')).toBe('preferencia');
    expect(clasificarClave('unitSystem')).toBe('preferencia');
    expect(clasificarClave('zzz-desconocida')).toBeNull();
  });
});
