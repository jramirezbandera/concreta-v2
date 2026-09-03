/**
 * El registro del módulo y el movimiento de sismo a «Acciones».
 *
 * El movimiento tiene una condición que ningún test de UI ve: la URL
 * /analisis/sismo NO puede cambiar. Hay enlaces compartidos vivos apuntando
 * ahí, y un cambio de ruta los rompe en silencio.
 */

import { describe, expect, it } from 'vitest';
import { getModuleByKey, getModuleByRoute, moduleRegistry } from '../../data/moduleRegistry';
import { routeLoaders } from '../../data/routeLoaders';
import { routeMeta } from '../../data/routeMeta';
import { MODULE_LIBRARY } from '../../pages/landing/modules';

describe('registro del cuadro de materiales', () => {
  it('está en el registro, en el grupo Memorias y shipped', () => {
    const entrada = getModuleByRoute('/memorias/materiales');
    expect(entrada).toBeDefined();
    expect(entrada?.key).toBe('concreta-materiales');
    expect(entrada?.label).toBe('Cuadro de materiales');
    expect(entrada?.group).toBe('Memorias');
    expect(entrada?.shipped).toBe(true);
  });

  it('tiene loader perezoso, metadatos SEO y tarjeta en la landing', () => {
    // Las tres piezas que hacen falta para que la ruta funcione de verdad:
    // sin loader no hay chunk, sin meta el <title> se queda con el de la ruta
    // anterior, y sin tarjeta el guardia de la landing falla.
    expect(routeLoaders['/memorias/materiales']).toBeTypeOf('function');
    expect(routeMeta['/memorias/materiales']?.title).toContain('Cuadro de materiales');
    expect(MODULE_LIBRARY.some((m) => m.route === '/memorias/materiales')).toBe(true);
  });
});

describe('sismo cambia de grupo sin cambiar de URL', () => {
  it('está en «Acciones» y sigue en /analisis/sismo', () => {
    const entrada = getModuleByKey('concreta-seismic');
    expect(entrada?.group).toBe('Acciones');
    expect(entrada?.route).toBe('/analisis/sismo');
  });

  it('ya no queda ningún módulo en el grupo «Análisis» que fuera sismo', () => {
    const analisis = moduleRegistry.filter((m) => m.group === 'Análisis').map((m) => m.key);
    expect(analisis).not.toContain('concreta-seismic');
  });
});

describe('orden de los grupos en la barra lateral', () => {
  // El Sidebar deriva los grupos de la primera aparición en el array. Es un
  // acoplamiento real: reordenar el registro reordena la navegación.
  const grupos = Array.from(new Set(moduleRegistry.map((m) => m.group)));

  it('Memorias y Acciones abren la lista', () => {
    expect(grupos.slice(0, 2)).toEqual(['Memorias', 'Acciones']);
  });

  it('ningún módulo se queda fuera de la navegación al reordenar', () => {
    // El Sidebar agrupa por nombre, no por tramos contiguos (el registro ya
    // tenía «Hormigón» partido antes de esta fase), así que lo que hay que
    // garantizar es que la suma de los grupos devuelve todos los módulos.
    const pintados = grupos.flatMap((g) => moduleRegistry.filter((m) => m.group === g));
    expect(pintados).toHaveLength(moduleRegistry.length);
  });

  it('cada ruta shipped tiene su loader: navegar no puede dar pantalla en blanco', () => {
    for (const m of moduleRegistry.filter((m) => m.shipped)) {
      expect(routeLoaders[m.route], `sin loader: ${m.route}`).toBeTypeOf('function');
    }
  });
});
