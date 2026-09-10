/**
 * El índice de piezas del anejo (`lib/anejo`): guardar una pieza escribe el
 * PDF y luego el índice (y deshace el PDF si el índice no cabe), un capítulo de
 * memoria reemplaza y una pieza añade, quitar borra las dos cosas, el estado
 * «al día / recalcular» sale de la huella y del esquema, y los huérfanos se
 * purgan contando también los índices de las obras archivadas.
 */

import { IDBFactory } from 'fake-indexeddb';
import { PDFDocument } from 'pdf-lib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  adaptadorDe,
  adoptarDatosDeModulos,
  destinoDeGuardado,
  piezaAbierta,
  blobIdsReferenciados,
  escribirAnejo,
  estadoDePieza,
  fijarIncluida,
  guardarPieza,
  hayTrabajoSinGuardar,
  huellaDeModulo,
  leerAnejo,
  piezaPorId,
  piezas,
  piezasSinPdf,
  purgarBlobsHuerfanos,
  purgarEnSegundoPlano,
  quitarPieza,
  renombrarPieza,
  restaurarPieza,
  rutaDeModulo,
  soltarVinculo,
  type Pieza,
} from '../../lib/anejo';
import { _reiniciarBlobsParaTests, borrarBlob, guardarBlob, idsDeBlobs, leerBlob } from '../../lib/anejo/blobs';
import { crearPdf } from '../../lib/pdf/fuente';
import { drawElementTitle } from '../../lib/pdf/utils';
import { blobDePdf } from '../../lib/anejo/concatenar';
import { leerVinculo } from '../../lib/anejo/vinculo';
import { _reiniciarProyectoParaTests, guardar, proyectoNuevo } from '../../lib/proyecto';
import { escribirClaveDiferida, hayPendientes, _reiniciarAlmacenParaTests } from '../../lib/storage/seguro';

async function pdf(paginas = 2): Promise<Blob> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < paginas; i++) doc.addPage();
  return blobDePdf(await doc.save());
}

function conIndexedDB(valor: unknown) {
  Object.defineProperty(globalThis, 'indexedDB', { value: valor, configurable: true, writable: true });
}

const cuotaLlena = () => new DOMException('QuotaExceededError', 'QuotaExceededError');

beforeEach(() => {
  localStorage.clear();
  _reiniciarAlmacenParaTests();
  _reiniciarProyectoParaTests();
  _reiniciarBlobsParaTests();
  conIndexedDB(new IDBFactory());
  localStorage.setItem('rc-beams', JSON.stringify({ title: 'Viga V-1', L: 6 }));
  localStorage.setItem('rc-beams-version', '1');
});

afterEach(() => {
  vi.restoreAllMocks();
  _reiniciarBlobsParaTests();
});

describe('el índice', () => {
  it('sin nada guardado, vacío', () => {
    expect(leerAnejo()).toEqual({ v: 1, piezas: [] });
    expect(piezas()).toEqual([]);
  });

  it('un índice corrupto o con piezas a medias se lee limpio', () => {
    localStorage.setItem('concreta-anejo', 'no es json');
    expect(leerAnejo().piezas).toEqual([]);
    localStorage.setItem('concreta-anejo', JSON.stringify({ v: 1, piezas: [{ id: 'sin-campos' }, 'texto', null] }));
    expect(leerAnejo().piezas).toEqual([]);
    localStorage.setItem('concreta-anejo', JSON.stringify({ v: 2, piezas: [] }));
    expect(leerAnejo().piezas).toEqual([]);
  });

  it('guardado con otra versión de esquema, se lee en blanco', () => {
    localStorage.setItem('concreta-anejo', JSON.stringify({ v: 1, piezas: [] }));
    localStorage.setItem('concreta-anejo-version', '0');
    expect(leerAnejo()).toEqual({ v: 1, piezas: [] });
  });

  it('escribirAnejo escribe el índice y la versión viva; una pieza antigua sin `incluida` nace incluida', () => {
    const p: Pieza = { id: 'p1', modulo: 'concreta-rc-beams', clave: 'rc-beams', titulo: 'V-1', ts: 't', esquema: '1', blobId: 'b1', paginas: 2, huella: null, datos: null, tituloEnPdf: false, incluida: true };
    expect(escribirAnejo({ v: 1, piezas: [p] })).toBe(true);
    expect(localStorage.getItem('concreta-anejo-version')).toBe('1');
    const guardado = JSON.parse(localStorage.getItem('concreta-anejo')!) as { piezas: Record<string, unknown>[] };
    delete guardado.piezas[0].incluida;
    guardado.piezas[0].paginas = 3.7;
    localStorage.setItem('concreta-anejo', JSON.stringify(guardado));
    expect(piezaPorId('p1')).toEqual({ ...p, paginas: 3, incluida: true });
  });
});

