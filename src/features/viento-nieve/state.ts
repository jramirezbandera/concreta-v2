/**
 * Estado del módulo «Viento y nieve» y su traducción al motor.
 *
 * Estado anidado (plantas, faldones), así que NO usa `useModuleState`: clave
 * propia en localStorage, versión de esquema propia y `normalizar()` defensivo
 * al leer. Mismo enfoque que sismo y materiales.
 *
 * El emplazamiento se hereda del contexto de obra (`lib/obra`) al arrancar
 * sin estado guardado, y se puede sobrescribir aquí. Lo que sale del cálculo
 * se publica en `concreta-pub-viento-nieve` (`lib/pub`) para que la ficha DB
 * SE y el cuadro de acciones lo ensamblen sin leer este estado.
 */

import {
  alturaCoronacionDesdeForjado,
  AREA_CPE,
  calcularNieve,
  calcularViento,
  ORDEN_ASPEREZAS,
  provinciaPorIne,
  QB_SIMPLIFICADO,
  ZONAS_INVERNALES,
  type Cpe,
  type CubiertaResuelta,
  type DireccionParamentos,
  type DireccionResuelta,
  type ParamentosResueltos,
  type ExposicionNieve,
  type GradoAspereza,
  type NieveInput,
  type NieveResultado,
  type Provincia,
  type SuperficieExterior,
  type VientoInput,
  type VientoResultado,
  type ZonaEolica,
  type ZonaInvernal,
} from '../../lib/acciones';
import { leerObra } from '../../lib/obra';
import { publicar } from '../../lib/pub';
import {
  ALTURA_PLANTA_TIPO,
  AREA_PROPIA_INICIAL,
  PENDIENTE_INICIAL,
  PLANTAS_INICIALES,
  type AreaModo,
  type EjeCumbrera,
  type LimahoyaUI,
  type QbModo,
  type SkModo,
} from './catalogos';

export const STORAGE_KEY = 'concreta-viento-nieve-model';
export const SCHEMA_VERSION_KEY = 'concreta-viento-nieve-model-version';
export const SCHEMA_VERSION = '1';

/** Nombre del módulo en las publicaciones y versión del esquema de `datos`. */
export const MODULO_PUB = 'viento-nieve';
export const PUB_VERSION = 1;

// ── Forma del estado ────────────────────────────────────────────────────────

export interface Emplazamiento {
  /** Código INE de la provincia, dos dígitos. '' = hueco sin resolver. */
  provincia: string;
  /** Texto libre; sólo se imprime. */
  municipio: string;
  /** null = hueco sin resolver (la nieve lo necesita). */
  altitud: number | null;
  /** La obra está en la capital: sk sale de la tabla 3.8. */
  esCapital: boolean;
  /** Zona forzada por el usuario. null = la de la provincia. */
  zonaEolica: ZonaEolica | null;
  zonaInvernal: ZonaInvernal | null;
}

export interface PlantaUI {
  id: string;
  nombre: string;
  /**
   * Altura de la planta, de forjado a forjado, m. Es lo que se teclea: la cota
   * del forjado sobre rasante —lo que necesita el motor— se acumula en el
   * orden de la lista (`cotasPlantas`), la primera planta apoyada en la
   * rasante. Hasta el 2026-09-05 se guardaba la cota (`h`); `normalizar`
   * convierte los estados viejos.
   */
  altura: number;
}

/** Cubierta a dos aguas (Anejo D.6): opcional, la mayoría de edificios de pisos van con cubierta plana. */
export interface CubiertaUI {
  activa: boolean;
  /** Pendiente de los faldones, grados; negativa si bajan hacia el centro. */
  pendiente: number;
  cumbrera: EjeCumbrera;
  /** Altura de coronación, m. null = la del último forjado más lo que sube el faldón. */
  alturaCoronacion: number | null;
  areaModo: AreaModo;
  /** m². Sólo cuenta con `areaModo = 'propia'`. */
  areaPropia: number;
}

