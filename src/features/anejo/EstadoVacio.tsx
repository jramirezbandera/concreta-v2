/**
 * El vacío que ENSEÑA el mecanismo (D1). No es un mensaje de «no hay nada»:
 * es el único sitio donde el usuario aprende que las piezas entran desde OTRO
 * sitio —el botón «Guardar en el anejo» de cada módulo—, que es justo lo que
 * nadie adivina. Las dos cabeceras de sección se mantienen; bajo cada una, de
 * dónde salen sus filas, con los enlaces.
 */

import { Link } from 'react-router';
import { getModuleByKey, moduleRegistry } from '../../data/moduleRegistry';

const ENLACE = 'text-accent hover:text-accent-hover underline-offset-2 hover:underline';
const TEXTO = 'm-0 px-3 py-3 text-[12.5px] leading-relaxed text-text-secondary';

function Modulo({ clave, texto }: { clave: string; texto: string }) {
  const entrada = getModuleByKey(clave);
  if (!entrada) return <>{texto}</>;
  return (
    <Link to={entrada.route} className={ENLACE}>
      {texto}
    </Link>
  );
}

export function VacioMemoria() {
  return (
    <p className={TEXTO}>
      Los capítulos aparecen aquí cuando guardas en el anejo el <Modulo clave="concreta-materiales" texto="cuadro de materiales" />,{' '}
      <Modulo clave="concreta-viento-nieve" texto="viento y nieve" />, las <Modulo clave="concreta-cargas-planta" texto="cargas por planta" />, el{' '}
      <Modulo clave="concreta-seismic" texto="sismo" /> o la <Modulo clave="concreta-memoria-dbse" texto="ficha DB SE" />: en cada uno, «Exportar» y luego
      «Guardar en el anejo». Cada uno es un capítulo, y guardarlo otra vez lo actualiza.
    </p>
  );
}

export function VacioPiezas() {
  return (
    <p className={TEXTO}>
      Los cálculos entran con el botón «Guardar en el anejo», desde el módulo donde los haces: exporta el PDF de la viga, el pilar o
      la zapata y, en la previsualización, guárdalo aquí. Cada vez que guardas se añade una pieza.
    </p>
  );
}

/**
 * «+ Añadir un cálculo guardado…»: el pie de la lista. No añade nada él mismo
 * —los cálculos se guardan desde su módulo—, así que despliega dónde ir.
 */
export function AnadirCalculo() {
  const grupos = Array.from(new Set(moduleRegistry.filter((m) => m.shipped).map((m) => m.group)));
  return (
    <details className="mt-2 px-3 py-2">
      <summary className="cursor-pointer list-none text-[12.5px] text-accent hover:text-accent-hover">+ Añadir un cálculo guardado…</summary>
      <p className="m-0 mt-2 text-[12px] leading-relaxed text-text-secondary">
        Abre el módulo, exporta su PDF y pulsa «Guardar en el anejo». La pieza aparece aquí, al final de su sección.
      </p>
      <ul className="m-0 mt-2 grid list-none grid-cols-1 gap-x-4 gap-y-0.5 p-0 sm:grid-cols-2">
        {grupos.flatMap((g) =>
          moduleRegistry
            .filter((m) => m.shipped && m.group === g)
            .map((m) => (
              <li key={m.key} className="text-[12px]">
                <span className="font-mono text-[10px] uppercase text-text-disabled" style={{ letterSpacing: '0.06em' }}>
                  {m.group}
                </span>{' '}
                <Link to={m.route} className={ENLACE}>
                  {m.label}
                </Link>
              </li>
            )),
        )}
      </ul>
    </details>
  );
}
