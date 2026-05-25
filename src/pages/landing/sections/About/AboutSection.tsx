// AboutSection.tsx — "Quién" teaser on the landing page. Author card.
// The full /about page lives at pages/About.tsx.

import { Link } from 'react-router';
import './about-section.css';

export function AboutSection() {
  return (
    <section className="section" id="about-teaser">
      <div className="container">
        <div className="about-wrap">
          <div className="about-copy">
            <div className="section-eyebrow">09 · Quién</div>
            <h2 className="section-title">Hecho por un arquitecto calculista.</h2>
            <p className="about-text">
              Concreta la escribe Javier Ramírez Bandera. Arquitecto,
              fundador de Alte Estudio, consultor de cálculo y docente del
              título propio de hormigón armado en la Universidad de Málaga.
              Concreta nace para resolver el cálculo del día a día que el
              software grande hace lento y el Excel hace inseguro.
            </p>
            <Link to="/about" className="btn">
              Sobre Concreta y Javier <span className="arr">→</span>
            </Link>
          </div>
          <div className="about-card">
            <div className="about-avatar dot-grid">
              <span className="mono dim">JR</span>
            </div>
            <div className="about-info">
              <div className="about-name">Javier Ramírez Bandera</div>
              <div className="about-role mono">FUNDADOR · ARQUITECTO CALCULISTA</div>
              <p className="about-bio">
                Arquitecto especializado en cálculo de estructuras, gestión
                inmobiliaria y peritaje judicial. Alte Estudio · Universidad de
                Málaga · Concreta.
              </p>
              <div className="about-links">
                <a className="dim mono" href="https://linkedin.com/in/javier-ram%C3%ADrez-bandera" target="_blank" rel="noreferrer">linkedin</a>
                <a className="dim mono" href="https://github.com/jramirezbandera" target="_blank" rel="noreferrer">github</a>
                <a className="dim mono" href="https://alteestudio.com" target="_blank" rel="noreferrer">alteestudio.com</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
