/**
 * El estado de la ficha DB SE: sus dos capas, y las operaciones puras sobre él.
 *
 * Vive en `lib/` y no en la feature para que el ensamblado y sus tests no
 * necesiten localStorage: la feature (`features/memoria-dbse/state.ts`) sólo
 * añade la clave, la versión de esquema y leer/guardar.
 *
 * Dos capas, como se decidió en el diseño de Memorias:
 *
 *  - `estudio`: el perfil del despacho. Programa de cálculo, límites de
 *    flecha, redacciones del método. Viaja de obra en obra y NUNCA pide
 *    confirmación: ése es el reparto que evita la fatiga de confirmar.
 *  - `obra`: lo que cambia con el proyecto, cada dato con su ORIGEN. Un dato
 *    `heredado` es el de la obra anterior sin confirmar —se ve, funciona, sale
 *    en ámbar y bloquea exportar— y pasa a `tecleado` al confirmarlo o
 *    cambiarlo; lo leído del geotécnico entra igual, heredado y con su
 *    `fuente` (`proponer`). «Nueva obra» pone TODA la capa en heredado, salvo la
 *    denominación, que nunca es la misma y queda vacía.
 *
 * Y `aceptados`: lo publicado ya no se «toma». La ficha usa SIEMPRE lo último
 * calculado, y lo único que queda por dar por bueno es el aviso de que un
 * sobre se calculó en otra provincia. `aceptados` guarda la huella del sobre
 * que el usuario aceptó pese a eso, para callar el aviso sin olvidarlo: si
 * cambia el resultado o el emplazamiento, vuelve a salir.
 */

import { TIPOLOGIAS } from '../../data/forjadoTipologias';
import type { TipoForjado } from '../acciones/cargas';
import type { CategoriaControl, ClaseEjecucion, PiezaTipo } from '../calculations/masonryWalls';
import type { NivelControlEjecucion, NivelControlHormigon } from '../materiales/types';
import type { Obra } from '../obra';
import { CE, NCSE, SE, SEC } from './plantilla';

// ── Tipos ───────────────────────────────────────────────────────────────────

/** De dónde viene un dato de la capa de obra. `heredado` = de la obra anterior, sin confirmar. */
export type OrigenCampo = 'tecleado' | 'heredado';

export interface Campo<T> {
  valor: T;
  origen: OrigenCampo;
  /**
   * De dónde salió el valor cuando no lo tecleó el usuario: «Del geotécnico
   * «GT-3654.pdf», pág. 3». Se enseña bajo el campo y se pierde al teclear.
   */
  fuente?: string;
}

export const campo = <T>(valor: T, origen: OrigenCampo = 'tecleado', fuente?: string): Campo<T> =>
  fuente ? { valor, origen, fuente } : { valor, origen };

/** Límites de flecha de un forjado: total a plazo infinito, activa relativa y activa absoluta. */
export interface LimitesFlecha {
  total: string;
  activa: string;
  absoluta: string;
}

export interface PerfilEstudio {
  programa: { nombre: string; version: string; empresa: string; domicilio: string; descripcion: string };
  /** Texto del método de cálculo (3.1.5.2, memoria de cálculo). */
  metodoCalculo: string;
  /** Redistribución de momentos negativos en vigas, %. */
  redistribucion: number;
  /** Límites de flecha de vigas (3.1.5.2): total, activa, máxima recomendada. */
  flechas: { total: string; activa: string; maxRecomendada: string };
  /** «1/500» de la luz (3.1.1). */
  flechaActivaGeneral: string;
  /** «1/500» de la altura total (3.1.1). */
  desplome: string;
  /** Párrafo «Modelo análisis estructural» del 3.1.1. */
  modeloAnalisis: string;
  cuantias: string;
  /** Cómo se verifica el acero (3.1.7.1): con el programa o a mano. */
  verificacionAcero: 'informatica' | 'manual';
  barandillas: string;
  forjados: Record<TipoForjado, LimitesFlecha>;
  sismo: { efectosSegundoOrden: string; medidasConstructivas: string };
  cimentacion: { dimensionesYArmado: string; condicionesEjecucion: string };
  contenciones: { condicionesEjecucion: string };
  /** Sólo se usa cuando no hay publicación del cuadro de materiales. */
  control: {
    vidaUtilAnios: number;
    nivelControlEjecucion: NivelControlEjecucion;
    nivelControlHormigon: NivelControlHormigon;
    nivelControlAcero: string;
  };
}

