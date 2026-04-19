export const FF_MONO = '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
export const FF_SANS = '"Geist Sans", ui-sans-serif, system-ui, sans-serif';

export const FS_PEAK = 12;
export const FS_AXIS = 11;
export const FS_ADM = 10;
export const FS_FF_SAG = 11;

export const CLEAR_MIN = 10;
export const PEAK_OFFSET = 8;
export const DOT_R = 2.5;

export const COL_PEAK_SCREEN = 'var(--color-text-primary)';
export const COL_AXIS_SCREEN = 'var(--color-text-secondary)';
export const COL_ADM_SCREEN = 'var(--color-state-neutral)';

export const COL_PEAK_PDF = '#333333';
export const COL_AXIS_PDF = '#555555';
export const COL_ADM_PDF = '#888888';

export function peakColor(isPdf: boolean) {
  return isPdf ? COL_PEAK_PDF : COL_PEAK_SCREEN;
}
export function axisColor(isPdf: boolean) {
  return isPdf ? COL_AXIS_PDF : COL_AXIS_SCREEN;
}
export function admColor(isPdf: boolean) {
  return isPdf ? COL_ADM_PDF : COL_ADM_SCREEN;
}
