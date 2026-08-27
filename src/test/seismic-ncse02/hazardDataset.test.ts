/**
 * El dataset del Anejo 1 y su manifest.
 *
 * Esto no es dato de adorno: de aqui salen `ab` y `K`, y de ahi el cortante
 * basal de un edificio que se visa. Asi que se comprueba la procedencia (que el
 * fichero sea el que dice el manifest), la completitud (que no falte ninguna
 * fila de la capa) y la integridad del formato columnar.
 *
 * Se sigue el precedente de `pyslope.golden.test.ts`: el manifest tiene que
 * declarar version y hash, y el hash tiene que cuadrar con el fichero de verdad.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import datos from '../../features/seismic-ncse02/ncse02.hazard.json';
import manifest from '../../features/seismic-ncse02/ncse02.hazard.manifest.json';

const RUTA_DATOS = 'src/features/seismic-ncse02/ncse02.hazard.json';

describe('manifest del dataset de peligrosidad', () => {
  it('declara procedencia, licencia y atribucion', () => {
    expect(manifest.layer).toBe('HazardArea2002.NCSE-02');
    expect(manifest.source).toContain('ign.es');
    expect(manifest.infoFormat).toBe('application/json');
    // El IGN publica la capa como CC BY: la atribucion es obligatoria y va
    // ademas en NOTICE. Si el servicio cambiara de licencia, esto salta.
    expect(manifest.license).toBe('CC BY 4.0 ign.es');
    expect(manifest.attribution).toContain('Instituto Geográfico Nacional');
    expect(manifest.generatedBy).toBe('scripts/harvest-ign-hazard.mjs');
  });

  it('declara version de parser y hash, como el manifest de pyslope', () => {
    expect(manifest.parserVersion).toBeGreaterThanOrEqual(1);
    expect(manifest.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('el hash del manifest es el del fichero que hay en disco', () => {
    const bruto = readFileSync(RUTA_DATOS);
    expect(createHash('sha256').update(bruto).digest('hex')).toBe(manifest.sha256);
  });

  it('el barrido cubrio la capa entera, sin un solo hueco', () => {
    // `gid` es clave serie densa de la capa del IGN, asi que la secuencia sin
    // huecos ES la prueba de completitud. No hace falta registro externo.
    expect(manifest.gidSeen).toBe(manifest.gidMax);
    expect(manifest.layerRecordCount).toBe(manifest.gidMax);
  });

  it('las filas de la capa cuadran con las tres categorias', () => {
    expect(
      manifest.harvestedRecordCount + manifest.outsideAnejo1RecordCount + manifest.nonMunicipalRecordCount,
    ).toBe(manifest.layerRecordCount);
  });

  it('el dataset son las filas cosechadas MAS el suplemento, y lo declara', () => {
    // La capa del IGN no es el Anejo 1: le faltan seis municipios que el texto
    // legal si lista (Ceuta y Melilla entre ellos) y no conoce las
    // segregaciones posteriores a 2002. Lo que se anade NO es invencion: sale
    // del BOE y del registro del INE, y va contado aparte para que la
    // proporcion entre cosecha y suplemento este siempre a la vista.
    expect(manifest.anejo1RecordCount).toBe(
      manifest.harvestedRecordCount + manifest.syntheticRecordCount,
    );
    expect(manifest.syntheticRecordCount).toBe(
      manifest.fromBoeRecordCount + manifest.inheritedRecordCount,
    );
    // El suplemento es una minoria pequena. Si esto se dispara, algo va mal en
    // la cosecha y se esta tapando con tabla escrita a mano.
    expect(manifest.syntheticRecordCount).toBeLessThan(manifest.harvestedRecordCount * 0.02);
    expect(manifest.supplementSource).toContain('BOE');
  });

  it('registra lo que costo el barrido, no lo que costo reescribirlo', () => {
    // Un `--solo-escribir` no puede declarar que la tabla se cosecho con cuatro
    // peticiones: invitaria a creer que rehacerla es barato. Son ~67.000.
    expect(manifest.requestCount).toBeGreaterThan(10_000);
    expect(manifest.probeCount).toBeGreaterThan(10_000);
  });
});

describe('dataset columnar', () => {
  const n = datos.ine.length;

  it('solo lleva las filas del Anejo 1', () => {
    expect(n).toBe(manifest.anejo1RecordCount);
    expect(n).toBeGreaterThan(2000);
  });

  it('las columnas paralelas miden lo mismo', () => {
    expect(datos.nombre).toHaveLength(n);
    expect(datos.clave).toHaveLength(n);
    expect(datos.ab).toHaveLength(n);
    expect(datos.k).toHaveLength(n);
  });

  it('los indices caen dentro de sus diccionarios', () => {
    for (const i of datos.ab) expect(datos.abValores[i]).toBeGreaterThan(0);
    for (const i of datos.k) expect(datos.kValores[i]).toBeGreaterThan(0);
    // La decision de servirlo columnar se apoya en que ambos entran en un byte.
    expect(datos.abValores.length).toBeLessThan(256);
    expect(datos.kValores.length).toBeLessThan(256);
  });

  it('los codigos INE son unicos y de cinco digitos', () => {
    expect(new Set(datos.ine).size).toBe(n);
    for (const ine of datos.ine) expect(ine).toMatch(/^\d{5}$/);
  });

  it('va ordenado por codigo INE, que es lo que permite buscar sin recorrer', () => {
    const ordenado = [...datos.ine].sort((a, b) => a.localeCompare(b));
    expect(datos.ine).toEqual(ordenado);
  });

  it('todo lo que esta dentro supera el umbral del art. 1.2.3', () => {
    // El Anejo 1 son los municipios con ab >= 0,04 g. Una fila por debajo
    // significaria que el filtro del harvester ha dejado pasar un nulo.
    for (const v of datos.abValores) expect(v).toBeGreaterThanOrEqual(0.04);
  });

  it('ningun municipio se queda sin clave de busqueda', () => {
    for (let i = 0; i < n; i++) {
      expect(datos.clave[i].length).toBeGreaterThan(0);
      for (const c of datos.clave[i].split('|')) expect(c).toMatch(/^[a-z0-9 ]+$/);
    }
  });
});

describe('busqueda por nombre, sobre el dataset real', () => {
  const buscar = (q: string) =>
    datos.ine
      .map((_, i) => i)
      .filter((i) => datos.clave[i].split('|').some((c) => c.startsWith(q)))
      .map((i) => datos.nombre[i]);

  it('encuentra un nombre bilingue por sus DOS formas', () => {
    // Sin esto, quien teclea "Alacant" recibe "no figura en el Anejo 1", que
    // significa "la Norma no te obliga". El fallo se disfraza de exencion.
    expect(buscar('alicante')).toContain('Alicante/Alacant');
    expect(buscar('alacant')).toContain('Alicante/Alacant');
    expect(buscar('xabia')).toContain('Jávea/Xàbia');
  });

  it('encuentra un nombre con el articulo desinvertido', () => {
    expect(buscar('la union')).toContain('Unión (La)');
    expect(buscar('union')).toContain('Unión (La)');
  });

  it('encuentra sin acentos', () => {
    expect(buscar('malaga')).toContain('Málaga');
    expect(buscar('almeria')).toContain('Almería');
  });

  it('encuentra TODOS los nombres oficiales pegados tal cual', () => {
    // La regresion que este test existe para impedir. Quien copia el nombre del
    // BOE, de un pliego o del propio rotulo de la aplicacion lo pega entero:
    // "Alicante/Alacant", "Union (La)". Antes de indexar el nombre completo,
    // 295 de los 2.610 municipios (11,3 %) no aparecian buscados asi, la
    // capital Alicante entre ellos — y en este modulo un "no encontrado"
    // significa "la Norma no te obliga".
    const plegar = (s: string) =>
      s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

    const fallan: string[] = [];
    for (let i = 0; i < datos.ine.length; i++) {
      const q = plegar(datos.nombre[i]);
      const claves = datos.clave[i].split('|');
      if (!claves.some((c) => c.startsWith(q) || c.includes(q))) fallan.push(datos.nombre[i]);
    }
    expect(fallan).toEqual([]);
  });

  it('sigue encontrando por las formas que se TECLEAN, no solo por la pegada', () => {
    // Indexar el nombre completo no puede haber desplazado a las variantes
    // cortas, que son las que alguien escribe de verdad.
    expect(buscar('alicante')).toContain('Alicante/Alacant');
    expect(buscar('alacant')).toContain('Alicante/Alacant');
    expect(buscar('union')).toContain('Unión (La)');
    expect(buscar('la union')).toContain('Unión (La)');
  });
});

describe('valores conocidos y atipicos', () => {
  const fila = (ine: string) => {
    const i = datos.ine.indexOf(ine);
    expect(i).toBeGreaterThanOrEqual(0);
    return { nombre: datos.nombre[i], ab: datos.abValores[datos.ab[i]], k: datos.kValores[datos.k[i]] };
  };

  it('Granada mantiene el valor con el que se calibro el barrido', () => {
    expect(fila('18087')).toEqual({ nombre: 'Granada', ab: 0.23, k: 1.0 });
  });

  it('el K de Benalup es el del BOE, no el que publica la capa', () => {
    // La capa del IGN publica K = 1,4 para Benalup-Casas Viejas. El Anejo 1
    // dice (1,2), como sus vecinos de Cadiz (Alcala de los Gazules 1,2,
    // Barbate 1,2, Chiclana 1,3). Se re-consulto contra el servicio y el IGN
    // lo publica asi de verdad: es un error de la capa, no del parseo.
    expect(fila('11901')).toEqual({ nombre: 'Benalup-Casas Viejas', ab: 0.05, k: 1.2 });
    expect(datos.procedencia['11901'].tipo).toBe('correccion');
  });

  it('ningun K pasa de 1,3, porque la NCSE-02 no usa ningun valor mayor', () => {
    // Barrido del Anejo 1 entero: los unicos K del texto legal son 1,0 · 1,1 ·
    // 1,2 · 1,3. Un 1,4 en el dataset solo puede venir de la capa del IGN sin
    // corregir, que es justo lo que este modulo dejo de propagar.
    expect(Math.max(...datos.kValores)).toBeLessThanOrEqual(1.3);
  });

  it('fija el maximo de ab de toda Espana, que es de UN solo municipio', () => {
    expect(fila('18072')).toEqual({ nombre: 'Escúzar', ab: 0.25, k: 1.0 });
    expect(Math.max(...datos.abValores)).toBe(0.25);
  });
});

describe('suplemento: lo que la capa del IGN no resuelve', () => {
  const fila = (ine: string) => {
    const i = datos.ine.indexOf(ine);
    expect(i, `${ine} no esta en el dataset`).toBeGreaterThanOrEqual(0);
    return { nombre: datos.nombre[i], ab: datos.abValores[datos.ab[i]], k: datos.kValores[datos.k[i]] };
  };

  it('Ceuta y Melilla estan, con los valores del Anejo 1', () => {
    // La capa las publica con aceleracion nula porque el Anejo 1 las pone al
    // final, sueltas, fuera de todo bloque de provincia: cualquier proceso que
    // indexe por provincia las pierde. Sin esto, el buscador respondia "no
    // figura en el Anejo 1" y el usuario leia una exencion que no existe.
    expect(fila('51001')).toEqual({ nombre: 'Ceuta', ab: 0.05, k: 1.2 });
    expect(fila('52001')).toEqual({ nombre: 'Melilla', ab: 0.08, k: 1.0 });
  });

  it('Melilla cae justo en el umbral del art. 1.2.3, y por eso importa el valor', () => {
    // La exencion de porticos arriostrados pide ab < 0,08 g. Con 0,08 g
    // exactamente NO aplica: la Norma es obligatoria. Un modulo que diera
    // Melilla por exenta se equivocaria en el borde mismo de la decision.
    expect(fila('52001').ab).toBe(0.08);
  });

  it('los otros cuatro ausentes de la capa tambien estan', () => {
    expect(fila('06005')).toEqual({ nombre: 'Albuera (La)', ab: 0.05, k: 1.3 });
    expect(fila('22106')).toEqual({ nombre: 'Fago', ab: 0.05, k: 1.0 });
    expect(fila('31144')).toEqual({ nombre: 'Larraun', ab: 0.04, k: 1.0 });
    expect(fila('20905')).toEqual({ nombre: 'Orendain', ab: 0.04, k: 1.0 });
  });

  it('los municipios creados despues de 2002 heredan de su termino de origen', () => {
    // El caso mas grave que habia: Fornes y Jatar salen de Arenas del Rey, area
    // epicentral del terremoto de Andalucia de 1884 y de las aceleraciones mas
    // altas de Espana. La aplicacion los daba por exentos.
    expect(fila('18077')).toEqual({ nombre: 'Fornes', ab: 0.24, k: 1.0 });
    expect(fila('18106')).toEqual({ nombre: 'Játar', ab: 0.24, k: 1.0 });
    expect(fila('18914')).toEqual({ nombre: 'Valderrubio', ab: 0.22, k: 1.0 });
    expect(fila('04904')).toEqual({ nombre: 'Balanegra', ab: 0.14, k: 1.0 });
  });

  it('las tres altas que NO usan el rango 9xx tambien estan', () => {
    // Detectar segregaciones por "codigo >= 900" se deja fuera estas tres, y
    // las tres son de Granada. La tabla del suplemento es explicita por esto.
    const proc = datos.procedencia as Record<string, { tipo: string }>;
    for (const ine of ['18065', '18077', '18106']) {
      expect(datos.ine).toContain(ine);
      expect(proc[ine].tipo).toBe('segregado');
    }
  });

  it('un segregado cuyo padre esta exento NO entra, que es lo correcto', () => {
    // Oza-Cesuras (A Coruna) fusiona dos municipios que no llegan a 0,04 g. El
    // termino nuevo hereda esa exencion, y meterlo en la tabla seria inventar
    // una obligacion que la Norma no impone.
    expect(datos.ine).not.toContain('15902');
  });

  it('cada fila suplementada declara de donde sale, y las demas no llevan lastre', () => {
    const n = datos.ine.length;
    const proc = datos.procedencia as Record<string, { tipo: string }>;
    expect(Object.keys(proc).length).toBeLessThan(n * 0.02);
    for (const [ine, p] of Object.entries(proc)) {
      expect(datos.ine, `${ine} tiene procedencia pero no fila`).toContain(ine);
      expect(['anejo1-texto', 'segregado', 'correccion']).toContain(p.tipo);
    }
    // Granada sale de la capa tal cual: no lleva entrada de procedencia.
    expect(proc['18087']).toBeUndefined();
  });

  it('un segregado nombra al municipio del que hereda: el PDF lo necesita', () => {
    const p = datos.procedencia['18077'] as { tipo: string; padre: { ine: string; nombre: string }; anio: number };
    expect(p.padre).toEqual({ ine: '18020', nombre: 'Arenas del Rey' });
    expect(p.anio).toBe(2018);
  });
});
