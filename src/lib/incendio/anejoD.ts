/**
 * Cuánto aguanta un elemento de acero: Anejo D del DB SI.
 *
 * El anejo del acero no contesta lo mismo que el del hormigón. Allí la sección
 * aguanta sola y la tabla dice hasta dónde; aquí la tabla D.1 dice DE CUÁNTO
 * AISLAMIENTO hay que revestirla, porque un perfil desnudo no llega a R 30 más
 * que en una esquina de la tabla —masividad de 30 m⁻¹ y poca carga—. Por eso lo
 * que se devuelve es el `d/λp` necesario, y el «alcanza» del perfil desnudo casi
 * siempre es «nada».
 *
 * La tabla D.1 está construida con CELDAS COMBINADAS VERTICALMENTE: un mismo
 * valor cubre varias filas de Am/V. Extraer su texto del PDF da una tabla mal
 * alineada y silenciosamente equivocada. Esta transcripción se reconstruyó a
 * partir de las líneas de la propia rejilla del PDF (página 70 del DB SI) y se
 * cotejó celda a celda contra la página rasterizada. Si alguna vez hay que
 * tocarla, hágase igual: `pdftotext` no vale aquí.
 */

import { STEEL_PROFILES } from '../../data/steelProfiles';
import { CLASES_R, type ClaseR } from './anejoC';

const n2 = (v: number) => v.toFixed(2).replace('.', ',');
/** Un número tal cual, con la coma decimal de aquí. */
const nd = (v: number) => v.toString().replace('.', ',');

/** La mayor clase tabulada que unos minutos declarados cubren. */
const claseCubierta = (min: number): ClaseR | null =>
  [...CLASES_R].reverse().find((c) => c <= min) ?? null;

// ── Tabla D.1 · Coeficiente de protección d/λp (m²K/W) de vigas y tirantes ──

/** Las masividades tabuladas, en m⁻¹. */
export const MASIVIDADES_D1 = [30, 50, 100, 150, 200, 250, 300] as const;

/**
 * Las tres columnas son BANDAS de μfi, no valores, y no hay columna para
 * μfi ≥ 0,70: por encima de ahí la tabla no dice nada y no se extrapola.
 */
export type BandaMufi = '0,70>μfi≥0,60' | '0,60>μfi≥0,50' | '0,50>μfi≥0,40';

export const BANDAS_MUFI: readonly BandaMufi[] = ['0,70>μfi≥0,60', '0,60>μfi≥0,50', '0,50>μfi≥0,40'];

/** `null` = la tabla no da valor («-»): esa combinación no se resuelve así. */
type FilaD1 = readonly [number, number | null, number | null, number | null];

export const TABLA_D1: Record<ClaseR, readonly FilaD1[]> = {
  30: [
    [30, 0.05, 0.0, 0.0],
    [50, 0.05, 0.05, 0.05],
    [100, 0.05, 0.05, 0.05],
    [150, 0.05, 0.05, 0.05],
    [200, 0.05, 0.05, 0.05],
    [250, 0.1, 0.1, 0.05],
    [300, 0.1, 0.1, 0.05],
  ],
  60: [
    [30, 0.05, 0.05, 0.05],
    [50, 0.05, 0.05, 0.05],
    [100, 0.1, 0.1, 0.1],
    [150, 0.1, 0.1, 0.1],
    [200, 0.15, 0.1, 0.1],
    [250, 0.15, 0.15, 0.1],
    [300, 0.15, 0.15, 0.1],
  ],
  90: [
    [30, 0.05, 0.05, 0.05],
    [50, 0.15, 0.1, 0.05],
    [100, 0.15, 0.1, 0.1],
    [150, 0.15, 0.15, 0.15],
    [200, 0.15, 0.15, 0.15],
    [250, 0.2, 0.15, 0.15],
    [300, 0.2, 0.2, 0.15],
  ],
  120: [
    [30, 0.1, 0.05, 0.05],
    [50, 0.1, 0.1, 0.1],
    [100, 0.15, 0.15, 0.15],
    [150, 0.2, 0.2, 0.15],
    [200, 0.2, 0.2, 0.2],
    [250, 0.25, 0.2, 0.2],
    [300, 0.25, 0.25, 0.2],
  ],
  180: [
    [30, 0.1, 0.1, 0.1],
    [50, 0.15, 0.15, 0.15],
    [100, 0.25, 0.2, 0.2],
    [150, 0.25, 0.25, 0.25],
    [200, 0.3, 0.25, 0.25],
    [250, 0.3, 0.3, 0.25],
    [300, 0.3, 0.3, 0.3],
  ],
  240: [
    [30, 0.15, 0.15, 0.1],
    [50, 0.2, 0.2, 0.15],
    [100, 0.3, 0.25, 0.25],
    [150, null, 0.3, 0.3],
    [200, null, null, 0.3],
    [250, null, null, null],
    [300, null, null, null],
  ],
};

