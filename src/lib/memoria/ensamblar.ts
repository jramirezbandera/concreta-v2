/**
 * Del estado de la ficha y los cuatro sobres a los DATOS de cada apartado, con
 * cada valor etiquetado con su estado: lo que se imprime, de dónde sale y si
 * bloquea exportar.
 *
 * Es una función pura: recibe los sobres YA leídos (`Sobres`), de modo que se
 * prueba con los `datosPublicacion` reales de cada módulo y sin localStorage.
 * Lo que devuelve, `FichaDatos`, está construido en el ORDEN DEL DOCUMENTO
 * —obra, fuentes, apartados— porque `huecos.ts` lo recorre en ese orden para
 * la cola de «Siguiente hueco».
 *
 * Tres reglas que ordenan todo lo demás:
 *
 *  1. Los Procede / No procede se DERIVAN: acero y madera proceden si están en
 *     el cuadro de materiales; fábrica es el único que se marca a mano, porque
 *     no hay módulo que la publique. Lo que no procede devuelve `null` y no
 *     aporta huecos.
 *  2. Viento y nieve es OPCIONAL: sin sobre, la zona eólica y la velocidad
 *     salen de la provincia (Anejo D por provincia, con nota de frontera). Los
 *     otros tres sobres son obligatorios para su apartado: sin ellos, falta.
 *  3. Lo tomado de un sobre pasa a «revisar» si el sobre ha cambiado desde que
 *     se aceptó (`ts` distinto, no «más nuevo»: un sobre restaurado con fecha
 *     anterior también es otro sobre) o si la ficha cambió de provincia después
 *     de aceptarlo. Que el sobre sea de OTRA obra no bloquea solo —el cuadro de
 *     materiales no tiene emplazamiento propio y estampa el `concreta-obra`
 *     que hubiera— pero se dice, y el botón cambia de rótulo.
 *
 * Única excepción, documentada, a «lib/ no importa de features/»: los TIPOS
 * de las cuatro publicaciones, con `import type`, que se borra al compilar.
 */

import type { PubCargasPlanta } from '../../features/cargas-planta/state';
import type { PubAceroEstructural, PubMadera, PubMateriales } from '../../features/materiales/state';
import type { PubSismo } from '../../features/seismic-ncse02/state';
import type { PubVientoNieve } from '../../features/viento-nieve/state';
import type { TipoForjado } from '../acciones/cargas';
import { provinciaPorIne } from '../acciones/provincias';
import { ZONAS_EOLICAS, type ZonaEolica, type ZonaInvernal } from '../acciones/tablasAE';
import { GAMMA_DB_SE, TABLA_3_1, type FilaTabla31 } from '../acciones/tablasCargas';
import { CATEGORIA_LABELS, EJECUCION_LABELS, TABLA_4_4, lookupFk, lookupGammaM, type CategoriaControl, type ClaseEjecucion, type PiezaTipo } from '../calculations/masonryWalls';
import { FRACCION_MASA } from '../codes/seismic/ncse02';
import type { CategoriaMasa } from '../codes/seismic/types';
import { num } from '../materiales/cuadros';
import type { ObraPublicada, Publicacion } from '../pub';
import {
  GEOTECNIA_CAMPOS,
  claveForjado,
  datosForjadoInicial,
  type Campo,
  type CapaObra,
  type GeotecniaCampo,
  type MemoriaState,
  type ModuloPub,
  type PerfilEstudio,
  type Tomada,
} from './estado';
import { colaHuecos, mensajeBloqueo } from './huecos';
import type { ApartadoId, Estado, Hueco, Origen, Valor } from './model';
import { AMORTIGUAMIENTO_TEXTO, IMPORTANCIA_TEXTO, NCSE, SEA, TIPO_ESTRUCTURA_SISMO, TITULO_FORJADO } from './plantilla';

// ── Sobres ──────────────────────────────────────────────────────────────────

export interface Sobres {
  materiales: Publicacion<PubMateriales> | null;
  vientoNieve: Publicacion<PubVientoNieve> | null;
  cargasPlanta: Publicacion<PubCargasPlanta> | null;
  sismo: Publicacion<PubSismo> | null;
}

export const SIN_SOBRES: Sobres = { materiales: null, vientoNieve: null, cargasPlanta: null, sismo: null };

/** Provincia de un INE, que puede venir con cinco dígitos o con dos. */
export const provinciaDe = (ine: string | null | undefined): string | null => (ine && ine.length >= 2 ? ine.slice(0, 2) : null);

/**
 * Sí cuando el sobre es de otra provincia que la ficha, y sólo cuando las dos
 * partes la conocen: sin obra que comparar no hay discrepancia que demostrar.
 */
export function esDeOtraObra(sobre: Publicacion<unknown> | null, ineSobre: string | null | undefined, provinciaFicha: string): boolean {
  if (!sobre || !provinciaFicha) return false;
  const p = provinciaDe(ineSobre ?? sobre.obra.ine);
  return p !== null && p !== provinciaFicha;
}

