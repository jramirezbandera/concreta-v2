import { useContext, useState, type ReactNode } from 'react';
import { UNSAFE_NavigationContext } from 'react-router';
import { DialogoNombre } from '../components/layout/DialogoNombre';
import { showToast } from '../components/ui/Toast';
import { guardarPieza, RUTA_ANEJO, type ResultadoPieza } from '../lib/anejo';
import { leerObra } from '../lib/obra';
import { guardarComoNueva, pestanaDesfasada, proyectoActivo } from '../lib/proyecto';

export interface PeticionGuardarEnAnejo {
  /** `moduleRegistry.key` del módulo en pantalla. */
  modulo: string;
  /** El título del documento tal como lo tecleó el usuario (vacío ⇒ el capítulo). */
  titulo: string;
  /** El PDF que acaba de producir el exportador. */
  blob: Blob;
  /** Páginas, si el exportador las sabe; si no, se cuentan abriendo el PDF. */
  paginas?: number;
}

export type ResultadoGuardarEnAnejo =
  | ResultadoPieza
  | { ok: false; donde: 'obra'; motivo: 'desfasada' | 'cancelado' | 'cuota' };

/**
 * «Guardar en el anejo», el gesto entero: el PDF que el usuario acaba de ver
 * pasa al anejo de la obra, con sus toasts, y si todavía no hay obra se pide
 * UNA cosa —su nombre— y se crea (la creación perezosa del design doc).
 *
 * El hook no genera nada: recibe el blob del exportador de siempre. Lo usan el
 * modal de previsualización (veinte módulos, sin que ninguno lo sepa) y los
 * cuatro módulos de memoria desde su desplegable «Exportar». Quien lo usa
 * tiene que renderizar `dialogo`, que es el diálogo del nombre cuando toca.
 */
export function useGuardarEnAnejo() {
  const [guardando, setGuardando] = useState(false);
  const [peticionNombre, setPeticionNombre] = useState<{ resolver: (nombre: string | null) => void } | null>(null);
  // «Ver anejo» en el toast lleva a la pantalla del anejo. Se lee el contexto en
  // vez de `useNavigate` porque fuera de un Router éste lanza, y el modal de
  // previsualización se monta también en tests sin Router: sin Router, sin acción.
  const navegacion = useContext(UNSAFE_NavigationContext);

  const pedirNombre = () => new Promise<string | null>((resolver) => setPeticionNombre({ resolver }));

  const guardar = async (p: PeticionGuardarEnAnejo): Promise<ResultadoGuardarEnAnejo> => {
    if (pestanaDesfasada()) {
      showToast('Otra pestaña ha cambiado de obra. Recarga antes de guardar en el anejo.', { autoDismiss: 5000 });
      return { ok: false, donde: 'obra', motivo: 'desfasada' };
    }
    setGuardando(true);
    try {
      if (proyectoActivo() === null) {
        const nombre = await pedirNombre();
        if (nombre === null) return { ok: false, donde: 'obra', motivo: 'cancelado' };
        if (!guardarComoNueva(nombre)) {
          showToast('No hay sitio para guardar la obra. Libera espacio en el navegador.', { autoDismiss: 6000 });
          return { ok: false, donde: 'obra', motivo: 'cuota' };
        }
      }
      // Estrenar capítulo o pisar el que el módulo tenía abierto lo decide
      // `guardarPieza` por dentro (`destinoDeGuardado`), que es donde vive la
      // regla. Aquí sólo se cuenta el desenlace.
      const r = await guardarPieza(p);
      showToast(mensajeDe(r), {
        autoDismiss: 6000,
        action: r.ok && navegacion ? { label: 'Ver anejo', onClick: () => navegacion.navigator.push(RUTA_ANEJO) } : undefined,
      });
      return r;
    } finally {
      setGuardando(false);
    }
  };

  const dialogo: ReactNode = peticionNombre ? (
    <DialogoNombre
      titulo="Guardar en el anejo"
      texto="El anejo es de una obra, y ésta todavía no tiene nombre. Ponle el nombre y la pieza se guarda en su anejo."
      confirmar="Crear la obra y guardar"
      inicial={leerObra()?.denominacion ?? ''}
      onConfirm={(nombre) => {
        setPeticionNombre(null);
        peticionNombre.resolver(nombre);
      }}
      onCancel={() => {
        setPeticionNombre(null);
        peticionNombre.resolver(null);
      }}
    />
  ) : null;

  return { guardar, guardando, dialogo, dialogoAbierto: peticionNombre !== null };
}

const paginas = (n: number) => `${n} ${n === 1 ? 'página' : 'páginas'}`;

/** El toast de cada desenlace, en lenguaje de obra. */
export function mensajeDe(r: ResultadoPieza): string {
  if (r.ok) {
    return `${r.reemplazada ? 'Capítulo actualizado' : 'Guardado'} en el anejo: «${r.pieza.titulo}» · ${paginas(r.pieza.paginas)}`;
  }
  if (r.donde === 'indice') return 'No hay sitio para el índice del anejo. Libera espacio en el navegador.';
  switch (r.motivo) {
    case 'sin-indexeddb':
      return 'Este navegador no permite guardar los PDF del anejo.';
    case 'cuota':
      return 'No hay sitio para el PDF en el almacén del navegador. Quita piezas del anejo o libera espacio.';
    case 'bloqueado':
      return 'El almacén de PDF está bloqueado por otra pestaña. Ciérrala y vuelve a intentarlo.';
    default:
      return 'No se pudo guardar el PDF en el anejo.';
  }
}
