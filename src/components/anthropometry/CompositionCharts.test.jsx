import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CompositionCharts from './CompositionCharts';

vi.mock('recharts', () => {
  const Chart = ({ children }) => <div>{children}</div>;
  return Object.fromEntries(['LineChart', 'Line', 'XAxis', 'YAxis', 'CartesianGrid', 'Tooltip', 'Legend', 'ScatterChart', 'Scatter', 'ReferenceLine'].map(name => [name, Chart]));
});
vi.mock('@/components/ui/visible-chart', () => ({ VisibleChart: ({ children }) => <div>{children}</div> }));

describe('composition history arriving after the empty state', () => {
  it('can receive and remove records without changing the order of hooks', () => {
    const { rerender } = render(<CompositionCharts data={[]} />);
    expect(screen.getByText('Nenhum dado disponível para exibir')).toBeInTheDocument();
    const records = [{ weight: 70, record_date: '2026-10-10', results: { body_fat_percent: 20 } }];
    expect(() => rerender(<CompositionCharts data={records} />)).not.toThrow();
    expect(screen.queryByText('Nenhum dado disponível para exibir')).not.toBeInTheDocument();
    expect(() => rerender(<CompositionCharts data={[]} />)).not.toThrow();
    expect(screen.getByText('Nenhum dado disponível para exibir')).toBeInTheDocument();
  });
});
