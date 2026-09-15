/**
 * Estado del módulo «Incendio» y su publicación.
 *
 * Estado anidado (plantas, sectores, exigencias), así que NO usa
 * `useModuleState`: clave propia en localStorage, versión de esquema propia y
 * `normalizar()` defensivo al leer. Mismo enfoque que viento y nieve, cargas
 * por planta y el cuadro de materiales.
 *
 * Lo tecleado vive aquí; lo derivado —las cotas, la altura de evacuación, la R
 * que sale de la tabla 3.1— nunca: sale del motor en cada evaluación. La única
 * excepción son las anotaciones de planta (altura y bajo rasante), que NO son
 * derivadas: son datos de este módulo pegados a plantas que teclea otro.
 */

import { versionViva } from '../../data/proyectoKeys';
import { alturasDeEvacuacion, type AlturasEdificio, type ModoAltura } from '../../lib/incendio/altura';
import { exigenciasResueltas, type ExigenciaFuego } from '../../lib/incendio/exigencias';
import {
  clasesValidas,
  datosAnejoBIniciales,
  notaSueloEntreSectores,
  resolverSectores,
  type DatosAnejoB,
  type SectorEntrada,
  type SectorResuelto,
} from '../../lib/incendio/sectores';
import {
  entradaHormigonInicial,
  TIPOS_HORMIGON,
  type EntradaHormigon,
  type TipoHormigon,
} from '../../lib/incendio/anejoC';
import {
  entradaAceroInicial,
  MODOS_CALENTAMIENTO,
  ROTULOS_PERFIL,
  TIPOS_ACERO,
  type EntradaAcero,
  type ModoCalentamiento,
  type TipoAcero,
} from '../../lib/incendio/anejoD';
import {
  resolverElementos,
  type ElementoEntrada,
  type ElementoResuelto,
  type EntradaProteccion,
} from '../../lib/incendio/elementos';
import { familiaPorId } from '../../lib/incendio/protecciones';
import {
  ACTIVIDADES_B3,
  CONSECUENCIAS_B5,
  KB_POR_DEFECTO,
  M_CELULOSICO,
  USOS_B6,
  type ActividadB3,
  type ConsecuenciasB5,
  type MaterialSeccion,
  type UsoB6,
} from '../../lib/incendio/anejoB';
import { USOS_DB_SI } from '../../lib/incendio/tabla31';
import { leerObra } from '../../lib/obra';
import { leerPublicacion, publicar, retirarPublicacion } from '../../lib/pub';
import { escribirClave, leerClave } from '../../lib/storage/seguro';
import {
  cuentaParaEvacuacion,
  plantasPublicadas,
  tsDePlantasPublicadas,
  type PlantaPublicada,
} from './plantasPub';

export const STORAGE_KEY = 'concreta-incendio-model';
export const SCHEMA_VERSION_KEY = 'concreta-incendio-model-version';
export const SCHEMA_VERSION = versionViva('concreta-incendio');

/** El título del documento, fuera del estado de cálculo (ver `useDocTitle`). */
export const CLAVE_TITULO = 'concreta-incendio-title';

/** Nombre del módulo en las publicaciones y versión del esquema de `datos`. */
export const MODULO_PUB = 'incendio';
export const PUB_VERSION = 1;

// ── Forma del estado ────────────────────────────────────────────────────────

/**
 * Una exigencia tecleada a pelo. `minutos` en null es el hueco rojo: la fila
 * existe pero no dice nada.
 *
 * Conviven con los sectores: los sectores derivan su R de la tabla 3.1, y estas
 * filas son para lo que no es un sector —«los soportes del voladizo»— y para lo
 * que se heredó del cuadro de materiales.
 */
export interface FilaExigencia {
  id: string;
  ambito: string;
  minutos: number | null;
}

/**
 * Lo que este módulo le añade a una planta que publica «Cargas por planta».
 *
 * Se pega por NOMBRE, que es lo único que identifica a una planta en aquel
 * sobre. Si allí se renombra una planta, su anotación queda huérfana y se
 * avisa en vez de tirarla: la altura tecleada no se pierde por un cambio de
 * rótulo.
 */
