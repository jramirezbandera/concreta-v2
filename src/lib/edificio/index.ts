/**
 * El edificio de la obra: sus plantas, de arriba abajo, con nombre, tipo y
 * altura. `concreta-edificio`.
 *
 * Hasta el 15-09-2026 cuatro módulos guardaban su propia lista de plantas
 * (cargas, viento, incendio, sismo) y la altura y el «bajo rasante» se
 * tecleaban en cada uno. Ahora el edificio se declara UNA vez, en Cargas por
 * planta —el único que ESCRIBE aquí—, y los demás lo leen. No es una
 * publicación (`lib/pub`): la geometría es una ENTRADA, cambia en un sitio y se
 * ve en todos, sin estado «revisar». Y no va dentro de `concreta-obra`: la obra
 * vive en la raíz del `.concreta` y la escriben tres sitios con `Partial`;
 * esto es una clave de proyecto más, satélite de cargas-planta en
 * `proyectoKeys.ts`, así que viaja en el fichero y se borra con «Nueva obra».
 *
 * CONVENCIÓN DE LA ALTURA: la del espacio que APOYA en ese forjado, de forjado
 * a forjado. «Planta Baja 3,00» = la planta baja mide 3 m desde su forjado
 * hasta el de encima; la cubierta, la de arriba del todo, no tiene altura. Es
 * la misma que usa incendio. Las cotas se derivan (`cotasEdificio`): el
 * forjado de la planta sobre rasante MÁS BAJA está a ±0,00 —la solera o el
 * forjado de planta baja—, hacia arriba se suman las alturas de las plantas de
 * debajo y los sótanos cuelgan restando la suya.
 */

import { CLAVE_EDIFICIO } from '../../data/proyectoKeys';
import { escribirClave, leerClave } from '../storage/seguro';

/** Lo que una planta ES: cubierta, planta sobre rasante o sótano. */
export type TipoPlanta = 'cubierta' | 'planta' | 'sotano';

export interface PlantaEdificio {
  id: string;
  nombre: string;
  tipo: TipoPlanta;
  /** m, de forjado a forjado: lo que sube desde este forjado hasta el de encima. `null` = sin decir. */
  altura: number | null;
}

/** Las plantas van de ARRIBA ABAJO: la cubierta la primera, como se lee una sección. */
export interface Edificio {
  plantas: PlantaEdificio[];
}

export const EDIFICIO_KEY = CLAVE_EDIFICIO;
export const EDIFICIO_VERSION = 1;

/** Altura con la que nace una planta nueva, m. */
export const ALTURA_PLANTA_TIPO = 3;

/**
 * El edificio de arranque: dos plantas de 3 m y su cubierta. Es el mismo con
 * el que arrancaba Cargas por planta; viento, que antes traía tres forjados a
 * 3, 6 y 9 m, pasa a ver dos, a +3,00 y +6,00.
 */
export const PLANTAS_INICIALES: readonly { nombre: string; tipo: TipoPlanta; altura: number | null }[] = [
  { nombre: 'Cubierta', tipo: 'cubierta', altura: null },
  { nombre: 'Planta Primera', tipo: 'planta', altura: ALTURA_PLANTA_TIPO },
  { nombre: 'Planta Baja', tipo: 'planta', altura: ALTURA_PLANTA_TIPO },
];

let contador = 0;

/** Un id de planta. Mismo molde que el de los módulos, para que ninguno destaque. */
export function nuevoIdPlanta(): string {
  contador += 1;
  return `p${Date.now().toString(36)}${contador.toString(36)}`;
}

export function edificioInicial(): Edificio {
  return { plantas: PLANTAS_INICIALES.map((p) => ({ id: nuevoIdPlanta(), ...p })) };
}

/** ¿Sigue tal cual arranca? Por contenido, no por ids: cada arranque los estrena. */
export function esEdificioInicial(e: Edificio): boolean {
  return (
    e.plantas.length === PLANTAS_INICIALES.length &&
    e.plantas.every((p, i) => p.nombre === PLANTAS_INICIALES[i].nombre && p.tipo === PLANTAS_INICIALES[i].tipo && p.altura === PLANTAS_INICIALES[i].altura)
  );
}

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const TIPOS: readonly TipoPlanta[] = ['cubierta', 'planta', 'sotano'];

/** Una planta leída de fuera: lo que no se reconozca cae a «planta sobre rasante, sin altura». */
export function normalizarPlantaEdificio(bruto: unknown, i = 0): PlantaEdificio {
  const b = esObjeto(bruto) ? bruto : {};
  return {
    id: typeof b.id === 'string' && b.id !== '' ? b.id : nuevoIdPlanta(),
    nombre: typeof b.nombre === 'string' ? b.nombre : `Planta ${i + 1}`,
    tipo: TIPOS.includes(b.tipo as TipoPlanta) ? (b.tipo as TipoPlanta) : 'planta',
    altura: typeof b.altura === 'number' && Number.isFinite(b.altura) && b.altura >= 0 ? b.altura : null,
  };
}

/** Todo lo que no se reconozca cae a un edificio sin plantas; nunca se lanza. */
export function normalizarEdificio(bruto: unknown): Edificio {
  if (!esObjeto(bruto) || !Array.isArray(bruto.plantas)) return { plantas: [] };
  return { plantas: bruto.plantas.map((p, i) => normalizarPlantaEdificio(p, i)) };
}

/** `null` si nadie ha escrito el edificio todavía (o no se puede leer). */
export function leerEdificio(): Edificio | null {
  try {
    const bruto = leerClave(EDIFICIO_KEY);
    if (!bruto) return null;
    const p: unknown = JSON.parse(bruto);
    if (!esObjeto(p) || p.v !== EDIFICIO_VERSION) return null;
    return normalizarEdificio(p);
  } catch {
    return null;
  }
}