describe('guardarPieza', () => {
  it('guarda el PDF y da de alta la pieza con la clave, el esquema y la huella del módulo', async () => {
    const r = await guardarPieza({ modulo: 'concreta-rc-beams', titulo: ' Viga V-1 ', blob: await pdf(3), paginas: 3 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = r.pieza;
    expect(p.modulo).toBe('concreta-rc-beams');
    expect(p.clave).toBe('rc-beams');
    expect(p.titulo).toBe('Viga V-1');
    expect(p.esquema).toBe('1');
    expect(p.paginas).toBe(3);
    expect(p.huella).toMatch(/^[0-9a-f]{8}$/);
    expect(p.incluida).toBe(true);
    expect(p.ts).toMatch(/^\d{4}-/);
    expect(r.reemplazada).toBeNull();
    expect(piezas()).toEqual([p]);
    const blob = await leerBlob(p.blobId);
    expect(blob).not.toBeNull();
    expect(blob!.size).toBeGreaterThan(100);
  });

  it('sin páginas declaradas, las cuenta abriendo el PDF; sin título, pone el capítulo', async () => {
    const r = await guardarPieza({ modulo: 'concreta-rc-beams', titulo: '', blob: await pdf(4) });
    expect(r.ok && r.pieza.paginas).toBe(4);
    expect(r.ok && r.pieza.titulo).toBe('Vigas de hormigón');
  });

  it('un cálculo de pieza se AÑADE: dos vigas son dos piezas, en orden', async () => {
    await guardarPieza({ modulo: 'concreta-rc-beams', titulo: 'V-1', blob: await pdf(), paginas: 2 });
    await guardarPieza({ modulo: 'concreta-rc-beams', titulo: 'V-2', blob: await pdf(), paginas: 2 });
    expect(piezas().map((p) => p.titulo)).toEqual(['V-1', 'V-2']);
    expect((await idsDeBlobs()).length).toBe(2);
  });

  it('un capítulo de memoria REEMPLAZA al suyo, en su misma posición, y borra el PDF viejo', async () => {
    await guardarPieza({ modulo: 'concreta-rc-beams', titulo: 'V-1', blob: await pdf(), paginas: 2 });
    const primero = await guardarPieza({ modulo: 'concreta-materiales', titulo: 'Cuadro', blob: await pdf(), paginas: 1 });
    await guardarPieza({ modulo: 'concreta-rc-beams', titulo: 'V-2', blob: await pdf(), paginas: 2 });
    // La casilla «incluir» sobrevive al reemplazo.
    const a = leerAnejo();
    a.piezas[1].incluida = false;
    escribirAnejo(a);

    const segundo = await guardarPieza({ modulo: 'concreta-materiales', titulo: 'Cuadro bis', blob: await pdf(), paginas: 2 });
    expect(segundo.ok).toBe(true);
    if (!primero.ok || !segundo.ok) return;
    expect(segundo.reemplazada?.id).toBe(primero.pieza.id);
    expect(piezas().map((p) => p.titulo)).toEqual(['V-1', 'Cuadro bis', 'V-2']);
    expect(piezas()[1].incluida).toBe(false);
    expect(segundo.pieza.incluida).toBe(false);
    expect(await leerBlob(primero.pieza.blobId)).toBeNull();
    expect(await leerBlob(segundo.pieza.blobId)).not.toBeNull();
    expect((await idsDeBlobs()).length).toBe(3);
  });

  it('si el índice no cabe, deshace el PDF y lo dice', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string) {
      if (k === 'concreta-anejo') throw cuotaLlena();
    });
    const r = await guardarPieza({ modulo: 'concreta-rc-beams', titulo: 'V-1', blob: await pdf(), paginas: 2 });
    expect(r).toEqual({ ok: false, donde: 'indice', motivo: 'cuota' });
    expect(await idsDeBlobs()).toEqual([]);
    expect(leerAnejo().piezas).toEqual([]);
  });

  it('sin IndexedDB, no toca el índice y dice por qué', async () => {
    conIndexedDB(undefined);
    const r = await guardarPieza({ modulo: 'concreta-rc-beams', titulo: 'V-1', blob: await pdf(), paginas: 2 });
    expect(r).toEqual({ ok: false, donde: 'blob', motivo: 'sin-indexeddb' });
    expect(localStorage.getItem('concreta-anejo')).toBeNull();
  });

  it('un módulo sin adaptador es un error de programación: lanza', async () => {
    await expect(guardarPieza({ modulo: 'concreta-no-existe', titulo: '', blob: await pdf(), paginas: 1 })).rejects.toThrow(/no tiene adaptador/);
  });
});

