// routeMeta — the title and description every route puts in the tab and in a
// search result. Micropilotes and FEM 2D shipped without an entry and showed
// the landing's title for months; nothing noticed because the fallback works.

import { describe, expect, it } from 'vitest';
import { BASE_URL, routeMeta } from '../../data/routeMeta';
import { moduleRegistry } from '../../data/moduleRegistry';

describe('routeMeta', () => {
  it('has an entry for every shipped module', () => {
    const missing = moduleRegistry.filter((m) => m.shipped && !routeMeta[m.route]).map((m) => m.route);
    expect(missing, `routes without meta: ${missing.join(', ')}`).toEqual([]);
  });

  it('points at the real domain', () => {
    // concreta.tools is the CNAME; concreta.app was never ours.
    expect(BASE_URL).toBe('https://concreta.tools');
  });
});
