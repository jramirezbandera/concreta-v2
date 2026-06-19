import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { InputLabel } from '../../components/ui/InputLabel';

afterEach(cleanup);

describe('InputLabel — catalog resolution via labelKey', () => {
  it('resolves sym + descShort from the catalog', () => {
    render(<InputLabel htmlFor="x" labelKey="b_section" />);
    // b_section: sym 'b', descShort 'Ancho' — both visible
    expect(screen.getByText('b')).toBeInTheDocument();
    expect(screen.getByText('Ancho')).toBeInTheDocument();
  });

  it('uses descShort as the label when sym is empty (e.g. selects)', () => {
    // loadType has sym '' → the visible label is the descShort 'Categoría'
    render(<InputLabel htmlFor="x" labelKey="loadType" />);
    expect(screen.getByText('Categoría')).toBeInTheDocument();
  });

  it('renders the ⓘ help icon when the catalog entry has help', () => {
    render(<InputLabel htmlFor="x" labelKey="L_span" />);
    // L_span has help → an Ayuda button appears
    expect(screen.getByRole('button', { name: /Ayuda/ })).toBeInTheDocument();
  });

  it('suppresses the native title when help is present (no double tooltip)', () => {
    const { container } = render(<InputLabel htmlFor="x" labelKey="L_span" />);
    const label = container.querySelector('label');
    expect(label).not.toBeNull();
    expect(label).not.toHaveAttribute('title');
  });

  it('keeps the native title and shows no icon when there is no help', () => {
    const { container } = render(<InputLabel htmlFor="x" labelKey="b_section" />);
    // b_section currently has no help
    expect(screen.queryByRole('button')).toBeNull();
    const label = container.querySelector('label');
    expect(label).toHaveAttribute('title');
  });

  it('renders the fck stacked branch without crashing', () => {
    render(<InputLabel htmlFor="x" labelKey="fck" />);
    expect(screen.getByText('fck')).toBeInTheDocument();
  });
});

describe('InputLabel — override (non-catalog) mode', () => {
  it('uses the explicit label/sub props', () => {
    render(<InputLabel htmlFor="x" label="NEd" sub="axil" />);
    expect(screen.getByText('NEd')).toBeInTheDocument();
    expect(screen.getByText('axil')).toBeInTheDocument();
  });

  it('shows no icon without a help prop', () => {
    render(<InputLabel htmlFor="x" label="NEd" sub="axil" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders the icon with an explicit help override', () => {
    render(<InputLabel htmlFor="x" label="Lcr" help="Lcr = 2L (ménsula)" />);
    expect(screen.getByRole('button', { name: /Ayuda/ })).toBeInTheDocument();
  });
});
