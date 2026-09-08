/**
 * El PDF de la memoria de «Viento y nieve» (`lib/pdf/vientoNieve`), el
 * exportador que faltaba para que el módulo tuviera capítulo en el anejo:
 * sale un PDF de verdad, con el nombre del título o el nombre por defecto, y
 * con más de una página cuando lleva viento y nieve.
 */

import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { defaultVientoNieveState, evaluar, nuevoFaldon, type VientoNieveState } from '../../features/viento-nieve/state';
import { cuadroNieveMemoria, cuadroVientoMemoria, type EmplazamientoCuadro } from '../../lib/acciones/cuadros';
import { bytesDe } from '../../lib/anejo/bytes';
import { VIENTO_NIEVE_FALLBACK_PDF } from '../../lib/export/filename';
import type { Block } from '../../lib/materiales/cuadros';
import { exportarVientoNievePdf } from '../../lib/pdf/vientoNieve';

/** Ávila a 1.130 m, con limahoya, acumulación y voladizo: el caso que lo pinta todo (el mismo de `exportacion.test.ts`). */
function avila(): VientoNieveState {
  const s = defaultVientoNieveState();
  s.emplazamiento = { ...s.emplazamiento, provincia: '05', municipio: 'Ávila', altitud: 1130 };
  s.nieve.faldones = [
    { ...nuevoFaldon('Faldón norte', 25), limahoya: 'contrario', inclinacionOtro: 25, L: 6 },
    { ...nuevoFaldon('Faldón sur', 45), L: 8, voladizo: true, limahoya: 'cambioNivel' },
  ];
  return s;
}

function memoria(): Block[] {
  const state = avila();
  const ev = evaluar(state);
  const e: EmplazamientoCuadro = {
    provincia: ev.zonas.provincia!.nombre,
    municipio: state.emplazamiento.municipio,
    altitud: state.emplazamiento.altitud,
    zonaEolica: ev.zonas.zonaEolica,
    zonaInvernal: ev.zonas.zonaInvernal,
  };
  return [
    ...(ev.viento ? cuadroVientoMemoria(ev.viento, e) : []),
    ...(ev.nieve ? cuadroNieveMemoria(ev.nieve, e) : []),
  ];
}

describe('exportarVientoNievePdf', () => {
  it('sale un PDF con el nombre del título', async () => {
    const bloques = memoria();
    expect(bloques.length).toBeGreaterThan(5);
    const r = await exportarVientoNievePdf(bloques, 'Nave en Ávila');
    expect(r.filename).toBe('nave-en-avila.pdf');
    expect(r.blob.type).toBe('application/pdf');
    const bytes = new Uint8Array(await bytesDe(r.blob));
    expect(new TextDecoder('latin1').decode(bytes.subarray(0, 5))).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('sin título, el nombre por defecto', async () => {
    const r = await exportarVientoNievePdf(memoria());
    expect(r.filename).toBe(VIENTO_NIEVE_FALLBACK_PDF);
    expect(r.filename).toBe('viento-y-nieve.pdf');
  });

  it('con sólo una nota, cabe en una página', async () => {
    const r = await exportarVientoNievePdf([{ kind: 'notes', items: ['(*) nada que ver'] }], 'Corto');
    const doc = await PDFDocument.load(await bytesDe(r.blob));
    expect(doc.getPageCount()).toBe(1);
  });
});
