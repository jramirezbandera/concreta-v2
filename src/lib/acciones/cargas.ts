/**
 * Cargas gravitatorias por planta (DB SE-AE art. 2.1 y 3.1, Anejo C; DB SE
 * tablas 4.1 y 4.2).
 *
 * Por cada zona de cada planta:
 *
 *   pp    peso propio del forjado (tecleado, ρ·h en losas, tabla C.5 en el resto)
 *   resto Σ de las cargas permanentes que van encima (solado, tabiquería, cubierta…)
 *   G     = pp + resto
 *   qUso  sobrecarga de la tabla 3.1 (+1 kN/m² en escaleras y portales de A y B)
 *   Q     la variable que manda: qUso, o en cubiertas con nieve la combinación
 *         del DB SE 4.2.2 (G no concomitante → la mayor; el resto, con ψ0)
 *   Gd = 1,35·G   Qd = 1,50·Q   qd = Gd + Qd                   (predimensionado)
 *
 * El motor no sabe de publicaciones ni de catálogos: recibe números y
 * conceptos y devuelve números y textos. Ningún número de la norma vive aquí;
 * todos vienen de `tablasCargas.ts`.
 */

import { interpolar } from './interp';
import {
  ALTITUD_PSI_NIEVE,
  BORDE_BALCON,
  CATEGORIAS_CON_INCREMENTO,
  DENSIDAD_HORMIGON,
  GAMMA_DB_SE,
  INCLINACION_G,
  INCREMENTO_ESCALERAS,
  ROTULO_PSI,
  TABIQUERIA,
  TABLA_3_1,
  TABLA_4_2_PSI,
  TABLA_C5_FORJADOS,
  type CategoriaUso,
  type FamiliaPsi,
  type FilaTabla31,
  type Psi,
} from './tablasCargas';

// ── Entrada ─────────────────────────────────────────────────────────────────

export type TipoForjado = 'losa' | 'solera' | 'reticular' | 'unidireccional' | 'chapa' | 'madera' | 'otro';

export interface ForjadoCargas {
  tipo: TipoForjado;
  /** Canto total, cm. */
  canto: number;
  /** Peso propio tecleado (el del fabricante o del programa), kN/m². Manda sobre el catálogo. */
  ppManual?: number;
}

export interface PermanenteCargas {
  concepto: string;
  /** kN/m². */
  valor: number;
}

export interface UsoCargas {
  categoria: CategoriaUso | 'otro';
  /** Sólo con `categoria = 'otro'`: la sobrecarga adoptada, kN/m². */
  qkManual?: number;
  /** Sólo G: inclinación de la cubierta, grados. 0 = plana. */
  inclinacion?: number;
  /** Sólo G: cubierta ligera sobre correas, sin forjado (tabla 3.1, nota 5). */
  ligera?: boolean;
  /** Portales, mesetas y escaleras (art. 3.1.1-3): +1 kN/m² en A y B. */
  escalera?: boolean;
  /** Balcón volado (art. 3.1.1-4): 2 kN/m en el borde, que se anota. */
  balcon?: boolean;
  /** Sólo F: desde qué uso se accede a la cubierta, para el ψ (tabla 3.1, nota 2). */
  accesoDesde?: CategoriaUso;
  /** Sólo 'otro': con qué fila de la tabla 4.2 va. */
  psiComo?: FamiliaPsi;
}

export interface ZonaCargas {
  id?: string;
  /** Sub-uso dentro de la planta («Vaso piscina»). Vacío = la planta entera. */
  nombre?: string;
  forjado: ForjadoCargas;
  permanentes: PermanenteCargas[];
  uso: UsoCargas;
}

export interface PlantaCargas {
  id?: string;
  nombre: string;
  esCubierta: boolean;
  /** Carga de nieve en proyección horizontal, kN/m². Sólo cuenta en cubiertas. */
  nieve?: number;
  zonas: ZonaCargas[];
}

export interface LinealCargas {
  id?: string;
  concepto: string;
  /** kN/m. */
  valor: number;
}

