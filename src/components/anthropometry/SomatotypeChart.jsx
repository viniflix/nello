import React from 'react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getSomatotypeDescription } from '@/lib/utils/anthropometry-calculations';

/**
 * SomatotypeChart - Gráfico de dispersão para visualizar o Somatotipo
 * 
 * Baseado no método Heath-Carter (1967)
 * X-Axis: Ectomorphy - Endomorphy (range: -8 a 8)
 * Y-Axis: 2 * Mesomorphy - (Endomorphy + Ectomorphy) (range: -5 a 10)
 */
const SomatotypeChart = ({ somatotype, className = '' }) => {
  if (!somatotype || !somatotype.x || !somatotype.y) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-lg">Somatotipo (Heath-Carter)</CardTitle>
          <CardDescription>Gráfico de classificação corporal</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[400px] flex items-center justify-center text-muted-foreground border-2 border-dashed rounded-lg">
            <div className="text-center">
              <p className="text-sm">Preencha os dados necessários para calcular o somatotipo</p>
              <p className="text-xs mt-2 text-muted-foreground">
                Requer: Altura, Peso, Dobras (Tríceps, Subescapular, Suprailíaca),
                <br />
                Diâmetros Ósseos (Úmero, Fêmur) e Circunferências (Braço, Panturrilha)
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Dados para o gráfico (um único ponto)
  const data = [{ x: somatotype.x, y: somatotype.y }];

  // Custom Tooltip
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const point = payload[0].payload;
      return (
        <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
          <p className="font-semibold text-sm mb-2">Somatotipo</p>
          <div className="space-y-1 text-xs">
            <p><span className="font-medium">Endomorfia:</span> {somatotype.endo}</p>
            <p><span className="font-medium">Mesomorfia:</span> {somatotype.meso}</p>
            <p><span className="font-medium">Ectomorfia:</span> {somatotype.ecto}</p>
            <p className="pt-2 border-t border-border mt-2">
              <span className="font-medium">Classificação:</span>{' '}
              {getSomatotypeDescription(somatotype.endo, somatotype.meso, somatotype.ecto)}
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  // Determinar cor baseada na posição
  const getPointColor = () => {
    // Cores baseadas na dominância
    const { endo, meso, ecto } = somatotype;
    const max = Math.max(endo, meso, ecto);
    
    if (max === endo) return '#ef4444'; // Vermelho para Endomorfo
    if (max === meso) return '#22c55e'; // Verde para Mesomorfo
    return '#3b82f6'; // Azul para Ectomorfo
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg flex items-center justify-between">
          <span>Somatotipo (Heath-Carter)</span>
          <Badge variant="outline" className="ml-2">
            {getSomatotypeDescription(somatotype.endo, somatotype.meso, somatotype.ecto)}
          </Badge>
        </CardTitle>
        <CardDescription>
          Gráfico de classificação corporal baseado no método Heath-Carter (1967)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Gráfico */}
          <div className="relative">
            <ResponsiveContainer width="100%" height={400}>
              <ScatterChart
                margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                data={data}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="X"
                  domain={[-8, 8]}
                  ticks={[-8, -6, -4, -2, 0, 2, 4, 6, 8]}
                  label={{ value: 'Ectomorfia - Endomorfia', position: 'insideBottom', offset: -10, style: { fontSize: 12 } }}
                  className="text-muted-foreground"
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="Y"
                  domain={[-5, 10]}
                  ticks={[-5, -2.5, 0, 2.5, 5, 7.5, 10]}
                  label={{ value: '2×Mesomorfia - (Endomorfia + Ectomorfia)', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }}
                  className="text-muted-foreground"
                />
                <Tooltip content={<CustomTooltip />} />
                
                {/* Linhas de referência para os eixos */}
                <ReferenceLine x={0} stroke="#888" strokeDasharray="2 2" />
                <ReferenceLine y={0} stroke="#888" strokeDasharray="2 2" />
                
                {/* Ponto do somatotipo */}
                <Scatter name="Somatotipo" data={data} fill={getPointColor()}>
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getPointColor()} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
            
            {/* Labels de referência nos cantos */}
            <div className="absolute top-4 left-4 text-xs font-semibold text-red-600 dark:text-red-400">
              Endomorfo
            </div>
            <div className="absolute top-4 right-4 text-xs font-semibold text-blue-600 dark:text-blue-400">
              Ectomorfo
            </div>
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-xs font-semibold text-green-600 dark:text-green-400">
              Mesomorfo
            </div>
          </div>

          {/* Informações detalhadas */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t">
            <div className="text-center p-3 bg-red-50 dark:bg-red-950/20 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Endomorfia</p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                {somatotype.endo}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Gordura relativa</p>
            </div>
            <div className="text-center p-3 bg-green-50 dark:bg-green-950/20 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Mesomorfia</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {somatotype.meso}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Massa muscular/óssea</p>
            </div>
            <div className="text-center p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Ectomorfia</p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {somatotype.ecto}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Linearidade</p>
            </div>
          </div>

          {/* Coordenadas */}
          <div className="text-xs text-muted-foreground text-center pt-2">
            Coordenadas: X = {somatotype.x}, Y = {somatotype.y}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SomatotypeChart;

