// El control de obra. Vive en la cabecera del Sidebar, que es el único
// contenedor global de la app: la Topbar la renderiza cada módulo dentro del
// <Suspense> de las rutas, y ahí el control desaparecería en cada navegación.
//
// Cuatro verbos sobre un formato (ver lib/proyecto): Nueva · Guardar ·
// Exportar · Importar, y la lista de recientes para Abrir. Sin gate: sin obra
// dice «Sin obra» y no impide nada. La obra se crea perezosamente, cuando hace
// falta guardar o exportar, pidiendo UNA cosa: el nombre.
//
// Cambiar de obra = guardar la actual → desplegar la nueva (con centinela) →
// recargar. Antes de recargar se comprueba si hay una versión nueva de la app
// esperando, porque la recarga la activaría justo después de haber comprobado
// los esquemas contra la versión vieja.

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ChevronDown, Download, FilePlus2, Folder, MapPin, Save, Trash2, Upload, type LucideIcon } from 'lucide-react';
import { getModuleByKey } from '../../data/moduleRegistry';
import {
  borrar,
  cambiarDeProyecto,
  cargar,
  clavesDescartables,
  desajustesDeEsquema,
  guardarActual,
  guardarComoNueva,
  hayTrabajoVivo,
  pestanaDesfasada,
  proyectoActivo,
  proyectoNuevo,
  repararIndice,
  type Desajuste,
  type EntradaIndice,
  type ProyectoFile,
  type ResultadoCambio,
} from '../../lib/proyecto';
import { descargarProyecto, leerFicheroDeProyecto, nombreDeFichero } from '../../lib/proyecto/fichero';
import { hayActualizacionEnEspera, recargar } from '../../lib/proyecto/navegador';
import { useNombreObra, useProyectoActivo, useRecientes } from '../../lib/proyecto/useProyectoActivo';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { showToast } from '../ui/Toast';
import { DialogoNombre } from './DialogoNombre';
import { DialogoObra } from './DialogoObra';
import { guardarObra, leerObra, type Obra } from '../../lib/obra';

type Origen = 'reciente' | 'fichero' | 'nueva';

type Dialogo =
  | { tipo: 'nombre'; titulo: string; texto: string; confirmar: string; alConfirmar: (nombre: string) => void }
  | { tipo: 'obra'; titulo: string; texto: string; confirmar: string; inicial: Obra | null; alConfirmar: (obra: Obra) => void }
  | { tipo: 'guardar-primero'; luego: () => void }
  | { tipo: 'abrir'; destino: ProyectoFile; origen: Origen; desajustes: Desajuste[]; descartadas: number; actualizacion: boolean }
  | { tipo: 'borrar'; entrada: EntradaIndice }
  | null;

/** «Hormigón · Vigas», porque «Vigas» a secas hay tres. */
function etiquetaModulo(modulo: string): string {
  const m = getModuleByKey(modulo);
  return m ? `${m.group} · ${m.label}` : modulo;
}

function mensajeDeFallo(r: ResultadoCambio): string {
  switch (r.paso) {
    case 'guardar-actual':
      return 'No se ha podido guardar la obra abierta (¿almacenamiento lleno?). No se ha cambiado nada.';
    case 'archivar-destino':
      return 'No se ha podido guardar la obra en el navegador (¿almacenamiento lleno?). No se ha cambiado nada.';
    default:
      return r.recuperado
        ? 'La obra no cabía en el almacenamiento: se ha vuelto a la anterior.'
        : 'El cambio de obra se ha quedado a medias. Recarga la página para recuperarla.';
  }
}

function fecha(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

const TITULO_ABRIR: Record<Origen, string> = { reciente: 'Abrir obra', fichero: 'Importar obra', nueva: 'Nueva obra' };

interface ItemProps {
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: string;
}

function Item({ icon: Icon, onClick, disabled, title, children }: ItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="w-full flex items-center gap-2 px-3 py-2 text-[12.5px] text-text-primary hover:bg-bg-elevated transition-colors disabled:opacity-40 disabled:cursor-default disabled:hover:bg-transparent"
    >
      <Icon size={14} className="text-text-secondary shrink-0" aria-hidden="true" />
      {children}
    </button>
  );
}

interface ObraMenuProps {
  /** Cada incremento abre el desplegable (lo pide la ficha de obra de la topbar móvil). */
  peticionApertura?: number;
}