export interface CargasInput {
  /** Altitud de la obra, m: decide la fila de ψ de la nieve. */
  altitud?: number;
  plantas: PlantaCargas[];
  lineales: LinealCargas[];
}

// ── Salida ──────────────────────────────────────────────────────────────────

export type OrigenPP = 'manual' | 'densidad' | 'tablaC5' | 'sinDato';

export type FilaUso = FilaTabla31 | 'G1-G2' | 'otro';

export type Hipotesis = 'uso' | 'nieve' | 'uso+nieve' | 'nieve+uso';

export interface ForjadoResuelto {
  tipo: TipoForjado;
  canto: number;
  /** kN/m². */
  pp: number;
  ppOrigen: OrigenPP;
  /** El canto se sale de los tramos de la tabla C.5 y se ha tomado el último. */
  fueraDeTabla: boolean;
}

export interface UsoResuelto {
  categoria: CategoriaUso | 'otro';
  fila: FilaUso;
  /** «A1 — viviendas», «G — cubierta a 30º (entre G1 y G2)», «valor adoptado». */
  etiqueta: string;
  /** Sobrecarga de la tabla, kN/m². */
  qk: number;
  /** Con el incremento de escaleras si procede, kN/m². Es lo que entra en las sumas. */
  qUso: number;
  incrementoEscaleras: number;
  /** Carga concentrada para comprobaciones locales, kN. `null` cuando el uso es adoptado. */
  qkConcentrada: number | null;
  familiaPsi: FamiliaPsi;
  psi: Psi;
  /** Carga lineal en el borde de un balcón volado, kN/m. */
  bordeBalcon?: number;
}

export interface ZonaCargasResuelta {
  id?: string;
  nombre: string;
  /** «Planta Baja (Vaso piscina)» o «Planta Baja». */
  rotulo: string;
  forjado: ForjadoResuelto;
  /** Σ permanentes sin el peso propio, kN/m². */
  resto: number;
  /** pp + resto, kN/m². */
  G: number;
  uso: UsoResuelto;
  /** Nieve de la planta si es cubierta, kN/m². */
  nieve: number | null;
  psiNieve: Psi | null;
  /** La variable característica que manda, kN/m²: qUso, la nieve, o la combinación con ψ0. */
  Q: number;
  Gd: number;
  Qd: number;
  qd: number;
  hipotesis: Hipotesis;
}

export interface PlantaCargasResuelta {
  id?: string;
  nombre: string;
  esCubierta: boolean;
  nieve: number | null;
  zonas: ZonaCargasResuelta[];
}

export interface LinealResuelto {
  id?: string;
  concepto: string;
  /** kN/m. */
  gk: number;
  Gd: number;
}

export interface PsiPresente {
  clave: FamiliaPsi | 'nieveBaja' | 'nieveAlta';
  etiqueta: string;
  psi: Psi;
}

export interface CargasResultado {
  plantas: PlantaCargasResuelta[];
  lineales: LinealResuelto[];
  gamma: { G: number; Q: number; A: number };
  /** Las filas de la tabla 4.2 que aparecen en la obra, en el orden de la tabla. */
  psiPresentes: PsiPresente[];
  /** Recordatorios normativos que van a la memoria tal cual. */
  notas: string[];
  /** Cosas que el usuario debe mirar; no bloquean. */
  avisos: string[];
  /** Entrada inválida o sin dato; bloquean la exportación. */
  errores: string[];
}

// ── Piezas ──────────────────────────────────────────────────────────────────

const kNm2 = (v: number, decimales = 2) => `${v.toFixed(decimales).replace('.', ',')} kN/m²`;

/**
 * Peso propio del forjado. Losas y soleras: ρ·h (que es lo que da la tabla C.5
 * a 0,20 m). Reticular, unidireccional y chapa: el tramo de la C.5 en el que
 * cae el canto; por encima del último se toma ese y se avisa. Madera y «otro»
 * no tienen número en la norma: hay que teclearlo.
 */
