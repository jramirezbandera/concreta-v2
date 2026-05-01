// Mock solver — generates believable M, V, N, deformed shape per bar.
// Per-preset behavior tuned for plausible numbers; free-form falls back to
// simply-supported approximation. NOT a real FEM solver.
import { MAT, isRc, isSteel } from './presets';
import type { Bar, BarCheck, BarResult, FemModel, Node, ReactionResult, SolveResult } from './types';

function findNode(model: FemModel, id: string): Node | undefined {
  return model.nodes.find((n) => n.id === id);
}

export function barLength(model: FemModel, bar: Bar): number {
  const ni = findNode(model, bar.i);
  const nj = findNode(model, bar.j);
  if (!ni || !nj) return 0;
  return Math.hypot(nj.x - ni.x, nj.y - ni.y);
}

export function barAngle(model: FemModel, bar: Bar): number {
  const ni = findNode(model, bar.i);
  const nj = findNode(model, bar.j);
  if (!ni || !nj) return 0;
  return Math.atan2(nj.y - ni.y, nj.x - ni.x);
}

interface BarLoadAccum { w: number; P: number; Ppos: number }

function barLoads(model: FemModel, bar: Bar): BarLoadAccum {
  let w = 0;
  let P = 0;
  let Ppos = 0.5;
  for (const ld of model.loads) {
    if (ld.kind === 'udl' && ld.bar === bar.id) {
      w += Math.abs(ld.w || 0);
    } else if (ld.kind === 'point-bar' && ld.bar === bar.id) {
      P += Math.abs(ld.P || 0);
      Ppos = ld.pos != null ? ld.pos : 0.5;
    }
  }
  return { w, P, Ppos };
}

function finishDiag(xs: number[], M: number[], V: number[], N: number[], L: number) {
  const Mmax = M.reduce((m, v) => (Math.abs(v) > Math.abs(m) ? v : m), 0);
  const Vmax = V.reduce((m, v) => (Math.abs(v) > Math.abs(m) ? v : m), 0);
  const Nmax = N.reduce((m, v) => (Math.abs(v) > Math.abs(m) ? v : m), 0);
  return { xs, M, V, N, L, Mmax, Vmax, Nmax };
}

