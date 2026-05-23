import { createBrowserRouter, RouterProvider, Navigate, Outlet } from 'react-router';
import { HelmetProvider } from 'react-helmet-async';
import { AppShell } from './components/layout/AppShell';
import { Landing } from './pages/Landing';
import { RouteFallback } from './components/layout/RouteFallback';
import { RouteHelmet } from './components/layout/RouteHelmet';
import { UnitSystemProvider } from './lib/units/UnitSystemProvider';

// Route configs use react-router v7's `lazy` so chunk loading integrates with
// the data router's pending-state machine. `HydrateFallback` paints during the
// initial chunk fetch (cold deep-link). The AppShell-level <Suspense> covers
// in-app navigation between already-mounted calculator routes.
//
// Landing stays eager — it's the LCP-critical marketing entry point.
//
// RootLayout renders <RouteHelmet /> above <Outlet />, so the document title
// and description update synchronously on navigation BEFORE the lazy chunk
// lands. Without this, the previous route's <Helmet> stays painted for the
// chunk-load window.

function RootLayout() {
  return (
    <>
      <RouteHelmet />
      <Outlet />
    </>
  );
}

const lazyComponent = <T,>(loader: () => Promise<Record<string, T>>, name: string) =>
  () => loader().then((m) => ({ Component: m[name] as React.ComponentType }));

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    HydrateFallback: RouteFallback,
    children: [
      { path: '/', element: <Landing /> },

      // Marketing subpages — lazy.
      {
        path: '/normativa',
        lazy: lazyComponent(() => import('./pages/Normativa'), 'Normativa'),
      },
      {
        path: '/about',
        lazy: lazyComponent(() => import('./pages/About'), 'About'),
      },
      {
        path: '/pricing',
        lazy: lazyComponent(() => import('./pages/Pricing'), 'Pricing'),
      },
      {
        path: '/blog',
        lazy: lazyComponent(() => import('./pages/Blog'), 'Blog'),
      },
      {
        path: '/blog/:slug',
        lazy: lazyComponent(() => import('./pages/BlogPost'), 'BlogPost'),
      },

      // App shell (pathless layout wrapper). Sidebar stays mounted while
      // calculator chunks load inside AppShell's internal <Suspense>.
      {
        element: <AppShell />,
        children: [
          {
            path: 'horm/vigas',
            lazy: lazyComponent(() => import('./features/rc-beams'), 'RCBeamsModule'),
          },
          {
            path: 'horm/pilares',
            lazy: lazyComponent(() => import('./features/rc-columns'), 'RCColumnsModule'),
          },
          {
            path: 'horm/punzonamiento',
            lazy: lazyComponent(() => import('./features/punching'), 'PunchingModule'),
          },
          {
            path: 'horm/forjados',
            lazy: lazyComponent(() => import('./features/forjados'), 'ForjadosModule'),
          },
          {
            path: 'acero/vigas',
            lazy: lazyComponent(() => import('./features/steel-beams'), 'SteelBeamsModule'),
          },
          {
            path: 'acero/pilares',
            lazy: lazyComponent(() => import('./features/steel-columns'), 'SteelColumnsModule'),
          },
          {
            path: 'acero/seccion-compuesta',
            lazy: lazyComponent(() => import('./features/compositeSection'), 'CompositeSectionModule'),
          },
          {
            path: 'acero/placas-de-anclaje',
            lazy: lazyComponent(() => import('./features/anchor-plate'), 'AnchorPlateModule'),
          },
          {
            path: 'ciment/muros',
            lazy: lazyComponent(() => import('./features/retaining-wall'), 'RetainingWallModule'),
          },
          {
            path: 'ciment/encepados',
            lazy: lazyComponent(() => import('./features/pile-cap'), 'PileCapModule'),
          },
          {
            path: 'ciment/micropilotes',
            lazy: lazyComponent(() => import('./features/micropiles'), 'MicropilesModule'),
          },
          {
            path: 'ciment/zapatas',
            lazy: lazyComponent(() => import('./features/isolated-footing'), 'IsolatedFootingModule'),
          },
          {
            path: 'rehab/empresillado',
            lazy: lazyComponent(() => import('./features/empresillado'), 'EmpresalladoModule'),
          },
          {
            path: 'rehab/muros-fabrica',
            lazy: lazyComponent(() => import('./features/masonry-walls'), 'MasonryWallsModule'),
          },
          {
            path: 'madera/vigas',
            lazy: lazyComponent(() => import('./features/timber-beams'), 'TimberBeamsModule'),
          },
          {
            path: 'madera/pilares',
            lazy: lazyComponent(() => import('./features/timber-columns'), 'TimberColumnsModule'),
          },
          {
            path: 'analisis/fem',
            lazy: lazyComponent(() => import('./features/fem-analysis'), 'FemAnalysisModule'),
          },
        ],
      },

      // Catch-all redirect. Hoisted out of AppShell children so a 404 doesn't
      // bootstrap the entire sidebar tree just to redirect.
      { path: '*', element: <Navigate to="/horm/vigas" replace /> },
    ],
  },
]);

export function App() {
  return (
    <HelmetProvider>
      <UnitSystemProvider>
        <RouterProvider router={router} />
      </UnitSystemProvider>
    </HelmetProvider>
  );
}