describe('quitarPieza', () => {
  it('quita la pieza del índice y borra su PDF', async () => {
    const r = await guardarPieza({ modulo: 'concreta-rc-beams', titulo: 'V-1', blob: await pdf(), paginas: 2 });
    if (!r.ok) throw new Error('no guardó');
    expect(await quitarPieza(r.pieza.id)).toBe(true);
    expect(piezas()).toEqual([]);
    expect(await leerBlob(r.pieza.blobId)).toBeNull();
  });

  it('una pieza que no existe: false, sin tocar nada', async () => {
    await guardarPieza({ modulo: 'concreta-rc-beams', titulo: 'V-1', blob: await pdf(), paginas: 2 });
    expect(await quitarPieza('no-existe')).toBe(false);
    expect(piezas()).toHaveLength(1);
  });
});

describe('estadoDePieza', () => {
  async function piezaDeVigas(): Promise<Pieza> {
    const r = await guardarPieza({ modulo: 'concreta-rc-beams', titulo: 'V-1', blob: await pdf(), paginas: 2 });
    if (!r.ok) throw new Error('no guardó');
    return r.pieza;
  }

  it('recién guardada está al día', async () => {
    expect(estadoDePieza(await piezaDeVigas())).toBe('al-dia');
  });

  it('que el módulo tenga OTRA cosa ya no la desfasa: la pieza lleva sus datos', async () => {
    const p = await piezaDeVigas();
    localStorage.setItem('rc-beams', JSON.stringify({ title: 'Viga V-5', L: 9 }));
    expect(estadoDePieza(p)).toBe('al-dia');
    localStorage.removeItem('rc-beams');
    expect(estadoDePieza(p)).toBe('al-dia');
  });

  it('lo que sí la desfasa es el esquema: el módulo de hoy ya no sabe leer sus datos', async () => {
    const p = await piezaDeVigas();
    expect(estadoDePieza({ ...p, esquema: '0' })).toBe('version-anterior');
    expect(estadoDePieza({ ...p, modulo: 'concreta-de-otra-version' })).toBe('version-anterior');
  });
});

