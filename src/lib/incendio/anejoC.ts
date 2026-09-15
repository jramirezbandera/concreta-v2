/**
 * Cuánto aguanta una sección de hormigón armado: Anejo C del DB SI.
 *
 * El SI 6 § 6.1.a admite comprobar la resistencia al fuego «comprobando las
 * dimensiones de su sección transversal» con las tablas de los anejos C a F.
 * Aquí están las cinco tablas del hormigón —C.1 a C.5— y las reglas del texto
 * que las acompañan, que son tan vinculantes como ellas y casi nunca se citan.
 *
 * La pregunta que contesta este fichero no es «¿cumple?» sino «¿HASTA DÓNDE
 * llega esta sección?». Se prueba clase a clase, de la R 240 hacia abajo, y se
 * devuelve la mayor que pasa; comparar con la exigida viene después. Así el
 * proyectista ve el margen que tiene —un pilar 30×30 con 35 mm al eje llega a
 * R 90 aunque sólo le pidan R 60— y sabe cuánto puede recortar.
 *
 * TODAS LAS DIMENSIONES EN MILÍMETROS, que es como se acotan las secciones y
 * como vienen tabuladas. La única excepción es `mufi`, adimensional.
 *
 * Las tablas se transcribieron de las páginas 57 a 60 del DB SI (edición
 * vigente) LEYENDO LA PÁGINA RASTERIZADA, no el texto extraído: la C.1 tiene
 * celdas combinadas verticalmente y `pdftotext` la devuelve mal alineada y
 * silenciosamente equivocada. Ver `tabla31.ts` para la misma cautela.
 */

import { interpolar } from '../acciones/interp';

/** Las clases normalizadas que tabulan los anejos C a F. */
export const CLASES_R = [30, 60, 90, 120, 180, 240] as const;
export type ClaseR = (typeof CLASES_R)[number];

/**
 * La menor clase tabulada que cubre unos minutos exigidos.
 *
 * Hace falta porque desde el Anejo B la R exigida puede ser cualquier entero
 * —97 minutos, no 120—, y las tablas del anejo C sólo tienen seis filas. Una
 * sección que llega a R 120 cubre los 97; una que llega a R 90, no.
 */
export function claseNecesaria(minutos: number): ClaseR | null {
  return CLASES_R.find((c) => c >= minutos) ?? null;
}

/** Un par (lado mínimo, distancia mínima al eje) de las tablas: una forma de cumplir. */
export interface Opcion {
  /** mm. Lado menor, espesor, ancho de viga o de nervio. */
  b: number;
  /** mm. Distancia mínima equivalente al eje de la armadura. */
  am: number;
}

const op = (b: number, am: number): Opcion => ({ b, am });

// ── Tabla C.1 · Valores de Δasi (mm) ────────────────────────────────────────

/**
 * La corrección por sobredimensionado, para ACERO DE ARMAR.
 *
 * Sólo la columna «Vigas y losas (forjados)»: la de «Resto de los casos»
 * —soportes y muros— vale CERO para todo μfi, y la de acero de pretensar no
 * entra en esta versión del módulo. Eso no se ve en el texto extraído del PDF,
 * donde los ceros combinados de la tabla caen en filas que no les tocan; se lee
 * en la página rasterizada.
 *
 * Δasi SUMA en la (C.1): am = Σ[Asi·fyki·(asi + Δasi)] / Σ Asi·fyki. Un valor
 * positivo agranda la distancia equivalente y por tanto FAVORECE; uno negativo
 * penaliza. Que sea +5 con poca carga y −5 con mucha es lo esperable.
 */
const TABLA_C1_VIGAS: readonly (readonly [number, number])[] = [
  [0.4, 5],
  [0.5, 0],
  [0.6, -5],
];

/** El μfi por encima del cual la tabla C.1 ya no dice nada. */
export const MUFI_MAX_C1 = 0.6;

// ── Tabla C.2 · Elementos a compresión ──────────────────────────────────────

export type TipoCompresion = 'soporte' | 'muroUnaCara' | 'muroDosCaras';

