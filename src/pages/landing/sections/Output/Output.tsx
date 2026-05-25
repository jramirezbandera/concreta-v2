// Output.tsx — "Exportar y compartir" section (PDF card + share-link demo).

import { useState } from 'react';
import './output.css';

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
          <span className="mono link-bar-host">concreta.tools</span>
          <span className="mono link-bar-path">/rc-beams?s=</span>
          <span className="mono link-bar-hash">eJxLs7E1MdGzMjAwLDcyNzC1MNS0MdSxBQAo3wKw</span>
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
          <span className="link-flow-tag mono">enlace · ~1.2 KB</span>
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

export function OutputSection() {
  return (
    <section className="section" id="output">
      <div className="container">
        <div className="section-head">
          <div>
            <div className="section-eyebrow">03 · Exportar y compartir</div>
            <h2 className="section-title">Defendible ante visado. Compartible en un enlace.</h2>
          </div>
          <p className="section-lede">
            Tu cálculo no se queda en la pantalla. Lo exportas en PDF
            vectorial para anexar a la memoria de proyecto, o lo compartes
            con otro técnico copiando un enlace — sin servidor, sin login.
          </p>
        </div>

        <div className="output-grid">
          <article className="output-card">
            <div className="output-card-body">
              <div className="output-eyebrow mono">PDF · A4 VECTORIAL</div>
              <h3 className="output-card-title">Tu cálculo, listo para anexar a la memoria.</h3>
              <p className="output-card-desc">
                Cada exportación incluye inputs, diagrama de sección,
                envolventes M-V y tabla de comprobaciones con artículo
                CE/CTE. Vectorial — sin pixelado al imprimir, sin marca
                de agua en planes Pro.
              </p>
              <ul className="output-bullets">
                <li>Listo en menos de <strong>5 segundos</strong>.</li>
                <li>SVG vectorial, no captura de pantalla.</li>
                <li>Tu logo y nombre de estudio (plan Pro).</li>
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
              <p className="output-card-desc">
                Cada caso se serializa completo en la URL. Lo mandas por
                email o por WhatsApp; el técnico que lo abre ve exactamente
                tus inputs y tus resultados. Para revisión cruzada, segunda
                opinión o devolución de cálculos.
              </p>
              <ul className="output-bullets">
                <li>El estado vive en la URL — no pasa por nuestros servidores.</li>
                <li>Quien lo abre puede modificar y reenviar.</li>
                <li>Funciona offline una vez instalado como PWA.</li>
                <li>Pega en cualquier navegador moderno.</li>
              </ul>
            </div>
            <div className="link-preview"><ShareLinkPreview /></div>
          </article>
        </div>
      </div>
    </section>
  );
}