/** Paramentos verticales (tabla D.3): opcional, para las comprobaciones locales de fachada. */
export interface ParamentosUI {
  activos: boolean;
  areaModo: AreaModo;
  /** m². Sólo cuenta con `areaModo = 'propia'`. */
  areaPropia: number;
}

export interface VientoUI {
  activo: boolean;
  qbModo: QbModo;
  /** kN/m². Sólo cuenta con `qbModo = 'manual'`. */
  qbManual: number;
  aspereza: GradoAspereza;
  /** Superficie exterior, para el rozamiento del art. 3.3.2-3. */
  superficie: SuperficieExterior;
  plantas: PlantaUI[];
  dimensiones: { x: number; y: number };
  cubierta: CubiertaUI;
  paramentos: ParamentosUI;
}

export interface FaldonUI {
  id: string;
  nombre: string;
  /** Grados. 0 = plana. */
  inclinacion: number;
  impedimento: boolean;
  /** Proyección horizontal, m. null = no se indica (sin acumulación). */
  L: number | null;
  limahoya: LimahoyaUI;
  /** Inclinación del otro faldón de la limahoya, grados. */
  inclinacionOtro: number;
  voladizo: boolean;
}

export interface NieveUI {
  activo: boolean;
  exposicion: ExposicionNieve;
  skModo: SkModo;
  /** kN/m². Sólo cuenta con `skModo = 'manual'`. */
  skManual: number;
  faldones: FaldonUI[];
}

export interface VientoNieveState {
  emplazamiento: Emplazamiento;
  viento: VientoUI;
  nieve: NieveUI;
  /** Modo Ayuda: encendido por defecto. */
  ayuda: boolean;
}

// ── Valores por defecto ─────────────────────────────────────────────────────

let contador = 0;
export function nuevoId(prefijo = 'p'): string {
  contador += 1;
  return `${prefijo}${Date.now().toString(36)}${contador.toString(36)}`;
}

export function nuevaPlanta(nombre: string, altura: number): PlantaUI {
  return { id: nuevoId('p'), nombre, altura };
}

/** Cota de cada forjado sobre rasante, m: las alturas acumuladas en el orden de la lista. */
export function cotasPlantas(plantas: readonly PlantaUI[]): number[] {
  let cota = 0;
  return plantas.map((p) => {
    cota += p.altura;
    return cota;
  });
}

export function nuevoFaldon(nombre: string, inclinacion: number): FaldonUI {
  return {
    id: nuevoId('f'),
    nombre,
    inclinacion,
    impedimento: false,
    L: null,
    limahoya: 'ninguna',
    inclinacionOtro: inclinacion,
    voladizo: false,
  };
}

export function cubiertaPorDefecto(): CubiertaUI {
  return {
    activa: false,
    pendiente: PENDIENTE_INICIAL,
    cumbrera: 'x',
    alturaCoronacion: null,
    areaModo: 'zona',
    areaPropia: AREA_PROPIA_INICIAL,
  };
}

export function paramentosPorDefecto(): ParamentosUI {
  return { activos: false, areaModo: 'zona', areaPropia: AREA_PROPIA_INICIAL };
}

/** Anejo D.3-3 traducido al motor: nada (la de cada zona), 1 m², o la tecleada. */
function areaInfluenciaDe(o: { areaModo: AreaModo; areaPropia: number }): { areaInfluencia?: number } {
  if (o.areaModo === 'local') return { areaInfluencia: AREA_CPE.local };
  if (o.areaModo === 'propia') return { areaInfluencia: o.areaPropia };
  return {};
}

/** Altura de coronación deducida: el forjado más alto más lo que sube el faldón hasta la cumbrera. */
export function alturaCoronacionDerivada(v: VientoUI): number {
  const H = cotasPlantas(v.plantas).reduce((m, z) => Math.max(m, z), 0);
  const ancho = v.dimensiones[v.cubierta.cumbrera === 'x' ? 'y' : 'x'];
  return alturaCoronacionDesdeForjado(H, ancho, v.cubierta.pendiente);
}