export const TABLA_C2: Record<ClaseR, Record<TipoCompresion, Opcion>> = {
  30: { soporte: op(150, 15), muroUnaCara: op(100, 15), muroDosCaras: op(120, 15) },
  60: { soporte: op(200, 20), muroUnaCara: op(120, 15), muroDosCaras: op(140, 15) },
  90: { soporte: op(250, 30), muroUnaCara: op(140, 20), muroDosCaras: op(160, 25) },
  120: { soporte: op(250, 40), muroUnaCara: op(160, 25), muroDosCaras: op(180, 35) },
  180: { soporte: op(350, 45), muroUnaCara: op(200, 40), muroDosCaras: op(250, 45) },
  240: { soporte: op(400, 50), muroUnaCara: op(250, 50), muroDosCaras: op(300, 50) },
};

/** Llamada (2) de la tabla C.2: los soportes hormigonados in situ. */
export const LADO_MINIMO_SOPORTE_EN_OBRA = 250;

// ── Tabla C.3 · Vigas con tres caras expuestas ──────────────────────────────

export const TABLA_C3: Record<ClaseR, { opciones: readonly Opcion[]; b0: number }> = {
  30: { opciones: [op(80, 20), op(120, 15), op(200, 10)], b0: 80 },
  60: { opciones: [op(100, 30), op(150, 25), op(200, 20)], b0: 100 },
  90: { opciones: [op(150, 40), op(200, 35), op(250, 30), op(400, 25)], b0: 100 },
  120: { opciones: [op(200, 50), op(250, 45), op(300, 40), op(500, 35)], b0: 120 },
  180: { opciones: [op(300, 75), op(350, 65), op(400, 60), op(600, 50)], b0: 140 },
  240: { opciones: [op(400, 75), op(500, 70), op(700, 60)], b0: 160 },
};

// ── Tabla C.4 · Losas macizas ───────────────────────────────────────────────

export interface FilaC4 {
  /** mm. Espesor mínimo, sólo exigible si la losa compartimenta. */
  h: number;
  unaDireccion: number;
  /** ly/lx ≤ 1,5. */
  dosDirecciones: number;
  /** 1,5 < ly/lx ≤ 2. */
  dosDireccionesAlargada: number;
}

export const TABLA_C4: Record<ClaseR, FilaC4> = {
  30: { h: 60, unaDireccion: 10, dosDirecciones: 10, dosDireccionesAlargada: 10 },
  60: { h: 80, unaDireccion: 20, dosDirecciones: 10, dosDireccionesAlargada: 20 },
  90: { h: 100, unaDireccion: 25, dosDirecciones: 15, dosDireccionesAlargada: 25 },
  120: { h: 120, unaDireccion: 35, dosDirecciones: 20, dosDireccionesAlargada: 30 },
  180: { h: 150, unaDireccion: 50, dosDirecciones: 30, dosDireccionesAlargada: 40 },
  240: { h: 175, unaDireccion: 60, dosDirecciones: 50, dosDireccionesAlargada: 50 },
};

// ── Tabla C.5 · Forjados bidireccionales ────────────────────────────────────

export const TABLA_C5: Record<ClaseR, { opciones: readonly Opcion[]; h: number }> = {
  30: { opciones: [op(80, 20), op(120, 15), op(200, 10)], h: 60 },
  60: { opciones: [op(100, 30), op(150, 25), op(200, 20)], h: 80 },
  90: { opciones: [op(120, 40), op(200, 30), op(250, 25)], h: 100 },
  120: { opciones: [op(160, 50), op(250, 40), op(300, 35)], h: 120 },
  180: { opciones: [op(200, 70), op(300, 60), op(400, 55)], h: 150 },
  240: { opciones: [op(250, 90), op(350, 75), op(500, 70)], h: 175 },
};

// ── Los tipos de elemento ───────────────────────────────────────────────────

export type TipoHormigon =
  | TipoCompresion
  | 'vigaTresCaras'
  | 'vigaTodasCaras'
  | 'losaUnaDireccion'
  | 'losaDosDirecciones'
  | 'forjadoBidireccional'
  | 'forjadoUnidireccional';

export interface DefinicionTipo {
  id: TipoHormigon;
  etiqueta: string;
  /** Cómo se llama en pantalla lo que se teclea en `b`. */
  rotuloB: string;
  /** `true` si la reducción del 10 % por áridos calizos le aplica (C.2.1.3). */
  calizaAplica: boolean;
}

