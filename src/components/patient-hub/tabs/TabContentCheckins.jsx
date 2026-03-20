import React from 'react';
import CheckinSchedulePanel from '@/components/nutritionist/CheckinSchedulePanel';
import AdherenceScoreCard from '@/components/shared/AdherenceScoreCard';
import { useCheckins } from '@/hooks/useCheckins';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { CheckSquare, Activity, FileText } from 'lucide-react';

const TabContentCheckins = ({ patientId }) => {
  const { useCheckinHistory } = useCheckins();
  const { data: history, isLoading } = useCheckinHistory(patientId);

  // Calcula a média dos últimos checkins
  const averageScore = history?.length 
    ? history.reduce((acc, curr) => acc + (curr.adherence_percentage || 0), 0) / history.length
    : 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h3 className="text-xl font-bold text-foreground mb-1 flex items-center gap-2">
          <CheckSquare className="w-5 h-5 text-primary" />
          Check-ins & Adesão
        </h3>
        <p className="text-sm text-muted-foreground">
          Gerencie formulários preenchidos periodicamente e avalie o engajamento através da nota de adesão (LiveClin).
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Painel de Adesão Global */}
        <div className="md:col-span-1 space-y-6">
          <AdherenceScoreCard 
            percentage={averageScore} 
            period="Média Geral de Adesão" 
          />
          <CheckinSchedulePanel patientId={patientId} />
        </div>

        {/* Histórico e Cards de Sessões Recentes */}
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Histórico de Respostas
              </CardTitle>
              <CardDescription>
                Últimos check-ins respondidos pelo paciente
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center p-6"><Activity className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : history?.length === 0 ? (
                <div className="text-center p-8 border border-dashed rounded-lg bg-muted/20">
                  <p className="text-muted-foreground text-sm">Nenhum check-in respondido ainda.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {history?.map((session) => (
                    <div key={session.id} className="flex justify-between items-center p-4 border rounded-lg hover:bg-muted/30 transition-colors">
                      <div>
                        <h4 className="font-semibold text-sm">{session.checkin_templates?.name}</h4>
                        <p className="text-xs text-muted-foreground mt-1">
                          Respondido em: {new Date(session.completed_at).toLocaleString('pt-BR')}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`text-lg font-bold ${
                           session.adherence_percentage >= 70 ? 'text-green-600' : 
                           session.adherence_percentage >= 40 ? 'text-amber-500' : 'text-red-500'
                        }`}>
                          {Math.round(session.adherence_percentage)}%
                        </span>
                        <span className="text-[10px] text-muted-foreground uppercase font-semibold">Score</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default TabContentCheckins;
