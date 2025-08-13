import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const PrescriptionItem = ({ prescription, patient }) => (
  <motion.div
    initial={{ opacity: 0, x: 20 }}
    animate={{ opacity: 1, x: 0 }}
    className="p-4 border border-border rounded-lg"
  >
    <div className="flex justify-between items-start">
      <div>
        <h3 className="font-semibold text-foreground">{patient?.name || 'Paciente não encontrado'}</h3>
        <p className="text-sm text-muted-foreground">{prescription.diet_type}</p>
        <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-muted-foreground">
          <span>Calorias: {prescription.calories} kcal</span>
          <span>Proteína: {prescription.protein}g</span>
          <span>Gordura: {prescription.fat}g</span>
          <span>Carboidrato: {prescription.carbs}g</span>
        </div>
      </div>
    </div>
    <div className="mt-2 text-xs text-muted-foreground">
      {new Date(prescription.start_date).toLocaleDateString('pt-BR')} - {new Date(prescription.end_date).toLocaleDateString('pt-BR')}
    </div>
  </motion.div>
);

const RecentPrescriptionsCard = ({ prescriptions, patients }) => {
  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle>Prescrições Recentes</CardTitle>
        <CardDescription>Últimas prescrições criadas</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {prescriptions.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Nenhuma prescrição criada</p>
          ) : (
            prescriptions.slice(-5).reverse().map((prescription) => {
              const patient = patients.find(p => p.id === prescription.patient_id);
              return (
                <PrescriptionItem
                  key={prescription.id}
                  prescription={prescription}
                  patient={patient}
                />
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default RecentPrescriptionsCard;