export interface AnotacionPlanta {
  nombre: string;
  /** m. Total o libre según `modoAltura`. `null` = sin decir. */
  altura: number | null;
  /**
   * m. Canto del forjado de esta planta, tecleado a mano. `null` = el que
   * publica «Cargas por planta». Sólo hace falta tecleándolo cuando allí la
   * planta tiene zonas con cantos distintos y no hay uno solo que valga.
   */
  cantoManual: number | null;
  bajoRasante: boolean;
  /** `null` = lo que proponga la categoría de uso publicada. */
  cuenta: boolean | null;
}

export type SectorUI = SectorEntrada;

export interface IncendioState {
  /**
   * Qué significan las alturas que se teclean: la TOTAL de forjado a forjado
   * —con el canto dentro, como se acotan los planos de estructura— o la LIBRE
   * de una sección de arquitectura, a la que hay que sumarle el canto del
   * forjado de encima. Por obra, no por planta: en un edificio se lee de una
   * manera o de otra, no de las dos.
   */
  modoAltura: ModoAltura;
  /** Anotaciones de las plantas publicadas por «Cargas por planta». */
  plantas: AnotacionPlanta[];
  /** Altura de evacuación tecleada a mano. `null` = la que sale de las plantas. */
  alturaEvacuacionManual: number | null;
  /** Los sectores de incendio, de los que sale la R por la tabla 3.1. */
  sectores: SectorUI[];
  /** Exigencias sueltas, tecleadas a mano o heredadas del cuadro de materiales. */
  exigencias: FilaExigencia[];
  /** Las secciones que se comprueban por los anejos C y D. */
  elementos: ElementoEntrada[];
  /** Modo Ayuda: los rótulos largos de al lado de cada campo. */
  ayuda: boolean;
}

let contador = 0;
export function nuevoId(prefijo = 'f'): string {
  contador += 1;
  return `${prefijo}${Date.now().toString(36)}${contador.toString(36)}`;
}

export function nuevoElemento(nombre = ''): ElementoEntrada {
  return {
    id: nuevoId('e'),
    nombre,
    sectorId: '',
    exigidaManual: null,
    material: 'hormigon',
    hormigon: entradaHormigonInicial(),
    acero: entradaAceroInicial(),
    proteccion: { familia: '', lambda: null },
  };
}

export function nuevoSector(nombre = ''): SectorUI {
  return {
    id: nuevoId('s'),
    nombre,
    clase: '',
    sotano: false,
    robotizado: false,
    adosada: false,
    bajoCubiertaSinRiesgo: false,
    minutosManual: null,
    anejoB: null,
  };
}

export function defaultIncendioState(): IncendioState {
  return {
    // La total por defecto: es la que no depende de nada más.
    modoAltura: 'total',
    plantas: [],
    alturaEvacuacionManual: null,
    sectores: [],
    exigencias: [],
    elementos: [],
    ayuda: false,
  };
}

/** Sin sectores, exigencias ni elementos no hay nada que decir. */
export function esEstadoInicial(s: IncendioState): boolean {
  return s.sectores.length === 0 && s.exigencias.length === 0 && s.elementos.length === 0;
}

export function estaConfigurado(s: IncendioState): boolean {
  return !esEstadoInicial(s);
}

// ── Lectura defensiva ───────────────────────────────────────────────────────

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

const texto = (v: unknown, def = '') => (typeof v === 'string' ? v : def);
const bool = (v: unknown, def = false) => (typeof v === 'boolean' ? v : def);

function positivoONull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * `minutos` NO se acota a las clases tabuladas (30/60/90/120/180/240).
 *
 * El desplegable ofrece esas seis porque son las que se piden en obra, pero el
 * DB SI 6 §3.1.b admite declarar el tiempo equivalente del Anejo B, y ése sale
 * en minutos exactos: el ejemplo del propio anejo da 96,23, que se declara como
 * 97. Acotar aquí a la lista del desplegable tiraría ese dato al releer.
 */
function normalizarMinutos(v: unknown): number | null {
  const n = positivoONull(v);
  return n === null ? null : Math.ceil(n);
}

export function normalizarExigencias(brutas: unknown): FilaExigencia[] {
  if (!Array.isArray(brutas)) return [];
  return brutas.filter(esObjeto).map((f) => ({
    id: texto(f.id) || nuevoId(),
    ambito: texto(f.ambito),
    minutos: normalizarMinutos(f.minutos),
  }));
}

