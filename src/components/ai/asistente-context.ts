// Contexto del asistente IA (rediseño 2026-09-22, tareas T3-T5 del plan).
//
// Por qué existe: hasta ahora el asistente vivía DENTRO de cada módulo
// (`{aiOpen && <AiChatModal/>}` en 25 sitios) y su píldora minimizada era un
// sub-estado del propio modal. Con eso la píldora no podía estar siempre
// puesta: sin modal montado no había píldora. Este contexto saca el mando al
// shell —igual que `CalculatorProvider` hace con la calculadora— y deja en el
// módulo sólo lo que es suyo: el adapter y los datos vivos.
//
// Reparto: el PROVIDER es dueño de si hay sesión, de si está minimizada y del
// estado que pinta la píldora; el MÓDULO monta el chat y le pasa sus props
// vivas; el CHAT publica su estado hacia arriba.

import { createContext, useContext } from 'react';

/**
 * Los seis estados de la píldora (D-I5). El séptimo caso —las cuatro pantallas
 * sin asistente— no es un estado: allí no hay píldora y la fila del Menú sale
 * apagada.
 */
export type EstadoAsistente =
  /** Nunca abierto en este módulo. */
  | 'reposo'
  /** Minimizado con conversación viva. */
  | 'viva'
  /** Pregunta en vuelo. */
  | 'cargando'
  /** Hay una propuesta sin aplicar. */
  | 'propuesta'
  /** El último turno falló. */
  | 'error'
  /** No hay clave BYOK configurada. */
  | 'sin-clave';

/**
 * De dónde viene la apertura. Manda sobre el modo de ventana (D-I1): desde la
 * ESQUINA el asistente se abre SIEMPRE flotante —lo que se abre desde la
 * esquina se comporta como algo de la esquina, sin velo ni scroll bloqueado—;
 * desde el Menú o el atajo manda el modo que el usuario dejó guardado.
 */
export type OrigenApertura = 'menu' | 'pildora' | 'atajo';

export interface AsistenteContextValue {
  /** Hay un módulo con asistente en pantalla. Con `false` no hay píldora. */
  disponible: boolean;
  /** El chat está montado: la conversación vive (aunque esté minimizada). */
  sesion: boolean;
  minimizado: boolean;
  estado: EstadoAsistente;
  /** Turnos de la conversación, para el rótulo «Asistente · 3». */
  turnos: number;
  /** Cambia al reiniciar: es la `key` que remonta el chat con el hilo a cero. */
  claveSesion: number;
  /** La apertura en curso viene de la píldora ⇒ modo flotante forzado (D-I1). */
  desdeLaEsquina: boolean;
  /** true a partir de 768 px: hay píldora y la ventana es flotante (D-I20). */
  flotante: boolean;
  abrir: (origen: OrigenApertura) => void;
  minimizar: () => void;
  /** Tira la conversación y empieza de cero. La confirmación la pide la cabecera (D-I21). */
  reiniciar: () => void;
  /** Lo llama el módulo al montar/desmontar; lo llama el chat para publicar su estado. */
  registrarModulo: (disponible: boolean) => void;
  publicar: (estado: EstadoAsistente, turnos: number) => void;
}

const SIN_PROVIDER: AsistenteContextValue = {
  disponible: false,
  sesion: false,
  minimizado: false,
  estado: 'reposo',
  turnos: 0,
  claveSesion: 0,
  desdeLaEsquina: false,
  flotante: true,
  abrir: () => {},
  minimizar: () => {},
  reiniciar: () => {},
  registrarModulo: () => {},
  publicar: () => {},
};

export const AsistenteContext = createContext<AsistenteContextValue>(SIN_PROVIDER);

export function useAsistente(): AsistenteContextValue {
  return useContext(AsistenteContext);
}
