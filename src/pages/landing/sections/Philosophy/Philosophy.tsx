// Philosophy.tsx — five product principles + competitor comparison table.

import './philosophy.css';

const PRINCIPLES = [
  { n: '01', t: 'Velocidad antes que complejidad', d: 'Resolvemos bien lo común. El edge case raro vive en otra herramienta.' },
  { n: '02', t: 'Claridad antes que densidad', d: 'Explicamos sin abrumar. Un valor, su unidad, su artículo.' },
  { n: '03', t: 'Visual antes que textual', d: 'El SVG es el protagonista. La sección, el perfil, la deformada. En vivo.' },
  { n: '04', t: 'Rigor sin opacidad', d: 'Cada comprobación cita el artículo. El detalle siempre está a un clic.' },
  { n: '05', t: 'Sin backend, sin cuentas', d: 'PWA local. Tus cálculos viven en tu navegador. Tus datos son tuyos.' },
];

const COMPARE_ROWS: [string, boolean, boolean, boolean, boolean][] = [
  ['Norma española primero (CE, CTE)', true, false, false, false],
  ['Artículo CE/CTE visible por check', true, false, false, false],
  ['PWA sin cuenta, sin backend', true, false, false, false],
  ['Enlaces compartibles del cálculo', true, false, false, true],
  ['Sin licencia anual cuatro cifras', true, false, true, true],
  ['Curva de aprendizaje en minutos', true, false, true, true],
  ['Modelado global 3D del edificio', false, true, false, false],
];

export function PhilosophySection() {
  return (
    <section className="section" id="filosofia">
      <div className="container">
        <div className="section-head">
          <div>
            <div className="section-eyebrow">04 · Filosofía</div>
            <h2 className="section-title">
              Un instrumento de precisión.<br />No un SaaS más.
            </h2>
          </div>
          <p className="section-lede">
            Cinco principios que filtran cada decisión de producto. Sirven
            tanto para escoger una funcionalidad como para descartarla.
          </p>
        </div>

        <div className="principles">
          {PRINCIPLES.map((p) => (
            <div className="principle" key={p.n}>
              <div className="principle-n mono">{p.n}</div>
              <div className="principle-t">{p.t}</div>
              <div className="principle-d">{p.d}</div>
            </div>
          ))}
        </div>

        <div className="philo-compare">
          <div className="philo-compare-intro">
            <h3 className="philo-compare-title">No competimos con CYPE. Competimos en tu día a día.</h3>
            <p className="philo-compare-lede">
              Concreta no reemplaza una suite global de modelado. Reemplaza
              la calculadora, el Excel improvisado y la libreta cuando hay
              que justificar una viga, un pilar o una zapata aislada con
              norma española en quince minutos.
            </p>
          </div>

          <div className="table-scroll">
            <table className="vs-table">
              <thead>
                <tr>
                  <th aria-hidden="true" />
                  <th className="vs-mine">
                    <span className="brand-dot" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 6 }} />
                    Concreta
                  </th>
                  <th>CYPE</th>
                  <th>SkyCiv</th>
                  <th>ClearCalcs</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map(([feat, ...vals], i) => (
                  <tr key={i}>
                    <td className="vs-feat">{feat}</td>
                    {vals.map((v, j) => (
                      <td key={j} className={`vs-cell ${j === 0 ? 'vs-mine' : ''}`}>
                        {v ? <span className="vs-check">✓</span> : <span className="vs-dash">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="vs-note mono dim">
            / honesta: usamos las suites grandes para los proyectos que las requieren. Pero no las usamos para una zapata aislada de un anejo.
          </p>
        </div>
      </div>
    </section>
  );
}