/** El μfi por encima del cual la tabla D.1 no tiene columna. */
export const MUFI_MAX_D1 = 0.7;
/** Y el de la banda menos exigente tabulada. */
export const MUFI_MIN_D1 = 0.4;

/**
 * Qué columna le toca a un μfi.
 *
 * Sin μfi declarado se toma la más exigente de las tres, que es la decisión
 * segura: la tabla se hizo para elementos cargados, y suponer que el nuestro va
 * holgado sin haberlo comprobado rebaja el aislamiento en obra.
 */
export function bandaDeMufi(mufi: number | null): { indice: 0 | 1 | 2 | null; banda: BandaMufi | null; aviso: string | null } {
  if (mufi === null) {
    return {
      indice: 0,
      banda: BANDAS_MUFI[0],
      aviso: 'Sin coeficiente de sobredimensionado se toma la columna más exigente de la tabla D.1 (0,70 > μfi ≥ 0,60).',
    };
  }
  // Cero o menos no es un μfi: es una casilla mal tecleada. Se trata como si
  // no estuviera, que es lo que hará `normalizar` al releer el estado; si
  // entrara en las comparaciones de abajo caería en la banda MENOS exigente.
  if (mufi <= 0) {
    return {
      indice: 0,
      banda: BANDAS_MUFI[0],
      aviso: `μfi = ${n2(mufi)} no es un coeficiente de sobredimensionado: se toma la columna más exigente de la tabla D.1 (0,70 > μfi ≥ 0,60), como si no se hubiera tecleado.`,
    };
  }
  if (mufi >= MUFI_MAX_D1) {
    return {
      indice: null,
      banda: null,
      aviso: `Con μfi = ${n2(mufi)} la tabla D.1 no aplica: su columna más desfavorable llega a 0,70 y no se extrapola. Hay que ir al método general del DB SI (D.2.2.1.3, con ky,θ y kλ,θ de la tabla D.2) o a ensayo.`,
    };
  }
  if (mufi >= 0.6) return { indice: 0, banda: BANDAS_MUFI[0], aviso: null };
  if (mufi >= 0.5) return { indice: 1, banda: BANDAS_MUFI[1], aviso: null };
  if (mufi >= MUFI_MIN_D1) return { indice: 2, banda: BANDAS_MUFI[2], aviso: null };
  return {
    indice: 2,
    banda: BANDAS_MUFI[2],
    aviso: `Con μfi = ${n2(mufi)} se usa la banda menos exigente tabulada (0,50 > μfi ≥ 0,40): por debajo de 0,40 la tabla D.1 no baja más.`,
  };
}

/** La fila de la tabla: la siguiente masividad tabulada hacia arriba. */
export function filaDeMasividad(amv: number): number | null {
  return MASIVIDADES_D1.find((m) => m >= amv) ?? null;
}

// ── La masividad ────────────────────────────────────────────────────────────

/**
 * Cómo se calienta el perfil, que es lo que fija la superficie expuesta.
 *
 * «Contorno» es el revestimiento que sigue la forma del perfil —una pintura,
 * un mortero proyectado—; «cajón» el que lo envuelve en una caja recta —placas
 * de yeso—, y expone bastante menos superficie. Y «tres caras» es la viga con
 * el forjado encima, que es el caso normal.
 */
export type ModoCalentamiento = 'contorno4' | 'contorno3' | 'cajon4' | 'cajon3';

export const MODOS_CALENTAMIENTO: readonly { id: ModoCalentamiento; etiqueta: string }[] = [
  { id: 'contorno3', etiqueta: 'Siguiendo el contorno, tres caras (con forjado encima)' },
  { id: 'contorno4', etiqueta: 'Siguiendo el contorno, cuatro caras' },
  { id: 'cajon3', etiqueta: 'En cajón, tres caras (con forjado encima)' },
  { id: 'cajon4', etiqueta: 'En cajón, cuatro caras' },
];

const ETIQUETA_MODO = new Map(MODOS_CALENTAMIENTO.map((m) => [m.id, m.etiqueta]));

export interface Masividad {
  /** m⁻¹. */
  amv: number;
  /** La cuenta escrita, para el documento. */
  cuenta: string;
}

/**
 * Am/V de un perfil en I o H, por el modo de calentamiento.
 *
 * `Am` es el perímetro expuesto por unidad de longitud y `V` el área de la
 * sección, así que Am/V [m⁻¹] = 10 · Am[mm] / A[cm²].
 *
 * Los acuerdos alma-ala se desprecian, lo que agranda ligeramente el perímetro
 * y por tanto la masividad: queda del lado de la seguridad, que es donde tiene
 * que quedar un dato que decide el espesor de un revestimiento.
 */
