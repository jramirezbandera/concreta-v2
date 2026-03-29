import { createContext, useContext, useState } from 'react';
import { Outlet, Navigate } from 'react-router';
import { Sidebar } from './Sidebar';
import { ToastContainer } from '../ui/Toast';

interface DrawerContextType {
  openDrawer: () => void;
}

export const DrawerContext = createContext<DrawerContextType>({ openDrawer: () => {} });

// eslint-disable-next-line react-refresh/only-export-components
export function useDrawer() {
  return useContext(DrawerContext);
}

export function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <DrawerContext.Provider value={{ openDrawer: () => setDrawerOpen(true) }}>
      <div className="flex h-screen bg-bg-primary text-text-primary overflow-hidden">

        {/* Mobile backdrop */}
        {drawerOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
        )}

        <Sidebar isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Outlet />
        </div>

        <ToastContainer />
      </div>
    </DrawerContext.Provider>
  );
}

export function NotFound() {
  return <Navigate to="/horm/vigas" replace />;
}
