/**
 * El registro del módulo «Viento y nieve»: registro, loader, meta SEO, tarjeta
 * de la landing e icono. Sin cualquiera de ellos la ruta no funciona de verdad
 * o el guardia de la landing falla.
 */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ModuleIcon } from '../../components/ui/ModuleIcon';
import { getModuleByRoute, moduleRegistry } from '../../data/moduleRegistry';
import { routeLoaders } from '../../data/routeLoaders';
import { routeMeta } from '../../data/routeMeta';
import { MODULE_LIBRARY } from '../../pages/landing/modules';

describe('registro de viento y nieve', () => {
  it('está en el registro, en el grupo Acciones, detrás de sismo y shipped', () => {
    const entrada = getModuleByRoute('/acciones/viento-nieve');
    expect(entrada).toBeDefined();
    expect(entrada?.key).toBe('concreta-viento-nieve');
    expect(entrada?.label).toBe('Viento y nieve');
    expect(entrada?.group).toBe('Acciones');
    expect(entrada?.shipped).toBe(true);
    const claves = moduleRegistry.map((m) => m.key);
    expect(claves.indexOf('concreta-viento-nieve')).toBe(claves.indexOf('concreta-seismic') + 1);
  });

  it('tiene loader perezoso, metadatos SEO y tarjeta en la landing', () => {
    expect(routeLoaders['/acciones/viento-nieve']).toBeTypeOf('function');
    expect(routeMeta['/acciones/viento-nieve']?.title).toContain('Viento y nieve');
    const tarjeta = MODULE_LIBRARY.find((m) => m.route === '/acciones/viento-nieve');
    expect(tarjeta?.group).toBe('ACCIONES');
    expect(tarjeta?.ref).toContain('DB SE-AE');
  });

  it('tiene icono propio, no el punto por defecto', () => {
    const svg = renderToStaticMarkup(<ModuleIcon moduleKey="concreta-viento-nieve" />);
    expect(svg).toContain('<svg');
  });
});
