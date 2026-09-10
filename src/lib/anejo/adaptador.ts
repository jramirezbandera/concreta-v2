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


/**
 * Los mismos datos con OTRO nombre de documento dentro, escrito donde cada
 * módulo lo guarde: en su satélite `*-title` los que usan `useDocTitle`, y como
 * `title` dentro del estado los de `useModuleState`.
 *
 * Hace falta al renombrar un capítulo desde el anejo. Sin esto la pieza se
 * quedaría con el nombre nuevo en la lista y en su PDF, pero con el viejo en
 * los datos: la reabres y el módulo te devuelve el nombre de antes, que es
 * justo la incoherencia que renombrar venía a quitar.
 *
 * Los módulos que no guardan nombre —la ficha DB SE— salen intactos.
 */
export function datosConTitulo(e: EntradaProyecto, datos: Record<string, string>, titulo: string): Record<string, string> {
  const satelite = clavesDeDato(e).find(esClaveDeTitulo);
  if (satelite) return { ...datos, [satelite]: titulo };
  const crudo = datos[e.clave];
  if (crudo === undefined) return datos;
  try {
    const p: unknown = JSON.parse(crudo);
    if (!esObjeto(p) || typeof p.title !== 'string') return datos;
    return { ...datos, [e.clave]: JSON.stringify({ ...p, title: titulo }) };
  } catch {
    return datos;
  }
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
  const partes: Record<string, unknown> = {};
  let hay = false;
  for (const clave of clavesDeDato(a.entrada)) {
    // El nombre del documento no es el cálculo: ni el satélite `*-title`…
    if (esClaveDeTitulo(clave)) continue;
    const v = leerClave(clave);
    if (v === null) continue;
    // …ni el `title` de dentro del estado.
    partes[clave] = clave === a.entrada.clave ? sinTitulo(v) : v;
    hay = true;
  }
  return hay ? inputsFingerprint(partes) : null;
}

/**
 * Las claves del módulo que son DATO, en el orden en que se leen: la principal
 * y sus satélites, menos los sobres publicados.
 *
 * Una sola enumeración para los dos usos —la huella y los datos de la pieza—
 * para que no puedan divergir: si una clave entra en la huella, entra en el
 * snapshot, y al revés. Lo que sí difiere es la PROYECCIÓN, y a propósito: la
 * huella ignora el nombre del documento (renombrar no es recalcular) y el
 * snapshot lo guarda (restaurar tiene que devolver la pieza con su nombre).
 *
 * Los `concreta-pub-*` se quedan fuera de los dos. Son derivados de la clave
 * principal, no dato, y reescribir uno al restaurar cambiaría lo que ve OTRO
 * módulo. Ver la nota de `Pieza.datos`.
 */
export function clavesDeDato(e: EntradaProyecto): string[] {
  return [e.clave, ...(e.satelites ?? []).filter((s) => !s.startsWith(PREFIJO_PUB))];
}

/**
 * El estado del módulo tal como está guardado ahora, clave por clave y EN
 * CRUDO, listo para volver a escribirlo tal cual. `null` si el módulo no tiene
 * nada guardado.
 *
 * La clave de versión de esquema va con lo demás, y no es un detalle: sin ella
 * `useModuleState` compara la versión, no la encuentra, y descarta en silencio
 * todo lo que se acabe de restaurar.
 */
export function datosDeModulo(a: AdaptadorAnejo): Record<string, string> | null {
  const datos: Record<string, string> = {};
  let hay = false;
  for (const clave of clavesDeDato(a.entrada)) {
    const v = leerClave(clave);
    if (v === null) continue;
    datos[clave] = v;
    hay = true;
  }
  if (!hay) return null;
  const version = a.entrada.claveVersion;
  if (version !== null) {
    const v = leerClave(version);
    if (v !== null) datos[version] = v;
  }
  return datos;
}
