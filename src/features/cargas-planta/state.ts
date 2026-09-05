/**
 * Estado del módulo «Cargas por planta» y su traducción al motor.
 *
 * Estado anidado (plantas → zonas → permanentes), así que NO usa
 * `useModuleState`: clave propia en localStorage, versión de esquema propia y
 * `normalizar()` defensivo al leer. Mismo enfoque que viento y nieve.
 *
 * Lo tecleado vive aquí; lo derivado (peso propio de la norma, sumas, Gd, Qd,
 * qd) nunca: sale del motor en cada evaluación. La única copia de un derivado
 * ajeno es la nieve tomada de la publicación de Viento y nieve, congelada a
 * propósito con la fecha y la obra del sobre para poder avisar cuando cambie.
 * Lo que sale del cálculo se publica en `concreta-pub-cargas-planta`.
 */

import {
  calcularCargas,
  provinciaPorIne,
  type CargasInput,
  type CargasResultado,
  type CategoriaUso,
  type FamiliaPsi,
  type Psi,
  type TipoForjado,
} from '../../lib/acciones';
import { CATEGORIAS_USO } from '../../lib/acciones/tablasCargas';
import { leerObra } from '../../lib/obra';
import { publicar } from '../../lib/pub';
import {
  CANTO_INICIAL,
  CATALOGO_LINEALES,
  CATALOGO_PERMANENTES,
  PERMANENTES_INICIALES,
  PLANTAS_INICIALES,
  type NieveModo,
} from './catalogos';
import { avisosNieve, leerNievePublicada, type NievePublicada } from './nievePub';

export const STORAGE_KEY = 'concreta-cargas-planta-model';
export const SCHEMA_VERSION_KEY = 'concreta-cargas-planta-model-version';
export const SCHEMA_VERSION = '1';

/** Nombre del módulo en las publicaciones y versión del esquema de `datos`. */
export const MODULO_PUB = 'cargas-planta';
export const PUB_VERSION = 1;

// ── Forma del estado ────────────────────────────────────────────────────────

export interface Emplazamiento {
  /** Código INE de la provincia, dos dígitos. '' = sin decir. */
  provincia: string;
  /** Texto libre; sólo se imprime y viaja en el sobre. */
  municipio: string;
  /** m. Decide los ψ de la nieve (> 1.000 m). null = sin decir. */
  altitud: number | null;
}

export interface NieveUI {
  modo: NieveModo;
  /** kN/m². Copiado del sobre en modo `publicada`, tecleado en `manual`. */
  valor: number;
  /** Fecha del sobre del que se copió, para avisar si hay uno más nuevo. */
  tsPub: string | null;
  /** INE del sobre, para avisar si es de otra obra. */
  inePub: string | null;
  /** Faldón elegido en la publicación; null = el máximo. */
  faldon: string | null;
}

export interface PermanenteUI {
  id: string;
  concepto: string;
  /** kN/m². */
  valor: number;
  catalogoId: string | null;
  /** m; sólo en las entradas del catálogo que van por espesor (agua, tierra). */
  espesor: number | null;
}

export interface UsoUI {
  categoria: CategoriaUso | 'otro';
  /** kN/m², sólo con `categoria = 'otro'`. */
  qkManual: number;
  /** Grados, sólo G. */
  inclinacion: number;
  /** Sólo G. */
  ligera: boolean;
  escalera: boolean;
  balcon: boolean;
  /** Sólo F. */
  accesoDesde: CategoriaUso;
  /** Sólo 'otro'. */
  psiComo: FamiliaPsi;
}

export interface ZonaUI {
  id: string;
  /** '' = la planta entera. */
  nombre: string;
  forjado: { tipo: TipoForjado; canto: number; ppManual: number | null };
  permanentes: PermanenteUI[];
  uso: UsoUI;
}

export interface PlantaUI {
  id: string;
  nombre: string;
  esCubierta: boolean;
  nieve: NieveUI;
  zonas: ZonaUI[];
}

