import { describe, it, expect } from 'vitest';
import { getModuleByRoute, MODULE_SCHEMA_VERSIONS } from '../../data/moduleRegistry';

describe('rockfill-wall — registro del módulo', () => {
  it('registra Escollera en la categoría Geotecnia, shipped', () => {
    const entry = getModuleByRoute('/geotec/escollera');
    expect(entry).toBeDefined();
    expect(entry?.key).toBe('concreta-rockfill-wall');
    expect(entry?.label).toBe('Escollera');
    expect(entry?.group).toBe('Geotecnia');
    expect(entry?.shipped).toBe(true);
  });

  it('declara una versión de esquema para la persistencia', () => {
    expect(MODULE_SCHEMA_VERSIONS['rockfill-wall']).toBeDefined();
  });
});
