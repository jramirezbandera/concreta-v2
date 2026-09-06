/**
 * El registro del módulo «Cumplimiento del DB SE»: registro, loader, meta SEO,
 * tarjeta de la landing e icono. Sin cualquiera de ellos la ruta no funciona
 * de verdad o el guardia de la landing falla.
 */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ModuleIcon } from '../../components/ui/ModuleIcon';
import { getModuleByRoute, moduleRegistry } from '../../data/moduleRegistry';
import { routeLoaders } from '../../data/routeLoaders';
import { routeMeta } from '../../data/routeMeta';
import { MODULE_LIBRARY } from '../../pages/landing/modules';

describe('registro de la ficha DB SE', () => {
  it('está en el registro, en el grupo Memorias, detrás del cuadro de materiales y shipped', () => {
    const entrada = getModuleByRoute('/memorias/db-se');
    expect(entrada).toBeDefined();
    expect(entrada?.key).toBe('concreta-memoria-dbse');
    expect(entrada?.label).toBe('Cumplimiento del DB SE');
    expect(entrada?.group).toBe('Memorias');
    expect(entrada?.shipped).toBe(true);
    const claves = moduleRegistry.map((m) => m.key);
    expect(claves.indexOf('concreta-memoria-dbse')).toBe(claves.indexOf('concreta-materiales') + 1);
  });

  it('tiene loader perezoso, metadatos SEO y tarjeta en la landing', () => {
    expect(routeLoaders['/memorias/db-se']).toBeTypeOf('function');
    expect(routeMeta['/memorias/db-se']?.title).toContain('Cumplimiento del DB SE');
    expect(routeMeta['/memorias/db-se']?.description.length).toBeLessThanOrEqual(300);
    const tarjeta = MODULE_LIBRARY.find((m) => m.route === '/memorias/db-se');
    expect(tarjeta?.group).toBe('MEMORIAS');
    expect(tarjeta?.ref).toContain('DB SE');
  });

  it('tiene icono propio, no el punto por defecto', () => {
    const svg = renderToStaticMarkup(<ModuleIcon moduleKey="concreta-memoria-dbse" />);
    expect(svg).toContain('<svg');
  });
});