export function pesoPropioForjado(f: ForjadoCargas): ForjadoResuelto {
  const base = { tipo: f.tipo, canto: f.canto, fueraDeTabla: false };
  if (f.ppManual !== undefined) return { ...base, pp: f.ppManual, ppOrigen: 'manual' };
  if (f.tipo === 'losa' || f.tipo === 'solera') {
    return { ...base, pp: DENSIDAD_HORMIGON * (f.canto / 100), ppOrigen: 'densidad' };
  }
  if (f.tipo === 'madera' || f.tipo === 'otro') return { ...base, pp: 0, ppOrigen: 'sinDato' };
  const tramos = TABLA_C5_FORJADOS[f.tipo];
  const grueso = f.canto / 100;
  const tramo = tramos.find((t) => grueso < t.gruesoMax);
  if (tramo) return { ...base, pp: tramo.peso, ppOrigen: 'tablaC5' };
  return { ...base, pp: tramos[tramos.length - 1].peso, ppOrigen: 'tablaC5', fueraDeTabla: true };
}

/** Con qué fila de la tabla 4.2 va cada categoría. F toma la del uso de acceso; «otro», la que diga el usuario. */
export function familiaPsiDe(uso: UsoCargas): FamiliaPsi {
  const c = uso.categoria;
  if (c === 'otro') return uso.psiComo ?? 'A';
  if (c === 'F') return familiaPsiDe({ categoria: uso.accesoDesde ?? 'A1' });
  if (c === 'A1' || c === 'A2') return 'A';
  if (c === 'B') return 'B';
  if (c === 'D1' || c === 'D2') return 'D';
  if (c === 'E') return 'E';
  if (c === 'G') return 'G';
  return 'C';
}

export function psiDe(uso: UsoCargas): Psi {
  return TABLA_4_2_PSI[familiaPsiDe(uso)];
}

/** La fila de nieve de la tabla 4.2 según la altitud; sin altitud se supone la baja. */
export function psiNieve(altitud?: number): { clave: 'nieveBaja' | 'nieveAlta'; psi: Psi; supuesta: boolean } {
  const clave = altitud !== undefined && altitud > ALTITUD_PSI_NIEVE ? 'nieveAlta' : 'nieveBaja';
  return { clave, psi: TABLA_4_2_PSI[clave], supuesta: altitud === undefined };
}

function etiquetaUso(fila: FilaUso, inclinacion: number): string {
  if (fila === 'otro') return 'valor adoptado';
  if (fila === 'G1-G2') return `G — cubierta a ${inclinacion.toFixed(0)}º (entre G1 y G2)`;
  const codigo = fila === 'G1ligera' ? 'G1' : fila;
  return `${codigo} — ${TABLA_3_1[fila].corta}`;
}

/**
 * Sobrecarga de uso de la tabla 3.1 con sus notas: G por inclinación (nota 3,
 * interpolando entre G1 y G2), cubierta ligera (nota 5), +1 kN/m² en escaleras
 * y portales de A y B (art. 3.1.1-3), y el borde de balcón (art. 3.1.1-4).
 */
export function sobrecargaUso(uso: UsoCargas): UsoResuelto {
  const inclinacion = uso.inclinacion ?? 0;
  let fila: FilaUso;
  let qk: number;
  let qkConcentrada: number | null;

  if (uso.categoria === 'otro') {
    fila = 'otro';
    qk = uso.qkManual ?? 0;
    qkConcentrada = null;
  } else if (uso.categoria === 'G') {
    const g1 = TABLA_3_1[uso.ligera ? 'G1ligera' : 'G1'];
    const g2 = TABLA_3_1.G2;
    if (inclinacion <= INCLINACION_G.g1Max) {
      fila = uso.ligera ? 'G1ligera' : 'G1';
      qk = g1.uniforme;
      qkConcentrada = g1.concentrada;
    } else if (inclinacion >= INCLINACION_G.g2Min) {
      fila = 'G2';
      qk = g2.uniforme;
      qkConcentrada = g2.concentrada;
    } else {
      fila = 'G1-G2';
      qk = interpolar(inclinacion, [INCLINACION_G.g1Max, INCLINACION_G.g2Min], [g1.uniforme, g2.uniforme]);
      qkConcentrada = Math.max(g1.concentrada, g2.concentrada);
    }
  } else {
    fila = uso.categoria;
    qk = TABLA_3_1[fila].uniforme;
    qkConcentrada = TABLA_3_1[fila].concentrada;
  }

  const conIncremento = uso.escalera === true && uso.categoria !== 'otro' && CATEGORIAS_CON_INCREMENTO.includes(uso.categoria);
  const incrementoEscaleras = conIncremento ? INCREMENTO_ESCALERAS : 0;
  const familiaPsi = familiaPsiDe(uso);
  return {
    categoria: uso.categoria,
    fila,
    etiqueta: etiquetaUso(fila, inclinacion),
    qk,
    qUso: qk + incrementoEscaleras,
    incrementoEscaleras,
    qkConcentrada,
    familiaPsi,
    psi: TABLA_4_2_PSI[familiaPsi],
    ...(uso.balcon ? { bordeBalcon: BORDE_BALCON } : {}),
  };
}

