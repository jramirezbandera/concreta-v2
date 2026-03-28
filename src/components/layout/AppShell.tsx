import { Outlet, Navigate } from 'react-router';
import { Sidebar } from './Sidebar';
import { ToastContainer } from '../ui/Toast';

export function AppShell() {
  return (
    <div className="flex h-screen bg-bg-primary text-text-primary overflow-hidden">
      {/* Narrow-viewport notice (<900px) */}
      <div className="hidden max-[900px]:flex fixed inset-0 z-50 items-center justify-center bg-bg-primary p-8 text-center">
        <div>
          <svg className="mx-auto mb-4 text-text-disabled" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8M12 17v4" />
          </svg>
          <p className="text-base text-text-secondary">
            Concreta funciona mejor en escritorio (≥ 900 px)
          </p>
        </div>
      </div>

      {/* Main layout */}
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Outlet />
      </div>
      <ToastContainer />
    </div>
  );
}

// Redirect narrow-viewport guard is CSS-only (see above).
// This component handles the 404 fallback redirect.
export function NotFound() {
  return <Navigate to="/horm/vigas" replace />;
}
