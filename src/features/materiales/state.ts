/**
 * Estado del módulo «Cuadro de materiales» y su traducción al motor.
 *
 * El estado es anidado (elementos → situación, grupos de madera, elementos de
 * acero), así que NO usa `useModuleState`, que sólo maneja primitivos planos.
 * Mismo enfoque que el módulo de sismo: clave propia en localStorage, versión
 * de esquema propia y `normalizar()` defensivo al leer.
 *
 * Dos capas, como se decidió en el diseño:
 *  - `estudio`: lo que no cambia entre obras del mismo despacho (acero, control,
 *    árido, vida útil, cemento). Viaja de obra en obra y no se confirma.
 *  - el resto: capa de obra.
 */

import {
  deriveAcero,
  deriveHormigon,
  deriveMadera,
  type DerivacionAcero,
  type DerivacionHormigon,
  type DerivacionMadera,
} from '../../lib/materiales';
import type {
  AceroEstructural,
  AceroPasivo,
  AgresividadQuimica,
  CategoriaEjecucion,
  CategoriaUso,
  ClaseCorrosividad,
  ClaseEjecucion,
  ClaseExposicion,
  ClaseServicio,
  ClaseUso,
  Consistencia,
  ElementoAcero,
  ElementoHormigon,
  GrupoMadera,
  MallaElectrosoldada,
  MedioUnion,
  NivelControlEjecucion,
  NivelControlHormigon,
  NivelRiesgo,
  OpcionesObra,
  ProteccionAcero,
  TipoCemento,
  TipoMadera,
  VidaUtil,
} from '../../lib/materiales/types';
import {
  CEMENTO_MIN_HL,
  CONSISTENCIAS,
  FCTK_005,
  FY_ACERO_ESTRUCTURAL,
  FYK_ACERO_PASIVO,
  FYK_MALLA,
  GAMMA_MATERIALES,
} from '../../lib/materiales/tablasCE';
import { GAMMA_M_EXTRAORDINARIA } from '../../lib/materiales/tablasMadera';
import { leerObra } from '../../lib/obra';
import { publicar } from '../../lib/pub';
import {
  ESPECIES,
  LAMINAS_POR_GL,
  PRESETS_HORMIGON,
  PRESETS_MADERA,
  PROTECCION_SUGERIDA,
  RESISTENCIA_FUEGO_OPCIONES,
  SITUACIONES,
  SITUACIONES_MADERA,
  TIPOS_MADERA,
  type SituacionId,
  type SituacionMaderaId,
} from './catalogos';

export const STORAGE_KEY = 'concreta-materiales-model';
export const SCHEMA_VERSION_KEY = 'concreta-materiales-model-version';
export const SCHEMA_VERSION = '1';

// ── Forma del estado ────────────────────────────────────────────────────────

export interface PerfilEstudio {
  aceroPasivo: AceroPasivo;
  malla: MallaElectrosoldada | null;
  aceroEstructural: AceroEstructural;
  nivelControlHormigon: NivelControlHormigon;
  /** Texto libre del cuadro de aceros («Normal»). */
  nivelControlAcero: string;
  nivelControlEjecucion: NivelControlEjecucion;
  tamMaxArido: number;
  vidaUtil: VidaUtil;
  cemento: TipoCemento;
  vidaUtilAnios: number;
}

export interface FilaHormigon {
  id: string;
  nombre: string;
  /** '' = hueco sin resolver: pinta en rojo y bloquea la exportación. */
  situacion: SituacionId | '';
  fck: number;
  consistencia: Consistencia;
  /** Recubrimiento forzado a mano, mm. Sobrevive pero queda marcado. */
  recubrimientoManual: number | null;
  /** Pilar, viga o forjado: CE 33.5 les prescribe fluida. Lo pone el preset. */
  prescripcionFluida?: boolean;
}

export interface FilaMadera {
  id: string;
  nombre: string;
  situacion: SituacionMaderaId | '';
  tipo: TipoMadera;
  claseResistente: string;
  especie: string;
}

export interface FilaAcero {
  id: string;
  nombre: string;
  union: 'soldadura' | 'atornillado';
  caracteristicasUnion: string;
  corrosividad: ClaseCorrosividad;
  /**
   * Protección frente a la corrosión. Sin valor se toma la sugerida para la
   * clase de corrosividad (PROTECCION_SUGERIDA); con valor manda lo escrito,
   * porque lo que se imprime en el cuadro es una prescripción y tiene que
   * poder cambiarse.
   */
  proteccion?: ProteccionAcero;
  caracteristicasProteccion?: string;
}

