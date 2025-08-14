
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { User as UserIcon, Calendar, Target, Scale, FileText, Download, Upload, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { exportToPdf } from '@/lib/pdfUtils';

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
    general_observations: 'Observações Gerais'
};

const AnamneseViewReadOnly = ({ patientId }) => {
    const [anamnese, setAnamnese] = useState(null);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();

    const fetchAnamnese = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('anamneses')
            .select('data')
            .eq('patient_id', patientId)
            .maybeSingle();
        
        if (error) {
            toast({ title: "Erro", description: "Não foi possível carregar a anamnese.", variant: "destructive" });
        } else {
            setAnamnese(data);
        }
        setLoading(false);
    }, [patientId, toast]);

    useEffect(() => {
        fetchAnamnese();
    }, [fetchAnamnese]);

    if (loading) return <div className="flex justify-center p-4"><Loader2 className="animate-spin" /></div>;
    
    const hasData = anamnese && anamnese.data && Object.keys(anamnese.data).length > 0;

    return (
        <Card id="anamnese-pdf">
            <CardHeader>
                <div className="flex justify-between items-center">
                    <div>
                        <CardTitle>Anamnese</CardTitle>
                        <CardDescription>Informações registradas pelo seu nutricionista.</CardDescription>
                    </div>
                    {hasData && <Button variant="outline" onClick={() => exportToPdf('anamnese-pdf', 'anamnese', 'Anamnese Nutricional')}><Download className="w-4 h-4 mr-2"/>Exportar PDF</Button>}
                </div>
            </CardHeader>
            <CardContent>
                {hasData ? (
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
                    <p className="text-muted-foreground text-center py-8">Anamnese não registrada pelo nutricionista.</p>
                )}
            </CardContent>
        </Card>
    );
};

