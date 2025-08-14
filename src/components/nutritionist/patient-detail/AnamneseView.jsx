import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import AnamneseForm from '@/components/AnamneseForm';
import { useToast } from '@/components/ui/use-toast';

const AnamneseView = ({ patientId, nutritionistId }) => {
    const [anamnese, setAnamnese] = useState(null);
    const [anamneseData, setAnamneseData] = useState({});
    const [isEditing, setIsEditing] = useState(false);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();

    const fieldLabels = {
        clinical_history: 'Histórico Clínico',
        nutritional_history: 'Histórico Nutricional',
        lifestyle_habits: 'Hábitos de Vida',
        physical_activity: 'Atividade Física',
        family_history: 'Histórico Familiar',
        medications_supplements: 'Medicamentos e Suplementos',
    };

    const fetchAnamnese = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('anamneses')
            .select('*')
            .eq('patient_id', patientId)
            .maybeSingle();
        
        if (error) {
            toast({ title: "Erro", description: "Não foi possível carregar a anamnese.", variant: "destructive" });
        } else {
            setAnamnese(data);
            setAnamneseData(data?.data || {});
        }
        setLoading(false);
    }, [patientId, toast]);

    useEffect(() => {
        fetchAnamnese();
    }, [fetchAnamnese]);

    const handleSave = async () => {
        setLoading(true);
        const payload = {
            patient_id: patientId,
            nutritionist_id: nutritionistId,
            data: anamneseData,
            updated_at: new Date().toISOString()
        };

        const { error } = await supabase
            .from('anamneses')
            .upsert(payload, { onConflict: 'patient_id' });

        if (error) {
            toast({ title: "Erro", description: `Não foi possível salvar a anamnese. ${error.message}`, variant: "destructive" });
        } else {
            toast({ title: "Sucesso!", description: "Anamnese salva com sucesso." });
            setIsEditing(false);
            fetchAnamnese();
        }
        setLoading(false);
    };

    if (loading) return <p>Carregando anamnese...</p>;

    return (
        <Card className="glass-card">
            <CardHeader>
                <div className="flex justify-between items-center">
                    <CardTitle>Anamnese</CardTitle>
                    {!isEditing ? (
                        <Button onClick={() => setIsEditing(true)}>Editar</Button>
                    ) : (
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => { setIsEditing(false); setAnamneseData(anamnese?.data || {}); }}>Cancelar</Button>
                            <Button onClick={handleSave} disabled={loading}>{loading ? 'Salvando...' : 'Salvar'}</Button>
                        </div>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                {isEditing ? (
                    <AnamneseForm anamneseData={anamneseData} setAnamneseData={setAnamneseData} isExpanded={true} />
                ) : (
                    anamnese && Object.values(anamnese.data).some(v => v) ? (
                        <div className="space-y-4">
                            {Object.entries(fieldLabels).map(([key, label]) => (
                                anamnese.data[key] &&
                                <div key={key}>
                                    <h4 className="font-semibold capitalize text-foreground">{label}</h4>
                                    <p className="text-muted-foreground whitespace-pre-wrap">{anamnese.data[key]}</p>
                                </div>
                            ))}
                        </div>
                    ) : (
                       <div className="text-center py-8">
                           <p className="text-muted-foreground">Nenhuma anamnese preenchida para este paciente.</p>
                           <Button onClick={() => setIsEditing(true)} className="mt-4">Preencher Anamnese</Button>
                       </div>
                    )
                )}
            </CardContent>
        </Card>
    );
};

export default AnamneseView;