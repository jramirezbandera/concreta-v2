import { useSyncExternalStore } from 'react';
import { instantaneaActivo, instantaneaRecientes, suscribirProyectoActivo, type EntradaIndice, type EstadoActivo } from './index';

const EN_SERVIDOR: EstadoActivo = { activo: null, desfasada: false };
const enServidor = () => EN_SERVIDOR;
const SIN_RECIENTES: EntradaIndice[] = [];
const sinRecientes = () => SIN_RECIENTES;

/**
 * El proyecto activo de la máquina, y si esta pestaña se ha quedado con otro:
 * cambia desde esta pestaña, desde otra (`storage`) o al volver a ella (`focus`).
 */
export function useProyectoActivo(): EstadoActivo {
  return useSyncExternalStore(suscribirProyectoActivo, instantaneaActivo, enServidor);
}

/** Los recientes del archivo local, el más nuevo primero; se re-renderiza al guardar o borrar. */
export function useRecientes(): EntradaIndice[] {
  return useSyncExternalStore(suscribirProyectoActivo, instantaneaRecientes, sinRecientes);
}

/** Nombre de la obra abierta, o `null` si no hay proyecto activo. */
export function useNombreObra(): string | null {
  const { activo } = useProyectoActivo();
  const recientes = useRecientes();
  if (activo === null) return null;
  return recientes.find((e) => e.id === activo)?.nombre ?? null;
}
