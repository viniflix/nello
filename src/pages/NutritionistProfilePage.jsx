import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { User as UserIcon, Mail, ShieldCheck, Save, Upload, Phone, MapPin, GraduationCap, Briefcase, Info, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const specialtiesList = ["Nutrição Clínica", "Nutrição Esportiva", "Nutrição Materno-Infantil", "Saúde Pública", "Comportamento Alimentar"];

const NutritionistProfilePage = () => {
    const { user, signOut, updateUserProfile } = useAuth();
    const { toast } = useToast();
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState({
        name: '', crn: '', phone: '', education: '', bio: '',
        address: { street: '', city: '', state: '', zip: '' },
        specialties: [],
        preferences: { showDevBar: false, showFinancials: false },
        avatar_url: ''
    });
    const [loading, setLoading] = useState(false);
    const avatarInputRef = useRef(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (user && user.profile) {
            setFormData({
                name: user.profile.name || '',
                crn: user.profile.crn || '',
                phone: user.profile.phone || '',
                education: user.profile.education || '',
                bio: user.profile.bio || '',
                address: user.profile.address || { street: '', city: '', state: '', zip: '' },
                specialties: user.profile.specialties || [],
                preferences: {
                    showDevBar: user.profile.preferences?.showDevBar || false,
                    showFinancials: user.profile.preferences?.showFinancials || false,
                },
                avatar_url: user.profile.avatar_url || ''
            });
        }
    }, [user]);

    const handleSave = async () => {
        setIsSaving(true);
        const { data, error } = await supabase
            .from('user_profiles')
            .update({
                name: formData.name,
                crn: formData.crn,
                phone: formData.phone,
                education: formData.education,
                bio: formData.bio,
                address: formData.address,
                specialties: formData.specialties,
                preferences: formData.preferences,
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
        setLoading(true);

        const { data: existingAvatar } = await supabase.storage.from('avatars').list(user.id);
        if (existingAvatar && existingAvatar.length > 0) {
            const filesToRemove = existingAvatar.map(f => `${user.id}/${f.name}`);
            await supabase.storage.from('avatars').remove(filesToRemove);
        }

        const filePath = `${user.id}/${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file);

        if (uploadError) {
            toast({ title: "Erro no Upload", description: uploadError.message, variant: "destructive" });
            setLoading(false);
            return;
        }

        const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);
        
        const { data: updatedProfile, error: dbError } = await supabase.from('user_profiles').update({ avatar_url: publicUrl }).eq('id', user.id).select().single();
        
        if (dbError) {
             toast({ title: "Erro ao salvar", description: "Não foi possível salvar a nova foto de perfil.", variant: "destructive" });
        } else {
            updateUserProfile(updatedProfile);
            setFormData(prev => ({ ...prev, avatar_url: publicUrl }));
            toast({ title: "Foto de perfil atualizada!"});
        }
        
        setLoading(false);
    };

    const handleCancel = () => {
        if (user && user.profile) {
            setFormData({
                name: user.profile.name || '', crn: user.profile.crn || '', phone: user.profile.phone || '',
                education: user.profile.education || '', bio: user.profile.bio || '',
                address: user.profile.address || { street: '', city: '', state: '', zip: '' },
                specialties: user.profile.specialties || [],
                preferences: {
                    showDevBar: user.profile.preferences?.showDevBar || false,
                    showFinancials: user.profile.preferences?.showFinancials || false,
                },
                avatar_url: user.profile.avatar_url || ''
            });
        }
        setIsEditing(false);
    };

    if (!user || !user.profile) return <div className="flex items-center justify-center h-screen"><Loader2 className="w-8 h-8 animate-spin" /></div>;

    return (
        <div className="min-h-screen bg-background">
            <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="space-y-6">
                    <Card>
                        <CardHeader>
                            <div className="flex justify-between items-start">
                                <div className="flex items-center gap-4">
                                    <div className="relative">
                                        <div className="w-24 h-24 rounded-full border-4 border-primary/20 bg-secondary flex items-center justify-center overflow-hidden">
                                            {formData.avatar_url ? (
                                                <img src={formData.avatar_url} alt="Foto de perfil" className="w-full h-full object-cover" />
                                            ) : (
                                                <UserIcon className="w-12 h-12 text-muted-foreground" />
                                            )}
                                        </div>
                                        {(isEditing || loading) && (
                                            <>
                                                <input type="file" ref={avatarInputRef} onChange={handleAvatarUpload} accept="image/*" className="hidden" disabled={loading} />
                                                <Button size="icon" className="absolute bottom-0 right-0 rounded-full h-8 w-8" onClick={() => avatarInputRef.current.click()} disabled={loading}>
                                                    {loading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Upload className="w-4 h-4" />}
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                    <div>
                                        <CardTitle>{formData.name || 'Nome do Nutricionista'}</CardTitle>
                                        <CardDescription>{user.email}</CardDescription>
                                    </div>
                                </div>
                                {!isEditing ? (
                                    <Button onClick={() => setIsEditing(true)}>Editar</Button>
                                ) : (
                                    <div className="flex space-x-2">
                                        <Button variant="outline" onClick={handleCancel} disabled={isSaving}>Cancelar</Button>
                                        <Button onClick={handleSave} disabled={isSaving}>{isSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin"/>Salvando...</> : "Salvar"}</Button>
                                    </div>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6 pt-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2"><Label htmlFor="name">Nome completo</Label>{isEditing ? <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} /> : <p className="flex items-center gap-2 p-2"><UserIcon className="w-4 h-4 text-muted-foreground"/> {formData.name || '-'}</p>}</div>
                                <div className="space-y-2"><Label htmlFor="crn">CRN</Label>{isEditing ? <Input id="crn" value={formData.crn} onChange={(e) => setFormData({ ...formData, crn: e.target.value })} /> : <p className="flex items-center gap-2 p-2"><ShieldCheck className="w-4 h-4 text-muted-foreground"/> {formData.crn || 'Não informado'}</p>}</div>
                                <div className="space-y-2"><Label htmlFor="phone">Telefone</Label>{isEditing ? <Input id="phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} /> : <p className="flex items-center gap-2 p-2"><Phone className="w-4 h-4 text-muted-foreground"/> {formData.phone || 'Não informado'}</p>}</div>
                                <div className="space-y-2"><Label htmlFor="education">Formação Acadêmica</Label>{isEditing ? <Input id="education" value={formData.education} onChange={(e) => setFormData({ ...formData, education: e.target.value })} /> : <p className="flex items-center gap-2 p-2"><GraduationCap className="w-4 h-4 text-muted-foreground"/> {formData.education || 'Não informado'}</p>}</div>
                            </div>
                            <div className="space-y-2"><Label>Especialidades</Label>{isEditing ? <Select onValueChange={v => setFormData({...formData, specialties: [v]})} defaultValue={formData.specialties[0]}><SelectTrigger><SelectValue placeholder="Selecione as especialidades" /></SelectTrigger><SelectContent>{specialtiesList.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select> : <div className="flex flex-wrap gap-2 p-2"><Briefcase className="w-4 h-4 text-muted-foreground mt-1"/> {formData.specialties.length > 0 ? formData.specialties.map(s => <span key={s} className="bg-secondary text-secondary-foreground text-xs font-medium px-2.5 py-0.5 rounded-full">{s}</span>) : 'Nenhuma especialidade informada'}</div>}</div>
                            <div className="space-y-2"><Label>Endereço do Consultório</Label>{isEditing ? <div className="grid grid-cols-2 gap-2"><Input placeholder="Rua" value={formData.address.street} onChange={e => setFormData({...formData, address: {...formData.address, street: e.target.value}})} /><Input placeholder="Cidade" value={formData.address.city} onChange={e => setFormData({...formData, address: {...formData.address, city: e.target.value}})} /><Input placeholder="Estado" value={formData.address.state} onChange={e => setFormData({...formData, address: {...formData.address, state: e.target.value}})} /><Input placeholder="CEP" value={formData.address.zip} onChange={e => setFormData({...formData, address: {...formData.address, zip: e.target.value}})} /></div> : <p className="flex items-center gap-2 p-2"><MapPin className="w-4 h-4 text-muted-foreground"/> {formData.address.street ? `${formData.address.street}, ${formData.address.city} - ${formData.address.state}` : 'Não informado'}</p>}</div>
                            <div className="space-y-2"><Label>Biografia Profissional</Label>{isEditing ? <Textarea value={formData.bio} onChange={(e) => setFormData({ ...formData, bio: e.target.value })} /> : <p className="flex items-start gap-2 p-2"><Info className="w-4 h-4 text-muted-foreground mt-1 flex-shrink-0"/> <span className="whitespace-pre-wrap">{formData.bio || 'Não informado'}</span></p>}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader><CardTitle>Preferências da Interface</CardTitle><CardDescription>Personalize sua experiência na plataforma.</CardDescription></CardHeader>
                        <CardContent className="space-y-4">
                           <div className="flex items-center justify-between rounded-lg border p-4">
                                <div><Label htmlFor="dev-bar" className="font-semibold">Exibir Barra de Desenvolvedor</Label><p className="text-sm text-muted-foreground">Mostra atalhos e informações úteis no rodapé do dashboard.</p></div>
                                <Switch id="dev-bar" checked={formData.preferences.showDevBar} onCheckedChange={(checked) => { setFormData(prev => ({...prev, preferences: {...prev.preferences, showDevBar: checked }})); setIsEditing(true); }} />
                            </div>
                           <div className="flex items-center justify-between rounded-lg border p-4">
                                <div><Label htmlFor="financials-module" className="font-semibold">Exibir Módulo Financeiro</Label><p className="text-sm text-muted-foreground">Ativa a página para controle de receitas e despesas.</p></div>
                                <Switch id="financials-module" checked={formData.preferences.showFinancials} onCheckedChange={(checked) => { setFormData(prev => ({...prev, preferences: {...prev.preferences, showFinancials: checked }})); setIsEditing(true); }} />
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            </main>
        </div>
    );
};

export default NutritionistProfilePage;