// Whitelist-based safe expression evaluator + number formatter + unit converter.
// The evaluator allows only a fixed set of identifiers (Math.* functions plus ANS).

import { UNIT_GROUPS, type UnitGroupKey } from './data';

export interface EvalResult {
  ok: boolean;
  val: number | null;
  err: string;
}

const ALLOWED_IDENTS = new Set([
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
  'ln', 'log', 'sqrt', 'abs', 'exp',
  'PI', 'E', 'pow', 'min', 'max', 'round', 'floor', 'ceil',
  'ANS',
]);

declare global {
  interface Window {
    __concretaAns?: number;
  }
}

export function evalExpr(raw: string): EvalResult {
  if (!raw || !raw.trim()) return { ok: false, val: null, err: '' };
  let s = raw.trim();
  s = s.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/π/g, 'PI').replace(/√/g, 'sqrt');
  s = s.replace(/\^/g, '**');
  if (!/^[\d+\-*/().,%\s\w]+$/.test(s)) return { ok: false, val: null, err: 'sintaxis' };
  s = s.replace(/,/g, '.');
  const idents = s.match(/[A-Za-z_]+/g) || [];
  for (const id of idents) {
    if (!ALLOWED_IDENTS.has(id)) return { ok: false, val: null, err: `desconocido: ${id}` };
  }
  try {
    const fn = new Function('ANS', `
      const sin=Math.sin, cos=Math.cos, tan=Math.tan, asin=Math.asin, acos=Math.acos, atan=Math.atan;
      const ln=Math.log, log=Math.log10, sqrt=Math.sqrt, abs=Math.abs, exp=Math.exp;
      const pow=Math.pow, min=Math.min, max=Math.max, round=Math.round, floor=Math.floor, ceil=Math.ceil;
      const PI=Math.PI, E=Math.E;
      return (${s});
    `) as (ans: number) => unknown;
    const v = fn(window.__concretaAns ?? 0);
    if (typeof v !== 'number' || !isFinite(v)) return { ok: false, val: null, err: 'inválido' };
    return { ok: true, val: v, err: '' };
  } catch {
    return { ok: false, val: null, err: 'sintaxis' };
  }
}

export function fmt(v: number | null | undefined, sig = 6): string {
  if (v == null || !isFinite(v)) return '—';
  if (Math.abs(v) >= 1e6 || (v !== 0 && Math.abs(v) < 1e-4)) return v.toExponential(4);
  return Number(v.toPrecision(sig)).toString();
}

export function convert(v: number, fromUnit: string, toUnit: string, group: UnitGroupKey): number | null {
  const fF = UNIT_GROUPS[group].units[fromUnit];
  const fT = UNIT_GROUPS[group].units[toUnit];
  if (fF == null || fT == null) return null;
  return (v * fF) / fT;
}
