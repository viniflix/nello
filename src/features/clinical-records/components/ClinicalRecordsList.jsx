import React, { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { FileText, ChevronRight, Search, Filter } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { RECORD_STATUS_LABELS, RECORD_STATUS_COLORS } from '../model/evolutionSchema';

const formatDateTime = (dateString) => {
  if (!dateString) return '';
  return format(parseISO(dateString), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
};

const ClinicalRecordsList = ({ records, onSelectRecord, onCreateDraft, canWriteEpisode }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const filteredRecords = records?.filter((record) => {
    const matchesStatus = statusFilter === 'all' || record.status === statusFilter;
    const matchesSearch = !searchTerm || (
      RECORD_STATUS_LABELS[record.status]?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.record_type?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    return matchesStatus && matchesSearch;
  }) || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
            <Input
              type="search"
              aria-label="Buscar registros clínicos"
              placeholder="Buscar registros..."
              className="pl-9 bg-white dark:bg-zinc-900"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="relative">
            <select
              aria-label="Filtrar por status"
              className="h-10 px-3 pl-9 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-300 appearance-none pr-8"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">Todos os status</option>
              {Object.entries(RECORD_STATUS_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
            <Filter className="absolute left-3 top-3 h-4 w-4 text-zinc-500 pointer-events-none" />
          </div>
        </div>

        {canWriteEpisode && (
          <Button onClick={onCreateDraft} className="w-full sm:w-auto">
            <FileText className="w-4 h-4 mr-2" />
            Nova Evolução
          </Button>
        )}
      </div>

      {filteredRecords.length === 0 ? (
        <div className="text-center py-12 px-4 border border-dashed rounded-lg border-zinc-200 dark:border-zinc-800">
          <FileText className="w-12 h-12 mx-auto text-zinc-300 dark:text-zinc-700 mb-3" />
          <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Nenhum registro encontrado</h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            {searchTerm || statusFilter !== 'all' 
              ? 'Tente ajustar os filtros de busca.' 
              : 'Este episódio de cuidado ainda não possui evoluções ou registros clínicos.'}
          </p>
          {canWriteEpisode && !searchTerm && statusFilter === 'all' && (
            <Button variant="outline" onClick={onCreateDraft} className="mt-4">
              Criar primeira evolução
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRecords.map((record) => {
            const color = RECORD_STATUS_COLORS[record.status] || 'zinc';
            
            return (
              <button
                key={record.id}
                type="button"
                onClick={() => onSelectRecord(record)}
                aria-label={`Abrir evolução de ${formatDateTime(record.encounter_at)}`}
                className="group w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Card className="overflow-hidden transition-colors group-hover:border-zinc-300 dark:group-hover:border-zinc-700">
                  <CardContent className="p-0">
                  <div className="flex items-center p-4">
                    <div className="flex-1 min-w-0 pr-4">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge 
                          variant="secondary" 
                          className={`
                            ${color === 'yellow' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' : ''}
                            ${color === 'blue' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' : ''}
                            ${color === 'green' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' : ''}
                            ${color === 'orange' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' : ''}
                            ${color === 'red' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' : ''}
                            ${color === 'zinc' ? 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400' : ''}
                          `}
                        >
                          {RECORD_STATUS_LABELS[record.status] || record.status}
                        </Badge>
                        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 capitalize">
                          {record.record_type?.replace('_', ' ')}
                        </span>
                        {record.student_id && (
                          <Badge variant="outline" className="text-[10px] uppercase border-blue-200 text-blue-600 dark:border-blue-900 dark:text-blue-400">
                            Estudante
                          </Badge>
                        )}
                      </div>
                      <h4 className="text-base font-medium text-zinc-900 dark:text-zinc-100 truncate">
                        Atendimento em {formatDateTime(record.encounter_at)}
                      </h4>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                        {record.template_code 
                          ? `Template: ${record.template_code.replace(/_/g, ' ')}` 
                          : 'Sem template'}
                      </p>
                    </div>
                    <div className="flex-shrink-0 text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors">
                      <ChevronRight className="w-5 h-5" />
                    </div>
                  </div>
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ClinicalRecordsList;
