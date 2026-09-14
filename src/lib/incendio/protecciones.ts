/**
 * Qué se le pone a un elemento que no llega por su propia sección.
 *
 * Es la segunda vía del SI 6 § 3.1 —«mediante la aplicación de productos de
 * protección»— y la parte del módulo donde más fácil sería mentir. El DB SI no
 * tabula NINGÚN producto de protección: remite a la UNE-EN 13381 y al marcado
 * CE. Lo único que da es la magnitud que hay que alcanzar: el `d/λp` de la
 * tabla D.1 para el acero y la equivalencia ×1,8 del mortero de yeso del C.2.4
 * para el hormigón.
 *
 * Así que esto NO dimensiona una protección: la estima, para que el proyectista
 * sepa si le caben 20 mm o 60 en el falso techo antes de pedir precios. Toda
 * cifra que sale de aquí va rotulada «orientativo, a confirmar por el marcado
 * CE o el ensayo UNE-EN 13381 del producto», y esa frase no es una cautela
 * legal: es que el ensayo real de un producto concreto da del orden de un 20 %
 * menos que esta cuenta genérica, y redondear a la baja por nuestra cuenta
 * dejaría un pilar sin proteger.
 *
 * ── De dónde sale λp ────────────────────────────────────────────────────────
 *
 * El DB SI D.2.1 define λp como la conductividad térmica EFECTIVA del
 * revestimiento «para el desarrollo total del tiempo de resistencia a fuego
 * considerado» —no la de catálogo— y sólo autoriza tomar el valor a 20 ºC para
 * «materiales de tipo pétreo, cerámico, hormigones, morteros y yesos».
 *
 * Esa frase parte el catálogo en dos y es la decisión de diseño de este
 * fichero: las familias que la norma nombra llevan su λ a 20 ºC tabulado y dan
 * un espesor; las demás —lanas minerales, silicatos, y desde luego la pintura
 * intumescente, que no protege por conducción sino hinchándose— NO lo llevan, y
 * o se teclea el λp declarado del producto o no hay número. Inventarles un λ de
 * catálogo sería el error de bulto de este apartado: una lana de roca a su λ de
 * 20 ºC saldría a 7 mm, cuando en obra se ponen 40.
 */

import type { ClaseR } from './anejoC';

/** Cómo aporta la protección su resistencia. */
export type Vehiculo =
  /** Aísla: el espesor sale del `d/λp` de la tabla D.1 (acero). */
  | 'aislante'
  /** Cuenta como hormigón de más: la equivalencia ×1,8 del C.2.4 (hormigón). */
  | 'equivalenteHormigon'
  /** Se hincha: no hay espesor que derivar, sólo el `d/λp` objetivo. */
  | 'intumescente';

export interface FamiliaProteccion {
  id: string;
  etiqueta: string;
  /** Sobre qué material se pone. */
  para: 'acero' | 'hormigon';
  vehiculo: Vehiculo;
  /**
   * W/mK. El valor a 20 ºC, sólo en las familias que el D.2.1 autoriza a
   * usarlo. `null` = hay que teclear el λp declarado del producto.
   */
  lambda: number | null;
  /** El rango habitual de la familia: lo que hace que el valor sea orientativo. */
  rango: readonly [number, number] | null;
  /** mm. Escalón comercial al que se redondea al alza. */
  escalon: number;
  nota: string;
}

/**
 * Las familias genéricas.
 *
 * Los λ a 20 ºC son valores altos dentro del rango de cada familia, no medios:
 * un λ mayor da un espesor mayor, y en una estimación que alguien puede acabar
 * llevándose a obra el error tiene que caer hacia el lado grueso.
 */
