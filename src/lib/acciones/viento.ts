/**
 * Acción del viento sobre un edificio de pisos (DB SE-AE art. 3.3 y Anejo D).
 *
 *   qe = qb · ce(z) · cp                                            (3.1)
 *   ce = F · (F + 7k),  F = k · ln(max(z, Z) / L)                   (D.2, D.3)
 *
 * Lo que entra es lo que el usuario sabe de su edificio: zona eólica (o qb a
 * mano), entorno, alturas de los forjados y dimensiones en planta. Lo que sale
 * es lo que se lleva al programa de cálculo: una FUERZA POR PLANTA en cada
 * dirección, F_k = (cp − cs) · qe(z_k) · b · h_trib,k, más lo que la norma
 * añade y la banda no recoge:
 *
 *  - el rozamiento del art. 3.3.2-3 sobre las superficies paralelas al viento,
 *    repartido por plantas cuando pasa del 10 % de la fuerza perpendicular;
 *  - con cubierta a dos aguas, lo que hay por encima del último forjado: el
 *    hastial (viento paralelo a la cumbrera, coeficientes de la tabla 3.5) y la
 *    resultante horizontal de los faldones (viento perpendicular, presiones de
 *    la tabla D.6 proyectadas), los dos sumados al forjado de cubierta.
 *
 * Decisiones (2026-09-04, revisadas en la auditoría del 2026-09-05):
 *  - ce por planta, a la altura de cada forjado, con la fórmula del Anejo D.2
 *    (D-VN3). La tabla 3.4 es esa fórmula redondeada; se usa sólo para probar.
 *  - cp y cs interpolados en la tabla 3.5 (D-VN2), como la macro del estudio.
 *  - Altura tributaria: media planta por debajo y media por encima; la banda
 *    entre la rasante y la mitad de la planta baja va a la cimentación y la
 *    cubierta sólo recibe la mitad de abajo (petos y casetones, a mano).
 *  - La esbeltez de la tabla 3.5 y las alturas de las figuras usan la altura
 *    del EDIFICIO: la coronación si hay cubierta inclinada, el último forjado
 *    si no.
 *
 * Convención de direcciones: «viento según X» es el que sopla paralelo al eje
 * X. Su esbeltez es h / (dimensión en X) —el plano paralelo al viento, como
 * dice la 3.5— y la fachada que recibe la presión es la dimensión en Y.
 *
 * Ninguna función de este fichero contiene un número de la norma: todos vienen
 * de `tablasAE.ts`.
 */

import { calcularDosAguas, type DosAguasResultado } from './dosAguas';
import { calcularParamentos, type ParamentosResultado } from './paramentos';
import { interpolar } from './interp';
import {
  ALTITUD_MAX_VIENTO,
  ASPEREZAS,
  DENSIDAD_AIRE,
  ESBELTEZ_MAX,
  EXCENTRICIDAD_VIENTO,
  QB_SIMPLIFICADO,
  ROZAMIENTO,
  ROZAMIENTO_DESPRECIABLE,
  TABLA_3_5,
  Z_MAX_ANEJO_D,
  ZONAS_EOLICAS,
  type GradoAspereza,
  type SuperficieExterior,
  type ZonaEolica,
} from './tablasAE';

// ── Entrada ─────────────────────────────────────────────────────────────────

export interface PlantaViento {
  id?: string;
  /** Rótulo libre: «Planta 3», «Cubierta». */
  nombre?: string;
  /** Altura del forjado SOBRE RASANTE, m. La rasante es la de la fachada a barlovento (3.3.3-1). */
  h: number;
}

/** Cubierta a dos aguas del edificio (Anejo D.6), si la tiene. */
export interface CubiertaDosAguasInput {
  /** Pendiente de los faldones, grados; negativa si bajan hacia el centro. */
  pendiente: number;
  /** Altura de coronación (el punto más alto de la cubierta) sobre rasante, m. */
  alturaCoronacion: number;
  /** Eje al que es paralela la cumbrera. */
  cumbrera: 'x' | 'y';
  /** Área de influencia del elemento comprobado, m². Si falta, la de cada zona. */
  areaInfluencia?: number;
}

