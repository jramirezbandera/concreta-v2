/**
 * El .docx de verdad: que se empaqueta y que dentro dice lo que debe.
 *
 * La maqueta se prueba en `docxPlan.test.ts`, en puro y sin abrir un zip. Aquí
 * se prueba lo único que aquel no puede: que la librería `docx` traduce el plan
 * a un OOXML válido y que las tres piezas de las que depende el criterio
 * «editable sin pelearse» acaban en el XML — estilos integrados, cabecera
 * repetida y símbolos intactos.
 *
 * Se afirma sobre trozos concretos del XML, NO con un snapshot: un snapshot del
 * documento entero rompería en cada bump de `docx` y nadie sabría si el cambio
 * importa. Y nunca sobre los bytes del .docx: llevan timestamp en `core.xml` y
 * en las cabeceras del zip, así que no son deterministas.
 *
 * `Packer.toBase64String` y no `toBuffer`: `toBuffer` pide el tipo `nodebuffer`
 * de jszip y depende de por qué condición resuelva Vitest su campo `browser`.
 */

import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { Packer } from 'docx';
import {
  cuadroAceros,
  cuadroCoeficientesMinoracion,
  cuadroHormigonMemoria,
  type Block,
} from '../../lib/materiales/cuadros';
import { defaultMaterialesState, evaluar } from '../../features/materiales/state';
import { documentoDeBloques } from '../../lib/docx/render';

/** Los bloques de la vista MEMORIA, que es la única que se exporta a Word. */
function bloquesMemoria(): Block[] {
  const state = defaultMaterialesState();
  const evaluacion = evaluar(state);
  return [
    ...cuadroHormigonMemoria(evaluacion.hormigon.map((h) => h.derivacion)),
    ...cuadroAceros({ aceroPasivo: state.estudio.aceroPasivo }),
    ...cuadroCoeficientesMinoracion({ hormigon: true, aceroDeArmar: true }),
  ];
}

async function empaquetar(blocks: Block[], titulo = '') {
  const b64 = await Packer.toBase64String(documentoDeBloques(blocks, { titulo }));
  const zip = await JSZip.loadAsync(b64, { base64: true });
  return { b64, zip, xml: await zip.file('word/document.xml')!.async('string') };
}

describe('empaquetado del .docx', () => {
  it('produce un zip con las partes de un OOXML de Word', async () => {
    const { b64, zip } = await empaquetar(bloquesMemoria(), 'Nave taller');
    expect(atob(b64).startsWith('PK\x03\x04')).toBe(true);
    expect(zip.file('[Content_Types].xml')).not.toBeNull();
    expect(zip.file('word/document.xml')).not.toBeNull();
    expect(zip.file('docProps/core.xml')).not.toBeNull();
  });

  it('no revienta con los bloques reales del estado por defecto', async () => {
    const bloques = bloquesMemoria();
    expect(bloques.length).toBeGreaterThan(3);
    await expect(empaquetar(bloques)).resolves.toBeDefined();
  });

  it('`Packer.toBlob` —el camino que usa la app— devuelve un blob con peso', async () => {
    // `empaquetar` usa toBase64String porque es el que se puede inspeccionar.
    // Producción llama a toBlob, que baja por jszip con `type: 'blob'`: si esa
    // rama pidiera un polyfill de Node que no está, reventaría sólo aquí.
    const blob = await Packer.toBlob(documentoDeBloques(bloquesMemoria(), { titulo: 'Nave' }));
    expect(blob.size).toBeGreaterThan(1000);
  });

  it('usa los estilos INTEGRADOS de Word, no unos propios', async () => {
    // Es lo que hace que el cuadro, pegado en la memoria del proyecto, herede
    // la numeración, la fuente y el índice de la plantilla del usuario.
    const { xml } = await empaquetar(bloquesMemoria(), 'Nave taller');
    expect(xml).toContain('<w:pStyle w:val="Heading1"/>');
    expect(xml).toContain('<w:pStyle w:val="Heading2"/>');
    expect(xml).toContain('w:val="TableGrid"');
  });

  it('la cabecera de cada tabla se repite al partir la página', async () => {
    const { xml } = await empaquetar(bloquesMemoria());
    expect(xml).toContain('<w:tblHeader');
    expect(xml).toContain('<w:cantSplit');
  });

  it('los símbolos normativos viajan intactos', async () => {
    // El fallo que busca: alguien aplicando `pdfStr()` por analogía con el PDF.
    // «Δcdev» convertido en «Deltacdev» en un documento que firma el proyectista.
    const { xml } = await empaquetar([
      { kind: 'heading', level: 2, text: 'HORMIGÓN' },
      {
        kind: 'table',
        head: ['Localización', 'fcd'],
        rows: [['Cimentación', '20,0 N/mm²']],
      },
      { kind: 'notes', items: ['(*) Δcdev = 10 mm; γc ≤ 1,5; Ø12 · 40'] },
    ]);
    for (const s of ['N/mm²', 'Δcdev', 'γc', '≤', 'Ø12', '·']) {
      expect(xml).toContain(s);
    }
  });

  it('escapa el XML de un nombre tecleado por el usuario', async () => {
    const { xml } = await empaquetar([
      { kind: 'table', head: ['Elemento'], rows: [['Vigas & zunchos < 30 cm']] },
    ]);
    expect(xml).toContain('Vigas &amp; zunchos &lt; 30 cm');
  });

  it('el espacio inicial de los marcadores de nota no se pierde', async () => {
    // `notas.marca()` devuelve " (*)" con espacio delante: sin
    // xml:space="preserve" Word se lo come y el cuadro pierde sus llamadas.
    const { xml } = await empaquetar([
      { kind: 'table', head: ['Elemento'], rows: [['Cimentación (*)']] },
    ]);
    expect(xml).toContain('xml:space="preserve"');
  });

  it('sin título el documento no abre con un encabezado en blanco', async () => {
    const { xml } = await empaquetar(bloquesMemoria(), '   ');
    expect(xml).not.toContain('<w:pStyle w:val="Heading1"/>');
  });
});
