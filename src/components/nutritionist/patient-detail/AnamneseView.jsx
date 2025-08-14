import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import AnamneseForm from '@/components/AnamneseForm';
import { useToast } from '@/components/ui/use-toast';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Save, Copy } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';

const anamnesisFieldLabels = {
    food_preferences: 'Preferências alimentares',
    food_aversions: 'Aversões alimentares',
    meal_location: 'Local das refeições',
    meal_preparer: 'Quem prepara as refeições',
    recall_24h: 'Recordatório de 24h',
    consumption_frequency: 'Frequência de Consumo',
    previous_diet_treatment: 'Tratamento dietético anterior?',
    appetite: 'Apetite',
    meal_times_number: 'Número e horário das refeições',
    physical_activity_details: 'Atividade física',
    smoking: 'Tabagismo',
    alcohol_consumption: 'Consumo de álcool',
    eating_issues: 'Problemas de alimentação',
    chewing_swallowing_issues: 'Problemas de mastigação/deglutição',
    religious_cultural_restrictions: 'Restrições religiosas/culturais',
    drug_interactions: 'Interações medicamentosas',
};

const AnamneseView = ({ patientId, nutritionistId }) => {
    const [anamnese, setAnamnese] = useState({ data: {} });
    const [isEditing, setIsEditing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [templates, setTemplates] = useState([]);
    const [showSaveTemplateDialog, setShowSaveTemplateDialog] = useState(false);
    const [templateName, setTemplateName] = useState('');
    const { toast } = useToast();

    const fetchAnamneseAndTemplates = useCallback(async () => {
        setLoading(true);
        const { data: anamneseData, error: anamneseError } = await supabase
            .from('anamneses')
            .select('*')
            .eq('patient_id', patientId)
            .maybeSingle();
        
        if (anamneseError) toast({ title: "Erro", description: "Não foi possível carregar a anamnese.", variant: "destructive" });
        else setAnamnese(anamneseData || { data: {} });

        const { data: templatesData, error: templatesError } = await supabase
            .from('anamnese_templates')
            .select('*')
            .eq('nutritionist_id', nutritionistId);
        
        if(templatesError) toast({ title: "Erro", description: "Não foi possível carregar os modelos.", variant: "destructive" });
        else setTemplates(templatesData || []);

        setLoading(false);
    }, [patientId, nutritionistId, toast]);

    useEffect(() => {
        fetchAnamneseAndTemplates();
    }, [fetchAnamneseAndTemplates]);

    const handleSave = async () => {
        setLoading(true);
        const payload = {
            patient_id: patientId,
            nutritionist_id: nutritionistId,
            data: anamnese.data,
        };

        const { error } = await supabase.from('anamneses').upsert(payload, { onConflict: 'patient_id' });

        if (error) {
            toast({ title: "Erro", description: `Não foi possível salvar a anamnese. ${error.message}`, variant: "destructive" });
        } else {
            toast({ title: "Sucesso!", description: "Anamnese salva com sucesso." });
            setIsEditing(false);
            fetchAnamneseAndTemplates();
        }
        setLoading(false);
    };
    
    const handleLoadTemplate = (templateId) => {
        const template = templates.find(t => t.id === Number(templateId));
        if (template) {
            setAnamnese(prev => ({...prev, data: template.data}));
            toast({ title: "Modelo carregado!", description: `Modelo "${template.name}" aplicado.` });
        }
    };
    
    const handleSaveTemplate = async () => {
        if (!templateName) {
            toast({ title: 'Erro', description: 'O nome do modelo é obrigatório.', variant: 'destructive'});
            return;
        }
        setLoading(true);
        const { error } = await supabase.from('anamnese_templates').insert({
            name: templateName,
            data: anamnese.data,
            nutritionist_id: nutritionistId,
        });

        if (error) {
            toast({ title: "Erro", description: `Não foi possível salvar o modelo. ${error.message}`, variant: "destructive" });
        } else {
            toast({ title: "Sucesso!", description: `Modelo "${templateName}" salvo.` });
            setShowSaveTemplateDialog(false);
            setTemplateName('');
            fetchAnamneseAndTemplates();
        }
        setLoading(false);
    };

    if (loading) return <p>Carregando anamnese...</p>;

    const hasData = anamnese && anamnese.data && Object.keys(anamnese.data).length > 0;

    return (
        <Card className="glass-card">
            <CardHeader>
                <div className="flex justify-between items-center flex-wrap gap-2">
                    <div>
                        <CardTitle>Anamnese Nutricional</CardTitle>
                        <CardDescription>Informações detalhadas do paciente.</CardDescription>
                    </div>
                    {!isEditing ? (
                        <Button onClick={() => setIsEditing(true)}>Editar</Button>
                    ) : (
                        <div className="flex gap-2 flex-wrap">
                            <Button variant="outline" onClick={() => { setIsEditing(false); fetchAnamneseAndTemplates(); }}>Cancelar</Button>
                            <Button variant="secondary" onClick={() => setShowSaveTemplateDialog(true)}><Save className="w-4 h-4 mr-2"/> Salvar como Modelo</Button>
                            <Button onClick={handleSave} disabled={loading}>{loading ? 'Salvando...' : 'Salvar Anamnese'}</Button>
                        </div>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                {isEditing ? (
                    <div className="space-y-4">
                        <div className="flex flex-col sm:flex-row gap-2">
                             <Select onValueChange={handleLoadTemplate}>
                                <SelectTrigger className="flex-grow"><SelectValue placeholder="Carregar um modelo..." /></SelectTrigger>
                                <SelectContent>
                                    {templates.map(t => <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <AnamneseForm anamneseData={anamnese} setAnamneseData={setAnamnese} isExpanded={true} />
                    </div>
                ) : (
                    hasData ? (
                        <div className="space-y-6">
                            {Object.entries(anamnesisFieldLabels).map(([key, label]) => {
                                const value = anamnese.data[key];
                                if (!value) return null;
                                
                                if (key === 'recall_24h' && Array.isArray(value) && value.length > 0) {
                                    return (
                                        <div key={key}>
                                            <h4 className="font-semibold text-foreground mb-2">{label}</h4>
                                            <div className="border rounded-lg overflow-hidden">
                                                <table className="w-full text-sm">
                                                    <thead className="bg-muted/50"><tr className="text-left"><th className="p-2">Refeição</th><th className="p-2">Preparações</th><th className="p-2">Qtde</th><th className="p-2">Marcas</th></tr></thead>
                                                    <tbody>{value.map((item, i) => <tr key={i} className="border-t"><td className="p-2">{item.meal}</td><td className="p-2">{item.preparations}</td><td className="p-2">{item.quantity}</td><td className="p-2">{item.brands}</td></tr>)}</tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )
                                }
                                
                                if (key === 'consumption_frequency' && typeof value === 'object' && Object.keys(value).length > 0) {
                                     return (
                                         <div key={key}>
                                             <h4 className="font-semibold text-foreground mb-2">{label}</h4>
                                             <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                                 {Object.entries(value).map(([group, freq]) => <div key={group} className="p-2 bg-muted/50 rounded-md"><p className="font-medium text-xs capitalize">{group.replace(/_/g, ' ')}</p><p className="text-muted-foreground">{freq}</p></div>)}
                                             </div>
                                         </div>
                                     )
                                }
                                
                                if (typeof value === 'string' && value.trim()) {
                                    return (
                                        <div key={key}>
                                            <h4 className="font-semibold text-foreground">{label}</h4>
                                            <p className="text-muted-foreground whitespace-pre-wrap">{value}</p>
                                        </div>
                                    )
                                }
                                return null;
                            })}
                        </div>
                    ) : (
                       <div className="text-center py-8">
                           <p className="text-muted-foreground">Nenhuma anamnese preenchida para este paciente.</p>
                           <Button onClick={() => setIsEditing(true)} className="mt-4">Preencher Anamnese</Button>
                       </div>
                    )
                )}
            </CardContent>
            <Dialog open={showSaveTemplateDialog} onOpenChange={setShowSaveTemplateDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Salvar Modelo de Anamnese</DialogTitle>
                        <DialogDescription>Dê um nome para este modelo para usá-lo com outros pacientes.</DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Label htmlFor="template-name">Nome do Modelo</Label>
                        <Input id="template-name" value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="Ex: Anamnese Padrão Adulto" />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowSaveTemplateDialog(false)}>Cancelar</Button>
                        <Button onClick={handleSaveTemplate} disabled={loading}>{loading ? 'Salvando...' : 'Salvar'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
};

export default AnamneseView;