export const TIPOS_HORMIGON: readonly DefinicionTipo[] = [
  { id: 'soporte', etiqueta: 'Soporte', rotuloB: 'Lado menor', calizaAplica: false },
  { id: 'muroUnaCara', etiqueta: 'Muro de carga, una cara expuesta', rotuloB: 'Espesor', calizaAplica: false },
  { id: 'muroDosCaras', etiqueta: 'Muro de carga, ambas caras expuestas', rotuloB: 'Espesor', calizaAplica: false },
  { id: 'vigaTresCaras', etiqueta: 'Viga con tres caras expuestas', rotuloB: 'Ancho', calizaAplica: true },
  { id: 'vigaTodasCaras', etiqueta: 'Viga expuesta por todas sus caras', rotuloB: 'Ancho', calizaAplica: true },
  { id: 'losaUnaDireccion', etiqueta: 'Losa maciza en una dirección', rotuloB: 'Espesor', calizaAplica: true },
  { id: 'losaDosDirecciones', etiqueta: 'Losa maciza en dos direcciones', rotuloB: 'Espesor', calizaAplica: true },
  { id: 'forjadoBidireccional', etiqueta: 'Forjado reticular', rotuloB: 'Ancho de nervio', calizaAplica: true },
  { id: 'forjadoUnidireccional', etiqueta: 'Forjado unidireccional', rotuloB: 'Ancho de nervio', calizaAplica: true },
];

const DEF_DE = new Map(TIPOS_HORMIGON.map((t) => [t.id, t]));
export const etiquetaTipo = (t: TipoHormigon): string => DEF_DE.get(t)?.etiqueta ?? t;

const esCompresion = (t: TipoHormigon): t is TipoCompresion =>
  t === 'soporte' || t === 'muroUnaCara' || t === 'muroDosCaras';
const esViga = (t: TipoHormigon) => t === 'vigaTresCaras' || t === 'vigaTodasCaras';
const esLosa = (t: TipoHormigon) => t === 'losaUnaDireccion' || t === 'losaDosDirecciones';

// ── Lo que se teclea ────────────────────────────────────────────────────────

export interface EntradaHormigon {
  tipo: TipoHormigon;
  /** mm. Lado menor, espesor, ancho de viga o de nervio. */
  b: number | null;
  /** mm. Canto total de la viga, o espesor de la losa o del forjado. */
  h: number | null;
  /** mm. Ancho del alma de la viga. `null` = el mismo que `b`. */
  b0: number | null;
  /** mm. Recubrimiento nominal, a la cara exterior del cerco. */
  rnom: number | null;
  /** mm. Diámetro del cerco. Cero en losas y forjados sin cercos. */
  dCerco: number;
  /** mm. Diámetro de la armadura principal. */
  dBarra: number | null;
  /**
   * mm. La distancia al eje tecleada a mano, que pisa la cuenta de
   * `rnom + ø_cerco + ø/2`. Es `asi`, NO `am`: la corrección de la tabla C.1 se
   * le suma igual.
   */
  ejeManual: number | null;
  /** Áridos calizos: −10 % en vigas, losas y forjados (C.2.1.3). */
  aridoCalizo: boolean;
  /** Coeficiente de sobredimensionado. `null` = sin la corrección de la C.1. */
  mufi: number | null;
  /** Cargas sensiblemente uniformes: lo pide la C.1 para μfi < 0,6. */
  cargaUniforme: boolean;
  /** Armadura de esquina en una sola capa: llamada (1) de la tabla C.1. */
  esquinaUnaCapa: boolean;
  /** ly/lx de una losa en dos direcciones. */
  relacionLuces: number | null;
  /** El elemento separa sectores (criterios E e I): manda también el espesor. */
  compartimenta: boolean;
  /** Entrevigado cerámico o de hormigón CON revestimiento inferior (C.2.3.5). */
  entrevigadoProtegido: boolean;
  /** Soporte hormigonado en obra: llamada (2) de la tabla C.2. */
  ejecutadoEnObra: boolean;
  /** Cuantía del soporte por encima del 2 % de la sección (C.2.2.2). */
  cuantiaAlta: boolean;
  /** Losa o forjado sobre apoyos puntuales (C.2.3.3.3 y C.2.3.4.2). */
  apoyosPuntuales: boolean;
  /** El elemento está traccionado: se comprueba como acero revestido (C.2.2.3). */
  traccionado: boolean;
}