describe('huérfanos y ausentes', () => {
  it('blobIdsReferenciados cuenta la obra abierta y las archivadas', async () => {
    const r = await guardarPieza({ modulo: 'concreta-rc-beams', titulo: 'V-1', blob: await pdf(), paginas: 2 });
    if (!r.ok) throw new Error('no guardó');
    const archivada = proyectoNuevo('Otra obra');
    archivada.id = 'otra';
    archivada.claves['concreta-anejo'] = JSON.stringify({
      v: 1,
      piezas: [{ id: 'x', modulo: 'concreta-rc-beams', clave: 'rc-beams', titulo: 'X', ts: 't', esquema: '1', blobId: 'blob-archivado', paginas: 1 }],
    });
    expect(guardar(archivada)).toBe(true);
    expect(blobIdsReferenciados()).toEqual({ ids: new Set([r.pieza.blobId, 'blob-archivado']), completo: true });
  });

  it('purgarBlobsHuerfanos borra sólo lo que ningún índice referencia', async () => {
    const r = await guardarPieza({ modulo: 'concreta-rc-beams', titulo: 'V-1', blob: await pdf(), paginas: 2 });
    if (!r.ok) throw new Error('no guardó');
    await guardarBlob('huerfano', await pdf(1));
    expect(await purgarBlobsHuerfanos()).toEqual(['huerfano']);
    expect(await idsDeBlobs()).toEqual([r.pieza.blobId]);
  });

  it('el índice vivo se lee EN CRUDO: subir la versión de esquema no convierte los PDF en huérfanos', async () => {
    const r = await guardarPieza({ modulo: 'concreta-rc-beams', titulo: 'V-1', blob: await pdf(), paginas: 2 });
    if (!r.ok) throw new Error('no guardó');
    // El día que suba `versionViva('concreta-anejo')`, el índice se hidrata en
    // blanco (es lo correcto para la pantalla) pero sus PDF siguen vivos.
    localStorage.setItem('concreta-anejo-version', '99');
    expect(leerAnejo().piezas).toEqual([]);
    expect(blobIdsReferenciados().ids).toEqual(new Set([r.pieza.blobId]));
    expect(await purgarBlobsHuerfanos()).toEqual([]);
    expect(await idsDeBlobs()).toEqual([r.pieza.blobId]);
  });

  it('con un archivo de obra ilegible no se purga nada: sus PDF son desconocidos, no huérfanos', async () => {
    await guardarBlob('de-la-otra', await pdf(1));
    const archivada = proyectoNuevo('Otra obra');
    archivada.id = 'otra';
    expect(guardar(archivada)).toBe(true);
    localStorage.setItem('concreta-proyecto-otra', 'esto ya no es un proyecto');

    expect(blobIdsReferenciados().completo).toBe(false);
    expect(await purgarBlobsHuerfanos()).toEqual([]);
    expect(await idsDeBlobs()).toEqual(['de-la-otra']);
  });

  it('con el almacén no disponible tampoco: no saber qué está vivo no es que nada lo esté', async () => {
    await guardarBlob('quiza-vivo', await pdf(1));
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError');
    });
    expect(blobIdsReferenciados()).toEqual({ ids: new Set(), completo: false });
    expect(await purgarBlobsHuerfanos()).toEqual([]);
    expect(await idsDeBlobs()).toEqual(['quiza-vivo']);
  });

  it('purgarEnSegundoPlano no lanza nunca y dice cuántos borró', async () => {
    await guardarBlob('huerfano', await pdf(1));
    expect(await purgarEnSegundoPlano()).toBe(1);
    expect(await idsDeBlobs()).toEqual([]);

    conIndexedDB(undefined);
    await expect(purgarEnSegundoPlano()).resolves.toBe(0);
  });

  it('piezasSinPdf señala las piezas cuyo PDF no está en esta máquina', async () => {
    const a = await guardarPieza({ modulo: 'concreta-rc-beams', titulo: 'V-1', blob: await pdf(), paginas: 2 });
    const b = await guardarPieza({ modulo: 'concreta-rc-beams', titulo: 'V-2', blob: await pdf(), paginas: 2 });
    if (!a.ok || !b.ok) throw new Error('no guardó');
    expect(await piezasSinPdf()).toEqual(new Set());
    await borrarBlob(b.pieza.blobId);
    expect(await piezasSinPdf()).toEqual(new Set([b.pieza.id]));
  });
});

const DATOS_VIGAS = { 'rc-beams': JSON.stringify({ title: 'Viga V-1', L: 6 }), 'rc-beams-version': '1' };

/** Una pieza como las que guardaba la versión anterior: PDF y huella, sin datos. */
function antigua(id: string, huella: string | null, extra: Partial<Pieza> = {}): Pieza {
  return {
    id,
    modulo: 'concreta-rc-beams',
    clave: 'rc-beams',
    titulo: `V-${id}`,
    ts: '2026-09-08T10:00:00.000Z',
    esquema: '1',
    blobId: `b-${id}`,
    paginas: 2,
    huella,
    datos: null,
    tituloEnPdf: false,
    incluida: true,
    ...extra,
  };
}