export function normalizarPlantas(brutas: unknown): AnotacionPlanta[] {
  if (!Array.isArray(brutas)) return [];
  return brutas
    .filter(esObjeto)
    .filter((p) => texto(p.nombre) !== '')
    .map((p) => ({
      nombre: texto(p.nombre),
      altura: positivoONull(p.altura),
      cantoManual: positivoONull(p.cantoManual),
      bajoRasante: bool(p.bajoRasante),
      cuenta: typeof p.cuenta === 'boolean' ? p.cuenta : null,
    }));
}

const MATERIALES: readonly MaterialSeccion[] = ['hormigon', 'aceroProtegido', 'aceroSinProteger'];

/** Lo del Anejo B de un sector, leído a la defensiva. `null` = no lo usa. */
export function normalizarAnejoB(bruto: unknown): DatosAnejoB | null {
  if (!esObjeto(bruto)) return null;
  const d = datosAnejoBIniciales();
  const m = esObjeto(bruto.medidas) ? bruto.medidas : {};
  const uno = <T extends string>(v: unknown, lista: readonly T[]): T | null =>
    typeof v === 'string' && (lista as readonly string[]).includes(v) ? (v as T) : null;
  return {
    af: positivoONull(bruto.af),
    av: typeof bruto.av === 'number' && Number.isFinite(bruto.av) && bruto.av >= 0 ? bruto.av : null,
    ah: typeof bruto.ah === 'number' && Number.isFinite(bruto.ah) && bruto.ah >= 0 ? bruto.ah : 0,
    h: positivoONull(bruto.h),
    at: positivoONull(bruto.at),
    hHuecos: positivoONull(bruto.hHuecos),
    kb: positivoONull(bruto.kb) ?? KB_POR_DEFECTO,
    material: uno(bruto.material, MATERIALES) ?? d.material,
    qfkManual: positivoONull(bruto.qfkManual),
    usoB6: uno<UsoB6>(bruto.usoB6, USOS_B6.map((u) => u.id)),
    m: positivoONull(bruto.m) ?? M_CELULOSICO,
    actividad: uno<ActividadB3>(bruto.actividad, ACTIVIDADES_B3.map((a) => a.id)),
    medidas: {
      deteccion: bool(m.deteccion),
      alarmaBomberos: bool(m.alarmaBomberos),
      extincion: bool(m.extincion),
    },
    consecuencias: uno<ConsecuenciasB5>(bruto.consecuencias, CONSECUENCIAS_B5.map((c) => c.id)),
    // `null` = lo que proponga el uso del sector, como el resto de campos con
    // propuesta de este panel.
    criticidadAlta: typeof bruto.criticidadAlta === 'boolean' ? bruto.criticidadAlta : null,
  };
}

const TIPOS_H = TIPOS_HORMIGON.map((t) => t.id);
const TIPOS_A = TIPOS_ACERO.map((t) => t.id);
const MODOS = MODOS_CALENTAMIENTO.map((m) => m.id);

const unoDe = <T extends string>(v: unknown, lista: readonly T[], def: T): T =>
  typeof v === 'string' && (lista as readonly string[]).includes(v) ? (v as T) : def;

/** Cero o positivo: los diámetros y las relaciones de luces admiten el cero. */
function noNegativoONull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
}

function normalizarHormigon(bruto: unknown): EntradaHormigon {
  const d = entradaHormigonInicial();
  if (!esObjeto(bruto)) return d;
  return {
    tipo: unoDe<TipoHormigon>(bruto.tipo, TIPOS_H, d.tipo),
    b: positivoONull(bruto.b),
    h: positivoONull(bruto.h),
    b0: positivoONull(bruto.b0),
    rnom: positivoONull(bruto.rnom),
    dCerco: noNegativoONull(bruto.dCerco) ?? 0,
    dBarra: positivoONull(bruto.dBarra),
    ejeManual: positivoONull(bruto.ejeManual),
    aridoCalizo: bool(bruto.aridoCalizo),
    mufi: positivoONull(bruto.mufi),
    cargaUniforme: bool(bruto.cargaUniforme, d.cargaUniforme),
    esquinaUnaCapa: bool(bruto.esquinaUnaCapa),
    relacionLuces: positivoONull(bruto.relacionLuces),
    compartimenta: bool(bruto.compartimenta),
    entrevigadoProtegido: bool(bruto.entrevigadoProtegido, d.entrevigadoProtegido),
    ejecutadoEnObra: bool(bruto.ejecutadoEnObra),
    cuantiaAlta: bool(bruto.cuantiaAlta),
    apoyosPuntuales: bool(bruto.apoyosPuntuales),
    traccionado: bool(bruto.traccionado),
  };
}

