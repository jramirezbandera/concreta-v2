import { createBrowserRouter, RouterProvider } from 'react-router';
import { HelmetProvider } from 'react-helmet-async';
import { AppShell, NotFound } from './components/layout/AppShell';
import { RCBeamsModule } from './features/rc-beams';
import { RCColumnsModule } from './features/rc-columns';
import { SteelBeamsModule } from './features/steel-beams';
import { SteelColumnsModule } from './features/steel-columns';
import { RetainingWallModule } from './features/retaining-wall';
import { PunchingModule } from './features/punching';
import { CompositeSectionModule } from './features/compositeSection';
import { PileCapModule } from './features/pile-cap';
import { IsolatedFootingModule } from './features/isolated-footing';
import { EmpresalladoModule } from './features/empresillado';
import { TimberBeamsModule } from './features/timber-beams';
import { TimberColumnsModule } from './features/timber-columns';
import { ForjadosModule } from './features/forjados';
import { AnchorPlateModule } from './features/anchor-plate';
import { FemAnalysisModule } from './features/fem-analysis';
import { Landing } from './pages/Landing';
import { UnitSystemProvider } from './lib/units/UnitSystemProvider';

const router = createBrowserRouter([
  // Landing page
  { path: '/', element: <Landing /> },

  // App shell (pathless layout wrapper)
  {
    element: <AppShell />,
    children: [
      { path: 'horm/vigas', element: <RCBeamsModule /> },
      { path: 'horm/pilares', element: <RCColumnsModule /> },
      { path: 'acero/vigas', element: <SteelBeamsModule /> },
      { path: 'acero/pilares', element: <SteelColumnsModule /> },
      { path: 'ciment/muros', element: <RetainingWallModule /> },
      { path: 'horm/punzonamiento', element: <PunchingModule /> },
      { path: 'horm/forjados', element: <ForjadosModule /> },
      { path: 'acero/seccion-compuesta', element: <CompositeSectionModule /> },
      { path: 'ciment/encepados', element: <PileCapModule /> },
      { path: 'ciment/zapatas', element: <IsolatedFootingModule /> },
      { path: 'rehab/empresillado', element: <EmpresalladoModule /> },
      { path: 'madera/vigas', element: <TimberBeamsModule /> },
      { path: 'madera/pilares', element: <TimberColumnsModule /> },
      { path: 'acero/placas-de-anclaje', element: <AnchorPlateModule /> },
      { path: 'analisis/fem', element: <FemAnalysisModule /> },
      { path: '*', element: <NotFound /> },
    ],
  },
], { basename: '/concreta-v2' });

export function App() {
  return (
    <HelmetProvider>
      <UnitSystemProvider>
        <RouterProvider router={router} />
      </UnitSystemProvider>
    </HelmetProvider>
  );
}