export interface MaterialesState {
  /** M0 — conmutadores de material. Podan el formulario y los cuadros. */
  usaHormigon: boolean;
  usaAceroEstructural: boolean;
  usaMadera: boolean;
  estudio: PerfilEstudio;
  /** Modificador de obra: añade XS1 a lo que tenga caras al aire libre. */
  costa: boolean;
  /** Modificador de obra: zona con heladas, XF1 en las caras al aire libre que reciben lluvia. */
  heladas: boolean;
  /** Agresividad química del terreno según el geotécnico: XA1/XA2/XA3 en lo enterrado. */
  terrenoAgresivo: AgresividadQuimica;
  /** Resistencia al fuego exigida a la estructura (DB SI 6), en minutos. null = sin indicar. */
  resistenciaFuego: number | null;
  elementos: FilaHormigon[];
  aceroEstr: {
    nivelRiesgo: NivelRiesgo;
    categoriaUso: CategoriaUso;
    categoriaEjecucion: CategoriaEjecucion;
    elementos: FilaAcero[];
  };
  maderaGrupos: FilaMadera[];
  diametrosAnclaje: number[];
  hormigonesAnclaje: number[];
  /** Modo Ayuda: encendido por defecto. */
  ayuda: boolean;
}

// ── Valores por defecto ─────────────────────────────────────────────────────

let contador = 0;
export function nuevoId(prefijo = 'e'): string {
  contador += 1;
  return `${prefijo}${Date.now().toString(36)}${contador.toString(36)}`;
}

export function filaDesdePreset(nombre: string): FilaHormigon {
  const preset = PRESETS_HORMIGON[nombre];
  return {
    id: nuevoId(),
    nombre,
    situacion: preset ? preset.situacion : '',
    fck: preset ? preset.fck : 30,
    consistencia: preset ? preset.consistencia : 'blanda',
    recubrimientoManual: null,
    prescripcionFluida: preset?.prescripcionFluida,
  };
}

export function filaMaderaDesdePreset(nombre: string): FilaMadera {
  const preset = PRESETS_MADERA[nombre];
  return {
    id: nuevoId('m'),
    nombre,
    situacion: preset ? preset.situacion : '',
    tipo: preset ? preset.tipo : 'maciza',
    claseResistente: preset ? preset.claseResistente : 'C24',
    especie: preset ? preset.especie : 'Pinus sylvestris',
  };
}

export function defaultMaterialesState(): MaterialesState {
  return {
    usaHormigon: true,
    usaAceroEstructural: false,
    usaMadera: false,
    estudio: {
      aceroPasivo: 'B500SD',
      malla: 'ME-500 T',
      aceroEstructural: 'S275JR',
      nivelControlHormigon: 'estadistico',
      nivelControlAcero: 'Normal',
      nivelControlEjecucion: 'normal',
      tamMaxArido: 20,
      vidaUtil: 50,
      // Ninguno de los cuadros del estudio declara el cemento, y la familia
      // cambia el recubrimiento. CEM II/B-S es la que reproduce sus números
      // (ver src/test/materiales/oraculos.test.ts).
      cemento: 'CEM II/B-S',
      vidaUtilAnios: 50,
    },
    costa: false,
    heladas: false,
    terrenoAgresivo: 'ninguna',
    resistenciaFuego: null,
    elementos: [
      filaDesdePreset('Cimentación'),
      filaDesdePreset('Muros de sótano'),
      filaDesdePreset('Forjados'),
      filaDesdePreset('Hormigón de limpieza'),
    ],
    aceroEstr: {
      nivelRiesgo: 'CC2',
      categoriaUso: 'SC1',
      categoriaEjecucion: 'PC1',
      elementos: [
        {
          id: nuevoId('a'),
          nombre: 'Soportes',
          union: 'soldadura',
          caracteristicasUnion: 'En ángulo',
          corrosividad: 'C1',
        },
        {
          id: nuevoId('a'),
          nombre: 'Jácenas',
          union: 'soldadura',
          caracteristicasUnion: 'En ángulo',
          corrosividad: 'C1',
        },
        {
          id: nuevoId('a'),
          nombre: 'Chapas',
          union: 'atornillado',
          caracteristicasUnion: '5.6',
          corrosividad: 'C3',
        },
      ],
    },
    maderaGrupos: [],
    diametrosAnclaje: [8, 10, 12, 16, 20, 25],
    hormigonesAnclaje: [25, 30],
    ayuda: true,
  };
}

// ── Lectura defensiva ───────────────────────────────────────────────────────

const esConsistencia = (v: unknown): v is Consistencia =>
  typeof v === 'string' && v in CONSISTENCIAS;

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Un estado guardado por una versión anterior, o manipulado a mano, no puede
 * tumbar el módulo. Todo lo que no se reconozca cae al valor por defecto.
 */