/** Presiones por zonas de las fachadas (tabla D.3), para las comprobaciones locales. */
export interface ParamentosVientoInput {
  /** Área de influencia del elemento comprobado, m². Si falta, la de cada zona. */
  areaInfluencia?: number;
}

export interface VientoInput {
  zona: ZonaEolica;
  /**
   * Presión dinámica tecleada, kN/m². Si falta, la de la zona. Para el valor
   * simplificado del art. 3.3.2 basta pasar `QB_SIMPLIFICADO`.
   */
  qbManual?: number;
  aspereza: GradoAspereza;
  /** Altitud del emplazamiento, m. Sólo para el límite de aplicación del DB. */
  altitud?: number;
  plantas: PlantaViento[];
  /** Dimensiones del edificio en planta, m. */
  dimensiones: { x: number; y: number };
  /** Superficie exterior, para el rozamiento del art. 3.3.2-3. Sin ella no se calcula. */
  superficie?: SuperficieExterior;
  /** Cubierta a dos aguas, para las presiones por zonas de la tabla D.6. Sin ella, cubierta plana. */
  cubierta?: CubiertaDosAguasInput;
  /** Paramentos verticales por zonas de la tabla D.3, si se piden. */
  paramentos?: ParamentosVientoInput;
}

// ── Salida ──────────────────────────────────────────────────────────────────

export type OrigenQb = 'zona' | 'simplificado' | 'manual';

export interface PlantaVientoResuelta {
  id?: string;
  nombre: string;
  /** Altura del forjado sobre rasante, m. */
  z: number;
  /** Altura tributaria, m. */
  hTrib: number;
  ce: number;
  /** qb · ce, kN/m² (la presión antes del coeficiente eólico). */
  qe: number;
  /** qe · cp, kN/m². */
  presion: number;
  /** qe · cs, kN/m² (negativo: succión). */
  succion: number;
  /** Fuerza de la banda tributaria de fachada, kN: (cp − cs) · qe · b · hTrib. */
  Fbanda: number;
  /** Rozamiento repartido a esta planta, kN (0 si se desprecia o no se pide). */
  Frozamiento: number;
  /** Lo que hay por encima del último forjado (hastial o faldones), kN; 0 salvo en la planta de cubierta. */
  Fencima: number;
  /** Fuerza horizontal total en el forjado, kN: Fbanda + Frozamiento + Fencima. Es la que va al programa. */
  F: number;
}

/** Lo que empuja por encima del último forjado cuando la cubierta es a dos aguas. */
export interface EncimaCubierta {
  /** 'hastial': el triángulo de fachada, con viento paralelo a la cumbrera; 'faldones': la resultante de la D.6, con viento perpendicular. */
  tipo: 'hastial' | 'faldones';
  /** Ancho de la fachada del hastial, o longitud de la cumbrera, m. */
  ancho: number;
  /** Altura sobre el último forjado hasta la coronación, m. */
  altura: number;
  /** Área que empuja, m²: el triángulo (ancho · altura / 2) o la proyección vertical de los faldones (ancho · altura). */
  area: number;
  /** Altura de referencia (la coronación), m, y su coeficiente de exposición. */
  z: number;
  ce: number;
  /** qb · ce a la coronación, kN/m². */
  qe: number;
  /** Coeficiente global equivalente: cp − cs de la 3.5 en el hastial; F / (qe · area) en los faldones. */
  coeficiente: number;
  /** Fuerza horizontal a sotavento, kN, sumada a la planta de cubierta. */
  F: number;
  /** Sólo faldones: la resultante del otro juego de posibilidades (barlovento en succión, sotavento en presión), kN; ≤ 0 es hacia barlovento. */
  Fcontraria?: number;
}

