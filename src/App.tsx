import { createBrowserRouter, RouterProvider } from 'react-router';
import { AppShell, NotFound } from './components/layout/AppShell';
import { ModulePlaceholder } from './components/ui/ModulePlaceholder';
import { RCBeamsModule } from './features/rc-beams';
import { RCColumnsModule } from './features/rc-columns';
import { SteelBeamsModule } from './features/steel-beams';
import { SteelColumnsModule } from './features/steel-columns';
import { RetainingWallModule } from './features/retaining-wall';
import { PunchingModule } from './features/punching';
import { Landing } from './pages/Landing';

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
      {
        path: 'ciment/zapatas',
        element: (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="h-12 shrink-0 flex items-center px-4 bg-bg-primary border-b border-border-main">
              <span className="text-base font-medium text-text-primary">
                Zapatas <span className="text-text-secondary font-normal">— Cimentación</span>
              </span>
            </div>
            <ModulePlaceholder label="Zapatas" group="Cimentación" />
          </div>
        ),
      },
      { path: '*', element: <NotFound /> },
    ],
  },
], { basename: '/concreta-v2' });

export function App() {
  return <RouterProvider router={router} />;
}
