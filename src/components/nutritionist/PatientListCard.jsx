import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BarChart2, MessageSquare, Edit, ChevronRight, User as UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { useChat } from '@/contexts/ChatContext';
import PatientProgressChart from './PatientProgressChart';

const PatientItem = ({ patient, prescription, onPrescribe }) => {
  const navigate = useNavigate();
  const { unreadSenders } = useChat();
  const hasUnread = unreadSenders.has(patient.id);

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
             <div className="w-12 h-12 bg-secondary rounded-full flex items-center justify-center font-bold text-primary text-xl overflow-hidden">
                {patient.avatar_url ? (
                    <img src={patient.avatar_url} alt={patient.name} className="w-full h-full object-cover"/>
                ) : (
                    <UserIcon className="w-8 h-8 text-primary/70" />
                )}
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
        <Button size="sm" variant="outline" onClick={() => navigate(`/chat/nutritionist/${patient.id}`)} className={`${hasUnread ? 'bg-primary/20 text-primary border-primary' : ''}`}>
          <MessageSquare className="w-3 h-3 mr-1.5" />
          Chat
          {hasUnread && <span className="ml-2 w-2 h-2 bg-destructive rounded-full"></span>}
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
    today.setHours(0, 0, 0, 0);
    
    const activePrescriptions = prescriptions
      .filter(p => {
        const startDate = new Date(p.start_date);
        const endDate = new Date(p.end_date);
        return p.patient_id === patientId && startDate <= today && endDate >= today;
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      
    return activePrescriptions[0] || null;
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