export function normalizar(bruto: unknown): MaterialesState {
  const base = defaultMaterialesState();
  if (!esObjeto(bruto)) return base;

  const estudio = esObjeto(bruto.estudio) ? bruto.estudio : {};
  const acero = esObjeto(bruto.aceroEstr) ? bruto.aceroEstr : {};

  const elementos = Array.isArray(bruto.elementos)
    ? bruto.elementos.filter(esObjeto).map((e): FilaHormigon => ({
        id: typeof e.id === 'string' ? e.id : nuevoId(),
        nombre: typeof e.nombre === 'string' ? e.nombre : '',
        situacion:
          typeof e.situacion === 'string' && e.situacion in SITUACIONES
            ? (e.situacion as SituacionId)
            : '',
        fck: typeof e.fck === 'number' && e.fck > 0 ? e.fck : 30,
        // Las cinco de la tabla 33.5.a. Antes esto colapsaba todo lo que no
        // fuera fluida a blanda: al recargar, una consistencia seca elegida a
        // conciencia se convertía en otra cosa sin avisar.
        consistencia: esConsistencia(e.consistencia) ? e.consistencia : 'blanda',
        recubrimientoManual:
          typeof e.recubrimientoManual === 'number' && e.recubrimientoManual > 0
            ? e.recubrimientoManual
            : null,
        prescripcionFluida: e.prescripcionFluida === true,
      }))
    : base.elementos;

  const maderaGrupos = Array.isArray(bruto.maderaGrupos)
    ? bruto.maderaGrupos.filter(esObjeto).map((g): FilaMadera => {
        const tipo: TipoMadera = g.tipo === 'laminada' ? 'laminada' : 'maciza';
        const opcion = TIPOS_MADERA.find((t) => t.id === tipo) ?? TIPOS_MADERA[0];
        return {
          id: typeof g.id === 'string' ? g.id : nuevoId('m'),
          nombre: typeof g.nombre === 'string' ? g.nombre : '',
          situacion:
            typeof g.situacion === 'string' && g.situacion in SITUACIONES_MADERA
              ? (g.situacion as SituacionMaderaId)
              : '',
          tipo,
          // Una clase que no es del tipo (GL24h en aserrada) o una especie fuera
          // del catálogo llegarían al cuadro sin que ningún desplegable las
          // ofrezca. Caen a la clase habitual del tipo y al pino silvestre.
          claseResistente:
            typeof g.claseResistente === 'string' && opcion.clases.includes(g.claseResistente)
              ? g.claseResistente
              : opcion.porDefecto,
          especie: ESPECIES.some((e) => e.id === g.especie)
            ? (g.especie as string)
            : 'Pinus sylvestris',
        };
      })
    : base.maderaGrupos;

  const elementosAcero = Array.isArray(acero.elementos)
    ? acero.elementos.filter(esObjeto).map((a): FilaAcero => ({
        id: typeof a.id === 'string' ? a.id : nuevoId('a'),
        nombre: typeof a.nombre === 'string' ? a.nombre : '',
        union: a.union === 'atornillado' ? 'atornillado' : 'soldadura',
        caracteristicasUnion:
          typeof a.caracteristicasUnion === 'string' ? a.caracteristicasUnion : '',
        corrosividad: ['C1', 'C2', 'C3', 'C4', 'C5'].includes(a.corrosividad as string)
          ? (a.corrosividad as ClaseCorrosividad)
          : 'C1',
        proteccion: ['pintura', 'galvanizado', 'ninguna'].includes(a.proteccion as string)
          ? (a.proteccion as ProteccionAcero)
          : undefined,
        caracteristicasProteccion:
          typeof a.caracteristicasProteccion === 'string' ? a.caracteristicasProteccion : undefined,
      }))
    : base.aceroEstr.elementos;

  // Un fck fuera de la tabla A19.3.1 haría lanzar a `fctd` en pleno render del
  // cuadro de anclajes; y una lista vacía dejaría la tabla sin columnas.
  const hormigonesAnclaje = Array.isArray(bruto.hormigonesAnclaje)
    ? bruto.hormigonesAnclaje.filter((d): d is number => typeof d === 'number' && d in FCTK_005)
    : [];
  const diametrosAnclaje = Array.isArray(bruto.diametrosAnclaje)
    ? bruto.diametrosAnclaje.filter((d): d is number => typeof d === 'number' && d > 0)
    : [];

  const bool = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def);
  const num = (v: unknown, def: number) => (typeof v === 'number' && v > 0 ? v : def);
  const str = <T extends string>(v: unknown, permitidos: readonly T[], def: T): T =>
    permitidos.includes(v as T) ? (v as T) : def;

  return {
    usaHormigon: bool(bruto.usaHormigon, base.usaHormigon),
    usaAceroEstructural: bool(bruto.usaAceroEstructural, base.usaAceroEstructural),
    usaMadera: bool(bruto.usaMadera, base.usaMadera),
    estudio: {
      aceroPasivo: str(
        estudio.aceroPasivo,
        ['B400S', 'B500S', 'B400SD', 'B500SD'] as const,
        base.estudio.aceroPasivo,
      ),
      malla: estudio.malla === null ? null : str(
        estudio.malla,
        ['ME-500 T', 'ME-500 SD'] as const,
        base.estudio.malla ?? 'ME-500 T',
      ),
      aceroEstructural: str(
        estudio.aceroEstructural,
        ['S235JR', 'S275JR', 'S355JR', 'S355J2', 'S450J0'] as const,
        base.estudio.aceroEstructural,
      ),
      nivelControlHormigon: str(
        estudio.nivelControlHormigon,
        ['estadistico', 'indirecto', '100_por_100'] as const,
        base.estudio.nivelControlHormigon,
      ),
      nivelControlAcero:
        typeof estudio.nivelControlAcero === 'string'
          ? estudio.nivelControlAcero
          : base.estudio.nivelControlAcero,
      nivelControlEjecucion: str(
        estudio.nivelControlEjecucion,
        ['prefabricado_intenso', 'in_situ_intenso', 'normal'] as const,
        base.estudio.nivelControlEjecucion,
      ),
      tamMaxArido: num(estudio.tamMaxArido, base.estudio.tamMaxArido),
      vidaUtil: estudio.vidaUtil === 100 ? 100 : 50,
      cemento: str(
        estudio.cemento,
        [
          'CEM I', 'CEM II/A-D', 'CEM II/A-P', 'CEM II/A-S', 'CEM II/A-V',
          'CEM II/B-S', 'CEM II/B-P', 'CEM II/B-V', 'CEM III/A', 'CEM III/B',
          'CEM IV', 'CEM V',
        ] as const,
        base.estudio.cemento,
      ),
      vidaUtilAnios: num(estudio.vidaUtilAnios, base.estudio.vidaUtilAnios),
    },
    costa: bool(bruto.costa, base.costa),
    heladas: bool(bruto.heladas, base.heladas),
    terrenoAgresivo: str(
      bruto.terrenoAgresivo,
      ['ninguna', 'debil', 'moderada', 'alta'] as const,
      base.terrenoAgresivo,
    ),
    resistenciaFuego: (RESISTENCIA_FUEGO_OPCIONES as readonly number[]).includes(
      bruto.resistenciaFuego as number,
    )
      ? (bruto.resistenciaFuego as number)
      : null,
    elementos,
    aceroEstr: {
      nivelRiesgo: str(acero.nivelRiesgo, ['CC1', 'CC2', 'CC3'] as const, base.aceroEstr.nivelRiesgo),
      categoriaUso: str(acero.categoriaUso, ['SC1', 'SC2'] as const, base.aceroEstr.categoriaUso),
      categoriaEjecucion: str(
        acero.categoriaEjecucion,
        ['PC1', 'PC2'] as const,
        base.aceroEstr.categoriaEjecucion,
      ),
      elementos: elementosAcero,
    },
    maderaGrupos,
    diametrosAnclaje: diametrosAnclaje.length ? diametrosAnclaje : base.diametrosAnclaje,
    hormigonesAnclaje: hormigonesAnclaje.length ? hormigonesAnclaje : base.hormigonesAnclaje,
    ayuda: bool(bruto.ayuda, base.ayuda),
  };
}

