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
      manifest.anejo1RecordCount + manifest.outsideAnejo1RecordCount + manifest.nonMunicipalRecordCount,
    ).toBe(manifest.layerRecordCount);
    // Ni una fila inventada: el dataset se cosecha, no se sintetiza.
    expect(manifest.syntheticRecordCount).toBe(0);
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

  it('fija los dos atipicos de la fuente, que son de UN solo municipio', () => {
    // Ninguno de los dos es un fallo de parseo: se re-consultaron uno a uno
    // contra el servicio y el IGN los publica asi. Se fijan aqui para que, si
    // el IGN republica la capa y los corrige, el cambio no pase inadvertido.
    // K = 1,4 en un unico municipio, y sus vecinos de Cadiz llevan 1,3:
    expect(fila('11901')).toEqual({ nombre: 'Benalup-Casas Viejas', ab: 0.05, k: 1.4 });
    expect(datos.k.filter((i) => datos.kValores[i] === 1.4)).toHaveLength(1);
    // ab = 0,25 en un unico municipio, y es el maximo de toda Espana:
    expect(fila('18072')).toEqual({ nombre: 'Escúzar', ab: 0.25, k: 1.0 });
    expect(Math.max(...datos.abValores)).toBe(0.25);
  });
});