export const FAMILIAS: readonly FamiliaProteccion[] = [
  {
    id: 'placaYeso',
    etiqueta: 'Placa de yeso laminado tipo F (cortafuego)',
    para: 'acero',
    vehiculo: 'aislante',
    lambda: 0.25,
    rango: [0.21, 0.32],
    escalon: 12.5,
    nota: 'Yeso: el D.2.1 admite su λ a 20 ºC. El escalón es la placa de 12,5 mm; el número de placas sale de redondear al alza.',
  },
  {
    id: 'morteroVermiculita',
    etiqueta: 'Mortero proyectado de perlita o vermiculita',
    para: 'acero',
    vehiculo: 'aislante',
    lambda: 0.12,
    rango: [0.08, 0.2],
    escalon: 1,
    nota: 'Mortero: el D.2.1 admite su λ a 20 ºC. Proyectado, el espesor es continuo y no hay escalón comercial.',
  },
  {
    id: 'lanaMineral',
    etiqueta: 'Lana de roca o fibra mineral',
    para: 'acero',
    vehiculo: 'aislante',
    lambda: null,
    rango: null,
    escalon: 10,
    nota: 'Fibrosa: NO está entre los materiales a los que el D.2.1 permite tomar el λ a 20 ºC, porque el suyo se dispara con la temperatura. Hay que teclear el λp efectivo que declare el producto.',
  },
  {
    id: 'silicatoCalcico',
    etiqueta: 'Placa de silicato cálcico',
    para: 'acero',
    vehiculo: 'aislante',
    lambda: null,
    rango: null,
    escalon: 5,
    nota: 'El λ a 20 ºC de un silicato cálcico aligerado no es el efectivo en incendio; hay que teclear el que declare el producto.',
  },
  {
    id: 'intumescente',
    etiqueta: 'Pintura intumescente',
    para: 'acero',
    vehiculo: 'intumescente',
    lambda: null,
    rango: null,
    escalon: 0,
    nota: 'No protege por conducción sino hinchándose: el espesor de película seca no se deduce de d/λp. Se le pide al fabricante el espesor que alcanza este d/λp para esta masividad y esta R.',
  },
  {
    id: 'morteroYeso',
    etiqueta: 'Revestimiento de mortero de yeso',
    para: 'hormigon',
    vehiculo: 'equivalenteHormigon',
    lambda: null,
    rango: null,
    escalon: 5,
    nota: 'Es el único revestimiento que el anejo C tabula: el C.2.4.2 lo cuenta como un espesor adicional de hormigón equivalente a 1,8 veces el real.',
  },
  {
    id: 'ensayoHormigon',
    etiqueta: 'Otro producto de protección (según ensayo)',
    para: 'hormigon',
    vehiculo: 'aislante',
    lambda: null,
    rango: null,
    escalon: 0,
    nota: 'El C.2.4.1 remite la contribución de cualquier otra capa protectora a la UNE-EN 13381-3: aquí no hay nada que calcular.',
  },
];

export const familiaPorId = (id: string): FamiliaProteccion | undefined =>
  FAMILIAS.find((f) => f.id === id);

export const familiasDe = (material: 'acero' | 'hormigon'): readonly FamiliaProteccion[] =>
  FAMILIAS.filter((f) => f.para === material);

/** La equivalencia del C.2.4.2: un milímetro de mortero de yeso vale 1,8 de hormigón. */
export const EQUIVALENCIA_YESO = 1.8;

/** Por encima de esta clase, el C.2.4.2 sólo admite el yeso en techos por ensayo. */
export const R_MAX_YESO_EN_TECHO = 120;

/**
 * La coletilla que lleva toda cifra que sale de aquí.
 *
 * NO va en los `avisos` de cada propuesta, sino una sola vez en el documento:
 * es la misma frase para todos los elementos, y repetirla veinte veces en el
 * panel de avisos la convierte en ruido que se deja de leer, que es justo lo
 * contrario de lo que se busca. Cada fila del cuadro sí lleva su «(orientativo)»
 * pegado al espesor. Quien use estas funciones por su cuenta la tiene aquí y en
 * el campo `orientativo` de la propuesta.
 */
export const ROTULO_ORIENTATIVO =
  'Espesor orientativo: la contribución del producto se justifica por su marcado CE o por el ensayo UNE-EN 13381 correspondiente.';

export interface PropuestaProteccion {
  familia: FamiliaProteccion;
  /** mm. `null` = con esta familia no se puede dar un espesor. */
  espesor: number | null;
  /** La cuenta escrita, para el documento. */
  cuenta: string;
  /** Lo que hay que saber antes de creerse el número, o por qué no lo hay. */
  avisos: string[];
  /** Hay una cifra, y arrastra el `ROTULO_ORIENTATIVO`. */
  orientativo: boolean;
  /**
   * La familia elegida ES una vía para este elemento, aunque el número lo
   * ponga el fabricante.
   *
   * `false` sólo cuando NO puede serlo —un mortero de yeso contra un déficit de
   * sección—, y entonces el documento no la nombra: escribir «con protección:
   * mortero de yeso» al lado de «pide 350 mm de lado» daría a entender que el
   * enfoscado ensancha el pilar.
   */
  aplicable: boolean;
}

/** Redondea al alza al escalón comercial de la familia. */
export function alEscalon(mm: number, escalon: number): number {
  if (escalon <= 0) return Math.ceil(mm);
  return Math.ceil((mm - 1e-9) / escalon) * escalon;
}

const n2 = (v: number) => v.toFixed(2).replace('.', ',');
const mm = (v: number) => (Math.round(v * 10) / 10).toString().replace('.', ',');

/** Lo que hace falta para pedir una protección de acero. */
export interface DatosAcero {
  /** m²K/W. El que pide la tabla D.1. */
  dLambda: number | null;
  masividad: number | null;
  clase: ClaseR | null;
}

/**
 * El espesor de la protección de un elemento de ACERO.
 *
 * `d = (d/λp) · λp`, con `d/λp` en m²K/W y λp en W/mK, así que `d` sale en
 * metros y se pasa a milímetros. Nada más: toda la física está en la tabla D.1.
 */
