import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Star } from "lucide-react";
import CalculationInfoTooltip from './CalculationInfoTooltip';
import { getFormulaBreakdown } from '@/lib/utils/energy-calculations';

/**
 * ProtocolComparisonTable Component
 * 
 * Exibe uma tabela comparativa de diferentes protocolos de cálculo de BMR/TMB,
 * permitindo ao usuário visualizar e selecionar o protocolo mais adequado.
 * 
 * @param {Array} protocols - Array de objetos com informações dos protocolos
 * @param {number} activityFactor - Fator de atividade física (NAF)
 * @param {string} selectedProtocolId - ID do protocolo atualmente selecionado
 * @param {Function} onSelect - Callback quando um protocolo é selecionado
 * @param {Object} [patientData] - Dados do paciente para breakdown (weight, height, age, gender, leanMass)
 */
export function ProtocolComparisonTable({ protocols, activityFactor, selectedProtocolId, onSelect, patientData }) {
  if (!protocols || protocols.length === 0) return null;

  // Calcula a média para dar contexto
  const averageBmr = protocols.reduce((acc, p) => acc + (p.bmr || 0), 0) / protocols.length;

  return (
    <div className="border rounded-lg overflow-hidden bg-card shadow-sm">
      <div className="p-4 bg-muted/50 border-b flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Star className="w-4 h-4 text-primary" />
          Comparativo Científico
        </h3>
        <span className="text-xs text-muted-foreground">
          Fator de Atividade: <strong className="text-foreground">x{activityFactor || 1.0}</strong>
        </span>
      </div>
      
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Protocolo</TableHead>
              <TableHead>TMB (Basal)</TableHead>
              <TableHead>GET (Total)</TableHead>
              <TableHead className="text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {protocols.map((protocol) => {
              if (!protocol.bmr || protocol.bmr <= 0) return null;
              
              const tdee = Math.round(protocol.bmr * (activityFactor || 1.0));
              const isSelected = selectedProtocolId === protocol.id;
              const diffFromAvg = averageBmr > 0 
                ? Math.round(((protocol.bmr - averageBmr) / averageBmr) * 100)
                : 0;

              return (
                <TableRow 
                  key={protocol.id} 
                  className={isSelected ? "bg-primary/5 border-primary/20" : ""}
                >
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span className="font-medium flex items-center gap-2">
                        {protocol.name}
                        {protocol.recommended && (
                          <Badge variant="default" className="text-[10px] h-5 px-1.5">
                            Recomendado
                          </Badge>
                        )}
                        {(protocol.category === 'athlete' || protocol.id === 'cunningham' || protocol.id === 'tinsley') && (
                          <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                            Atleta
                          </Badge>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {protocol.description}
                      </span>
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div>
                        <div className="font-mono text-base font-semibold">
                          {Math.round(protocol.bmr)} kcal
                        </div>
                        {averageBmr > 0 && (
                          <span className={`text-[10px] ${
                            diffFromAvg > 0 ? 'text-green-600 dark:text-green-400' : 
                            diffFromAvg < 0 ? 'text-red-600 dark:text-red-400' : 
                            'text-muted-foreground'
                          }`}>
                            {diffFromAvg > 0 ? '+' : ''}{diffFromAvg}% da média
                          </span>
                        )}
                      </div>
                      {patientData && (() => {
                        const breakdown = getFormulaBreakdown(protocol.id, patientData);
                        return breakdown ? (
                          <CalculationInfoTooltip breakdown={breakdown} variant="compact" />
                        ) : null;
                      })()}
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    <div className="font-bold text-primary text-lg">
                      {tdee} kcal
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Gasto Energético Total
                    </span>
                  </TableCell>
                  
                  <TableCell className="text-right">
                    <Button 
                      size="sm" 
                      variant={isSelected ? "default" : "outline"}
                      onClick={() => onSelect && onSelect(protocol)}
                      className="gap-2 transition-all"
                      disabled={!onSelect}
                    >
                      {isSelected ? (
                        <>
                          <Check className="w-4 h-4" />
                          <span className="hidden sm:inline">Selecionado</span>
                        </>
                      ) : (
                        "Usar este"
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default ProtocolComparisonTable;