export function entradaHormigonInicial(): EntradaHormigon {
  return {
    tipo: 'soporte',
    b: null,
    h: null,
    b0: null,
    rnom: null,
    dCerco: 0,
    dBarra: null,
    ejeManual: null,
    aridoCalizo: false,
    mufi: null,
    cargaUniforme: true,
    esquinaUnaCapa: false,
    relacionLuces: null,
    compartimenta: false,
    entrevigadoProtegido: true,
    ejecutadoEnObra: false,
    cuantiaAlta: false,
    apoyosPuntuales: false,
    traccionado: false,
  };
}

// ── La distancia al eje ─────────────────────────────────────────────────────

export interface DistanciaAlEje {
  /** mm. `asi` antes de la corrección. `null` = faltan datos. */
  eje: number | null;
  /** Cómo sale, escrito para el documento. */
  cuenta: string;
  /** `true` si `eje` se tecleó en vez de derivarse. */
  aMano: boolean;
}

/**
 * `asi = rnom + ø_cerco + ø/2`, con la cuenta a la vista.
 *
 * El recubrimiento nominal se mide a la cara exterior del cerco, así que hasta
 * el EJE de la barra principal hay que atravesar el cerco entero y medio
 * diámetro de la barra. Es el error clásico al aplicar el anejo C: tomar el
 * recubrimiento como si fuera la distancia al eje deja la sección 15 o 20 mm
 * por debajo de lo que se cree, que es justo el escalón entre dos filas.
 */
export function distanciaAlEje(e: EntradaHormigon): DistanciaAlEje {
  if (e.ejeManual !== null) {
    return { eje: e.ejeManual, cuenta: `${e.ejeManual} mm (indicada)`, aMano: true };
  }
  if (e.rnom === null || e.dBarra === null) {
    return { eje: null, cuenta: '', aMano: false };
  }
  const eje = e.rnom + e.dCerco + e.dBarra / 2;
  const cerco = e.dCerco > 0 ? ` + ø${e.dCerco}` : '';
  return {
    eje,
    cuenta: `as = ${e.rnom}${cerco} + ø${e.dBarra}/2 = ${redondear(eje)} mm`,
    aMano: false,
  };
}

const redondear = (v: number) => Math.round(v * 10) / 10;

const n1 = (v: number) => redondear(v).toString().replace('.', ',');

// ── La corrección de la tabla C.1 ───────────────────────────────────────────

export interface CorreccionC1 {
  /** mm. Lo que se le suma a `asi`. */
  delta: number;
  avisos: string[];
}

/**
 * Δasi para una clase concreta.
 *
 * Depende de la clase por la llamada (1) de la tabla C.1, que compara el ancho
 * de la viga con el bmín de la columna 3 de la tabla C.3 —que es la Opción 2,
 * contando la columna de la resistencia como la primera— y ese bmín cambia de
 * fila en fila.
 */
