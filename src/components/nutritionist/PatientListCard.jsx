import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BarChart2, MessageSquare, Edit, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';

const getAdherenceColor = (percentage) => {
  if (percentage > 110) return 'bg-red-500';
  if (percentage >= 90) return 'bg-green-500';
  return 'bg-yellow-500';
};

const PatientProgressChart = ({ patientId, prescription }) => {
  const [totals, setTotals] = useState({ calories: 0 });

  useEffect(() => {
    const fetchTodayEntries = async () => {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('food_entries')
        .select('calories')
        .eq('patient_id', patientId)
        .eq('entry_date', today);

      if (error) {
        console.error("Error fetching entries for progress chart", error);
        return;
      }

      const totalCalories = data.reduce((acc, entry) => acc + entry.calories, 0);
      setTotals({ calories: totalCalories });
    };

    if (patientId) {
      fetchTodayEntries();
    }
  }, [patientId]);

  if (!prescription) return <div className="text-xs text-muted-foreground mt-2">Sem metas definidas.</div>;

  const calorieAdherence = prescription.calories > 0 ? (totals.calories / prescription.calories) * 100 : 0;

  return (
    <div className="w-full">
        <div className="flex justify-between items-baseline mb-1">
            <span className="text-sm font-medium text-foreground">Calorias</span>
            <span className={`text-sm font-bold ${getAdherenceColor(calorieAdherence).replace('bg-', 'text-')}`}>{Math.round(totals.calories)} / {prescription.calories}</span>
        </div>
        <div className="w-full bg-muted rounded-full h-2.5 relative">
            <div className={`h-2.5 rounded-full ${getAdherenceColor(calorieAdherence)}`} style={{width: `${Math.min(calorieAdherence, 100)}%`}}></div>
        </div>
    </div>
  );
};

const PatientItem = ({ patient, prescription, onPrescribe }) => {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="p-4 border bg-card border-border rounded-lg hover:shadow-lg transition-shadow"
    >
      <div className="flex justify-between items-center gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3">
             <div className="w-12 h-12 bg-secondary rounded-full flex items-center justify-center font-bold text-primary text-xl">
              {patient.name.charAt(0)}
            </div>
            <div>
              <h3 className="font-semibold text-lg text-foreground">{patient.name}</h3>
              <p className="text-sm text-muted-foreground">{patient.email}</p>
            </div>
          </div>
        </div>
        <Button size="icon" variant="ghost" onClick={() => navigate(`/nutritionist/patient/${patient.id}`)}>
            <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

       <div className="mt-4 pt-4 border-t border-border/50">
          <PatientProgressChart patientId={patient.id} prescription={prescription} />
        </div>

      <div className="mt-4 pt-4 border-t border-border/50 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => onPrescribe(patient)}>
          <Edit className="w-3 h-3 mr-1.5" />
          {prescription ? 'Editar Dieta' : 'Criar Dieta'}
        </Button>
        <Button size="sm" variant="outline" onClick={() => navigate(`/chat/nutritionist/${patient.id}`)}>
          <MessageSquare className="w-3 h-3 mr-1.5" />
          Chat
        </Button>
        <Button size="sm" variant="ghost" className="text-primary hover:text-primary" onClick={() => navigate(`/nutritionist/patient/${patient.id}`)}>
          <BarChart2 className="w-3 h-3 mr-1.5" />
          Ver Detalhes
        </Button>
      </div>
    </motion.div>
  );
};

const PatientListCard = ({ patients, prescriptions, onPrescribe }) => {
  const getPatientPrescription = (patientId) => {
    const today = new Date();
    return prescriptions.find(p => p.patient_id === patientId && new Date(p.end_date) >= today);
  };

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle>Meus Pacientes</CardTitle>
        <CardDescription>Acompanhe o progresso e gerencie seus pacientes</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {patients.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Nenhum paciente cadastrado</p>
          ) : (
            patients.map((patient) => (
              <PatientItem
                key={patient.id}
                patient={patient}
                prescription={getPatientPrescription(patient.id)}
                onPrescribe={onPrescribe}
              />
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default PatientListCard;
