// Output.tsx — "Exportar y compartir" section (PDF card + share-link demo).

import { useState } from 'react';
import { sectionEyebrow } from '../../constants';
import { MODULE_LIBRARY } from '../../modules';
import { rcBeamDefaults } from '../../../../data/defaults';
import './output.css';

// The link in the mockup is the one «Copiar enlace» builds for Vigas HA with
// its defaults (useModuleState → toUrlParams): the real route and every field
// in clear. It used to show «/rc-beams?s=eJx…», a route and an encoding that
// never existed.
const SHARE_HOST = 'concreta.tools';
const SHARE_ROUTE = MODULE_LIBRARY.find((m) => m.id === 'rc-beams')?.route ?? '/horm/vigas';
const SHARE_QS = new URLSearchParams(
  Object.entries(rcBeamDefaults).map(([k, v]) => [k, String(v)]),
).toString();
const SHARE_KB = ((`https://${SHARE_HOST}${SHARE_ROUTE}?${SHARE_QS}`).length / 1000)
  .toFixed(1)
  .replace('.', ',');

function ShareLinkPreview() {
  const [copied, setCopied] = useState(false);
  return (
    <div className="link-stage">
      <div className="link-browser">
        <div className="link-browser-chrome">
          <span className="link-browser-dot dot-r" />
          <span className="link-browser-dot dot-y" />
          <span className="link-browser-dot dot-g" />
          <span className="link-browser-tabs mono">vigas-ha</span>
        </div>
        <div className="link-browser-bar">
          <svg
            className="link-lock"
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden="true"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span className="mono link-bar-host">{SHARE_HOST}</span>
          <span className="mono link-bar-path">{SHARE_ROUTE}?</span>
          <span className="mono link-bar-hash">{SHARE_QS}</span>
          <button
            type="button"
            className="link-copy-btn"
            onClick={() => { setCopied(true); setTimeout(() => setCopied(false), 1400); }}
          >
            {copied ? '✓ copiado' : 'copiar'}
          </button>
        </div>
      </div>

      <div className="link-flow">
        <div className="link-flow-node">
          <div className="link-avatar dot-grid"><span className="mono">JR</span></div>
          <div className="link-flow-name">Javier</div>
          <div className="link-flow-role mono dim">CALCULISTA</div>
        </div>
        <div className="link-flow-pipe">
          <span className="link-flow-tag mono">enlace · ~{SHARE_KB} KB</span>
          <span className="link-flow-line" />
          <span className="link-flow-arrow">→</span>
        </div>
        <div className="link-flow-node">
          <div className="link-avatar dot-grid"><span className="mono">AB</span></div>
          <div className="link-flow-name">Ana · estudio</div>
          <div className="link-flow-role mono dim">DIRECTORA</div>
        </div>
      </div>
    </div>
  );
}

// What each module exports, checked against every module's «Exportar» menu on
// 2026-09-25. A cell is either a check or the name of what comes out; nothing
// is claimed per module that the menu does not offer.
type Formato = true | string | false;
interface FilaFormatos {
  modulos: string;
  pdf: Formato;
  word: Formato;
  excel: Formato;
  dxf: Formato;
}

const FORMATOS: FilaFormatos[] = [
  {
    modulos: 'Cuadro de materiales · Viento y nieve · Cargas por planta · Incendio',
    pdf: true,
    word: 'memoria',
    excel: 'cuadro del plano',
    dxf: 'cuadro del plano',
  },
  { modulos: 'Cumplimiento del DB SE', pdf: true, word: 'la ficha', excel: false, dxf: false },
  { modulos: 'Vigas de hormigón', pdf: true, word: false, excel: false, dxf: 'cuadro de vigas' },
  { modulos: 'Muros · Encepados · Micropilotes', pdf: true, word: false, excel: false, dxf: 'plano tipo' },
  { modulos: 'El resto de módulos de cálculo', pdf: true, word: false, excel: false, dxf: false },
  { modulos: 'La obra', pdf: 'el anejo', word: false, excel: 'los cuadros', dxf: 'los cuadros' },
];

