/**
 * El registro del módulo «Incendio»: registro, loader, meta SEO, tarjeta de la
 * landing, icono, clave de proyecto y adaptador del anejo.
 *
 * Un módulo de esta casa se da de alta en SEIS sitios más la tabla de claves de
 * proyecto, y ninguno de los seis se queja solo: sin el loader la ruta queda en
 * blanco, sin la fila de `proyectoKeys` el módulo no viaja en el `.concreta` y
 * sin el adaptador no se puede guardar en el anejo de cálculo. Este test los
 * mira todos de una vez.
 */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ModuleIcon } from '../../components/ui/ModuleIcon';
import { getModuleByRoute, moduleRegistry } from '../../data/moduleRegistry';
import { entradaDe } from '../../data/proyectoKeys';
import { routeLoaders } from '../../data/routeLoaders';
import { routeMeta } from '../../data/routeMeta';
import { adaptadorDe } from '../../lib/anejo/modules';
import { MODULE_LIBRARY } from '../../pages/landing/modules';
import { CLAVE_MIGRADO, CLAVE_TITULO, MODULO_PUB, STORAGE_KEY } from '../../features/incendio/state';

describe('registro de incendio', () => {
  it('está en el registro, en Acciones y detrás de cargas por planta', () => {
    const entrada = getModuleByRoute('/acciones/incendio');
    expect(entrada).toBeDefined();
    expect(entrada?.key).toBe('concreta-incendio');
    expect(entrada?.label).toBe('Incendio');
    expect(entrada?.group).toBe('Acciones');
    expect(entrada?.shipped).toBe(true);
    const claves = moduleRegistry.map((m) => m.key);
    expect(claves.indexOf('concreta-incendio')).toBe(claves.indexOf('concreta-cargas-planta') + 1);
  });

  it('tiene loader perezoso, metadatos SEO y tarjeta en la landing', () => {
    expect(routeLoaders['/acciones/incendio']).toBeTypeOf('function');
    expect(routeMeta['/acciones/incendio']?.title).toContain('DB SI 6');
    const tarjeta = MODULE_LIBRARY.find((m) => m.route === '/acciones/incendio');
    expect(tarjeta?.group).toBe('ACCIONES');
    // Es DB SI, no DB SE-AE: el fuego no es una acción climática.
    expect(tarjeta?.ref).toContain('DB SI');
  });

  it('tiene icono propio, no el punto por defecto', () => {
    expect(renderToStaticMarkup(<ModuleIcon moduleKey="concreta-incendio" />)).toContain('<svg');
  });

  it('viaja en el .concreta con sus satélites, la marca de migración incluida', () => {
    const fila = entradaDe('concreta-incendio');
    expect(fila?.clave).toBe(STORAGE_KEY);
    // La marca de «ya migrado» tiene que ser SATÉLITE DE PROYECTO y no una
    // preferencia: `desplegar()` reemplaza las claves de proyecto al abrir una
    // obra, y una preferencia global suprimiría la migración en la siguiente.
    expect(fila?.satelites).toContain(CLAVE_MIGRADO);
    expect(fila?.satelites).toContain(CLAVE_TITULO);
    expect(fila?.satelites).toContain(`concreta-pub-${MODULO_PUB}`);
  });

  it('y tiene adaptador del anejo, como capítulo de memoria', () => {
    const a = adaptadorDe('concreta-incendio');
    expect(a.seccion).toBe('memoria');
    expect(a.capitulo).toContain('fuego');
  });
});