function normalizarAcero(bruto: unknown): EntradaAcero {
  const d = entradaAceroInicial();
  if (!esObjeto(bruto)) return d;
  const perfil = texto(bruto.perfil);
  return {
    tipo: unoDe<TipoAcero>(bruto.tipo, TIPOS_A, d.tipo),
    // Un perfil que ya no está en el catálogo se cae a «masividad a mano»: la
    // fila sobrevive como hueco en vez de calcular con una sección inventada.
    perfil: ROTULOS_PERFIL.includes(perfil) ? perfil : '',
    modo: unoDe<ModoCalentamiento>(bruto.modo, MODOS, d.modo),
    masividadManual: positivoONull(bruto.masividadManual),
    mufi: positivoONull(bruto.mufi),
    clase4: bool(bruto.clase4),
    arriostrado: bool(bruto.arriostrado, d.arriostrado),
    revestidoFabrica: bool(bruto.revestidoFabrica),
    rFabrica: positivoONull(bruto.rFabrica),
  };
}

/**
 * ¿Pide esta familia el λp declarado del producto? Sólo las aislantes que no
 * lo tienen tabulado: en las demás, un λp guardado es el de OTRO producto —el
 * que se tecleó antes de cambiar de familia— y no puede entrar en la cuenta.
 */
export function familiaPideLambda(familia: string): boolean {
  const f = familiaPorId(familia);
  return f !== undefined && f.lambda === null && f.vehiculo === 'aislante';
}

/** Una protección con el λp sólo si su familia lo pide; si no, en blanco. */
export function proteccionCon(familia: string, lambda: number | null): EntradaProteccion {
  return { familia, lambda: familiaPideLambda(familia) ? lambda : null };
}

function normalizarProteccion(bruto: unknown): EntradaProteccion {
  if (!esObjeto(bruto)) return { familia: '', lambda: null };
  const familia = texto(bruto.familia);
  // Una familia que ya no existe se cae a «sin elegir»: entonces se enuncia
  // la magnitud que hay que alcanzar, que es lo que decía la norma de todos
  // modos, en vez de calcular con un λp inventado.
  return proteccionCon(familiaPorId(familia) ? familia : '', positivoONull(bruto.lambda));
}

export function normalizarElementos(brutos: unknown): ElementoEntrada[] {
  if (!Array.isArray(brutos)) return [];
  return brutos.filter(esObjeto).map((e) => ({
    id: texto(e.id) || nuevoId('e'),
    nombre: texto(e.nombre),
    sectorId: texto(e.sectorId),
    exigidaManual: normalizarMinutos(e.exigidaManual),
    material: e.material === 'acero' ? 'acero' : 'hormigon',
    hormigon: normalizarHormigon(e.hormigon),
    acero: normalizarAcero(e.acero),
    proteccion: normalizarProteccion(e.proteccion),
  }));
}

export function normalizarSectores(brutos: unknown): SectorUI[] {
  if (!Array.isArray(brutos)) return [];
  const validas = clasesValidas(USOS_DB_SI.map((u) => u.id));
  return brutos.filter(esObjeto).map((s) => {
    const clase = texto(s.clase);
    return {
      id: texto(s.id) || nuevoId('s'),
      nombre: texto(s.nombre),
      // Una clase que ya no existe se cae a «sin elegir»: la fila sobrevive
      // como hueco en vez de desaparecer con el nombre que le pusieron.
      clase: validas.includes(clase) ? clase : '',
      sotano: bool(s.sotano),
      robotizado: bool(s.robotizado),
      adosada: bool(s.adosada),
      bajoCubiertaSinRiesgo: bool(s.bajoCubiertaSinRiesgo),
      minutosManual: normalizarMinutos(s.minutosManual),
      anejoB: normalizarAnejoB(s.anejoB),
    };
  });
}