/** La regla 3 de la cabecera. `obligatorio = false` es Viento y nieve: sin sobre no falta, se deriva. */
export function estadoSobre(sobre: Publicacion<unknown> | null, tomada: Tomada | null, provinciaFicha: string, obligatorio: boolean): Estado {
  if (!sobre) return obligatorio ? 'falta' : 'derivado';
  if (!tomada || tomada.ts !== sobre.ts || tomada.provinciaFicha !== provinciaFicha) return 'revisar';
  return 'ok';
}

// ── Lo que devuelve ─────────────────────────────────────────────────────────

const ORIGEN_DE: Record<ModuloPub, Origen> = { materiales: 'materiales', vientoNieve: 'viento-nieve', cargasPlanta: 'cargas-planta', sismo: 'sismo' };
const ETIQUETA_DE: Record<ModuloPub, string> = { materiales: 'Cuadro de materiales', vientoNieve: 'Viento y nieve', cargasPlanta: 'Cargas por planta', sismo: 'Acción sísmica' };
const APARTADO_DE: Record<ModuloPub, ApartadoId> = { materiales: 'ce', vientoNieve: 'seae', cargasPlanta: 'seae', sismo: 'ncse' };

/** Una publicación vista desde la ficha: si hay sobre, de cuándo y de qué obra, y en qué estado entra. */
export interface Fuente extends Valor<boolean> {
  modulo: ModuloPub;
  ts: string | null;
  obraSobre: ObraPublicada | null;
  otraObra: boolean;
  obligatorio: boolean;
}

export interface Viento {
  lugar: string;
  zona: ZonaEolica;
  vb: number;
  qb: number;
}

export interface Nieve {
  lugar: string;
  zona: ZonaInvernal;
  sk: number;
}

/** Una fila de la tabla de cargas por niveles (3.1.2), ya en texto. */
export interface Nivel {
  nivel: string;
  uso: string;
  pp: string;
  resto: string;
  nieve: string | null;
  total: string;
}

/** Un uso de forjado para el estado de cargas del 3.1.5.3. */
export interface CargaUso {
  rotulo: string;
  pp: string;
  resto: string;
  uso: string;
  nieve: string | null;
}

export interface Sismo {
  clasificacion: string;
  tipoEstructura: Valor<string>;
  ab: string;
  obligatoria: boolean;
  /** El motivo de la exención, redactado por el módulo de sismo. */
  exencion: string | null;
  /** Las filas de la tabla completa; `null` si está exento. */
  completo: {
    K: string;
    rho: string;
    S: string;
    C: string;
    ac: string;
    metodo: string;
    amortiguamiento: string;
    periodo: string;
    modos: string;
    fraccion: string;
    ductilidad: string;
    segundoOrden: string;
    medidas: string;
  } | null;
}

export interface ElementoCE {
  hormigon: string;
  cemento: string;
  arido: string;
  ac: string;
  cementoMin: string;
  fck: string;
  acero: string;
  fyk: string;
  ubicacion: string;
}

export interface Coeficientes {
  gammaC: number;
  gammaS: number;
  nivelHormigon: string;
  nivelAcero: string;
  nivelEjecucion: string;
  gammaG: number;
  gammaQ: number;
}

export interface Durabilidad {
  nombre: string;
  clases: string;
  /** mm; `null` cuando la norma no lo tabula para esas clases. */
  cmin: number | null;
  cnom: number | null;
  cementoMin: number | null;
  acMax: number | null;
}

export interface Tipologia {
  clave: string;
  tipo: TipoForjado;
  /** cm. */
  canto: number;
  /** kN/m². */
  pp: number;
  titulo: string;
  /** Sólo en unidireccional y reticular. */
  intereje: Valor<number | null> | null;
  anchoNervio: Valor<number | null> | null;
  capaCompresion: Valor<number | null> | null;
  pieza: Valor<string | null> | null;
  hormigon: string | null;
  acero: string | null;
  flechas: { total: string; activa: string; absoluta: string };
}

export interface Juntas {
  existen: Valor<boolean>;
  numero: Valor<number | null>;
  separacionMax: Valor<number | null>;
  termicasConsideradas: Valor<boolean>;
}

