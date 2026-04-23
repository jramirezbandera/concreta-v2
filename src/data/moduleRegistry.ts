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
  timberBeamDefaults,
  timberColumnDefaults,
  forjadosDefaults,
  anchorPlateDefaults,
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
  type TimberBeamInputs,
  type TimberColumnInputs,
  type ForjadosInputs,
  type AnchorPlateInputs,
} from './defaults';

export type ModuleInputs = RCBeamInputs | RCColumnInputs | SteelBeamInputs | SteelColumnInputs | FootingInputs | RetainingWallInputs | PunchingInputs | PileCapInputs | IsolatedFootingInputs | EmpresalladoInputs | TimberBeamInputs | TimberColumnInputs | ForjadosInputs | AnchorPlateInputs;

export interface ModuleEntry<T = ModuleInputs> {
  key: string;       // localStorage key: 'concreta-rc-beams'
  route: string;     // URL route: '/horm/vigas'
  label: string;     // nav label: 'Vigas'
  group: string;     // nav group: 'Hormigón'
  defaults: T;
  shipped: boolean;  // false = show "Próximamente" placeholder
}

export const moduleRegistry: ModuleEntry[] = [
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
    key: 'concreta-empresillado',
    route: '/rehab/empresillado',
    label: 'Empresillado',
    group: 'Rehabilitación',
    defaults: empresalladoDefaults,
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
  'retaining-wall': '1',
  'punching': '1',
  'forjados': '1',
  'composite-section': '1',
  'pile-cap': '1',
  'empresillado': '1',
  'timber-beams': '1',
  'timber-columns': '1',
  'anchor-plate': '1',
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