export const GEOTECNIA_CAMPOS = [
  'empresa',
  'autores',
  'titulacion',
  'sondeos',
  'descripcionTerrenos',
  'cotaCimentacion',
  'estratoApoyo',
  'nivelFreatico',
  'tensionAdmisible',
  'pesoEspecifico',
  'anguloRozamiento',
  'balasto',
] as const;
export type GeotecniaCampo = (typeof GEOTECNIA_CAMPOS)[number];

/** Lo residual de un forjado (3.1.6): lo que Cargas por planta no publica. */
export interface DatosForjado {
  /** cm. */
  intereje: Campo<number | null>;
  anchoNervio: Campo<number | null>;
  capaCompresion: Campo<number | null>;
  /** Sólo en reticular: el casetón se recupera (molde que se desencofra) o se queda perdido. */
  recuperable: Campo<boolean>;
  /** De qué es la pieza de entrevigado: el material de la bovedilla o del casetón. */
  pieza: Campo<string | null>;
}

/**
 * Lo que se rellena EN LA FICHA. Los cinco datos de la obra —denominación,
 * uso, provincia, municipio y altitud— NO están aquí: viven en
 * `concreta-obra`, se piden en el diálogo de obra y entran en `MemoriaState`
 * como `datosObra`. Tenerlos también aquí era la misma información en dos
 * formularios que podían discrepar, con dos botones para copiarla de uno a
 * otro (ver el diseño del panel de obra, 2026-09-12).
 */
export interface CapaObra {
  /** 3.1.5.1. */
  descripcionSistema: Campo<string>;
  /** Para la tabla sísmica; null = derivar del sistema que publica el módulo de sismo. */
  tipoEstructuraSismo: Campo<string | null>;
  juntas: {
    existen: Campo<boolean>;
    numero: Campo<number | null>;
    /** m. */
    separacionMax: Campo<number | null>;
    termicasConsideradas: Campo<boolean>;
  };
  /** kN/m². */
  sobrecargaTerreno: Campo<number | null>;
  geotecnia: Record<GeotecniaCampo, Campo<string>>;
  cimentacion: { descripcion: Campo<string>; material: Campo<string> };
  contenciones: { existen: Campo<boolean>; descripcion: Campo<string>; material: Campo<string> };
  /** Por clave `tipo-canto` (ver `claveForjado`). */
  forjados: Record<string, DatosForjado>;
  fabrica: {
    /** El único Procede que no se deriva: no hay módulo que publique fábrica. */
    procede: boolean;
    pieza: Campo<PiezaTipo | null>;
    /** N/mm². */
    fb: Campo<number | null>;
    fm: Campo<number | null>;
    categoriaControl: Campo<CategoriaControl | null>;
    claseEjecucion: Campo<ClaseEjecucion | null>;
  };
}

export type ModuloPub = 'materiales' | 'vientoNieve' | 'cargasPlanta' | 'sismo';
export const MODULOS_PUB: readonly ModuloPub[] = ['materiales', 'vientoNieve', 'cargasPlanta', 'sismo'];

export type Aceptados = Record<ModuloPub, string | null>;

const sinAceptar = (): Aceptados => ({ materiales: null, vientoNieve: null, cargasPlanta: null, sismo: null });

export interface MemoriaState {
  estudio: PerfilEstudio;
  obra: CapaObra;
  /**
   * Por módulo, la huella del sobre que el usuario dio por bueno PESE a estar
   * calculado en otra provincia. `null` = nada aceptado.
   */
  aceptados: Aceptados;
  /**
   * Los cinco datos de la obra, tal como estaban en `concreta-obra` al cargar.
   * Es una PROYECCIÓN, no una copia editable: `normalizar` la repone desde la
   * obra viva en cada lectura, así que no puede quedarse vieja ni discrepar.
   * `null` mientras no haya obra.
   */
  datosObra: Obra | null;
  ayuda: boolean;
}

// ── Valores de arranque ─────────────────────────────────────────────────────

const FLECHAS_RETICULAR: LimitesFlecha = { total: 'L/250', activa: 'L/500', absoluta: '1 cm' };
const FLECHAS_LOSA: LimitesFlecha = { total: 'L/300', activa: 'L/500', absoluta: '1 cm' };