describe('los datos que la pieza se lleva', () => {
  it('guardar apunta el estado del módulo y que el PDF lleva banda de título', async () => {
    expect((await guardarPieza({ modulo: 'concreta-rc-beams', titulo: 'Viga V-1', blob: await pdf() })).ok).toBe(true);
    const p = piezas()[0];
    expect(p.datos).toEqual(DATOS_VIGAS);
    expect(p.tituloEnPdf).toBe(true);
  });

  it('exportada sin nombre: el capítulo pone el rótulo y no hay banda que repintar', async () => {
    await guardarPieza({ modulo: 'concreta-rc-beams', titulo: '   ', blob: await pdf() });
    const p = piezas()[0];
    expect(p.titulo).toBe('Vigas de hormigón');
    expect(p.tituloEnPdf).toBe(false);
    expect(p.datos).toEqual(DATOS_VIGAS);
  });

  it('una pieza de la versión anterior se lee entera, sin datos y sin banda', () => {
    const vieja = { ...antigua('p1', 'abc') } as Record<string, unknown>;
    delete vieja.datos;
    delete vieja.tituloEnPdf;
    localStorage.setItem('concreta-anejo', JSON.stringify({ v: 1, piezas: [vieja] }));
    const p = piezaPorId('p1')!;
    expect(p.titulo).toBe('V-p1');
    expect(p.datos).toBeNull();
    expect(p.tituloEnPdf).toBe(false);
  });

  it('unos datos a medias no se restauran a medias: si un valor no es texto, se caen enteros', () => {
    const rota = { ...antigua('p1', 'abc'), datos: { 'rc-beams': '{}', 'rc-beams-version': 1 } };
    localStorage.setItem('concreta-anejo', JSON.stringify({ v: 1, piezas: [rota] }));
    expect(piezaPorId('p1')!.datos).toBeNull();
  });
});

describe('la adopción de lo guardado antes', () => {
  it('adopta la que coincide, deja la que no, y no toca la que ya tiene datos', () => {
    const h = huellaDeModulo(adaptadorDe('concreta-rc-beams'));
    expect(h).not.toBeNull();
    escribirAnejo({
      v: 1,
      piezas: [antigua('p1', h), antigua('p2', 'otra'), antigua('p3', h, { datos: { 'rc-beams': 'mío' } })],
    });
    expect(adoptarDatosDeModulos()).toBe(1);
    expect(piezaPorId('p1')!.datos).toEqual(DATOS_VIGAS);
    expect(piezaPorId('p2')!.datos).toBeNull();
    expect(piezaPorId('p3')!.datos).toEqual({ 'rc-beams': 'mío' });
  });

  it('lo adoptado no gana banda de título: de un PDF de antes no se puede saber', () => {
    escribirAnejo({ v: 1, piezas: [antigua('p1', huellaDeModulo(adaptadorDe('concreta-rc-beams')))] });
    expect(adoptarDatosDeModulos()).toBe(1);
    expect(piezaPorId('p1')!.tituloEnPdf).toBe(false);
  });

  it('con el esquema cambiado no adopta: lo que el módulo guarda hoy ya no es lo que hizo aquel PDF', () => {
    const h = huellaDeModulo(adaptadorDe('concreta-rc-beams'));
    escribirAnejo({ v: 1, piezas: [antigua('p1', h, { esquema: '0' })] });
    expect(adoptarDatosDeModulos()).toBe(0);
    expect(piezaPorId('p1')!.datos).toBeNull();
  });

  it('sin huella no adopta, y una pieza de un módulo desconocido tampoco', () => {
    escribirAnejo({ v: 1, piezas: [antigua('p1', null), antigua('p2', 'x', { modulo: 'concreta-de-otra-version' })] });
    expect(adoptarDatosDeModulos()).toBe(0);
  });

  it('es idempotente: la segunda pasada no adopta nada ni reescribe', () => {
    escribirAnejo({ v: 1, piezas: [antigua('p1', huellaDeModulo(adaptadorDe('concreta-rc-beams')))] });
    expect(adoptarDatosDeModulos()).toBe(1);
    const indice = localStorage.getItem('concreta-anejo');
    expect(adoptarDatosDeModulos()).toBe(0);
    expect(localStorage.getItem('concreta-anejo')).toBe(indice);
  });
});