/** La tecleada si la hay; si no, la deducida. */
export function alturaCoronacionEfectiva(v: VientoUI): number {
  return v.cubierta.alturaCoronacion ?? alturaCoronacionDerivada(v);
}

/** La planta que se añade detrás de la última: una planta tipo encima. */
export function siguientePlanta(plantas: PlantaUI[]): PlantaUI {
  return nuevaPlanta(`Planta ${plantas.length + 1}`, ALTURA_PLANTA_TIPO);
}

/**
 * Estado de arranque. El emplazamiento se hereda del contexto de obra si lo
 * hay; si no, queda en hueco. Nada de municipio por defecto: un valor que el
 * usuario no ha elegido no es un dato, es un dato fantasma.
 */
export function defaultVientoNieveState(): VientoNieveState {
  const obra = leerObra();
  return {
    emplazamiento: {
      provincia: obra?.provincia ?? '',
      municipio: obra?.municipio ?? '',
      altitud: obra?.altitud ?? null,
      esCapital: false,
      zonaEolica: null,
      zonaInvernal: null,
    },
    viento: {
      activo: true,
      qbModo: 'zona',
      qbManual: QB_SIMPLIFICADO,
      aspereza: 'IV',
      superficie: 'rugosa',
      plantas: PLANTAS_INICIALES.map((p) => nuevaPlanta(p.nombre, p.altura)),
      dimensiones: { x: 20, y: 12 },
      cubierta: cubiertaPorDefecto(),
      paramentos: paramentosPorDefecto(),
    },
    nieve: {
      activo: true,
      exposicion: 'normal',
      skModo: 'auto',
      skManual: 1,
      faldones: [nuevoFaldon('Cubierta', 0)],
    },
    ayuda: true,
  };
}

/**
 * Caso de ejemplo para quien quiere ver el módulo lleno antes de teclear el
 * suyo: Aranda de Duero (Burgos, zona eólica B, clima invernal 3) a 800 m,
 * tres plantas de 3 m, cubierta a dos aguas a 40º con las fachadas por zonas,
 * y tres faldones de nieve: los dos de la cubierta, el sur descargando sobre
 * un cuerpo bajo con petos. A 40º la nieve desliza y se ve la acumulación.
 * Pisa el emplazamiento que hubiera: la banda que lo ofrece lo dice.
 */
export function ejemploVientoNieveState(): VientoNieveState {
  const base = defaultVientoNieveState();
  const sur = nuevoFaldon('Faldón sur', 40);
  const baja = nuevoFaldon('Cubierta baja', 0);
  return {
    ...base,
    emplazamiento: { provincia: '09', municipio: 'Aranda de Duero', altitud: 800, esCapital: false, zonaEolica: null, zonaInvernal: null },
    viento: {
      ...base.viento,
      plantas: PLANTAS_INICIALES.map((p) => nuevaPlanta(p.nombre, p.altura)),
      cubierta: { ...cubiertaPorDefecto(), activa: true, pendiente: 40, cumbrera: 'x' },
      paramentos: { ...paramentosPorDefecto(), activos: true },
    },
    nieve: {
      ...base.nieve,
      faldones: [nuevoFaldon('Faldón norte', 40), { ...sur, L: 6, limahoya: 'cambioNivel' }, { ...baja, impedimento: true }],
    },
  };
}

/**
 * ¿El edificio sigue tal cual arranca? Sólo mira la estructura (plantas,
 * dimensiones, cubierta, fachadas, faldones): el emplazamiento se hereda de
 * la obra y no dice nada de si el usuario ha empezado a modelar. Sirve para
 * ofrecer el caso de ejemplo sin estorbar a quien ya está trabajando.
 */
export function esEstadoInicial(s: VientoNieveState): boolean {
  const v = s.viento;
  const f = s.nieve.faldones;
  return (
    v.plantas.length === PLANTAS_INICIALES.length &&
    v.plantas.every((p, i) => p.altura === PLANTAS_INICIALES[i].altura) &&
    v.dimensiones.x === 20 &&
    v.dimensiones.y === 12 &&
    !v.cubierta.activa &&
    !v.paramentos.activos &&
    f.length === 1 &&
    f[0].inclinacion === 0 &&
    f[0].limahoya === 'ninguna' &&
    f[0].L === null
  );
}