export function cargarEstado(): MaterialesState {
  try {
    if (localStorage.getItem(SCHEMA_VERSION_KEY) !== SCHEMA_VERSION) return defaultMaterialesState();
    const bruto = localStorage.getItem(STORAGE_KEY);
    if (!bruto) return defaultMaterialesState();
    return normalizar(JSON.parse(bruto));
  } catch {
    return defaultMaterialesState();
  }
}

export function guardarEstado(state: MaterialesState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    localStorage.setItem(SCHEMA_VERSION_KEY, SCHEMA_VERSION);
  } catch {
    // Almacenamiento lleno o modo privado: se ignora, como en el resto de módulos.
  }
}

// ── Traducción al motor ─────────────────────────────────────────────────────

export function opcionesObra(state: MaterialesState): OpcionesObra {
  return {
    vidaUtil: state.estudio.vidaUtil,
    cemento: state.estudio.cemento,
    nivelControlEjecucion: state.estudio.nivelControlEjecucion,
    costa: state.costa,
    heladas: state.heladas,
    terrenoAgresivo: state.terrenoAgresivo,
  };
}

/**
 * Una fila con situación resuelta y derivable. El HL y los huecos quedan fuera.
 *
 * `conHormigonLimpieza` es un hecho del cuadro, no de la fila: si la obra
 * lleva una fila de hormigón de limpieza, los elementos contra el terreno
 * apoyan sobre él y la nota de los 70 mm del CE 44.2.1.1 cambia de redacción.
 */
