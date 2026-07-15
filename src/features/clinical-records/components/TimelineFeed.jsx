import React, { useMemo, useState } from 'react';
import { Filter, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SimpleListSkeleton } from '@/components/ui/custom-skeletons';
import TimelineItem from './TimelineItem';
import { useTimeline } from '../hooks/useTimeline';

export default function TimelineFeed({ patientId, viewedEpisodeId, patientSlug }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [scope, setScope] = useState('all');
  const query = useTimeline(patientId, viewedEpisodeId, scope);

  const filteredTimeline = useMemo(() => {
    const term = searchTerm.trim().toLocaleLowerCase('pt-BR');
    if (!term) return query.timelineData;
    return query.timelineData.filter((item) =>
      item.title?.toLocaleLowerCase('pt-BR').includes(term)
      || item.summary?.toLocaleLowerCase('pt-BR').includes(term));
  }, [query.timelineData, searchTerm]);

  if (!viewedEpisodeId) {
    return <div role="status" className="p-6 text-center bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-600">Nenhum episódio de atendimento está disponível para este histórico.</div>;
  }
  if (query.isLoading) {
    return <div className="space-y-4"><div className="h-10 bg-slate-100 rounded-lg animate-pulse w-full max-w-md mb-6" /><SimpleListSkeleton count={4} /></div>;
  }
  if (query.error) {
    return (
      <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm space-y-3">
        <p>Ocorreu um erro ao carregar a linha do tempo.</p>
        <Button variant="outline" size="sm" onClick={() => query.refetch()}>Tentar novamente</Button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-8 sticky top-4 z-20">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
            <Input aria-label="Buscar no histórico" placeholder="Buscar no histórico..." value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} className="pl-9 bg-slate-50 border-slate-200 focus-visible:ring-blue-500" />
          </div>
          <div role="group" className="flex items-center gap-1 w-full sm:w-auto bg-slate-100 p-1 rounded-lg" aria-label="Filtrar linha do tempo">
            <Button variant={scope === 'all' ? 'default' : 'ghost'} size="sm" onClick={() => setScope('all')} aria-pressed={scope === 'all'}>Linha completa</Button>
            <Button variant={scope === 'clinical' ? 'default' : 'ghost'} size="sm" onClick={() => setScope('clinical')} aria-pressed={scope === 'clinical'}>Clínico</Button>
            <Button variant={scope === 'operational' ? 'default' : 'ghost'} size="sm" onClick={() => setScope('operational')} aria-pressed={scope === 'operational'}>Operacional</Button>
          </div>
        </div>
      </div>
      <div className="relative">
        {filteredTimeline.length === 0 ? (
          <div role="status" className="text-center py-16 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
            <Filter className="w-8 h-8 text-slate-400 mx-auto mb-3" aria-hidden="true" />
            <h3 className="text-slate-700 font-medium">Nenhum registro encontrado</h3>
            <p className="text-slate-500 text-sm mt-1">{searchTerm ? 'Tente limpar a busca para ver mais resultados.' : 'A linha do tempo deste episódio está vazia.'}</p>
          </div>
        ) : (
          <div className="pt-2">
            {filteredTimeline.map((item) => <TimelineItem key={item.event_id} item={item} patientSlug={patientSlug} />)}
            {query.hasNextPage && (
              <div className="flex justify-center pt-2">
                <Button variant="outline" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>{query.isFetchingNextPage ? 'Carregando…' : 'Carregar mais'}</Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
