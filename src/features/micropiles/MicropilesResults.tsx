import { type MicropilesResult } from '../../lib/calculations/micropiles';
import { type MicropilesInputs } from '../../data/defaults';
import { VerdictBadge, CheckRowItem, GroupHeader, ValueRow, overallStatus, ambientStyle } from '../../components/checks';

interface MicropilesResultsProps {
  result: MicropilesResult;
  inp: MicropilesInputs;
}

const fmt2 = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt3 = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export function MicropilesResults({ result, inp }: MicropilesResultsProps) {
  if (!result.valid) {
    return (
      <div className="flex items-center justify-center h-24 rounded border border-state-fail/30 bg-state-fail/5">
        <p className="text-[12px] text-state-fail text-center px-3">{result.error ?? 'Datos inválidos'}</p>
      </div>
    );
  }

  const allStatus = overallStatus(result.checks);

  const shaftChecks   = result.checks.filter((c) => ['hund-theoretical', 'hund-empirical'].includes(c.id));
  const topChecks     = result.checks.filter((c) => ['tope-compression', 'tope-tension', 'pullout', 'buckling'].includes(c.id));
  const bendingShear  = result.checks.filter((c) => ['bending', 'shear'].includes(c.id));
  const otherChecks   = result.checks.filter((c) => ['welding-throat', 'settlement-granular'].includes(c.id));

  return (
    <div className="flex flex-col gap-4" aria-label="Resultados">

      {/* Veredicto global */}
      <div className="rounded px-4 py-3" style={ambientStyle(allStatus)}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled">
            Resultados calculados
          </span>
          <VerdictBadge status={allStatus} />
        </div>
      </div>

      {/* Geometría */}
      <div className="rounded border border-border-main px-4 py-3">
        <GroupHeader label="Geometría" />
        <ValueRow label="L (longitud bajo encepado)" value={`${fmt2(result.length)} m`} />
        <ValueRow label="Discretización" value={`${result.nSegments} × ${fmt2(result.segmentLength)} m`} />
        <ValueRow label="Dn (perforación)" value={`${inp.drillDiameter.toFixed(0)} mm`} />
      </div>

      {/* Hundimiento por fuste */}
      <div className="rounded border border-border-main px-4 py-3">
        <GroupHeader label="Hundimiento por fuste" />
        <ValueRow label="Rfc,d teórico"   value={`${fmt2(result.RfcTheoretical)} kN`} />
        <ValueRow label="Rfc,d empírico"  value={`${fmt2(result.RfcEmpirical)} kN`} />
        <ValueRow label="Rfc,d adoptado"  value={`${fmt2(result.RfcAdopted)} kN (${inp.method === 'theoretical' ? 'teórico' : 'empírico'})`} />
        {shaftChecks.map((c) => <CheckRowItem key={c.id} check={c} />)}
      </div>

      {/* Tope estructural */}
      <div className="rounded border border-border-main px-4 py-3">
        <GroupHeader label="Tope estructural" />
        <ValueRow label="d total (bulbo)"       value={`${fmt2(result.dTotal)} mm`} />
        <ValueRow
          label="r (recubrimiento)"
          value={`${fmt2(result.coverAdopted)} mm · ${inp.coverManualOverride ? 'manual' : 'auto'}`}
        />
        <ValueRow label="As,y (bruta)"          value={`${fmt2(result.As_y)} mm²`} />
        <ValueRow label="As,d (efectiva)"       value={`${fmt2(result.As_d)} mm² (re=${fmt2(result.re)} mm)`} />
        <ValueRow label="Fc,h (hormigón)"       value={`${fmt2(result.Fc_h)} kN`} />
        <ValueRow label="Fa,h (acero)"          value={`${fmt2(result.Fa_h)} kN`} />
        <ValueRow
          label="CR (pandeo)"
          value={`${fmt2(result.crAdopted)} · ${inp.crManualOverride ? 'manual' : 'auto'}`}
        />
        <ValueRow label="R (pandeo)"            value={fmt3(result.R)} />
        {result.crGoverning && (
          <ValueRow label="Gobierna" value={result.crGoverning} />
        )}
        {result.crHypotheses.length > 0 && (
          // Severidad: los avisos (fuera de tabla, inestable, correlación) en
          // ámbar para que el proyectista no se los pierda; las notas normales
          // en text-secondary (legible, no el text-disabled de chrome). Diseño
          // review 2026-06-02 — extensión intencional del color de estado a avisos.
          <ul className="mt-1 mb-2 flex flex-col gap-1">
            {result.crHypotheses.map((h, i) => (
              <li
                key={i}
                className={`text-[10px] leading-snug ${h.level === 'warn' ? 'text-state-warn' : 'text-text-secondary'}`}
              >
                {h.level === 'warn' ? '⚠ ' : ''}{h.text}
              </li>
            ))}
          </ul>
        )}
        <ValueRow label="Fe (ejecución)"        value={fmt2(result.Fe)} />
        <ValueRow label="Nc,rd"                 value={`${fmt2(result.Nc_rd)} kN`} />
        {inp.effort !== 'compression' && (
          <ValueRow label="Tc,rd"               value={`${fmt2(result.Tc_rd)} kN`} />
        )}
        {topChecks.map((c) => <CheckRowItem key={c.id} check={c} />)}
      </div>

      {/* Conexión con encepado */}
      <div className="rounded border border-border-main px-4 py-3">
        <GroupHeader label="Conexión con encepado" />
        <ValueRow label="he (altura encepado)"  value={`${fmt2(result.he)} cm`} />
        <ValueRow label="hp (penetración tubular)" value={`${fmt2(result.hp)} cm`} />
        <ValueRow label="bc (anchura chapa)"    value={`${fmt2(result.bc)} cm`} />
        <ValueRow label="t (espesor chapa)"     value={`${fmt2(result.t_chapa)} mm`} />
        <ValueRow label="eg (garganta)"         value={`${result.eg} mm`} />
        {otherChecks
          .filter((c) => c.id === 'welding-throat')
          .map((c) => <CheckRowItem key={c.id} check={c} />)}
      </div>

      {/* Empujes horizontales */}
      <div className="rounded border border-border-main px-4 py-3">
        <GroupHeader label="Empujes horizontales" />
        <ValueRow label="Le (long. elástica)"     value={`${fmt2(result.Le)} m`} />
        <ValueRow label="Lef (long. ficticia)"    value={`${fmt2(result.Lef)} m`} />
        <ValueRow label="Mpl,rd"                  value={`${fmt2(result.Mpl_rd)} kNm`} />
        <ValueRow label="Vpl,rd"                  value={`${fmt2(result.Vpl_rd)} kN`} />
        {bendingShear.map((c) => <CheckRowItem key={c.id} check={c} />)}
      </div>

      {/* Asientos estimados */}
      <div className="rounded border border-border-main px-4 py-3">
        <GroupHeader label="Asientos estimados" />
        <ValueRow label="Asiento granular"  value={`${fmt2(result.settlementGranular)} mm`} />
        <ValueRow label="Asiento cohesivo"  value={`${fmt2(result.settlementCohesive)} mm`} />
        {otherChecks
          .filter((c) => c.id === 'settlement-granular')
          .map((c) => <CheckRowItem key={c.id} check={c} />)}
      </div>

      {/* Disposición en planta (informativo — Concreta calcula un solo pilote) */}
      <div className="rounded border border-border-main px-4 py-3">
        <GroupHeader label="Disposición en planta" />
        <ValueRow label={`Separación mínima (2D)`}        value={`${fmt2(result.spacingMin * 100)} cm`} />
        <ValueRow label={`Separación máxima (min 5D, 1 m)`} value={`${fmt2(result.spacingMaxRec * 100)} cm`} />
        <ValueRow label={`Sin efecto grupo (S ≥ 4D)`}     value={`${fmt2(result.spacingForNoGroup * 100)} cm`} />
        <p className="text-[11px] text-text-secondary mt-2 leading-relaxed">
          Concreta calcula un pilote individual. Si en el encepado hay más de
          uno, mantén separación entre ejes <span className="text-text-primary font-mono">S ≥ {fmt2(result.spacingForNoGroup * 100)} cm</span>
          {' '}para evitar el coeficiente <span className="font-mono">g</span> de la Tabla 3.10 (S = 3D-4D).
          {' '}Para S menor que ese valor el cálculo individual queda del lado de la inseguridad
          y habría que minorar la capacidad del grupo (no implementado).
        </p>
        <p className="text-[10px] text-text-disabled mt-1">Guía Fomento §3.10 / Fig. 3.6 / Tabla 3.10</p>
      </div>

    </div>
  );
}
