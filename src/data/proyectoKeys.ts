/**
 * LA tabla de claves de almacenamiento de Concreta.
 *
 * Escrita a mano, entrada por entrada, leyendo cada módulo. No se deriva de
 * nada: todo lo demás se deriva de ella (`MODULE_SCHEMA_VERSIONS` incluido, y
 * la versión de esquema de los módulos que no pasan por `useModuleState`).
 *
 * Por qué existe: cada módulo tiene TRES identificadores distintos que
 * coinciden lo justo para engañar.
 *
 *   modulo     el id de ruta/rótulo, `moduleRegistry.key` ('concreta-rc-beams').
 *              NUNCA es una clave de localStorage aunque lo parezca.
 *   clave      lo que de verdad se escribe en localStorage ('rc-beams').
 *   idEsquema  el literal de `MODULE_SCHEMA_VERSIONS` ('rc-beams'). En cinco
 *              módulos no coincide ni con `modulo` ni con `clave`.
 *
 * Tres cubos, y una clave sólo puede estar en uno:
 *
 *   CLAVES_PROYECTO         viajan en el fichero .concreta y se borran al cambiar de obra
 *   CLAVES_PREFERENCIA      son de esta máquina o de este usuario; no viajan nunca
 *   CLAVES_INFRAESTRUCTURA  las del propio contenedor de proyectos (y la obra,
 *                           que vive en la raíz del fichero, no dentro de `claves`)
 *
 * Al añadir un módulo: UNA entrada aquí. El test `src/test/obra/proyectoKeys.test.ts`
 * falla si un módulo aparece en `moduleRegistry` sin entrada, si su código escribe
 * una clave sin clasificar, o si una versión cambia sin actualizar la copia congelada.
 */

export interface EntradaProyecto {
  /** Id de ruta/rótulo: `moduleRegistry.key`. NO es una clave de almacenamiento. */
  modulo: string;
  /** Clave REAL de localStorage con el estado del módulo. */
  clave: string;
  /**
   * Literal con el que el módulo llama a `getModuleSchemaVersion()`. Es lo que
   * keyea `MODULE_SCHEMA_VERSIONS`. `null` = el módulo no pasa por ese map y lee
   * su versión con `versionViva()`.
   */
  idEsquema: string | null;
  /** Clave donde el módulo guarda su versión de esquema. `null` = sin guarda. */
  claveVersion: string | null;
  /**
   * Versión de esquema viva. Subirla descarta en la próxima carga lo guardado
   * con la anterior, SÓLO para ese módulo. Al subirla, actualizar también la
   * copia congelada del test.
   */
  versionViva: string;
  /** Otras claves del módulo que viajan con él: título del documento, sobre publicado, suelo… */
  satelites?: readonly string[];
}

/** Prefijo de los sobres publicados entre módulos (`lib/pub`): `concreta-pub-<modulo>`. */
export const PREFIJO_PUB = 'concreta-pub-';

/** Contexto de obra compartido (`lib/obra`). Vive en la RAÍZ del `ProyectoFile`, nunca en `claves`. */
export const CLAVE_OBRA = 'concreta-obra';

// ---------------------------------------------------------------------------
// Cubo 1: claves de proyecto
// ---------------------------------------------------------------------------

