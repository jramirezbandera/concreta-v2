// INVARIANTE TRANSVERSAL: lo que el veredicto cuenta, la pantalla lo pinta.
//
// Origen (2026-08-03): tres módulos repartían `result.checks` en listas de ids
// ESCRITAS A MANO mientras la cabecera se calculaba sobre `result.checks`
// entero. Cuando la lista se queda corta —porque el motor añade una
// comprobación después, o porque el id cambia de nombre— la fila desaparece de
// la pantalla pero sigue tiñendo el veredicto de rojo:
//
//   · empresillado  → `cordon-interaccion` (105%) nunca se pintaba
//   · rc-columns    → `as-min-mech` (124%) faltaba en el panel RECTANGULAR
//                     (el circular sí lo tenía)
//   · retaining-wall→ el panel filtraba 'zapata-asmin-trans', un id que el
//                     motor no emite: emite '-inf' y '-sup' (hasta 337%)
//
// Los tres PDFs los pintaban bien y las tres suites de cálculo estaban verdes:
// nadie comprobaba el camino motor → PANTALLA. Este fichero lo hace para todos
// los paneles que reparten por id. El ancla es `data-check-id`, que emite el
// `CheckRowItem` compartido.

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';

import { MicropilesResults } from '../../features/micropiles/MicropilesResults';
import { PunchingResults } from '../../features/punching/PunchingResults';
import { RCBeamsResults } from '../../features/rc-beams/RCBeamsResults';
import { SteelBeamsResults } from '../../features/steel-beams/SteelBeamsResults';
import { SteelColumnsResults } from '../../features/steel-columns/SteelColumnsResults';

import { calcMicropiles } from '../../lib/calculations/micropiles';
import { calcPunching } from '../../lib/calculations/punching';
import { calcRCBeam } from '../../lib/calculations/rcBeams';
import { calcSteelBeam } from '../../lib/calculations/steelBeams';
import { calcSteelColumn } from '../../lib/calculations/steelColumns';

import {
  micropilesDefaults, micropilesSoilDefaults, punchingDefaults,
  rcBeamDefaults, steelBeamDefaults, steelColumnDefaults,
} from '../../data/defaults';

interface Case {
  name: string;
  /** Ids que el motor emite y que el panel oculta A PROPÓSITO, con el porqué. */
  exempt?: Record<string, string>;
  build: () => { ui: ReactElement; checks: { id: string; status: string; neutral?: boolean; utilization: number }[] };
}

const CASES: Case[] = [
  {
    name: 'micropiles',
    build: () => {
      const r = calcMicropiles(micropilesDefaults, micropilesSoilDefaults);
      return { ui: <MicropilesResults result={r} inp={micropilesDefaults} />, checks: r.checks };
    },
  },
  {
    name: 'punching',
    build: () => {
      const r = calcPunching(punchingDefaults);
      return { ui: <PunchingResults result={r} />, checks: r.checks };
    },
  },
  {
    name: 'punching — con armadura de punzonamiento',
    build: () => {
      const inp = { ...punchingDefaults, VEd: 900 };
      const r = calcPunching(inp);
      return { ui: <PunchingResults result={r} />, checks: r.checks };
    },
  },
  {
    // β personalizado → la nota HIPÓTESIS cambia de texto (misma id).
    name: 'punching — β personalizado',
    build: () => {
      const inp = { ...punchingDefaults, betaMode: 'custom' as const, betaManual: 1.35 };
      const r = calcPunching(inp);
      return { ui: <PunchingResults result={r} />, checks: r.checks };
    },
  },
  {
    name: 'rc-beams (vano)',
    build: () => {
      const r = calcRCBeam({ ...rcBeamDefaults, mode: 'simple' });
      return { ui: <RCBeamsResults result={r} activeSection="vano" />, checks: r.vano.checks };
    },
  },
  {
    name: 'rc-beams (apoyo, pórtico)',
    build: () => {
      const r = calcRCBeam({ ...rcBeamDefaults, mode: 'portico' });
      return { ui: <RCBeamsResults result={r} activeSection="apoyo" />, checks: r.apoyo?.checks ?? [] };
    },
  },
  {
    name: 'steel-beams',
    build: () => {
      const r = calcSteelBeam(steelBeamDefaults);
      return { ui: <SteelBeamsResults result={r} deflLimit={300} />, checks: r.checks };
    },
  },
  {
    // Lcr > L → el motor emite la fila neutra 'lcr-warning' (REVISAR). Es una
    // errata de entrada típica y el aviso vive en la pantalla donde se teclea.
    name: 'steel-beams — Lcr > L (aviso de entrada)',
    build: () => {
      const inp = { ...steelBeamDefaults, Lcr: steelBeamDefaults.L * 2 };
      const r = calcSteelBeam(inp);
      return { ui: <SteelBeamsResults result={r} deflLimit={300} />, checks: r.checks };
    },
  },
  {
    name: 'steel-columns',
    build: () => {
      const r = calcSteelColumn(steelColumnDefaults);
      return { ui: <SteelColumnsResults result={r} zeroLoads={false} />, checks: r?.checks ?? [] };
    },
  },
];

describe('Todos los paneles: ninguna comprobación invisible', () => {
  for (const c of CASES) {
    it(`${c.name}: todas las filas de checks están en el DOM`, () => {
      const { ui, checks } = c.build();
      expect(checks.length, 'el fixture no produjo comprobaciones').toBeGreaterThan(0);
      const { container } = render(<UnitSystemProvider>{ui}</UnitSystemProvider>);
      const rendered = new Set(
        Array.from(container.querySelectorAll('[data-check-id]')).map((el) => el.getAttribute('data-check-id')),
      );
      const missing = checks
        .filter((ch) => !rendered.has(ch.id))
        .filter((ch) => !(c.exempt && ch.id in c.exempt))
        .map((ch) => `${ch.id} (${ch.status}, ${(ch.utilization * 100).toFixed(0)}%)`);
      expect(missing, `comprobaciones que el veredicto cuenta pero la pantalla no pinta`).toEqual([]);
    });
  }
});