// ── Lectura defensiva ───────────────────────────────────────────────────────

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const bool = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def);
const numero = (v: unknown, def: number) => (typeof v === 'number' && Number.isFinite(v) ? v : def);
const texto = (v: unknown, def: string) => (typeof v === 'string' ? v : def);
const uno = <T extends string>(v: unknown, permitidos: readonly T[], def: T): T =>
  permitidos.includes(v as T) ? (v as T) : def;

/**
 * Las plantas guardadas. Hasta el 2026-09-05 cada una llevaba su cota `h`;
 * desde entonces lleva su altura de forjado a forjado. Un estado viejo se
 * reconoce por LISTA —basta una planta sin `altura`— y se convierte como lo
 * habría leído el motor: ordenadas por cota y diferenciadas. Una cota que no
 * sube da altura cero, que el motor reporta como planta sin altura.
 */
function plantasNormalizadas(brutas: Record<string, unknown>[]): PlantaUI[] {
  const planta = (p: Record<string, unknown>, i: number, altura: number): PlantaUI => ({
    id: texto(p.id, nuevoId('p')),
    nombre: texto(p.nombre, `Planta ${i + 1}`),
    altura,
  });
  const legado = brutas.some((p) => typeof p.altura !== 'number' || !Number.isFinite(p.altura));
  if (!legado) return brutas.map((p, i) => planta(p, i, numero(p.altura, 0)));

  const ordenadas = brutas.map((p, i) => ({ p, i, h: numero(p.h, 0) })).sort((a, b) => a.h - b.h);
  let anterior = 0;
  return ordenadas.map(({ p, i, h }) => {
    const altura = Math.max(0, h - anterior);
    anterior = Math.max(anterior, h);
    return planta(p, i, altura);
  });
}

/**
 * Un estado guardado por una versión anterior, o manipulado a mano, no puede
 * tumbar el módulo. Todo lo que no se reconozca cae al valor por defecto.
 */