export function correccionC1(e: EntradaHormigon, clase: ClaseR): CorreccionC1 {
  const avisos: string[] = [];

  // Soportes y muros van por «Resto de los casos», que vale cero para todo μfi.
  if (esCompresion(e.tipo) || e.mufi === null) return { delta: 0, avisos };

  // μfi es la fracción de la capacidad que está solicitada en el incendio, y
  // cero o menos no es un valor: es una casilla mal tecleada. Se trata como si
  // no estuviera —sin corrección—, que es lo mismo que hará `normalizar` al
  // releer el estado; dejarlo pasar daría los +5 mm de la fila más baja de la
  // tabla en sesión y ninguno tras recargar.
  if (e.mufi <= 0) {
    avisos.push(
      `μfi = ${n1(e.mufi)} no es un coeficiente de sobredimensionado: se comprueba sin la corrección de la tabla C.1, como si no se hubiera tecleado.`,
    );
    return { delta: 0, avisos };
  }

  let delta: number;
  if (e.mufi > MUFI_MAX_C1) {
    // La tabla no llega, y extrapolar hacia abajo sería inventarse una
    // penalización. Se toma la última tabulada, que es la más desfavorable de
    // las tres, y se dice que no cubre este caso.
    delta = TABLA_C1_VIGAS[TABLA_C1_VIGAS.length - 1][1];
    avisos.push(
      `La tabla C.1 no pasa de μfi = 0,60 y aquí vale ${n1(e.mufi)}. Se aplica la corrección de 0,60 (${delta} mm), que es la más desfavorable tabulada, pero la tabla no cubre este caso: conviene comprobar la sección por el método de la isoterma 500 (C.3).`,
    );
  } else if (!e.cargaUniforme && e.mufi < MUFI_MAX_C1) {
    // C.1: las correcciones para μfi < 0,6 en vigas, losas y forjados sólo
    // pueden considerarse con cargas sensiblemente uniformes.
    delta = 0;
    avisos.push(
      'Sin cargas sensiblemente uniformes, la tabla C.1 no permite la corrección por sobredimensionado para μfi < 0,60: se comprueba con la distancia al eje sin corregir.',
    );
  } else {
    delta = interpolar(
      e.mufi,
      TABLA_C1_VIGAS.map(([m]) => m),
      TABLA_C1_VIGAS.map(([, d]) => d),
    );
  }

  // Llamada (1): armaduras de esquina de vigas con una sola capa, en vigas más
  // estrechas que el bmín de la columna 3 de la tabla C.3.
  if (e.esquinaUnaCapa && esViga(e.tipo)) {
    const umbral = TABLA_C3[clase].opciones[1]?.b ?? null;
    if (umbral !== null && e.b !== null && e.b < umbral) {
      delta -= 10;
      avisos.push(
        `Armadura de esquina en una sola capa y ancho de ${e.b} mm, menor que los ${umbral} mm de la columna 3 de la tabla C.3 para R ${clase}: Δasi se reduce en 10 mm (llamada 1).`,
      );
    }
  }

  return { delta: redondear(delta), avisos };
}

// ── La comprobación ─────────────────────────────────────────────────────────

/** Qué pasa con una clase concreta. */
export interface PruebaClase {
  clase: ClaseR;
  cumple: boolean;
  /** mm. La distancia equivalente al eje con la que se comprobó. */
  am: number | null;
  /** Cuál de las opciones de la tabla se usó, o por qué no pasa ninguna. */
  motivo: string;
  /**
   * mm. Lo que le falta a la distancia al eje, y a la dimensión de la sección.
   *
   * Separados porque se arreglan de maneras DISTINTAS: al recubrimiento se le
   * puede añadir un revestimiento —el C.2.4 tabula la equivalencia del mortero
   * de yeso—, pero a la dimensión no, porque el C.2.4 acota expresamente esa
   * equivalencia a la distancia al eje (ver el C.2.3.5.1, «a efectos de dicha
   * distancia»). Un pilar estrecho no se arregla enfoscándolo.
   */
  faltaAm: number;
  faltaB: number;
}

export interface ResultadoHormigon {
  /** La mayor clase que aguanta la sección. `null` = ni la R 30. */
  alcanza: ClaseR | null;
  /** La tabla por la que se ha comprobado, para citarla. */
  tabla: string;
  /** La opción de esa tabla con la que pasa `alcanza`. */
  porOpcion: string;
  eje: DistanciaAlEje;
  /** mm. La distancia equivalente al eje en la clase alcanzada. */
  am: number | null;
  /** mm. La corrección de la C.1 en la clase alcanzada. */
  delta: number;
  pruebas: PruebaClase[];
  avisos: string[];
  /** Datos sin los que no se puede decir nada. */
  faltan: string[];
}

/** Qué tabla le toca a cada tipo, ya resuelto el caso raro del unidireccional. */
function tablaDe(e: EntradaHormigon, clase: ClaseR): 'C.2' | 'C.3' | 'C.4' | 'C.5' {
  if (esCompresion(e.tipo)) return 'C.2';
  if (esViga(e.tipo)) return 'C.3';
  if (esLosa(e.tipo)) return 'C.4';
  if (e.tipo === 'forjadoBidireccional') return 'C.5';
  // Forjado unidireccional: con entrevigado cerámico o de hormigón y
  // revestimiento inferior basta la distancia al eje de las losas macizas
  // (C.2.3.5.1) hasta R 120. Por encima, o sin esas dos cosas, se comprueba
  // como viga con tres caras expuestas (C.2.3.5.3).
  return e.entrevigadoProtegido && clase <= 120 ? 'C.4' : 'C.3';
}

