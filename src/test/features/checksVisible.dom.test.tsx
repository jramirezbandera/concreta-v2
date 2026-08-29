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
import { MemoryRouter } from 'react-router';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';

import { MicropilesResults } from '../../features/micropiles/MicropilesResults';
import { PunchingResults } from '../../features/punching/PunchingResults';
import { RCBeamsResults } from '../../features/rc-beams/RCBeamsResults';
import { SteelBeamsResults } from '../../features/steel-beams/SteelBeamsResults';
import { SteelColumnsResults } from '../../features/steel-columns/SteelColumnsResults';
import { RockfillWallResults } from '../../features/rockfill-wall/RockfillWallResults';
import { RetainingWallResults } from '../../features/retaining-wall/RetainingWallResults';

import { calcMicropiles } from '../../lib/calculations/micropiles';
import { calcRetainingWall } from '../../lib/calculations/retainingWall';
import { calcPunching } from '../../lib/calculations/punching';
import { calcRCBeam } from '../../lib/calculations/rcBeams';
import { calcSteelBeam } from '../../lib/calculations/steelBeams';
import { calcSteelColumn } from '../../lib/calculations/steelColumns';
import { calcRockfillWall } from '../../lib/calculations/rockfillWall';

import {
  micropilesDefaults, micropilesSoilDefaults, punchingDefaults,
  rcBeamDefaults, steelBeamDefaults, steelColumnDefaults,
  rockfillWallDefaults, retainingWallDefaults,
} from '../../data/defaults';

interface Case {
  name: string;
  /** Ids que el motor emite y que el panel oculta A PROPÓSITO, con el porqué. */
  exempt?: Record<string, string>;
  /**
   * El panel reparte los checks por id en grupos y pinta en «Otras
   * comprobaciones» lo que ningún grupo colocó (patrón `placed`/`unplaced`).
   * Sólo esos paneles pueden duplicar una fila al añadir un grupo nuevo sin
   * registrarlo en `placed` — y sólo ellos pintan cada id UNA vez.
   *
   * No lo llevan los paneles que renderizan varias secciones a la vez con los
   * mismos ids (rc-beams pinta vano Y apoyo), donde la repetición es correcta.
   */
  partitioned?: true;
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
  {
    // MemoryRouter: el panel enlaza al módulo Taludes (estabilidad global).
    name: 'rockfill-wall (escollera)',
    partitioned: true,
    build: () => {
      const r = calcRockfillWall(rockfillWallDefaults);
      return {
        ui: <MemoryRouter><RockfillWallResults result={r} inp={rockfillWallDefaults} /></MemoryRouter>,
        checks: r.checks,
      };
    },
  },
  {
    name: 'rockfill-wall (gaviones + sismo)',
    partitioned: true,
    build: () => {
      const inp = { ...rockfillWallDefaults, wallType: 'gaviones' as const, gammaAp: 16, Ab: 0.12, S: 1.0 };
      const r = calcRockfillWall(inp);
      return {
        ui: <MemoryRouter><RockfillWallResults result={r} inp={inp} /></MemoryRouter>,
        checks: r.checks,
      };
    },
  },
  {
    name: 'rockfill-wall (φ modo guía + agua)',
    partitioned: true,
    build: () => {
      const inp = { ...rockfillWallDefaults, phiMode: 'guia' as const, hasWater: true, hw: 1.5 };
      const r = calcRockfillWall(inp);
      return {
        ui: <MemoryRouter><RockfillWallResults result={r} inp={inp} /></MemoryRouter>,
        checks: r.checks,
      };
    },
  },
  {
    // MemoryRouter: el panel enlaza al módulo Taludes (estabilidad global).
    name: 'retaining-wall (muro HA)',
    partitioned: true,
    build: () => {
      const r = calcRetainingWall(retainingWallDefaults);
      return {
        ui: <MemoryRouter><RetainingWallResults result={r} inp={retainingWallDefaults} /></MemoryRouter>,
        checks: r.checks,
      };
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

// La otra cara de la red de seguridad: los paneles reparten los checks por id en
// grupos y luego pintan en «Otras comprobaciones» lo que ningún grupo colocó. Un
// grupo nuevo que no se añada al Set de `placed` hace que su check salga DOS
// veces — una en su bloque y otra en el cajón de sastre.
describe('Paneles con reparto por id: ninguna comprobación duplicada', () => {
  for (const c of CASES.filter((x) => x.partitioned)) {
    it(`${c.name}: cada check aparece una sola vez`, () => {
      const { ui } = c.build();
      const { container } = render(<UnitSystemProvider>{ui}</UnitSystemProvider>);
      const ids = Array.from(container.querySelectorAll('[data-check-id]'))
        .map((el) => el.getAttribute('data-check-id')!);
      const seen = new Map<string, number>();
      for (const id of ids) seen.set(id, (seen.get(id) ?? 0) + 1);
      const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(([id, n]) => `${id} ×${n}`);
      expect(dupes, 'checks pintados más de una vez (¿falta el grupo en `placed`?)').toEqual([]);
    });
  }
});