export function normalizar(bruto: unknown): VientoNieveState {
  const base = defaultVientoNieveState();
  if (!esObjeto(bruto)) return base;

  const e = esObjeto(bruto.emplazamiento) ? bruto.emplazamiento : {};
  const v = esObjeto(bruto.viento) ? bruto.viento : {};
  const n = esObjeto(bruto.nieve) ? bruto.nieve : {};
  const dims = esObjeto(v.dimensiones) ? v.dimensiones : {};
  const cub = esObjeto(v.cubierta) ? v.cubierta : {};
  const par = esObjeto(v.paramentos) ? v.paramentos : {};

  const plantas = Array.isArray(v.plantas) ? plantasNormalizadas(v.plantas.filter(esObjeto)) : base.viento.plantas;

  const faldones = Array.isArray(n.faldones)
    ? n.faldones.filter(esObjeto).map(
        (f, i): FaldonUI => ({
          id: texto(f.id, nuevoId('f')),
          nombre: texto(f.nombre, `Faldón ${i + 1}`),
          inclinacion: numero(f.inclinacion, 0),
          impedimento: bool(f.impedimento, false),
          L: typeof f.L === 'number' && Number.isFinite(f.L) ? f.L : null,
          limahoya: uno(f.limahoya, ['ninguna', 'contrario', 'mismoSentido', 'cambioNivel'] as const, 'ninguna'),
          inclinacionOtro: numero(f.inclinacionOtro, numero(f.inclinacion, 0)),
          voladizo: bool(f.voladizo, false),
        }),
      )
    : base.nieve.faldones;

  const provincia = typeof e.provincia === 'string' && provinciaPorIne(e.provincia) ? e.provincia : '';

  return {
    emplazamiento: {
      provincia,
      municipio: texto(e.municipio, ''),
      altitud: typeof e.altitud === 'number' && Number.isFinite(e.altitud) ? e.altitud : null,
      esCapital: bool(e.esCapital, false),
      zonaEolica: ['A', 'B', 'C'].includes(e.zonaEolica as string) ? (e.zonaEolica as ZonaEolica) : null,
      zonaInvernal: (ZONAS_INVERNALES as number[]).includes(e.zonaInvernal as number)
        ? (e.zonaInvernal as ZonaInvernal)
        : null,
    },
    viento: {
      activo: bool(v.activo, true),
      qbModo: uno(v.qbModo, ['zona', 'simplificado', 'manual'] as const, 'zona'),
      qbManual: numero(v.qbManual, QB_SIMPLIFICADO),
      aspereza: uno(v.aspereza, ORDEN_ASPEREZAS, 'IV'),
      superficie: uno(v.superficie, ['lisa', 'rugosa', 'muyRugosa'] as const, 'rugosa'),
      plantas,
      dimensiones: { x: numero(dims.x, 20), y: numero(dims.y, 12) },
      cubierta: {
        activa: bool(cub.activa, false),
        pendiente: numero(cub.pendiente, PENDIENTE_INICIAL),
        cumbrera: uno(cub.cumbrera, ['x', 'y'] as const, 'x'),
        alturaCoronacion: typeof cub.alturaCoronacion === 'number' && Number.isFinite(cub.alturaCoronacion) ? cub.alturaCoronacion : null,
        areaModo: uno(cub.areaModo, ['zona', 'local', 'propia'] as const, 'zona'),
        areaPropia: numero(cub.areaPropia, AREA_PROPIA_INICIAL),
      },
      paramentos: {
        activos: bool(par.activos, false),
        areaModo: uno(par.areaModo, ['zona', 'local', 'propia'] as const, 'zona'),
        areaPropia: numero(par.areaPropia, AREA_PROPIA_INICIAL),
      },
    },
    nieve: {
      activo: bool(n.activo, true),
      exposicion: uno(n.exposicion, ['normal', 'protegida', 'expuesta'] as const, 'normal'),
      skModo: uno(n.skModo, ['auto', 'manual'] as const, 'auto'),
      skManual: numero(n.skManual, 1),
      faldones,
    },
    ayuda: bool(bruto.ayuda, true),
  };
}

export function cargarEstado(): VientoNieveState {
  try {
    if (localStorage.getItem(SCHEMA_VERSION_KEY) !== SCHEMA_VERSION) return defaultVientoNieveState();
    const bruto = localStorage.getItem(STORAGE_KEY);
    if (!bruto) return defaultVientoNieveState();
    return normalizar(JSON.parse(bruto));
  } catch {
    return defaultVientoNieveState();
  }
}

export function guardarEstado(state: VientoNieveState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    localStorage.setItem(SCHEMA_VERSION_KEY, SCHEMA_VERSION);
  } catch {
    // Almacenamiento lleno o modo privado: se ignora, como en el resto de módulos.
  }
}

// ── Traducción al motor ─────────────────────────────────────────────────────

export interface Zonas {
  provincia: Provincia | null;
  zonaEolica: ZonaEolica | null;
  zonaInvernal: ZonaInvernal | null;
  /** true si la zona la ha forzado el usuario y no coincide con la de la provincia. */
  eolicaForzada: boolean;
  invernalForzada: boolean;
  /** sk de la tabla 3.8 cuando la obra está en la capital. */
  skCapital: number | null;
}

export function zonasEfectivas(e: Emplazamiento): Zonas {
  const provincia = e.provincia ? (provinciaPorIne(e.provincia) ?? null) : null;
  const zonaEolica = e.zonaEolica ?? provincia?.zonaEolica ?? null;
  const zonaInvernal = e.zonaInvernal ?? provincia?.zonaInvernal ?? null;
  return {
    provincia,
    zonaEolica,
    zonaInvernal,
    eolicaForzada: provincia !== null && e.zonaEolica !== null && e.zonaEolica !== provincia.zonaEolica,
    invernalForzada: provincia !== null && e.zonaInvernal !== null && e.zonaInvernal !== provincia.zonaInvernal,
    skCapital: e.esCapital && provincia ? provincia.capital.sk : null,
  };
}

