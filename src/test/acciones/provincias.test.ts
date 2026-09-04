/**
 * La tabla de provincias no está en la norma: se ha construido leyendo dos
 * mapas. Estos tests son lo que la sostiene.
 *
 *  1. Zona de clima invernal: la tabla 3.8 da altitud y sk de cada capital, y
 *     la E.2 da sk por zona y altitud. Si la zona asignada es la buena, la E.2
 *     interpolada en la altitud de la capital reproduce su sk (±0,1: la 3.8
 *     está redondeada a un decimal). Donde no lo hace, la zona está mal.
 *  2. Oráculo externo: la tabla «50 municipios más poblados» de
 *     normatia.com (zona eólica y zona de nieve), leída el 2026-09-04. Cubre
 *     31 capitales y varios municipios grandes cuya provincia debe coincidir.
 */

import { describe, expect, it } from 'vitest';
import { cargaNieveTerreno } from '../../lib/acciones/nieve';
import { PROVINCIAS, provinciaDe, provinciaPorIne } from '../../lib/acciones/provincias';
import type { ZonaEolica, ZonaInvernal } from '../../lib/acciones/tablasAE';

describe('forma', () => {
  it('52 filas, códigos INE 01..52 en orden y nombres únicos', () => {
    expect(PROVINCIAS).toHaveLength(52);
    PROVINCIAS.forEach((p, i) => expect(p.ine).toBe(String(i + 1).padStart(2, '0')));
    expect(new Set(PROVINCIAS.map((p) => p.nombre)).size).toBe(52);
    for (const p of PROVINCIAS) expect(p.capital).toBeDefined();
  });

  it('provinciaDe: los mismos casos que tenía el módulo de sismo', () => {
    expect(provinciaDe('17199')).toBe('Girona');
    expect(provinciaDe('46244')).toBe('Valencia');
    expect(provinciaDe('51001')).toBe('Ceuta');
    expect(provinciaDe('52001')).toBe('Melilla');
    expect(provinciaDe('99999')).toBe('');
    expect(provinciaPorIne('28')?.nombre).toBe('Madrid');
    expect(provinciaPorIne('28079')?.zonaEolica).toBe('A');
  });
});

describe('zona invernal: cruce de la tabla 3.8 con la E.2', () => {
  it('la E.2 en la altitud de cada capital reproduce su sk de la 3.8 (±0,1)', () => {
    for (const p of PROVINCIAS) {
      const sk = cargaNieveTerreno(p.zonaInvernal, p.capital.altitud);
      expect(sk, `${p.nombre} (zona ${p.zonaInvernal}, ${p.capital.altitud} m)`).not.toBeNull();
      expect(Math.abs((sk as number) - p.capital.sk), `${p.nombre}: E.2 da ${sk}, la 3.8 dice ${p.capital.sk}`).toBeLessThanOrEqual(0.1);
    }
  });

  it('y la zona vecina NO lo reproduce, en las capitales que el cruce decide', () => {
    const casos: [ine: string, otraZona: ZonaInvernal][] = [
      ['24', 3], // León: zona 3 daría 0,5, no 1,2
      ['08', 5], // Barcelona: zona 5 daría 0,2, no 0,4
      ['44', 2], // Teruel: zona 2 daría 1,4, no 0,9
      ['16', 4], // Cuenca: zona 4 daría 1,2, no 1,0
      ['05', 4], // Ávila: zona 4 daría 1,7, no 1,0
      ['34', 1], // Palencia: zona 1 daría 1,0, no 0,4
      ['42', 2], // Soria: zona 2 daría 1,7, no 0,9
      ['47', 4], // Valladolid: zona 4 daría 0,6, no 0,4
      ['28', 3], // Madrid: zona 3 daría 0,36, no 0,6
    ];
    for (const [ine, otra] of casos) {
      const p = provinciaPorIne(ine)!;
      const sk = cargaNieveTerreno(otra, p.capital.altitud) as number;
      expect(Math.abs(sk - p.capital.sk), `${p.nombre} en zona ${otra}`).toBeGreaterThan(0.1);
    }
  });
});