export function normalizar(bruto: unknown): IncendioState {
  if (!esObjeto(bruto)) return defaultIncendioState();
  return {
    modoAltura: bruto.modoAltura === 'libre' ? 'libre' : 'total',
    plantas: normalizarPlantas(bruto.plantas),
    alturaEvacuacionManual: positivoONull(bruto.alturaEvacuacionManual),
    sectores: normalizarSectores(bruto.sectores),
    exigencias: normalizarExigencias(bruto.exigencias),
    elementos: normalizarElementos(bruto.elementos),
    ayuda: bool(bruto.ayuda),
  };
}

// ── La adopción del legado ──────────────────────────────────────────────────

// ── Persistencia ────────────────────────────────────────────────────────────

export function cargarEstado(): IncendioState {
  const base = (() => {
    try {
      if (leerClave(SCHEMA_VERSION_KEY) !== SCHEMA_VERSION) return defaultIncendioState();
      const bruto = leerClave(STORAGE_KEY);
      if (!bruto) return defaultIncendioState();
      return normalizar(JSON.parse(bruto));
    } catch {
      return defaultIncendioState();
    }
  })();

  return base;
}

export function guardarEstado(state: IncendioState): void {
  escribirClave(STORAGE_KEY, JSON.stringify(state));
  escribirClave(SCHEMA_VERSION_KEY, SCHEMA_VERSION);
}

// ── Evaluación ──────────────────────────────────────────────────────────────

/** Una planta publicada con lo que este módulo le anotó encima. */
export interface PlantaAnotada {
  nombre: string;
  esCubierta: boolean;
  altura: number | null;
  /** m. El que se usa: el tecleado a mano, y si no el publicado. */
  canto: number | null;
  /** m. El tecleado a mano en este módulo, o `null`. */
  cantoManual: number | null;
  /** m. El que publica «Cargas por planta», o `null` si sus zonas no coinciden. */
  cantoPublicado: number | null;
  /** Las zonas de la planta traen cantos distintos: hay que elegir uno. */
  cantosDistintos: boolean;
  bajoRasante: boolean;
  /** Lo que se usa: la decisión del proyectista, y si no la propuesta. */
  cuenta: boolean;
  /** Lo que propone la categoría de uso publicada. */
  propuesta: boolean;
  /** Lo que decidió el proyectista, o `null` si no ha decidido. */
  decidida: boolean | null;
}

export interface Evaluacion {
  /** Exigencias resueltas: las que se imprimen, sectores y filas sueltas juntos. */
  exigencias: ExigenciaFuego[];
  /** Los sectores con su cuenta hecha, para enseñar de dónde sale cada R. */
  sectores: SectorResuelto[];
  /** Los elementos comprobados por los anejos C y D. */
  elementos: ElementoResuelto[];
  /** Las plantas publicadas y anotadas, de abajo arriba. Vacío si no hay sobre. */
  plantas: PlantaAnotada[];
  /** `true` cuando «Cargas por planta» no tiene nada publicado. */
  sinPlantas: boolean;
  /** Cotas y alturas de evacuación. */
  alturas: AlturasEdificio;
  /** La que entra en la tabla 3.1: la tecleada a mano si la hay, si no la derivada. */
  alturaEvacuacion: number | null;
  /** `true` cuando la altura de evacuación la puso el proyectista. */
  alturaAMano: boolean;
  /** Filas y sectores a medio rellenar: el hueco rojo. */
  huecos: { id: string; que: string }[];
  avisos: string[];
  listo: boolean;
}

/** Junta las anotaciones con las plantas publicadas, por nombre. */
export function plantasAnotadas(
  publicadas: readonly PlantaPublicada[],
  anotaciones: readonly AnotacionPlanta[],
): PlantaAnotada[] {
  return publicadas.map((p) => {
    const a = anotaciones.find((x) => x.nombre === p.nombre);
    const propuesta = cuentaParaEvacuacion(p);
    return {
      nombre: p.nombre,
      esCubierta: p.esCubierta,
      altura: a?.altura ?? null,
      canto: a?.cantoManual ?? p.canto,
      cantoManual: a?.cantoManual ?? null,
      cantoPublicado: p.canto,
      cantosDistintos: p.cantosDistintos,
      bajoRasante: a?.bajoRasante ?? false,
      cuenta: a?.cuenta ?? propuesta,
      propuesta,
      decidida: a?.cuenta ?? null,
    };
  });
}

