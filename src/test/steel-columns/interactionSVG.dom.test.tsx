// SteelColumnInteractionSVG — DOM render tests.

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { SteelColumnInteractionSVG } from '../../features/steel-columns/SteelColumnInteractionSVG';
import { calcSteelColumn } from '../../lib/calculations/steelColumns';
import { steelColumnDefaults } from '../../data/defaults';

const result = calcSteelColumn(steelColumnDefaults);

describe('SteelColumnInteractionSVG', () => {
  it('default column produces interaction data', () => {
    expect(result.interaction).toBeDefined();
  });

  it('renders an SVG with role=img', () => {
    const { container } = render(<SteelColumnInteractionSVG data={result.interaction!} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('role')).toBe('img');
  });

  it('aria-label describes the biaxial contour and verdict', () => {
    const { container } = render(<SteelColumnInteractionSVG data={result.interaction!} />);
    const label = container.querySelector('svg')?.getAttribute('aria-label') ?? '';
    expect(label).toMatch(/interacción biaxial My-Mz/);
    expect(label).toMatch(/dentro|fuera/);
  });

  it('draws the envelope polygon (a path) and the applied marker (a circle)', () => {
    const { container } = render(<SteelColumnInteractionSVG data={result.interaction!} />);
    expect(container.querySelectorAll('path').length).toBeGreaterThanOrEqual(1);
    expect(container.querySelectorAll('circle').length).toBeGreaterThanOrEqual(1);
  });

  it('mode=pdf renders without crashing', () => {
    const { container } = render(<SteelColumnInteractionSVG data={result.interaction!} mode="pdf" />);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('respects width / height props', () => {
    const { container } = render(
      <SteelColumnInteractionSVG data={result.interaction!} width={340} height={340} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('340');
    expect(svg?.getAttribute('height')).toBe('340');
  });
});