/** Rozamiento del art. 3.3.2-3 en una dirección. */
export interface RozamientoResuelto {
  superficie: SuperficieExterior;
  cfr: number;
  /** Superficie paralela al viento, m²: las dos fachadas laterales por las bandas tributarias más la cubierta (d · b). */
  area: number;
  /** Fuerza total de rozamiento, kN. */
  F: number;
  /** F / Σ Fbanda, la fracción de la fuerza perpendicular. */
  fraccion: number;
  /** true si pasa del 10 % y está repartido en las plantas (Frozamiento); false si se desprecia. */
  aplicado: boolean;
}

export interface DireccionViento {
  eje: 'x' | 'y';
  /** Dimensión del edificio paralela al viento, m. */
  profundidad: number;
  /** Fachada que recibe la presión (perpendicular al viento), m. */
  anchoExpuesto: number;
  /** altura del edificio / profundidad. */
  esbeltez: number;
  cp: number;
  cs: number;
  plantas: PlantaVientoResuelta[];
  /** Suma de F de todas las plantas, kN. */
  Ftotal: number;
  /** Excentricidad en planta a considerar, m (3.3.2-2). */
  excentricidad: number;
  /** Rozamiento de esta dirección; null si no se pidió superficie. */
  rozamiento: RozamientoResuelto | null;
  /** Hastial o faldones sumados a la planta de cubierta; null con cubierta plana. */
  encima: EncimaCubierta | null;
}

/** La cubierta resuelta, con el ce de su coronación y a qué eje va la cumbrera. */
export type CubiertaResuelta = DosAguasResultado & { ce: number; cumbrera: 'x' | 'y' };

/** Los paramentos resueltos, con el ce de la altura del edificio. */
export type ParamentosResueltos = ParamentosResultado & { ce: number };

export interface VientoResultado {
  qb: number;
  qbOrigen: OrigenQb;
  /** Velocidad básica de la zona, m/s. `null` con qb tecleado que no sea el de una zona. */
  vb: number | null;
  aspereza: GradoAspereza;
  parametros: { k: number; L: number; Z: number };
  /** Altura del último forjado sobre rasante, m. */
  H: number;
  /** Altura del edificio, m: la coronación con cubierta inclinada, el último forjado sin ella. Es la h de la esbeltez y de las figuras del Anejo D. */
  alturaEdificio: number;
  x: DireccionViento;
  y: DireccionViento;
  /** Presiones por zonas de la cubierta a dos aguas (Anejo D.6); null con cubierta plana. */
  cubierta: CubiertaResuelta | null;
  /** Presiones por zonas de las fachadas (tabla D.3); null si no se piden. */
  paramentos: ParamentosResueltos | null;
  /** Recordatorios normativos que van a la memoria tal cual. */
  notas: string[];
  /** Cosas que el usuario debe mirar; no bloquean. */
  avisos: string[];
  /** Fuera del ámbito del DB o entrada inválida; bloquean la exportación. */
  errores: string[];
}

// ── Piezas ──────────────────────────────────────────────────────────────────

/** Fórmula D.1: qb = 0,5 · δ · vb², en kN/m² (vb en m/s, δ en kg/m³). */
export function presionDinamicaDesdeVelocidad(vb: number): number {
  return (0.5 * DENSIDAD_AIRE * vb * vb) / 1000;
}

/** Fórmulas D.2 y D.3: coeficiente de exposición a la altura z (m). */
export function coeficienteExposicion(z: number, aspereza: GradoAspereza): number {
  const { k, L, Z } = ASPEREZAS[aspereza];
  const F = k * Math.log(Math.max(z, Z) / L);
  return F * (F + 7 * k);
}

/** Tabla 3.5 interpolada: coeficientes eólicos de presión y succión para una esbeltez. */
export function coeficientesEolicos(esbeltez: number): { cp: number; cs: number } {
  return {
    cp: interpolar(esbeltez, TABLA_3_5.esbeltez, TABLA_3_5.cp),
    cs: interpolar(esbeltez, TABLA_3_5.esbeltez, TABLA_3_5.cs),
  };
}