describe('abrir una pieza en su módulo', () => {
  /** Una pieza de vigas con el estado que se le pase, ya en el índice. */
  function conDatos(datos: Record<string, string>, extra: Partial<Pieza> = {}): Pieza {
    const p = antigua('p1', 'h', { datos, ...extra });
    escribirAnejo({ v: 1, piezas: [p] });
    return p;
  }

  it('deja el módulo como estaba y dice a dónde navegar', () => {
    conDatos({ 'rc-beams': '{"title":"V-3","L":9}', 'rc-beams-version': '1' });
    localStorage.setItem('rc-beams', '{"title":"V-5","L":4}');
    const r = restaurarPieza('p1');
    expect(r).toEqual({ ok: true, ruta: rutaDeModulo('concreta-rc-beams') });
    expect(localStorage.getItem('rc-beams')).toBe('{"title":"V-3","L":9}');
  });

  it('borra lo que el módulo tenga y la pieza no traiga: el suelo de la anterior no se pega a ésta', () => {
    const micro = antigua('m1', 'h', {
      modulo: 'concreta-micropiles',
      clave: 'micropiles',
      esquema: '9',
      datos: { micropiles: '{"n":4}', 'micropiles-version': '9' },
    });
    escribirAnejo({ v: 1, piezas: [micro] });
    localStorage.setItem('micropiles', '{"n":9}');
    localStorage.setItem('concreta-micropiles-soil', '[{"estrato":"arcilla"}]');
    expect(restaurarPieza('m1').ok).toBe(true);
    expect(localStorage.getItem('micropiles')).toBe('{"n":4}');
    expect(localStorage.getItem('concreta-micropiles-soil')).toBeNull();
  });

  it('vuelca la cola diferida antes de escribir: la última tecla de lo que abandonas no pisa lo restaurado', () => {
    conDatos({ 'rc-beams': '{"L":9}', 'rc-beams-version': '1' });
    escribirClaveDiferida('rc-beams', () => '{"L":4}');
    expect(hayPendientes()).toBe(true);
    expect(restaurarPieza('p1').ok).toBe(true);
    expect(hayPendientes()).toBe(false);
    expect(localStorage.getItem('rc-beams')).toBe('{"L":9}');
  });

  it('si una escritura falla a mitad, deshace las anteriores', () => {
    const micro = antigua('m1', 'h', {
      modulo: 'concreta-micropiles',
      clave: 'micropiles',
      esquema: '9',
      datos: { micropiles: '{"n":4}', 'concreta-micropiles-soil': '[]', 'micropiles-version': '9' },
    });
    escribirAnejo({ v: 1, piezas: [micro] });
    localStorage.setItem('micropiles', 'ANTES');
    localStorage.setItem('concreta-micropiles-soil', 'SUELO-ANTES');
    const real = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k === 'concreta-micropiles-soil' && v === '[]') throw cuotaLlena();
      real.call(this, k, v);
    });
    expect(restaurarPieza('m1')).toEqual({ ok: false, motivo: 'sitio' });
    vi.restoreAllMocks();
    expect(localStorage.getItem('micropiles')).toBe('ANTES');
    expect(localStorage.getItem('concreta-micropiles-soil')).toBe('SUELO-ANTES');
  });

  it('no restaura lo que no puede: sin pieza, sin datos, con el esquema cambiado o de un módulo desconocido', () => {
    expect(restaurarPieza('nada')).toEqual({ ok: false, motivo: 'sin-pieza' });
    escribirAnejo({ v: 1, piezas: [antigua('p1', 'h')] });
    expect(restaurarPieza('p1')).toEqual({ ok: false, motivo: 'sin-datos' });
    conDatos({ 'rc-beams': '{}' }, { esquema: '0' });
    expect(restaurarPieza('p1')).toEqual({ ok: false, motivo: 'esquema' });
    escribirAnejo({ v: 1, piezas: [antigua('p1', 'h', { modulo: 'concreta-de-otra-version', datos: { x: 'y' } })] });
    expect(restaurarPieza('p1')).toEqual({ ok: false, motivo: 'desconocido' });
  });
});

