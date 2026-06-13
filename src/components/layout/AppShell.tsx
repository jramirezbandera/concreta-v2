import { Suspense, createContext, useContext, useState } from 'react';
import { Outlet } from 'react-router';
import { Sidebar } from './Sidebar';
import { ToastContainer } from '../ui/Toast';
import { CalculatorProvider } from '../calculator/CalculatorProvider';
import { RouteFallback } from './RouteFallback';
import { ChunkErrorBoundary } from './ChunkErrorBoundary';

interface DrawerContextType {
  openDrawer: () => void;
}

// eslint-disable-next-line react-refresh/only-export-components -- context co-located with the AppShell provider; HMR full-reload is acceptable
export const DrawerContext = createContext<DrawerContextType>({ openDrawer: () => {} });

// eslint-disable-next-line react-refresh/only-export-components
export function useDrawer() {
  return useContext(DrawerContext);
}

export function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <DrawerContext.Provider value={{ openDrawer: () => setDrawerOpen(true) }}>
      <CalculatorProvider>
        <div className="flex h-screen bg-bg-primary text-text-primary overflow-hidden">

          {/* Mobile backdrop */}
          {drawerOpen && (
            <div
              className="fixed inset-0 bg-black/50 z-40 lg:hidden"
              onClick={() => setDrawerOpen(false)}
              aria-hidden="true"
            />
          )}

          <Sidebar isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />

          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <ChunkErrorBoundary>
              <Suspense fallback={<RouteFallback />}>
                <Outlet />
              </Suspense>
            </ChunkErrorBoundary>
          </div>

          <ToastContainer />
        </div>
      </CalculatorProvider>
    </DrawerContext.Provider>
  );
}
