import { useMemo } from 'react';
import { Link } from 'react-router';
import { type RetainingWallResult } from '../../lib/calculations/retainingWall';
import { type RetainingWallInputs } from '../../data/defaults';
import { slopeModelFromRetaining, FOUNDATION_PLACEHOLDER } from '../../lib/calculations/geotech/slopePrefill';
import { buildShareUrl } from '../slope-stability/serialize';
import { VerdictBadge, CheckRowItem, GroupHeader, ValueRow, overallStatus, ambientStyle } from '../../components/checks';
import { resultLabel } from '../../lib/text/labels';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import { formatQuantity, formatNumber, getUnitLabel } from '../../lib/units/format';
import type { Quantity } from '../../lib/units/types';

interface RetainingWallResultsProps {
  result: RetainingWallResult;
  inp: RetainingWallInputs;
}

export function RetainingWallResults({ result, inp }: RetainingWallResultsProps) {
  const { system } = useUnitSystem();
  const fmtSi = (v: number, q: Quantity, precision = 2) => formatQuantity(v, q, system, { precision });
  // Momento por metro de muro: el factor de conversión es el de 'moment'; el
  // sufijo "/m" se añade a la etiqueta (la longitud no convierte).
  const fmtMomPerM = (v: number) => `${formatNumber(v, 'moment', system, 1)} ${getUnitLabel('moment', system)}/m`;

  // Enlace a Taludes con el modelo prefabricado. Sólo se ofrece si el muro ya
  // cumple sus propias comprobaciones: la idealización de sólido rígido (que es
  // lo que permite excluirlo del dominio de rotura) no está justificada en un
  // muro que todavía falla por dentro o como conjunto.
  // Va ANTES del guard de `result.valid` — regla de hooks.
  const slopeHref = useMemo(() => {
    if (!result.valid || overallStatus(result.checks) === 'fail') return null;
    const model = slopeModelFromRetaining(inp);
    return model ? buildShareUrl(model, '/geotec/taludes') : null;
  }, [inp, result]);

  if (!result.valid) {
    return (
      <div className="flex items-center justify-center h-24 rounded border border-state-fail/30 bg-state-fail/5">
        <p className="text-[12px] text-state-fail text-center px-3">{result.error ?? 'Datos inválidos'}</p>
      </div>
    );
  }

  const allStatus = overallStatus(result.checks);

  // Partition checks by group
  const stabilityChecks = result.checks.filter((c) =>
    ['vuelco', 'deslizamiento', 'excentricidad', 'sigma-max', 'sigma-min'].includes(c.id),
  );
  const seismicChecks = result.checks.filter((c) =>
    ['vuelco-sismico', 'deslizamiento-sismico'].includes(c.id),
  );
  const fusteChecks = result.checks.filter((c) =>
    ['fuste-bending', 'fuste-shear', 'fuste-asmin', 'fuste-asmin-ext', 'fuste-asmin-h'].includes(c.id),
  );
  const talonChecks = result.checks.filter((c) =>
    ['talon-bending', 'talon-asmin'].includes(c.id),
  );
  const puntaChecks = result.checks.filter((c) =>
    ['punta-bending', 'punta-asmin'].includes(c.id),
  );
  // El motor emite `zapata-asmin-trans-INF` y `-SUP`; este panel filtraba por
  // 'zapata-asmin-trans' a secas, un id que no existe → las DOS filas se
  // quedaban fuera de la pantalla mientras el veredicto de arriba (que mira
  // `result.checks` entero) sí las contaba. Con los defaults del módulo y
  // cualquier transversal por debajo de Ø12@200 incumplen hasta el 337%.
  // Van en grupo propio: el armado transversal recorre toda la zapata, no es
  // ni talón ni punta.
  const zapataTransChecks = result.checks.filter((c) =>
    ['zapata-asmin-trans-inf', 'zapata-asmin-trans-sup'].includes(c.id),
  );
  const globalChecks = result.checks.filter((c) => c.id === 'estabilidad-global');
  const structuralMissing = fusteChecks.length === 0;

  // Red de seguridad: lo que el motor añada y este panel no coloque se pinta
  // igual al final. Va FUERA del guard de `structuralMissing` a propósito.
  // OJO: todo grupo nuevo debe entrar aquí, o su check se pinta DOS veces (en
  // su bloque y otra vez en «Otras comprobaciones»).
  const placed = new Set([
    ...stabilityChecks, ...seismicChecks, ...fusteChecks,
    ...talonChecks, ...puntaChecks, ...zapataTransChecks, ...globalChecks,
  ].map((c) => c.id));
  const unplaced = result.checks.filter((c) => !placed.has(c.id));

  return (
    <div className="flex flex-col gap-4" aria-label="Resultados">

      {/* Overall verdict */}
      <div className="rounded px-4 py-3" style={ambientStyle(allStatus)}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled">
            Resultados calculados
          </span>
          <VerdictBadge status={allStatus} />
        </div>
      </div>

      {/* Sizing-mode banner — shown when no rebar is specified */}
      {result.valid && fusteChecks.length > 0 &&
        result.As_prov_fv_int === 0 && result.As_prov_fv_ext === 0 && result.As_prov_fh === 0 &&
        result.As_prov_zs === 0 && result.As_prov_zi === 0 &&
        result.As_prov_zt_inf === 0 && result.As_prov_zt_sup === 0 && (
        <div className="rounded border border-accent/30 bg-accent/5 px-4 py-3">
          <p className="text-[12px] text-accent leading-relaxed">
            <span className="font-semibold">Modo diseño:</span>{' '}
            Introduce el armado en el panel de datos para verificar As,prov ≥ As,req.
          </p>
        </div>
      )}

      {/* seismicUnstable warning banner */}
      {result.seismicUnstable && (
        <div className="rounded border border-amber-500/40 bg-amber-500/5 px-4 py-3">
          <p className="text-[12px] text-amber-400 leading-relaxed">
            <span className="font-semibold">Terreno inestable bajo sismo:</span>{' '}
            φeff = 0 (θ &gt; φ). Condición conservadora (near-collapse). Reducir kh o aumentar φ.
          </p>
        </div>
      )}

      {/* Key values */}
      <div className="rounded border border-border-main px-4 py-3">
        <GroupHeader label="Valores geotécnicos" />
        <ValueRow label={resultLabel('Ka_coulomb')}  value={result.Ka.toFixed(4)} />
        {result.kh_derived > 0 && (
          <>
            <ValueRow label={resultLabel('kh_seismic')} value={result.kh_derived.toFixed(3)} />
            <ValueRow label={resultLabel('kv_seismic')} value={result.kv_derived.toFixed(3)} />
          </>
        )}
        {result.KAD !== undefined && (
          <ValueRow label={resultLabel('K_AE')}      value={result.KAD.toFixed(4)} />
        )}
        <ValueRow label="EAH total"             value={fmtSi(result.EAH_total, 'linearLoad')} />
        {result.EW !== undefined && (
          <ValueRow label="EW (hidráulica)"      value={fmtSi(result.EW, 'linearLoad')} />
        )}
        <ValueRow label="ΣV"                    value={fmtSi(result.ΣV, 'linearLoad')} />
        <ValueRow label="e (excentricidad)"     value={`${result.e.toFixed(3)} m`} />
        <ValueRow label={resultLabel('sigma_max')} value={fmtSi(result.sigma_max, 'soilPressure', 3)} />
        <ValueRow label={resultLabel('sigma_min')} value={fmtSi(result.sigma_min, 'soilPressure', 3)} />

        {fusteChecks.length > 0 && (
          <>
            <GroupHeader label="Valores estructurales" />
            <ValueRow label="MEd fuste"         value={fmtMomPerM(result.MEd_fuste)} />
            <ValueRow label="As,req fuste"      value={result.As_req_fuste === Infinity ? '∞ (sobre-armado)' : `${result.As_req_fuste.toFixed(0)} mm²/m`} />
            <ValueRow label="As,min fuste"      value={`${result.As_min_fuste.toFixed(0)} mm²/m`} />
            <ValueRow label="MEd talón"         value={fmtMomPerM(result.MEd_talon)} />
            <ValueRow label="As,req talón"      value={result.As_req_talon === Infinity ? '∞ (sobre-armado)' : `${result.As_req_talon.toFixed(0)} mm²/m`} />
            <ValueRow label="As,min talón"      value={`${result.As_min_talon.toFixed(0)} mm²/m`} />
            <ValueRow label="MEd punta"         value={fmtMomPerM(result.MEd_punta)} />
            <ValueRow label="As,req punta"      value={result.As_req_punta === Infinity ? '∞ (sobre-armado)' : `${result.As_req_punta.toFixed(0)} mm²/m`} />
            <ValueRow label="As,min punta"      value={`${result.As_min_punta.toFixed(0)} mm²/m`} />
          </>
        )}
        {fusteChecks.length > 0 && (result.As_prov_fv_int > 0 || result.As_prov_zs > 0 || result.As_prov_zi > 0 || result.As_prov_zt > 0) && (
          <>
            <GroupHeader label="Armado verificado" />
            {result.As_prov_fv_int > 0 && (
              <ValueRow
                label="Trasdós fuste"
                value={`Ø${inp.diam_fv_int} c/${inp.sep_fv_int} (${Math.round(result.As_prov_fv_int)} mm²/m)`}
              />
            )}
            {result.As_prov_fv_ext > 0 && (
              <ValueRow
                label="Intradós fuste"
                value={`Ø${inp.diam_fv_ext} c/${inp.sep_fv_ext} (${Math.round(result.As_prov_fv_ext)} mm²/m)`}
              />
            )}
            {result.As_prov_fh > 0 && (
              <ValueRow
                label="Horizontal fuste"
                value={`Ø${inp.diam_fh} c/${inp.sep_fh} (${Math.round(result.As_prov_fh)} mm²/m)`}
              />
            )}
            {result.As_prov_zs > 0 && (
              <ValueRow
                label="Superior zapata"
                value={`Ø${inp.diam_zs} c/${inp.sep_zs} (${Math.round(result.As_prov_zs)} mm²/m)`}
              />
            )}
            {result.As_prov_zi > 0 && (
              <ValueRow
                label="Inferior zapata"
                value={`Ø${inp.diam_zi} c/${inp.sep_zi} (${Math.round(result.As_prov_zi)} mm²/m)`}
              />
            )}
            {result.As_prov_zt_inf > 0 && (
              <ValueRow
                label="Transv. inf. zapata"
                value={`Ø${inp.diam_zt_inf} c/${inp.sep_zt_inf} (${Math.round(result.As_prov_zt_inf)} mm²/m)`}
              />
            )}
            {result.As_prov_zt_sup > 0 && (
              <ValueRow
                label="Transv. sup. zapata"
                value={`Ø${inp.diam_zt_sup} c/${inp.sep_zt_sup} (${Math.round(result.As_prov_zt_sup)} mm²/m)`}
              />
            )}
          </>
        )}
      </div>

      {/* Stability checks */}
      <div className="rounded border border-border-main px-4 py-3">
        <GroupHeader label="Estabilidad (ELS geotécnico)" />
        {stabilityChecks.map((c) => <CheckRowItem key={c.id} check={c} />)}
      </div>

      {/* Seismic checks */}
      {seismicChecks.length > 0 && (
        <div className="rounded border border-border-main px-4 py-3">
          <GroupHeader label="Sísmico (Mononobe-Okabe)" />
          {seismicChecks.map((c) => <CheckRowItem key={c.id} check={c} />)}
        </div>
      )}

      {/* Estabilidad global → módulo Taludes */}
      {globalChecks.length > 0 && (
        <div className="rounded border border-border-main px-4 py-3">
          <GroupHeader label="Estabilidad global" />
          {globalChecks.map((c) => <CheckRowItem key={c.id} check={c} />)}
          {slopeHref ? (
            <div className="text-[11px] text-text-disabled mt-1.5 leading-relaxed flex flex-col gap-1.5">
              <p>
                El fallo global (superficie que engloba muro y cimiento) se analiza por equilibrio
                límite.{' '}
                <Link to={slopeHref} className="text-accent hover:underline">
                  Abrir en Taludes con el modelo preparado
                </Link>
                : se trasladan geometría, nivel freático y sobrecarga, y el muro se excluye del
                dominio de rotura como sólido rígido — las superficies pasan por debajo de la
                zapata, que es el mecanismo global real.
              </p>
              <p className="text-state-warn">
                Revisa el estrato de cimentación antes de calcular: va con un valor genérico
                (φ′ = {FOUNDATION_PLACEHOLDER.phi}°, c′ = {FOUNDATION_PLACEHOLDER.c} kPa) porque
                este módulo no pide los parámetros del terreno. Es el dato que gobierna el resultado.
              </p>
              <p>
                Cribado aproximado: el modelo sustituye el hormigón por relleno
                (φ = {inp.phi}°), lo que altera fuerzas estabilizadoras y desestabilizadoras a la
                vez. No es una comprobación conservadora por construcción.
              </p>
              {result.kh_derived > 0 && (
                <p>
                  El modelo sale estático: la estabilidad global sísmica no se comprueba en Taludes.
                </p>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-text-disabled mt-1.5 leading-relaxed">
              Resuelve primero las comprobaciones del propio muro. Tratarlo como sólido rígido en
              el análisis global sólo está justificado cuando su estabilidad interna y de conjunto
              ya cumple.
            </p>
          )}
        </div>
      )}

      {/* Structural checks — or guard notice */}
      {structuralMissing ? (
        <div className="rounded border border-state-fail/40 px-4 py-3">
          <p className="text-[12px] text-state-fail leading-relaxed">
            <span className="font-semibold">Excentricidad excesiva (e ≥ B/3):</span>{' '}
            Resultante fuera de la zapata. Revisión geométrica necesaria — comprobaciones estructurales omitidas.
          </p>
        </div>
      ) : (
        <>
          {fusteChecks.length > 0 && (
            <div className="rounded border border-border-main px-4 py-3">
              <GroupHeader label="Resistencia fuste (ELU)" />
              {fusteChecks.map((c) => <CheckRowItem key={c.id} check={c} />)}
            </div>
          )}
          {talonChecks.length > 0 && (
            <div className="rounded border border-border-main px-4 py-3">
              <GroupHeader label="Resistencia talón (ELU)" />
              {talonChecks.map((c) => <CheckRowItem key={c.id} check={c} />)}
            </div>
          )}
          {puntaChecks.length > 0 && (
            <div className="rounded border border-border-main px-4 py-3">
              <GroupHeader label="Resistencia punta (ELU)" />
              {puntaChecks.map((c) => <CheckRowItem key={c.id} check={c} />)}
            </div>
          )}
          {zapataTransChecks.length > 0 && (
            <div className="rounded border border-border-main px-4 py-3">
              <GroupHeader label="Armado transversal de zapata" />
              {zapataTransChecks.map((c) => <CheckRowItem key={c.id} check={c} />)}
            </div>
          )}
        </>
      )}

      {/* Cualquier comprobación futura no colocada arriba: nunca invisible. */}
      {unplaced.length > 0 && (
        <div className="rounded border border-border-main px-4 py-3">
          <GroupHeader label="Otras comprobaciones" />
          {unplaced.map((c) => <CheckRowItem key={c.id} check={c} />)}
        </div>
      )}

    </div>
  );
}