export interface FichaDatos {
  obra: {
    denominacion: Valor<string>;
    uso: Valor<string>;
    provincia: Valor<string>;
    municipio: Valor<string>;
    altitud: Valor<number | null>;
    provinciaNombre: string | null;
  };
  fuentes: Record<ModuloPub, Fuente>;
  procede: Record<ApartadoId, boolean>;
  se: { periodoServicio: Valor<number>; modeloAnalisis: string; flechaActiva: string; desplome: string };
  seae: { viento: Valor<Viento>; nieve: Valor<Nieve | null>; niveles: Valor<Nivel[]> };
  sec: {
    geotecnia: Record<GeotecniaCampo, Valor<string>>;
    cimentacion: { descripcion: Valor<string>; material: Valor<string>; dimensiones: string; ejecucion: string };
    contenciones: { existen: Valor<boolean>; descripcion: Valor<string> | null; material: Valor<string> | null; ejecucion: string };
  };
  ncse: Valor<Sismo>;
  ce: {
    descripcionSistema: Valor<string>;
    programa: PerfilEstudio['programa'];
    memoria: { metodo: string; redistribucion: number; flechas: PerfilEstudio['flechas']; cuantias: string };
    cargas: Valor<{ usos: CargaUso[]; lineales: { concepto: string; gk: string }[] }>;
    barandillas: string;
    juntas: Juntas;
    sobrecargaTerreno: Valor<number | null>;
    materiales: Valor<ElementoCE[]>;
    coeficientes: Valor<Coeficientes>;
    durabilidad: Valor<Durabilidad[]>;
  };
  forjados: Valor<Tipologia[]>;
  sea: { verificacion: string; juntas: Juntas; acero: PubAceroEstructural; vidaUtilAnios: number } | null;
  sef: {
    pieza: Valor<PiezaTipo | null>;
    piezaEtiqueta: string | null;
    fb: Valor<number | null>;
    fm: Valor<number | null>;
    fk: Valor<number | null>;
    categoriaControl: Valor<CategoriaControl | null>;
    claseEjecucion: Valor<ClaseEjecucion | null>;
    gammaM: Valor<number | null>;
    categoriaEtiqueta: string | null;
    ejecucionEtiqueta: string | null;
  } | null;
  sem: { madera: PubMadera; resistenciaFuego: number | null; vidaUtilAnios: number } | null;
}

// ── Ayudantes ───────────────────────────────────────────────────────────────

const derivado = <T>(valor: T, origen: Origen, nota?: string): Valor<T> => ({ valor, estado: 'derivado', origen, ...(nota ? { nota } : {}) });

/** Un dato de la capa de obra, con su estado: vacío es falta, heredado es ámbar. */
function deCampo<T>(c: Campo<T>, id: string, etiqueta: string, apartado: ApartadoId, vacio: (v: T) => boolean = (v) => v === null || v === ''): Valor<T> {
  const estado: Estado = vacio(c.valor) ? 'falta' : c.origen === 'heredado' ? 'heredado' : 'ok';
  return { valor: vacio(c.valor) ? null : c.valor, estado, origen: c.origen, id, etiqueta, apartado };
}

/** Un booleano nunca está vacío: sólo puede estar heredado o confirmado. */
const deBool = (c: Campo<boolean>, id: string, etiqueta: string, apartado: ApartadoId): Valor<boolean> => deCampo(c, id, etiqueta, apartado, () => false);

/** Lo que falta porque no hay sobre (o no sirve): mismo id que la fuente, para que sea UN hueco. */
function faltaDeSobre<T>(modulo: ModuloPub, nota?: string): Valor<T> {
  return { valor: null, estado: 'falta', origen: ORIGEN_DE[modulo], id: `pub.${modulo}`, etiqueta: ETIQUETA_DE[modulo], apartado: APARTADO_DE[modulo], ...(nota ? { nota } : {}) };
}

const kN = (v: number) => `${num(v, 2)} kN/m²`;

const ETIQUETAS_GEOTECNIA: Record<GeotecniaCampo, string> = {
  empresa: '¿Quién hizo el estudio geotécnico? (empresa)',
  autores: 'Autor o autores que lo firman',
  titulacion: 'Su titulación',
  sondeos: 'Sondeos y ensayos realizados',
  descripcionTerrenos: 'Cómo es el terreno (estratos)',
  cotaCimentacion: 'Cota de cimentación',
  estratoApoyo: 'Estrato sobre el que se cimenta',
  nivelFreatico: 'Nivel freático',
  tensionAdmisible: 'Tensión admisible',
  pesoEspecifico: 'Peso específico del terreno',
  anguloRozamiento: 'Ángulo de rozamiento interno',
  empujeReposo: 'Coeficiente de empuje en reposo',
  balasto: 'Coeficiente de balasto',
};

// ── Fuentes ─────────────────────────────────────────────────────────────────

function fuente(modulo: ModuloPub, sobre: Publicacion<unknown> | null, tomada: Tomada | null, provinciaFicha: string, obligatorio: boolean, ineSobre?: string | null): Fuente {
  const estado = estadoSobre(sobre, tomada, provinciaFicha, obligatorio);
  const otraObra = esDeOtraObra(sobre, ineSobre, provinciaFicha);
  const nota =
    !sobre && !obligatorio
      ? 'Sin publicar: la zona eólica y la nieve salen de la provincia.'
      : otraObra
        ? `Esta publicación es de otra obra (${sobre?.obra.municipio || sobre?.obra.provincia || `INE ${sobre?.obra.ine}`}).`
        : undefined;
  return {
    modulo,
    valor: sobre !== null,
    estado,
    origen: ORIGEN_DE[modulo],
    id: `pub.${modulo}`,
    etiqueta: ETIQUETA_DE[modulo],
    apartado: APARTADO_DE[modulo],
    ts: sobre?.ts ?? null,
    obraSobre: sobre?.obra ?? null,
    otraObra,
    obligatorio,
    ...(nota ? { nota } : {}),
  };
}

