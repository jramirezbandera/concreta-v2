// Single source of truth for lazy module loaders. Both the router (in App.tsx)
// and the Sidebar hover-prefetch consume the same `() => import(...)` per
// route, so Vite emits one chunk per module and the browser module loader
// dedupes hover + click into a single network fetch.
//
// Kept SEPARATE from moduleRegistry so product metadata (label, group,
// defaults, schema versions) doesn't get coupled to bundling concerns.

export const routeLoaders: Record<string, () => Promise<unknown>> = {
  '/horm/vigas': () => import('../features/rc-beams'),
  '/horm/pilares': () => import('../features/rc-columns'),
  '/horm/punzonamiento': () => import('../features/punching'),
  '/horm/forjados': () => import('../features/forjados'),
  '/acero/vigas': () => import('../features/steel-beams'),
  '/acero/pilares': () => import('../features/steel-columns'),
  '/acero/seccion-compuesta': () => import('../features/compositeSection'),
  '/acero/placas-de-anclaje': () => import('../features/anchor-plate'),
  '/ciment/muros': () => import('../features/retaining-wall'),
  '/ciment/encepados': () => import('../features/pile-cap'),
  '/ciment/micropilotes': () => import('../features/micropiles'),
  '/ciment/zapatas': () => import('../features/isolated-footing'),
  '/rehab/empresillado': () => import('../features/empresillado'),
  '/rehab/muros-fabrica': () => import('../features/masonry-walls'),
  '/madera/vigas': () => import('../features/timber-beams'),
  '/madera/pilares': () => import('../features/timber-columns'),
  '/analisis/fem': () => import('../features/fem-analysis'),
};

export function getRouteLoader(route: string): (() => Promise<unknown>) | undefined {
  return routeLoaders[route];
}