/** Los defaults de la ficha colegial: se editan excepciones, no se rellena de cero. */
export function perfilEstudioPorDefecto(): PerfilEstudio {
  return {
    programa: {
      nombre: CE.programa.nombre,
      version: CE.programa.version,
      empresa: CE.programa.empresa,
      domicilio: CE.programa.domicilio,
      descripcion: CE.programa.descripcion,
    },
    metodoCalculo: CE.memoriaCalculo.metodo,
    redistribucion: 15,
    flechas: { total: 'L/300', activa: 'L/500', maxRecomendada: '1 cm' },
    flechaActivaGeneral: '1/500',
    desplome: '1/500',
    modeloAnalisis: SE.acciones.modelo.texto,
    cuantias: CE.memoriaCalculo.cuantias,
    verificacionAcero: 'informatica',
    barandillas: CE.cargas.barandillas.texto,
    forjados: {
      unidireccional: { ...FLECHAS_RETICULAR },
      losa: { ...FLECHAS_LOSA },
      solera: { ...FLECHAS_LOSA },
      reticular: { ...FLECHAS_RETICULAR },
      chapa: { ...FLECHAS_RETICULAR },
      madera: { ...FLECHAS_LOSA },
      otro: { ...FLECHAS_RETICULAR },
    },
    sismo: { efectosSegundoOrden: NCSE.textos.segundoOrden, medidasConstructivas: NCSE.textos.medidas },
    cimentacion: { dimensionesYArmado: SEC.cimentacion.dimensiones, condicionesEjecucion: SEC.cimentacion.ejecucion },
    contenciones: { condicionesEjecucion: SEC.contenciones.ejecucion },
    control: { vidaUtilAnios: 50, nivelControlEjecucion: 'normal', nivelControlHormigon: 'estadistico', nivelControlAcero: 'Normal' },
  };
}

const geotecniaVacia = (): Record<GeotecniaCampo, Campo<string>> =>
  Object.fromEntries(GEOTECNIA_CAMPOS.map((k) => [k, campo('')])) as Record<GeotecniaCampo, Campo<string>>;

/**
 * La capa de obra de arranque. Los defaults con criterio (sobrecarga en el
 * terreno, juntas, hormigón armado) entran HEREDADOS: son una propuesta, y se
 * confirman con un clic. Lo que no tiene default razonable queda vacío, que es
 * FALTA.
 */
export function obraPorDefecto(): CapaObra {
  return {
    descripcionSistema: campo(''),
    tipoEstructuraSismo: campo(null),
    juntas: {
      existen: campo(true, 'heredado'),
      numero: campo(1, 'heredado'),
      separacionMax: campo(40, 'heredado'),
      termicasConsideradas: campo(false, 'heredado'),
    },
    sobrecargaTerreno: campo(10, 'heredado'),
    geotecnia: geotecniaVacia(),
    cimentacion: { descripcion: campo(''), material: campo('Hormigón armado.', 'heredado') },
    contenciones: { existen: campo(false, 'heredado'), descripcion: campo(''), material: campo('Hormigón armado.', 'heredado') },
    forjados: {},
    fabrica: {
      procede: false,
      pieza: campo(null),
      fb: campo(null),
      fm: campo(null),
      categoriaControl: campo('II', 'heredado'),
      claseEjecucion: campo('A', 'heredado'),
    },
  };
}

/**
 * El estado de arranque. `estudio` entra por PARÁMETRO —lo pasa la feature, que
 * es quien sabe leer `concreta-estudio`— y cae al colegial si no se pasa: así
 * una ficha nueva hereda el perfil del despacho en vez de reponer la plantilla.
 */
export function estadoPorDefecto(obra: Obra | null, estudio?: PerfilEstudio): MemoriaState {
  return {
    estudio: estudio ?? perfilEstudioPorDefecto(),
    obra: obraPorDefecto(),
    aceptados: sinAceptar(),
    datosObra: obra,
    ayuda: true,
  };
}

/** La clave de un forjado en `obra.forjados`: sin puntos, que son el separador de las rutas. */
export const claveForjado = (tipo: TipoForjado, canto: number): string => `${tipo}-${String(canto).replace('.', ',')}`;

export function datosForjadoPorDefecto(intereje: number | null, anchoNervio: number | null, capaCompresion: number | null, pieza: string | null, recuperable = false): DatosForjado {
  return {
    intereje: campo(intereje, 'heredado'),
    anchoNervio: campo(anchoNervio, 'heredado'),
    capaCompresion: campo(capaCompresion, 'heredado'),
    recuperable: campo(recuperable, 'heredado'),
    pieza: campo(pieza, 'heredado'),
  };
}

