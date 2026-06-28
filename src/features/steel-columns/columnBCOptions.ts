// Opciones de condición de apoyo (boundary conditions) compartidas entre el
// módulo de pilares de acero y el de compresión de sección compuesta. Cada
// opción combina el icono SVG (ver columnBCIcons.tsx) y el tooltip con su β.
// Reutilizado vía IconGridSelector + getBetaForBCType.

import { type ColumnBCType } from '../../data/defaults';
import { type IconGridOption } from '../../components/ui/IconGridSelector';
import { SvgPP, SvgPF, SvgFF, SvgFC, SvgCustom } from './columnBCIcons';

export const BC_OPTIONS: ReadonlyArray<IconGridOption<ColumnBCType>> = [
  { value: 'pp',     label: 'Art-Art',   Icon: SvgPP,     tooltip: 'Articulado–Articulado  β=1.0' },
  { value: 'pf',     label: 'Art-Emp',   Icon: SvgPF,     tooltip: 'Articulado–Empotrado  β=0.7' },
  { value: 'ff',     label: 'Emp-Emp',   Icon: SvgFF,     tooltip: 'Empotrado–Empotrado  β=0.5' },
  { value: 'fc',     label: 'Ménsula',   Icon: SvgFC,     tooltip: 'Empotrado–Libre  β=2.0' },
  { value: 'custom', label: 'β lib.',    Icon: SvgCustom, tooltip: 'Coeficientes personalizados' },
];