export function elementoDeMotor(
  fila: FilaHormigon,
  estudio: PerfilEstudio,
  conHormigonLimpieza = false,
): ElementoHormigon | null {
  if (!fila.situacion) return null;
  const opcion = SITUACIONES[fila.situacion];
  if (!opcion.situacion) return null;
  return {
    id: fila.id,
    nombre: fila.nombre.trim() || '(sin nombre)',
    tipoHormigon: 'armado',
    situacion: opcion.situacion,
    fckEspecificada: fila.fck,
    consistencia: fila.consistencia,
    tamMaxArido: estudio.tamMaxArido,
    prescripcionFluida: fila.prescripcionFluida,
    contraTerreno: opcion.contraTerreno,
    conHormigonLimpieza: opcion.contraTerreno ? conHormigonLimpieza : undefined,
    expuestoAireExterior: opcion.expuestoAireExterior,
    hidrofugo: opcion.hidrofugo,
    nivelControl: estudio.nivelControlHormigon,
  };
}

/**
 * CE Anejo 10 §3: el hormigón de limpieza no se deriva de nada — el Código
 * admite una única tipificación, HL-150/C/TM, donde 150 es la dosificación
 * mínima de cemento (no una resistencia).
 */
export function tipificacionLimpieza(consistencia: Consistencia, tamMaxArido: number): string {
  return `HL-${CEMENTO_MIN_HL}/${CONSISTENCIAS[consistencia].letra}/${tamMaxArido}`;
}

export function grupoDeMotor(fila: FilaMadera): GrupoMadera | null {
  if (!fila.situacion) return null;
  return {
    id: fila.id,
    nombre: fila.nombre.trim() || '(sin nombre)',
    situacion: SITUACIONES_MADERA[fila.situacion].situacion,
    tipo: fila.tipo,
    claseResistente: fila.claseResistente,
    especie: fila.especie,
    claseLaminas: fila.tipo === 'laminada' ? LAMINAS_POR_GL[fila.claseResistente] : undefined,
  };
}

export function elementoAceroDeMotor(
  fila: FilaAcero,
  designacion: AceroEstructural,
): ElementoAcero {
  const sugerida = PROTECCION_SUGERIDA[fila.corrosividad];
  return {
    id: fila.id,
    nombre: fila.nombre.trim() || '(sin nombre)',
    designacion,
    union: fila.union,
    caracteristicasUnion: fila.caracteristicasUnion,
    corrosividad: fila.corrosividad,
    proteccion: fila.proteccion ?? sugerida.proteccion,
    caracteristicasProteccion: fila.caracteristicasProteccion ?? sugerida.detalle,
  };
}

// ── Evaluación completa ─────────────────────────────────────────────────────

export interface Evaluacion {
  /** Una entrada por fila de hormigón derivable, en el orden del cuadro. */
  hormigon: { fila: FilaHormigon; derivacion: DerivacionHormigon }[];
  /** Filas de hormigón de limpieza: no se derivan, se prescriben. */
  limpieza: FilaHormigon[];
  /** Filas sin situación elegida: el hueco rojo. */
  huecos: FilaHormigon[];
  madera: { fila: FilaMadera; derivacion: DerivacionMadera }[];
  huecosMadera: FilaMadera[];
  acero: DerivacionAcero | null;
  /** Nº de mensajes de aviso y de error en toda la obra. */
  avisos: number;
  errores: number;
  /** Exportar exige que no queden huecos ni errores. */
  listo: boolean;
}