export function entradaViento(state: VientoNieveState, zonas: Zonas): VientoInput | null {
  if (!state.viento.activo || zonas.zonaEolica === null) return null;
  const v = state.viento;
  return {
    zona: zonas.zonaEolica,
    ...(v.qbModo === 'simplificado' ? { qbManual: QB_SIMPLIFICADO } : {}),
    ...(v.qbModo === 'manual' ? { qbManual: v.qbManual } : {}),
    aspereza: v.aspereza,
    superficie: v.superficie,
    ...(state.emplazamiento.altitud !== null ? { altitud: state.emplazamiento.altitud } : {}),
    // El motor quiere cotas: las alturas se acumulan en el orden de la lista.
    plantas: cotasPlantas(v.plantas).map((h, i) => ({ id: v.plantas[i].id, nombre: v.plantas[i].nombre.trim() || 'Planta', h })),
    dimensiones: { ...v.dimensiones },
    ...(v.cubierta.activa
      ? {
          cubierta: {
            pendiente: v.cubierta.pendiente,
            alturaCoronacion: alturaCoronacionEfectiva(v),
            cumbrera: v.cubierta.cumbrera,
            ...areaInfluenciaDe(v.cubierta),
          },
        }
      : {}),
    ...(v.paramentos.activos ? { paramentos: { ...areaInfluenciaDe(v.paramentos) } } : {}),
  };
}

export function entradaNieve(state: VientoNieveState, zonas: Zonas): NieveInput | null {
  const e = state.emplazamiento;
  if (!state.nieve.activo || zonas.zonaInvernal === null || e.altitud === null) return null;
  const n = state.nieve;
  return {
    zona: zonas.zonaInvernal,
    altitud: e.altitud,
    ...(zonas.skCapital !== null && zonas.provincia
      ? { skCapital: zonas.skCapital, altitudCapital: zonas.provincia.capital.altitud }
      : {}),
    ...(n.skModo === 'manual' ? { skManual: n.skManual } : {}),
    exposicion: n.exposicion,
    faldones: n.faldones.map((f) => ({
      id: f.id,
      nombre: f.nombre.trim() || 'Faldón',
      inclinacion: f.inclinacion,
      impedimento: f.impedimento,
      ...(f.L !== null ? { L: f.L } : {}),
      ...(f.limahoya === 'contrario'
        ? { limahoya: { tipo: 'contrario' as const, inclinacionOtro: f.inclinacionOtro } }
        : {}),
      ...(f.limahoya === 'mismoSentido'
        ? { limahoya: { tipo: 'mismoSentido' as const, inclinacionInferior: f.inclinacionOtro } }
        : {}),
      ...(f.limahoya === 'cambioNivel' ? { limahoya: { tipo: 'cambioNivel' as const } } : {}),
      voladizo: f.voladizo,
    })),
  };
}

// ── Evaluación completa ─────────────────────────────────────────────────────

export interface Evaluacion {
  zonas: Zonas;
  viento: VientoResultado | null;
  nieve: NieveResultado | null;
  /** Huecos sin resolver, en lenguaje de obra: «la provincia», «la altitud». */
  huecos: string[];
  errores: number;
  avisos: number;
  /** Exportar y publicar exigen que no queden huecos ni errores. */
  listo: boolean;
}

export function evaluar(state: VientoNieveState): Evaluacion {
  const zonas = zonasEfectivas(state.emplazamiento);
  const huecos: string[] = [];
  if (!zonas.provincia) huecos.push('la provincia');
  if (state.nieve.activo && state.emplazamiento.altitud === null) huecos.push('la altitud');

  const ev = entradaViento(state, zonas);
  const en = entradaNieve(state, zonas);
  const viento = ev ? calcularViento(ev) : null;
  const nieve = en ? calcularNieve(en) : null;

  const errores = (viento?.errores.length ?? 0) + (nieve?.errores.length ?? 0);
  const avisos = (viento?.avisos.length ?? 0) + (nieve?.avisos.length ?? 0);
  return {
    zonas,
    viento,
    nieve,
    huecos,
    errores,
    avisos,
    listo: huecos.length === 0 && errores === 0 && (viento !== null || nieve !== null),
  };
}