/** Qué columna de la tabla C.4 le toca a una losa. */
function columnaC4(e: EntradaHormigon, fila: FilaC4): { am: number; rotulo: string } {
  if (e.tipo !== 'losaDosDirecciones') {
    return { am: fila.unaDireccion, rotulo: 'flexión en una dirección' };
  }
  const r = e.relacionLuces;
  if (r !== null && r <= 1.5) {
    return { am: fila.dosDirecciones, rotulo: 'flexión en dos direcciones, ly/lx ≤ 1,5' };
  }
  if (r !== null && r <= 2) {
    return { am: fila.dosDireccionesAlargada, rotulo: 'flexión en dos direcciones, 1,5 < ly/lx ≤ 2' };
  }
  // Sin relación de luces, o por encima de 2, se va a la columna de una
  // dirección: la tabla no tabula más allá y por encima de 2 la losa trabaja
  // prácticamente en una sola.
  return { am: fila.unaDireccion, rotulo: 'flexión en una dirección' };
}

function probarClase(e: EntradaHormigon, clase: ClaseR, eje: number): PruebaClase {
  const { delta } = correccionC1(e, clase);
  const am = redondear(eje + delta);
  const k = DEF_DE.get(e.tipo)?.calizaAplica && e.aridoCalizo ? 0.9 : 1;
  const red = (v: number) => redondear(v * k);
  const b = e.b as number;
  const tabla = tablaDe(e, clase);

  const noPasa = (motivo: string, faltaAm = 0, faltaB = 0): PruebaClase => ({
    clase,
    cumple: false,
    am,
    motivo,
    faltaAm: redondear(faltaAm),
    faltaB: redondear(faltaB),
  });
  const pasa = (motivo: string): PruebaClase => ({ clase, cumple: true, am, motivo, faltaAm: 0, faltaB: 0 });

  /**
   * Qué le falta a la sección, y por qué opción de la tabla se queda más cerca.
   *
   * Se miran primero las opciones cuyo ancho YA se cumple: en ésas lo único que
   * falta es recubrimiento, que es lo único que un revestimiento puede aportar.
   * Nombrar esa opción y no la primera de la fila es lo que convierte el aviso
   * en accionable: una viga de 250 con 40 al eje no necesita «200 / 50», que es
   * la primera de la tabla, sino cinco milímetros más para la «250 / 45».
   */
  const deficit = (opciones: readonly Opcion[]) => {
    const conAncho = opciones.filter((o) => b >= red(o.b));
    if (conAncho.length > 0) {
      const mejor = conAncho.reduce((x, o) => (red(o.am) < red(x.am) ? o : x));
      return { am: Math.max(0, redondear(red(mejor.am) - am)), b: 0, opcion: mejor };
    }
    const masCerca = opciones.reduce((x, o) => (red(o.b) - b < red(x.b) - b ? o : x));
    return {
      am: Math.max(0, redondear(red(masCerca.am) - am)),
      b: redondear(red(masCerca.b) - b),
      opcion: masCerca,
    };
  };

  /** El aviso de una tabla con varias opciones, nombrando la más cercana. */
  const noEncaja = (tabla: 'C.3' | 'C.5', opciones: readonly Opcion[]) => {
    const d = deficit(opciones);
    const par = `${n1(red(d.opcion.b))} / ${n1(red(d.opcion.am))}`;
    return d.b > 0
      ? noPasa(
          `la opción más cercana de la tabla ${tabla} pide ${par} y hay ${b} / ${n1(am)}: faltan ${n1(d.b)} mm de ${tabla === 'C.5' ? 'nervio' : 'ancho'}`,
          d.am,
          d.b,
        )
      : noPasa(`pide ${n1(red(d.opcion.am))} mm al eje y hay ${n1(am)} (opción ${par})`, d.am, d.b);
  };

  if (tabla === 'C.2') {
    const o = TABLA_C2[clase][e.tipo as TipoCompresion];
    const d = deficit([o]);
    if (b < o.b) return noPasa(`pide ${o.b} mm de lado y hay ${b}`, d.am, d.b);
    if (am < o.am) return noPasa(`pide ${o.am} mm al eje y hay ${n1(am)}`, d.am, d.b);
    return pasa(`tabla C.2, ${o.b} / ${o.am}`);
  }

  if (tabla === 'C.4') {
    const fila = TABLA_C4[clase];
    const col = columnaC4(e, fila);
    if (am < red(col.am)) {
      return noPasa(`pide ${n1(red(col.am))} mm al eje y hay ${n1(am)}`, red(col.am) - am);
    }
    if (e.compartimenta && e.h !== null && e.h < red(fila.h)) {
      // El espesor de una losa que compartimenta va por los criterios E e I, no
      // por el R: un revestimiento por la cara de abajo no lo suple.
      return noPasa(`compartimenta y pide ${n1(red(fila.h))} mm de espesor; hay ${e.h}`, 0, red(fila.h) - e.h);
    }
    return pasa(`tabla C.4, ${col.rotulo}, ${n1(red(col.am))} mm al eje`);
  }

  if (tabla === 'C.5') {
    const fila = TABLA_C5[clase];
    if (e.compartimenta && e.h !== null && e.h < red(fila.h)) {
      return noPasa(`compartimenta y pide ${n1(red(fila.h))} mm de espesor; hay ${e.h}`, 0, red(fila.h) - e.h);
    }
    const vale = fila.opciones.find((o) => b >= red(o.b) && am >= red(o.am));
    if (!vale) return noEncaja('C.5', fila.opciones);
    const i = fila.opciones.indexOf(vale) + 1;
    return pasa(`tabla C.5, opción ${i} (${vale.b} / ${vale.am})`);
  }

  // C.3 — vigas, y el forjado unidireccional que se comprueba como tal.
  const fila = TABLA_C3[clase];
  const alma = e.b0 ?? b;
  if (alma < red(fila.b0)) {
    // El alma es dimensión de la sección: tampoco la arregla un revestimiento.
    return noPasa(`el alma pide ${n1(red(fila.b0))} mm y hay ${n1(alma)}`, 0, red(fila.b0) - alma);
  }
  const candidatas = fila.opciones.filter((o) => b >= red(o.b) && am >= red(o.am));
  // C.2.3.2: expuesta por todas sus caras, además, área ≥ 2·(bmín)².
  const vale =
    e.tipo === 'vigaTodasCaras'
      ? candidatas.find((o) => {
          const area = e.h === null ? null : b * e.h;
          return area !== null && area >= 2 * red(o.b) ** 2;
        })
      : candidatas[0];

  if (!vale) {
    if (candidatas.length > 0 && e.tipo === 'vigaTodasCaras') {
      const o = candidatas[0];
      const area = e.h === null ? 0 : b * e.h;
      // Falta canto, no recubrimiento: se apunta como déficit de sección.
      return noPasa(
        `expuesta por todas sus caras: pide un área de ${Math.round(2 * red(o.b) ** 2)} mm² (2·bmín²) y hay ${Math.round(area)}`,
        0,
        1,
      );
    }
    return noEncaja('C.3', fila.opciones);
  }
  const i = fila.opciones.indexOf(vale) + 1;
  return pasa(`tabla C.3, opción ${i} (${vale.b} / ${vale.am})`);
}