export const CLAVES_PROYECTO: readonly EntradaProyecto[] = [
  // --- Memorias y acciones: persistidor propio, clave de versión propia -----
  {
    modulo: 'concreta-materiales',
    clave: 'concreta-materiales-model',
    idEsquema: null,
    claveVersion: 'concreta-materiales-model-version',
    versionViva: '1',
    satelites: ['concreta-materiales-title', `${PREFIJO_PUB}materiales`],
  },
  {
    modulo: 'concreta-memoria-dbse',
    clave: 'concreta-memoria-dbse-model',
    idEsquema: null,
    claveVersion: 'concreta-memoria-dbse-model-version',
    versionViva: '1',
  },
  {
    modulo: 'concreta-seismic',
    clave: 'concreta-seismic-ncse02-model',
    idEsquema: null,
    claveVersion: 'concreta-seismic-ncse02-model-version',
    versionViva: '1',
    satelites: ['concreta-seismic-title', `${PREFIJO_PUB}sismo`],
  },
  {
    modulo: 'concreta-viento-nieve',
    clave: 'concreta-viento-nieve-model',
    idEsquema: null,
    claveVersion: 'concreta-viento-nieve-model-version',
    versionViva: '1',
    satelites: ['concreta-viento-nieve-title', `${PREFIJO_PUB}viento-nieve`],
  },
  {
    modulo: 'concreta-cargas-planta',
    clave: 'concreta-cargas-planta-model',
    idEsquema: null,
    claveVersion: 'concreta-cargas-planta-model-version',
    versionViva: '1',
    satelites: ['concreta-cargas-planta-title', `${PREFIJO_PUB}cargas-planta`],
  },

  // --- Piezas con useModuleState: clave CRUDA sin prefijo, versión en `<clave>-version`
  { modulo: 'concreta-rc-beams', clave: 'rc-beams', idEsquema: 'rc-beams', claveVersion: 'rc-beams-version', versionViva: '1' },
  { modulo: 'concreta-rc-columns', clave: 'rc-columns', idEsquema: 'rc-columns', claveVersion: 'rc-columns-version', versionViva: '1' },
  { modulo: 'concreta-steel-beams', clave: 'steel-beams', idEsquema: 'steel-beams', claveVersion: 'steel-beams-version', versionViva: '1' },
  { modulo: 'concreta-steel-columns', clave: 'steel-columns', idEsquema: 'steel-columns', claveVersion: 'steel-columns-version', versionViva: '1' },
  {
    modulo: 'concreta-footings',
    clave: 'isolated-footing',
    idEsquema: 'isolated-footing',
    claveVersion: 'isolated-footing-version',
    // v2: reescritura (sigma_adm de entrada + un solo juego de cargas + clasificación de la distribución).
    versionViva: '2',
  },
  {
    modulo: 'concreta-retaining-wall',
    clave: 'retaining-wall',
    idEsquema: 'retaining-wall',
    claveVersion: 'retaining-wall-version',
    // v2 (2026-07-13): recubrimiento m→mm (saneamiento pre-IA; los estados antiguos en m se descartan).
    versionViva: '2',
  },
  {
    modulo: 'concreta-punching',
    clave: 'punching',
    idEsquema: 'punching',
    claveVersion: 'punching-version',
    // v2 (2026-06-09): modo cruceta recortado a "compañero de hand-calc" (~14 entradas eliminadas).
    versionViva: '2',
  },
  { modulo: 'concreta-forjados', clave: 'forjados', idEsquema: 'forjados', claveVersion: 'forjados-version', versionViva: '1' },
  { modulo: 'concreta-pile-cap', clave: 'pile-cap', idEsquema: 'pile-cap', claveVersion: 'pile-cap-version', versionViva: '1' },
  {
    modulo: 'concreta-micropiles',
    clave: 'micropiles',
    idEsquema: 'micropiles',
    claveVersion: 'micropiles-version',
    // v9 (2026-06-02): recubrimiento r auto (coverManualOverride → d_struct=Dn).
    // v8: pandeo CR auto-calculado (crManualOverride) + Cu por estrato granular.
    // v7: groutType (lechada/mortero) para recubrimiento mínimo Tabla 2.3 Guía Fomento.
    // v6: tubo personalizado. v5: drillDiameter en mm. v4: cota→profundidad positiva.
    versionViva: '9',
    satelites: ['concreta-micropiles-soil'],
  },
  { modulo: 'concreta-empresillado', clave: 'empresillado', idEsquema: 'empresillado', claveVersion: 'empresillado-version', versionViva: '1' },
  { modulo: 'concreta-timber-beams', clave: 'timber-beams', idEsquema: 'timber-beams', claveVersion: 'timber-beams-version', versionViva: '1' },
  { modulo: 'concreta-timber-columns', clave: 'timber-columns', idEsquema: 'timber-columns', claveVersion: 'timber-columns-version', versionViva: '1' },
  { modulo: 'concreta-anchor-plate', clave: 'anchor-plate', idEsquema: 'anchor-plate', claveVersion: 'anchor-plate-version', versionViva: '1' },
  { modulo: 'concreta-rockfill-wall', clave: 'rockfill-wall', idEsquema: 'rockfill-wall', claveVersion: 'rockfill-wall-version', versionViva: '1' },

  // --- Las cinco raras: idEsquema ≠ clave ≠ modulo. Leer cada una antes de tocarla.
  {
    // Sin guarda de versión ninguna: funde el blob crudo con los defaults.
    // La entrada de MODULE_SCHEMA_VERSIONS existe pero nadie la lee.
    modulo: 'concreta-composite-section',
    clave: 'concreta-composite-section',
    idEsquema: 'composite-section',
    claveVersion: null,
    versionViva: '1',
  },
  {
    // Persistidor propio con clave de versión propia; la entrada del map no se lee.
    modulo: 'concreta-masonry-walls',
    clave: 'concreta-masonry-walls-model',
    idEsquema: 'masonry-walls',
    claveVersion: 'concreta-masonry-walls-model-version',
    versionViva: '1',
    satelites: ['concreta-masonry-title'],
  },
  {
    // FEM 1D. Sin guarda de versión; la entrada del map no se lee.
    modulo: 'concreta-fem-2d',
    clave: 'concreta-fem-2d-design',
    idEsquema: 'fem-2d',
    claveVersion: null,
    versionViva: '1',
    satelites: ['concreta-fem-title'],
  },
  {
    // FEM 2D. SÍ lee getModuleSchemaVersion('fem2d'); el sufijo de versión es `-v`, no `-version`.
    // v2 (2026-07-18): editor libre — el blob pasa de Fem2DUiState paramétrico al Fem2DModel completo.
    modulo: 'concreta-fem2d',
    clave: 'concreta-fem2d',
    idEsquema: 'fem2d',
    claveVersion: 'concreta-fem2d-v',
    versionViva: '2',
    satelites: ['concreta-fem2d-title'],
  },
  {
    // Taludes. SÍ lee getModuleSchemaVersion('slope-stability'); sufijo `-v`.
    // v2 (fase 2, 2026-06-24): SlopeInputs ganó `context` (excavation|global-foundation).
    modulo: 'concreta-slope-stability',
    clave: 'concreta-slope-stability',
    idEsquema: 'slope-stability',
    claveVersion: 'concreta-slope-stability-v',
    versionViva: '2',
    satelites: ['concreta-slope-title'],
  },

  // --- Anejo de cálculo (F6): índice de piezas, ligero; los bytes viven en IndexedDB.
  {
    modulo: 'concreta-anejo',
    clave: 'concreta-anejo',
    idEsquema: null,
    claveVersion: 'concreta-anejo-version',
    versionViva: '1',
  },
];