/** Sí cuando el sobre se puede usar para imprimir: existe y está aceptado tal cual. */
const usable = (f: Fuente) => f.estado === 'ok';

// ── Apartados ───────────────────────────────────────────────────────────────

function viento(obra: CapaObra, f: Fuente, sobre: Publicacion<PubVientoNieve> | null, provinciaNombre: string | null): Valor<Viento> {
  const v = usable(f) ? sobre?.datos.viento : null;
  if (v && sobre) {
    const lugar = sobre.datos.municipio || sobre.datos.provincia;
    return derivado({ lugar, zona: v.zonaEolica, vb: v.vb ?? ZONAS_EOLICAS[v.zonaEolica].vb, qb: v.qb }, 'viento-nieve');
  }
  // Sin sobre usable: la zona de la provincia (DB SE-AE, Anejo D). El lugar es el municipio de la ficha.
  const p = obra.provincia.valor ? provinciaPorIne(obra.provincia.valor) : undefined;
  if (!p) {
    // Sin provincia no hay zona: el hueco es el de la provincia, no éste.
    return { valor: null, estado: 'falta', origen: 'obra', nota: 'Elija la provincia de la obra.' };
  }
  const z = ZONAS_EOLICAS[p.zonaEolica];
  const lugar = obra.municipio.valor ? `${obra.municipio.valor} (${p.nombre})` : provinciaNombre ?? p.nombre;
  const nota = f.estado === 'revisar' ? 'Hay una publicación de Viento y nieve sin tomar: se usa la zona de la provincia.' : p.frontera?.eolica;
  return derivado({ lugar, zona: p.zonaEolica, vb: z.vb, qb: z.qb }, 'norma', nota);
}

function nieve(f: Fuente, sobre: Publicacion<PubVientoNieve> | null): Valor<Nieve | null> {
  const n = usable(f) ? sobre?.datos.nieve : null;
  if (n && sobre) return derivado({ lugar: sobre.datos.municipio || sobre.datos.provincia, zona: n.zonaInvernal, sk: n.sk }, 'viento-nieve');
  return derivado(null, 'norma', 'Sin publicación de nieve: se escribe la regla general del DB SE-AE (sk ≥ 0,20 kN/m²).');
}

const etiquetaUso = (fila: string, categoria: string) => (fila in TABLA_3_1 ? TABLA_3_1[fila as FilaTabla31].corta : categoria);

function niveles(f: Fuente, sobre: Publicacion<PubCargasPlanta> | null): Valor<Nivel[]> {
  if (!usable(f) || !sobre) return faltaDeSobre('cargasPlanta');
  const filas: Nivel[] = [];
  for (const p of sobre.datos.plantas) {
    for (const z of p.zonas) {
      const total = z.pp + z.resto + z.qUso + (z.nieve ?? 0);
      filas.push({
        nivel: z.nombre ? `${p.nombre} (${z.nombre})` : p.nombre,
        uso: `${kN(z.qUso)} (${etiquetaUso(z.fila, z.categoria)})`,
        pp: `${kN(z.pp)} (${z.forjado.tipo} h = ${num(z.forjado.canto)} cm)`,
        resto: kN(z.resto),
        nieve: z.nieve !== null && z.nieve > 0 ? kN(z.nieve) : null,
        total: kN(total),
      });
    }
  }
  return derivado(filas, 'cargas-planta');
}

function cargasCE(f: Fuente, sobre: Publicacion<PubCargasPlanta> | null): FichaDatos['ce']['cargas'] {
  if (!usable(f) || !sobre) return faltaDeSobre('cargasPlanta');
  const usos: CargaUso[] = [];
  for (const p of sobre.datos.plantas) {
    for (const z of p.zonas) {
      usos.push({
        rotulo: z.nombre ? `${p.nombre} (${z.nombre})` : p.nombre,
        pp: kN(z.pp),
        resto: kN(z.resto),
        uso: kN(z.qUso),
        nieve: z.nieve !== null && z.nieve > 0 ? kN(z.nieve) : null,
      });
    }
  }
  return derivado({ usos, lineales: sobre.datos.lineales.map((l) => ({ concepto: l.concepto, gk: `${num(l.gk, 2)} kN/m` })) }, 'cargas-planta');
}

const CATEGORIA_MASA_TEXTO: Record<CategoriaMasa, string> = {
  permanente: 'cargas permanentes',
  tabiqueria: 'tabiquería',
  'uso-residencial': 'viviendas y usos residenciales',
  'uso-publico': 'uso público',
  'uso-aglomeracion': 'aglomeración',
  'uso-almacen': 'almacenes',
  'nieve-persistente': 'nieve persistente',
  agua: 'agua',
};

