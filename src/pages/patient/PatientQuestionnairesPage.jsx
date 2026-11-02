import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import PatientPendingCheckinsWidget from '@/components/patient/PatientPendingCheckinsWidget';
import PatientCheckinHistoryWidget from '@/components/patient/PatientCheckinHistoryWidget';

export default function PatientQuestionnairesPage() {
  const { user } = useAuth();
  return (
    <div className="patient-page-content min-w-0 space-y-6 [overflow-wrap:anywhere]">
      <Button asChild variant="ghost" className="h-auto min-h-11 max-w-full whitespace-normal">
        <Link to="/patient/perfil"><ArrowLeft className="mr-2 h-4 w-4 shrink-0" />Voltar ao perfil</Link>
      </Button>
      <header>
        <h1 className="patient-page-title">Meus Questionários</h1>
        <p className="mt-2 text-muted-foreground">Responda às solicitações do nutricionista e consulte seu histórico de check-ins.</p>
      </header>
      {user?.id && <div key={user.id} className="space-y-6">
        <section aria-labelledby="pending-questionnaires-title">
          <h2 id="pending-questionnaires-title" className="mb-4 text-lg font-semibold">Pendentes</h2>
          <PatientPendingCheckinsWidget showEmpty />
        </section>
        <PatientCheckinHistoryWidget patientId={user.id} showEmpty />
      </div>}
    </div>
  );
}
