/**
 * La nieve que publica «Viento y nieve», leída como consumidor.
 *
 * Primer consumidor de una publicación en la app (ver `lib/pub`): se lee el
 * sobre, nunca el estado interno del otro módulo, y lo que se toma de él se
 * copia con su fecha y su obra. Si después aparece un sobre más nuevo, o el
 * sobre es de otra obra, o ya no existe, el módulo avisa en ámbar: no bloquea,
 * porque un dato fechado sigue valiendo más que ninguno.
 */

import { leerPublicacion } from '../../lib/pub';
import { MODULO_PUB as MODULO_VIENTO_NIEVE, PUB_VERSION as PUB_VERSION_VIENTO_NIEVE, type PubVientoNieve } from '../viento-nieve/state';
import type { CargasState, NieveUI, PlantaUI } from './state';

export interface NievePublicada {
  /** Fecha del sobre, ISO 8601. */
  ts: string;
  /** INE de la obra del sobre (dos dígitos de provincia, o cinco de municipio). */
  ine: string | null;
  municipio: string | null;
  provincia: string | null;
  /** La mayor carga de nieve de la cubierta, kN/m². */
  qnMax: number;
  faldones: { nombre: string; inclinacion: number; qn: number }[];
}

export function leerNievePublicada(): NievePublicada | null {
  const sobre = leerPublicacion<PubVientoNieve>(MODULO_VIENTO_NIEVE, PUB_VERSION_VIENTO_NIEVE);
  if (!sobre || !sobre.datos || !sobre.datos.nieve) return null;
  const n = sobre.datos.nieve;
  return {
    ts: sobre.ts,
    ine: sobre.obra.ine,
    municipio: sobre.obra.municipio,
    provincia: sobre.obra.provincia,
    qnMax: n.qnMax,
    faldones: n.faldones.map((f) => ({ nombre: f.nombre, inclinacion: f.inclinacion, qn: f.qn })),
  };
}

/** El valor que toca según el faldón elegido (o el máximo), o null si ese faldón ya no está. */
export function valorPublicado(pub: NievePublicada, faldon: string | null): number | null {
  if (faldon === null) return pub.qnMax;
  const f = pub.faldones.find((x) => x.nombre === faldon);
  return f ? f.qn : null;
}

/** La nieve de una planta tomada del sobre, congelada con su fecha y su obra. */
export function nieveDesdePublicacion(pub: NievePublicada, faldon: string | null = null): NieveUI {
  const valor = valorPublicado(pub, faldon);
  return {
    modo: 'publicada',
    valor: valor ?? pub.qnMax,
    tsPub: pub.ts,
    inePub: pub.ine,
    faldon: valor === null ? null : faldon,
  };
}

const fecha = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-ES');
};

/** Provincia del sobre (dos primeros dígitos del INE, que puede venir con cinco). */
const provinciaDelSobre = (ine: string | null) => (ine && ine.length >= 2 ? ine.slice(0, 2) : null);

function avisosPlanta(p: PlantaUI, pub: NievePublicada | null, provinciaObra: string): string[] {
  if (!p.esCubierta || p.nieve.modo !== 'publicada') return [];
  const quien = `«${p.nombre.trim() || 'Planta'}»`;
  if (!pub) {
    return [`${quien}: la nieve se tomó de una publicación de Viento y nieve que ya no existe. Vuelva a publicarla allí, o teclee el valor.`];
  }
  const avisos: string[] = [];
  if (p.nieve.tsPub !== null && pub.ts > p.nieve.tsPub) {
    avisos.push(`${quien}: Viento y nieve ha publicado de nuevo (${fecha(pub.ts)}) desde que se tomó la nieve (${fecha(p.nieve.tsPub)}). Pulse «Usar la nieve publicada» para actualizarla.`);
  }
  const provinciaSobre = provinciaDelSobre(pub.ine);
  if (provinciaObra && provinciaSobre && provinciaSobre !== provinciaObra) {
    avisos.push(`${quien}: la nieve publicada es de otra obra (${pub.municipio || pub.provincia || `INE ${pub.ine}`}); compruebe que Viento y nieve está en la misma obra que este cuadro.`);
  } else if (p.nieve.faldon !== null && valorPublicado(pub, p.nieve.faldon) === null) {
    avisos.push(`${quien}: el faldón «${p.nieve.faldon}» ya no está en la publicación de Viento y nieve. Elija otro o use el máximo.`);
  }
  return avisos;
}

/** Los avisos ámbar de todas las cubiertas que toman la nieve del sobre. */
export function avisosNieve(state: CargasState, pub: NievePublicada | null): string[] {
  return state.plantas.flatMap((p) => avisosPlanta(p, pub, state.emplazamiento.provincia));
}
