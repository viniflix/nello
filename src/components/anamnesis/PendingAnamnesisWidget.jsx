import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Clock, ArrowRight, AlertCircle } from 'lucide-react';
import { useAnamnesisRunner } from '@/hooks/useAnamnesisRunner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Sprint G: Widget de anamneses aguardando resposta do paciente.
 * Exibido no Dashboard do nutricionista.
 *
 * Mostra pacientes com formulários enviados há mais de 24h sem resposta.
 */
export function PendingAnamnesisWidget() {
    const navigate = useNavigate();
    // usePendingRecords é independente de patientId (busca todos do nutricionista)
    const { usePendingRecords } = useAnamnesisRunner(null);
    const { data: pending = [], isLoading } = usePendingRecords();

    const formatSince = (dateStr) => {
        const diff = Date.now() - new Date(dateStr).getTime();
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        if (days === 0) return 'hoje';
        if (days === 1) return 'há 1 dia';
        return `há ${days} dias`;
    };

    return (
        <Card className="border border-slate-200 shadow-sm">
            <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                        <ClipboardList className="w-4 h-4 text-amber-600" />
                    </div>
                    <CardTitle className="text-base font-bold text-slate-800">
                        Anamneses Pendentes
                    </CardTitle>
                </div>
                {pending.length > 0 && (
                    <Badge variant="secondary" className="bg-amber-100 text-amber-700 border-amber-200">
                        {pending.length}
                    </Badge>
                )}
            </CardHeader>

            <CardContent className="pt-0">
                {isLoading ? (
                    <div className="space-y-3">
                        {[1, 2, 3].map(i => (
                            <Skeleton key={i} className="h-14 rounded-xl" />
                        ))}
                    </div>
                ) : pending.length === 0 ? (
                    <div className="text-center py-6 text-slate-400">
                        <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">Nenhuma anamnese aguardando resposta.</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {pending.map(record => {
                            const daysSent = Math.floor(
                                (Date.now() - new Date(record.created_at).getTime()) / (1000 * 60 * 60 * 24)
                            );
                            const isUrgent = daysSent >= 3;

                            return (
                                <div
                                    key={record.id}
                                    className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100 hover:border-slate-200 hover:bg-white transition-all cursor-pointer group"
                                    onClick={() => navigate(`/nutritionist/patients/${record.patient?.slug || record.patient_id}/anamnesis/${record.id}`)}
                                >
                                    <div className={`w-2 h-2 rounded-full shrink-0 ${isUrgent ? 'bg-red-400' : 'bg-amber-400'}`} />

                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-slate-800 truncate">
                                            {record.patient?.name || 'Paciente'}
                                        </p>
                                        <p className="text-xs text-slate-400 truncate">
                                            {record.template?.title || 'Anamnese'} · enviado {formatSince(record.created_at)}
                                        </p>
                                    </div>

                                    {isUrgent && (
                                        <AlertCircle className="w-4 h-4 text-red-400 shrink-0" title="Sem resposta há 3+ dias" />
                                    )}

                                    <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 shrink-0 transition-colors" />
                                </div>
                            );
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