/**
 * Lo residual de un forjado cuando la obra aún no lo tiene: la geometría típica
 * de `forjadoTipologias` para el reticular del mismo canto, 70/12/5 para el
 * unidireccional, y nada para losas, soleras y chapas, que no lo piden. Entra
 * HEREDADO: es una propuesta que se confirma con un clic.
 */
export function datosForjadoInicial(tipo: TipoForjado, canto: number): DatosForjado {
  if (tipo === 'reticular') {
    const t = TIPOLOGIAS.find((x) => x.h === Math.round(canto * 10)) ?? TIPOLOGIAS[0];
    return datosForjadoPorDefecto(t.intereje / 10, t.bWeb / 10, t.hFlange / 10, 'Hormigón');
  }
  if (tipo === 'unidireccional') return datosForjadoPorDefecto(70, 12, 5, 'Hormigón');
  return datosForjadoPorDefecto(null, null, null, null);
}

/**
 * Da de alta en la capa de obra los forjados que Cargas por planta publica y
 * la ficha aún no conoce, con sus defaults; los que ya están no se tocan. Sin
 * esto «Confirmar» no tendría dónde escribir.
 */
export function asegurarForjados(s: MemoriaState, tipologias: { tipo: TipoForjado; canto: number }[]): MemoriaState {
  const nuevos = tipologias.filter((t) => !(claveForjado(t.tipo, t.canto) in s.obra.forjados));
  if (nuevos.length === 0) return s;
  const forjados = { ...s.obra.forjados };
  for (const t of nuevos) forjados[claveForjado(t.tipo, t.canto)] = datosForjadoInicial(t.tipo, t.canto);
  return { ...s, obra: { ...s.obra, forjados } };
}

// ── Operaciones ─────────────────────────────────────────────────────────────

/** Sí cuando el dato es un `Campo`: tiene `valor` y un `origen` válido. */
const esCampo = (v: unknown): v is Campo<unknown> =>
  typeof v === 'object' && v !== null && 'valor' in v && ((v as Campo<unknown>).origen === 'tecleado' || (v as Campo<unknown>).origen === 'heredado');

/** Devuelve una copia del objeto con `f` aplicada al nodo de la ruta. Nunca muta. */
function conRuta<T>(obj: T, ruta: string[], f: (nodo: unknown) => unknown): T {
  if (ruta.length === 0) return f(obj) as T;
  const [cabeza, ...resto] = ruta;
  const o = obj as Record<string, unknown>;
  return { ...o, [cabeza]: conRuta(o[cabeza], resto, f) } as T;
}

function enRuta(obj: unknown, ruta: string[]): unknown {
  let n = obj;
  for (const p of ruta) {
    if (typeof n !== 'object' || n === null) return undefined;
    n = (n as Record<string, unknown>)[p];
  }
  return n;
}

/** La ruta de un id `obra.x.y` dentro del estado. `undefined` si no es un id de campo. */
const rutaDe = (id: string): string[] | undefined => (id.startsWith('obra.') ? id.split('.') : undefined);

export function leerCampo(s: MemoriaState, id: string): Campo<unknown> | undefined {
  const ruta = rutaDe(id);
  if (!ruta) return undefined;
  const v = enRuta(s, ruta);
  return esCampo(v) ? v : undefined;
}

/** Confirma un dato heredado sin cambiarle el valor. */
export function confirmar(s: MemoriaState, id: string): MemoriaState {
  const ruta = rutaDe(id);
  if (!ruta || !leerCampo(s, id)) return s;
  return conRuta(s, ruta, (c) => ({ ...(c as Campo<unknown>), origen: 'tecleado' }));
}

/** Escribe un dato; editar confirma. */
export function teclear<T>(s: MemoriaState, id: string, valor: T): MemoriaState {
  const ruta = rutaDe(id);
  if (!ruta || !leerCampo(s, id)) return s;
  return conRuta(s, ruta, () => campo(valor));
}

/**
 * Escribe un dato como PROPUESTA: heredado, con la fuente de donde sale (el
 * geotécnico y su página). Se ve, funciona, sale en ámbar y se confirma con
 * un clic, igual que un dato de la obra anterior.
 */