function sismo(obra: CapaObra, estudio: PerfilEstudio, f: Fuente, sobre: Publicacion<PubSismo> | null): Valor<Sismo> {
  if (!usable(f) || !sobre) return faltaDeSobre('sismo');
  const d = sobre.datos;
  const sistema = TIPO_ESTRUCTURA_SISMO[d.sistema];
  const forzado = obra.tipoEstructuraSismo.valor;
  const tipoEstructura: Valor<string> =
    forzado !== null && forzado !== ''
      ? deCampo({ valor: forzado, origen: obra.tipoEstructuraSismo.origen }, 'obra.tipoEstructuraSismo', 'Tipo de estructura (para el sismo)', 'ncse')
      : derivado(sistema, 'sismo');
  const clasificacion = `${obra.uso.valor || 'Edificio'} ${NCSE.textos.importancia(IMPORTANCIA_TEXTO[d.importancia] ?? d.importancia)}`;
  const base = { clasificacion, tipoEstructura, ab: NCSE.textos.ab(num(d.ab, 2)), obligatoria: d.obligatoria };

  if (!d.obligatoria) {
    return derivado({ ...base, exencion: d.impedimento?.texto ?? null, completo: null }, 'sismo');
  }
  if (!d.calculo) {
    // Obligatoria y sin cálculo: no es exención, es un cálculo por resolver en el módulo.
    return faltaDeSobre('sismo', d.impedimento ? `Resuelva el cálculo en el módulo de sismo: ${d.impedimento.texto}` : 'El módulo de sismo no tiene resultado.');
  }
  const c = d.calculo;
  const rhoAb = d.rho * d.ab;
  const S =
    rhoAb < 0.1
      ? `Para ρ·ab < 0,1g, S = C/1,25 = ${num(d.S, 2)}`
      : rhoAb < 0.4
        ? `Para 0,1g ≤ ρ·ab < 0,4g, S = C/1,25 + 3,33·(ρ·ab/g − 0,1)·(1 − C/1,25) = ${num(d.S, 2)}`
        : `Para ρ·ab ≥ 0,4g, S = 1,0`;
  const modos = c.nModos
    ? `${c.nModos.x} modos en la dirección X y ${c.nModos.y} en la dirección Y (art. 3.6.2.3.1)`
    : 'Se indican en los listados de cálculo por ordenador';
  const fraccion = c.categoriasMasa && c.categoriasMasa.length > 0
    ? `La parte de sobrecarga a considerar en la masa sísmica movilizable (art. 3.2) es: ${[...new Set(c.categoriasMasa)]
        .filter((k) => k !== 'permanente' && k !== 'tabiqueria' && k !== 'agua')
        .map((k) => `${num(FRACCION_MASA[k], 1)} (${CATEGORIA_MASA_TEXTO[k]})`)
        .join('; ')}`
    : 'La parte de sobrecarga a considerar en la masa sísmica movilizable es la que fija el art. 3.2 de la NCSE-02 según el uso de cada planta.';
  return derivado(
    {
      ...base,
      exencion: null,
      completo: {
        K: `K=${num(d.K, 2)}`,
        rho: d.importancia === 'especial' ? NCSE.textos.rhoEspecial : NCSE.textos.rhoNormal,
        S,
        C: d.terreno !== null ? `Terreno tipo ${d.terreno} (C=${num(d.C, 2)})` : `Perfil de estratos ponderado en los 30 primeros metros (C=${num(d.C, 2)})`,
        ac: `ac = S·ρ·ab = ${num(d.S, 2)}·${num(d.rho, 2)}·${num(d.ab, 2)} = ${num(d.ac, 3)} g`,
        metodo: 'Método simplificado de cálculo de la NCSE-02 (art. 3.7): análisis modal espectral.',
        amortiguamiento: AMORTIGUAMIENTO_TEXTO(num(d.omega, 0), sistema),
        periodo: `TF = ${num(c.TF.x, 2)} s (dirección X) / ${num(c.TF.y, 2)} s (dirección Y)`,
        modos,
        fraccion,
        ductilidad: `μ = ${num(d.mu, 0)}${d.ductilidad ? ` (ductilidad ${d.ductilidad})` : ''}`,
        segundoOrden: estudio.sismo.efectosSegundoOrden,
        medidas: estudio.sismo.medidasConstructivas,
      },
    },
    'sismo',
  );
}

const NIVEL_HORMIGON: Record<string, string> = { estadistico: 'ESTADÍSTICO', indirecto: 'INDIRECTO', '100_por_100': '100 POR 100' };
const NIVEL_EJECUCION: Record<string, string> = { normal: 'NORMAL', in_situ_intenso: 'INTENSO', prefabricado_intenso: 'INTENSO (PREFABRICADO)' };

function materialesCE(f: Fuente, sobre: Publicacion<PubMateriales> | null): Valor<ElementoCE[]> {
  if (!usable(f) || !sobre) return faltaDeSobre('materiales');
  const h = sobre.datos.hormigon;
  if (!h) return derivado([], 'materiales', 'El cuadro de materiales no tiene elementos de hormigón.');
  const filas: ElementoCE[] = h.elementos.map((e) => ({
    hormigon: e.tipificacion,
    cemento: h.cemento,
    arido: `${num(h.tamMaxArido)} mm`,
    ac: e.acMax !== null ? num(e.acMax, 2) : '—',
    cementoMin: e.cementoMin !== null ? `${num(e.cementoMin)} kg/m³` : '—',
    fck: `${num(e.fck)} N/mm²`,
    acero: h.aceroPasivo.designacion,
    fyk: `${num(h.aceroPasivo.fyk)} N/mm²`,
    ubicacion: e.nombre,
  }));
  for (const p of h.prescritos) {
    filas.push({ hormigon: p.tipificacion, cemento: h.cemento, arido: `${num(h.tamMaxArido)} mm`, ac: '—', cementoMin: '—', fck: '—', acero: '—', fyk: '—', ubicacion: p.nombre });
  }
  return derivado(filas, 'materiales');
}

