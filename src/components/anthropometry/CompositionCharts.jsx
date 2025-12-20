import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  ReferenceLine
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/**
 * CompositionCharts - Gráfico de Composição Corporal
 * 
 * Visualiza a evolução de Peso, Massa Magra e Massa Gorda ao longo do tempo
 * Inclui Somatochart (Heath-Carter) para visualização do somatotipo
 * @param {array} data - Array de registros antropométricos com results calculados
 */
export default function CompositionCharts({ data = [] }) {
  // Processar dados para o gráfico
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    return data
      .filter(record => record.weight && record.record_date)
      .map(record => {
        const date = new Date(record.record_date);
        const weight = parseFloat(record.weight) || 0;
        
        // Extrair resultados calculados (se existirem)
        const results = record.results || {};
        const bodyFatPercent = results.body_fat_percent || null;
        const leanMass = results.lean_mass_kg || null;
        const fatMass = results.fat_mass_kg || null;

        // Se não houver resultados calculados, tentar calcular a partir de bioimpedância
        let calculatedLeanMass = leanMass;
        let calculatedFatMass = fatMass;
        
        if (!leanMass && bodyFatPercent) {
          calculatedFatMass = (weight * bodyFatPercent) / 100;
          calculatedLeanMass = weight - calculatedFatMass;
        } else if (!leanMass && record.bioimpedance?.percent_gordura) {
          const bfPercent = parseFloat(record.bioimpedance.percent_gordura);
          calculatedFatMass = (weight * bfPercent) / 100;
          calculatedLeanMass = weight - calculatedFatMass;
        }

        return {
          date: format(date, 'dd/MM/yyyy', { locale: ptBR }),
          dateValue: date,
          weight: weight.toFixed(1),
          leanMass: calculatedLeanMass ? calculatedLeanMass.toFixed(1) : null,
          fatMass: calculatedFatMass ? calculatedFatMass.toFixed(1) : null
        };
      })
      .sort((a, b) => a.dateValue - b.dateValue); // Ordenar por data
  }, [data]);

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Composição Corporal</CardTitle>
          <CardDescription>
            Evolução de peso, massa magra e massa gorda
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[300px] text-muted-foreground">
            <p>Nenhum dado disponível para exibir</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Verificar se temos dados de composição
  const hasCompositionData = chartData.some(d => d.leanMass !== null || d.fatMass !== null);

  // Processar dados para Somatochart
  const somatotypeData = useMemo(() => {
    if (!data || data.length === 0) return [];

    return data
      .filter(record => record.results?.somatotype)
      .map(record => {
        const somatotype = record.results.somatotype;
        const date = new Date(record.record_date);
        
        // Coordenadas para o gráfico triangular
        // X = Ectomorphy - Endomorphy
        // Y = 2 * Mesomorphy - (Endomorphy + Ectomorphy)
        return {
          date: format(date, 'dd/MM/yyyy', { locale: ptBR }),
          dateValue: date,
          x: somatotype.x || (somatotype.ecto - somatotype.endo),
          y: somatotype.y || (2 * somatotype.meso - (somatotype.endo + somatotype.ecto)),
          endo: somatotype.endo,
          meso: somatotype.meso,
          ecto: somatotype.ecto
        };
      })
      .sort((a, b) => a.dateValue - b.dateValue);
  }, [data]);

  const hasSomatotypeData = somatotypeData.length > 0;

  return (
    <div className="space-y-6">
      {/* Gráfico de Composição Corporal */}
      <Card>
        <CardHeader>
          <CardTitle>Composição Corporal</CardTitle>
          <CardDescription>
            Evolução de peso, massa magra e massa gorda ao longo do tempo
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="date"
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                label={{ value: 'Peso (kg)', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px'
                }}
                formatter={(value, name) => {
                  if (value === null || value === 'null') return ['N/A', name];
                  return [`${value} kg`, name];
                }}
              />
              <Legend
                formatter={(value) => {
                  const labels = {
                    weight: 'Peso Total',
                    leanMass: 'Massa Magra',
                    fatMass: 'Massa Gorda'
                  };
                  return labels[value] || value;
                }}
              />
              <Line
                type="monotone"
                dataKey="weight"
                stroke="#ffffff"
                strokeWidth={2}
                dot={{ fill: '#ffffff', r: 4 }}
                name="weight"
              />
              {hasCompositionData && (
                <>
                  <Line
                    type="monotone"
                    dataKey="leanMass"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={{ fill: '#10b981', r: 4 }}
                    strokeDasharray="5 5"
                    name="leanMass"
                  />
                  <Line
                    type="monotone"
                    dataKey="fatMass"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={{ fill: '#ef4444', r: 4 }}
                    strokeDasharray="5 5"
                    name="fatMass"
                  />
                </>
              )}
            </LineChart>
          </ResponsiveContainer>
          {!hasCompositionData && (
            <div className="mt-4 text-center text-sm text-muted-foreground">
              <p>Preencha dados de composição corporal (dobras cutâneas ou bioimpedância) para visualizar massa magra e massa gorda.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Somatochart (Heath-Carter) */}
      {hasSomatotypeData && (
        <Card>
          <CardHeader>
            <CardTitle>Somatochart (Heath-Carter)</CardTitle>
            <CardDescription>
              Visualização do somatotipo ao longo do tempo. Cada ponto representa um registro.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <ScatterChart
                margin={{ top: 20, right: 20, bottom: 60, left: 60 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="X"
                  domain={[-8, 8]}
                  label={{ value: 'Ectomorfia - Endomorfia', position: 'insideBottom', offset: -5 }}
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="Y"
                  domain={[-8, 8]}
                  label={{ value: '2×Mesomorfia - (Endomorfia + Ectomorfia)', angle: -90, position: 'insideLeft' }}
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                  formatter={(value, name, props) => {
                    if (name === 'x') {
                      return [`X: ${props.payload.x.toFixed(2)}`, 'Coordenada X'];
                    }
                    if (name === 'y') {
                      return [`Y: ${props.payload.y.toFixed(2)}`, 'Coordenada Y'];
                    }
                    if (name === 'endo') {
                      return [`Endo: ${props.payload.endo}`, 'Endomorfia'];
                    }
                    if (name === 'meso') {
                      return [`Meso: ${props.payload.meso}`, 'Mesomorfia'];
                    }
                    if (name === 'ecto') {
                      return [`Ecto: ${props.payload.ecto}`, 'Ectomorfia'];
                    }
                    return [value, name];
                  }}
                />
                <Legend />
                {/* Linhas de referência para o triângulo somatotípico */}
                <ReferenceLine x={0} stroke="#888" strokeDasharray="2 2" />
                <ReferenceLine y={0} stroke="#888" strokeDasharray="2 2" />
                <Scatter
                  name="Somatotipo"
                  data={somatotypeData}
                  fill="#8b5cf6"
                >
                  {somatotypeData.map((entry, index) => (
                    <circle
                      key={index}
                      cx={entry.x}
                      cy={entry.y}
                      r={6}
                      fill="#8b5cf6"
                      stroke="#fff"
                      strokeWidth={2}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-center gap-6 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <span>Endomorfia (Gordura)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <span>Mesomorfia (Músculo)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <span>Ectomorfia (Linearidade)</span>
                </div>
              </div>
              <p className="text-xs text-center text-muted-foreground">
                O gráfico mostra a evolução do somatotipo. Pontos mais à esquerda indicam maior endomorfia, à direita maior ectomorfia, e acima maior mesomorfia.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