export interface LinealUI {
  id: string;
  concepto: string;
  /** kN/m. */
  valor: number;
  catalogoId: string | null;
}

export interface CargasState {
  emplazamiento: Emplazamiento;
  plantas: PlantaUI[];
  lineales: LinealUI[];
  /** Modo Ayuda: encendido por defecto. */
  ayuda: boolean;
}

// ── Valores por defecto ─────────────────────────────────────────────────────

let contador = 0;
export function nuevoId(prefijo = 'p'): string {
  contador += 1;
  return `${prefijo}${Date.now().toString(36)}${contador.toString(36)}`;
}

export function nievePorDefecto(): NieveUI {
  return { modo: 'ninguna', valor: 0, tsPub: null, inePub: null, faldon: null };
}

export function usoPorDefecto(categoria: CategoriaUso | 'otro' = 'A1'): UsoUI {
  return { categoria, qkManual: 0, inclinacion: 0, ligera: false, escalera: false, balcon: false, accesoDesde: 'A1', psiComo: 'A' };
}

/** Una carga permanente del catálogo, con su valor propuesto (o el que da el espesor). */
export function nuevoPermanente(catalogoId: string, espesor = 1): PermanenteUI {
  const c = CATALOGO_PERMANENTES.find((e) => e.id === catalogoId);
  if (!c || c.id === 'otro') return { id: nuevoId('c'), concepto: '', valor: 0, catalogoId: null, espesor: null };
  if (c.porEspesor !== null) return { id: nuevoId('c'), concepto: c.etiqueta, valor: c.porEspesor * espesor, catalogoId: c.id, espesor };
  return { id: nuevoId('c'), concepto: c.etiqueta, valor: c.valor ?? 0, catalogoId: c.id, espesor: null };
}

export function nuevoLineal(catalogoId: string): LinealUI {
  const c = CATALOGO_LINEALES.find((e) => e.id === catalogoId);
  if (!c || c.id === 'otro') return { id: nuevoId('l'), concepto: '', valor: 0, catalogoId: null };
  return { id: nuevoId('l'), concepto: c.etiqueta, valor: c.valor ?? 0, catalogoId: c.id };
}

export function nuevaZona(esCubierta: boolean, nombre = ''): ZonaUI {
  const ids = esCubierta ? PERMANENTES_INICIALES.cubierta : PERMANENTES_INICIALES.planta;
  return {
    id: nuevoId('z'),
    nombre,
    forjado: { tipo: 'reticular', canto: CANTO_INICIAL.reticular, ppManual: null },
    permanentes: ids.map((id) => nuevoPermanente(id)),
    uso: usoPorDefecto(esCubierta ? 'G' : 'A1'),
  };
}

export function nuevaPlanta(nombre: string, esCubierta = false): PlantaUI {
  return { id: nuevoId('p'), nombre, esCubierta, nieve: nievePorDefecto(), zonas: [nuevaZona(esCubierta)] };
}

/** La planta que se añade detrás de la última: una copia de ella con otro nombre e ids nuevos. */
export function duplicarPlanta(p: PlantaUI, nombre = `${p.nombre} (copia)`): PlantaUI {
  return {
    ...p,
    id: nuevoId('p'),
    nombre,
    nieve: { ...p.nieve },
    zonas: p.zonas.map((z) => ({
      ...z,
      id: nuevoId('z'),
      forjado: { ...z.forjado },
      permanentes: z.permanentes.map((c) => ({ ...c, id: nuevoId('c') })),
      uso: { ...z.uso },
    })),
  };
}

export function siguientePlanta(plantas: PlantaUI[]): PlantaUI {
  return nuevaPlanta(`Planta ${plantas.length + 1}`);
}

/**
 * Estado de arranque: tres plantas, la última cubierta. El emplazamiento se
 * hereda del contexto de obra si lo hay; si no, queda vacío. Nada de
 * municipio por defecto: un valor que el usuario no ha elegido no es un dato.
 */