function coeficientes(estudio: PerfilEstudio, f: Fuente, sobre: Publicacion<PubMateriales> | null): Valor<Coeficientes> {
  if (!usable(f) || !sobre) return faltaDeSobre('materiales');
  const m = sobre.datos;
  const h = m.hormigon;
  const niveles = h ? [...new Set(h.elementos.map((e) => NIVEL_HORMIGON[e.nivelControl] ?? e.nivelControl))] : [NIVEL_HORMIGON[estudio.control.nivelControlHormigon]];
  return derivado(
    {
      gammaC: h?.gammaC.persistente ?? 1.5,
      gammaS: h?.gammaS.persistente ?? 1.15,
      nivelHormigon: niveles.join(' / '),
      nivelAcero: m.nivelControlAcero.toUpperCase(),
      nivelEjecucion: NIVEL_EJECUCION[m.nivelControlEjecucion] ?? m.nivelControlEjecucion,
      gammaG: GAMMA_DB_SE.G,
      gammaQ: GAMMA_DB_SE.Q,
    },
    'materiales',
  );
}

function durabilidad(f: Fuente, sobre: Publicacion<PubMateriales> | null): Valor<Durabilidad[]> {
  if (!usable(f) || !sobre) return faltaDeSobre('materiales');
  const h = sobre.datos.hormigon;
  if (!h) return derivado([], 'materiales');
  return derivado(
    h.elementos.map((e) => ({
      nombre: e.nombre,
      clases: e.clases.join(' + '),
      cmin: e.cnom !== null && e.cnom > 0 ? e.cnom - e.deltaCdev : null,
      cnom: e.cnom !== null && e.cnom > 0 ? e.cnom : null,
      cementoMin: e.cementoMin,
      acMax: e.acMax,
    })),
    'materiales',
  );
}

const PIDE_GEOMETRIA: readonly TipoForjado[] = ['reticular', 'unidireccional'];

function forjados(obra: CapaObra, estudio: PerfilEstudio, fCargas: Fuente, cargas: Publicacion<PubCargasPlanta> | null, materiales: Publicacion<PubMateriales> | null): Valor<Tipologia[]> {
  if (!usable(fCargas) || !cargas) return faltaDeSobre('cargasPlanta');
  const vistas = new Map<string, { tipo: TipoForjado; canto: number; pp: number }>();
  for (const p of cargas.datos.plantas) {
    for (const z of p.zonas) {
      const clave = claveForjado(z.forjado.tipo, z.forjado.canto);
      if (!vistas.has(clave)) vistas.set(clave, { tipo: z.forjado.tipo, canto: z.forjado.canto, pp: z.pp });
    }
  }
  const h = materiales?.datos.hormigon ?? null;
  const elementoForjado = h ? (h.elementos.find((e) => /forjad/i.test(e.nombre)) ?? h.elementos[0] ?? null) : null;
  const lista: Tipologia[] = [];
  for (const [clave, t] of vistas) {
    const residual = obra.forjados[clave] ?? datosForjadoInicial(t.tipo, t.canto);
    const pide = PIDE_GEOMETRIA.includes(t.tipo);
    const id = (campo: string) => `obra.forjados.${clave}.${campo}`;
    const quien = `${TITULO_FORJADO[t.tipo] ?? t.tipo} h = ${num(t.canto)} cm`;
    lista.push({
      clave,
      tipo: t.tipo,
      canto: t.canto,
      pp: t.pp,
      titulo: TITULO_FORJADO[t.tipo] ?? TITULO_FORJADO.otro,
      intereje: pide ? deCampo(residual.intereje, id('intereje'), `Intereje del ${quien}`, 'forjados') : null,
      anchoNervio: pide ? deCampo(residual.anchoNervio, id('anchoNervio'), `Ancho de nervio del ${quien}`, 'forjados') : null,
      capaCompresion: pide ? deCampo(residual.capaCompresion, id('capaCompresion'), `Capa de compresión del ${quien}`, 'forjados') : null,
      pieza: pide ? deCampo(residual.pieza, id('pieza'), `Pieza de entrevigado del ${quien}`, 'forjados') : null,
      hormigon: elementoForjado?.tipificacion ?? null,
      acero: h?.aceroPasivo.designacion ?? null,
      flechas: estudio.forjados[t.tipo],
    });
  }
  return derivado(lista, 'cargas-planta');
}