describe('el aviso de trabajo sin guardar', () => {
  it('no avisa si lo que el módulo tiene ya está en una pieza del anejo', async () => {
    expect((await guardarPieza({ modulo: 'concreta-rc-beams', titulo: 'Viga V-1', blob: await pdf() })).ok).toBe(true);
    expect(hayTrabajoSinGuardar('concreta-rc-beams')).toBe(false);
  });

  it('avisa en cuanto el cálculo cambia, y deja de avisar al volver a guardarlo', async () => {
    await guardarPieza({ modulo: 'concreta-rc-beams', titulo: 'Viga V-1', blob: await pdf() });
    localStorage.setItem('rc-beams', JSON.stringify({ title: 'Viga V-5', L: 9 }));
    expect(hayTrabajoSinGuardar('concreta-rc-beams')).toBe(true);
    await guardarPieza({ modulo: 'concreta-rc-beams', titulo: 'Viga V-5', blob: await pdf() });
    expect(hayTrabajoSinGuardar('concreta-rc-beams')).toBe(false);
  });

  it('renombrar no es trabajar: el nombre no entra en la huella', async () => {
    await guardarPieza({ modulo: 'concreta-rc-beams', titulo: 'Viga V-1', blob: await pdf() });
    localStorage.setItem('rc-beams', JSON.stringify({ title: 'Otro nombre', L: 6 }));
    expect(hayTrabajoSinGuardar('concreta-rc-beams')).toBe(false);
  });

  it('con los valores por defecto intactos no hay nada que perder', () => {
    localStorage.removeItem('rc-beams');
    expect(hayTrabajoSinGuardar('concreta-rc-beams')).toBe(false);
    expect(hayTrabajoSinGuardar('concreta-de-otra-version')).toBe(false);
  });
});

const vigaV1 = async (titulo = 'Viga V-1') =>
  guardarPieza({ modulo: 'concreta-rc-beams', titulo, blob: await pdf() });

describe('el vínculo con la pieza abierta', () => {
  it('guardar deja el módulo ligado a la pieza, y volver a guardar la ACTUALIZA en vez de duplicarla', async () => {
    const primera = await vigaV1();
    expect(primera.ok).toBe(true);
    expect(piezaAbierta('concreta-rc-beams')?.titulo).toBe('Viga V-1');

    localStorage.setItem('rc-beams', JSON.stringify({ title: 'Viga V-1', L: 7 }));
    expect(destinoDeGuardado('concreta-rc-beams', 'Viga V-1').tipo).toBe('actualiza');
    const r = await vigaV1();
    expect(r.ok && r.reemplazada).not.toBeNull();
    expect(piezas()).toHaveLength(1);
    expect(piezas()[0].datos).toEqual({ 'rc-beams': JSON.stringify({ title: 'Viga V-1', L: 7 }), 'rc-beams-version': '1' });
  });

  it('cambiar el nombre suelta el vínculo: sale una pieza nueva y la anterior se queda como estaba', async () => {
    await vigaV1();
    const antes = piezas()[0];
    localStorage.setItem('rc-beams', JSON.stringify({ title: 'Viga V-4', L: 9 }));
    const destino = destinoDeGuardado('concreta-rc-beams', 'Viga V-4');
    expect(destino).toEqual({ tipo: 'nueva', desde: expect.objectContaining({ titulo: 'Viga V-1' }) });
    await vigaV1('Viga V-4');
    expect(piezas().map((p) => p.titulo)).toEqual(['Viga V-1', 'Viga V-4']);
    expect(piezas()[0]).toEqual(antes);
    expect(piezaAbierta('concreta-rc-beams')?.titulo).toBe('Viga V-4');
  });

  it('abrir una pieza del anejo también liga el módulo a ella', async () => {
    await vigaV1();
    const id = piezas()[0].id;
    soltarVinculo();
    expect(piezaAbierta('concreta-rc-beams')).toBeNull();
    expect(restaurarPieza(id).ok).toBe(true);
    expect(leerVinculo()).toEqual({ modulo: 'concreta-rc-beams', piezaId: id });
  });

  it('la pieza que se quitó del anejo deja de estar abierta, y guardar vuelve a estrenar capítulo', async () => {
    await vigaV1();
    const id = piezas()[0].id;
    expect(await quitarPieza(id)).toBe(true);
    expect(piezaAbierta('concreta-rc-beams')).toBeNull();
    expect(destinoDeGuardado('concreta-rc-beams', 'Viga V-1')).toEqual({ tipo: 'nueva', desde: null });
  });

  it('un capítulo de memoria pisa siempre el suyo, se llame como se llame', async () => {
    localStorage.setItem('concreta-viento-nieve-model', '{"v":1}');
    await guardarPieza({ modulo: 'concreta-viento-nieve', titulo: 'Viento de la nave', blob: await pdf() });
    expect(destinoDeGuardado('concreta-viento-nieve', 'Otro nombre cualquiera').tipo).toBe('actualiza');
  });
});