export function defaultCargasState(): CargasState {
  const obra = leerObra();
  return {
    emplazamiento: {
      provincia: obra?.provincia ?? '',
      municipio: obra?.municipio ?? '',
      altitud: obra?.altitud ?? null,
    },
    plantas: PLANTAS_INICIALES.map((p) => nuevaPlanta(p.nombre, p.esCubierta)),
    lineales: [nuevoLineal('fachada')],
    ayuda: true,
  };
}

// ── Lectura defensiva ───────────────────────────────────────────────────────

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const bool = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def);
const numero = (v: unknown, def: number) => (typeof v === 'number' && Number.isFinite(v) ? v : def);
const numeroONull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const texto = (v: unknown, def: string) => (typeof v === 'string' ? v : def);
const textoONull = (v: unknown) => (typeof v === 'string' ? v : null);
const uno = <T extends string>(v: unknown, permitidos: readonly T[], def: T): T => (permitidos.includes(v as T) ? (v as T) : def);

const TIPOS_FORJADO: readonly TipoForjado[] = ['losa', 'solera', 'reticular', 'unidireccional', 'chapa', 'madera', 'otro'];
const FAMILIAS: readonly FamiliaPsi[] = ['A', 'B', 'C', 'D', 'E', 'G'];
const CATEGORIAS: readonly (CategoriaUso | 'otro')[] = [...CATEGORIAS_USO, 'otro'];

function normalizarZona(bruto: unknown, esCubierta: boolean): ZonaUI {
  const base = nuevaZona(esCubierta);
  if (!esObjeto(bruto)) return base;
  const f = esObjeto(bruto.forjado) ? bruto.forjado : {};
  const u = esObjeto(bruto.uso) ? bruto.uso : {};
  const tipo = uno(f.tipo, TIPOS_FORJADO, 'reticular');
  return {
    id: texto(bruto.id, nuevoId('z')),
    nombre: texto(bruto.nombre, ''),
    forjado: { tipo, canto: numero(f.canto, CANTO_INICIAL[tipo]), ppManual: numeroONull(f.ppManual) },
    permanentes: Array.isArray(bruto.permanentes)
      ? bruto.permanentes.filter(esObjeto).map(
          (c): PermanenteUI => ({
            id: texto(c.id, nuevoId('c')),
            concepto: texto(c.concepto, ''),
            valor: numero(c.valor, 0),
            catalogoId: textoONull(c.catalogoId),
            espesor: numeroONull(c.espesor),
          }),
        )
      : base.permanentes,
    uso: {
      categoria: uno(u.categoria, CATEGORIAS, base.uso.categoria),
      qkManual: numero(u.qkManual, 0),
      inclinacion: numero(u.inclinacion, 0),
      ligera: bool(u.ligera, false),
      escalera: bool(u.escalera, false),
      balcon: bool(u.balcon, false),
      accesoDesde: uno(u.accesoDesde, CATEGORIAS_USO, 'A1'),
      psiComo: uno(u.psiComo, FAMILIAS, 'A'),
    },
  };
}

/**
 * Un estado guardado por una versión anterior, o manipulado a mano, no puede
 * tumbar el módulo. Todo lo que no se reconozca cae al valor por defecto.
 */