// ── Publicación ─────────────────────────────────────────────────────────────

export interface PubZonaCubierta {
  zona: string;
  /** Área en planta de una pieza, m². */
  area: number;
  /** Área de influencia usada, m². */
  A: number;
  cpe: Cpe;
  /** qe · cpe, kN/m². */
  succion: number | null;
  presion: number | null;
}

export interface PubDireccionCubierta {
  theta: 0 | 90;
  b: number;
  d: number;
  e: number;
  zonas: PubZonaCubierta[];
}

/**
 * La cubierta a dos aguas dentro de `viento`. Se añadió en la v1.1 sin subir
 * `PUB_VERSION`: es opcional y aditivo, y un lector de la v1 lo ignora.
 */
export interface PubCubierta {
  pendiente: number;
  alturaCoronacion: number;
  cumbrera: EjeCumbrera;
  ce: number;
  qe: number;
  areaInfluencia: number | null;
  perpendicular: PubDireccionCubierta;
  paralela: PubDireccionCubierta;
}

export interface PubDireccionParamentos {
  eje: EjeCumbrera;
  d: number;
  b: number;
  e: number;
  esbeltez: number;
  zonas: { zona: string; ancho: number; area: number; A: number; cpe: number; presion: number }[];
}

/** Los paramentos verticales dentro de `viento`: opcional y aditivo, como `cubierta`. */
export interface PubParamentos {
  h: number;
  alturaFachada: number;
  ce: number;
  qe: number;
  areaInfluencia: number | null;
  x: PubDireccionParamentos;
  y: PubDireccionParamentos;
}

/** El resumen de una dirección. `rozamiento` y `encima` se añadieron en la v1.2 como opcionales. */
export interface PubDireccionViento {
  esbeltez: number;
  cp: number;
  cs: number;
  /** Suma de las fuerzas por planta, con rozamiento y lo de encima de la cubierta incluidos. */
  Ftotal: number;
  /** Rozamiento del art. 3.3.2-3; `aplicado` dice si está dentro de las fuerzas. */
  rozamiento?: { cfr: number; F: number; aplicado: boolean };
  /** Hastial o faldones sumados a la planta de cubierta. */
  encima?: { tipo: 'hastial' | 'faldones'; F: number };
}

/** Esquema v1 de lo que este módulo publica. Cambiarlo (salvo añadir campos opcionales) obliga a subir `PUB_VERSION`. */
export interface PubVientoNieve {
  provincia: string;
  provinciaIne: string;
  municipio: string;
  altitud: number | null;
  viento: {
    zonaEolica: ZonaEolica;
    vb: number | null;
    qb: number;
    qbOrigen: VientoResultado['qbOrigen'];
    aspereza: GradoAspereza;
    /** Altura del último forjado, m. */
    H: number;
    /** Altura del edificio, m: la coronación con cubierta inclinada. Opcional desde la v1.2. */
    alturaEdificio?: number;
    x: PubDireccionViento;
    y: PubDireccionViento;
    /** Fuerza por planta que va al programa: banda, rozamiento repartido y, en cubierta, el hastial o los faldones. */
    fuerzas: { nombre: string; z: number; Fx: number; Fy: number }[];
    cubierta?: PubCubierta;
    paramentos?: PubParamentos;
  } | null;
  nieve: {
    zonaInvernal: ZonaInvernal;
    sk: number;
    skOrigen: NieveResultado['skOrigen'];
    exposicion: ExposicionNieve;
    qnMax: number;
    faldones: { nombre: string; inclinacion: number; mu: number; qn: number }[];
  } | null;
}