export function evaluar(state: MaterialesState): Evaluacion {
  const opciones = opcionesObra(state);

  const hormigon: Evaluacion['hormigon'] = [];
  const limpieza: FilaHormigon[] = [];
  const huecos: FilaHormigon[] = [];

  if (state.usaHormigon) {
    const hayLimpieza = state.elementos.some((f) => f.situacion === 'limpieza');
    for (const fila of state.elementos) {
      if (fila.situacion === 'limpieza') {
        limpieza.push(fila);
        continue;
      }
      const entrada = elementoDeMotor(fila, state.estudio, hayLimpieza);
      if (!entrada) {
        huecos.push(fila);
        continue;
      }
      hormigon.push({ fila, derivacion: deriveHormigon(entrada, opciones) });
    }
  }

  const madera: Evaluacion['madera'] = [];
  const huecosMadera: FilaMadera[] = [];
  if (state.usaMadera) {
    for (const fila of state.maderaGrupos) {
      const grupo = grupoDeMotor(fila);
      if (!grupo) {
        huecosMadera.push(fila);
        continue;
      }
      madera.push({ fila, derivacion: deriveMadera(grupo) });
    }
  }

  const acero = state.usaAceroEstructural
    ? deriveAcero({
        nivelRiesgo: state.aceroEstr.nivelRiesgo,
        categoriaUso: state.aceroEstr.categoriaUso,
        categoriaEjecucion: state.aceroEstr.categoriaEjecucion,
        elementos: state.aceroEstr.elementos.map((f) =>
          elementoAceroDeMotor(f, state.estudio.aceroEstructural),
        ),
      })
    : null;

  const mensajes = [
    ...hormigon.flatMap((h) => h.derivacion.mensajes),
    ...madera.flatMap((m) => m.derivacion.mensajes),
    ...(acero?.mensajes ?? []),
  ];
  const avisos = mensajes.filter((m) => m.severidad === 'aviso').length;
  const errores = mensajes.filter((m) => m.severidad === 'error').length;

  return {
    hormigon,
    limpieza,
    huecos,
    madera,
    huecosMadera,
    acero,
    avisos,
    errores,
    listo: huecos.length === 0 && huecosMadera.length === 0 && errores === 0,
  };
}

// ── Publicación ─────────────────────────────────────────────────────────────

/**
 * Nombre del módulo en las publicaciones y versión del esquema de `datos`.
 * Tocar `PubMateriales` obliga a subir `PUB_VERSION`: un consumidor que pide la
 * versión 1 y encuentra la 2 recibe `null` en vez de un objeto a medias
 * (ver `lib/pub`).
 */
export const MODULO_PUB = 'materiales';
export const PUB_VERSION = 1;

/** Un coeficiente parcial con sus dos situaciones, como lo rotula el cuadro. */
export interface GammaPub {
  persistente: number;
  accidental: number;
}

export interface PubElementoHormigon {
  nombre: string;
  /** CE 33.6 — T-R/C/TM/A. */
  tipificacion: string;
  /** La ADOPTADA: max(especificada, mínima por durabilidad), N/mm². */
  fck: number;
  /** fck/γc en situación persistente o transitoria, N/mm². */
  fcd: number;
  consistencia: Consistencia;
  /** Todas las aplicables, en el orden de la tabla 27.1.a. */
  clases: ClaseExposicion[];
  /** Sí cuando las forzó el proyectista en vez de dejarlas derivar. */
  clasesForzadas: boolean;
  /** kg/m³; `null` cuando la norma no lo tabula para esas clases. */
  cementoMin: number | null;
  acMax: number | null;
  /**
   * Recubrimiento NOMINAL, mm: `deltaCdev` ya está sumado. 0 en hormigón en
   * masa, que no tiene armadura que proteger, y `null` cuando la norma no
   * tabula recubrimiento para alguna de las clases presentes — de ahí sale la
   * nota al pie que el consumidor tendrá que escribir.
   */
  cnom: number | null;
  /** CE tabla 43.4.1 — margen por control de ejecución, mm. */
  deltaCdev: number;
  nivelControl: NivelControlHormigon;
}

export interface PubHormigon {
  gammaC: GammaPub;
  /** El de la armadura pasiva, que el cuadro imprime junto al del hormigón. */
  gammaS: GammaPub;
  aceroPasivo: { designacion: AceroPasivo; fyk: number };
  malla: { designacion: MallaElectrosoldada; fyk: number } | null;
  tamMaxArido: number;
  cemento: TipoCemento;
  elementos: PubElementoHormigon[];
  /** Los que se prescriben sin derivar: el hormigón de limpieza. */
  prescritos: { nombre: string; tipificacion: string }[];
}

export interface PubAceroEstructural {
  /** La del perfil de estudio, común a todos los elementos. */
  designacion: AceroEstructural;
  /** Límite elástico nominal, N/mm². */
  fy: number;
  gammaM: GammaPub;
  nivelRiesgo: NivelRiesgo;
  categoriaUso: CategoriaUso;
  categoriaEjecucionDeclarada: CategoriaEjecucion;
  /** La EFECTIVA, que puede subir a PC2 sola (CE 91.2.2.2). Es la que manda. */
  categoriaEjecucion: CategoriaEjecucion;
  claseEjecucion: ClaseEjecucion;
  elementos: {
    nombre: string;
    designacion: AceroEstructural;
    union: MedioUnion;
    caracteristicasUnion: string;
    corrosividad: ClaseCorrosividad;
    proteccion: ProteccionAcero;
    caracteristicasProteccion: string;
  }[];
}