export function normalizar(bruto: unknown): CargasState {
  const base = defaultCargasState();
  if (!esObjeto(bruto)) return base;
  const e = esObjeto(bruto.emplazamiento) ? bruto.emplazamiento : {};

  const plantas = Array.isArray(bruto.plantas)
    ? bruto.plantas.filter(esObjeto).map((p, i): PlantaUI => {
        const esCubierta = bool(p.esCubierta, false);
        const n = esObjeto(p.nieve) ? p.nieve : {};
        const zonas = Array.isArray(p.zonas) ? p.zonas.filter(esObjeto).map((z) => normalizarZona(z, esCubierta)) : [];
        return {
          id: texto(p.id, nuevoId('p')),
          nombre: texto(p.nombre, `Planta ${i + 1}`),
          esCubierta,
          nieve: {
            modo: uno(n.modo, ['ninguna', 'publicada', 'manual'] as const, 'ninguna'),
            valor: numero(n.valor, 0),
            tsPub: textoONull(n.tsPub),
            inePub: textoONull(n.inePub),
            faldon: textoONull(n.faldon),
          },
          zonas: zonas.length > 0 ? zonas : [nuevaZona(esCubierta)],
        };
      })
    : base.plantas;

  const lineales = Array.isArray(bruto.lineales)
    ? bruto.lineales.filter(esObjeto).map(
        (l): LinealUI => ({
          id: texto(l.id, nuevoId('l')),
          concepto: texto(l.concepto, ''),
          valor: numero(l.valor, 0),
          catalogoId: textoONull(l.catalogoId),
        }),
      )
    : base.lineales;

  return {
    emplazamiento: {
      provincia: typeof e.provincia === 'string' && provinciaPorIne(e.provincia) ? e.provincia : '',
      municipio: texto(e.municipio, ''),
      altitud: numeroONull(e.altitud),
    },
    plantas,
    lineales,
    ayuda: bool(bruto.ayuda, true),
  };
}

export function cargarEstado(): CargasState {
  try {
    if (localStorage.getItem(SCHEMA_VERSION_KEY) !== SCHEMA_VERSION) return defaultCargasState();
    const bruto = localStorage.getItem(STORAGE_KEY);
    if (!bruto) return defaultCargasState();
    return normalizar(JSON.parse(bruto));
  } catch {
    return defaultCargasState();
  }
}

export function guardarEstado(state: CargasState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    localStorage.setItem(SCHEMA_VERSION_KEY, SCHEMA_VERSION);
  } catch {
    // Almacenamiento lleno o modo privado: se ignora, como en el resto de módulos.
  }
}

// ── Traducción al motor ─────────────────────────────────────────────────────

export function entradaMotor(state: CargasState): CargasInput {
  return {
    ...(state.emplazamiento.altitud !== null ? { altitud: state.emplazamiento.altitud } : {}),
    plantas: state.plantas.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      esCubierta: p.esCubierta,
      ...(p.esCubierta && p.nieve.modo !== 'ninguna' ? { nieve: p.nieve.valor } : {}),
      zonas: p.zonas.map((z) => ({
        id: z.id,
        nombre: z.nombre,
        forjado: {
          tipo: z.forjado.tipo,
          canto: z.forjado.canto,
          ...(z.forjado.ppManual !== null ? { ppManual: z.forjado.ppManual } : {}),
        },
        permanentes: z.permanentes.map((c) => ({ concepto: c.concepto.trim() || 'Carga permanente', valor: c.valor })),
        uso: {
          categoria: z.uso.categoria,
          ...(z.uso.categoria === 'otro' ? { qkManual: z.uso.qkManual, psiComo: z.uso.psiComo } : {}),
          ...(z.uso.categoria === 'G' ? { inclinacion: z.uso.inclinacion, ligera: z.uso.ligera } : {}),
          ...(z.uso.categoria === 'F' ? { accesoDesde: z.uso.accesoDesde } : {}),
          escalera: z.uso.escalera,
          balcon: z.uso.balcon,
        },
      })),
    })),
    lineales: state.lineales.map((l) => ({ id: l.id, concepto: l.concepto, valor: l.valor })),
  };
}

// ── Evaluación completa ─────────────────────────────────────────────────────

export interface Evaluacion {
  resultado: CargasResultado;
  /** Avisos de la nieve tomada de la publicación: más nueva, de otra obra, desaparecida. */
  avisosNieve: string[];
  errores: number;
  avisos: number;
  /** Exportar y publicar exigen que no haya errores. */
  listo: boolean;
}

