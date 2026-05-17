// About — dedicated /about route. The story behind Concreta, the manifesto,
// and the author. Ported from the Claude Design handoff (about.html).

import { Helmet } from 'react-helmet-async';
import { LandingNav } from './landing/LandingNav';
import { LandingFooter } from './landing/LandingFooter';
import './landing.css';
import './subpage.css';

const DESIGN_PRINCIPLES: [string, string][] = [
  ['Densidad sobre amplitud.', 'Más información por pixel, menos scroll.'],
  ['SVG vivo, no mockup.', 'Cada input redibuja la geometría.'],
  ['Dark theme intencional.', 'El SVG manda; el chrome desaparece.'],
  ['Artículo siempre visible.', 'CE art.42, no «comprobación 1».'],
  ['Sin backend.', 'Tus cálculos no son nuestros.'],
];

const MANIFESTO: { n: string; t: string; d: string }[] = [
  {
    n: '01 / VELOCIDAD',
    t: 'Velocidad antes que complejidad.',
    d: 'Resolvemos bien los casos comunes antes de cubrir casos raros. El 80% del trabajo de cálculo en edificación son las mismas seis o siete comprobaciones repetidas mil veces. Ese 80% es nuestro territorio.',
  },
  {
    n: '02 / CLARIDAD',
    t: 'Claridad antes que densidad.',
    d: 'Explicamos sin abrumar. Un valor numérico, su unidad junto a él, el artículo de norma como referencia discreta. Sin tooltips redundantes. Si algo es importante, está visible. Si no lo es, no está.',
  },
  {
    n: '03 / VISUAL',
    t: 'Visual antes que textual.',
    d: 'El SVG es el protagonista. Sección, perfil, deformada, envolvente. Todo se redibuja con cada input en tiempo real, sobre un canvas dot-grid que evoca el papel milimetrado de la mesa de trabajo. El cálculo es la geometría.',
  },
  {
    n: '04 / RIGOR',
    t: 'Rigor sin opacidad.',
    d: 'Cada comprobación cita el artículo normativo que la respalda. El detalle del cálculo está a un clic: fórmula, valores intermedios, factor de seguridad, conclusión. Pensado para defender el resultado ante visado, dirección facultativa o un perito.',
  },
  {
    n: '05 / SOBERANÍA',
    t: 'Sin backend, sin cuentas.',
    d: 'Concreta funciona como PWA local. Tus cálculos viven en tu navegador. Los enlaces compartibles son estado serializado en la URL — no pasan por nuestros servidores. Sólo guardamos tu email para la facturación de la suscripción.',
  },
];

const AUTHOR_LINKS: { kind: string; label: string; href: string }[] = [
  { kind: 'web', label: 'alteestudio.com', href: 'https://alteestudio.com' },
  { kind: 'linkedin', label: '/in/javier-ramírez-bandera', href: 'https://linkedin.com/in/javier-ram%C3%ADrez-bandera' },
  { kind: 'github', label: 'jramirezbandera', href: 'https://github.com/jramirezbandera' },
  { kind: 'email', label: 'hola@concreta.tools', href: 'mailto:hola@concreta.tools' },
];

const CV: { org: string; role: string; desc: string }[] = [
  {
    org: 'Alte Estudio',
    role: 'ARQUITECTO FUNDADOR',
    desc: 'Proyectos de obra nueva, legalizaciones, dirección de obra y peritaje judicial en la provincia de Málaga.',
  },
  {
    org: 'Consultoría estructural',
    role: 'CÁLCULO Y VERIFICACIÓN NORMATIVA',
    desc: 'CTE, EHE-08, NCSE-02, Eurocódigos. Para estudios de arquitectura e ingeniería.',
  },
  {
    org: 'Universidad de Málaga',
    role: 'DOCENTE · 5 ECTS',
    desc: 'Título propio «Introducción al cálculo de hormigón armado en edificación».',
  },
  {
    org: 'Concreta',
    role: 'FUNDADOR Y DESARROLLADOR',
    desc: 'Aplicación web para comprobaciones estructurales bajo normativa española y europea.',
  },
];