export interface PubMadera {
  /** γM en situaciones extraordinarias, incendio incluido: 1,00 para todo. */
  gammaMExtraordinaria: number;
  grupos: {
    nombre: string;
    tipo: TipoMadera;
    claseResistente: string;
    especie: string | null;
    /** Calidad visual exigible a esa especie para esa clase (DB SE-M tabla C.1). */
    calidad: string | null;
    claseLaminas: string | null;
    claseServicio: ClaseServicio;
    claseUso: ClaseUso;
    /** DB SE-M tabla 2.3, situaciones persistentes y transitorias. */
    gammaM: number;
    /** DB SE-M tabla 3.1 — penetración exigida al tratamiento. */
    nivelPenetracion: string;
    proteccionHerrajes: string;
  }[];
}

/**
 * Esquema v1 de lo que publica el cuadro de materiales.
 *
 * Viajan HECHOS, no prosa ni `Block[]`. Los cuadros de `lib/materiales/cuadros`
 * son presentación —mayúsculas, guiones, marcadores «(*)» apareados con sus
 * notas al pie— y congelarlos aquí le impondría a la ficha DB SE la tipografía
 * de este módulo en lugar de darle algo con lo que razonar: «¿hay madera?»,
 * «¿cuál es el hormigón más desfavorable?», «¿qué recubrimiento pongo en la
 * comprobación?». Las notas se regeneran desde estos mismos hechos: un `cnom`
 * nulo es «la norma no lo tabula» y `clasesForzadas` es «lo decidió el
 * proyectista».
 *
 * Tampoco viajan el estado interno (ids, presets, el conmutador de Ayuda) ni
 * los mensajes y trazas del motor: son la conversación de este módulo con su
 * usuario, no un dato del proyecto.
 */
export interface PubMateriales {
  /** El tramo normativo de durabilidad: 50 o 100 años (CE tabla 43.2.1.b). */
  vidaUtil: VidaUtil;
  /** La cifra que se declara en la memoria, que puede no ser la del tramo. */
  vidaUtilAnios: number;
  nivelControlEjecucion: NivelControlEjecucion;
  /** Texto de la columna «Nivel de control» del cuadro de aceros. */
  nivelControlAcero: string;
  /** R exigida por el DB SI 6, en minutos. `null` si no se ha indicado. */
  resistenciaFuego: number | null;
  /** Los modificadores de obra que endurecieron las clases de exposición. */
  modificadores: {
    costa: boolean;
    heladas: boolean;
    terrenoAgresivo: AgresividadQuimica;
  };
  hormigon: PubHormigon | null;
  aceroEstructural: PubAceroEstructural | null;
  madera: PubMadera | null;
}

/**
 * ¿Hay algo que entregar? Un cuadro con los tres materiales apagados no tiene
 * huecos que resolver —o sea, está «listo»— pero su documento es una sola
 * frase. Ni se exporta ni se publica: un cuadro de materiales vacío y fechado
 * le sirve al consumidor menos que la ausencia de publicación.
 */
export function hayMaterialesResueltos(ev: Evaluacion): boolean {
  return ev.hormigon.length + ev.madera.length > 0 || ev.acero !== null;
}

/**
 * El hormigón de limpieza tal y como se rotula, con su nombre por defecto.
 * Lo comparten el cuadro de plano y la publicación para que no puedan decir
 * cosas distintas del mismo hormigón.
 */
export function limpiezaPrescrita(
  fila: FilaHormigon,
  tamMaxArido: number,
): { nombre: string; tipificacion: string } {
  return {
    nombre: fila.nombre.trim() || 'Hormigón de limpieza',
    tipificacion: tipificacionLimpieza(fila.consistencia, tamMaxArido),
  };
}

