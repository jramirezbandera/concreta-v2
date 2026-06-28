// Circular RC column — DOM smoke tests (SVG, results layout, input selector).
// Catches mis-branched UI that the engine tests can't see.

import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';
import { RCColumnsSVG } from '../../features/rc-columns/RCColumnsSVG';
import { RCColumnsResults } from '../../features/rc-columns/RCColumnsResults';
import { RCColumnsInputs } from '../../features/rc-columns/RCColumnsInputs';
import { calcRCColumn } from '../../lib/calculations/rcColumns';
import { rcColumnDefaults, type RCColumnInputs } from '../../data/defaults';

const circInput: RCColumnInputs = { ...rcColumnDefaults, sectionType: 'circular', D: 400, nBarsCirc: 6, circBarDiam: 16 };
const circResult = calcRCColumn(circInput);

function withUnits(ui: React.ReactElement) {
  return render(<UnitSystemProvider>{ui}</UnitSystemProvider>);
}

describe('Circular section SVG', () => {
  it('draws a circular section + ring bars (≥ n+2 circles)', () => {
    const { container } = withUnits(<RCColumnsSVG inp={circInput} result={circResult} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-label')).toMatch(/circular/i);
    // section circle + stirrup ring + 6 bar circles = ≥ 8
    expect(container.querySelectorAll('circle').length).toBeGreaterThanOrEqual(circInput.nBarsCirc! + 2);
  });

  it('rectangular section still renders a rect (no regression)', () => {
    const rectResult = calcRCColumn(rcColumnDefaults);
    const { container } = withUnits(<RCColumnsSVG inp={rcColumnDefaults} result={rectResult} />);
    expect(container.querySelector('rect')).not.toBeNull();
    expect(container.querySelector('svg')?.getAttribute('aria-label')).not.toMatch(/circular/i);
  });
});

describe('Circular results panel', () => {
  it('renders the single-column circular layout (no biaxial y/z split)', () => {
    withUnits(<RCColumnsResults result={circResult} />);
    expect(screen.getByLabelText('Resultados pilar circular')).toBeTruthy();
    expect(screen.getByText(/Resultados calculados — circular/)).toBeTruthy();
    expect(screen.getByText(/M_res \(resultante\)/)).toBeTruthy();
    // the biaxial axis sub-header "(y)/(z)" must NOT appear
    expect(screen.queryByText('(z)')).toBeNull();
  });
});

describe('Section-type selector', () => {
  function Harness() {
    const [state, setState] = useState<RCColumnInputs>(rcColumnDefaults);
    const setField = <K extends keyof RCColumnInputs>(k: K, v: RCColumnInputs[K]) =>
      setState((s) => ({ ...s, [k]: v }));
    return <RCColumnsInputs state={state} setField={setField} />;
  }

  it('switching to circular swaps b/h for D and shows the ring bar count', () => {
    withUnits(<Harness />);
    // starts rectangular
    expect(document.getElementById('input-b')).not.toBeNull();
    expect(document.getElementById('input-D')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /circular/i }));

    // now circular: D + nBarsCirc present, b/h gone
    expect(document.getElementById('input-D')).not.toBeNull();
    expect(document.getElementById('input-nBarsCirc')).not.toBeNull();
    expect(document.getElementById('input-b')).toBeNull();
    expect(document.getElementById('input-h')).toBeNull();
  });
});
