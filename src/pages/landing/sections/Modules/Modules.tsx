// Modules.tsx — full module library grid on the landing page, grouped by family.

import { Link } from 'react-router';
import { MODULE_LIBRARY, esNuevo, type ModuleEntry } from '../../modules';
import { sectionEyebrow } from '../../constants';
import './modules.css';

// Read once per page load: the badge is a property of the day, not of a render.
const HOY = new Date();

function ModuleCard({ m }: { m: ModuleEntry }) {
  return (
    <Link className="mod-card" to={m.route}>
      <div className="mod-card-icon">{m.icon}</div>
      <div className="mod-card-body">
        <div className="mod-card-head">
          <span className="mod-card-name">
            {m.name}
            {esNuevo(m.alta, HOY) && <span className="mod-card-new mono">NUEVO</span>}
          </span>
          <span className="mod-card-ref mono">{m.ref}</span>
        </div>
        <p className="mod-card-desc">{m.short}</p>
      </div>
    </Link>
  );
}

export function ModulesSection() {
  const groups: { label: string; items: ModuleEntry[] }[] = [];
  MODULE_LIBRARY.forEach((m) => {
    const last = groups[groups.length - 1];
    if (last && last.label === m.group) last.items.push(m);
    else groups.push({ label: m.group, items: [m] });
  });

  return (
    <section className="section" id="modulos">
      <div className="container">
        <div className="section-head">
          <div>
            <div className="section-eyebrow">{sectionEyebrow('modulos')}</div>
            <h2 className="section-title">Todos los módulos implementados.</h2>
          </div>
          <p className="section-lede">
            Cada módulo resuelve un caso concreto del día a día con su norma
            correspondiente: las memorias y las acciones de la obra, hormigón,
            acero, cimentación, rehabilitación, madera, FEM para vigas y
            pórticos, y geotecnia. Sigue creciendo cada mes.
          </p>
        </div>

        <div className="mod-groups">
          {groups.map((g) => (
            <div className="mod-group" key={g.label}>
              <div className="mod-group-h mono">
                <span className="mod-group-label">{g.label}</span>
                <span className="mod-group-count dim">{g.items.length} módulos</span>
              </div>
              <div className="mod-grid">
                {g.items.map((m) => <ModuleCard m={m} key={m.id} />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