/** Fuerza horizontal en un forjado, kN: banda tributaria × fachada × (cp − cs) × qe. */
export function fuerzaPlanta(hTrib: number, anchoExpuesto: number, cp: number, cs: number, qe: number): number {
  return hTrib * anchoExpuesto * (cp - cs) * qe;
}

/**
 * Altura tributaria de cada forjado: media planta por debajo y media por
 * encima. La banda entre la rasante y la mitad de la primera planta va a la
 * cimentación, no a ningún forjado; la cubierta sólo recibe la mitad de abajo.
 * Las alturas deben venir ORDENADAS y ser crecientes.
 */
export function alturasTributarias(alturas: number[]): number[] {
  return alturas.map((h, i) => {
    const inferior = (h - (i === 0 ? 0 : alturas[i - 1])) / 2;
    const superior = i === alturas.length - 1 ? 0 : (alturas[i + 1] - h) / 2;
    return inferior + superior;
  });
}

/**
 * Fuerza del hastial con viento paralelo a la cumbrera, kN: el triángulo de
 * fachada entre el último forjado y la coronación, con los coeficientes
 * globales de la tabla 3.5 de esa dirección y qe a la coronación.
 */
export function fuerzaHastial(ancho: number, altura: number, cp: number, cs: number, qe: number): number {
  return ((ancho * altura) / 2) * (cp - cs) * qe;
}

// ── Cálculo ─────────────────────────────────────────────────────────────────

function resolverQb(input: VientoInput): { qb: number; origen: OrigenQb; vb: number | null } {
  const zona = ZONAS_EOLICAS[input.zona];
  if (input.qbManual === undefined) return { qb: zona.qb, origen: 'zona', vb: zona.vb };
  if (input.qbManual === QB_SIMPLIFICADO) return { qb: QB_SIMPLIFICADO, origen: 'simplificado', vb: null };
  return { qb: input.qbManual, origen: 'manual', vb: input.qbManual === zona.qb ? zona.vb : null };
}

interface PlantaBase {
  id?: string;
  nombre: string;
  z: number;
  hTrib: number;
  ce: number;
}

/**
 * Una dirección: cp y cs por la esbeltez del edificio, la fuerza de la banda
 * de cada forjado y, si se pide, el rozamiento del art. 3.3.2-3 sobre las dos
 * fachadas paralelas al viento (por bandas, con el qe de cada planta) y la
 * cubierta (d · b, con el qe del último forjado). Si el rozamiento pasa del
 * 10 % de la fuerza perpendicular se suma planta a planta; si no, se anota y
 * se desprecia, como permite la norma.
 */
function direccion(
  eje: 'x' | 'y',
  profundidad: number,
  anchoExpuesto: number,
  alturaEdificio: number,
  qb: number,
  plantas: PlantaBase[],
  superficie: SuperficieExterior | undefined,
): DireccionViento {
  const esbeltez = profundidad > 0 ? alturaEdificio / profundidad : 0;
  const { cp, cs } = coeficientesEolicos(esbeltez);
  const resueltas: PlantaVientoResuelta[] = plantas.map((p) => {
    const qe = qb * p.ce;
    const Fbanda = fuerzaPlanta(p.hTrib, anchoExpuesto, cp, cs, qe);
    return { ...p, qe, presion: qe * cp, succion: qe * cs, Fbanda, Frozamiento: 0, Fencima: 0, F: Fbanda };
  });

  let rozamiento: RozamientoResuelto | null = null;
  if (superficie && resueltas.length > 0) {
    const { cfr } = ROZAMIENTO[superficie];
    const ultima = resueltas.length - 1;
    const areas = resueltas.map((p, i) => 2 * profundidad * p.hTrib + (i === ultima ? profundidad * anchoExpuesto : 0));
    const porPlanta = resueltas.map((p, i) => cfr * p.qe * areas[i]);
    const F = porPlanta.reduce((s, f) => s + f, 0);
    const Fperpendicular = resueltas.reduce((s, p) => s + p.Fbanda, 0);
    const fraccion = Fperpendicular > 0 ? F / Fperpendicular : 0;
    const aplicado = fraccion > ROZAMIENTO_DESPRECIABLE;
    if (aplicado) {
      resueltas.forEach((p, i) => {
        p.Frozamiento = porPlanta[i];
        p.F += porPlanta[i];
      });
    }
    rozamiento = { superficie, cfr, area: areas.reduce((s, a) => s + a, 0), F, fraccion, aplicado };
  }

  return {
    eje,
    profundidad,
    anchoExpuesto,
    esbeltez,
    cp,
    cs,
    plantas: resueltas,
    Ftotal: resueltas.reduce((s, p) => s + p.F, 0),
    excentricidad: EXCENTRICIDAD_VIENTO * anchoExpuesto,
    rozamiento,
    encima: null,
  };
}

