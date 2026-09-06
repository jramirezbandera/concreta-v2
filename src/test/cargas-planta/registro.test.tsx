/**
 * El registro del módulo «Cargas por planta»: registro, loader, meta SEO,
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

describe('registro de cargas por planta', () => {
  it('está en el registro, en el grupo Acciones, detrás de viento y nieve y shipped', () => {
    const entrada = getModuleByRoute('/acciones/cargas-planta');
    expect(entrada).toBeDefined();
    expect(entrada?.key).toBe('concreta-cargas-planta');
    expect(entrada?.label).toBe('Cargas por planta');
    expect(entrada?.group).toBe('Acciones');
    expect(entrada?.shipped).toBe(true);
    const claves = moduleRegistry.map((m) => m.key);
    expect(claves.indexOf('concreta-cargas-planta')).toBe(claves.indexOf('concreta-viento-nieve') + 1);
  });

  it('tiene loader perezoso, metadatos SEO y tarjeta en la landing', () => {
    expect(routeLoaders['/acciones/cargas-planta']).toBeTypeOf('function');
    expect(routeMeta['/acciones/cargas-planta']?.title).toContain('Cargas por planta');
    const tarjeta = MODULE_LIBRARY.find((m) => m.route === '/acciones/cargas-planta');
    expect(tarjeta?.group).toBe('ACCIONES');
    expect(tarjeta?.ref).toContain('DB SE-AE');
  });

  it('tiene icono propio, no el punto por defecto', () => {
    const svg = renderToStaticMarkup(<ModuleIcon moduleKey="concreta-cargas-planta" />);
    expect(svg).toContain('<svg');
  });
});
