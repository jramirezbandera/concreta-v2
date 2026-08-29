import { useMemo } from 'react';
import { Link } from 'react-router';
import { type RockfillWallResult } from '../../lib/calculations/rockfillWall';
import { type RockfillWallInputs } from '../../data/defaults';
import { slopeModelFromRockfill, FOUNDATION_PLACEHOLDER } from '../../lib/calculations/geotech/slopePrefill';
import { buildShareUrl } from '../slope-stability/serialize';
import { VerdictBadge, CheckRowItem, GroupHeader, ValueRow, overallStatus, ambientStyle } from '../../components/checks';
import { resultLabel } from '../../lib/text/labels';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import { formatQuantity } from '../../lib/units/format';
import type { Quantity } from '../../lib/units/types';

interface RockfillWallResultsProps {
  result: RockfillWallResult;
  inp: RockfillWallInputs;
}

export function RockfillWallResults({ result, inp }: RockfillWallResultsProps) {
  const { system } = useUnitSystem();
  const fmtSi = (v: number, q: Quantity, precision = 2) => formatQuantity(v, q, system, { precision });
  const isGavion = inp.wallType === 'gaviones';

  // Enlace a Taludes con el modelo prefabricado. Sólo se ofrece si el muro ya
  // cumple sus propias comprobaciones: la idealización de sólido rígido (que es
  // lo que permite excluirlo del dominio de rotura) no está justificada en un
  // muro que todavía falla por dentro o como conjunto.
  // Va ANTES del guard de `result.valid` — regla de hooks.
  const slopeHref = useMemo(() => {
    if (!result.valid || overallStatus(result.checks) === 'fail') return null;
    const model = slopeModelFromRockfill(inp, result);
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

  // Grupos de comprobaciones por id
  const geomChecks = result.checks.filter((c) =>
    ['geom-coronacion', 'geom-intrados', 'geom-hiladas', 'geom-filas', 'geom-cimiento', 'phi-escollera'].includes(c.id),
  );
  const hiladaChecks = result.checks.filter((c) =>
    ['hilada-deslizamiento', 'hilada-vuelco'].includes(c.id),
  );
  const stabilityChecks = result.checks.filter((c) =>
    ['vuelco', 'deslizamiento', 'excentricidad', 'sigma-max', 'sigma-min'].includes(c.id),
  );
  const seismicChecks = result.checks.filter((c) =>
    ['vuelco-sismico', 'deslizamiento-sismico', 'hilada-deslizamiento-sismico'].includes(c.id),
  );
  const globalChecks = result.checks.filter((c) => c.id === 'estabilidad-global');

  // Red de seguridad: nada del motor puede quedar invisible.
  const placed = new Set([
    ...geomChecks, ...hiladaChecks, ...stabilityChecks, ...seismicChecks, ...globalChecks,
  ].map((c) => c.id));
  const unplaced = result.checks.filter((c) => !placed.has(c.id));

  // Resumen de cortes para la tabla (cada ~10º + el pésimo)
  const step = Math.max(1, Math.floor(result.courses.length / 6));
  const tableRows = result.courses.filter((c, i) =>
    i === result.courses.length - 1 ||
    i % step === step - 1 ||
    c.z === result.worstSlide.z ||
    c.z === result.worstOvert.z,
  );

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

      {/* Banner de inestabilidad sísmica */}
      {result.seismicUnstable && (
        <div className="rounded border border-amber-500/40 bg-amber-500/5 px-4 py-3">
          <p className="text-[12px] text-amber-400 leading-relaxed">
            <span className="font-semibold">Relleno inestable bajo sismo:</span>{' '}
            φ − β − θ &lt; 0. Condición próxima al colapso del relleno; reducir kh o mejorar el relleno.
          </p>
        </div>
      )}

      {/* Valores clave */}
      <div className="rounded border border-border-main px-4 py-3">
        <GroupHeader label="Valores geotécnicos" />
        <ValueRow label={resultLabel('Ka_coulomb')} value={result.Ka.toFixed(4)} />
        {result.kh_derived > 0 && (
          <>
            <ValueRow label={resultLabel('kh_seismic')} value={result.kh_derived.toFixed(3)} />
            <ValueRow label={resultLabel('kv_seismic')} value={result.kv_derived.toFixed(3)} />
          </>
        )}
        {result.KAD !== undefined && (
          <ValueRow label={resultLabel('K_AE')} value={result.KAD.toFixed(4)} />
        )}
        <ValueRow label={isGavion ? 'φ relleno de cajas' : 'φ escollera'} value={`${result.phiEff.toFixed(1)}°`} />
        <ValueRow label="φ entre hiladas" value={`${result.phiPP.toFixed(1)}°${inp.contactoMejorado ? '' : ' (⅔·φ)'}`} />
        {result.dPhiN !== undefined && result.sigmaN !== undefined && (
          <ValueRow label="Δφn (σn)" value={`${result.dPhiN.toFixed(2)}° (σn = ${fmtSi(result.sigmaN, 'soilPressure', 3)})`} />
        )}
        <ValueRow label="Ea (empuje activo)" value={fmtSi(result.Ea, 'linearLoad')} />
        <ValueRow label="EAH total" value={fmtSi(result.EAH_total, 'linearLoad')} />
        {result.EW !== undefined && (
          <ValueRow label="EW (hidrostático)" value={fmtSi(result.EW, 'linearLoad')} />
        )}
        {result.Ep !== undefined && (
          <ValueRow label="Ep (pasivo movilizado)" value={fmtSi(result.Ep, 'linearLoad')} />
        )}
        <ValueRow label="W muro" value={fmtSi(result.W_muro, 'linearLoad')} />
        <ValueRow label="W cimiento" value={fmtSi(result.W_cimiento, 'linearLoad')} />
        {result.W_relleno > 0.5 && (
          <ValueRow label="W terreno solidario" value={fmtSi(result.W_relleno, 'linearLoad')} />
        )}
        <ValueRow label="ΣV" value={fmtSi(result.ΣV, 'linearLoad')} />
        <ValueRow label="e (excentricidad)" value={`${result.e.toFixed(3)} m`} />
        <ValueRow label="b' (Meyerhof)" value={`${result.bEq.toFixed(2)} m`} />
        <ValueRow label="σ referencia" value={fmtSi(result.sigma_ref, 'soilPressure', 3)} />
        <ValueRow label={resultLabel('sigma_max')} value={fmtSi(result.sigma_max, 'soilPressure', 3)} />
        <ValueRow label={resultLabel('sigma_min')} value={fmtSi(result.sigma_min, 'soilPressure', 3)} />
      </div>

      {/* Prescripciones geométricas y material */}
      {geomChecks.length > 0 && (
        <div className="rounded border border-border-main px-4 py-3">
          <GroupHeader label="Prescripciones de la Guía (geometría y material)" />
          {geomChecks.map((c) => <CheckRowItem key={c.id} check={c} />)}
        </div>
      )}

      {/* Estabilidad local — hilada a hilada */}
      <div className="rounded border border-border-main px-4 py-3">
        <GroupHeader label={isGavion ? 'Estabilidad local (juntas entre filas)' : 'Estabilidad local (hilada a hilada)'} />
        {hiladaChecks.map((c) => <CheckRowItem key={c.id} check={c} />)}

        {tableRows.length > 0 && (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-[11px] font-mono">
              <thead>
                <tr className="text-text-disabled text-left">
                  <th className="font-normal py-0.5 pr-2">z (m)</th>
                  <th className="font-normal py-0.5 pr-2">b (m)</th>
                  <th className="font-normal py-0.5 pr-2">N (kN/m)</th>
                  <th className="font-normal py-0.5 pr-2">Q (kN/m)</th>
                  <th className="font-normal py-0.5 pr-2">I desl.</th>
                  <th className="font-normal py-0.5">I vuelco</th>
                </tr>
              </thead>
              <tbody className="text-text-secondary">
                {tableRows.map((c) => {
                  const worst = c.z === result.worstSlide.z || c.z === result.worstOvert.z;
                  return (
                    <tr key={c.z} className={worst ? 'text-text-primary' : undefined}>
                      <td className="py-0.5 pr-2">{c.z.toFixed(2)}{worst ? ' ◂' : ''}</td>
                      <td className="py-0.5 pr-2">{c.b.toFixed(2)}</td>
                      <td className="py-0.5 pr-2">{c.N.toFixed(1)}</td>
                      <td className="py-0.5 pr-2">{c.Q.toFixed(1)}</td>
                      <td className={`py-0.5 pr-2 ${c.utilSlide >= 1 ? 'text-state-fail' : c.utilSlide >= 0.95 ? 'text-state-warn' : ''}`}>
                        {c.utilSlide.toFixed(2)}
                      </td>
                      <td className={`py-0.5 ${c.utilOvert >= 1 ? 'text-state-fail' : c.utilOvert >= 0.95 ? 'text-state-warn' : ''}`}>
                        {c.utilOvert.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Estabilidad de conjunto */}
      <div className="rounded border border-border-main px-4 py-3">
        <GroupHeader label="Estabilidad de conjunto (sólido rígido)" />
        {stabilityChecks.map((c) => <CheckRowItem key={c.id} check={c} />)}
      </div>

      {/* Sísmico */}
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
                dominio de rotura como sólido rígido — las superficies pasan por debajo del
                cimiento, que es el mecanismo global real.
              </p>
              <p className="text-state-warn">
                Revisa el estrato de cimentación antes de calcular: va con un valor genérico
                (φ′ = {FOUNDATION_PLACEHOLDER.phi}°, c′ = {FOUNDATION_PLACEHOLDER.c} kPa) porque
                este módulo no pide los parámetros del terreno. Es el dato que gobierna el resultado.
              </p>
              {(inp.beta as number) > 0.01 && (
                <p>
                  β = {(inp.beta as number).toFixed(1)}° no se traslada: el motor fija la coronación
                  horizontal y no existe una sobrecarga equivalente general.
                </p>
              )}
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