/**
 * Los avisos del texto del anejo C, que no están en las tablas y son
 * igualmente vinculantes.
 *
 * Van todos juntos aquí y no repartidos por la comprobación a propósito: son
 * condiciones de armado y de ejecución que el módulo NO puede verificar —no
 * sabe la cuantía ni la longitud de los tramos—, así que lo único honrado es
 * enunciarlas para que quien firma las compruebe.
 */
function avisosDelTexto(e: EntradaHormigon, alcanza: ClaseR | null, eje: number | null): string[] {
  const avisos: string[] = [];
  const r = alcanza ?? 0;

  if (e.tipo === 'soporte' && e.ejecutadoEnObra && e.b !== null && e.b < LADO_MINIMO_SOPORTE_EN_OBRA) {
    avisos.push(
      `Soporte hormigonado en obra de ${e.b} mm: la llamada (2) de la tabla C.2 remite a la dimensión mínima de ${LADO_MINIMO_SOPORTE_EN_OBRA} mm.`,
    );
  }
  if (e.tipo === 'soporte' && e.cuantiaAlta && r > 90) {
    avisos.push(
      'Armadura superior al 2 % de la sección y R mayor que 90: el C.2.2.2 pide distribuirla en todas las caras, salvo en las zonas de solapo.',
    );
  }
  if ((e.tipo === 'muroUnaCara' || e.tipo === 'muroDosCaras') && alcanza !== null) {
    avisos.push(`La resistencia al fuego del muro se puede considerar REI ${alcanza} (llamada 3 de la tabla C.2).`);
  }
  if (e.traccionado) {
    avisos.push('Elemento traccionado: el C.2.2.3 manda comprobarlo como elemento de acero revestido, no por estas tablas.');
  }
  if (eje !== null && eje > 50) {
    avisos.push(
      `Con ${n1(eje)} mm al eje el recubrimiento en zona traccionada pasa de 50 mm: hay que disponer armadura de piel, una malla con separaciones menores de 150 mm en las dos direcciones, anclada en la masa de hormigón (C.2.1.4).`,
    );
  }
  if (r >= 90) {
    if (esViga(e.tipo)) {
      avisos.push(
        'R 90 o mayor: la armadura de negativos de las vigas continuas se prolonga hasta el 33 % de la luz del tramo, con una cuantía no inferior al 25 % de la requerida en los extremos (C.2.3.1).',
      );
    }
    if (esLosa(e.tipo) || e.tipo === 'forjadoBidireccional' || e.tipo === 'forjadoUnidireccional') {
      avisos.push(
        e.apoyosPuntuales
          ? 'R 90 o mayor sobre apoyos puntuales: el 20 % de la armadura superior sobre soportes se prolonga a lo largo de todo el tramo, en la banda de soportes.'
          : 'R 90 o mayor sobre apoyos lineales: la armadura de negativos se prolonga un 33 % de la luz del tramo, con una cuantía no inferior al 25 % de la requerida en extremos.',
      );
    }
  }
  if (e.aridoCalizo && DEF_DE.get(e.tipo)?.calizaAplica) {
    avisos.push('Áridos calizos: se ha aplicado la reducción del 10 % en dimensiones y distancia al eje que admite el C.2.1.3.');
  }
  if (e.tipo === 'forjadoUnidireccional' && e.entrevigadoProtegido) {
    avisos.push(
      'Las bovedillas cerámicas pueden contarse como espesores adicionales de hormigón equivalentes al doble de su espesor real (C.2.3.5.3); aquí no se han contado.',
    );
  }
  return avisos;
}

