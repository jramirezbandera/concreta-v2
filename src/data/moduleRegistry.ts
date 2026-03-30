import {
  rcBeamDefaults,
  rcColumnDefaults,
  steelBeamDefaults,
  steelColumnDefaults,
  footingDefaults,
  type RCBeamInputs,
  type RCColumnInputs,
  type SteelBeamInputs,
  type SteelColumnInputs,
  type FootingInputs,
} from './defaults';

export type ModuleInputs = RCBeamInputs | RCColumnInputs | SteelBeamInputs | SteelColumnInputs | FootingInputs;

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
    shipped: false,
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
    defaults: footingDefaults,
    shipped: false,
  },
] as const;

export const SCHEMA_VERSION = '1';
export const SCHEMA_VERSION_KEY = 'concreta-schema-version';

export function getModuleByRoute(route: string): ModuleEntry | undefined {
  return moduleRegistry.find((m) => m.route === route);
}

export function getModuleByKey(key: string): ModuleEntry | undefined {
  return moduleRegistry.find((m) => m.key === key);
}
