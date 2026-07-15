import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTimeline } from './useTimeline';

const mocks = vi.hoisted(() => ({ useInfiniteQuery: vi.fn(), listPatientTimeline: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({ useInfiniteQuery: mocks.useInfiniteQuery }));
vi.mock('../api/timeline-queries', () => ({
  listPatientTimeline: mocks.listPatientTimeline,
  TIMELINE_PAGE_SIZE: 30,
}));

describe('useTimeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useInfiniteQuery.mockReturnValue({ data: undefined, error: null });
  });

  it('keys and fetches by patient, viewed episode and scope', async () => {
    useTimeline('patient-1', 'episode-1', 'operational');
    const options = mocks.useInfiniteQuery.mock.calls[0][0];

    expect(options.queryKey).toEqual(['patientTimeline', 'patient-1', 'episode-1', 'operational']);
    expect(options.enabled).toBe(true);
    await options.queryFn({ pageParam: { occurredAt: '2026-01-01', eventId: 'event-1' } });
    expect(mocks.listPatientTimeline).toHaveBeenCalledWith(
      'patient-1', 'episode-1', 'operational', { occurredAt: '2026-01-01', eventId: 'event-1' }, 30,
    );
  });

  it('stays disabled without a viewed episode', () => {
    useTimeline('patient-1', null, 'all');
    expect(mocks.useInfiniteQuery.mock.calls[0][0].enabled).toBe(false);
  });

  it('does not reuse pages when the viewed episode changes', () => {
    useTimeline('patient-1', 'episode-a', 'all');
    useTimeline('patient-1', 'episode-b', 'all');
    expect(mocks.useInfiniteQuery.mock.calls.map(([options]) => options.queryKey)).toEqual([
      ['patientTimeline', 'patient-1', 'episode-a', 'all'],
      ['patientTimeline', 'patient-1', 'episode-b', 'all'],
    ]);
  });

  it('flattens pages and passes the page cursor through', () => {
    mocks.useInfiniteQuery.mockReturnValue({
      data: { pages: [{ items: [{ event_id: 'a' }] }, { items: [{ event_id: 'b' }] }] },
      hasNextPage: true,
      isFetchingNextPage: false,
    });
    const result = useTimeline('patient-1', 'episode-1', 'all');
    const options = mocks.useInfiniteQuery.mock.calls[0][0];
    expect(result.timelineData.map((item) => item.event_id)).toEqual(['a', 'b']);
    expect(options.getNextPageParam({ nextCursor: { eventId: 'b' } })).toEqual({ eventId: 'b' });
  });
});
