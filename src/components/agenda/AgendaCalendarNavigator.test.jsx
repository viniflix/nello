import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AgendaCalendarNavigator from './AgendaCalendarNavigator';

describe('visible calendar preserves civil dates and explicit status information', () => {
  it('shows a booking after UTC midnight on the preceding Fortaleza civil day and selects that day', () => {
    const onSelect = vi.fn();
    render(<AgendaCalendarNavigator month={new Date(2034,9,1)} selected={new Date(2034,9,1)} onMonthChange={vi.fn()} onSelect={onSelect} appointments={[{appointment_time:'2034-10-19T01:30:00Z',status:'confirmed'}]} />);
    const day = screen.getByText(/1 registros: Confirmada/).closest('button');
    expect(day.textContent).toContain('18'); fireEvent.click(day);
    expect(onSelect.mock.calls[0][0].getDate()).toBe(18);
  });
  it('activates an already selected day as navigation instead of deselecting it', () => {
    const onSelect=vi.fn(); render(<AgendaCalendarNavigator month={new Date(2034,9,1)} selected={new Date(2034,9,18)} onMonthChange={vi.fn()} onSelect={onSelect} appointments={[]} />);
    fireEvent.click(screen.getByText('18').closest('button'));
    expect(onSelect).toHaveBeenCalledOnce(); expect(onSelect.mock.calls[0][0].getDate()).toBe(18);
  });
  it('exposes calendar failure and a retry rather than claiming an empty month', () => {
    const onRetry=vi.fn(); render(<AgendaCalendarNavigator month={new Date(2034,9,1)} onMonthChange={vi.fn()} onSelect={vi.fn()} appointments={[]} error onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível');
    fireEvent.click(screen.getByRole('button',{name:'Tentar novamente'})); expect(onRetry).toHaveBeenCalledOnce();
  });
});
