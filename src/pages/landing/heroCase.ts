// heroCase.ts — the hero's star visual is a real, openable FEM 1D case.
//
// The hero used to show a hand-drawn replica of the app UI (AppPreview), which
// drifted from the real product — the exact problem this landing redesign kills
// (design doc, premise 3 + T4/D5). Instead the hero now shows the FEM 1D "viga
// continua" preset and links to the app with that same case preloaded, via the
// module's own share deep-link (?model=).
//
// The link is DERIVED from the same preset the app ships (cloneDesignPreset),
// not a hardcoded base64 string, so the hero case can never drift from a valid
// model: it is always exactly what /analisis/fem builds from the "continuous"
// template. Same anti-drift principle as the rest of the redesign.

import { cloneDesignPreset } from '../../features/fem-analysis/presets';
import { encodeShareString } from '../../features/fem-analysis/serialize';
import type { DesignModel } from '../../features/fem-analysis/types';
import { MODULE_LIBRARY } from './modules';

const MODEL: DesignModel = cloneDesignPreset('continuous');

/** Deep-link that opens /analisis/fem with the continuous-beam case preloaded. */
export const HERO_CASE_HREF = `/analisis/fem?model=${encodeShareString(MODEL)}`;

// Display facts derived from the model so the caption never drifts from the
// case the deep-link actually encodes.
const xs = MODEL.nodes.map((n) => n.x).sort((a, b) => a - b);
const spans = xs.slice(1).map((x, i) => x - xs[i]); // e.g. [5, 5, 5]
const firstUdl = MODEL.loads.find((l) => l.kind === 'udl');
const rcSection = MODEL.bars.find((b) => b.rcSection)?.rcSection;

export const HERO_CASE = {
  group: 'ANÁLISIS',
  module: 'FEM 1D',
  name: 'Viga continua',
  route: '/analisis/fem',
  /** Node x-coordinates (m), for drawing supports at the real span ratios. */
  nodeX: xs,
  /** Span lengths (m), left→right. */
  spans,
  /** "3 × 5.00 m" when all spans are equal, else "5.00 + 5.00 + 5.00 m". */
  spanLabel: allEqual(spans)
    ? `${spans.length} × ${spans[0].toFixed(2)} m`
    : `${spans.map((s) => s.toFixed(2)).join(' + ')} m`,
  /** Distributed load magnitude (kN/m). */
  load: firstUdl?.w ?? 10,
  /** Section label, e.g. "HA 30×50". */
  section: rcSection ? `HA ${rcSection.b}×${rcSection.h}` : 'HA 30×50',
  fck: rcSection?.fck ?? 25,
} as const;

function allEqual(xs: number[]): boolean {
  return xs.every((x) => Math.abs(x - xs[0]) < 1e-9);
}

// ── Hero carousel slides ─────────────────────────────────────────────────────
//
// The hero rotates through four modules (design decision 2026-07-15, /office-hours):
// it shows the breadth of disciplines, one at a time. Honest links: FEM opens its
// preloaded case (deep-link); the other three open their real module (empty state)
// via the route in MODULE_LIBRARY — the footer copy makes the difference explicit
// ("Abrir este cálculo →" vs "Abrir módulo →"). Each slide draws a real schematic
// of that module (see canvases.tsx), NOT the hand-drawn full-UI replica that drifted.

export type HeroCanvasKind = 'fem' | 'rc-beam' | 'steel-beam' | 'wall';

export interface HeroSlide {
  id: string;
  /** Group + module name, sourced from MODULE_LIBRARY (single source of truth). */
  group: string;
  module: string;
  /** Disambiguated short label for the carousel tab (two modules are "Vigas"). */
  tabLabel: string;
  /** Short sub-descriptor for the breadcrumb tail. */
  name: string;
  /** Where the frame links to. */
  href: string;
  /** Footer CTA — distinguishes a preloaded case from opening the empty module. */
  cta: string;
  /** Top-right mono tag: what the module outputs/checks. */
  tag: string;
  /** Footer facts (honest geometry/section descriptor, never fabricated results). */
  facts: string;
  canvas: HeroCanvasKind;
}

function libEntry(id: string) {
  const m = MODULE_LIBRARY.find((e) => e.id === id);
  if (!m) throw new Error(`heroCase: module '${id}' missing from MODULE_LIBRARY`);
  return m;
}

const rcBeams = libEntry('rc-beams');
const steelBeams = libEntry('steel-beams');
const walls = libEntry('walls');
const fem = libEntry('fem');

export const HERO_SLIDES: HeroSlide[] = [
  {
    id: rcBeams.id,
    group: rcBeams.group,
    module: rcBeams.name,
    tabLabel: 'Vigas HA',
    name: 'Sección HA',
    href: rcBeams.route,
    cta: 'Abrir módulo',
    tag: 'M · V · wk',
    facts: 'HA 30×50 · 4Ø20 + cercos Ø8',
    canvas: 'rc-beam',
  },
  {
    id: steelBeams.id,
    group: steelBeams.group,
    module: steelBeams.name,
    tabLabel: 'Vigas acero',
    name: 'Perfil laminado',
    href: steelBeams.route,
    cta: 'Abrir módulo',
    tag: 'M · V · LTB',
    facts: 'IPE 300 · S275',
    canvas: 'steel-beam',
  },
  {
    id: walls.id,
    group: walls.group,
    module: walls.name,
    tabLabel: 'Muro',
    name: 'Muro ménsula',
    href: walls.route,
    cta: 'Abrir módulo',
    tag: 'vuelco · desliz.',
    facts: 'H = 3.50 m · puntera + talón',
    canvas: 'wall',
  },
  {
    id: fem.id,
    group: fem.group,
    module: fem.name,
    tabLabel: 'FEM 1D',
    name: HERO_CASE.name,
    href: HERO_CASE_HREF,
    cta: 'Abrir este cálculo',
    tag: 'M · V · δ',
    facts: `${HERO_CASE.section} · fck ${HERO_CASE.fck}`,
    canvas: 'fem',
  },
];
