/**
 * Los elementos estructurales: de la R que se les exige a cómo la alcanzan.
 *
 * Este fichero es la juntura entre las dos mitades del módulo. La primera dice
 * QUÉ hay que aguantar —la tabla 3.1 o el tiempo equivalente, por sectores—; la
 * segunda dice CUÁNTO aguanta cada sección —los anejos C y D— y, cuando no
 * llega, que hace falta protegerla.
 *
 * La pregunta que el proyectista tiene que poder contestar en la memoria es la
 * del SI 6: si la estructura resiste «por su propia configuración» o «mediante
 * la aplicación de productos de protección». Por eso lo que sale de aquí no es
 * un booleano sino una VÍA, y cuando la vía es la protección se dice cuánta
 * falta, no sólo que falta.
 */

import {
  claseNecesaria,
  etiquetaTipo,
  resistenciaHormigon,
  type EntradaHormigon,
  type PruebaClase,
  type ResultadoHormigon,
  type TipoHormigon,
} from './anejoC';
import { resistenciaAcero, type EntradaAcero, type ResultadoAcero } from './anejoD';
import {
  familiaPorId,
  proteccionAcero,
  proteccionHormigon,
  type PropuestaProteccion,
} from './protecciones';
import type { SectorResuelto } from './sectores';

export type MaterialElemento = 'hormigon' | 'acero';

/**
 * Por dónde alcanza el elemento su resistencia al fuego.
 *
 * Son las dos vías del SI 6 § 3.1 más la honesta tercera: que con estas tablas
 * no se puede decir. Confundir esa última con «no cumple» sería mentir en una
 * memoria firmada.
 */
export type ViaResistencia = 'propia' | 'proteccion' | 'sinResolver';

/** Con qué se protege un elemento que no llega por su propia sección. */
export interface EntradaProteccion {
  /** Id de la familia genérica. `''` = todavía sin elegir. */
  familia: string;
  /** W/mK. El λp declarado del producto, cuando la familia no tiene tabulado. */
  lambda: number | null;
}

export interface ElementoEntrada {
  id: string;
  nombre: string;
  /** Id del sector del que toma la R exigida. `''` = ninguno. */
  sectorId: string;
  /** min. R exigida tecleada; pisa la del sector. */
  exigidaManual: number | null;
  material: MaterialElemento;
  /** Los dos conviven aunque sólo se use uno: cambiar de material no borra nada. */
  hormigon: EntradaHormigon;
  acero: EntradaAcero;
  proteccion: EntradaProteccion;
}

export interface ElementoResuelto {
  id: string;
  nombre: string;
  /** Nombre del sector del que sale la R, o `''`. */
  sector: string;
  /** min. */
  exigida: number | null;
  material: MaterialElemento;
  /** Etiqueta del tipo de elemento, tal como entra en el documento. */
  tipo: string;
  via: ViaResistencia;
  /** min. Lo que la sección aguanta por sí sola. */
  alcanza: number | null;
  /** De dónde sale: «tabla C.3, opción 2 (250 / 45)». */
  justificacion: string;
  /** Qué falta cuando la vía es la protección. */
  loQueFalta: string;
  /** mm. Distancia equivalente al eje, hormigón. */
  am: number | null;
  /** La cuenta de `am`, escrita. */
  amCuenta: string;
  /** m⁻¹. Masividad, acero. */
  masividad: number | null;
  /** m²K/W. Coeficiente de protección necesario, acero. */
  dLambda: number | null;
  /** El revestimiento propuesto, cuando la vía es la protección y se ha elegido. */
  proteccion: PropuestaProteccion | null;
  avisos: string[];
  /** Fila a medio rellenar: bloquea exportar y publicar. */
  hueco: boolean;
  /** Los dos resultados en crudo, para la ficha de pantalla. */
  hormigon: ResultadoHormigon | null;
  acero: ResultadoAcero | null;
}

