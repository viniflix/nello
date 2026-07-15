import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({ useTimeline: vi.fn() }));
vi.mock('../hooks/useTimeline', () => ({ useTimeline: mocks.useTimeline }));
vi.mock('./TimelineItem', () => ({ default: ({ item }) => <div>{item.title}</div> }));

import TimelineFeed from './TimelineFeed';

const defaults = {
  timelineData: [], isLoading: false, isFetchingNextPage: false, hasNextPage: false,
  error: null, refetch: vi.fn(), fetchNextPage: vi.fn(),
};

describe('TimelineFeed', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.useTimeline.mockReturnValue(defaults); });

  it('requests server-side clinical, operational and complete scopes', () => {
    const { rerender } = render(<MemoryRouter><TimelineFeed patientId="p1" viewedEpisodeId="e1" patientSlug="ana" /></MemoryRouter>);
    expect(mocks.useTimeline).toHaveBeenLastCalledWith('p1', 'e1', 'all');
    fireEvent.click(screen.getByRole('button', { name: 'Clínico' }));
    expect(mocks.useTimeline).toHaveBeenLastCalledWith('p1', 'e1', 'clinical');
    fireEvent.click(screen.getByRole('button', { name: 'Operacional' }));
    expect(mocks.useTimeline).toHaveBeenLastCalledWith('p1', 'e1', 'operational');
    rerender(<MemoryRouter><TimelineFeed patientId="p1" viewedEpisodeId="e1" patientSlug="ana" /></MemoryRouter>);
  });

  it('supports retry, empty and load-more states', () => {
    const refetch = vi.fn();
    mocks.useTimeline.mockReturnValue({ ...defaults, error: new Error('nope'), refetch });
    const { rerender } = render(<MemoryRouter><TimelineFeed patientId="p1" viewedEpisodeId="e1" patientSlug="ana" /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /tentar novamente/i }));
    expect(refetch).toHaveBeenCalled();

    mocks.useTimeline.mockReturnValue({ ...defaults, timelineData: [{ event_id: '1', title: 'Consulta' }], hasNextPage: true });
    rerender(<MemoryRouter><TimelineFeed patientId="p1" viewedEpisodeId="e1" patientSlug="ana" /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /carregar mais/i }));
    expect(defaults.fetchNextPage).toHaveBeenCalled();
  });

  it('explains that an episode is required instead of fetching a broad patient history', () => {
    render(<MemoryRouter><TimelineFeed patientId="p1" viewedEpisodeId={null} patientSlug="ana" /></MemoryRouter>);
    expect(screen.getByText(/episódio de atendimento/i)).toBeInTheDocument();
  });
});