describe('oráculo externo: normatia.com, 50 municipios más poblados (2026-09-04)', () => {
  const capitales: [nombre: string, eolica: ZonaEolica, invernal: ZonaInvernal][] = [
    ['Madrid', 'A', 4], ['Barcelona', 'C', 2], ['Valencia', 'A', 5], ['Zaragoza', 'B', 2],
    ['Sevilla', 'A', 6], ['Málaga', 'A', 6], ['Murcia', 'B', 6], ['Baleares', 'C', 5],
    ['Las Palmas', 'C', 7], ['Alicante', 'B', 5], ['Bizkaia', 'C', 1], ['Córdoba', 'A', 6],
    ['Valladolid', 'A', 3], ['Álava', 'C', 2], ['A Coruña', 'C', 1], ['Granada', 'A', 6],
    ['Asturias', 'C', 1], ['Santa Cruz de Tenerife', 'C', 7], ['Navarra', 'C', 2],
    ['Almería', 'A', 6], ['Gipuzkoa', 'C', 1], ['Castellón', 'A', 5], ['Burgos', 'B', 3],
    ['Cantabria', 'C', 1], ['Albacete', 'A', 5], ['La Rioja', 'B', 2], ['Badajoz', 'B', 4],
    ['Lleida', 'C', 2], ['Salamanca', 'A', 3], ['Tarragona', 'C', 2], ['Huelva', 'B', 6],
  ];

  it('las 31 capitales de la lista', () => {
    for (const [nombre, eolica, invernal] of capitales) {
      const p = PROVINCIAS.find((q) => q.nombre === nombre);
      expect(p, nombre).toBeDefined();
      expect(p!.zonaEolica, `${nombre} eólica`).toBe(eolica);
      expect(p!.zonaInvernal, `${nombre} invernal`).toBe(invernal);
    }
  });

  it('municipios grandes que no son capital, con la zona de su provincia', () => {
    // Vigo B/1, Gijón C/1, Jerez C/6, Cartagena B/6, Elche B/5, Marbella A/6,
    // Terrassa C/2, Móstoles A/4, Dos Hermanas A/6, La Laguna C/7.
    const casos: [ine: string, eolica: ZonaEolica, invernal: ZonaInvernal][] = [
      ['36', 'B', 1], ['33', 'C', 1], ['11', 'C', 6], ['30', 'B', 6], ['03', 'B', 5],
      ['29', 'A', 6], ['08', 'C', 2], ['28', 'A', 4], ['41', 'A', 6], ['38', 'C', 7],
    ];
    for (const [ine, eolica, invernal] of casos) {
      const p = provinciaPorIne(ine)!;
      expect(p.zonaEolica, `${p.nombre} eólica`).toBe(eolica);
      expect(p.zonaInvernal, `${p.nombre} invernal`).toBe(invernal);
    }
  });
});

describe('avisos de frontera', () => {
  it('las provincias que el mapa parte llevan aviso, y las que no, no', () => {
    const conAviso = PROVINCIAS.filter((p) => p.frontera !== undefined).map((p) => p.nombre);
    expect(conAviso).toEqual(expect.arrayContaining(['Cáceres', 'Badajoz', 'Alicante', 'Murcia', 'Navarra', 'Zaragoza', 'Melilla']));
    for (const nombre of ['Madrid', 'Barcelona', 'A Coruña', 'Almería', 'Valencia', 'Granada']) {
      const p = PROVINCIAS.find((q) => q.nombre === nombre)!;
      expect(p.frontera?.eolica, `${nombre} eólica`).toBeUndefined();
    }
    for (const p of PROVINCIAS) {
      for (const texto of Object.values(p.frontera ?? {})) expect(texto.endsWith('.')).toBe(true);
    }
  });
});