export interface CombinacionCubierta {
  G: number;
  qUso: number;
  /** `null` = sin nieve (planta que no es cubierta, o cubierta sin nieve). */
  nieve: number | null;
  /** Categoría G: la sobrecarga de conservación no es concomitante con la nieve (tabla 3.1, nota 7). */
  noConcomitante: boolean;
  psi0Uso: number;
  psi0Nieve: number;
}

/**
 * La variable que manda y los valores de cálculo. Sin nieve, manda el uso.
 * Con nieve y uso G, la mayor de las dos (no concomitantes). Con nieve y
 * cualquier otro uso, la peor de las dos combinaciones del DB SE 4.2.2:
 * uso principal + ψ0·nieve, o nieve principal + ψ0·uso.
 */
export function combinarCubierta(c: CombinacionCubierta): { Q: number; Gd: number; Qd: number; qd: number; hipotesis: Hipotesis } {
  let Q: number;
  let hipotesis: Hipotesis;
  if (c.nieve === null) {
    Q = c.qUso;
    hipotesis = 'uso';
  } else if (c.noConcomitante) {
    hipotesis = c.qUso >= c.nieve ? 'uso' : 'nieve';
    Q = Math.max(c.qUso, c.nieve);
  } else {
    const usoPrincipal = c.qUso + c.psi0Nieve * c.nieve;
    const nievePrincipal = c.nieve + c.psi0Uso * c.qUso;
    hipotesis = usoPrincipal >= nievePrincipal ? 'uso+nieve' : 'nieve+uso';
    Q = Math.max(usoPrincipal, nievePrincipal);
  }
  const Gd = GAMMA_DB_SE.G * c.G;
  const Qd = GAMMA_DB_SE.Q * Q;
  return { Q, Gd, Qd, qd: Gd + Qd, hipotesis };
}

/** «Planta Baja (Vaso piscina)» cuando la zona tiene nombre; si no, el de la planta. */
export function rotuloZona(planta: string, zona?: string): string {
  const z = zona?.trim();
  return z ? `${planta} (${z})` : planta;
}

const esTabiqueria = (concepto: string) => /tabiqu/i.test(concepto);

// ── Cálculo ─────────────────────────────────────────────────────────────────

const ORDEN_PSI: (FamiliaPsi | 'nieveBaja' | 'nieveAlta')[] = ['A', 'B', 'C', 'D', 'E', 'G', 'nieveBaja', 'nieveAlta'];

