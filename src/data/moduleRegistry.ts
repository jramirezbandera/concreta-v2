import {
  rcBeamDefaults,
  rcColumnDefaults,
  steelBeamDefaults,
  steelColumnDefaults,
  retainingWallDefaults,
  punchingDefaults,
  compositeSectionDefaults,
  pileCapDefaults,
  isolatedFootingDefaults,
  empresalladoDefaults,
  masonryWallsDefaults,
  timberBeamDefaults,
  timberColumnDefaults,
  forjadosDefaults,
  anchorPlateDefaults,
  femAnalysisDefaults,
  fem2dDefaults,
  micropilesDefaults,
  slopeDefaults,
  rockfillWallDefaults,
  type RCBeamInputs,
  type RCColumnInputs,
  type SteelBeamInputs,
  type SteelColumnInputs,
  type FootingInputs,
  type RetainingWallInputs,
  type PunchingInputs,
  type PileCapInputs,
  type IsolatedFootingInputs,
  type EmpresalladoInputs,
  type MasonryWallsInputs,
  type TimberBeamInputs,
  type TimberColumnInputs,
  type ForjadosInputs,
  type AnchorPlateInputs,
  type FemAnalysisInputs,
  type MicropilesInputs,
  type SlopeInputs,
  type RockfillWallInputs,
} from './defaults';
import { CLAVES_PROYECTO } from './proyectoKeys';

export type ModuleInputs = RCBeamInputs | RCColumnInputs | SteelBeamInputs | SteelColumnInputs | FootingInputs | RetainingWallInputs | PunchingInputs | PileCapInputs | IsolatedFootingInputs | EmpresalladoInputs | MasonryWallsInputs | TimberBeamInputs | TimberColumnInputs | ForjadosInputs | AnchorPlateInputs | FemAnalysisInputs | MicropilesInputs | SlopeInputs | RockfillWallInputs;

export interface ModuleEntry<T = ModuleInputs> {
  key: string;       // id de ruta/rótulo ('concreta-rc-beams'). NO es la clave de localStorage: ver src/data/proyectoKeys.ts
  route: string;     // URL route: '/horm/vigas'
  label: string;     // nav label: 'Vigas'
  group: string;     // nav group: 'Hormigón'
  defaults: T;
  shipped: boolean;  // false = show "Próximamente" placeholder
}