/** ¿El mismo edificio, planta a planta? Con ids: dos listas iguales con ids distintos son plantas distintas para quien cuelga datos de ellas. */
export function mismoEdificio(a: Edificio | null, b: Edificio | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.plantas.length === b.plantas.length &&
    a.plantas.every((p, i) => {
      const q = b.plantas[i];
      return p.id === q.id && p.nombre === q.nombre && p.tipo === q.tipo && p.altura === q.altura;
    })
  );
}

/** Escribe el edificio entero y avisa a quien lo enseñe. Lo llama Cargas por planta, y nadie más. */
export function guardarEdificio(e: Edificio): boolean {
  const ok = escribirClave(EDIFICIO_KEY, JSON.stringify({ v: EDIFICIO_VERSION, plantas: normalizarEdificio(e).plantas }));
  avisarEdificio();
  return ok;
}

// ── Cotas ───────────────────────────────────────────────────────────────────

/**
 * Cota del forjado de cada planta sobre la rasante, m, en el orden de la lista.
 *
 * El forjado de la planta sobre rasante MÁS BAJA (la última de la lista que no
 * es sótano) está a ±0,00. Hacia arriba, cada forjado está a la cota del de
 * debajo más la altura de la planta de debajo; hacia abajo, un sótano está a
 * la cota del de encima menos su propia altura. `null` donde no se puede
 * saber: falta la altura de alguna planta entre medias. Si todo el edificio
 * está enterrado (raro), el forjado de arriba se toma a ±0,00.
 */
export function cotasEdificio(plantas: readonly PlantaEdificio[]): (number | null)[] {
  const cotas: (number | null)[] = plantas.map(() => null);
  if (plantas.length === 0) return cotas;
  let origen = 0;
  for (let i = plantas.length - 1; i >= 0; i--) {
    if (plantas[i].tipo !== 'sotano') {
      origen = i;
      break;
    }
  }
  cotas[origen] = 0;
  for (let i = origen - 1; i >= 0; i--) {
    const abajo = cotas[i + 1];
    const h = plantas[i + 1].altura;
    cotas[i] = abajo === null || h === null ? null : abajo + h;
  }
  for (let j = origen + 1; j < plantas.length; j++) {
    const arriba = cotas[j - 1];
    const h = plantas[j].altura;
    cotas[j] = arriba === null || h === null ? null : arriba - h;
  }
  return cotas;
}

/** Un forjado tal como lo quiere el motor de viento: nombre y cota sobre rasante. */
export interface ForjadoSobreRasante {
  id: string;
  nombre: string;
  /** Cota sobre rasante, m. Siempre > 0. */
  h: number;
}

/**
 * Los forjados que reciben viento: sobre rasante y por encima del suelo, de
 * ABAJO ARRIBA. El de cota 0 —la solera o el forjado de planta baja— no entra:
 * el motor manda la banda hasta media planta baja a la cimentación. Los
 * sótanos tampoco. Los forjados sin cota (falta una altura) se quedan fuera:
 * `alturasQueFaltan` dice cuáles.
 */
export function forjadosSobreRasante(e: Edificio): ForjadoSobreRasante[] {
  const cotas = cotasEdificio(e.plantas);
  const out: ForjadoSobreRasante[] = [];
  for (let i = e.plantas.length - 1; i >= 0; i--) {
    const p = e.plantas[i];
    const c = cotas[i];
    if (p.tipo === 'sotano' || c === null || !(c > 0)) continue;
    out.push({ id: p.id, nombre: p.nombre.trim() || `Planta ${i + 1}`, h: c });
  }
  return out;
}

/**
 * Las plantas cuya altura hace falta para situar los forjados sobre rasante y
 * no está: toda planta sobre rasante con otra encima. La de arriba del todo no
 * necesita altura, y la de un sótano sólo sitúa al propio sótano.
 */
export function alturasQueFaltan(e: Edificio): string[] {
  const faltan: string[] = [];
  e.plantas.forEach((p, i) => {
    if (p.tipo === 'sotano' || p.altura !== null) return;
    const hayEncima = e.plantas.slice(0, i).some((x) => x.tipo !== 'sotano');
    if (hayEncima) faltan.push(p.nombre.trim() || `Planta ${i + 1}`);
  });
  return faltan;
}

// ── El store ────────────────────────────────────────────────────────────────
//
// Mismo patrón que `lib/obra` y `lib/anejo`: oyentes locales —el evento
// `storage` NO se dispara en la pestaña que escribe—, `storage` para las otras
// pestañas, y una instantánea con identidad estable mientras la cadena guardada
// no cambie, que es lo que `useSyncExternalStore` exige para no entrar en bucle.

const oyentes = new Set<() => void>();

function avisarEdificio(): void {
  for (const fn of oyentes) fn();
}

export function suscribirEdificio(fn: () => void): () => void {
  oyentes.add(fn);
  // `key: null` es el `clear()` del cambio de obra.
  const otraPestana = (e: StorageEvent) => {
    if (e.key === null || e.key === EDIFICIO_KEY) fn();
  };
  window.addEventListener('storage', otraPestana);
  return () => {
    oyentes.delete(fn);
    window.removeEventListener('storage', otraPestana);
  };
}

let instantanea: { raw: string | null; valor: Edificio | null } | null = null;

/** `leerEdificio()` con identidad estable mientras lo guardado no cambie. */
export function instantaneaEdificio(): Edificio | null {
  const raw = leerClave(EDIFICIO_KEY);
  if (instantanea && instantanea.raw === raw) return instantanea.valor;
  instantanea = { raw, valor: leerEdificio() };
  return instantanea.valor;
}
