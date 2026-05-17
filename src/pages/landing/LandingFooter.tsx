// LandingFooter — site footer shared by the landing and the /normativa subpage.

import { Link } from 'react-router';

export function LandingFooter() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-inner">
          <div>
            <div className="brand" style={{ marginBottom: 12 }}>
              <span className="brand-dot" />
              <span>Concreta</span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: '32ch', margin: 0, lineHeight: 1.55 }}>
              Cálculo estructural para el día a día. Sin backend. Sin
              cuentas. Tus datos son tuyos.
            </p>
          </div>
          <div>
            <h6>Producto</h6>
            <ul>
              <li><Link to="/#modulos">Módulos</Link></li>
              <li><Link to="/#pricing">Precio</Link></li>
              <li><Link to="/normativa">Normativa</Link></li>
              <li><Link to="/#recursos">Demo</Link></li>
            </ul>
          </div>
          <div>
            <h6>Recursos</h6>
            <ul>
              <li><Link to="/#blog">Blog</Link></li>
              <li><Link to="/normativa">Documentación</Link></li>
              <li><Link to="/#recursos">Changelog</Link></li>
            </ul>
          </div>
          <div>
            <h6>Compañía</h6>
            <ul>
              <li><Link to="/about">Sobre Concreta</Link></li>
              <li><Link to="/#filosofia">Manifiesto</Link></li>
              <li><a href="mailto:hola@concreta.tools">Contacto</a></li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 Concreta · Javier Ramírez Bandera</span>
          <span>v0.4.2 · concreta.tools</span>
        </div>
      </div>
    </footer>
  );
}