export function proteccionAcero(
  familia: FamiliaProteccion,
  datos: DatosAcero,
  lambdaManual: number | null,
): PropuestaProteccion {
  const avisos: string[] = [];
  const sinEspesor = (cuenta: string): PropuestaProteccion => ({
    familia,
    espesor: null,
    cuenta,
    avisos,
    orientativo: false,
    aplicable: true,
  });

  if (datos.dLambda === null) {
    return sinEspesor('');
  }

  if (familia.vehiculo === 'intumescente') {
    avisos.push(
      `Pídale al fabricante el espesor de película seca que alcanza d/λp = ${n2(datos.dLambda)} m²K/W${
        datos.masividad === null ? '' : ` para Am/V = ${datos.masividad} m⁻¹`
      }${datos.clase === null ? '' : ` y R ${datos.clase}`}. Es el dato que sus tablas de marcado CE llevan tabulado.`,
    );
    return sinEspesor(`d/λp = ${n2(datos.dLambda)} m²K/W (objetivo)`);
  }

  const lambda = lambdaManual ?? familia.lambda;
  if (lambda === null || lambda <= 0) {
    avisos.push(`${familia.nota} Sin él no se puede estimar el espesor.`);
    return sinEspesor(`d/λp = ${n2(datos.dLambda)} m²K/W (objetivo)`);
  }

  // d/λp está en m²K/W y λp en W/mK: el producto sale en metros.
  const bruto = datos.dLambda * lambda * 1000;
  const espesor = alEscalon(bruto, familia.escalon);
  const deTabla = lambdaManual === null;

  if (deTabla && familia.rango) {
    avisos.push(
      `Con λp = ${n2(lambda)} W/mK, el valor alto de la familia (${n2(familia.rango[0])} a ${n2(familia.rango[1])}): el producto que se acabe eligiendo dará casi siempre menos espesor, nunca más.`,
    );
  }
  if (familia.escalon > 1 && espesor > bruto + 0.05) {
    avisos.push(`Redondeado al alza desde ${mm(bruto)} mm al escalón de ${mm(familia.escalon)} mm.`);
  }

  return {
    familia,
    espesor,
    cuenta: `d = (d/λp)·λp = ${n2(datos.dLambda)} · ${n2(lambda)} = ${mm(bruto)} mm → ${mm(espesor)} mm`,
    avisos,
    orientativo: true,
    aplicable: true,
  };
}

/** Lo que hace falta para pedir una protección de hormigón. */
export interface DatosHormigon {
  /** mm. Lo que le falta a la distancia al eje. */
  faltaAm: number;
  /** mm. Lo que le falta a la dimensión de la sección. */
  faltaB: number;
  clase: ClaseR | null;
  /** Se aplica en techos: el C.2.4.2 le pone condiciones. */
  enTecho: boolean;
}

/**
 * El espesor de revestimiento de un elemento de HORMIGÓN.
 *
 * Sólo el mortero de yeso tiene cuenta, y sólo contra el déficit de distancia
 * al eje. Si lo que falta es sección —un pilar estrecho, un alma fina— el
 * revestimiento no lo arregla: el C.2.4.2 habla de espesores equivalentes de
 * hormigón, y el C.2.3.5.1, que es quien lo aplica, acota esa equivalencia «a
 * efectos de dicha distancia», la del eje. Decir lo contrario aquí engordaría
 * la R de un pilar con una capa de enfoscado.
 */
export function proteccionHormigon(
  familia: FamiliaProteccion,
  datos: DatosHormigon,
): PropuestaProteccion {
  const avisos: string[] = [];

  if (familia.vehiculo !== 'equivalenteHormigon') {
    avisos.push(familia.nota);
    return { familia, espesor: null, cuenta: '', avisos, orientativo: false, aplicable: true };
  }

  if (datos.faltaB > 0) {
    avisos.push(
      `Lo que falta son ${mm(datos.faltaB)} mm de sección, no de recubrimiento: la equivalencia del C.2.4.2 cuenta sólo a efectos de la distancia al eje. Hay que agrandar la sección o justificar la protección por la UNE-EN 13381-3.`,
    );
    return { familia, espesor: null, cuenta: '', avisos, orientativo: false, aplicable: false };
  }

  if (datos.faltaAm <= 0) {
    return { familia, espesor: null, cuenta: '', avisos, orientativo: false, aplicable: true };
  }

  const bruto = datos.faltaAm / EQUIVALENCIA_YESO;
  const espesor = alEscalon(bruto, familia.escalon);

  if (datos.enTecho) {
    avisos.push(
      datos.clase !== null && datos.clase > R_MAX_YESO_EN_TECHO
        ? `Aplicado en techo y para más de R ${R_MAX_YESO_EN_TECHO}, el C.2.4.2 dice que su aportación sólo puede justificarse mediante ensayo.`
        : 'Aplicado en techo, el C.2.4.2 recomienda ponerlo por proyección.',
    );
  }

  return {
    familia,
    espesor,
    cuenta: `faltan ${mm(datos.faltaAm)} mm al eje; con la equivalencia de 1,8 del C.2.4.2, ${mm(datos.faltaAm)} / 1,8 = ${mm(bruto)} mm → ${mm(espesor)} mm de mortero de yeso`,
    avisos,
    orientativo: true,
    aplicable: true,
  };
}
