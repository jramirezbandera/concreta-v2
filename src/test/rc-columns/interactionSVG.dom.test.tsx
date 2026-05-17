// RCColumnInteractionSVG — DOM render tests.

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { RCColumnInteractionSVG } from '../../features/rc-columns/RCColumnInteractionSVG';
import { calcRCColumn, buildColumnInteraction } from '../../lib/calculations/rcColumns';
import { rcColumnDefaults } from '../../data/defaults';

const result = calcRCColumn(rcColumnDefaults);
const interaction = buildColumnInteraction(rcColumnDefaults, result);

describe('RCColumnInteractionSVG', () => {
  it('renders an SVG with role=img', () => {
    const { container } = render(<RCColumnInteractionSVG data={interaction.y!} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('role')).toBe('img');
  });

  it('aria-label describes the N-M diagram and the verdict', () => {
    const { container } = render(<RCColumnInteractionSVG data={interaction.y!} />);
    const label = container.querySelector('svg')?.getAttribute('aria-label') ?? '';
    expect(label).toMatch(/interacción N-M/);
    expect(label).toMatch(/dentro|fuera/);
  });

  it('draws both curves — reinforced + plain (≥ 2 paths)', () => {
    const { container } = render(<RCColumnInteractionSVG data={interaction.y!} />);
    expect(container.querySelectorAll('path').length).toBeGreaterThanOrEqual(2);
  });

  it('renders the applied marker (a circle)', () => {
    const { container } = render(<RCColumnInteractionSVG data={interaction.z!} />);
    expect(container.querySelectorAll('circle').length).toBeGreaterThanOrEqual(1);
  });

  it('mode=pdf renders without crashing', () => {
    const { container } = render(<RCColumnInteractionSVG data={interaction.y!} mode="pdf" />);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('respects width / height props', () => {
    const { container } = render(
      <RCColumnInteractionSVG data={interaction.y!} width={360} height={340} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('360');
    expect(svg?.getAttribute('height')).toBe('340');
  });
});
