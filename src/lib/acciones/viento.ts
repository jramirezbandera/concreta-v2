/**
 * Acción del viento sobre un edificio de pisos (DB SE-AE art. 3.3 y Anejo D).
 *
 *   qe = qb · ce(z) · cp                                            (3.1)
 *   ce = F · (F + 7k),  F = k · ln(max(z, Z) / L)                   (D.2, D.3)
 *
 * Lo que entra es lo que el usuario sabe de su edificio: zona eólica (o qb a
 * mano), entorno, alturas de los forjados y dimensiones en planta. Lo que sale
 * es lo que se lleva al programa de cálculo: una FUERZA POR PLANTA en cada
 * dirección, F_k = (cp − cs) · qe(z_k) · b · h_trib,k.
 *
 * Decisiones (2026-09-04):
 *  - ce por planta, a la altura de cada forjado, con la fórmula del Anejo D.2
 *    (D-VN3). La tabla 3.4 es esa fórmula redondeada; se usa sólo para probar.
 *  - cp y cs interpolados en la tabla 3.5 (D-VN2), como la macro del estudio.
 *  - Altura tributaria: media planta por debajo y media por encima; la
 *    cubierta sólo recibe la mitad de abajo (petos y casetones, a mano).
 *
 * Convención de direcciones: «viento según X» es el que sopla paralelo al eje
 * X. Su esbeltez es H / (dimensión en X) —el plano paralelo al viento, como
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
  TABLA_3_5,
  Z_MAX_ANEJO_D,
  ZONAS_EOLICAS,
  type GradoAspereza,
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
  /** Fuerza horizontal en el forjado, kN: (cp − cs) · qe · b · hTrib. */
  F: number;
}

