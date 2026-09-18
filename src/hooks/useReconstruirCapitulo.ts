/**
 * El lado del MÓDULO de «reconstruir el PDF» (ver `lib/anejo/reconstruccion`).
 *
 * La pantalla del anejo abre la pieza y navega aquí; este hook reclama el
 * encargo al montarse, espera a que el cálculo esté listo, vuelve a exportar
 * al anejo con el nombre que la pieza ya tenía —así se ACTUALIZA su capítulo
 * en vez de nacer otro— y devuelve al usuario al anejo.
 *
 * Lo usan los dos caminos de exportación: `useTitledPdfExport` lo llama por
 * dentro, así que los veintiún módulos de pieza no se enteran de que existe, y
 * los cinco de memoria —que exportan por `useTitledFileExport` y eligen
 * formato— lo llaman ellos con su exportador de PDF.
 *
 * Por qué hay un tope de espera: un módulo cuyo resultado se calcula fuera
 * (`slope-stability` en su worker) no está listo al montarse, y sin tope el
 * usuario se quedaría mirando una pantalla que no hace nada y sin saber por
 * qué. Con él, la fila vuelve a salir en rojo y el anejo lo cuenta.
 */

import { useContext, useEffect, useRef } from 'react';
import { UNSAFE_NavigationContext } from 'react-router';
import { RUTA_ANEJO } from '../lib/anejo';
import { acabarEncargo, tomarEncargo, type Encargo } from '../lib/anejo/reconstruccion';

/** Lo que se espera a que el módulo tenga resultado antes de darlo por imposible. */
export const ESPERA_RECONSTRUIR_MS = 20_000;

interface Opciones {
  /** `moduleRegistry.key` de este módulo, o `null` si no hay adaptador (fuera de un router). */
  modulo: string | null | undefined;
  /** ¿Se puede exportar ya? Los módulos que calculan fuera lo ponen a `true` al terminar. */
  listo: boolean;
  /** Genera el PDF y lo guarda en el anejo con el título del encargo. `true` si entró. */
  rehacer: (encargo: Encargo) => Promise<boolean>;
}

export function useReconstruirCapitulo({ modulo, listo, rehacer }: Opciones): void {
  const navegacion = useContext(UNSAFE_NavigationContext);
  // El manejador vive en una ref para que el efecto NO dependa de él: los
  // módulos lo pasan como función nueva en cada render, y el efecto se
  // reiniciaría —con su temporizador— en cada tecla.
  const ultimo = useRef(rehacer);
  useEffect(() => {
    ultimo.current = rehacer;
  });

  const encargo = useRef<Encargo | null>(null);
  const cerrado = useRef(false);

  useEffect(() => {
    if (cerrado.current) return;
    // Se reclama al montar, aunque todavía no se pueda exportar: así el anejo
    // sabe que alguien se ha hecho cargo. Reclamarlo dos veces devuelve null
    // (React en modo estricto repite los efectos), y de ahí la ref.
    encargo.current ??= tomarEncargo(modulo);
    const e = encargo.current;
    if (!e) return;

    const volver = () => navegacion?.navigator.push(RUTA_ANEJO);

    if (!listo) {
      const tope = setTimeout(() => {
        if (cerrado.current) return;
        cerrado.current = true;
        acabarEncargo(false, 'el cálculo no llegó a estar listo');
        volver();
      }, ESPERA_RECONSTRUIR_MS);
      return () => clearTimeout(tope);
    }

    cerrado.current = true;
    void (async () => {
      let ok = false;
      try {
        ok = await ultimo.current(e);
      } catch (error) {
        console.error('No se ha podido reconstruir el PDF de la pieza:', error);
      }
      acabarEncargo(ok);
      volver();
    })();
  }, [modulo, listo, navegacion]);
}