export function ObraMenu({ peticionApertura = 0 }: ObraMenuProps) {
  const [abierto, setAbierto] = useState(false);
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const ref = useRef<HTMLDivElement>(null);
  const ficheroRef = useRef<HTMLInputElement>(null);
  const nombre = useNombreObra();
  const { activo, desfasada } = useProyectoActivo();
  const recientes = useRecientes();

  // La ficha de obra de la topbar móvil pide abrir el menú incrementando un
  // contador: es «estado que se ajusta cuando cambia una prop», durante el
  // render y no en un efecto, para no encadenar un render de más.
  const [peticionAtendida, setPeticionAtendida] = useState(peticionApertura);
  if (peticionApertura !== peticionAtendida) {
    setPeticionAtendida(peticionApertura);
    if (peticionApertura > 0) setAbierto(true);
  }

  useEffect(() => {
    if (!abierto) return;
    const onDocDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false);
    };
    document.addEventListener('mousedown', onDocDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [abierto]);

  const cerrar = () => setAbierto(false);
  const cerrarDialogo = () => setDialogo(null);

  /** Si hay cálculos que no pertenecen a ninguna obra, antes de pisarlos se ofrece guardarlos. */
  const conTrabajoResuelto = (luego: () => void) => {
    if (proyectoActivo() === null && hayTrabajoVivo()) setDialogo({ tipo: 'guardar-primero', luego });
    else luego();
  };

  const ejecutarCambio = (destino: ProyectoFile) => {
    conTrabajoResuelto(() => {
      const r = cambiarDeProyecto(destino);
      if (r.ok) recargar();
      else showToast(mensajeDeFallo(r), { autoDismiss: 7000 });
    });
  };

  /** Lo que hay que decir ANTES de cambiar: esquemas distintos, claves ignoradas, versión nueva esperando. */
  const prepararApertura = async (destino: ProyectoFile, origen: Origen) => {
    const actualizacion = await hayActualizacionEnEspera();
    const desajustes = desajustesDeEsquema(destino);
    const descartadas = clavesDescartables(destino).length;
    if (origen === 'fichero' || desajustes.length > 0 || actualizacion) {
      setDialogo({ tipo: 'abrir', destino, origen, desajustes, descartadas, actualizacion });
    } else {
      ejecutarCambio(destino);
    }
  };

  const avisarGuardado = (p: ProyectoFile | null) => {
    showToast(p ? `Obra guardada: ${p.nombre}` : 'No se ha podido guardar la obra (¿almacenamiento lleno?)', { autoDismiss: 3500 });
  };

  const avisarDesfasada = () =>
    showToast('Esta pestaña muestra otra obra distinta de la abierta: recárgala antes de guardar', { autoDismiss: 5000 });

  const nueva = () => {
    cerrar();
    setDialogo({
      tipo: 'obra',
      titulo: 'Nueva obra',
      texto: activo
        ? 'La obra abierta se guarda y se abre una en blanco. Estos datos los heredan todos los módulos.'
        : 'Se abre una obra en blanco. Estos datos los heredan todos los módulos.',
      confirmar: 'Crear y abrir',
      inicial: null,
      alConfirmar: (obra) => {
        cerrarDialogo();
        void prepararApertura(proyectoNuevo(obra), 'nueva');
      },
    });
  };

  /** Los mismos cinco datos, para corregirlos sin crear otra obra. */
  const datosDeLaObra = () => {
    cerrar();
    setDialogo({
      tipo: 'obra',
      titulo: 'Datos de la obra',
      texto: 'Los heredan todos los módulos y se imprimen en la memoria.',
      confirmar: 'Guardar los datos',
      inicial: leerObra(),
      alConfirmar: (obra) => {
        cerrarDialogo();
        guardarObra(obra);
        showToast('Datos de la obra guardados', { autoDismiss: 3000 });
      },
    });
  };

  const guardar = () => {
    cerrar();
    if (pestanaDesfasada()) return avisarDesfasada();
    if (proyectoActivo() === null) {
      setDialogo({
        tipo: 'nombre',
        titulo: 'Guardar obra',
        texto: 'Lo que hay ahora pasa a ser una obra guardada en este navegador. Desde el menú podrás volver a ella, exportarla o abrir otra.',
        confirmar: 'Guardar',
        alConfirmar: (n) => {
          cerrarDialogo();
          avisarGuardado(guardarComoNueva(n));
        },
      });
      return;
    }
    avisarGuardado(guardarActual());
  };

  const exportar = () => {
    cerrar();
    if (pestanaDesfasada()) return avisarDesfasada();
    const bajar = (p: ProyectoFile | null) => {
      if (!p) return avisarGuardado(null);
      descargarProyecto(p);
      showToast(`Exportada: ${nombreDeFichero(p)}`, { autoDismiss: 4000 });
    };
    if (proyectoActivo() === null) {
      setDialogo({
        tipo: 'nombre',
        titulo: 'Exportar obra',
        texto: 'Para exportarla hace falta un nombre. Se guarda también en este navegador.',
        confirmar: 'Guardar y exportar',
        alConfirmar: (n) => {
          cerrarDialogo();
          bajar(guardarComoNueva(n));
        },
      });
      return;
    }
    bajar(guardarActual());
  };

  const importar = () => {
    cerrar();
    ficheroRef.current?.click();
  };

  const alElegirFichero = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const p = await leerFicheroDeProyecto(f);
      await prepararApertura(p, 'fichero');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se ha podido leer el fichero', { autoDismiss: 7000 });
    }
  };

  const abrirReciente = (id: string) => {
    cerrar();
    if (id === proyectoActivo()) {
      if (pestanaDesfasada()) recargar();
      else showToast('Esa obra ya está abierta', { autoDismiss: 2500 });
      return;
    }
    const p = cargar(id);
    if (!p) {
      repararIndice();
      showToast('No se ha podido leer esa obra guardada; el listado se ha reconstruido', { autoDismiss: 5000 });
      return;
    }
    void prepararApertura(p, 'reciente');
  };

  const confirmarBorrar = (entrada: EntradaIndice) => {
    cerrarDialogo();
    borrar(entrada.id);
    showToast(`Obra borrada: ${entrada.nombre}`, { autoDismiss: 3500 });
    // Sus PDF del anejo se quedaban en IndexedDB para siempre: nadie los
    // referencia ya. Por `import()` para no meter `lib/anejo` en el Sidebar.
    void import('../../lib/anejo').then((m) => m.purgarEnSegundoPlano());
  };

  return (
    <div ref={ref} className="relative px-3 py-2 border-b border-border-main">
      <button
        type="button"
        onClick={() => setAbierto((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label={`Obra: ${nombre ?? 'sin obra'}. Menú de obra`}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-[12.5px] hover:bg-bg-elevated transition-colors"
      >
        <Folder size={14} className="shrink-0 text-accent" aria-hidden="true" />
        <span className={`min-w-0 flex-1 truncate text-left ${nombre ? 'text-text-primary' : 'text-text-disabled'}`}>
          {nombre ?? 'Sin obra'}
        </span>
        <ChevronDown
          size={12}
          aria-hidden="true"
          className={`shrink-0 text-text-secondary transition-transform duration-150 ${abierto ? 'rotate-180' : ''}`}
        />
      </button>

      {abierto && (
        <div
          role="menu"
          aria-label="Obra"
          className="absolute left-3 right-3 top-full mt-1 rounded-md border border-border-main bg-bg-surface z-50 overflow-hidden"
          style={{ boxShadow: '0 12px 30px -12px rgba(0,0,0,0.45)' }}
        >
          <Item icon={FilePlus2} onClick={nueva}>
            Nueva obra…
          </Item>
          <Item icon={MapPin} onClick={datosDeLaObra}>
            Datos de la obra…
          </Item>
          <Item
            icon={Save}
            onClick={guardar}
            disabled={desfasada}
            title={desfasada ? 'Esta pestaña muestra otra obra: recárgala antes de guardar' : undefined}
          >
            Guardar
          </Item>
          <Item icon={Download} onClick={exportar} disabled={desfasada}>
            Exportar…
          </Item>
          <Item icon={Upload} onClick={importar}>
            Importar…
          </Item>

          <p
            className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase text-text-disabled border-t border-border-sub"
            style={{ letterSpacing: '0.11em' }}
          >
            Recientes
          </p>
          {recientes.length === 0 ? (
            <p className="px-3 pb-2.5 text-[11.5px] text-text-disabled">Ninguna obra guardada todavía.</p>
          ) : (
            <ul className="max-h-56 overflow-y-auto pb-1 m-0 p-0 list-none">
              {recientes.map((e) => (
                <li key={e.id} className="flex items-center">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => abrirReciente(e.id)}
                    aria-current={e.id === activo ? 'true' : undefined}
                    className={`flex-1 min-w-0 flex items-center gap-2 px-3 py-1.5 text-[12.5px] text-left hover:bg-bg-elevated transition-colors ${e.id === activo ? 'text-accent' : 'text-text-primary'}`}
                  >
                    <span className="min-w-0 flex-1 truncate">{e.nombre}</span>
                    <span className="shrink-0 text-[10px] font-mono text-text-disabled">{fecha(e.ts)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDialogo({ tipo: 'borrar', entrada: e })}
                    aria-label={`Borrar ${e.nombre}`}
                    className="p-2 text-text-disabled hover:text-state-fail transition-colors"
                  >
                    <Trash2 size={12} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <input
        ref={ficheroRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        tabIndex={-1}
        aria-label="Fichero de obra"
        onChange={(e) => void alElegirFichero(e)}
      />

      {dialogo?.tipo === 'nombre' && (
        <DialogoNombre
          titulo={dialogo.titulo}
          texto={dialogo.texto}
          confirmar={dialogo.confirmar}
          onConfirm={dialogo.alConfirmar}
          onCancel={cerrarDialogo}
        />
      )}

      {dialogo?.tipo === 'obra' && (
        <DialogoObra
          titulo={dialogo.titulo}
          texto={dialogo.texto}
          confirmar={dialogo.confirmar}
          inicial={dialogo.inicial}
          onConfirm={dialogo.alConfirmar}
          onCancel={cerrarDialogo}
        />
      )}

      {dialogo?.tipo === 'guardar-primero' && (
        <DialogoNombre
          titulo="Hay cálculos sin obra"
          texto="Lo que hay ahora en pantalla no pertenece a ninguna obra. Ponle nombre para guardarlo antes de seguir, o descártalo."
          confirmar="Guardar y seguir"
          secundario={{
            label: 'Descartar y seguir',
            onClick: () => {
              cerrarDialogo();
              dialogo.luego();
            },
          }}
          onConfirm={(n) => {
            cerrarDialogo();
            const p = guardarComoNueva(n);
            if (!p) return avisarGuardado(null);
            dialogo.luego();
          }}
          onCancel={cerrarDialogo}
        />
      )}

      {dialogo?.tipo === 'abrir' && (
        <ConfirmDialog
          title={TITULO_ABRIR[dialogo.origen]}
          confirmLabel="Abrir"
          icon={Folder}
          onCancel={cerrarDialogo}
          onConfirm={() => {
            cerrarDialogo();
            ejecutarCambio(dialogo.destino);
          }}
        >
          <span className="block">
            Se abrirá «{dialogo.destino.nombre}».
            {dialogo.origen === 'fichero' && dialogo.destino.app ? ` Guardada con Concreta ${dialogo.destino.app}.` : ''}
          </span>
          {dialogo.desajustes.length > 0 && (
            <span className="block mt-2 text-state-warn">
              Estos módulos se guardaron con otro esquema y se abrirán en blanco:{' '}
              {dialogo.desajustes.map((d) => etiquetaModulo(d.modulo)).join(', ')}.
            </span>
          )}
          {dialogo.descartadas > 0 && (
            <span className="block mt-2">
              El fichero trae {dialogo.descartadas} {dialogo.descartadas === 1 ? 'clave que no es' : 'claves que no son'} de proyecto: se{' '}
              {dialogo.descartadas === 1 ? 'ignorará' : 'ignorarán'}.
            </span>
          )}
          {dialogo.actualizacion && (
            <span className="block mt-2 text-state-warn">
              Hay una versión nueva de Concreta esperando: al abrir esta obra se aplicará.
            </span>
          )}
          {activo && <span className="block mt-2 text-text-disabled">La obra abierta se guarda antes de cambiar.</span>}
        </ConfirmDialog>
      )}

      {dialogo?.tipo === 'borrar' && (
        <ConfirmDialog
          title="Borrar obra"
          confirmLabel="Borrar"
          icon={Trash2}
          onCancel={cerrarDialogo}
          onConfirm={() => confirmarBorrar(dialogo.entrada)}
        >
          <span className="block">
            Se borrará «{dialogo.entrada.nombre}» de este navegador, con los PDF que tuviera en su anejo. Si la habías exportado, el
            fichero no se toca.
          </span>
          {dialogo.entrada.id === activo && (
            <span className="block mt-2 text-state-warn">Es la obra abierta: lo que hay en pantalla se queda, pero sin obra.</span>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}