function sampleDiagrams(model: FemModel, bar: Bar, code: string) {
  const L = barLength(model, bar);
  const { w, P, Ppos } = barLoads(model, bar);
  const N_SAMPLES = 40;
  const xs: number[] = [];
  const Mvals: number[] = [];
  const Vvals: number[] = [];
  const Nvals: number[] = [];

  const angle = barAngle(model, bar);
  const isVertical = Math.abs(Math.cos(angle)) < 0.3;
  const isInclined = Math.abs(Math.sin(angle)) > 0.3 && Math.abs(Math.cos(angle)) > 0.3;

  if (code === 'truss') {
    let Naxial = 0;
    const idx = parseInt(bar.id.slice(1), 10);
    if (idx <= 4) Naxial = 45 + idx * 4;
    else if (idx <= 6) Naxial = -50 - (idx - 4) * 3;
    else if (idx <= 9) Naxial = -18 - idx;
    else Naxial = 32 + (idx - 10) * 3;
    for (let i = 0; i <= N_SAMPLES; i++) {
      const t = i / N_SAMPLES;
      xs.push(t * L);
      Mvals.push(0);
      Vvals.push(0);
      Nvals.push(Naxial);
    }
    return { xs, M: Mvals, V: Vvals, N: Nvals, L, Mmax: 0, Vmax: 0, Nmax: Naxial };
  }

  if (code === 'continuous') {
    const idx = parseInt(bar.id.slice(1), 10);
    const isFirst = idx === 1;
    const isLast = idx === model.bars.length;
    const wL2 = w * L * L;
    const Mleft = isFirst ? 0 : -wL2 / 10;
    const Mright = isLast ? 0 : -wL2 / 10;
    const Vleft = (w * L) / 2 - (Mright - Mleft) / L;
    for (let i = 0; i <= N_SAMPLES; i++) {
      const t = i / N_SAMPLES;
      const x = t * L;
      xs.push(x);
      const V = Vleft - w * x;
      const M = Mleft + Vleft * x - (w * x * x) / 2;
      Mvals.push(M);
      Vvals.push(V);
      Nvals.push(0);
    }
    return finishDiag(xs, Mvals, Vvals, Nvals, L);
  }

  if (code === 'cantilever') {
    for (let i = 0; i <= N_SAMPLES; i++) {
      const t = i / N_SAMPLES;
      const x = t * L;
      xs.push(x);
      let M = (-w * (L - x) * (L - x)) / 2;
      let V = w * (L - x);
      if (P > 0) {
        const Pa = Ppos * L;
        if (x <= Pa) { M -= P * (Pa - x); V += P; }
      }
      Mvals.push(M);
      Vvals.push(V);
      Nvals.push(0);
    }
    return finishDiag(xs, Mvals, Vvals, Nvals, L);
  }

  if (code === 'frame' || code === 'multistory' || code === 'gable') {
    if (isVertical) {
      const Naxial = -45 - 5 * Math.random();
      for (let i = 0; i <= N_SAMPLES; i++) {
        const t = i / N_SAMPLES;
        xs.push(t * L);
        const Mtop = 12;
        const Mbot = -18;
        Mvals.push(Mbot + (Mtop - Mbot) * t);
        Vvals.push((Mtop - Mbot) / L);
        Nvals.push(Naxial);
      }
    } else if (isInclined) {
      const wproj = w * Math.cos(angle);
      for (let i = 0; i <= N_SAMPLES; i++) {
        const t = i / N_SAMPLES;
        const x = t * L;
        xs.push(x);
        const Mend = (-wproj * L * L) / 12;
        const Mmid = (wproj * L * L) / 24;
        const M = Mend + (Mmid - Mend) * 4 * t * (1 - t);
        const V = wproj * (L / 2 - x);
        Mvals.push(M);
        Vvals.push(V);
        Nvals.push(-12);
      }
    } else {
      const wL2 = w * L * L;
      const Mend = -wL2 / 12;
      const Mmid = wL2 / 24;
      for (let i = 0; i <= N_SAMPLES; i++) {
        const t = i / N_SAMPLES;
        const x = t * L;
        xs.push(x);
        const V = w * (L / 2 - x);
        const M = Mend + (Mmid - Mend) * 4 * t * (1 - t);
        Mvals.push(M);
        Vvals.push(V);
        Nvals.push(-3);
      }
    }
    return finishDiag(xs, Mvals, Vvals, Nvals, L);
  }

  // Default — simply supported beam with optional point load.
  for (let i = 0; i <= N_SAMPLES; i++) {
    const t = i / N_SAMPLES;
    const x = t * L;
    xs.push(x);
    let M = (w * x * (L - x)) / 2;
    let V = w * (L / 2 - x);
    if (P > 0) {
      const Pa = Ppos * L;
      if (x <= Pa) { M += (P * (L - Pa) * x) / L; V += (P * (L - Pa)) / L; }
      else        { M += (P * Pa * (L - x)) / L; V -= (P * Pa) / L; }
    }
    Mvals.push(M);
    Vvals.push(V);
    Nvals.push(0);
  }
  return finishDiag(xs, Mvals, Vvals, Nvals, L);
}

