/**
 * Cómo se define un adaptador del anejo, y las dos lecturas del estado del
 * módulo que el anejo necesita: su título guardado y su huella.
 *
 * Vive aparte de `index.ts` porque los 25 ficheros de `modules/` lo importan y
 * `index.ts` los importa a ellos: con esto aquí no hay ciclo.
 *
 * Es el único fichero del anejo que lee claves de módulo por parámetro
 * (`entrada.clave`, sus satélites): está dado de alta como ayudante con clave
 * dinámica en `src/test/obra/proyectoKeys.test.ts`.
 */

import { entradaDe, PREFIJO_PUB, type EntradaProyecto } from '../../data/proyectoKeys';
import { inputsFingerprint } from '../pdf/utils';
import { leerClave } from '../storage/seguro';
import type { AdaptadorAnejo, SeccionAnejo } from './types';

export interface DefinicionAdaptador {
  modulo: string;
  seccion: SeccionAnejo;
  capitulo: string;
  /** Sólo si la lectura genérica (satélite `*-title`, o `title` del estado) no vale para este módulo. */
  tituloGuardado?: () => string | null;
}

/**
 * Construye el adaptador a partir de la fila del módulo en `CLAVES_PROYECTO`.
 * Lanza al cargar el módulo si el id no está en la tabla: un typo aquí no puede
 * llegar a producción porque `src/test/anejo/adaptadores.test.ts` lo pilla.
 */
export function definirAdaptador(d: DefinicionAdaptador): AdaptadorAnejo {
  const entrada = entradaDe(d.modulo);
  if (!entrada) throw new Error(`anejo: el módulo '${d.modulo}' no está en CLAVES_PROYECTO (src/data/proyectoKeys.ts)`);
  const capitulo = d.capitulo.trim();
  if (!capitulo) throw new Error(`anejo: el módulo '${d.modulo}' no declara capítulo`);
  return {
    modulo: d.modulo,
    seccion: d.seccion,
    capitulo,
    entrada,
    tituloGuardado: d.tituloGuardado ?? (() => tituloGenerico(entrada)),
  };
}

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const esClaveDeTitulo = (clave: string) => clave.endsWith('-title');

/**
 * El título tal como lo guarda el módulo: los de `useDocTitle` en su satélite
 * `*-title`, los de `useModuleState` como `title` dentro del estado. Los que no
 * tienen título (la ficha DB SE) devuelven `null` y el capítulo pone el rótulo.
 */
function tituloGenerico(e: EntradaProyecto): string | null {
  const satelite = (e.satelites ?? []).find(esClaveDeTitulo);
  if (satelite) {
    const t = leerClave(satelite)?.trim();
    return t ? t : null;
  }
  const raw = leerClave(e.clave);
  if (raw === null) return null;
  try {
    const p: unknown = JSON.parse(raw);
    if (esObjeto(p) && typeof p.title === 'string' && p.title.trim()) return p.title.trim();
  } catch {
    // No es JSON: no hay título dentro.
  }
  return null;
}

/** El estado sin su `title`: cambiar el nombre del documento no es cambiar el cálculo. */
function sinTitulo(raw: string): unknown {
  try {
    const p: unknown = JSON.parse(raw);
    if (!esObjeto(p)) return p;
    const copia: Record<string, unknown> = { ...p };
    delete copia.title;
    return copia;
  } catch {
    return raw;
  }
}

/**
 * Huella del estado del módulo tal como está guardado AHORA: la clave principal
 * (sin `title`) más los satélites que son dato —el suelo de micropilotes—, sin
 * los títulos ni los sobres publicados, que son derivados. `null` si no hay
 * nada guardado.
 *
 * Es lo que decide «RECALCULAR»: la pieza lleva la huella del momento en que
 * se hizo su PDF, y se compara con ésta. Un módulo que no había escrito nada
 * al guardar (defaults intactos) tiene huella `null`; en cuanto el usuario
 * toca algo la huella deja de ser `null` y la pieza pasa a ámbar, que es lo
 * correcto.
 */
export function huellaDeModulo(a: AdaptadorAnejo): string | null {
  const e = a.entrada;
  const partes: Record<string, unknown> = {};
  let hay = false;
  const principal = leerClave(e.clave);
  if (principal !== null) {
    partes[e.clave] = sinTitulo(principal);
    hay = true;
  }
  for (const s of e.satelites ?? []) {
    if (esClaveDeTitulo(s) || s.startsWith(PREFIJO_PUB)) continue;
    const v = leerClave(s);
    if (v !== null) {
      partes[s] = v;
      hay = true;
    }
  }
  return hay ? inputsFingerprint(partes) : null;
}