export function proponer<T>(s: MemoriaState, id: string, valor: T, fuente: string): MemoriaState {
  const ruta = rutaDe(id);
  if (!ruta || !leerCampo(s, id)) return s;
  return conRuta(s, ruta, () => campo(valor, 'heredado', fuente));
}

/** Hash FNV-1a de 32 bits, en hexadecimal. La huella se guarda y se compara, no se lee. */
function hash32(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

/**
 * La huella de un sobre visto desde ESTA obra: su RESULTADO —lo que se va a
 * imprimir— y el emplazamiento de la obra.
 *
 * Lo que NO entra, a propósito, es el `ts`. Republicar sin tocar nada no es un
 * cambio que haya que volver a dar por bueno, y ése era exactamente el ruido
 * del viejo «revisar»: bastaba volver a entrar en un módulo para que la ficha
 * pidiera confirmar otra vez lo mismo.
 */
export function huellaSobre(sobre: { datos: unknown }, obra: Obra | null): string {
  return hash32(JSON.stringify([sobre.datos, obra?.provincia ?? '', obra?.municipio ?? '', obra?.altitud ?? null]));
}

/**
 * El usuario da por bueno un sobre calculado en otro sitio. Calla el aviso
 * hasta que cambie el resultado o el emplazamiento de la obra.
 */
export function aceptar(s: MemoriaState, modulo: ModuloPub, sobre: { datos: unknown }): MemoriaState {
  return { ...s, aceptados: { ...s.aceptados, [modulo]: huellaSobre(sobre, s.datosObra) } };
}

/** Todo lo que sea un `Campo` bajo el nodo pasa a heredado. */
function heredarTodo<T>(nodo: T): T {
  if (esCampo(nodo)) return { ...nodo, origen: 'heredado' } as T;
  if (typeof nodo !== 'object' || nodo === null) return nodo;
  if (Array.isArray(nodo)) return nodo.map(heredarTodo) as T;
  return Object.fromEntries(Object.entries(nodo as Record<string, unknown>).map(([k, v]) => [k, heredarTodo(v)])) as T;
}

/**
 * «Nueva obra»: el estudio pasa limpio y sin preguntas; cada dato de la ficha
 * se conserva pero en HEREDADO. Lo dado por bueno pese a venir de otro sitio
 * se olvida: en otra obra hay que volver a mirarlo. No toca
 * `concreta-obra` —los cinco datos los pide el diálogo de obra— ni las
 * publicaciones de los otros módulos: eso es de ellos.
 */
export function nuevaObra(s: MemoriaState): MemoriaState {
  const obra = heredarTodo(s.obra);
  return {
    ...s,
    obra: { ...obra, fabrica: { ...obra.fabrica, procede: s.obra.fabrica.procede } },
    aceptados: sinAceptar(),
  };
}

// ── Lectura defensiva ───────────────────────────────────────────────────────

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const texto = (v: unknown, def: string) => (typeof v === 'string' ? v : def);
const numero = (v: unknown, def: number) => (typeof v === 'number' && Number.isFinite(v) ? v : def);
const numeroONull = (v: unknown, def: number | null) => (typeof v === 'number' && Number.isFinite(v) ? v : v === null ? null : def);
const bool = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def);
const uno = <T extends string>(v: unknown, permitidos: readonly T[], def: T): T => (permitidos.includes(v as T) ? (v as T) : def);

/** Un `Campo` leído con un lector para su valor; si no tiene forma de campo, el default. */
function leerCampoCon<T>(v: unknown, def: Campo<T>, lector: (valor: unknown, def: T) => T): Campo<T> {
  if (!esObjeto(v) || !('valor' in v)) return def;
  const valor = lector(v.valor, def.valor);
  // Si el lector tuvo que caer al default, cae el campo ENTERO: un default
  // rotulado como tecleado sería un dato confirmado que nadie confirmó.
  if (valor !== v.valor) return def;
  const fuente = typeof v.fuente === 'string' && v.fuente !== '' ? v.fuente : undefined;
  return { valor, origen: v.origen === 'heredado' ? 'heredado' : 'tecleado', ...(fuente ? { fuente } : {}) };
}

