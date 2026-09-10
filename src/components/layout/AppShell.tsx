import { Suspense, createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRemonte } from '../../lib/anejo/remonte';
import { Outlet } from 'react-router';
import { Sidebar } from './Sidebar';
import { CalculatorProvider } from '../calculator/CalculatorProvider';
import { RouteFallback } from './RouteFallback';
import { ChunkErrorBoundary } from './ChunkErrorBoundary';
import { BandaAlmacen } from './BandaAlmacen';
import { BandaProyecto } from './BandaProyecto';
import { informeDeArranque, listar } from '../../lib/proyecto';
import { showToast } from '../ui/Toast';

/** Lo que se espera antes de recoger los PDF huérfanos del anejo: primero que la app cargue. */
const RETARDO_PURGA_MS = 4000;

interface OpcionesDrawer {
  /** Abrir el cajón con el menú de obra ya desplegado (la ficha de obra de la topbar móvil). */
  menuObra?: boolean;
}

interface DrawerContextType {
  openDrawer: (opciones?: OpcionesDrawer) => void;
}

// eslint-disable-next-line react-refresh/only-export-components -- context co-located with the AppShell provider; HMR full-reload is acceptable
export const DrawerContext = createContext<DrawerContextType>({ openDrawer: () => {} });

// eslint-disable-next-line react-refresh/only-export-components
export function useDrawer() {
  return useContext(DrawerContext);
}

/** Cuenta, una vez por carga, lo que `repararAlArrancar()` tuvo que hacer con un cambio de obra a medias. */
function avisarDeArranque(): void {
  const informe = informeDeArranque();
  if (!informe?.recuperacion) return;
  const { centinela, resultado } = informe.recuperacion;
  const nombreDe = (id: string | null) => (id ? (listar().find((e) => e.id === id)?.nombre ?? 'la obra') : 'la obra');
  if (resultado === 'destino') {
    showToast(`El cambio a «${nombreDe(centinela.a)}» se había interrumpido; se ha vuelto a abrir.`, { autoDismiss: 8000 });
  } else if (resultado === 'origen') {
    showToast(`No se pudo abrir «${nombreDe(centinela.a)}»; se ha vuelto a «${nombreDe(centinela.de)}».`, { autoDismiss: 8000 });
  } else {
    showToast('Un cambio de obra se quedó a medias y no se ha podido recuperar: revisa los datos antes de guardar.');
  }
}

export function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [peticionMenuObra, setPeticionMenuObra] = useState(0);

  const remonte = useRemonte();

  const openDrawer = useCallback((opciones?: OpcionesDrawer) => {
    setDrawerOpen(true);
    if (opciones?.menuObra) setPeticionMenuObra((n) => n + 1);
  }, []);

  useEffect(() => {
    avisarDeArranque();
    // Mantenimiento: los PDF del anejo que ya no referencia ningún índice
    // (obras borradas, un guardado que se cortó a mitad) ocupan sitio en
    // IndexedDB y nadie los reclama. Con retardo y por `import()`, para no
    // competir con la carga de la pantalla ni meter `lib/anejo` en el arranque.
    const t = setTimeout(() => {
      void import('../../lib/anejo').then((m) => {
        // Antes de purgar: las piezas de antes de que la pieza llevara sus
        // datos adoptan los del módulo si la huella coincide. Va aquí y no en
        // la pantalla del anejo porque la ventana se cierra sola —en cuanto se
        // toca el módulo, la huella deja de coincidir y ya no se puede—, y
        // aquí es lo más pronto que `lib/anejo` entra sin pesar en el arranque.
        m.adoptarDatosDeModulos();
        return m.purgarEnSegundoPlano();
      });
    }, RETARDO_PURGA_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <DrawerContext.Provider value={{ openDrawer }}>
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

          <Sidebar isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} peticionMenuObra={peticionMenuObra} />

          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <BandaAlmacen />
            <BandaProyecto />
            <ChunkErrorBoundary>
              <Suspense fallback={<RouteFallback />}>
                {/* La `key` remonta la ruta activa cuando el desplegable de la
                    topbar salta a otro cálculo o empieza uno nuevo. Los módulos
                    leen el almacén sólo al montarse: sin esto se les cambiarían
                    los datos por debajo y seguirían enseñando los de antes. Sólo
                    sube cuando se pide (`pedirRemonte`), nunca al guardar. */}
                <Outlet key={remonte} />
              </Suspense>
            </ChunkErrorBoundary>
          </div>
        </div>
      </CalculatorProvider>
    </DrawerContext.Provider>
  );
}