/** Hasta dónde llega una sección de hormigón. */
export function resistenciaHormigon(e: EntradaHormigon): ResultadoHormigon {
  const eje = distanciaAlEje(e);
  const faltan: string[] = [];
  if (e.b === null || e.b <= 0) faltan.push(DEF_DE.get(e.tipo)?.rotuloB.toLowerCase() ?? 'la dimensión');
  if (eje.eje === null) faltan.push('el recubrimiento y el diámetro de la armadura');
  if (e.tipo === 'vigaTodasCaras' && (e.h === null || e.h <= 0)) faltan.push('el canto');
  if (e.compartimenta && (e.h === null || e.h <= 0)) faltan.push('el espesor');

  if (faltan.length > 0) {
    return {
      alcanza: null,
      tabla: '',
      porOpcion: '',
      eje,
      am: null,
      delta: 0,
      pruebas: [],
      avisos: [],
      faltan,
    };
  }

  const pruebas = CLASES_R.map((c) => probarClase(e, c, eje.eje as number));
  // La mayor que pasa, no la primera que falla: las opciones de las tablas no
  // son monótonas en todos los casos y una clase alta puede pasar por una
  // opción que la baja no tiene.
  const buenas = pruebas.filter((p) => p.cumple);
  const mejor = buenas.length > 0 ? buenas[buenas.length - 1] : null;

  return {
    alcanza: mejor?.clase ?? null,
    tabla: mejor ? `tabla ${tablaDe(e, mejor.clase)}` : '',
    porOpcion: mejor?.motivo ?? '',
    eje,
    am: mejor?.am ?? pruebas[0]?.am ?? null,
    delta: mejor ? correccionC1(e, mejor.clase).delta : 0,
    pruebas,
    avisos: [
      ...(mejor ? correccionC1(e, mejor.clase).avisos : []),
      ...avisosDelTexto(e, mejor?.clase ?? null, eje.eje),
    ],
    faltan: [],
  };
}
