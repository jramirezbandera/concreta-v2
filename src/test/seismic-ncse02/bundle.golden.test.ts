/**
 * Dónde acaba el dataset del Anejo 1 dentro del bundle.
 *
 * Son TRES aserciones distintas y hacen falta las tres. Comprobar el tamaño de
 * `index-*.js` no demuestra que el módulo funcione sin red, y comprobar que el
 * chunk existe no demuestra que esté precacheado:
 *
 *   (a) el dataset NO viaja en el chunk de arranque
 *   (b) vive en un chunk propio, por debajo del límite de precache (4 MiB)
 *   (c) ese chunk ESTÁ en el manifiesto de precache del service worker
 *
 * La (c) es la que sostiene la promesa de que el módulo abre offline, y es la
 * que ningún test de tamaño puede sustituir.
 *
 * Lo que decide en qué chunk cae el dataset es el GRAFO DE IMPORTS, no la
 * carpeta: `features/seismic-ncse02/hazard.ts` lo carga con `import()` dinámico
 * y es su único importador. Si alguien lo convierte en import estático, (a)
 * falla aquí.
 *
 * Necesita un `bun run build` previo. Sin `dist/` se salta, porque obligar a
 * construir en cada `vitest run` costaría más de lo que aporta.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIST = 'dist';
const ASSETS = join(DIST, 'assets');
const hayBuild = existsSync(ASSETS) && existsSync(join(DIST, 'sw.js'));

/**
 * Rastro que sólo puede venir del dataset. Es un NOMBRE y no un código INE a
 * propósito: el bundler comprime el array de códigos en una plantilla unida por
 * puntos, así que `"30024"` con comillas no aparece literal en el chunk. Un
 * nombre sobrevive a esa transformación y a cualquier otra que la agrupe.
 */
const HUELLA = 'Asparrena';
const LIMITE_PRECACHE = 4 * 1024 * 1024;

describe.skipIf(!hayBuild)('el dataset del Anejo 1 en el bundle', () => {
  const js = readdirSync(ASSETS).filter((f) => f.endsWith('.js'));
  const contiene = (f: string) => readFileSync(join(ASSETS, f), 'utf8').includes(HUELLA);
  const conDataset = js.filter(contiene);

  it('(a) el chunk de arranque NO lo arrastra', () => {
    const entrada = js.filter((f) => /^index-[^.]*\.js$/.test(f));
    expect(entrada.length).toBeGreaterThan(0);
    for (const f of entrada) {
      expect(contiene(f), `${f} arrastra el dataset: alguien ha puesto un import estático`).toBe(
        false,
      );
    }
  });

  it('(b) vive en su propio chunk y cabe en el precache', () => {
    expect(conDataset.length).toBeGreaterThan(0);
    for (const f of conDataset) {
      expect(statSync(join(ASSETS, f)).size).toBeLessThan(LIMITE_PRECACHE);
    }
  });

  it('(c) ese chunk está en el precache del service worker', () => {
    // Sin esto el módulo abre, el buscador pide el chunk, no hay red y el
    // usuario se queda mirando una lista vacía sin saber por qué.
    const sw = readFileSync(join(DIST, 'sw.js'), 'utf8');
    for (const f of conDataset) {
      expect(sw.includes(f), `${f} no está precacheado: el módulo no abriría offline`).toBe(true);
    }
  });
});