export function masividadDePerfil(
  p: { h: number; b: number; tw: number; A: number },
  modo: ModoCalentamiento,
): Masividad {
  const { h, b, tw, A } = p;
  const am =
    modo === 'contorno4'
      ? 4 * b + 2 * h - 2 * tw
      : modo === 'contorno3'
        ? 3 * b + 2 * h - 2 * tw
        : modo === 'cajon4'
          ? 2 * (h + b)
          : 2 * h + b;
  const formula =
    modo === 'contorno4'
      ? `4·${nd(b)} + 2·${nd(h)} − 2·${nd(tw)}`
      : modo === 'contorno3'
        ? `3·${nd(b)} + 2·${nd(h)} − 2·${nd(tw)}`
        : modo === 'cajon4'
          ? `2·(${nd(h)} + ${nd(b)})`
          : `2·${nd(h)} + ${nd(b)}`;
  const amv = (10 * am) / A;
  return {
    amv: Math.round(amv),
    cuenta: `Am = ${formula} = ${Math.round(am)} mm; Am/V = 10·${Math.round(am)} / ${nd(A)} = ${Math.round(amv)} m⁻¹`,
  };
}

/** Los perfiles del catálogo, por su rótulo («IPE 300»). */
export function perfilPorRotulo(label: string) {
  return STEEL_PROFILES.find((p) => p.label === label);
}

export const ROTULOS_PERFIL: readonly string[] = STEEL_PROFILES.map((p) => p.label);

// ── Lo que se teclea ────────────────────────────────────────────────────────

export type TipoAcero = 'viga' | 'tirante' | 'soporte';

export const TIPOS_ACERO: readonly { id: TipoAcero; etiqueta: string }[] = [
  { id: 'viga', etiqueta: 'Viga arriostrada lateralmente' },
  { id: 'tirante', etiqueta: 'Tirante' },
  { id: 'soporte', etiqueta: 'Soporte' },
];

export interface EntradaAcero {
  tipo: TipoAcero;
  /** Rótulo del perfil del catálogo. `''` = masividad tecleada. */
  perfil: string;
  modo: ModoCalentamiento;
  /** m⁻¹. Tecleada; pisa la del perfil. */
  masividadManual: number | null;
  mufi: number | null;
  /** Sección de pared delgada (clase 4): el D.1.4 le pone tope de 350 ºC. */
  clase4: boolean;
  /** Soporte que cumple las condiciones del D.2.2.1.2 para ir por la D.1. */
  arriostrado: boolean;
  /** Soporte revestido de fábrica en todo el contorno expuesto (D.2.2.1.1). */
  revestidoFabrica: boolean;
  /** min. La resistencia al fuego de ese elemento de fábrica. */
  rFabrica: number | null;
}

export function entradaAceroInicial(): EntradaAcero {
  return {
    tipo: 'viga',
    perfil: '',
    modo: 'contorno3',
    masividadManual: null,
    mufi: null,
    clase4: false,
    arriostrado: true,
    revestidoFabrica: false,
    rFabrica: null,
  };
}

// ── La comprobación ─────────────────────────────────────────────────────────

export interface ResultadoAcero {
  /** m⁻¹. */
  masividad: number | null;
  cuentaMasividad: string;
  /** La fila de la tabla que se ha usado. */
  filaAmV: number | null;
  banda: BandaMufi | null;
  /** La mayor clase que aguanta el perfil DESNUDO (d/λp = 0,00). */
  alcanzaDesnudo: ClaseR | null;
  /** La clase tabulada con la que se ha entrado en la tabla. */
  claseComprobada: ClaseR | null;
  /** m²K/W necesarios para esa clase. `0` = el perfil desnudo ya llega. */
  dLambda: number | null;
  avisos: string[];
  faltan: string[];
}

/** El valor de la tabla D.1, o `null` si esa casilla no da valor. */
export function coeficienteD1(clase: ClaseR, amv: number, indiceBanda: 0 | 1 | 2): number | null | undefined {
  const fila = TABLA_D1[clase].find(([m]) => m === filaDeMasividad(amv));
  if (!fila) return undefined; // fuera de tabla
  return fila[indiceBanda + 1];
}

/**
 * Lo que hace falta para que un elemento de acero alcance la R que se le pide.
 *
 * `exigida` en minutos: puede no ser una clase tabulada —el Anejo B da 97— y
 * entonces se entra en la tabla por la clase inmediatamente superior.
 */