export default function PatientProfile() {
  const { user, updateUserProfile } = useAuth();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: '', birth_date: '', gender: '', height: '', weight: '', goal: '', avatar_url: ''
  });
  const [loadingAvatar, setLoadingAvatar] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const avatarInputRef = useRef(null);

  useEffect(() => {
    if (user && user.profile) {
      setFormData({
        name: user.profile.name || '',
        birth_date: user.profile.birth_date || '',
        gender: user.profile.gender || '',
        height: user.profile.height?.toString() || '',
        weight: user.profile.weight?.toString() || '',
        goal: user.profile.goal || '',
        avatar_url: user.profile.avatar_url || ''
      });
    }
  }, [user]);
  
  const handleSave = async () => {
    setIsSaving(true);
    const { data, error } = await supabase
      .from('user_profiles')
      .update({ 
        name: formData.name, birth_date: formData.birth_date, gender: formData.gender,
        height: parseFloat(formData.height) || null, weight: parseFloat(formData.weight) || null,
        goal: formData.goal
       })
      .eq('id', user.id)
      .select()
      .single();

    if (error) {
      toast({ title: "Erro", description: "Não foi possível salvar as alterações.", variant: "destructive" });
    } else {
      updateUserProfile(data);
      toast({ title: "Perfil atualizado!", description: "Suas informações foram salvas com sucesso." });
      setIsEditing(false);
    }
    setIsSaving(false);
  };
  
  const handleAvatarUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        setLoadingAvatar(true);

        const { data: existingAvatar } = await supabase.storage.from('avatars').list(user.id);
        if (existingAvatar && existingAvatar.length > 0) {
            const filesToRemove = existingAvatar.map(f => `${user.id}/${f.name}`);
            await supabase.storage.from('avatars').remove(filesToRemove);
        }

        const filePath = `${user.id}/${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file);

        if (uploadError) {
            toast({ title: "Erro no Upload", description: uploadError.message, variant: "destructive" });
            setLoadingAvatar(false);
            return;
        }

        const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);
        
        const { data: updatedProfile, error: dbError } = await supabase.from('user_profiles').update({ avatar_url: publicUrl }).eq('id', user.id).select().single();
        
        if (dbError) {
            toast({ title: "Erro ao salvar", description: "Não foi possível salvar a nova foto de perfil.", variant: "destructive" });
        } else {
            updateUserProfile(updatedProfile);
            setFormData(prev => ({ ...prev, avatar_url: publicUrl }));
            toast({ title: "Foto de perfil atualizada!" });
        }
        
        setLoadingAvatar(false);
    };

  const calculateAge = (birthDate) => {
    if (!birthDate) return '-';
    const today = new Date(); const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  };
  const calculateBMI = (weight, height) => {
    if(!weight || !height) return '-';
    const heightInMeters = height / 100;
    return (weight / (heightInMeters * heightInMeters)).toFixed(1);
  };
  const getBMICategory = (bmi) => {
    if(bmi === '-') return { category: 'Não calculado', color: 'text-muted-foreground' };
    if (bmi < 18.5) return { category: 'Abaixo do peso', color: 'text-blue-600' };
    if (bmi < 25) return { category: 'Peso normal', color: 'text-green-600' };
    if (bmi < 30) return { category: 'Sobrepeso', color: 'text-yellow-600' };
    return { category: 'Obesidade', color: 'text-red-600' };
  };
  const getGoalText = (goal) => { const goals = { lose: 'Perder peso', maintain: 'Manter peso', gain: 'Ganhar peso' }; return goals[goal] || goal || '-'; };
  const getGenderText = (gender) => { const genders = { male: 'Masculino', female: 'Feminino' }; return genders[gender] || gender || '-'; };
  const handleCancel = () => { if (user && user.profile) { setFormData({ name: user.profile.name, birth_date: user.profile.birth_date, gender: user.profile.gender, height: user.profile.height?.toString() || '', weight: user.profile.weight?.toString() || '', goal: user.profile.goal, avatar_url: user.profile.avatar_url }); } setIsEditing(false); };
  
  if (!user || !user.profile) return <div className="flex items-center justify-center h-screen"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  
  const bmi = calculateBMI(formData.weight, formData.height);
  const bmiInfo = getBMICategory(parseFloat(bmi));

  return (
    <div className="pb-24">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="p-4 space-y-6">
            <Tabs defaultValue="profile">
                <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="profile">Perfil</TabsTrigger><TabsTrigger value="anamnese">Anamnese</TabsTrigger></TabsList>
                <TabsContent value="profile" className="mt-6">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2">
                        <Card>
                            <CardHeader>
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                <div className="flex items-center gap-4">
                                    <div className="relative">
                                         <div className="w-20 h-20 rounded-full border-4 border-primary/20 bg-secondary flex items-center justify-center overflow-hidden">
                                            {formData.avatar_url ? (
                                                <img src={formData.avatar_url} alt="Foto de perfil" className="w-full h-full object-cover" />
                                            ) : (
                                                <UserIcon className="w-10 h-10 text-muted-foreground" />
                                            )}
                                        </div>
                                        {(isEditing || loadingAvatar) && (
                                            <>
                                                <input type="file" ref={avatarInputRef} onChange={handleAvatarUpload} accept="image/*" className="hidden" disabled={loadingAvatar}/>
                                                <Button size="icon" className="absolute bottom-0 right-0 rounded-full h-7 w-7" onClick={() => avatarInputRef.current.click()} disabled={loadingAvatar}>
                                                    {loadingAvatar ? <Loader2 className="w-3 h-3 animate-spin"/> : <Upload className="w-3 h-3" />}
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                    <div>
                                        <CardTitle>{formData.name || '-'}</CardTitle>
                                        <CardDescription>{user.email}</CardDescription>
                                    </div>
                                </div>
                                {!isEditing ? (
                                    <Button onClick={() => setIsEditing(true)}>Editar</Button>
                                ) : (
                                    <div className="flex space-x-2"><Button variant="outline" onClick={handleCancel} disabled={isSaving}>Cancelar</Button><Button onClick={handleSave} disabled={isSaving}>{isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</> : "Salvar"}</Button></div>
                                )}
                            </div>
                            </CardHeader>
                            <CardContent className="space-y-6 pt-4">
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2"><Label htmlFor="name">Nome completo</Label>{isEditing ? <Input id="name" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="bg-muted"/> : <p className="font-medium p-2">{formData.name || '-'}</p>}</div>
                                <div className="space-y-2"><Label htmlFor="email">Email</Label><p className="font-medium p-2 text-muted-foreground">{user.email}</p></div>
                               </div>
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2"><Label htmlFor="birth_date">Data de nascimento</Label>{isEditing ? <Input id="birth_date" type="date" value={formData.birth_date} onChange={(e) => setFormData({...formData, birth_date: e.target.value})} className="bg-muted"/> : <p className="font-medium p-2">{formData.birth_date ? new Date(formData.birth_date + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}</p>}</div>
                                <div className="space-y-2"><Label htmlFor="gender">Sexo</Label>{isEditing ? <Select value={formData.gender} onValueChange={(value) => setFormData({...formData, gender: value})}><SelectTrigger className="bg-muted"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="male">Masculino</SelectItem><SelectItem value="female">Feminino</SelectItem></SelectContent></Select> : <p className="font-medium p-2">{getGenderText(formData.gender)}</p>}</div>
                               </div>
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2"><Label htmlFor="height">Altura (cm)</Label>{isEditing ? <Input id="height" type="number" value={formData.height} onChange={(e) => setFormData({...formData, height: e.target.value})} className="bg-muted"/> : <p className="font-medium p-2">{formData.height ? `${formData.height} cm` : '-'}</p>}</div>
                                <div className="space-y-2"><Label htmlFor="weight">Peso (kg)</Label>{isEditing ? <Input id="weight" type="number" step="0.1" value={formData.weight} onChange={(e) => setFormData({...formData, weight: e.target.value})} className="bg-muted"/> : <p className="font-medium p-2">{formData.weight ? `${formData.weight} kg` : '-'}</p>}</div>
                               </div>
                               <div className="space-y-2"><Label htmlFor="goal">Objetivo</Label>{isEditing ? <Select value={formData.goal} onValueChange={(value) => setFormData({...formData, goal: value})}><SelectTrigger className="bg-muted"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="lose">Perder peso</SelectItem><SelectItem value="maintain">Manter peso</SelectItem><SelectItem value="gain">Ganhar peso</SelectItem></SelectContent></Select> : <p className="font-medium p-2">{getGoalText(formData.goal)}</p>}</div>
                            </CardContent>
                        </Card>
                        </div>
                        <div className="space-y-6">
                           <Card><CardHeader><CardTitle className="flex items-center space-x-2"><Scale className="w-5 h-5 text-primary"/><span>IMC</span></CardTitle></CardHeader><CardContent><div className="text-center"><div className="text-3xl font-bold text-primary mb-2">{bmi}</div><p className={`text-sm font-medium ${bmiInfo.color}`}>{bmiInfo.category}</p></div></CardContent></Card>
                           <Card><CardHeader><CardTitle className="flex items-center space-x-2"><Target className="w-5 h-5 text-accent"/><span>Objetivo</span></CardTitle></CardHeader><CardContent><div className="text-center"><div className="text-lg font-semibold text-accent mb-2">{getGoalText(formData.goal)}</div><p className="text-sm text-muted-foreground">Meta atual</p></div></CardContent></Card>
                           <Card><CardHeader><CardTitle className="flex items-center space-x-2"><Calendar className="w-5 h-5 text-secondary"/><span>Idade</span></CardTitle></CardHeader><CardContent><div className="text-center"><div className="text-3xl font-bold text-secondary mb-2">{calculateAge(formData.birth_date)}</div><p className="text-sm text-muted-foreground">anos</p></div></CardContent></Card>
                        </div>
                    </div>
                </TabsContent>
                <TabsContent value="anamnese" className="mt-6"><AnamneseViewReadOnly patientId={user.id}/></TabsContent>
            </Tabs>
        </motion.div>
    </div>
  );
}