function juntas(obra: CapaObra, apartado: ApartadoId): Juntas {
  const j = obra.juntas;
  const existen = deBool(j.existen, 'obra.juntas.existen', '¿Hay juntas de dilatación?', apartado);
  return {
    existen,
    numero: j.existen.valor ? deCampo(j.numero, 'obra.juntas.numero', 'Cuántas juntas de dilatación', apartado) : derivado(null, 'obra'),
    separacionMax: j.existen.valor ? deCampo(j.separacionMax, 'obra.juntas.separacionMax', 'Separación máxima entre juntas (m)', apartado) : derivado(null, 'obra'),
    termicasConsideradas: deBool(j.termicasConsideradas, 'obra.juntas.termicasConsideradas', '¿Se han considerado las acciones térmicas y reológicas?', apartado),
  };
}

// ── Ensamblado ──────────────────────────────────────────────────────────────

export function ensamblar(s: MemoriaState, sobres: Sobres): FichaDatos {
  const { obra, estudio, pubs } = s;
  const provinciaFicha = obra.provincia.valor;
  const provinciaNombre = provinciaFicha ? (provinciaPorIne(provinciaFicha)?.nombre ?? null) : null;

  const fuentes: Record<ModuloPub, Fuente> = {
    materiales: fuente('materiales', sobres.materiales, pubs.materiales, provinciaFicha, true),
    vientoNieve: fuente('vientoNieve', sobres.vientoNieve, pubs.vientoNieve, provinciaFicha, false),
    cargasPlanta: fuente('cargasPlanta', sobres.cargasPlanta, pubs.cargasPlanta, provinciaFicha, true),
    sismo: fuente('sismo', sobres.sismo, pubs.sismo, provinciaFicha, true, sobres.sismo?.datos.ine),
  };

  const materiales = usable(fuentes.materiales) ? sobres.materiales : null;
  const hayAcero = materiales?.datos.aceroEstructural != null;
  const hayMadera = materiales?.datos.madera != null;
  const procede: Record<ApartadoId, boolean> = {
    indice: true,
    se: true,
    seae: true,
    sec: true,
    ncse: true,
    ce: true,
    forjados: true,
    sea: hayAcero,
    sef: obra.fabrica.procede,
    sem: hayMadera,
  };

  const vidaUtilAnios = materiales?.datos.vidaUtilAnios ?? estudio.control.vidaUtilAnios;
  const juntasCE = juntas(obra, 'ce');

  const geotecnia = Object.fromEntries(
    GEOTECNIA_CAMPOS.map((k) => [k, deCampo(obra.geotecnia[k], `obra.geotecnia.${k}`, ETIQUETAS_GEOTECNIA[k], 'sec')]),
  ) as Record<GeotecniaCampo, Valor<string>>;

  const contencionesExisten = deBool(obra.contenciones.existen, 'obra.contenciones.existen', '¿Hay muros de contención?', 'sec');

  const sef: FichaDatos['sef'] = procede.sef
    ? (() => {
        const fb = obra.fabrica.fb.valor;
        const fm = obra.fabrica.fm.valor;
        const pieza = obra.fabrica.pieza.valor;
        const fk = pieza !== null && fb !== null && fm !== null ? lookupFk(pieza, fb, fm) : null;
        const cat = obra.fabrica.categoriaControl.valor;
        const ej = obra.fabrica.claseEjecucion.valor;
        return {
          pieza: deCampo(obra.fabrica.pieza, 'obra.fabrica.pieza', 'Tipo de pieza de la fábrica', 'sef'),
          piezaEtiqueta: pieza !== null ? (TABLA_4_4[pieza]?.label ?? pieza) : null,
          fb: deCampo(obra.fabrica.fb, 'obra.fabrica.fb', 'Resistencia de las piezas fb (N/mm²)', 'sef'),
          fm: deCampo(obra.fabrica.fm, 'obra.fabrica.fm', 'Resistencia del mortero fm (N/mm²)', 'sef'),
          fk:
            fk !== null
              ? derivado<number | null>(fk, 'norma')
              : { valor: null, estado: 'falta', origen: 'norma', id: 'obra.fabrica.fb', etiqueta: 'fb y fm con casilla en la tabla 4.4 del DB SE-F', apartado: 'sef', nota: 'La tabla 4.4 no tiene fk para esa pareja de fb y fm.' },
          categoriaControl: deCampo(obra.fabrica.categoriaControl, 'obra.fabrica.categoriaControl', 'Categoría de control de fabricación', 'sef'),
          claseEjecucion: deCampo(obra.fabrica.claseEjecucion, 'obra.fabrica.claseEjecucion', 'Clase de ejecución de la fábrica', 'sef'),
          gammaM: cat !== null && ej !== null ? derivado<number | null>(lookupGammaM(cat, ej), 'norma') : derivado<number | null>(null, 'norma'),
          categoriaEtiqueta: cat !== null ? CATEGORIA_LABELS[cat] : null,
          ejecucionEtiqueta: ej !== null ? EJECUCION_LABELS[ej] : null,
        };
      })()
    : null;

  return {
    obra: {
      denominacion: deCampo(obra.denominacion, 'obra.denominacion', 'Nombre de la obra', 'indice'),
      uso: deCampo(obra.uso, 'obra.uso', 'Uso principal del edificio', 'indice'),
      provincia: deCampo(obra.provincia, 'obra.provincia', 'Provincia', 'indice'),
      municipio: deCampo(obra.municipio, 'obra.municipio', 'Municipio', 'indice'),
      altitud: deCampo(obra.altitud, 'obra.altitud', 'Altitud (m)', 'indice'),
      provinciaNombre,
    },
    fuentes,
    procede,
    se: {
      periodoServicio: derivado(vidaUtilAnios, materiales ? 'materiales' : 'estudio'),
      modeloAnalisis: estudio.modeloAnalisis,
      flechaActiva: estudio.flechaActivaGeneral,
      desplome: estudio.desplome,
    },
    seae: {
      viento: viento(obra, fuentes.vientoNieve, sobres.vientoNieve, provinciaNombre),
      nieve: nieve(fuentes.vientoNieve, sobres.vientoNieve),
      niveles: niveles(fuentes.cargasPlanta, sobres.cargasPlanta),
    },
    sec: {
      geotecnia,
      cimentacion: {
        descripcion: deCampo(obra.cimentacion.descripcion, 'obra.cimentacion.descripcion', 'Cómo es la cimentación', 'sec'),
        material: deCampo(obra.cimentacion.material, 'obra.cimentacion.material', 'Material de la cimentación', 'sec'),
        dimensiones: estudio.cimentacion.dimensionesYArmado,
        ejecucion: estudio.cimentacion.condicionesEjecucion,
      },
      contenciones: {
        existen: contencionesExisten,
        descripcion: obra.contenciones.existen.valor ? deCampo(obra.contenciones.descripcion, 'obra.contenciones.descripcion', 'Cómo son los muros de contención', 'sec') : null,
        material: obra.contenciones.existen.valor ? deCampo(obra.contenciones.material, 'obra.contenciones.material', 'Material de los muros de contención', 'sec') : null,
        ejecucion: estudio.contenciones.condicionesEjecucion,
      },
    },
    ncse: sismo(obra, estudio, fuentes.sismo, sobres.sismo),
    ce: {
      descripcionSistema: deCampo(obra.descripcionSistema, 'obra.descripcionSistema', 'Descripción del sistema estructural', 'ce'),
      programa: estudio.programa,
      memoria: { metodo: estudio.metodoCalculo, redistribucion: estudio.redistribucion, flechas: estudio.flechas, cuantias: estudio.cuantias },
      cargas: cargasCE(fuentes.cargasPlanta, sobres.cargasPlanta),
      barandillas: estudio.barandillas,
      juntas: juntasCE,
      sobrecargaTerreno: deCampo(obra.sobrecargaTerreno, 'obra.sobrecargaTerreno', 'Sobrecarga en el terreno (kN/m²)', 'ce'),
      materiales: materialesCE(fuentes.materiales, sobres.materiales),
      coeficientes: coeficientes(estudio, fuentes.materiales, sobres.materiales),
      durabilidad: durabilidad(fuentes.materiales, sobres.materiales),
    },
    forjados: forjados(obra, estudio, fuentes.cargasPlanta, sobres.cargasPlanta, materiales),
    sea:
      procede.sea && materiales?.datos.aceroEstructural
        ? {
            verificacion:
              estudio.verificacionAcero === 'informatica'
                ? SEA.bases.criterios.programa(estudio.programa.nombre, estudio.programa.version, estudio.programa.empresa, estudio.programa.domicilio)
                : SEA.bases.criterios.manual,
            juntas: juntas(obra, 'sea'),
            acero: materiales.datos.aceroEstructural,
            vidaUtilAnios,
          }
        : null,
    sef,
    sem: procede.sem && materiales?.datos.madera ? { madera: materiales.datos.madera, resistenciaFuego: materiales.datos.resistenciaFuego, vidaUtilAnios } : null,
  };
}

// ── Evaluación ──────────────────────────────────────────────────────────────

export interface Evaluacion {
  datos: FichaDatos;
  huecos: Hueco[];
  /** Sí cuando no queda ningún hueco: se puede exportar. */
  listo: boolean;
  mensajeBloqueo: string | null;
}

export function evaluar(s: MemoriaState, sobres: Sobres): Evaluacion {
  const datos = ensamblar(s, sobres);
  const huecos = colaHuecos(datos);
  return { datos, huecos, listo: huecos.length === 0, mensajeBloqueo: mensajeBloqueo(huecos) };
}

/** Las tipologías de forjado que la ficha va a imprimir, para materializar sus datos residuales en el estado. */
export function tipologiasDe(sobre: Publicacion<PubCargasPlanta> | null): { tipo: TipoForjado; canto: number }[] {
  if (!sobre) return [];
  const vistas = new Map<string, { tipo: TipoForjado; canto: number }>();
  for (const p of sobre.datos.plantas) for (const z of p.zonas) vistas.set(claveForjado(z.forjado.tipo, z.forjado.canto), { tipo: z.forjado.tipo, canto: z.forjado.canto });
  return [...vistas.values()];
}
