/**
 * `municipioDeObra`: enlazar el municipio tecleado en la obra SIN que nadie
 * elija. Sólo coincidencias exactas de clave; la provincia de la obra filtra;
 * sin provincia, sólo desempata el nombre oficial completo.
 */

import { describe, expect, it } from 'vitest';
import { municipioDeObra } from '../../features/seismic-ncse02/hazard';

describe('municipioDeObra', () => {
  it('un nombre único se enlaza tal cual', async () => {
    const r = await municipioDeObra('Lorca');
    expect(r.tipo).toBe('uno');
    if (r.tipo === 'uno') expect(r.municipio.ine).toBe('30024');
  });

  it('acentos, mayúsculas y la forma con artículo dan igual', async () => {
    const a = await municipioDeObra('el puerto de santa maría');
    expect(a.tipo).toBe('uno');
    if (a.tipo === 'uno') expect(a.municipio.ine).toBe('11027');
    const b = await municipioDeObra('  ALACANT ');
    expect(b.tipo).toBe('uno');
    if (b.tipo === 'uno') expect(b.municipio.nombre).toBe('Alicante/Alacant');
  });

  it('«Granada» sin provincia es Granada capital, no «Granada (La)»', async () => {
    // Las dos empatan en clave; el nombre oficial completo desempata. Un
    // factor seis en la aceleración decidido por el orden del INE, nunca más.
    const r = await municipioDeObra('Granada');
    expect(r.tipo).toBe('uno');
    if (r.tipo === 'uno') expect(r.municipio.ine).toBe('18087');
  });

  it('los homónimos de verdad sin provincia NO se enlazan', async () => {
    const r = await municipioDeObra('Torrent');
    expect(r.tipo).toBe('varios');
    if (r.tipo === 'varios') expect(r.candidatos.map((m) => m.ine).sort()).toEqual(['17197', '46244']);
  });

  it('la provincia de la obra resuelve el homónimo', async () => {
    const r = await municipioDeObra('Torrent', '46');
    expect(r.tipo).toBe('uno');
    if (r.tipo === 'uno') expect(r.municipio.ab).toBeCloseTo(0.07);
  });

  it('una provincia que no casa con el nombre no enlaza nada: antes que adivinar, avisar', async () => {
    expect((await municipioDeObra('Granada', '41')).tipo).toBe('ninguno');
  });

  it('un prefijo no vale para decidir: «Torre» no es «Torrent»', async () => {
    expect((await municipioDeObra('Torre')).tipo).toBe('ninguno');
  });

  it('vacío o sólo signos, nada', async () => {
    expect((await municipioDeObra('')).tipo).toBe('ninguno');
    expect((await municipioDeObra('  -- ')).tipo).toBe('ninguno');
  });
});
