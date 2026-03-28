import { createBrowserRouter, RouterProvider } from 'react-router';
import { AppShell, NotFound } from './components/layout/AppShell';
import { ModulePlaceholder } from './components/ui/ModulePlaceholder';
import { RCBeamsModule } from './features/rc-beams';
import { Landing } from './pages/Landing';

const router = createBrowserRouter([
  // Landing page
  { path: '/', element: <Landing /> },

  // App shell (pathless layout wrapper)
  {
    element: <AppShell />,
    children: [
      { path: 'horm/vigas', element: <RCBeamsModule /> },
      {
        path: 'horm/pilares',
        element: (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="h-12 shrink-0 flex items-center px-4 bg-bg-primary border-b border-border-main">
              <span className="text-base font-medium text-text-primary">
                Pilares <span className="text-text-secondary font-normal">— Hormigón Armado</span>
              </span>
            </div>
            <ModulePlaceholder label="Pilares" group="Hormigón" />
          </div>
        ),
      },
      {
        path: 'acero/vigas',
        element: (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="h-12 shrink-0 flex items-center px-4 bg-bg-primary border-b border-border-main">
              <span className="text-base font-medium text-text-primary">
                Vigas <span className="text-text-secondary font-normal">— Acero</span>
              </span>
            </div>
            <ModulePlaceholder label="Vigas" group="Acero" />
          </div>
        ),
      },
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
]);

export function App() {
  return <RouterProvider router={router} />;
}