export function evaluar(state: CargasState, nievePub: NievePublicada | null = leerNievePublicada()): Evaluacion {
  const resultado = calcularCargas(entradaMotor(state));
  const avisosDeNieve = avisosNieve(state, nievePub);
  const errores = resultado.errores.length;
  return {
    resultado,
    avisosNieve: avisosDeNieve,
    errores,
    avisos: resultado.avisos.length + avisosDeNieve.length,
    listo: errores === 0 && state.plantas.length > 0,
  };
}

// ── Publicación ─────────────────────────────────────────────────────────────

export interface PubZonaCargas {
  /** null = la planta entera. */
  nombre: string | null;
  forjado: { tipo: TipoForjado; canto: number };
  /** kN/m². */
  pp: number;
  resto: number;
  G: number;
  /** «A1», «G», «otro». */
  categoria: string;
  /** La fila de la tabla 3.1 que se ha aplicado: «G1», «G1-G2», «otro»… */
  fila: string;
  qUso: number;
  qkConcentrada: number | null;
  nieve: number | null;
  psi: Psi;
  Gd: number;
  Qd: number;
  qd: number;
}

export interface PubPlantaCargas {
  nombre: string;
  esCubierta: boolean;
  zonas: PubZonaCargas[];
}

/** Esquema v1 de lo que este módulo publica. Cambiarlo (salvo añadir campos opcionales) obliga a subir `PUB_VERSION`. */
export interface PubCargasPlanta {
  provincia: string | null;
  provinciaIne: string | null;
  municipio: string;
  altitud: number | null;
  plantas: PubPlantaCargas[];
  lineales: { concepto: string; gk: number; Gd: number }[];
  gamma: { G: number; Q: number; A: number };
  /** El sobre de Viento y nieve del que se tomó la nieve, si se tomó de uno. */
  nieveOrigen: { ts: string; ine: string | null } | null;
}

export function datosPublicacion(state: CargasState, ev: Evaluacion): PubCargasPlanta | null {
  if (!ev.listo) return null;
  const provincia = state.emplazamiento.provincia ? (provinciaPorIne(state.emplazamiento.provincia) ?? null) : null;
  const origen = state.plantas.find((p) => p.esCubierta && p.nieve.modo === 'publicada' && p.nieve.tsPub !== null);
  const r = ev.resultado;
  return {
    provincia: provincia?.nombre ?? null,
    provinciaIne: provincia?.ine ?? null,
    municipio: state.emplazamiento.municipio.trim(),
    altitud: state.emplazamiento.altitud,
    plantas: r.plantas.map((p) => ({
      nombre: p.nombre,
      esCubierta: p.esCubierta,
      zonas: p.zonas.map((z) => ({
        nombre: z.nombre || null,
        forjado: { tipo: z.forjado.tipo, canto: z.forjado.canto },
        pp: z.forjado.pp,
        resto: z.resto,
        G: z.G,
        categoria: z.uso.categoria,
        fila: z.uso.fila,
        qUso: z.uso.qUso,
        qkConcentrada: z.uso.qkConcentrada,
        nieve: z.nieve,
        psi: { ...z.uso.psi },
        Gd: z.Gd,
        Qd: z.Qd,
        qd: z.qd,
      })),
    })),
    lineales: r.lineales.map((l) => ({ concepto: l.concepto, gk: l.gk, Gd: l.Gd })),
    gamma: { ...r.gamma },
    nieveOrigen: origen ? { ts: origen.nieve.tsPub as string, ine: origen.nieve.inePub } : null,
  };
}

/**
 * Publica el resultado si está listo. Si no lo está, la publicación anterior
 * se queda: un consumidor prefiere un dato fechado a ninguno, y la fecha ya le
 * dice que es viejo.
 */
export function publicarResultado(state: CargasState, ev: Evaluacion): void {
  const datos = datosPublicacion(state, ev);
  if (!datos) return;
  publicar(MODULO_PUB, PUB_VERSION, datos, {
    municipio: datos.municipio || null,
    provincia: datos.provincia,
    ine: datos.provinciaIne,
  });
}
