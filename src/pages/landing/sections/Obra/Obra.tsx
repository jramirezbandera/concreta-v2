// Obra.tsx — "De la obra al anejo": the modules add up to what a project
// delivers (decision 2026-09-25).
//
// Until September the landing sold loose calculations. The app now keeps them
// inside an obra, passes data between modules and assembles the three
// documents a project hands in. That is the biggest change since the page was
// written, so it gets a section of its own right after Módulos.
//
// ANTI-DRIFT, as in AssistantPreview: the rail on the right is the REAL
// <Documento> from the obra panel (features/obra/Entregables.tsx), fed fixed
// states. When the panel's sheets change, this figure changes with them.
//
// Every claim in PASOS was checked against the code on 2026-09-25. Two that
// are easy to overstate: only Viento y nieve reads the shared building
// (lib/edificio); Incendio reads the floors from Cargas por planta's
// publication, and Sismo reads neither yet.

import { Link } from 'react-router';
import { sectionEyebrow } from '../../constants';
import { Documento } from '../../../../features/obra/Entregables';
import './obra.css';

interface Paso {
  n: string;
  t: string;
  d: string;
}

const PASOS: Paso[] = [
  {
    n: '01',
    t: 'La obra',
    d: 'Cinco datos al crearla —denominación, municipio, provincia, altitud y uso— y los módulos los heredan: la zona de viento, la nieve y el sismo salen de ahí. Se guarda en un fichero .concreta.json que te llevas a otro ordenador o le pasas a un compañero, y se duplica para empezar la siguiente.',
  },
  {
    n: '02',
    t: 'Los módulos se hablan',
    d: 'Las plantas se declaran una vez, en Cargas por planta, y de ahí las leen Viento y nieve e Incendio. La nieve pasa de un módulo a otro, la resistencia al fuego llega al cuadro de materiales, y materiales, acciones y sismo acaban en la ficha del DB SE sin volver a teclearlos. La pantalla de la obra dice qué falta y te lleva a donde se resuelve.',
  },
  {
    n: '03',
    t: 'Lo que se entrega',
    d: 'Cada cálculo entra en el anejo desde su desplegable «Exportar» y se reabre en su módulo con sus datos. Salen tres documentos: la justificación del DB SE en Word y PDF, el anejo de cálculo en un PDF con portada e índice, y los cuadros del plano en un DXF y un Excel. Y los planos tipo del estudio —muros, encepados, micropilotes y vigas— rellenos en DXF.',
  },
];

const noop = () => {};

/** The panel's «Lo que se entrega» rail, as it looks with an obra ready to hand in. */
function EntregablesPreview() {
  return (
    <div className="obra-rail" inert aria-hidden="true">
      <div className="obra-rail-h">
        <span>Lo que se entrega</span>
        <span className="obra-rail-rule" />
      </div>
      <div className="obra-rail-docs">
        <Documento
          hoja="ficha"
          titulo="Justificación del DB SE"
          nota="La ficha ensamblada, en Word y PDF."
          estado="hecho"
          pie="lista para exportar"
          a="/memorias/db-se"
        />
        <Documento
          hoja="anejo"
          titulo="Anejo de cálculo"
          nota="14 capítulos · 63 páginas."
          estado="hecho"
          a="/proyecto/anejo"
        />
        <Documento
          hoja="plano"
          titulo="Cuadros para el plano"
          nota="Materiales, viento y nieve, cargas por planta e incendio. En un solo fichero."
          estado="hecho"
          pie="4 de 4 cuadros"
          onClick={noop}
          accion="Descargar el DXF"
        />
      </div>
    </div>
  );
}

export function ObraSection() {
  return (
    <section className="section" id="obra">
      <div className="container">
        <div className="section-head">
          <div>
            <div className="section-eyebrow">{sectionEyebrow('obra')}</div>
            <h2 className="section-title">
              Una obra entera,<br />no cálculos sueltos.
            </h2>
          </div>
          <p className="section-lede">
            Los módulos trabajan dentro de una obra: se pasan los datos y acaban
            en los documentos que se firman. La justificación del DB SE, el
            anejo de cálculo y los cuadros del plano salen de lo que ya has
            calculado.
          </p>
        </div>

        <div className="obra-layout">
          <ol className="obra-pasos">
            {PASOS.map((p) => (
              <li className="obra-paso" key={p.n}>
                <div className="obra-paso-n mono">{p.n}</div>
                <div>
                  <h3 className="obra-paso-t">{p.t}</h3>
                  <p className="obra-paso-d">{p.d}</p>
                </div>
              </li>
            ))}
          </ol>

          <figure className="obra-figure">
            <div className="obra-figure-frame dot-grid">
              <EntregablesPreview />
            </div>
            <figcaption className="obra-figure-cap">
              <span>
                La misma pieza que el panel de la obra: los tres documentos, con
                su estado y su camino.
              </span>
              <Link to="/obra" className="link-arrow">
                Abrir la pantalla de la obra →
              </Link>
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
