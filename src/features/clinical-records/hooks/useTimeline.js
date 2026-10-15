import {queryRead} from '@/lib/utils/readPolicy';
import { useInfiniteQuery } from '@tanstack/react-query';
import { listPatientTimeline, TIMELINE_PAGE_SIZE } from '../api/timeline-queries';

export function useTimeline(patientId, episodeId, scope = 'all') {
  const query = useInfiniteQuery({
    queryKey: ['patientTimeline', patientId, episodeId, scope],
    queryFn: queryRead(({signal, pageParam }) => listPatientTimeline(patientId, episodeId, scope, pageParam, TIMELINE_PAGE_SIZE, {signal})),
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    enabled: Boolean(patientId && episodeId),
  });
  return { ...query, timelineData: query.data?.pages.flatMap((page) => page.items) || [] };
}
