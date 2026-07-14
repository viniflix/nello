import React, { useState, useMemo } from 'react';
import { Search, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SimpleListSkeleton } from '@/components/ui/custom-skeletons';
import TimelineItem from './TimelineItem';
import { useTimeline } from '@/hooks/useTimeline';

export default function TimelineFeed({ patientId, patientSlug, handleCopyLink, copiedToken }) {
    const { timelineData, isLoading, error } = useTimeline(patientId);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState('all'); // 'all', 'clinical', 'operational'

    const filteredTimeline = useMemo(() => {
        if (!timelineData) return [];
        return timelineData.filter(item => {
            // Filter by type
            if (filterType !== 'all' && item.type !== filterType) return false;
            
            // Filter by search
            if (searchTerm) {
                const term = searchTerm.toLowerCase();
                const matchesTitle = item.title?.toLowerCase().includes(term);
                const matchesDesc = item.description?.toLowerCase().includes(term);
                return matchesTitle || matchesDesc;
            }
            return true;
        });
    }, [timelineData, filterType, searchTerm]);

    if (isLoading) {
        return (
            <div className="space-y-4">
                <div className="h-10 bg-slate-100 rounded-lg animate-pulse w-full max-w-md mb-6" />
                <SimpleListSkeleton count={4} />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 bg-red-50 border border-red-200 rounded-md text-red-600 text-sm">
                Ocorreu um erro ao carregar a linha do tempo. Tente novamente mais tarde.
            </div>
        );
    }

    return (
        <div className="w-full max-w-3xl mx-auto">
            {/* Header / Filtros */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-8 sticky top-4 z-20">
                <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                    <div className="relative w-full sm:max-w-xs">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Buscar no histórico..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 bg-slate-50 border-slate-200 focus-visible:ring-blue-500"
                        />
                    </div>
                    
                    <div className="flex items-center gap-1 w-full sm:w-auto bg-slate-100 p-1 rounded-lg">
                        <Button 
                            variant={filterType === 'all' ? 'default' : 'ghost'} 
                            size="sm" 
                            className={filterType === 'all' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600'}
                            onClick={() => setFilterType('all')}
                        >
                            Todos
                        </Button>
                        <Button 
                            variant={filterType === 'clinical' ? 'default' : 'ghost'} 
                            size="sm" 
                            className={filterType === 'clinical' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-blue-600'}
                            onClick={() => setFilterType('clinical')}
                        >
                            Clínico
                        </Button>
                        <Button 
                            variant={filterType === 'operational' ? 'default' : 'ghost'} 
                            size="sm" 
                            className={filterType === 'operational' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-600 hover:text-emerald-600'}
                            onClick={() => setFilterType('operational')}
                        >
                            Operacional
                        </Button>
                    </div>
                </div>
            </div>

            {/* Feed */}
            <div className="relative">
                {filteredTimeline.length === 0 ? (
                    <div className="text-center py-16 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                        <Filter className="w-8 h-8 text-slate-400 mx-auto mb-3" />
                        <h3 className="text-slate-700 font-medium">Nenhum registro encontrado</h3>
                        <p className="text-slate-500 text-sm mt-1">
                            {searchTerm || filterType !== 'all' 
                                ? 'Tente limpar os filtros para ver mais resultados.'
                                : 'A linha do tempo do paciente está vazia.'}
                        </p>
                    </div>
                ) : (
                    <div className="pt-2">
                        {filteredTimeline.map((item) => (
                            <TimelineItem 
                                key={item.id} 
                                item={item} 
                                patientSlug={patientSlug} 
                                handleCopyLink={handleCopyLink}
                                copiedToken={copiedToken}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
