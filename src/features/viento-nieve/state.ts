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
  calcularNieve,
  calcularViento,
  ORDEN_ASPEREZAS,
  provinciaPorIne,
  QB_SIMPLIFICADO,
  ZONAS_INVERNALES,
  type ExposicionNieve,
  type GradoAspereza,
  type NieveInput,
  type NieveResultado,
  type Provincia,
  type VientoInput,
  type VientoResultado,
  type ZonaEolica,
  type ZonaInvernal,
} from '../../lib/acciones';
import { leerObra } from '../../lib/obra';
import { publicar } from '../../lib/pub';
import {
  ALTURA_PLANTA_TIPO,
  PLANTAS_INICIALES,
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
  /** Altura del forjado sobre rasante, m. */
  h: number;
}

export interface VientoUI {
  activo: boolean;
  qbModo: QbModo;
  /** kN/m². Sólo cuenta con `qbModo = 'manual'`. */
  qbManual: number;
  aspereza: GradoAspereza;
  plantas: PlantaUI[];
  dimensiones: { x: number; y: number };
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

export function nuevaPlanta(nombre: string, h: number): PlantaUI {
  return { id: nuevoId('p'), nombre, h };
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

/** La planta que se añade detrás de la última: su altura más una planta tipo. */
export function siguientePlanta(plantas: PlantaUI[]): PlantaUI {
  const ultima = plantas.reduce((m, p) => Math.max(m, p.h), 0);
  return nuevaPlanta(`Planta ${plantas.length + 1}`, ultima + ALTURA_PLANTA_TIPO);
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
      plantas: PLANTAS_INICIALES.map((p) => nuevaPlanta(p.nombre, p.h)),
      dimensiones: { x: 20, y: 12 },
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

// ── Lectura defensiva ───────────────────────────────────────────────────────

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const bool = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def);
const numero = (v: unknown, def: number) => (typeof v === 'number' && Number.isFinite(v) ? v : def);
const texto = (v: unknown, def: string) => (typeof v === 'string' ? v : def);
const uno = <T extends string>(v: unknown, permitidos: readonly T[], def: T): T =>
  permitidos.includes(v as T) ? (v as T) : def;

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

  const plantas = Array.isArray(v.plantas)
    ? v.plantas.filter(esObjeto).map(
        (p, i): PlantaUI => ({
          id: texto(p.id, nuevoId('p')),
          nombre: texto(p.nombre, `Planta ${i + 1}`),
          h: numero(p.h, 0),
        }),
      )
    : base.viento.plantas;

  const faldones = Array.isArray(n.faldones)
    ? n.faldones.filter(esObjeto).map(
        (f, i): FaldonUI => ({
          id: texto(f.id, nuevoId('f')),
          nombre: texto(f.nombre, `Faldón ${i + 1}`),
          inclinacion: numero(f.inclinacion, 0),
          impedimento: bool(f.impedimento, false),
          L: typeof f.L === 'number' && Number.isFinite(f.L) ? f.L : null,
          limahoya: uno(f.limahoya, ['ninguna', 'contrario', 'mismoSentido'] as const, 'ninguna'),
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
      plantas,
      dimensiones: { x: numero(dims.x, 20), y: numero(dims.y, 12) },
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
    ...(state.emplazamiento.altitud !== null ? { altitud: state.emplazamiento.altitud } : {}),
    plantas: v.plantas.map((p) => ({ id: p.id, nombre: p.nombre.trim() || 'Planta', h: p.h })),
    dimensiones: { ...v.dimensiones },
  };
}

export function entradaNieve(state: VientoNieveState, zonas: Zonas): NieveInput | null {
  const e = state.emplazamiento;
  if (!state.nieve.activo || zonas.zonaInvernal === null || e.altitud === null) return null;
  const n = state.nieve;
  return {
    zona: zonas.zonaInvernal,
    altitud: e.altitud,
    ...(zonas.skCapital !== null ? { skCapital: zonas.skCapital } : {}),
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

/** Esquema v1 de lo que este módulo publica. Cambiarlo obliga a subir `PUB_VERSION`. */
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
    H: number;
    x: { esbeltez: number; cp: number; cs: number; Ftotal: number };
    y: { esbeltez: number; cp: number; cs: number; Ftotal: number };
    fuerzas: { nombre: string; z: number; Fx: number; Fy: number }[];
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

export function datosPublicacion(state: VientoNieveState, ev: Evaluacion): PubVientoNieve | null {
  const provincia = ev.zonas.provincia;
  if (!ev.listo || !provincia) return null;
  const { viento, nieve, zonas } = ev;
  const resumen = (d: VientoResultado['x']) => ({ esbeltez: d.esbeltez, cp: d.cp, cs: d.cs, Ftotal: d.Ftotal });
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
            x: resumen(viento.x),
            y: resumen(viento.y),
            fuerzas: viento.x.plantas.map((p, i) => ({
              nombre: p.nombre,
              z: p.z,
              Fx: p.F,
              Fy: viento.y.plantas[i].F,
            })),
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
