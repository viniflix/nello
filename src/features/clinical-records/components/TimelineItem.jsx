import React, { useEffect } from 'react';
import { format, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar, ChevronRight, FileText, Utensils } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { logSupabaseError } from '@/lib/supabase/query-helpers';
import { patientAnamnesisEditRoute } from '@/lib/utils/patientRoutes';

const typeConfig = {
  clinical: { icon: FileText, bgClass: 'bg-blue-50', textClass: 'text-blue-600', borderClass: 'border-blue-200', accentClass: 'border-l-blue-500' },
  operational: { icon: Utensils, bgClass: 'bg-emerald-50', textClass: 'text-emerald-600', borderClass: 'border-emerald-200', accentClass: 'border-l-emerald-500' },
};

const getItemRoute = (item, patientSlug) => {
  if (item.source_type === 'anamnesis') return patientAnamnesisEditRoute({ slug: patientSlug }, item.source_id);
  if (item.source_type === 'meal_plan') return `/nutritionist/patients/${patientSlug}/meal-plan/${item.source_id}/summary`;
  return null;
};

const STATUS_LABELS = {
  active: 'Ativo',
  archived: 'Arquivado',
  awaiting_confirmation: 'Aguardando confirmação',
  cancelled: 'Cancelado',
  completed: 'Concluído',
  confirmed: 'Confirmado',
  corrected: 'Corrigido',
  draft: 'Rascunho',
  finalized: 'Finalizado',
  in_progress: 'Em andamento',
  invalidated: 'Invalidado',
  no_show: 'Ausência',
  pending_patient: 'Aguardando paciente',
  published: 'Publicado',
  scheduled: 'Agendado',
  signed: 'Assinado',
  submitted: 'Enviado',
  validated: 'Validado',
};

export default function TimelineItem({ item, patientSlug }) {
  const navigate = useNavigate();
  const config = typeConfig[item.category] || typeConfig.clinical;
  const Icon = config.icon;
  const route = getItemRoute(item, patientSlug);
  const occurredAt = new Date(item.occurred_at);
  const hasValidDate = isValid(occurredAt);

  useEffect(() => {
    if (!hasValidDate) {
      logSupabaseError('Data inválida na linha do tempo', { message: 'timeline_invalid_date', eventId: item.event_id, sourceType: item.source_type });
    }
  }, [hasValidDate, item.event_id, item.source_type]);

  const dateLabel = hasValidDate
    ? `${format(occurredAt, "dd 'de' MMMM, yyyy", { locale: ptBR })} às ${format(occurredAt, 'HH:mm')}`
    : 'Data não informada';
  const content = (
    <CardContent className="p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-semibold text-slate-800 text-base">{item.title}</h4>
            {item.is_legacy && <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200 px-1.5 py-0">Legado</Badge>}
          </div>
          <div className="flex items-center text-xs text-slate-500 gap-1"><Calendar className="w-3 h-3" aria-hidden="true" /><span>{dateLabel}</span></div>
        </div>
        <Badge variant="secondary" className={cn('w-fit', ['completed', 'active', 'published', 'signed', 'finalized'].includes(item.status) ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700')}>{STATUS_LABELS[item.status] || 'Registrado'}</Badge>
      </div>
      <p className="text-sm text-slate-600 line-clamp-2 mt-2">{item.summary || 'Registro do atendimento.'}</p>
      {route && <div className="mt-4 flex justify-end text-xs font-medium items-center text-slate-500 group-hover:text-blue-600">Ver detalhes <ChevronRight className="w-3 h-3 ml-1" aria-hidden="true" /></div>}
    </CardContent>
  );

  return (
    <div className="relative pl-8 pb-8 group">
      <div className="absolute top-0 bottom-0 left-[15px] w-px bg-slate-200 group-last:bg-transparent" aria-hidden="true" />
      <div className={cn('absolute top-0 left-0 w-8 h-8 rounded-full flex items-center justify-center border-2 ring-4 ring-white z-10', config.bgClass, config.borderClass)} aria-hidden="true"><Icon className={cn('w-4 h-4', config.textClass)} /></div>
      <Card className={cn('ml-4 border-l-4', config.accentClass, route && 'transition-all duration-200 hover:shadow-md')}>
        {route ? <button type="button" className="block w-full text-left rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" onClick={() => navigate(route)} aria-label={`Ver detalhes de ${item.title}`}>{content}</button> : content}
      </Card>
    </div>
  );
}