export function calcularCargas(input: CargasInput): CargasResultado {
  const errores: string[] = [];
  const avisos: string[] = [];
  const notas: string[] = [];
  const presentes = new Set<FamiliaPsi | 'nieveBaja' | 'nieveAlta'>();
  let hayTabiqueria = false;
  let hayEscaleras = false;
  let hayBalcones = false;
  let hayG = false;
  let hayGConNieve = false;
  let hayF = false;
  let hayOtro = false;
  let hayInterpolacionG = false;
  let nievePsiSupuesta = false;

  const nievePsi = psiNieve(input.altitud);

  if (input.plantas.length === 0) errores.push('Hace falta al menos una planta.');

  const plantas: PlantaCargasResuelta[] = input.plantas.map((planta) => {
    const nombrePlanta = planta.nombre.trim() || 'Planta';
    const nieve = planta.esCubierta && planta.nieve !== undefined ? planta.nieve : null;
    if (nieve !== null && nieve < 0) errores.push(`«${nombrePlanta}»: la carga de nieve no puede ser negativa.`);
    if (planta.zonas.length === 0) errores.push(`«${nombrePlanta}»: no tiene ninguna zona de carga.`);

    const zonas: ZonaCargasResuelta[] = planta.zonas.map((zona) => {
      const rotulo = rotuloZona(nombrePlanta, zona.nombre);
      const f = zona.forjado;
      const forjado = pesoPropioForjado(f);

      if (f.ppManual !== undefined) {
        if (f.ppManual < 0) errores.push(`«${rotulo}»: el peso propio no puede ser negativo.`);
      } else if (forjado.ppOrigen === 'sinDato') {
        errores.push(`«${rotulo}»: indique el peso propio del forjado; la norma no da un valor para este tipo.`);
      } else if (!(f.canto > 0)) {
        errores.push(`«${rotulo}»: el canto del forjado tiene que ser mayor que cero.`);
      } else if (forjado.fueraDeTabla) {
        avisos.push(
          `«${rotulo}»: la tabla C.5 no llega a un canto de ${f.canto} cm en este tipo de forjado; se toma el último tramo (${kNm2(forjado.pp)}). Sustitúyalo por el peso del fabricante o del programa.`,
        );
      }

      let resto = 0;
      for (const p of zona.permanentes) {
        if (p.valor < 0) errores.push(`«${rotulo}»: «${p.concepto}» no puede ser negativa.`);
        resto += p.valor;
        if (esTabiqueria(p.concepto)) {
          hayTabiqueria = true;
          if (p.valor > TABIQUERIA.max) {
            avisos.push(
              `«${rotulo}»: una tabiquería de más de ${kNm2(TABIQUERIA.max, 1)} no se asimila sin más a una carga uniforme: el exceso sobre ${kNm2(TABIQUERIA.max, 1)} de alzado se trata como carga local (art. 2.1-3).`,
            );
          }
        }
      }

      const u = zona.uso;
      if (u.categoria === 'otro') {
        hayOtro = true;
        if (u.qkManual === undefined) errores.push(`«${rotulo}»: indique la sobrecarga de uso adoptada.`);
        else if (u.qkManual < 0) errores.push(`«${rotulo}»: la sobrecarga de uso no puede ser negativa.`);
      }
      if (u.categoria === 'G') {
        hayG = true;
        const inc = u.inclinacion ?? 0;
        if (!(inc >= 0 && inc < 90)) errores.push(`«${rotulo}»: la inclinación de la cubierta tiene que estar entre 0º y 90º.`);
        else if (inc > INCLINACION_G.g1Max && inc < INCLINACION_G.g2Min) hayInterpolacionG = true;
      }
      if (u.categoria === 'F') hayF = true;
      if (u.escalera) {
        if (u.categoria !== 'otro' && CATEGORIAS_CON_INCREMENTO.includes(u.categoria)) hayEscaleras = true;
        else {
          avisos.push(
            `«${rotulo}»: el incremento de ${kNm2(INCREMENTO_ESCALERAS, 0)} en escaleras y portales sólo lo prevé la norma para las categorías A y B (art. 3.1.1-3); no se aplica.`,
          );
        }
      }
      if (u.balcon) hayBalcones = true;

      const uso = sobrecargaUso(u);
      presentes.add(uso.familiaPsi);

      const G = forjado.pp + resto;
      const conNieve = nieve !== null && nieve > 0;
      const noConcomitante = u.categoria === 'G';
      if (conNieve) {
        presentes.add(nievePsi.clave);
        if (noConcomitante) hayGConNieve = true;
        else if (nievePsi.supuesta) nievePsiSupuesta = true;
      }
      const comb = combinarCubierta({
        G,
        qUso: uso.qUso,
        nieve: conNieve ? nieve : null,
        noConcomitante,
        psi0Uso: uso.psi.psi0,
        psi0Nieve: nievePsi.psi.psi0,
      });

      return {
        ...(zona.id !== undefined ? { id: zona.id } : {}),
        nombre: zona.nombre?.trim() ?? '',
        rotulo,
        forjado,
        resto,
        G,
        uso,
        nieve,
        psiNieve: conNieve ? nievePsi.psi : null,
        ...comb,
      };
    });

    return {
      ...(planta.id !== undefined ? { id: planta.id } : {}),
      nombre: nombrePlanta,
      esCubierta: planta.esCubierta,
      nieve,
      zonas,
    };
  });

  const lineales: LinealResuelto[] = input.lineales.map((l) => {
    const concepto = l.concepto.trim() || 'Carga lineal';
    if (l.valor < 0) errores.push(`«${concepto}»: una carga lineal no puede ser negativa.`);
    return {
      ...(l.id !== undefined ? { id: l.id } : {}),
      concepto,
      gk: l.valor,
      Gd: GAMMA_DB_SE.G * l.valor,
    };
  });

  if (nievePsiSupuesta) {
    avisos.push(`Sin la altitud de la obra se toman los coeficientes ψ de la nieve de altitud ≤ ${ALTITUD_PSI_NIEVE} m (DB SE, tabla 4.2).`);
  }

  if (hayTabiqueria) {
    notas.push(
      `Tabiquería: los tabiques ordinarios de no más de ${kNm2(TABIQUERIA.max, 1)} de alzado y distribución homogénea se asimilan a una carga uniforme; en viviendas basta considerar ${kNm2(TABIQUERIA.viviendas, 1)} de superficie construida (art. 2.1-3).`,
    );
  }
  if (hayEscaleras) {
    notas.push(`En portales, mesetas y escaleras de las zonas de categorías A y B la sobrecarga de la zona servida se incrementa en ${kNm2(INCREMENTO_ESCALERAS, 0)} (art. 3.1.1-3).`);
  }
  if (hayBalcones) {
    notas.push(`Los balcones volados se comprueban con la sobrecarga de uso de la zona con la que comunican más una carga lineal de ${BORDE_BALCON} kN/m en su borde (art. 3.1.1-4).`);
  }
  if (hayInterpolacionG) {
    notas.push(`En cubiertas con inclinación entre ${INCLINACION_G.g1Max}º y ${INCLINACION_G.g2Min}º la sobrecarga de conservación se interpola entre G1 y G2 (tabla 3.1, nota 3).`);
  }
  if (hayG) {
    notas.push(
      hayGConNieve
        ? 'La sobrecarga de conservación de las cubiertas (categoría G) no se considera concomitante con el resto de acciones variables (tabla 3.1, nota 7): en cada cubierta manda la mayor de uso y nieve.'
        : 'La sobrecarga de conservación de las cubiertas (categoría G) no se considera concomitante con el resto de acciones variables (tabla 3.1, nota 7).',
    );
  }
  if (hayF) {
    notas.push('En cubiertas transitables de uso público la sobrecarga es la de la zona desde la que se accede (tabla 3.1, nota 2).');
  }
  if (hayOtro) {
    notas.push('Las sobrecargas que no figuran en la tabla 3.1 (almacenes, equipos, instalaciones) se consignan en la memoria y en las instrucciones de uso con el valor adoptado (art. 3.1.1-5).');
  }
  notas.push(
    `Valores característicos en servicio; los de cálculo se obtienen con γG = ${GAMMA_DB_SE.G.toFixed(2).replace('.', ',')} y γQ = ${GAMMA_DB_SE.Q.toFixed(2).replace('.', ',')} (DB SE, tabla 4.1). El viento y el sismo se tratan en sus módulos y no entran en estas sumas.`,
  );

  const psiPresentes: PsiPresente[] = ORDEN_PSI.filter((k) => presentes.has(k)).map((clave) => ({
    clave,
    etiqueta: ROTULO_PSI[clave],
    psi: TABLA_4_2_PSI[clave],
  }));

  return { plantas, lineales, gamma: { ...GAMMA_DB_SE }, psiPresentes, notas, avisos, errores };
}
