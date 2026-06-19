import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { HelpTooltip } from '../../components/ui/HelpTooltip';

afterEach(cleanup);

describe('HelpTooltip', () => {
  it('renders nothing when text is empty', () => {
    const { container } = render(<HelpTooltip text="" />);
    expect(container.querySelector('button')).toBeNull();
  });

  it('renders nothing when text is undefined', () => {
    const { container } = render(<HelpTooltip />);
    expect(container.querySelector('button')).toBeNull();
  });

  it('renders the ⓘ button with a field-specific aria-label', () => {
    render(<HelpTooltip text="Ayuda del campo" fieldLabel="b Ancho" />);
    expect(screen.getByRole('button', { name: 'Ayuda: b Ancho' })).toBeInTheDocument();
  });

  it('falls back to generic aria-label without fieldLabel', () => {
    render(<HelpTooltip text="Ayuda" />);
    expect(screen.getByRole('button', { name: 'Ayuda' })).toBeInTheDocument();
  });

  it('is closed by default (no tooltip in the DOM)', () => {
    render(<HelpTooltip text="Texto de ayuda" />);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('opens on focus and shows the help text', () => {
    render(<HelpTooltip text="Luz entre apoyos" fieldLabel="L" />);
    fireEvent.focus(screen.getByRole('button'));
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('Luz entre apoyos');
  });

  it('opens on mouse enter', () => {
    render(<HelpTooltip text="Ancho tributario" />);
    fireEvent.mouseEnter(screen.getByRole('button'));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('shows the normative ref as a second line', () => {
    render(<HelpTooltip text="Sobrecarga de uso" refText="CTE DB-SE-AE §3" />);
    fireEvent.focus(screen.getByRole('button'));
    expect(screen.getByRole('tooltip')).toHaveTextContent('CTE DB-SE-AE §3');
  });

  it('wires aria-describedby to the tooltip only while open', () => {
    render(<HelpTooltip text="Ayuda" />);
    const btn = screen.getByRole('button');
    expect(btn).not.toHaveAttribute('aria-describedby');
    fireEvent.focus(btn);
    const tip = screen.getByRole('tooltip');
    expect(btn.getAttribute('aria-describedby')).toBe(tip.getAttribute('id'));
  });

  it('closes on Escape', () => {
    render(<HelpTooltip text="Ayuda" />);
    fireEvent.focus(screen.getByRole('button'));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('closes on blur and on mouse leave', () => {
    render(<HelpTooltip text="Ayuda" />);
    const btn = screen.getByRole('button');
    fireEvent.focus(btn);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.blur(btn);
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.mouseEnter(btn);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.mouseLeave(btn);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('closes when the underlying panel scrolls (capture-phase scroll)', () => {
    render(<HelpTooltip text="Ayuda" />);
    fireEvent.focus(screen.getByRole('button'));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.scroll(window, {});
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