const cTexto = (v: unknown, def: Campo<string>) => leerCampoCon(v, def, texto);
const cNumONull = (v: unknown, def: Campo<number | null>) => leerCampoCon(v, def, numeroONull);
const cBool = (v: unknown, def: Campo<boolean>) => leerCampoCon(v, def, bool);
const cTextoONull = (v: unknown, def: Campo<string | null>) => leerCampoCon(v, def, (x, d) => (typeof x === 'string' ? x : x === null ? null : d));

const TIPOS_FORJADO: readonly TipoForjado[] = ['losa', 'solera', 'reticular', 'unidireccional', 'chapa', 'madera', 'otro'];
const PIEZAS: readonly PiezaTipo[] = ['macizo_junta_delgada', 'macizo', 'perforado', 'bloque_aligerado', 'bloque_hueco'];

/**
 * Lee un perfil de despacho de cualquier cosa; lo que no se reconozca cae al
 * valor colegial. Exportada porque `features/memoria-dbse/state.ts` la necesita
 * para leer la clave global `concreta-estudio`: este fichero vive en `lib/` a
 * propósito y no toca el almacenamiento.
 */
export function normalizarEstudio(b: unknown): PerfilEstudio {
  const d = perfilEstudioPorDefecto();
  if (!esObjeto(b)) return d;
  const prog = esObjeto(b.programa) ? b.programa : {};
  const fl = esObjeto(b.flechas) ? b.flechas : {};
  const fj = esObjeto(b.forjados) ? b.forjados : {};
  const sis = esObjeto(b.sismo) ? b.sismo : {};
  const cim = esObjeto(b.cimentacion) ? b.cimentacion : {};
  const con = esObjeto(b.contenciones) ? b.contenciones : {};
  const ctl = esObjeto(b.control) ? b.control : {};
  const limites = (v: unknown, def: LimitesFlecha): LimitesFlecha =>
    esObjeto(v) ? { total: texto(v.total, def.total), activa: texto(v.activa, def.activa), absoluta: texto(v.absoluta, def.absoluta) } : def;
  return {
    programa: {
      nombre: texto(prog.nombre, d.programa.nombre),
      version: texto(prog.version, d.programa.version),
      empresa: texto(prog.empresa, d.programa.empresa),
      domicilio: texto(prog.domicilio, d.programa.domicilio),
      descripcion: texto(prog.descripcion, d.programa.descripcion),
    },
    metodoCalculo: texto(b.metodoCalculo, d.metodoCalculo),
    redistribucion: numero(b.redistribucion, d.redistribucion),
    flechas: { total: texto(fl.total, d.flechas.total), activa: texto(fl.activa, d.flechas.activa), maxRecomendada: texto(fl.maxRecomendada, d.flechas.maxRecomendada) },
    flechaActivaGeneral: texto(b.flechaActivaGeneral, d.flechaActivaGeneral),
    desplome: texto(b.desplome, d.desplome),
    modeloAnalisis: texto(b.modeloAnalisis, d.modeloAnalisis),
    cuantias: texto(b.cuantias, d.cuantias),
    verificacionAcero: uno(b.verificacionAcero, ['informatica', 'manual'] as const, d.verificacionAcero),
    barandillas: texto(b.barandillas, d.barandillas),
    forjados: Object.fromEntries(TIPOS_FORJADO.map((t) => [t, limites(fj[t], d.forjados[t])])) as Record<TipoForjado, LimitesFlecha>,
    sismo: {
      efectosSegundoOrden: texto(sis.efectosSegundoOrden, d.sismo.efectosSegundoOrden),
      medidasConstructivas: texto(sis.medidasConstructivas, d.sismo.medidasConstructivas),
    },
    cimentacion: {
      dimensionesYArmado: texto(cim.dimensionesYArmado, d.cimentacion.dimensionesYArmado),
      condicionesEjecucion: texto(cim.condicionesEjecucion, d.cimentacion.condicionesEjecucion),
    },
    contenciones: { condicionesEjecucion: texto(con.condicionesEjecucion, d.contenciones.condicionesEjecucion) },
    control: {
      vidaUtilAnios: numero(ctl.vidaUtilAnios, d.control.vidaUtilAnios),
      nivelControlEjecucion: uno(ctl.nivelControlEjecucion, ['prefabricado_intenso', 'in_situ_intenso', 'normal'] as const, d.control.nivelControlEjecucion),
      nivelControlHormigon: uno(ctl.nivelControlHormigon, ['estadistico', 'indirecto', '100_por_100'] as const, d.control.nivelControlHormigon),
      nivelControlAcero: texto(ctl.nivelControlAcero, d.control.nivelControlAcero),
    },
  };
}