export function About() {
  return (
    <div className="landing-root">
      <Helmet>
        <title>Sobre Concreta — Filosofía y autor</title>
        <meta
          name="description"
          content="La filosofía detrás de Concreta, la historia de por qué nació y quién está detrás de cada commit. Una mesa de trabajo para el calculista, no un dashboard."
        />
      </Helmet>

      <LandingNav />

      <section className="subpage-hero">
        <div className="container subpage-hero-inner">
          <div className="subpage-eyebrow">09 · Sobre Concreta</div>
          <h1 className="subpage-title">Una mesa de trabajo. No un dashboard.</h1>
          <p className="subpage-lede">
            Concreta es la herramienta que llevaba años queriendo tener encima
            de la mesa cuando calculaba edificios. Esta es la filosofía detrás,
            la historia de por qué nació y quién está detrás de cada commit.
          </p>
        </div>
      </section>

      <main className="subpage-body">
        <div className="container">

          {/* La historia */}
          <section className="about-section">
            <h2 className="subsec-title">La historia</h2>
            <div className="about-story">
              <div>
                <p>
                  Trabajo el día a día de un estudio en Málaga: proyectos de
                  obra nueva, legalizaciones, dirección de obra, peritajes
                  judiciales. Y, en paralelo, consultoría de cálculo para otros
                  estudios de arquitectura e ingeniería.
                </p>
                <p>
                  Durante años, el software disponible se dividía en dos
                  categorías: suites monolíticas que requieren una semana para
                  configurar un edificio sencillo, y SaaS bonitos construidos
                  para normas que no son la española.
                </p>
                <p>
                  El día a día del calculista en España es otro: una viga de un
                  voladizo, un pilar metálico que reemplaza un muro portante,
                  una zapata aislada de un anejo, un muro de contención del
                  sótano. Casos concretos, normativa concreta (CE, CTE), tiempo
                  concreto: minutos, no horas.
                </p>
                <p>
                  Concreta es la herramienta para ese día a día. Un instrumento
                  de precisión, no un ecosistema. Y, sobre todo, defendible:
                  cada comprobación lleva el artículo de norma que la respalda.
                </p>
              </div>
              <div className="card about-principles">
                <div className="about-principles-h mono">PRINCIPIOS DE DISEÑO</div>
                <ul className="about-principles-list">
                  {DESIGN_PRINCIPLES.map(([strong, rest]) => (
                    <li key={strong}>
                      <span><strong>{strong}</strong> {rest}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          {/* El manifiesto */}
          <section className="about-section" id="manifiesto">
            <h2 className="subsec-title">El manifiesto</h2>
            <p className="subsec-lede">Los cinco principios que filtran cada decisión de producto.</p>
            <ol className="manifesto-list">
              {MANIFESTO.map((m) => (
                <li className="manifesto-item" key={m.n}>
                  <div className="manifesto-n">{m.n}</div>
                  <div>
                    <h3 className="manifesto-t">{m.t}</h3>
                    <p className="manifesto-d">{m.d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {/* El autor */}
          <section className="about-section">
            <h2 className="subsec-title">El autor</h2>
            <p className="subsec-lede">Concreta es una empresa de una persona. Eso es intencional.</p>
            <div className="author-block">
              <div className="author-side">
                <div className="author-avatar dot-grid">
                  <span className="mono">JR</span>
                </div>
                <div>
                  <div className="author-name">Javier Ramírez Bandera</div>
                  <div className="author-role mono">FUNDADOR · ARQUITECTO CALCULISTA</div>
                  <div className="author-location mono dim">MÁLAGA, ESPAÑA</div>
                </div>
                <div className="author-links">
                  {AUTHOR_LINKS.map((l) => (
                    <a
                      key={l.kind}
                      href={l.href}
                      className="author-link"
                      {...(l.href.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})}
                    >
                      <span className="mono dim">{l.kind}</span>
                      <span>{l.label}</span>
                    </a>
                  ))}
                </div>
              </div>
              <div className="author-body">
                <p className="author-intro">
                  Arquitecto especializado en cálculo de estructuras, gestión
                  inmobiliaria y peritaje judicial. Combino la práctica de
                  estudio con la consultoría técnica a otros profesionales del
                  sector y el desarrollo de herramientas digitales para la
                  edificación.
                </p>
                <h4 className="author-cv-h">EXPERIENCIA</h4>
                {CV.map((c) => (
                  <div className="cv-item" key={c.org}>
                    <div className="cv-org">{c.org}</div>
                    <div className="cv-role mono">{c.role}</div>
                    <p className="cv-desc">{c.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Licencia y valores */}
          <section className="about-section">
            <h2 className="subsec-title">Licencia y valores</h2>
            <div className="about-values">
              <div className="card card-pad">
                <div className="about-value-tag mono">SOFTWARE PRIVATIVO</div>
                <h3 className="about-value-title">Suscripción profesional.</h3>
                <p className="about-value-desc">
                  Concreta es software propietario distribuido por suscripción
                  mensual. Tu cuenta te da acceso al producto y a las
                  actualizaciones normativas mientras la mantengas activa.
                </p>
              </div>
              <div className="card card-pad">
                <div className="about-value-tag mono">RGPD · DATOS</div>
                <h3 className="about-value-title">Tu cálculo, tu navegador.</h3>
                <p className="about-value-desc">
                  No usamos tracking de terceros. No vendemos datos. La única
                  cookie es la de sesión. Las facturas se guardan, los cálculos
                  no.
                </p>
              </div>
            </div>
          </section>

        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