export function evaluar(state: IncendioState, publicadas = plantasPublicadas()): Evaluacion {
  const avisos: string[] = [];

  const plantas = publicadas ? plantasAnotadas(publicadas, state.plantas) : [];
  const alturas = alturasDeEvacuacion(plantas, state.modoAltura);
  avisos.push(...alturas.avisos);

  // Anotaciones que ya no casan con ninguna planta publicada: se avisa en vez
  // de tirarlas, porque detrás hay alturas tecleadas a mano.
  if (publicadas) {
    const nombres = new Set(publicadas.map((p) => p.nombre));
    const huerfanas = state.plantas.filter((a) => !nombres.has(a.nombre)).map((a) => a.nombre);
    if (huerfanas.length > 0) {
      avisos.push(
        `Estas plantas ya no están en «Cargas por planta»: ${huerfanas.join(', ')}. Se guarda lo que anotó en ellas por si vuelven, pero no entran en la cuenta.`,
      );
    }
  } else if (state.sectores.length > 0) {
    avisos.push(
      'No hay plantas publicadas por «Cargas por planta»: la altura de evacuación hay que teclearla aquí.',
    );
  }

  const alturaAMano = state.alturaEvacuacionManual !== null;
  const alturaEvacuacion = alturaAMano ? state.alturaEvacuacionManual : alturas.descendente;

  const sectores = resolverSectores(state.sectores, {
    alturaEvacuacion,
    ascendente: alturas.ascendente,
    plantasAscendentes: alturas.plantasAscendentes,
  });
  for (const s of sectores) avisos.push(...s.avisos);

  const deSectores: ExigenciaFuego[] = sectores
    .filter((s) => s.minutos !== null && s.nombre !== '')
    .map((s) => ({ ambito: s.nombre, minutos: s.minutos as number, cita: s.cita }));

  // La llamada (1) de la tabla 3.1: el suelo que separa dos sectores lleva la R
  // del de abajo. No se puede deducir sector a sector, así que se advierte.
  const suelo = notaSueloEntreSectores(sectores);
  if (suelo !== null) avisos.push(suelo);

  const exigencias = [...deSectores, ...exigenciasResueltas(state.exigencias)];

  const elementos = resolverElementos(state.elementos, sectores);
  for (const e of elementos) avisos.push(...e.avisos);

  // La altura de evacuación es la entrada de la tabla 3.1: sin ella, todo
  // sector de uso se queda sin R (y ya es hueco por su cuenta). Se nombra
  // aparte para que el mensaje diga QUÉ falta —la altura, no el sector—, y
  // sólo cuando hace falta: un documento de exigencias sueltas no la necesita.
  const faltaAltura =
    alturaEvacuacion === null && state.sectores.some((s) => s.clase.startsWith('uso:'));
  const porQue =
    alturas.sinAltura.length > 0
      ? ` (falta la altura de ${alturas.sinAltura.join(', ')})`
      : publicadas
        ? ''
        : ' (sin plantas publicadas, tecléela a mano)';

  const huecos = [
    ...(faltaAltura ? [{ id: 'altura-evacuacion', que: `la altura de evacuación${porQue}` }] : []),
    ...sectores.filter((s) => s.hueco).map((s) => ({ id: s.id, que: s.nombre || 'un sector sin nombre' })),
    ...state.exigencias
      .filter((f) => f.ambito.trim() === '' || f.minutos === null)
      .map((f) => ({ id: f.id, que: f.ambito.trim() || 'una exigencia sin ámbito' })),
    ...elementos.filter((e) => e.hueco).map((e) => ({ id: e.id, que: e.nombre || 'un elemento sin nombre' })),
  ];

  // Un sector al que la norma no le exige nada cuenta como «hay algo dicho»:
  // declarar que a una escalera especialmente protegida no se le exige
  // resistencia al fuego ES una decisión, y se imprime.
  const algoQueDecir =
    exigencias.length > 0 || sectores.some((s) => s.sinExigencia && s.nombre !== '');

  return {
    exigencias,
    sectores,
    elementos,
    plantas,
    sinPlantas: publicadas === null,
    alturas,
    alturaEvacuacion,
    alturaAMano,
    huecos,
    avisos,
    listo: huecos.length === 0 && algoQueDecir,
  };
}