function normalizarObra(b: unknown): CapaObra {
  const d = obraPorDefecto();
  if (!esObjeto(b)) return d;
  const j = esObjeto(b.juntas) ? b.juntas : {};
  const g = esObjeto(b.geotecnia) ? b.geotecnia : {};
  const cim = esObjeto(b.cimentacion) ? b.cimentacion : {};
  const con = esObjeto(b.contenciones) ? b.contenciones : {};
  const fab = esObjeto(b.fabrica) ? b.fabrica : {};
  const forjados: Record<string, DatosForjado> = {};
  if (esObjeto(b.forjados)) {
    for (const [k, v] of Object.entries(b.forjados)) {
      if (!/^[a-z]+-[0-9,]+$/.test(k) || !esObjeto(v)) continue;
      const def = datosForjadoPorDefecto(null, null, null, null);
      forjados[k] = {
        intereje: cNumONull(v.intereje, def.intereje),
        anchoNervio: cNumONull(v.anchoNervio, def.anchoNervio),
        capaCompresion: cNumONull(v.capaCompresion, def.capaCompresion),
        recuperable: cBool(v.recuperable, def.recuperable),
        pieza: cTextoONull(v.pieza, def.pieza),
      };
    }
  }
  return {
    descripcionSistema: cTexto(b.descripcionSistema, d.descripcionSistema),
    tipoEstructuraSismo: cTextoONull(b.tipoEstructuraSismo, d.tipoEstructuraSismo),
    juntas: {
      existen: cBool(j.existen, d.juntas.existen),
      numero: cNumONull(j.numero, d.juntas.numero),
      separacionMax: cNumONull(j.separacionMax, d.juntas.separacionMax),
      termicasConsideradas: cBool(j.termicasConsideradas, d.juntas.termicasConsideradas),
    },
    sobrecargaTerreno: cNumONull(b.sobrecargaTerreno, d.sobrecargaTerreno),
    geotecnia: Object.fromEntries(GEOTECNIA_CAMPOS.map((k) => [k, cTexto(g[k], d.geotecnia[k])])) as Record<GeotecniaCampo, Campo<string>>,
    cimentacion: { descripcion: cTexto(cim.descripcion, d.cimentacion.descripcion), material: cTexto(cim.material, d.cimentacion.material) },
    contenciones: {
      existen: cBool(con.existen, d.contenciones.existen),
      descripcion: cTexto(con.descripcion, d.contenciones.descripcion),
      material: cTexto(con.material, d.contenciones.material),
    },
    forjados,
    fabrica: {
      procede: bool(fab.procede, d.fabrica.procede),
      pieza: leerCampoCon(fab.pieza, d.fabrica.pieza, (v, def) => (PIEZAS.includes(v as PiezaTipo) ? (v as PiezaTipo) : v === null ? null : def)),
      fb: cNumONull(fab.fb, d.fabrica.fb),
      fm: cNumONull(fab.fm, d.fabrica.fm),
      categoriaControl: leerCampoCon(fab.categoriaControl, d.fabrica.categoriaControl, (v, def) => (v === 'I' || v === 'II' || v === 'III' ? v : v === null ? null : def)),
      claseEjecucion: leerCampoCon(fab.claseEjecucion, d.fabrica.claseEjecucion, (v, def) => (v === 'A' || v === 'B' ? v : v === null ? null : def)),
    },
  };
}

/** Una huella es una cadena y nada más; lo que venga de una versión anterior se olvida. */
const normalizarAceptado = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/** Todo lo que no se reconozca cae al valor de arranque; nunca se lanza. */
export function normalizar(bruto: unknown, obra: Obra | null): MemoriaState {
  const d = estadoPorDefecto(obra);
  if (!esObjeto(bruto)) return d;
  const ac = esObjeto(bruto.aceptados) ? bruto.aceptados : {};
  return {
    estudio: normalizarEstudio(bruto.estudio),
    obra: normalizarObra(bruto.obra),
    aceptados: Object.fromEntries(MODULOS_PUB.map((m) => [m, normalizarAceptado(ac[m])])) as Aceptados,
    // La obra viva MANDA sobre lo que hubiera guardado: es una proyección.
    datosObra: obra,
    ayuda: bool(bruto.ayuda, d.ayuda),
  };
}
