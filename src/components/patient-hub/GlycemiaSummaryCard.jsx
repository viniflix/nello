import React, { useState, useEffect } from 'react';
import { Activity, Droplets, Plus, Loader2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getGlycemiaRecords, insertGlycemiaRecord } from '@/lib/supabase/glycemia-queries';

const GlycemiaSummaryCard = ({ patientId, patient }) => {
    const isDiabetic = patient?.preferences?.is_diabetic === true;
    
    const [loading, setLoading] = useState(true);
    const [records, setRecords] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    
    // Form state
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [glycemiaValue, setGlycemiaValue] = useState('');
    const [condition, setCondition] = useState('jejum');
    
    const fetchRecords = async () => {
        if (!patientId || !isDiabetic) return;
        setLoading(true);
        // Busca os últimos 30 dias na prática pegamos limit 30 para usar no gráfico
        const { data } = await getGlycemiaRecords(patientId, { limit: 30 });
        if (data) {
            // Reverts array so timeline goes left to right on chart
            setRecords(data.reverse());
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchRecords();
    }, [patientId, isDiabetic]);

    const handleSaveRecord = async (e) => {
        e.preventDefault();
        if (!glycemiaValue) return;
        
        setIsSubmitting(true);
        const { data, error } = await insertGlycemiaRecord({
            patient_id: patientId,
            glycemia_value: parseFloat(glycemiaValue),
            condition: condition,
            record_date: new Date().toISOString()
        });
        
        setIsSubmitting(false);
        if (!error && data) {
            setGlycemiaValue('');
            setIsModalOpen(false);
            fetchRecords();
        }
    };

    if (!isDiabetic) return null;

    if (loading) {
        return (
            <Card className="hover:shadow-md transition-all">
                <CardContent className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </CardContent>
            </Card>
        );
    }

    const chartData = records.map(r => ({
        date: format(parseISO(r.record_date), 'dd/MM HH:mm', { locale: ptBR }),
        value: parseFloat(r.glycemia_value),
        condition: r.condition
    }));

    return (
        <>
            <Card className="hover:shadow-md transition-all border-l-4 border-l-red-500 flex flex-col h-full">
                <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <Droplets className="w-5 h-5 text-red-500" />
                            <CardTitle className="text-base">Controle Glicêmico</CardTitle>
                        </div>
                        <CardDescription className="text-xs mt-1">
                            Monitoramento de glicose para paciente diabético
                        </CardDescription>
                    </div>
                </CardHeader>

                <CardContent className="flex-1 flex flex-col min-h-0">
                    {records.length > 0 ? (
                        <div className="space-y-4 flex-1 flex flex-col">
                            <div className="flex items-center justify-between px-1">
                                <div className="text-sm font-medium">
                                    Último registro: <span className="text-xl ml-1 font-bold">{records[records.length - 1].glycemia_value}</span> <span className="text-muted-foreground text-xs">mg/dL</span>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    {records[records.length - 1].condition === 'jejum' ? 'Em Jejum' : 'Pós-prandial'}
                                </div>
                            </div>
                            
                            <div className="h-[200px] w-full flex-1">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -25 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                                        <XAxis 
                                            dataKey="date" 
                                            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} 
                                            tickMargin={10} 
                                            axisLine={false} 
                                            tickLine={false} 
                                        />
                                        <YAxis 
                                            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} 
                                            axisLine={false} 
                                            tickLine={false} 
                                        />
                                        <Tooltip 
                                            contentStyle={{ 
                                                backgroundColor: 'hsl(var(--background))', 
                                                borderColor: 'hsl(var(--border))',
                                                borderRadius: '8px',
                                                fontSize: '12px'
                                            }}
                                            formatter={(value) => [`${value} mg/dL`, 'Glicemia']}
                                        />
                                        <Line 
                                            type="monotone" 
                                            dataKey="value" 
                                            stroke="#ef4444" 
                                            strokeWidth={2}
                                            dot={{ r: 3, fill: '#ef4444', strokeWidth: 0 }}
                                            activeDot={{ r: 5, stroke: 'hsl(var(--background))', strokeWidth: 2 }} 
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-center py-6 bg-red-50/50 dark:bg-red-950/20 rounded-lg border border-red-100 dark:border-red-900/30">
                            <Droplets className="w-8 h-8 text-red-300 dark:text-red-700 mb-2" />
                            <p className="text-sm font-medium text-foreground">Sem registros</p>
                            <p className="text-xs text-muted-foreground max-w-[200px] mt-1">
                                Adicione as medições de glicose do paciente para acompanhar o gráfico.
                            </p>
                        </div>
                    )}

                    <Button 
                        onClick={() => setIsModalOpen(true)} 
                        variant="outline" 
                        size="sm" 
                        className="w-full gap-2 mt-4"
                    >
                        <Plus className="w-4 h-4" />
                        Adicionar Valor
                    </Button>
                </CardContent>
            </Card>

            <Dialog open={isModalOpen} onOpenChange={(open) => !open && setIsModalOpen(false)}>
                <DialogContent className="sm:max-w-[425px]">
                    <form onSubmit={handleSaveRecord}>
                        <DialogHeader>
                            <DialogTitle>Registrar Glicemia</DialogTitle>
                            <DialogDescription>
                                Adicione uma nova medição para controle.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="glycemiaValue">Valor da Glicemia (mg/dL)</Label>
                                <Input 
                                    id="glycemiaValue" 
                                    type="number" 
                                    step="1" 
                                    min="10"
                                    max="800"
                                    required
                                    value={glycemiaValue}
                                    onChange={(e) => setGlycemiaValue(e.target.value)}
                                    placeholder="Ex: 95" 
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="condition">Condição da Medição</Label>
                                <Select value={condition} onValueChange={setCondition} required>
                                    <SelectTrigger id="condition">
                                        <SelectValue placeholder="Selecione..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="jejum">Em Jejum</SelectItem>
                                        <SelectItem value="pos-prandial">Pós-prandial (após comer)</SelectItem>
                                        <SelectItem value="aleatorio">Aleatório / Outro</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)} disabled={isSubmitting}>
                                Cancelar
                            </Button>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Salvar Registro
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
};

export default GlycemiaSummaryCard;
