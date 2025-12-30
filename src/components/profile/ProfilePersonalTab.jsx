import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { User, ShieldCheck, Phone, MapPin, GraduationCap, Briefcase, Info, Upload, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const specialtiesList = [
    "Nutrição Clínica",
    "Nutrição Esportiva",
    "Nutrição Materno-Infantil",
    "Saúde Pública",
    "Comportamento Alimentar"
];

export default function ProfilePersonalTab({ profile, onUpdate }) {
    const { user, updateUserProfile } = useAuth();
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const avatarInputRef = useRef(null);
    
    const [formData, setFormData] = useState({
        name: profile?.name || '',
        crn: profile?.crn || '',
        phone: profile?.phone || '',
        education: profile?.education || '',
        bio: profile?.bio || '',
        address: profile?.address || { street: '', city: '', state: '', zip: '' },
        specialties: profile?.specialties || [],
        avatar_url: profile?.avatar_url || ''
    });

    const handleAvatarUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        setUploading(true);

        try {
            // Remove old avatar
            const { data: existingAvatar } = await supabase.storage.from('avatars').list(user.id);
            if (existingAvatar && existingAvatar.length > 0) {
                const filesToRemove = existingAvatar.map(f => `${user.id}/${f.name}`);
                await supabase.storage.from('avatars').remove(filesToRemove);
            }

            const filePath = `${user.id}/${Date.now()}_${file.name}`;
            const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);
            
            const { data: updatedProfile, error: dbError } = await supabase
                .from('user_profiles')
                .update({ avatar_url: publicUrl })
                .eq('id', user.id)
                .select()
                .single();
            
            if (dbError) throw dbError;

            updateUserProfile(updatedProfile);
            setFormData(prev => ({ ...prev, avatar_url: publicUrl }));
            toast({ title: "Foto de perfil atualizada!" });
        } catch (error) {
            toast({
                title: "Erro",
                description: "Não foi possível fazer upload da foto.",
                variant: "destructive"
            });
        } finally {
            setUploading(false);
        }
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('user_profiles')
                .update({
                    name: formData.name,
                    crn: formData.crn,
                    phone: formData.phone,
                    education: formData.education,
                    bio: formData.bio,
                    address: formData.address,
                    specialties: formData.specialties
                })
                .eq('id', user.id)
                .select()
                .single();

            if (error) throw error;

            updateUserProfile(data);
            if (onUpdate) onUpdate(data);
            toast({
                title: "Perfil atualizado!",
                description: "Suas informações foram salvas com sucesso."
            });
        } catch (error) {
            toast({
                title: "Erro",
                description: "Não foi possível salvar as alterações.",
                variant: "destructive"
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Foto de Perfil / Logo</CardTitle>
                    <CardDescription>Faça upload da sua foto ou logo do consultório</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-6">
                        <div className="relative">
                            <div className="w-32 h-32 rounded-full border-4 border-primary/20 bg-secondary flex items-center justify-center overflow-hidden">
                                {formData.avatar_url ? (
                                    <img src={formData.avatar_url} alt="Foto de perfil" className="w-full h-full object-cover" />
                                ) : (
                                    <User className="w-16 h-16 text-muted-foreground" />
                                )}
                            </div>
                            <input
                                type="file"
                                ref={avatarInputRef}
                                onChange={handleAvatarUpload}
                                accept="image/*"
                                className="hidden"
                                disabled={uploading}
                            />
                            <Button
                                size="icon"
                                className="absolute bottom-0 right-0 rounded-full h-10 w-10"
                                onClick={() => avatarInputRef.current?.click()}
                                disabled={uploading}
                            >
                                {uploading ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Upload className="w-4 h-4" />
                                )}
                            </Button>
                        </div>
                        <div className="flex-1">
                            <p className="text-sm text-muted-foreground">
                                Clique no ícone de upload para alterar sua foto. Formatos aceitos: JPG, PNG (máx. 5MB)
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Informações Pessoais</CardTitle>
                    <CardDescription>Dados básicos do nutricionista</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Nome Completo *</Label>
                            <div className="flex items-center gap-2">
                                <User className="w-4 h-4 text-muted-foreground" />
                                <Input
                                    id="name"
                                    value={formData.name}
                                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder="Seu nome completo"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="crn">CRN *</Label>
                            <div className="flex items-center gap-2">
                                <ShieldCheck className="w-4 h-4 text-muted-foreground" />
                                <Input
                                    id="crn"
                                    value={formData.crn}
                                    onChange={(e) => setFormData(prev => ({ ...prev, crn: e.target.value }))}
                                    placeholder="Ex: CRN-3 12345"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="phone">Telefone</Label>
                            <div className="flex items-center gap-2">
                                <Phone className="w-4 h-4 text-muted-foreground" />
                                <Input
                                    id="phone"
                                    value={formData.phone}
                                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                                    placeholder="(00) 00000-0000"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="education">Formação Acadêmica</Label>
                            <div className="flex items-center gap-2">
                                <GraduationCap className="w-4 h-4 text-muted-foreground" />
                                <Input
                                    id="education"
                                    value={formData.education}
                                    onChange={(e) => setFormData(prev => ({ ...prev, education: e.target.value }))}
                                    placeholder="Ex: Graduação em Nutrição - UFMG"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Especialidades</Label>
                        <Select
                            value={formData.specialties[0] || 'none'}
                            onValueChange={(value) => {
                                setFormData(prev => ({
                                    ...prev,
                                    specialties: value && value !== 'none' ? [value] : []
                                }));
                            }}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Selecione uma especialidade" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Nenhuma</SelectItem>
                                {specialtiesList.map(s => (
                                    <SelectItem key={s} value={s}>{s}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="bio">Biografia Profissional</Label>
                        <div className="flex items-start gap-2">
                            <Info className="w-4 h-4 text-muted-foreground mt-2 flex-shrink-0" />
                            <Textarea
                                id="bio"
                                value={formData.bio}
                                onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
                                placeholder="Descreva sua experiência profissional..."
                                rows={4}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Endereço Completo do Consultório</CardTitle>
                    <CardDescription>Usado em recibos e documentos oficiais</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2 space-y-2">
                            <Label htmlFor="street">Rua / Avenida</Label>
                            <div className="flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-muted-foreground" />
                                <Input
                                    id="street"
                                    value={formData.address.street}
                                    onChange={(e) => setFormData(prev => ({
                                        ...prev,
                                        address: { ...prev.address, street: e.target.value }
                                    }))}
                                    placeholder="Rua, número, complemento"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="city">Cidade</Label>
                            <Input
                                id="city"
                                value={formData.address.city}
                                onChange={(e) => setFormData(prev => ({
                                    ...prev,
                                    address: { ...prev.address, city: e.target.value }
                                }))}
                                placeholder="Cidade"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="state">Estado</Label>
                            <Input
                                id="state"
                                value={formData.address.state}
                                onChange={(e) => setFormData(prev => ({
                                    ...prev,
                                    address: { ...prev.address, state: e.target.value }
                                }))}
                                placeholder="UF"
                                maxLength={2}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="zip">CEP</Label>
                            <Input
                                id="zip"
                                value={formData.address.zip}
                                onChange={(e) => setFormData(prev => ({
                                    ...prev,
                                    address: { ...prev.address, zip: e.target.value }
                                }))}
                                placeholder="00000-000"
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-end gap-2">
                <Button onClick={handleSave} disabled={loading}>
                    {loading ? (
                        <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Salvando...
                        </>
                    ) : (
                        'Salvar Alterações'
                    )}
                </Button>
            </div>
        </div>
    );
}

