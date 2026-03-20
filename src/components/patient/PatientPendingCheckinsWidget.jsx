import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useCheckins } from '@/hooks/useCheckins';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckSquare, ArrowRight, AlertCircle, Loader2 } from 'lucide-react';

const PatientPendingCheckinsWidget = () => {
  const { usePendingCheckins } = useCheckins();
  const { data: pendingCheckins, isLoading } = usePendingCheckins();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="flex justify-center mb-6">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!pendingCheckins || pendingCheckins.length === 0) return null;

  return (
    <div className="space-y-4 mb-6">
      {pendingCheckins.map((session) => (
        <Card key={session.id} className="bg-primary/5 border border-primary/20 shadow-sm relative overflow-hidden animate-in fade-in slide-in-from-top-4">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-primary" />
          <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex gap-4 items-start w-full">
              <div className="mt-1 p-2 bg-primary/10 rounded-full shrink-0 text-primary">
                <CheckSquare className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-foreground text-base">Check-in Automático Disponível</h3>
                <p className="text-sm text-muted-foreground mt-0.5 max-w-[90%]">
                  {session.checkin_templates?.name || 'Seu nutricionista solicitou informações do seu progresso.'}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span className="flex items-center gap-1.5 text-[11px] font-bold text-amber-700 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Responda o quanto antes
                  </span>
                  <span className="text-xs text-muted-foreground font-medium">
                    {session.checkin_templates?.checkin_fields?.length || 0} perguntas
                  </span>
                </div>
              </div>
            </div>
            
            <Button 
              onClick={() => navigate(`/patient/checkin/${session.id}`)}
              className="w-full sm:w-auto shrink-0 shadow-md font-semibold bg-primary hover:bg-primary/90"
            >
              Responder Agora
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default PatientPendingCheckinsWidget;