describe('renombrar un capítulo', () => {
  /** Un PDF de verdad, con su banda de título: lo que hace repintable el nombre. */
  async function pdfConNombre(titulo: string): Promise<Blob> {
    const doc = await crearPdf();
    drawElementTitle(doc, titulo, 'Concreta - Vigas de hormigón', 20);
    return blobDePdf(new Uint8Array(doc.output('arraybuffer')));
  }

  async function laV3(): Promise<Pieza> {
    localStorage.setItem('rc-beams', JSON.stringify({ title: 'Viga V-3', L: 6 }));
    const r = await guardarPieza({ modulo: 'concreta-rc-beams', titulo: 'Viga V-3', blob: await pdfConNombre('Viga V-3'), paginas: 1 });
    if (!r.ok) throw new Error('no guardó');
    return r.pieza;
  }

  it('cambia el nombre en la lista, en el PDF y en los datos que la pieza se lleva', async () => {
    const antes = await laV3();
    const r = await renombrarPieza(antes.id, 'Viga V-3 del pórtico 2');
    expect(r.ok).toBe(true);
    const p = piezaPorId(antes.id)!;
    expect(p.titulo).toBe('Viga V-3 del pórtico 2');
    // En los datos: si no, al reabrirla el módulo devolvería el nombre viejo.
    expect(JSON.parse(p.datos!['rc-beams']).title).toBe('Viga V-3 del pórtico 2');
    // Y dentro del PDF, que es lo que se lee en el papel.
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.load(await (await leerBlob(p.blobId))!.arrayBuffer());
    expect(doc.getTitle()).toBe('Viga V-3 del pórtico 2');
  });

  it('mantiene su sitio, su casilla y su fecha: renombrar no es recalcular', async () => {
    const antes = await laV3();
    await guardarPieza({ modulo: 'concreta-rc-columns', titulo: 'P-1', blob: await pdf(), paginas: 1 });
    expect(fijarIncluida(antes.id, false)).toBe(true);
    expect((await renombrarPieza(antes.id, 'Viga V-9')).ok).toBe(true);
    const p = piezaPorId(antes.id)!;
    expect(piezas()[0].id).toBe(antes.id);
    expect(p.incluida).toBe(false);
    expect(p.ts).toBe(antes.ts);
    expect(p.huella).toBe(antes.huella);
  });

  it('el PDF viejo se borra y el nuevo ocupa su sitio', async () => {
    const antes = await laV3();
    expect((await renombrarPieza(antes.id, 'Viga V-9')).ok).toBe(true);
    const p = piezaPorId(antes.id)!;
    expect(p.blobId).not.toBe(antes.blobId);
    expect(await leerBlob(antes.blobId)).toBeNull();
    expect(await leerBlob(p.blobId)).not.toBeNull();
  });

  it('sin banda de título no se renombra, y el mismo nombre no toca nada', async () => {
    const antes = await laV3();
    expect(await renombrarPieza(antes.id, '   ')).toEqual({ ok: false, motivo: 'vacio' });
    expect(await renombrarPieza('nada', 'X')).toEqual({ ok: false, motivo: 'sin-pieza' });
    const r = await renombrarPieza(antes.id, 'Viga V-3');
    expect(r.ok && r.pieza.blobId).toBe(antes.blobId);

    escribirAnejo({ v: 1, piezas: [{ ...antes, tituloEnPdf: false }] });
    expect(await renombrarPieza(antes.id, 'Viga V-9')).toEqual({ ok: false, motivo: 'sin-banda' });
  });

  it('sin el PDF en esta máquina tampoco: no hay dónde escribirlo', async () => {
    const antes = await laV3();
    await borrarBlob(antes.blobId);
    expect(await renombrarPieza(antes.id, 'Viga V-9')).toEqual({ ok: false, motivo: 'sin-pdf' });
    expect(piezaPorId(antes.id)!.titulo).toBe('Viga V-3');
  });
});