function pubCubierta(c: CubiertaResuelta): PubCubierta {
  const direccion = (d: DireccionResuelta): PubDireccionCubierta => ({
    theta: d.theta,
    b: d.b,
    d: d.d,
    e: d.e,
    zonas: d.zonas.map((z) => ({ zona: z.zona, area: z.area, A: z.A, cpe: z.cpe, succion: z.succion, presion: z.presion })),
  });
  return {
    pendiente: c.pendiente,
    alturaCoronacion: c.alturaCoronacion,
    cumbrera: c.cumbrera,
    ce: c.ce,
    qe: c.qe,
    areaInfluencia: c.areaInfluencia,
    perpendicular: direccion(c.perpendicular),
    paralela: direccion(c.paralela),
  };
}

function pubParamentos(p: ParamentosResueltos): PubParamentos {
  const direccion = (d: DireccionParamentos): PubDireccionParamentos => ({
    eje: d.eje,
    d: d.d,
    b: d.b,
    e: d.e,
    esbeltez: d.esbeltez,
    zonas: d.zonas.map((z) => ({ zona: z.zona, ancho: z.ancho, area: z.area, A: z.A, cpe: z.cpe, presion: z.presion })),
  });
  return { h: p.h, alturaFachada: p.alturaFachada, ce: p.ce, qe: p.qe, areaInfluencia: p.areaInfluencia, x: direccion(p.x), y: direccion(p.y) };
}

export function datosPublicacion(state: VientoNieveState, ev: Evaluacion): PubVientoNieve | null {
  const provincia = ev.zonas.provincia;
  if (!ev.listo || !provincia) return null;
  const { viento, nieve, zonas } = ev;
  const resumen = (d: VientoResultado['x']): PubDireccionViento => ({
    esbeltez: d.esbeltez,
    cp: d.cp,
    cs: d.cs,
    Ftotal: d.Ftotal,
    ...(d.rozamiento ? { rozamiento: { cfr: d.rozamiento.cfr, F: d.rozamiento.F, aplicado: d.rozamiento.aplicado } } : {}),
    ...(d.encima ? { encima: { tipo: d.encima.tipo, F: d.encima.F } } : {}),
  });
  return {
    provincia: provincia.nombre,
    provinciaIne: provincia.ine,
    municipio: state.emplazamiento.municipio.trim(),
    altitud: state.emplazamiento.altitud,
    viento:
      viento && zonas.zonaEolica
        ? {
            zonaEolica: zonas.zonaEolica,
            vb: viento.vb,
            qb: viento.qb,
            qbOrigen: viento.qbOrigen,
            aspereza: viento.aspereza,
            H: viento.H,
            alturaEdificio: viento.alturaEdificio,
            x: resumen(viento.x),
            y: resumen(viento.y),
            fuerzas: viento.x.plantas.map((p, i) => ({
              nombre: p.nombre,
              z: p.z,
              Fx: p.F,
              Fy: viento.y.plantas[i].F,
            })),
            ...(viento.cubierta ? { cubierta: pubCubierta(viento.cubierta) } : {}),
            ...(viento.paramentos ? { paramentos: pubParamentos(viento.paramentos) } : {}),
          }
        : null,
    nieve:
      nieve && nieve.sk !== null && zonas.zonaInvernal
        ? {
            zonaInvernal: zonas.zonaInvernal,
            sk: nieve.sk,
            skOrigen: nieve.skOrigen,
            exposicion: state.nieve.exposicion,
            qnMax: nieve.faldones.reduce((m, f) => Math.max(m, f.qn, f.limahoya?.qn ?? 0), 0),
            faldones: nieve.faldones.map((f) => ({
              nombre: f.nombre,
              inclinacion: f.inclinacion,
              mu: f.mu,
              qn: f.qn,
            })),
          }
        : null,
  };
}

/**
 * Publica el resultado si está listo. Si no lo está, la publicación anterior
 * se queda: un consumidor prefiere un dato fechado a ninguno, y la fecha ya le
 * dice que es viejo.
 */
export function publicarResultado(state: VientoNieveState, ev: Evaluacion): void {
  const datos = datosPublicacion(state, ev);
  if (!datos) return;
  publicar(MODULO_PUB, PUB_VERSION, datos, {
    municipio: datos.municipio || null,
    provincia: datos.provincia,
    ine: datos.provinciaIne,
  });
}