// El orden de este array decide el orden de los grupos en la barra lateral
// (Sidebar deriva `groups` de la primera aparición de cada uno). Memorias y
// Acciones van primero: son el capítulo por el que se empieza un proyecto —
// materiales y acciones antes que el dimensionado de cada elemento.
export const moduleRegistry: ModuleEntry[] = [
  {
    key: 'concreta-materiales',
    route: '/memorias/materiales',
    label: 'Cuadro de materiales',
    group: 'Memorias',
    // Estado anidado (elementos → situación, grupos de madera, acero), con
    // clave propia en localStorage como el módulo de sismo. El registro sólo
    // necesita las banderas ligeras. Publica su cuadro en
    // `concreta-pub-materiales` para la ficha DB SE (ver src/lib/pub).
    defaults: {} as unknown as ModuleInputs,
    shipped: true,
  },
  {
    key: 'concreta-memoria-dbse',
    route: '/memorias/db-se',
    label: 'Cumplimiento del DB SE',
    group: 'Memorias',
    // La ficha 3.1 de la memoria: ensambla las cuatro publicaciones del
    // capítulo (materiales, viento y nieve, cargas, sismo) con un formulario
    // residual. Estado anidado en dos capas (estudio / obra) con clave propia.
    defaults: {} as unknown as ModuleInputs,
    shipped: true,
  },
  {
    key: 'concreta-seismic',
    route: '/analisis/sismo',
    label: 'Acción sísmica',
    // Movido de «Análisis» a «Acciones» (decisión D7): es un generador de
    // acciones, no un análisis. La URL NO cambia — hay enlaces compartidos
    // vivos apuntando a /analisis/sismo.
    group: 'Acciones',
    // El modelo es anidado (plantas → componentes de carga, direcciones →
    // planos resistentes) y vive en el localStorage del propio módulo, como
    // FEM 2D y taludes. El registro sólo necesita las banderas ligeras.
    defaults: {} as unknown as ModuleInputs,
    shipped: true,
  },
  {
    key: 'concreta-viento-nieve',
    route: '/acciones/viento-nieve',
    label: 'Viento y nieve',
    group: 'Acciones',
    // Estado anidado (plantas, faldones) con clave propia en localStorage,
    // como sismo y materiales. Fue el primero en publicar su resultado
    // (`concreta-pub-viento-nieve`, ver src/lib/pub), el contrato que estrenó.
    defaults: {} as unknown as ModuleInputs,
    shipped: true,
  },
  {
    key: 'concreta-cargas-planta',
    route: '/acciones/cargas-planta',
    label: 'Cargas por planta',
    group: 'Acciones',
    // Estado anidado (plantas → zonas → permanentes) con clave propia en
    // localStorage. Primer módulo que CONSUME una publicación (la nieve de
    // `concreta-pub-viento-nieve`) y publica la suya (`concreta-pub-cargas-planta`).
    defaults: {} as unknown as ModuleInputs,
    shipped: true,
  },
  {
    key: 'concreta-rc-beams',
    route: '/horm/vigas',
    label: 'Vigas',
    group: 'Hormigón',
    defaults: rcBeamDefaults,
    shipped: true,
  },
  {
    key: 'concreta-rc-columns',
    route: '/horm/pilares',
    label: 'Pilares',
    group: 'Hormigón',
    defaults: rcColumnDefaults,
    shipped: true,
  },
  {
    key: 'concreta-steel-beams',
    route: '/acero/vigas',
    label: 'Vigas',
    group: 'Acero',
    defaults: steelBeamDefaults,
    shipped: true,
  },
  {
    key: 'concreta-steel-columns',
    route: '/acero/pilares',
    label: 'Pilares',
    group: 'Acero',
    defaults: steelColumnDefaults,
    shipped: true,
  },
  {
    key: 'concreta-footings',
    route: '/ciment/zapatas',
    label: 'Zapatas',
    group: 'Cimentación',
    defaults: isolatedFootingDefaults,
    shipped: true,
  },
  {
    key: 'concreta-retaining-wall',
    route: '/ciment/muros',
    label: 'Muros',
    group: 'Cimentación',
    defaults: retainingWallDefaults,
    shipped: true,
  },
  {
    key: 'concreta-punching',
    route: '/horm/punzonamiento',
    label: 'Punzonamiento',
    group: 'Hormigón',
    defaults: punchingDefaults,
    shipped: true,
  },
  {
    key: 'concreta-forjados',
    route: '/horm/forjados',
    label: 'Forjados',
    group: 'Hormigón',
    defaults: forjadosDefaults,
    shipped: true,
  },
  {
    key: 'concreta-composite-section',
    route: '/acero/seccion-compuesta',
    label: 'Sección compuesta',
    group: 'Acero',
    defaults: compositeSectionDefaults as unknown as ModuleInputs,
    shipped: true,
  },
  {
    key: 'concreta-pile-cap',
    route: '/ciment/encepados',
    label: 'Encepados',
    group: 'Cimentación',
    defaults: pileCapDefaults,
    shipped: true,
  },
  {
    key: 'concreta-micropiles',
    route: '/ciment/micropilotes',
    label: 'Micropilotes',
    group: 'Cimentación',
    defaults: micropilesDefaults,
    // Auditoría 2026-05-23: validado contra Guía Fomento 2005 oficial
    // (Tablas 2.4, 3.5, 3.7, 3.8, 3.9, A-5.1). 70+ tests verbatim. TODO
    // pendiente menor: clasificación de sección CE Anejo 22 Tabla 5.2 (E3).
    shipped: true,
  },
  {
    key: 'concreta-empresillado',
    route: '/rehab/empresillado',
    label: 'Empresillado',
    group: 'Rehabilitación',
    defaults: empresalladoDefaults,
    shipped: true,
  },
  {
    key: 'concreta-masonry-walls',
    route: '/rehab/muros-fabrica',
    label: 'Muros de fábrica',
    group: 'Rehabilitación',
    defaults: masonryWallsDefaults,
    shipped: true,
  },
  {
    key: 'concreta-timber-beams',
    route: '/madera/vigas',
    label: 'Vigas',
    group: 'Madera',
    defaults: timberBeamDefaults,
    shipped: true,
  },
  {
    key: 'concreta-timber-columns',
    route: '/madera/pilares',
    label: 'Pilares',
    group: 'Madera',
    defaults: timberColumnDefaults,
    shipped: true,
  },
  {
    key: 'concreta-anchor-plate',
    route: '/acero/placas-de-anclaje',
    label: 'Placas de anclaje',
    group: 'Acero',
    defaults: anchorPlateDefaults,
    shipped: true,
  },
  {
    key: 'concreta-fem-2d',
    route: '/analisis/fem',
    label: 'FEM 1D',
    group: 'Análisis',
    defaults: femAnalysisDefaults,
    shipped: true,
  },
  {
    key: 'concreta-fem2d',
    route: '/analisis/fem2d',
    label: 'FEM 2D',
    group: 'Análisis',
    // Nested model (template + params) lives in the module's own localStorage,
    // like FEM 1D; the registry only needs lightweight flags. Cast as the other
    // rich-state modules do (compositeSection/slope).
    defaults: fem2dDefaults as unknown as ModuleInputs,
    shipped: true,
  },
  {
    key: 'concreta-slope-stability',
    route: '/geotec/taludes',
    label: 'Taludes',
    group: 'Geotecnia',
    // SlopeInputs anida estratos/cargas (SoilLayer[]/SlopeLoad[]); como con
    // compositeSection, el `as const` del array no infiere bien la unión, así
    // que se castea igual que en la entrada de sección compuesta (~línea 119).
    defaults: slopeDefaults as unknown as ModuleInputs,
    shipped: true,
  },
  {
    key: 'concreta-rockfill-wall',
    route: '/geotec/escollera',
    label: 'Escollera',
    group: 'Geotecnia',
    defaults: rockfillWallDefaults,
    shipped: true,
  },
] as const;