/** Entradas cuyo `modulo` no está (todavía) en `moduleRegistry`. */
export const MODULOS_SIN_REGISTRO: readonly string[] = ['concreta-anejo'];

// ---------------------------------------------------------------------------
// Cubo 2: preferencias de esta máquina o de este usuario. NO viajan.
// ---------------------------------------------------------------------------

export const CLAVES_PREFERENCIA: readonly string[] = [
  'concreta-theme',
  'unitSystem',
  // Clave BYOK del usuario. Jamás entra en un .concreta, y desplegar() la
  // ignora aunque venga dentro de uno.
  'concreta-ai-settings',
  'concreta-ai-assistant-ui',
  // Globos y avisos ya vistos.
  'concreta-cargas-planta-example-dismissed',
  'concreta-viento-nieve-example-dismissed',
  'concreta-masonry-walls-example-prompt-dismissed',
  'concreta-fem-2d-inline-tip-seen',
  'concreta-fem-2d-mobile-readonly-banner-seen',
  // "Recientes" de los dos FEM: plantillas usadas en esta máquina, no modelos.
  'concreta-fem-2d-recent',
  'concreta-fem2d-recent',
];

// ---------------------------------------------------------------------------
// Cubo 3: infraestructura del contenedor de proyectos (F1). Ninguna entra en `claves`.
// ---------------------------------------------------------------------------

/** Índice ligero de proyectos guardados: `{ id, nombre, ts }[]`. */
export const CLAVE_INDICE_PROYECTOS = 'concreta-proyectos';
/** Un `ProyectoFile` por proyecto: `concreta-proyecto-<id>`. */
export const PREFIJO_PROYECTO = 'concreta-proyecto-';
/** Id del proyecto abierto en esta máquina; cada pestaña lo vigila. */
export const CLAVE_PROYECTO_ACTIVO = 'concreta-proyecto-activo';
/** Centinela del cambio de obra: si existe al arrancar, el despliegue se quedó a medias. */
export const CLAVE_DESPLEGANDO = 'concreta-desplegando';

export const CLAVES_INFRAESTRUCTURA: readonly string[] = [
  CLAVE_OBRA,
  CLAVE_INDICE_PROYECTOS,
  CLAVE_PROYECTO_ACTIVO,
  CLAVE_DESPLEGANDO,
];

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

export type CuboClave = 'proyecto' | 'preferencia' | 'infraestructura';

const claveDeProyectoExacta: ReadonlySet<string> = new Set(
  CLAVES_PROYECTO.flatMap((e) => [e.clave, ...(e.claveVersion ? [e.claveVersion] : []), ...(e.satelites ?? [])]),
);

/**
 * Cubo al que pertenece una clave de localStorage, o `null` si no está
 * clasificada. Lo que devuelve `null` no debe existir: es un módulo nuevo que
 * escribe sin haberse dado de alta aquí.
 */
export function clasificarClave(clave: string): CuboClave | null {
  if (claveDeProyectoExacta.has(clave) || clave.startsWith(PREFIJO_PUB)) return 'proyecto';
  if (CLAVES_PREFERENCIA.includes(clave)) return 'preferencia';
  if (CLAVES_INFRAESTRUCTURA.includes(clave) || clave.startsWith(PREFIJO_PROYECTO)) return 'infraestructura';
  return null;
}

/** Todas las claves exactas que viajan en un proyecto (sin contar los sobres `concreta-pub-*` no listados). */
export function clavesDeProyecto(): string[] {
  return [...claveDeProyectoExacta];
}

export function entradaDe(modulo: string): EntradaProyecto | undefined {
  return CLAVES_PROYECTO.find((e) => e.modulo === modulo);
}

export function entradaPorClave(clave: string): EntradaProyecto | undefined {
  return CLAVES_PROYECTO.find((e) => e.clave === clave);
}

/**
 * Versión de esquema viva de un módulo, por su `modulo` (`moduleRegistry.key`).
 * Es lo que los módulos con persistidor propio escriben en su clave de versión,
 * en vez de declarar una constante local que esta tabla no pueda ver.
 * Lanza si el módulo no está dado de alta: un typo aquí resetea datos de usuario.
 */
export function versionViva(modulo: string): string {
  const e = entradaDe(modulo);
  if (!e) throw new Error(`proyectoKeys: el módulo '${modulo}' no está en CLAVES_PROYECTO`);
  return e.versionViva;
}