/** Suma a la planta de cubierta lo que hay por encima del último forjado y lo deja anotado en la dirección. */
function sumarEncima(d: DireccionViento, encima: EncimaCubierta): void {
  const cubierta = d.plantas[d.plantas.length - 1];
  if (!cubierta) return;
  cubierta.Fencima += encima.F;
  cubierta.F += encima.F;
  d.Ftotal += encima.F;
  d.encima = encima;
}

export function calcularViento(input: VientoInput): VientoResultado {
  const errores: string[] = [];
  const avisos: string[] = [];
  const notas: string[] = [];

  if (input.altitud !== undefined && input.altitud > ALTITUD_MAX_VIENTO) {
    errores.push(
      `El DB SE-AE no es aplicable por encima de ${ALTITUD_MAX_VIENTO} m de altitud (art. 3.3.1-2): las presiones se establecen con datos empíricos.`,
    );
  }
  if (!(input.dimensiones.x > 0) || !(input.dimensiones.y > 0)) {
    errores.push('Las dimensiones en planta tienen que ser mayores que cero.');
  }
  if (input.qbManual !== undefined && !(input.qbManual > 0)) {
    errores.push('La presión dinámica tecleada tiene que ser mayor que cero.');
  }

  // Plantas ordenadas por altura, como hace sismo: la posición en la lista no
  // es fiable, la altura sí.
  const ordenadas = [...input.plantas]
    .map((p, i) => ({ ...p, nombre: p.nombre ?? `Planta ${i + 1}` }))
    .sort((a, b) => a.h - b.h);
  if (ordenadas.length === 0) {
    errores.push('Hace falta al menos una planta con su altura sobre rasante.');
  }
  for (let i = 0; i < ordenadas.length; i++) {
    const p = ordenadas[i];
    if (!(p.h > 0)) errores.push(`«${p.nombre}»: la altura sobre rasante tiene que ser mayor que cero.`);
    if (i > 0 && p.h === ordenadas[i - 1].h) {
      errores.push(`«${p.nombre}» y «${ordenadas[i - 1].nombre}» están a la misma altura.`);
    }
  }

  const H = ordenadas.length ? ordenadas[ordenadas.length - 1].h : 0;
  // Con cubierta inclinada el edificio llega hasta la coronación: es la h de
  // la esbeltez (tabla 3.5) y de las figuras D.3 y D.6. Una coronación por
  // debajo del último forjado es un error que se da más abajo; aquí no se
  // deja que rebaje el edificio.
  const coronacion = input.cubierta?.alturaCoronacion;
  const alturaEdificio = coronacion !== undefined && coronacion > H ? coronacion : H;
  if (alturaEdificio > Z_MAX_ANEJO_D) {
    avisos.push(`La fórmula del Anejo D.2 está dada para alturas de hasta ${Z_MAX_ANEJO_D} m; el edificio tiene ${alturaEdificio} m.`);
  }

  const { qb, origen, vb } = resolverQb(input);
  const hTrib = alturasTributarias(ordenadas.map((p) => p.h));
  const base: PlantaBase[] = ordenadas.map((p, i) => ({
    ...(p.id !== undefined ? { id: p.id } : {}),
    nombre: p.nombre,
    z: p.h,
    hTrib: hTrib[i],
    ce: coeficienteExposicion(p.h, input.aspereza),
  }));

  const x = direccion('x', input.dimensiones.x, input.dimensiones.y, alturaEdificio, qb, base, input.superficie);
  const y = direccion('y', input.dimensiones.y, input.dimensiones.x, alturaEdificio, qb, base, input.superficie);

  for (const d of [x, y]) {
    if (d.esbeltez > ESBELTEZ_MAX) {
      errores.push(
        `Esbeltez ${d.esbeltez.toFixed(2)} según ${d.eje.toUpperCase()}: el DB no cubre esbelteces mayores de ${ESBELTEZ_MAX} (art. 3.3.1-3), hay que considerar los efectos dinámicos.`,
      );
    }
    if (d.rozamiento?.aplicado) {
      avisos.push(
        `Según ${d.eje.toUpperCase()} el rozamiento es el ${Math.round(d.rozamiento.fraccion * 100)} % de la fuerza perpendicular, más del ${ROZAMIENTO_DESPRECIABLE * 100} % que permite despreciar el art. 3.3.2-3: está sumado a las fuerzas por planta.`,
      );
    }
  }

  // La cubierta a dos aguas: ce a su coronación, y la cumbrera decide qué
  // lado del edificio es b y cuál d en cada dirección de la tabla D.6. Lo que
  // hay por encima del último forjado se suma a la planta de cubierta: el
  // hastial en la dirección paralela a la cumbrera y la resultante de los
  // faldones en la perpendicular.
  let cubierta: CubiertaResuelta | null = null;
  if (input.cubierta) {
    const c = input.cubierta;
    const ce = coeficienteExposicion(c.alturaCoronacion, input.aspereza);
    const qeCoronacion = qb * ce;
    const r = calcularDosAguas({
      pendiente: c.pendiente,
      alturaCoronacion: c.alturaCoronacion,
      longitudCumbrera: input.dimensiones[c.cumbrera],
      anchoCubierta: input.dimensiones[c.cumbrera === 'x' ? 'y' : 'x'],
      qe: qeCoronacion,
      ...(c.areaInfluencia !== undefined ? { areaInfluencia: c.areaInfluencia } : {}),
    });
    if (H > 0 && c.alturaCoronacion < H) {
      r.errores.push(`La coronación de la cubierta (${c.alturaCoronacion} m) está por debajo del último forjado (${H} m).`);
    }
    errores.push(...r.errores);
    avisos.push(...r.avisos);
    cubierta = { ...r, ce, cumbrera: c.cumbrera };

    const altura = c.alturaCoronacion - H;
    if (altura > 0) {
      const paralela = c.cumbrera === 'x' ? x : y;
      const perpendicular = c.cumbrera === 'x' ? y : x;
      sumarEncima(paralela, {
        tipo: 'hastial',
        ancho: paralela.anchoExpuesto,
        altura,
        area: (paralela.anchoExpuesto * altura) / 2,
        z: c.alturaCoronacion,
        ce,
        qe: qeCoronacion,
        coeficiente: paralela.cp - paralela.cs,
        F: fuerzaHastial(paralela.anchoExpuesto, altura, paralela.cp, paralela.cs, qeCoronacion),
      });
      const res = r.perpendicular.resultante;
      if (res && res.area > 0) {
        sumarEncima(perpendicular, {
          tipo: 'faldones',
          ancho: r.perpendicular.b,
          altura,
          area: res.area,
          z: c.alturaCoronacion,
          ce,
          qe: qeCoronacion,
          coeficiente: qeCoronacion > 0 ? res.haciaSotavento / (qeCoronacion * res.area) : 0,
          F: res.haciaSotavento,
          Fcontraria: res.haciaBarlovento,
        });
      }
    }
  }

  // Los paramentos: h es la del edificio (la coronación si hay cubierta
  // inclinada) y las áreas se miden hasta el último forjado, salvo los
  // hastiales, que llevan su triángulo.
  let paramentos: ParamentosResueltos | null = null;
  if (input.paramentos) {
    const ce = coeficienteExposicion(alturaEdificio, input.aspereza);
    const r = calcularParamentos({
      h: alturaEdificio,
      alturaFachada: H,
      dimensiones: input.dimensiones,
      qe: qb * ce,
      ...(input.cubierta ? { cumbrera: input.cubierta.cumbrera } : {}),
      ...(input.paramentos.areaInfluencia !== undefined ? { areaInfluencia: input.paramentos.areaInfluencia } : {}),
    });
    errores.push(...r.errores);
    avisos.push(...r.avisos);
    paramentos = { ...r, ce };
  }

  if (origen === 'simplificado') {
    notas.push('Presión dinámica simplificada de 0,5 kN/m², válida en cualquier punto del territorio (art. 3.3.2-1).');
  }
  notas.push(
    'Coeficientes eólicos globales de la tabla 3.5, aplicados a la proyección del edificio sobre un plano perpendicular al viento (art. 3.3.4-1). La tabla es para edificios de pisos con forjados que conectan todas las fachadas a intervalos regulares, huecos pequeños practicables o herméticos y compartimentación interior; en naves y construcciones diáfanas la acción se individualiza por elemento (art. 3.3.5).',
    'Cada forjado recibe la banda de media planta por debajo y media por encima; la banda entre la rasante y la mitad de la planta baja va directamente a la cimentación, y la cubierta sólo recibe la media planta inferior: petos y casetones se añaden a mano.',
    `La acción se considera aplicada con una excentricidad del ${EXCENTRICIDAD_VIENTO * 100} % de la dimensión máxima perpendicular al viento, del lado desfavorable (art. 3.3.2-2), y en los dos sentidos de cada dirección.`,
    'El grado de aspereza es el del entorno en la dirección de viento analizada (art. 3.3.3-3); aquí se toma el mismo para las dos. Cerca de acantilados o escarpas de más de 40º la altura se mide desde su base (art. 3.3.3-2).',
  );
  if (input.superficie) {
    const s = ROZAMIENTO[input.superficie];
    notas.push(
      `Rozamiento (art. 3.3.2-3): coeficiente ${s.cfr.toFixed(2).replace('.', ',')} de superficie ${s.descripcion}, sobre las dos fachadas paralelas al viento y la cubierta. Cuando supera el ${ROZAMIENTO_DESPRECIABLE * 100} % de la fuerza perpendicular se reparte entre las plantas en proporción a su banda (la cubierta recibe además el de la propia cubierta); si no, se desprecia como permite la norma.`,
    );
  }
  if (cubierta) {
    notas.push(
      ...cubierta.notas,
      'El forjado de cubierta recibe además lo que hay por encima del último forjado: con viento paralelo a la cumbrera, el hastial (triángulo hasta la coronación, con los coeficientes globales de la tabla 3.5 de esa dirección y qb·ce a la coronación); con viento perpendicular, la resultante horizontal de las presiones de la tabla D.6 sobre los faldones (Σ cpe·A·tan α, barlovento en presión y sotavento en succión).',
    );
  } else {
    notas.push('En cubierta plana la acción del viento, generalmente de succión, opera del lado de la seguridad y se puede despreciar (art. 3.3.4-2).');
  }
  if (paramentos) notas.push(...paramentos.notas);

  return {
    qb,
    qbOrigen: origen,
    vb,
    aspereza: input.aspereza,
    parametros: { k: ASPEREZAS[input.aspereza].k, L: ASPEREZAS[input.aspereza].L, Z: ASPEREZAS[input.aspereza].Z },
    H,
    alturaEdificio,
    x,
    y,
    cubierta,
    paramentos,
    notas,
    avisos,
    errores,
  };
}
