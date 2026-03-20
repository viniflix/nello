import React from 'react';
import { useCheckins } from '@/hooks/useCheckins';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { CheckSquare, Activity, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

const PatientCheckinHistoryWidget = ({ patientId }) => {
  const { useCheckinHistory } = useCheckins();
  const { data: history, isLoading } = useCheckinHistory(patientId);

  if (isLoading) {
    return (
      <div className="flex justify-center p-8 mt-8">
        <Activity className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!history || history.length === 0) return null;

  return (
    <div className="mt-12 space-y-4 animate-in fade-in duration-500">
      <div className="flex items-center gap-2 mb-6">
        <CheckSquare className="w-6 h-6 text-primary" />
        <h2 className="text-2xl font-bold text-foreground">Check-ins Anteriores</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {history.map((session) => (
          <Card key={session.id} className="hover:shadow-md transition-shadow relative overflow-hidden group">
            <div 
              className={`absolute top-0 left-0 w-1.5 h-full transition-all ${
                session.adherence_percentage >= 80 ? 'bg-green-500' :
                session.adherence_percentage >= 50 ? 'bg-amber-400' : 'bg-red-500'
              }`} 
            />
            <CardContent className="p-5 flex flex-col justify-between h-full">
              <div className="mb-4">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  {new Date(session.completed_at).toLocaleDateString('pt-BR')} às {new Date(session.completed_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <h4 className="font-semibold text-foreground mt-1 line-clamp-2">
                  {session.checkin_templates?.name}
                </h4>
              </div>

              <div className="flex items-end justify-between mt-auto">
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5 font-medium">Score de Adesão</div>
                  <div className={`text-2xl font-black ${
                    session.adherence_percentage >= 80 ? 'text-green-600' :
                    session.adherence_percentage >= 50 ? 'text-amber-500' : 'text-red-500'
                  }`}>
                    {Math.round(session.adherence_percentage)}%
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default PatientCheckinHistoryWidget;