export function datosPublicacion(state: MaterialesState, ev: Evaluacion): PubMateriales | null {
  if (!ev.listo || !hayMaterialesResueltos(ev)) return null;

  const gamma = (g: { persistente: number; accidental: number }): GammaPub => ({
    persistente: g.persistente,
    accidental: g.accidental,
  });

  const hormigon: PubHormigon | null =
    ev.hormigon.length > 0
      ? {
          gammaC: gamma(GAMMA_MATERIALES.hormigon),
          gammaS: gamma(GAMMA_MATERIALES.armaduraPasiva),
          aceroPasivo: {
            designacion: state.estudio.aceroPasivo,
            fyk: FYK_ACERO_PASIVO[state.estudio.aceroPasivo],
          },
          malla: state.estudio.malla
            ? { designacion: state.estudio.malla, fyk: FYK_MALLA[state.estudio.malla] }
            : null,
          tamMaxArido: state.estudio.tamMaxArido,
          cemento: state.estudio.cemento,
          elementos: ev.hormigon.map(({ derivacion: d }) => ({
            nombre: d.elemento.nombre,
            tipificacion: d.tipificacion,
            fck: d.fckAdoptada,
            fcd: d.fcd,
            consistencia: d.elemento.consistencia,
            clases: d.clases,
            clasesForzadas: d.clasesForzadas,
            cementoMin: d.cementoMin,
            acMax: d.acMax,
            cnom: d.cnom,
            deltaCdev: d.deltaCdev,
            // El motor deja el nivel de control sin fijar cuando no se ha
            // tocado; el cuadro imprime «Estadístico» y aquí viaja lo mismo.
            nivelControl: d.elemento.nivelControl ?? 'estadistico',
          })),
          prescritos: ev.limpieza.map((f) => limpiezaPrescrita(f, state.estudio.tamMaxArido)),
        }
      : null;

  const aceroEstructural: PubAceroEstructural | null = ev.acero
    ? {
        designacion: state.estudio.aceroEstructural,
        fy: FY_ACERO_ESTRUCTURAL[state.estudio.aceroEstructural],
        gammaM: gamma(GAMMA_MATERIALES.aceroEstructural),
        nivelRiesgo: ev.acero.nivelRiesgo,
        categoriaUso: ev.acero.categoriaUso,
        categoriaEjecucionDeclarada: ev.acero.categoriaEjecucionDeclarada,
        categoriaEjecucion: ev.acero.categoriaEjecucion,
        claseEjecucion: ev.acero.claseEjecucion,
        elementos: ev.acero.elementos.map((e) => ({
          nombre: e.nombre,
          designacion: e.designacion,
          union: e.union,
          caracteristicasUnion: e.caracteristicasUnion,
          corrosividad: e.corrosividad,
          proteccion: e.proteccion,
          caracteristicasProteccion: e.caracteristicasProteccion,
        })),
      }
    : null;

  const madera: PubMadera | null =
    ev.madera.length > 0
      ? {
          gammaMExtraordinaria: GAMMA_M_EXTRAORDINARIA,
          grupos: ev.madera.map(({ derivacion: d }) => ({
            nombre: d.grupo.nombre,
            tipo: d.grupo.tipo,
            claseResistente: d.grupo.claseResistente,
            especie: d.grupo.especie ?? null,
            calidad: d.calidad ?? null,
            claseLaminas: d.grupo.claseLaminas ?? null,
            claseServicio: d.claseServicio,
            claseUso: d.claseUso,
            gammaM: d.gammaM,
            nivelPenetracion: d.nivelPenetracion,
            proteccionHerrajes: d.proteccionHerrajes,
          })),
        }
      : null;

  return {
    vidaUtil: state.estudio.vidaUtil,
    vidaUtilAnios: state.estudio.vidaUtilAnios,
    nivelControlEjecucion: state.estudio.nivelControlEjecucion,
    nivelControlAcero: state.estudio.nivelControlAcero,
    resistenciaFuego: state.resistenciaFuego,
    modificadores: {
      costa: state.costa,
      heladas: state.heladas,
      terrenoAgresivo: state.terrenoAgresivo,
    },
    hormigon,
    aceroEstructural,
    madera,
  };
}

/**
 * Publica el resultado si hay resultado. Si deja de haberlo —se abre un hueco,
 * se apaga un material— la publicación anterior NO se retira: un consumidor
 * prefiere un dato fechado a ninguno, y la fecha del sobre ya le dice que es
 * viejo. Misma regla que «Viento y nieve».
 */
export function publicarResultado(state: MaterialesState, ev: Evaluacion): void {
  const datos = datosPublicacion(state, ev);
  if (!datos) return;
  const obra = leerObra();
  publicar(MODULO_PUB, PUB_VERSION, datos, {
    municipio: obra?.municipio || null,
    // El NOMBRE de la provincia vive en la tabla del capítulo Acciones y este
    // módulo no la necesita para nada más, así que no se arrastra: viaja el
    // código INE, que es con lo que un consumidor comprueba que la publicación
    // es de SU obra. Cinco dígitos si se conoce el municipio, dos si sólo se
    // conoce la provincia (ver `ObraPublicada.ine`).
    provincia: null,
    ine: obra?.ine ?? (obra?.provincia || null),
  });
}