export function elementoInicial(
  id: string,
  nombre: string,
  hormigon: EntradaHormigon,
  acero: EntradaAcero,
): ElementoEntrada {
  return {
    id,
    nombre,
    sectorId: '',
    exigidaManual: null,
    material: 'hormigon',
    hormigon,
    acero,
    // Sin familia por defecto: el módulo no presume el producto. Mientras no se
    // elija, lo que se enuncia es la MAGNITUD que hay que alcanzar —el d/λp de
    // la tabla D.1, o los milímetros que le faltan al eje—, que es lo único que
    // dice la norma.
    proteccion: { familia: '', lambda: null },
  };
}

const n2 = (v: number) => v.toFixed(2).replace('.', ',');
const mm = (v: number) => (Math.round(v * 10) / 10).toString().replace('.', ',');

/** Los tipos cuyo revestimiento NO va en un techo. */
const ES_VERTICAL: readonly TipoHormigon[] = ['soporte', 'muroUnaCara', 'muroDosCaras'];

/**
 * Qué se escribe en «cómo alcanza la R» cuando hace falta protegerlo.
 *
 * Sin familia elegida se enuncia la MAGNITUD que hay que alcanzar, que es lo
 * único que dice la norma; con familia y espesor, el espesor; y con familia
 * pero sin espesor —una intumescente, una lana sin λp declarado— se dice la
 * familia y se deja la magnitud, porque el número lo pone el fabricante.
 */
function frase(prop: PropuestaProteccion | null, magnitud: string): string {
  if (prop === null || !prop.aplicable) return magnitud;
  if (prop.espesor === null) return `${prop.familia.etiqueta}, ${magnitud}`;
  return `${prop.familia.etiqueta}, ${mm(prop.espesor)} mm (orientativo)`;
}

/** La prueba de la clase que hay que alcanzar, para decir qué le falta. */
function pruebaDeLaExigida(r: ResultadoHormigon, exigida: number | null): PruebaClase | null {
  if (exigida === null) return null;
  const clase = claseNecesaria(exigida);
  return clase === null ? null : (r.pruebas.find((p) => p.clase === clase) ?? null);
}

