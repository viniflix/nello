
import React from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { motion } from 'framer-motion';

const AnamneseForm = ({ anamneseData, setAnamneseData, isExpanded }) => {
  const handleAnamneseChange = (field, value) => {
    setAnamneseData(prev => ({ ...prev, [field]: value }));
  };

  const fields = [
    { id: 'clinical_history', label: 'Histórico Clínico', placeholder: 'Doenças, cirurgias, alergias...' },
    { id: 'nutritional_history', label: 'Histórico Nutricional', placeholder: 'Dietas anteriores, restrições...' },
    { id: 'lifestyle_habits', label: 'Hábitos de Vida', placeholder: 'Fumo, álcool, qualidade do sono...' },
    { id: 'physical_activity', label: 'Atividade Física', placeholder: 'Tipo, frequência, duração...' },
    { id: 'family_history', label: 'Histórico Familiar', placeholder: 'Doenças na família...' },
    { id: 'medications_supplements', label: 'Medicamentos e Suplementos', placeholder: 'Quais medicamentos e suplementos utiliza...' },
  ];

  if (!isExpanded) return null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4 pt-4 border-t mt-4"
    >
      <h3 className="text-lg font-semibold text-foreground">Anamnese Completa</h3>
      {fields.map(field => (
        <div className="space-y-2" key={field.id}>
          <Label htmlFor={field.id}>{field.label}</Label>
          <Textarea
            id={field.id}
            value={anamneseData[field.id] || ''}
            onChange={(e) => handleAnamneseChange(field.id, e.target.value)}
            placeholder={field.placeholder}
          />
        </div>
      ))}
    </motion.div>
  );
};

export default AnamneseForm;
