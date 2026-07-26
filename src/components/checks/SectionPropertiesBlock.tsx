// Bloque de propiedades del perfil — se pinta tras el veredicto y ANTES de
// "Valores" en vigas y pilares de acero. No es documentación secundaria: es
// material de trabajo al mismo nivel que las comprobaciones (dimensiones,
// peso, espesores, It/Iw para detallar la obra sin salir del flujo).
//
// Siempre visible, sin acordeón: esconder el prontuario detrás de un clic
// recrea el problema que el bloque resuelve.
//
// Markup de fila REPLICADO a propósito, no importado del barril de
// `components/checks`: el `ValueRow` del barril lleva `px-4` y su
// `GroupHeader` usa `px-4 tracking-widest`, así que reutilizarlos metería el
// bloque 16 px hacia dentro respecto a sus filas vecinas. Los dos módulos de
// acero definen sus propios helpers sin padding horizontal; estos coinciden
// con ellos. (Unificar los tres juegos es un refactor aparte.)

import type { SectionGeometry } from '../../lib/sections';
import { sectionPropertyRows, sectionHeaderLabel } from './sectionPropertyRows';

interface Props {
  section: SectionGeometry;
  /**
   * Panel estrecho (FEM 1D, ~280 px): una sola columna y SOLO el grupo
   * Geometría — 15 filas encima de la primera comprobación sepultarían el
   * veredicto, que es el propósito de ese panel. La regla vive aquí y no en
   * el call site para que exista en un solo sitio.
   */
  compact?: boolean;
}

function BlockHeader({ label }: { label: string }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-disabled pt-2.25 pb-1.75 border-b border-border-sub mb-1">
      {label}
    </p>
  );
}

function PropRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.75 border-b border-border-sub last:border-b-0">
      <span className="text-[12px] text-text-secondary">{label}</span>
      <span className="text-[11px] font-mono text-text-primary tabular-nums">{value}</span>
    </div>
  );
}

export function SectionPropertiesBlock({ section, compact = false }: Props) {
  const rows = sectionPropertyRows(section);
  const geomRows = rows.filter((r) => r.group === 'geom');
  const propRows = compact ? [] : rows.filter((r) => r.group === 'props');

  return (
    <section aria-label="Propiedades de la sección">
      <BlockHeader label={`Sección · ${sectionHeaderLabel(section)}`} />
      {/* Geometría en la primera columna, Propiedades en la segunda. El
          desbalanceo (5 vs 10 filas) es intencionado: no se reparten filas
          entre columnas para no romper la agrupación semántica. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6">
        <div className="flex flex-col">
          <BlockHeader label="Geometría" />
          {geomRows.map((r) => <PropRow key={r.label} label={r.label} value={r.value} />)}
        </div>
        {propRows.length > 0 && (
          <div className="flex flex-col">
            <BlockHeader label="Propiedades" />
            {propRows.map((r) => <PropRow key={r.label} label={r.label} value={r.value} />)}
          </div>
        )}
      </div>
    </section>
  );
}
