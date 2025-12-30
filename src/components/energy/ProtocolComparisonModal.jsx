import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ProtocolComparisonTable } from '@/components/energy';
import { BarChart3 } from 'lucide-react';

export default function ProtocolComparisonModal({ 
  protocols, 
  activityFactor, 
  selectedProtocolId, 
  onSelect,
  patientData 
}) {
  if (!protocols || protocols.length === 0) return null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <BarChart3 className="w-4 h-4" />
          Comparar Protocolos
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Comparativo Científico de Protocolos</DialogTitle>
          <DialogDescription>
            Compare diferentes fórmulas de cálculo de TMB e selecione a mais adequada
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4">
          <ProtocolComparisonTable
            protocols={protocols}
            activityFactor={activityFactor}
            selectedProtocolId={selectedProtocolId}
            onSelect={onSelect}
            patientData={patientData}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