function checkBar(bar: Bar, diag: ReturnType<typeof sampleDiagrams>): { eta: number; status: BarResult['status']; checks: BarCheck[] } {
  const mat = MAT[bar.mat];
  if (!mat) return { eta: 0, status: 'none', checks: [] };
  const checks: BarCheck[] = [];

  if (isSteel(mat)) {
    const MRd = mat.name === 'HEB 200' ? 124 : mat.name === 'IPE 240' ? 92 : 18;
    const VRd = mat.name === 'HEB 200' ? 270 : mat.name === 'IPE 240' ? 200 : 80;
    const NRd_t = (mat.A * mat.fy) / mat.gamma / 10;
    const NRd_c = NRd_t * 0.65;

    if (Math.abs(diag.Mmax) > 0.01) {
      const eta = Math.abs(diag.Mmax) / MRd;
      checks.push({ name: 'Flexión', val: `${Math.abs(diag.Mmax).toFixed(1)} / ${MRd.toFixed(0)}`, unit: 'kN·m', eta, ref: 'EC3 §6.2.5' });
    }
    if (Math.abs(diag.Vmax) > 0.01) {
      const eta = Math.abs(diag.Vmax) / VRd;
      checks.push({ name: 'Cortante', val: `${Math.abs(diag.Vmax).toFixed(1)} / ${VRd.toFixed(0)}`, unit: 'kN', eta, ref: 'EC3 §6.2.6' });
    }
    if (Math.abs(diag.Nmax) > 0.01) {
      const NRd = diag.Nmax > 0 ? NRd_t : NRd_c;
      const eta = Math.abs(diag.Nmax) / NRd;
      checks.push({
        name: diag.Nmax > 0 ? 'Tracción' : 'Compresión + pandeo',
        val: `${Math.abs(diag.Nmax).toFixed(1)} / ${NRd.toFixed(0)}`,
        unit: 'kN',
        eta,
        ref: diag.Nmax > 0 ? 'EC3 §6.2.3' : 'EC3 §6.3.1',
      });
    }
    if (Math.abs(diag.Mmax) > 0.01 && Math.abs(diag.Nmax) > 0.5) {
      const eta = Math.abs(diag.Mmax) / MRd + Math.abs(diag.Nmax) / NRd_c;
      checks.push({ name: 'M+N (interacción)', val: eta.toFixed(2), unit: '-', eta, ref: 'EC3 §6.3.3' });
    }
  } else if (isRc(mat)) {
    const MRd = mat.name === 'HA 30×50' ? 215 : 145;
    const VRd = mat.name === 'HA 30×50' ? 180 : 130;
    if (Math.abs(diag.Mmax) > 0.01) {
      const eta = Math.abs(diag.Mmax) / MRd;
      checks.push({ name: 'Flexión', val: `${Math.abs(diag.Mmax).toFixed(1)} / ${MRd.toFixed(0)}`, unit: 'kN·m', eta, ref: 'CE art. 22' });
    }
    if (Math.abs(diag.Vmax) > 0.01) {
      const eta = Math.abs(diag.Vmax) / VRd;
      checks.push({ name: 'Cortante', val: `${Math.abs(diag.Vmax).toFixed(1)} / ${VRd.toFixed(0)}`, unit: 'kN', eta, ref: 'CE art. 23' });
    }
    if (Math.abs(diag.Nmax) > 0.5) {
      const NRd_c = 1800;
      const eta = Math.abs(diag.Nmax) / NRd_c;
      checks.push({ name: 'Compresión', val: `${Math.abs(diag.Nmax).toFixed(0)} / ${NRd_c.toFixed(0)}`, unit: 'kN', eta, ref: 'CE art. 22' });
    }
    if (Math.abs(diag.Mmax) > 0.01) {
      const wk = 0.18 + (Math.abs(diag.Mmax) / MRd) * 0.18;
      const eta = wk / 0.3;
      checks.push({ name: 'Fisuración wk', val: `${wk.toFixed(2)} / 0.30`, unit: 'mm', eta, ref: 'CE art. 24' });
    }
  }

  const eta = checks.reduce((m, c) => Math.max(m, c.eta), 0);
  let status: BarResult['status'] = 'ok';
  if (eta >= 1) status = 'fail';
  else if (eta >= 0.8) status = 'warn';
  return { eta, status, checks };
}

