// FEM 2D — InlineEdit primitive test suite

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { InlineEdit } from '../../features/fem-analysis/components/InlineEdit';

describe('InlineEdit — display mode', () => {
  it('renders the value with default 2 decimals', () => {
    render(<InlineEdit value={5} onCommit={() => {}} />);
    expect(screen.getByRole('button')).toHaveTextContent('5.00');
  });

  it('respects decimals prop', () => {
    render(<InlineEdit value={3.14159} decimals={3} onCommit={() => {}} />);
    expect(screen.getByRole('button')).toHaveTextContent('3.142');
  });

  it('renders unit suffix when provided', () => {
    render(<InlineEdit value={6} unit="m" onCommit={() => {}} />);
    expect(screen.getByRole('button')).toHaveTextContent('6.00m');
  });

  it('disabled mode does not respond to click', () => {
    const onCommit = vi.fn();
    render(<InlineEdit value={5} disabled onCommit={onCommit} />);
    fireEvent.click(screen.getByRole('button'));
    // No input should appear (still in display mode → no textbox)
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

describe('InlineEdit — activation', () => {
  it('click switches to input mode', () => {
    render(<InlineEdit value={5} onCommit={() => {}} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });
});

describe('InlineEdit — commit on enter', () => {
  it('Enter commits new value', () => {
    const onCommit = vi.fn();
    render(<InlineEdit value={5} onCommit={onCommit} />);
    fireEvent.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '7.5' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith(7.5);
  });

  it('blur commits new value', () => {
    const onCommit = vi.fn();
    render(<InlineEdit value={5} onCommit={onCommit} />);
    fireEvent.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '8' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith(8);
  });
});

describe('InlineEdit — cancel on escape', () => {
  it('Escape reverts and exits edit mode without commit', () => {
    const onCommit = vi.fn();
    render(<InlineEdit value={5} onCommit={onCommit} />);
    fireEvent.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '99' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByRole('button')).toHaveTextContent('5.00');
  });
});

describe('InlineEdit — locale number parsing', () => {
  it('accepts Spanish comma decimal separator', () => {
    const onCommit = vi.fn();
    render(<InlineEdit value={5} onCommit={onCommit} />);
    fireEvent.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '7,5' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith(7.5);
  });

  it('rejects non-numeric input → reverts', () => {
    const onCommit = vi.fn();
    render(<InlineEdit value={5} onCommit={onCommit} />);
    fireEvent.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByRole('button')).toHaveTextContent('5.00');
  });

  it('rejects empty input → reverts', () => {
    const onCommit = vi.fn();
    render(<InlineEdit value={5} onCommit={onCommit} />);
    fireEvent.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();
  });
});

describe('InlineEdit — min/max bounds', () => {
  it('rejects values below min', () => {
    const onCommit = vi.fn();
    render(<InlineEdit value={5} min={1} onCommit={onCommit} />);
    fireEvent.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '0.5' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('accepts boundary values (= min)', () => {
    const onCommit = vi.fn();
    render(<InlineEdit value={5} min={1} onCommit={onCommit} />);
    fireEvent.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '1' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith(1);
  });

  it('rejects values above max', () => {
    const onCommit = vi.fn();
    render(<InlineEdit value={5} max={10} onCommit={onCommit} />);
    fireEvent.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '15' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();
  });
});

describe('InlineEdit — same-value commit is a no-op', () => {
  it('does not call onCommit when value unchanged', () => {
    const onCommit = vi.fn();
    render(<InlineEdit value={5} onCommit={onCommit} />);
    fireEvent.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox') as HTMLInputElement;
    // Don't change value, just press Enter
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();
  });
});