export function resistenciaAcero(e: EntradaAcero, exigida: number | null): ResultadoAcero {
  const avisos: string[] = [];
  const faltan: string[] = [];

  // La vía de la fábrica no pasa por la tabla: el D.2.2.1.1 dice, del lado de
  // la seguridad, que el soporte vale al menos lo que valga la fábrica.
  if (e.tipo === 'soporte' && e.revestidoFabrica) {
    if (e.rFabrica === null) faltan.push('la resistencia al fuego del elemento de fábrica');
    return {
      masividad: null,
      cuentaMasividad: '',
      filaAmV: null,
      banda: null,
      alcanzaDesnudo: e.rFabrica === null ? null : claseCubierta(e.rFabrica),
      claseComprobada: null,
      dLambda: e.rFabrica === null ? null : 0,
      avisos: [
        'Soporte revestido de fábrica en todo el contorno expuesto: el D.2.2.1.1 permite considerar, del lado de la seguridad, que su resistencia al fuego es al menos la del elemento de fábrica.',
      ],
      faltan,
    };
  }

  // La masividad: del perfil del catálogo o tecleada.
  let masividad: number | null = e.masividadManual;
  let cuenta = masividad === null ? '' : `Am/V = ${masividad} m⁻¹ (indicada)`;
  if (masividad === null && e.perfil !== '') {
    const p = perfilPorRotulo(e.perfil);
    if (p) {
      const m = masividadDePerfil(p, e.modo);
      masividad = m.amv;
      cuenta = `${e.perfil}, ${(ETIQUETA_MODO.get(e.modo) ?? '').toLowerCase()}. ${m.cuenta}`;
    }
  }
  if (masividad === null) faltan.push('el perfil o la masividad Am/V');

  if (e.tipo === 'soporte' && !e.arriostrado) {
    avisos.push(
      'La tabla D.1 sólo vale para soportes de estructuras arriostradas cuyo sector no abarque más de una planta y calculados con una longitud de pandeo de al menos 0,7 veces la altura entre plantas (D.2.2.1.2). Sin eso hay que ir al método general del D.2.2.1.3.',
    );
  }
  if (e.clase4) {
    avisos.push(
      'Sección de clase 4: el D.1.4 exige además que la temperatura del acero no pase de 350 ºC en ninguna sección, cosa que la tabla D.1 no comprueba.',
    );
  }

  const { indice, banda, aviso } = bandaDeMufi(e.mufi);
  if (aviso) avisos.push(aviso);

  if (faltan.length > 0 || indice === null || masividad === null) {
    return {
      masividad,
      cuentaMasividad: cuenta,
      filaAmV: null,
      banda,
      alcanzaDesnudo: null,
      claseComprobada: null,
      dLambda: null,
      avisos,
      faltan,
    };
  }

  const fila = filaDeMasividad(masividad);
  if (fila === null) {
    avisos.push(
      `La tabla D.1 llega a 300 m⁻¹ y este elemento tiene ${masividad}: queda fuera de tabla y no se extrapola. Hay que justificarlo por el marcado CE del producto de protección o por el método general.`,
    );
    return {
      masividad,
      cuentaMasividad: cuenta,
      filaAmV: null,
      banda,
      alcanzaDesnudo: null,
      claseComprobada: null,
      dLambda: null,
      avisos,
      faltan,
    };
  }

  // El perfil desnudo: sólo las casillas que la tabla marca 0,00.
  const desnudo = CLASES_R.filter((c) => coeficienteD1(c, masividad as number, indice) === 0);
  const alcanzaDesnudo = desnudo.length > 0 ? desnudo[desnudo.length - 1] : null;

  const claseComprobada = exigida === null ? null : (CLASES_R.find((c) => c >= exigida) ?? null);
  let dLambda: number | null = null;
  if (exigida !== null && claseComprobada === null) {
    avisos.push(`La tabla D.1 llega a R 240 y aquí se piden ${exigida} minutos.`);
  } else if (claseComprobada !== null) {
    const v = coeficienteD1(claseComprobada, masividad, indice) ?? null;
    if (v === null) {
      avisos.push(
        `Para R ${claseComprobada} con Am/V = ${masividad} m⁻¹ y ${banda} la tabla D.1 no da valor: esa combinación no se resuelve con revestimiento por esta vía. Hay que bajar la masividad —un perfil mayor o un cajón en vez del contorno— o justificarlo por ensayo.`,
      );
    } else {
      dLambda = v;
      if (v === 0) {
        avisos.push('El perfil desnudo llega a esta clase sin revestir (llamada 1 de la tabla D.1).');
      }
    }
  }

  if (alcanzaDesnudo === null) {
    avisos.push(
      'El perfil desnudo no alcanza ni R 30 por la tabla D.1: la resistencia al fuego de este elemento depende enteramente de su revestimiento.',
    );
  }

  return {
    masividad,
    cuentaMasividad: cuenta,
    filaAmV: fila,
    banda,
    alcanzaDesnudo,
    claseComprobada,
    dLambda,
    avisos,
    faltan,
  };
}