// ── Publicación ─────────────────────────────────────────────────────────────

export interface PubIncendio {
  /**
   * La R exigida por el DB SI 6, por partes de la estructura. Nunca vacía: sin
   * exigencias no se publica sobre ninguno.
   */
  exigencias: ExigenciaFuego[];
  /** m. La altura de evacuación con la que se entró en la tabla 3.1. */
  alturaEvacuacion?: number | null;
  /**
   * Cuándo publicó «Cargas por planta» las plantas con las que se calculó esto.
   *
   * La R sale de la altura de evacuación, y la altura de las plantas de allí:
   * si allí se añade una planta con este módulo cerrado, nadie republica y este
   * sobre queda fresco de fecha y viejo de contenido. Con esta marca, quien lo
   * consuma puede verlo. Opcional y aditivo: no sube la versión del sobre.
   */
  plantasOrigen?: { ts: string } | null;
}

/**
 * Devuelve `null` mientras no haya nada que decir, y entonces no se publica.
 *
 * No es una cautela de estilo: `estadoSobre()` de la ficha del DB SE convierte
 * un sobre con `configurado !== true` en «falta» AUNQUE el módulo sea opcional,
 * y «falta» bloquea la exportación del DB SE. Un sobre de incendio vacío
 * bloquearía la memoria de una obra que no tiene por qué hablar de fuego.
 */
export function datosPublicacion(ev: Evaluacion): PubIncendio | null {
  if (!ev.listo || ev.exigencias.length === 0) return null;
  return { exigencias: ev.exigencias, alturaEvacuacion: ev.alturaEvacuacion };
}

/**
 * La obra viaja SIN emplazamiento, y es deliberado.
 *
 * La R de la tabla 3.1 depende del uso del sector y de la altura de evacuación,
 * no de dónde esté el edificio. Si el sobre llevara provincia, el guardia del
 * «dato fantasma» —`esDeOtroEmplazamiento()`— haría desaparecer de una memoria
 * de Ávila una R calculada estando la obra en Granada, que es un falso positivo
 * puro. Con `ine: null` ese guardia no se dispara nunca.
 */
export function publicarResultado(state: IncendioState, ev: Evaluacion): void {
  const datos = datosPublicacion(ev);
  if (!datos) {
    // Sin nada que decir NO basta con no publicar: el sobre de la vez anterior
    // seguiría ahí, y el cuadro de materiales y la ficha del DB SE imprimirían
    // una R que ya no existe. Se retira, y sólo si lo hay: retirar mueve la
    // marca de cambio de todos los sobres y no hay por qué moverla en vano.
    if (leerPublicacion(MODULO_PUB) !== null) retirarPublicacion(MODULO_PUB);
    return;
  }
  const obra = leerObra();
  const ts = tsDePlantasPublicadas();
  const municipio = obra?.municipio || null;
  const configurado = estaConfigurado(state);
  const nuevos = { ...datos, plantasOrigen: ts === null ? null : { ts } };

  // Republicar lo MISMO no es inocuo, por dos razones:
  //
  //  - mueve la marca de cambio de los sobres, y la evaluación de este módulo
  //    depende de ella —las plantas son de otro módulo—: se republicaría a sí
  //    mismo en bucle;
  //  - refresca la fecha del sobre sin que nada haya cambiado, y esa fecha es
  //    lo que la ficha del DB SE compara con la confirmación del usuario.
  const vigente = leerPublicacion<PubIncendio>(MODULO_PUB, PUB_VERSION);
  if (
    vigente !== null &&
    vigente.configurado === configurado &&
    vigente.obra.municipio === municipio &&
    JSON.stringify(vigente.datos) === JSON.stringify(nuevos)
  ) {
    return;
  }

  publicar(
    MODULO_PUB,
    PUB_VERSION,
    nuevos,
    { municipio, provincia: null, ine: null },
    configurado,
  );
}
