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

export type ModuleInputs = RCBeamInputs | RCColumnInputs | SteelBeamInputs | SteelColumnInputs | FootingInputs | RetainingWallInputs | PunchingInputs | PileCapInputs | IsolatedFootingInputs | EmpresalladoInputs | MasonryWallsInputs | TimberBeamInputs | TimberColumnInputs | ForjadosInputs | AnchorPlateInputs | FemAnalysisInputs | MicropilesInputs | SlopeInputs | RockfillWallInputs;

export interface ModuleEntry<T = ModuleInputs> {
  key: string;       // localStorage key: 'concreta-rc-beams'
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
    // necesita las banderas ligeras.
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

// Per-module schema versions. Keys MUST match the literal passed to
// useModuleState() in each module's index.tsx (NOT the registry `key` field).
// Bump a single entry to wipe ONLY that module's localStorage on next load
// (the rest preserve user state). Replaces the prior global SCHEMA_VERSION.
export const MODULE_SCHEMA_VERSIONS: Record<string, string> = {
  'rc-beams': '1',
  'rc-columns': '1',
  'steel-beams': '1',
  'steel-columns': '1',
  'isolated-footing': '2', // bumped: rewrite (sigma_adm input + single load set + distribution classification)
  'retaining-wall': '2', // bumped 2026-07-13: cover m→mm (saneamiento pre-IA; estados antiguos en m se descartan)
  'punching': '2', // bumped 2026-06-09: modo cruceta recortado a "compañero de hand-calc" (~14 inputs eliminados)
  'forjados': '1',
  'composite-section': '1',
  'pile-cap': '1',
  'micropiles': '9',          // v9 (2026-06-02): recubrimiento r auto (coverManualOverride → d_struct=Dn). v8: pandeo CR auto-calculado (crManualOverride) + Cu por estrato granular. v7: groutType (lechada/mortero) para recubrimiento mínimo Tabla 2.3 Guía Fomento. v6: tubo personalizado. v5: drillDiameter en mm. v4: cota→profundidad positiva.
  'empresillado': '1',
  'masonry-walls': '1',
  'timber-beams': '1',
  'timber-columns': '1',
  'anchor-plate': '1',
  'fem-2d': '1',
  'fem2d': '2', // bumped 2026-07-18: editor libre — el blob pasa de Fem2DUiState paramétrico al Fem2DModel completo
  'slope-stability': '2', // bumped Phase 2 (2026-06-24): SlopeInputs ganó `context` (excavation|global-foundation); el bump descarta el localStorage de Phase 1 en la próxima carga.
  'rockfill-wall': '1',
};

export function getModuleSchemaVersion(moduleKey: string): string {
  return MODULE_SCHEMA_VERSIONS[moduleKey] ?? '1';
}

export function getModuleByRoute(route: string): ModuleEntry | undefined {
  return moduleRegistry.find((m) => m.route === route);
}

export function getModuleByKey(key: string): ModuleEntry | undefined {
  return moduleRegistry.find((m) => m.key === key);
}