export interface DireccionViento {
  eje: 'x' | 'y';
  /** Dimensión del edificio paralela al viento, m. */
  profundidad: number;
  /** Fachada que recibe la presión (perpendicular al viento), m. */
  anchoExpuesto: number;
  /** H / profundidad. */
  esbeltez: number;
  cp: number;
  cs: number;
  plantas: PlantaVientoResuelta[];
  /** Suma de F de todas las plantas, kN. */
  Ftotal: number;
  /** Excentricidad en planta a considerar, m (3.3.2-2). */
  excentricidad: number;
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
  /** Altura de coronación sobre rasante, m. */
  H: number;
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

// ── Cálculo ─────────────────────────────────────────────────────────────────

function resolverQb(input: VientoInput): { qb: number; origen: OrigenQb; vb: number | null } {
  const zona = ZONAS_EOLICAS[input.zona];
  if (input.qbManual === undefined) return { qb: zona.qb, origen: 'zona', vb: zona.vb };
  if (input.qbManual === QB_SIMPLIFICADO) return { qb: QB_SIMPLIFICADO, origen: 'simplificado', vb: null };
  return { qb: input.qbManual, origen: 'manual', vb: input.qbManual === zona.qb ? zona.vb : null };
}

function direccion(
  eje: 'x' | 'y',
  profundidad: number,
  anchoExpuesto: number,
  H: number,
  qb: number,
  plantas: { id?: string; nombre: string; z: number; hTrib: number; ce: number }[],
): DireccionViento {
  const esbeltez = profundidad > 0 ? H / profundidad : 0;
  const { cp, cs } = coeficientesEolicos(esbeltez);
  const resueltas = plantas.map((p) => {
    const qe = qb * p.ce;
    return {
      ...p,
      qe,
      presion: qe * cp,
      succion: qe * cs,
      F: fuerzaPlanta(p.hTrib, anchoExpuesto, cp, cs, qe),
    };
  });
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
  };
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
  if (input.dimensiones.x <= 0 || input.dimensiones.y <= 0) {
    errores.push('Las dimensiones en planta tienen que ser mayores que cero.');
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
  if (H > Z_MAX_ANEJO_D) {
    avisos.push(`La fórmula del Anejo D.2 está dada para alturas de hasta ${Z_MAX_ANEJO_D} m; el edificio tiene ${H} m.`);
  }

  const { qb, origen, vb } = resolverQb(input);
  const hTrib = alturasTributarias(ordenadas.map((p) => p.h));
  const base = ordenadas.map((p, i) => ({
    ...(p.id !== undefined ? { id: p.id } : {}),
    nombre: p.nombre,
    z: p.h,
    hTrib: hTrib[i],
    ce: coeficienteExposicion(p.h, input.aspereza),
  }));

  const x = direccion('x', input.dimensiones.x, input.dimensiones.y, H, qb, base);
  const y = direccion('y', input.dimensiones.y, input.dimensiones.x, H, qb, base);

  for (const d of [x, y]) {
    if (d.esbeltez > ESBELTEZ_MAX) {
      errores.push(
        `Esbeltez ${d.esbeltez.toFixed(2)} según ${d.eje.toUpperCase()}: el DB no cubre esbelteces mayores de ${ESBELTEZ_MAX} (art. 3.3.1-3), hay que considerar los efectos dinámicos.`,
      );
    }
  }

  // La cubierta a dos aguas: ce a su coronación, y la cumbrera decide qué
  // lado del edificio es b y cuál d en cada dirección de la tabla D.6.
  let cubierta: CubiertaResuelta | null = null;
  if (input.cubierta) {
    const c = input.cubierta;
    const ce = coeficienteExposicion(c.alturaCoronacion, input.aspereza);
    const r = calcularDosAguas({
      pendiente: c.pendiente,
      alturaCoronacion: c.alturaCoronacion,
      longitudCumbrera: input.dimensiones[c.cumbrera],
      anchoCubierta: input.dimensiones[c.cumbrera === 'x' ? 'y' : 'x'],
      qe: qb * ce,
      ...(c.areaInfluencia !== undefined ? { areaInfluencia: c.areaInfluencia } : {}),
    });
    if (H > 0 && c.alturaCoronacion < H) {
      r.errores.push(`La coronación de la cubierta (${c.alturaCoronacion} m) está por debajo del último forjado (${H} m).`);
    }
    errores.push(...r.errores);
    avisos.push(...r.avisos);
    cubierta = { ...r, ce, cumbrera: c.cumbrera };
  }

  // Los paramentos: h es la del edificio (la coronación si hay cubierta
  // inclinada) y las áreas se miden hasta el último forjado.
  let paramentos: ParamentosResueltos | null = null;
  if (input.paramentos) {
    const h = input.cubierta ? input.cubierta.alturaCoronacion : H;
    const ce = coeficienteExposicion(h, input.aspereza);
    const r = calcularParamentos({
      h,
      alturaFachada: H,
      dimensiones: input.dimensiones,
      qe: qb * ce,
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
    'Coeficientes eólicos globales de la tabla 3.5, aplicados a la proyección del edificio sobre un plano perpendicular al viento (art. 3.3.4-1).',
    `La acción se considera aplicada con una excentricidad del ${EXCENTRICIDAD_VIENTO * 100} % de la dimensión máxima perpendicular al viento, del lado desfavorable (art. 3.3.2-2).`,
  );
  if (cubierta) {
    notas.push(
      ...cubierta.notas,
      'La fuerza por planta recoge las fachadas: la resultante del viento sobre los faldones (tabla D.6) no está incluida y se lleva aparte a la estructura de cubierta.',
    );
  } else {
    notas.push('En cubierta plana la acción del viento, generalmente de succión, opera del lado de la seguridad y se puede despreciar (art. 3.3.4-2).');
  }
  if (paramentos) notas.push(...paramentos.notas);
  notas.push('La cubierta recibe sólo la media planta inferior: petos y casetones se añaden a mano.');

  return {
    qb,
    qbOrigen: origen,
    vb,
    aspereza: input.aspereza,
    parametros: { k: ASPEREZAS[input.aspereza].k, L: ASPEREZAS[input.aspereza].L, Z: ASPEREZAS[input.aspereza].Z },
    H,
    x,
    y,
    cubierta,
    paramentos,
    notas,
    avisos,
    errores,
  };
}