function resolverUno(e: ElementoEntrada, sectores: readonly SectorResuelto[]): ElementoResuelto {
  const nombre = e.nombre.trim();
  const sector = sectores.find((s) => s.id === e.sectorId) ?? null;
  const exigida = e.exigidaManual ?? sector?.minutos ?? null;

  // Un elemento que apunta a un sector BORRADO no es trabajo a medias: es una
  // referencia rota. Se queda sin R, desaparece del documento —`via` es
  // 'sinResolver' y el cuadro filtra esos— y hasta ahora se iba sin hueco, sin
  // aviso y sin bloquear la exportación: se borraba «Sótano» y «Pilares de
  // sótano» dejaba de imprimirse.
  const sectorPerdido = e.sectorId !== '' && sector === null;
  // Sólo bloquea cuando deja al elemento SIN R: con una R tecleada a mano el
  // elemento sigue imprimiéndose entero y lo único roto es el rótulo del
  // sector, que se avisa igual.
  const perdidoSinR = sectorPerdido && e.exigidaManual === null;
  // Y sin sector NINGUNO tampoco entra en el documento, pero eso sí es un
  // estado de trabajo legítimo —se describe la sección antes de repartir los
  // sectores—, así que se avisa en vez de bloquear.
  const sinExigir = !sectorPerdido && e.sectorId === '' && e.exigidaManual === null;

  const deLaLista = [
    ...(sectorPerdido
      ? ['el sector del que tomaba la R ya no existe: elija otro o teclee la R exigida.']
      : []),
    ...(sinExigir && nombre !== ''
      ? ['no tiene R exigida, así que no entra en el documento: cuélguelo de un sector o tecléela.']
      : []),
  ];

  const base = {
    id: e.id,
    nombre,
    sector: sector?.nombre ?? '',
    exigida,
    material: e.material,
  };

  if (e.material === 'acero') {
    const r = resistenciaAcero(e.acero, exigida);
    const via: ViaResistencia =
      r.faltan.length > 0 || exigida === null
        ? 'sinResolver'
        : r.dLambda === null
          ? 'sinResolver'
          : r.dLambda === 0
            ? 'propia'
            : 'proteccion';
    const familia = familiaPorId(e.proteccion.familia);
    const prop =
      via === 'proteccion' && familia !== undefined && familia.para === 'acero'
        ? proteccionAcero(
            familia,
            { dLambda: r.dLambda, masividad: r.masividad, clase: r.claseComprobada },
            e.proteccion.lambda,
          )
        : null;
    return {
      ...base,
      tipo: e.acero.tipo === 'soporte' ? 'Soporte' : e.acero.tipo === 'tirante' ? 'Tirante' : 'Viga',
      via,
      alcanza: r.alcanzaDesnudo,
      justificacion:
        via === 'sinResolver'
          ? ''
          : r.dLambda === 0
            ? 'el perfil desnudo llega (tabla D.1)'
            : `tabla D.1, Am/V ${r.filaAmV} m⁻¹, ${r.banda}`,
      loQueFalta: via === 'proteccion' ? frase(prop, `d/λp = ${n2(r.dLambda as number)} m²K/W`) : '',
      am: null,
      amCuenta: '',
      masividad: r.masividad,
      dLambda: r.dLambda,
      proteccion: prop,
      avisos: [...deLaLista, ...r.avisos, ...(prop?.avisos ?? [])].map(
        (a) => `«${nombre || 'Elemento sin nombre'}»: ${a}`,
      ),
      hueco: nombre === '' || r.faltan.length > 0 || perdidoSinR,
      hormigon: null,
      acero: r,
    };
  }

  const r = resistenciaHormigon(e.hormigon);
  const prueba = pruebaDeLaExigida(r, exigida);
  const llega = r.alcanza !== null && exigida !== null && r.alcanza >= exigida;
  const via: ViaResistencia =
    r.faltan.length > 0 || exigida === null ? 'sinResolver' : llega ? 'propia' : 'proteccion';

  const familia = familiaPorId(e.proteccion.familia);
  const prop =
    via === 'proteccion' && prueba !== null && familia !== undefined && familia.para === 'hormigon'
      ? proteccionHormigon(familia, {
          faltaAm: prueba.faltaAm,
          faltaB: prueba.faltaB,
          clase: prueba.clase,
          // El C.2.4.2 le pone condiciones al yeso «aplicado en techos», y el
          // techo es la cara de abajo de todo lo que no es vertical.
          enTecho: !ES_VERTICAL.includes(e.hormigon.tipo),
        })
      : null;

  return {
    ...base,
    tipo: etiquetaTipo(e.hormigon.tipo),
    via,
    alcanza: r.alcanza,
    justificacion: llega ? r.porOpcion : '',
    loQueFalta: via === 'proteccion' && prueba ? frase(prop, prueba.motivo) : '',
    am: r.am,
    amCuenta: r.eje.cuenta,
    masividad: null,
    dLambda: null,
    proteccion: prop,
    avisos: [...deLaLista, ...r.avisos, ...(prop?.avisos ?? [])].map(
      (a) => `«${nombre || 'Elemento sin nombre'}»: ${a}`,
    ),
    hueco: nombre === '' || r.faltan.length > 0 || perdidoSinR,
    hormigon: r,
    acero: null,
  };
}

/**
 * Resuelve la lista entera.
 *
 * Un elemento sin sector y sin R tecleada NO es un hueco: describir una sección
 * y todavía no haberle asignado exigencia es un estado legítimo de trabajo. Lo
 * que sí es hueco es una sección a medio teclear, porque entonces la tabla no
 * dice nada y la memoria imprimiría una línea vacía.
 */
export function resolverElementos(
  elementos: readonly ElementoEntrada[],
  sectores: readonly SectorResuelto[],
): ElementoResuelto[] {
  return elementos.map((e) => resolverUno(e, sectores));
}

/** Cuántos elementos no llegan por su propia sección: lo primero que se mira. */
export function resumenElementos(resueltos: readonly ElementoResuelto[]): {
  propia: number;
  proteccion: number;
  sinResolver: number;
} {
  return {
    propia: resueltos.filter((r) => r.via === 'propia').length,
    proteccion: resueltos.filter((r) => r.via === 'proteccion').length,
    sinResolver: resueltos.filter((r) => r.via === 'sinResolver' && r.nombre !== '').length,
  };
}