function CeldaFormato({ f }: { f: Formato }) {
  if (f === true) return <td className="fmt-yes">✓</td>;
  if (f === false) return <td className="fmt-no">—</td>;
  return <td className="fmt-yes">{f}</td>;
}

export function OutputSection() {
  return (
    <section className="section" id="output">
      <div className="container">
        <div className="section-head">
          <div>
            <div className="section-eyebrow">{sectionEyebrow('exportar')}</div>
            <h2 className="section-title">Defendible ante visado. Compartible en un enlace.</h2>
          </div>
          <p className="section-lede">
            Tu cálculo no se queda en la pantalla. Sale en PDF para el anejo,
            en Word y Excel para la memoria y el plano, y en DXF para el CAD —
            o lo compartes con otro técnico copiando un enlace, sin servidor y
            sin login.
          </p>
        </div>

        <div className="output-grid">
          <article className="output-card">
            <div className="output-card-body">
              <div className="output-eyebrow mono">PDF · A4</div>
              <h3 className="output-card-title">Tu cálculo, listo para anexar a la memoria.</h3>
              {/* «Vectorial» was half true: text and tables are, but the
                  drawings go in as 3× PNG because Acrobat rejects what
                  svg2pdf makes of our gradients (lib/pdf/utils.ts). */}
              <p className="output-card-desc">
                Cada exportación lleva los datos, el dibujo de la pieza y la
                tabla de comprobaciones con su artículo del CE o del CTE. El
                texto y las tablas son vectoriales; el dibujo va a triple
                resolución, para que lo abra cualquier visor, Acrobat incluido.
              </p>
              <ul className="output-bullets">
                <li>Con el nombre del cálculo en la banda de título.</li>
                <li>Texto seleccionable, con la fuente embebida.</li>
                <li>Al anejo de la obra desde el mismo desplegable.</li>
                <li>Compatible con cualquier gestor documental.</li>
              </ul>
            </div>
            <div className="pdf-preview">
              <img
                src="/landing/pdf-export.jpg"
                alt="Vista previa de exportación PDF de Concreta"
                className="pdf-img"
              />
            </div>
          </article>

          <article className="output-card">
            <div className="output-card-body">
              <div className="output-eyebrow mono">ENLACE · ESTADO SERIALIZADO</div>
              <h3 className="output-card-title">Comparte el cálculo. No subes nada.</h3>
              {/* The tables of Acciones and Memorias do not fit in a URL, so
                  those modules copy the bare address: say «de cálculo». */}
              <p className="output-card-desc">
                En los módulos de cálculo, el caso viaja completo en la URL. Lo
                mandas por email o por WhatsApp; el técnico que lo abre ve
                exactamente tus datos y tus resultados. Para revisión cruzada,
                segunda opinión o devolución de cálculos.
              </p>
              <ul className="output-bullets">
                <li>El estado vive en la URL — no pasa por nuestros servidores.</li>
                <li>Quien lo abre puede modificar y reenviar.</li>
                <li>La obra entera viaja en un fichero <span className="mono">.concreta.json</span>.</li>
                <li>Funciona offline una vez instalado como PWA.</li>
              </ul>
            </div>
            <div className="link-preview"><ShareLinkPreview /></div>
          </article>
        </div>

        <div className="output-formats">
          <div className="output-formats-h">
            <h3 className="output-card-title">Qué sale de cada módulo.</h3>
            <p className="output-formats-lede">
              Todos guardan su PDF en el anejo de la obra desde el mismo
              desplegable. Los planos tipo son los del estudio, rellenos: el
              dibujo es el de siempre y la app cambia las cifras de su tabla.
            </p>
          </div>
          <div className="fmt-scroll">
            <table className="fmt-table">
              <thead>
                <tr>
                  <th>Módulo</th>
                  <th>PDF</th>
                  <th>Word</th>
                  <th>Excel</th>
                  <th>DXF</th>
                </tr>
              </thead>
              <tbody>
                {FORMATOS.map((r) => (
                  <tr key={r.modulos}>
                    <td className="fmt-mod">{r.modulos}</td>
                    <CeldaFormato f={r.pdf} />
                    <CeldaFormato f={r.word} />
                    <CeldaFormato f={r.excel} />
                    <CeldaFormato f={r.dxf} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
