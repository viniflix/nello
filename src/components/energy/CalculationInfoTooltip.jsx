import React from 'react';
import { Info } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

/**
 * CalculationInfoTooltip Component
 * 
 * Exibe um tooltip com breakdown detalhado de como um cálculo foi realizado.
 * Mostra a fórmula aplicada com os valores reais do paciente.
 * 
 * @param {Object} breakdown - Objeto retornado por getFormulaBreakdown ou getGETBreakdown
 * @param {string} [variant] - 'default' | 'compact' - Estilo do tooltip
 */
export default function CalculationInfoTooltip({ breakdown, variant = 'default' }) {
  if (!breakdown) return null;

  const TriggerIcon = () => (
    <Info className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground transition-colors cursor-help" />
  );

  if (variant === 'compact') {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <span className="inline-flex items-center">
            <TriggerIcon />
          </span>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" side="top" align="start">
          <div className="p-4 space-y-3">
            <div>
              <h4 className="font-semibold text-sm mb-1">{breakdown.formulaName}</h4>
              <p className="text-xs text-muted-foreground font-mono bg-muted/50 p-2 rounded">
                {breakdown.appliedStr}
              </p>
            </div>
            {breakdown.baseData && (
              <div className="text-xs text-muted-foreground space-y-1">
                <p className="font-medium">Baseado em:</p>
                <div className="flex flex-wrap gap-2">
                  {breakdown.baseData.weight && (
                    <Badge variant="outline" className="text-[10px]">
                      Peso: {breakdown.baseData.weight}kg
                    </Badge>
                  )}
                  {breakdown.baseData.height && (
                    <Badge variant="outline" className="text-[10px]">
                      Altura: {breakdown.baseData.height}cm
                    </Badge>
                  )}
                  {breakdown.baseData.age && (
                    <Badge variant="outline" className="text-[10px]">
                      Idade: {breakdown.baseData.age} anos
                    </Badge>
                  )}
                  {breakdown.baseData.leanMass && (
                    <Badge variant="outline" className="text-[10px]">
                      MM: {breakdown.baseData.leanMass}kg
                    </Badge>
                  )}
                  {breakdown.baseData.gender && (
                    <Badge variant="outline" className="text-[10px]">
                      {breakdown.baseData.gender}
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <span className="inline-flex items-center">
          <TriggerIcon />
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" side="top" align="start">
        <Card className="border-0 shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Info className="w-4 h-4 text-primary" />
              {breakdown.formulaName}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Fórmula Abstrata */}
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Fórmula:</p>
              <p className="text-sm font-mono bg-muted/50 p-2 rounded">
                {breakdown.equationStr}
              </p>
            </div>

            <div className="border-t my-3" />

            {/* Fórmula Aplicada */}
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Cálculo Aplicado:</p>
              <p className="text-sm font-mono bg-primary/10 p-2 rounded border border-primary/20">
                {breakdown.appliedStr}
              </p>
            </div>

            {/* Passos Intermediários */}
            {breakdown.steps && breakdown.steps.length > 0 && (
              <>
                <div className="border-t my-3" />
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Passos:</p>
                  <div className="space-y-1.5">
                    {breakdown.steps.map((step, index) => (
                      <div key={index} className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground">{step.label}:</span>
                        <span className="font-mono font-medium">{step.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Dados Base */}
            {breakdown.baseData && (
              <>
                <div className="border-t my-3" />
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Dados Utilizados:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {breakdown.baseData.weight && (
                      <Badge variant="secondary" className="text-[10px]">
                        Peso: {breakdown.baseData.weight}kg
                      </Badge>
                    )}
                    {breakdown.baseData.height && (
                      <Badge variant="secondary" className="text-[10px]">
                        Altura: {breakdown.baseData.height}cm
                      </Badge>
                    )}
                    {breakdown.baseData.age && (
                      <Badge variant="secondary" className="text-[10px]">
                        Idade: {breakdown.baseData.age} anos
                      </Badge>
                    )}
                    {breakdown.baseData.leanMass && (
                      <Badge variant="default" className="text-[10px]">
                        MM: {breakdown.baseData.leanMass}kg
                      </Badge>
                    )}
                    {breakdown.baseData.gender && (
                      <Badge variant="secondary" className="text-[10px]">
                        {breakdown.baseData.gender}
                      </Badge>
                    )}
                    {breakdown.baseData.activityLabel && (
                      <Badge variant="outline" className="text-[10px]">
                        {breakdown.baseData.activityLabel}
                      </Badge>
                    )}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </PopoverContent>
    </Popover>
  );
}