export function solveModel(model: FemModel): SolveResult {
  const code = model.presetCode || 'custom';
  const perBar: Record<string, BarResult> = {};
  const reactions: ReactionResult[] = [];
  const errors: SolveResult['errors'] = [];

  const supports = model.supports || [];
  if (model.bars.length > 0 && supports.length === 0) {
    errors.push({ severity: 'fail', code: 'NO_SUPPORTS', msg: 'Estructura inestable: no hay apoyos definidos.' });
  } else if (model.bars.length > 0) {
    const supNodes = new Set(supports.map((s) => s.node));
    const adj: Record<string, string[]> = {};
    for (const b of model.bars) {
      (adj[b.i] = adj[b.i] || []).push(b.j);
      (adj[b.j] = adj[b.j] || []).push(b.i);
    }
    const visited = new Set<string>();
    const queue: string[] = [...supNodes];
    while (queue.length) {
      const n = queue.shift();
      if (n === undefined || visited.has(n)) continue;
      visited.add(n);
      for (const m of adj[n] || []) if (!visited.has(m)) queue.push(m);
    }
    const floating = model.bars.filter((b) => !visited.has(b.i) && !visited.has(b.j));
    if (floating.length > 0) {
      errors.push({
        severity: 'fail',
        code: 'FLOATING_BARS',
        msg: `Hay ${floating.length} barra(s) sin conexión a apoyos: ${floating.map((b) => b.id).join(', ')}. Estructura inestable.`,
      });
    }
    const reactComps = supports.reduce(
      (s, sup) => s + (sup.type === 'fixed' ? 3 : sup.type === 'pinned' ? 2 : 1),
      0,
    );
    if (reactComps < 3) {
      errors.push({
        severity: 'warn',
        code: 'INSUFFICIENT_REACTIONS',
        msg: `Solo ${reactComps} componente(s) de reacción — se necesitan al menos 3 para equilibrio 2D.`,
      });
    }
  }

  for (const bar of model.bars) {
    const diag = sampleDiagrams(model, bar, code);
    const chk = checkBar(bar, diag);
    perBar[bar.id] = { ...diag, ...chk };
  }

  let totalV = 0;
  let totalH = 0;
  for (const ld of model.loads) {
    if (ld.kind === 'point-node') {
      totalH += ld.Px || 0;
      totalV += ld.Py || 0;
    } else if (ld.kind === 'udl') {
      const bar = model.bars.find((b) => b.id === ld.bar);
      if (bar) {
        const L = barLength(model, bar);
        if (ld.dir === '-y') totalV -= (ld.w || 0) * L;
      }
    } else if (ld.kind === 'point-bar') {
      if (ld.dir === '-y') totalV -= ld.P || 0;
    }
  }
  const supports2 = model.supports || [];
  const Vshare = supports2.length ? -totalV / supports2.length : 0;
  const Hshare = supports2.length ? -totalH / supports2.length : 0;
  for (const sup of supports2) {
    const node = findNode(model, sup.node);
    if (!node) continue;
    const Mr = sup.type === 'fixed' ? Math.abs(totalV) * 0.6 : 0;
    reactions.push({
      node: node.id,
      x: node.x,
      y: node.y,
      Rx: sup.type === 'roller' ? 0 : Hshare * (0.8 + Math.random() * 0.4),
      Ry: Vshare * (0.8 + Math.random() * 0.4),
      Mr,
    });
  }

  let maxEta = 0;
  for (const id in perBar) maxEta = Math.max(maxEta, perBar[id].eta);
  const hasFail = errors.some((e) => e.severity === 'fail');
  const status: SolveResult['status'] = hasFail ? 'fail' : maxEta >= 1 ? 'fail' : maxEta >= 0.8 ? 'warn' : 'ok';
  return { perBar, reactions, errors, maxEta, status };
}

export function etaColor(eta: number): string {
  if (eta >= 1) return 'var(--color-state-fail)';
  if (eta >= 0.8) return 'var(--color-state-warn)';
  if (eta > 0) return 'var(--color-state-ok)';
  return 'var(--color-text-primary)';
}