// Versiones de esquema por módulo, DERIVADAS de la tabla única
// (src/data/proyectoKeys.ts) y keyeadas por `idEsquema` y por nada más: es el
// literal que cada módulo pasa a useModuleState() o a getModuleSchemaVersion(),
// y en cinco módulos no coincide ni con `moduleRegistry.key` ni con la clave de
// localStorage. Para subir una versión: `versionViva` en la tabla, y la copia
// congelada de src/test/obra/proyectoKeys.test.ts. Subirla descarta en la
// próxima carga SÓLO lo guardado por ese módulo.
export const MODULE_SCHEMA_VERSIONS: Record<string, string> = Object.fromEntries(
  CLAVES_PROYECTO.flatMap((e) => (e.idEsquema === null ? [] : [[e.idEsquema, e.versionViva] as const])),
);

export function getModuleSchemaVersion(moduleKey: string): string {
  const v = MODULE_SCHEMA_VERSIONS[moduleKey];
  // Sin fallback a '1': con él, un id mal escrito reseteaba en silencio los seis
  // módulos con versión ≠ '1' para todos los usuarios el día del despliegue.
  if (v === undefined) throw new Error(`moduleRegistry: '${moduleKey}' no está en proyectoKeys.ts (idEsquema)`);
  return v;
}

export function getModuleByRoute(route: string): ModuleEntry | undefined {
  return moduleRegistry.find((m) => m.route === route);
}

export function getModuleByKey(key: string): ModuleEntry | undefined {
  return moduleRegistry.find((m) => m.key === key);
}
