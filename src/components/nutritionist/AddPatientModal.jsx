import React, { useState, useEffect } from 'react';
import { usePatientFormStore } from '@/stores/usePatientFormStore'; 
import InputMask from 'react-input-mask'; 
import { useAuth } from '@/contexts/AuthContext'; 
import { supabase } from '@/lib/customSupabaseClient'; 
import { useToast } from '@/components/ui/use-toast'; 

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"; 
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"; 
import { 
    Calendar as CalendarIcon, Loader2, User, Mail, Phone, Users, FileText, 
    Briefcase, Heart, PenSquare, MapPin, Map, Hash, Building2, Home, Building, Landmark
} from "lucide-react";
import { format, parse } from "date-fns";
import { ptBR } from 'date-fns/locale';
import { cn } from "@/lib/utils"; 

const IconInputWrapper = ({ icon: Icon, children }) => (
    <div className="relative">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        {children}
    </div>
);


const AddPatientModal = ({ isOpen, setIsOpen, onPatientAdded }) => {
    const { user } = useAuth(); 
    const { toast } = useToast(); 
    const [step, setStep] = useState("1");
    
    const { formData, updateField, resetForm, fillAddress } = usePatientFormStore();
    const [loading, setLoading] = useState(false); 
    const [cepLoading, setCepLoading] = useState(false); 
    
    // --- ALTERAÇÕES DO CALENDÁRIO ---
    const [localDateString, setLocalDateString] = useState('');
    const [calendarOpen, setCalendarOpen] = useState(false); // <-- NOVA LINHA: Controla o Popover

    useEffect(() => {
        if (formData.birth_date) {
            const formattedDate = format(formData.birth_date, 'dd/MM/yyyy');
            if (localDateString !== formattedDate) {
                setLocalDateString(formattedDate);
            }
        } else {
            setLocalDateString('');
        }
    }, [formData.birth_date]); 

    const handleDateInputChange = (e) => {
        const dateStr = e.target.value;
        setLocalDateString(dateStr); 

        if (dateStr.length === 10) {
            try {
                const parsedDate = parse(dateStr, 'dd/MM/yyyy', new Date());
                if (!isNaN(parsedDate) && parsedDate.getFullYear() > 1900 && parsedDate < new Date()) {
                    updateField('birth_date', parsedDate);
                } else {
                    updateField('birth_date', null);
                }
            } catch {
                updateField('birth_date', null);
            }
        } else if (dateStr.length === 0) {
            updateField('birth_date', null);
        }
    };

    const handleDateSelect = (date) => {
        updateField('birth_date', date); 
        setLocalDateString(date ? format(date, 'dd/MM/yyyy') : ''); 
        setCalendarOpen(false); // <-- NOVA LINHA: Fecha o calendário APÓS selecionar
    };
    // --- FIM DAS ALTERAÇÕES ---

    const handleClose = () => {
        setIsOpen(false);
        resetForm();
        setStep("1");
        setLocalDateString('');
        setCalendarOpen(false); // <-- NOVA LINHA: Reseta o estado do calendário
    };

    // (handleCepBlur ... sem mudanças)
    const handleCepBlur = async (cep) => {
        const cleanedCep = cep.replace(/\D/g, ''); 
        if (cleanedCep.length !== 8) return;
        setCepLoading(true);
        try {
            const response = await fetch(`https://viacep.com.br/ws/${cleanedCep}/json/`);
            if (!response.ok) throw new Error('CEP não encontrado');
            const data = await response.json();
            if (data.erro) {
                toast({ title: "Erro", description: "CEP não encontrado.", variant: "destructive" });
            } else {
                fillAddress(data); 
            }
        } catch (error) {
            toast({ title: "Erro de Rede", description: "Não foi possível buscar o CEP.", variant: "destructive" });
        } finally {
            setCepLoading(false);
        }
    };

    const handleSavePatient = async () => {
        if (!user) {
            toast({ title: "Erro", description: "Você não está logado.", variant: "destructive" });
            return;
        }
        if (!formData.name || !formData.email) {
            toast({ title: "Campos obrigatórios", description: "Nome e Email são obrigatórios.", variant: "destructive" });
            setStep("1"); 
            return;
        }
        
        setLoading(true);

        const addressData = formData.cep ? {
            cep: formData.cep, street: formData.street, number: formData.number,
            complement: formData.complement, neighborhood: formData.neighborhood,
            city: formData.city, state: formData.state,
        } : null;

        const metadata = {
            name: formData.name, user_type: 'patient', nutritionist_id: user.id, 
            birth_date: formData.birth_date ? format(formData.birth_date, 'yyyy-MM-dd') : null,
            gender: formData.gender, phone: formData.phone, cpf: formData.cpf,
            occupation: formData.occupation, civil_status: formData.civil_status,
            observations: formData.observations 
        };

        if (addressData) {
            metadata.address = addressData;
        }
        
        const redirectTo = `${window.location.origin}/update-password`;

        const body = {
            email: formData.email,
            metadata: metadata,
            redirectTo: redirectTo
        };

        try {
            // Chama a Edge Function 'create-patient'
            const { data, error } = await supabase.functions.invoke('create-patient', {
                body: JSON.stringify(body)
            });

            if (error) {
                if (data && data.error) {
                    throw new Error(data.error);
                }
                const errorData = await error.context.json();
                if (errorData && errorData.error) {
                    throw new Error(errorData.error);
                }
                throw error;
            }

            toast({ title: "Sucesso!", description: `Convite enviado para ${formData.name}.`, variant: "success" });
            resetForm(); 
            onPatientAdded(); // Atualiza a lista na página
            handleClose(); 

        } catch (error) {
            toast({ title: "Erro ao enviar convite", description: error.message, variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };
    
    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="font-clash text-2xl text-primary">Adicionar Novo Paciente</DialogTitle>
                </DialogHeader>

                <Tabs value={step} onValueChange={setStep} className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="1">1. Dados Pessoais</TabsTrigger>
                        <TabsTrigger value="2">2. Endereço (Opcional)</TabsTrigger>
                    </TabsList>

                    <TabsContent value="1">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
                            <div className="md:col-span-2 space-y-2">
                                <Label htmlFor="name" className="font-semibold">
                                    Nome Completo <span className="text-destructive font-normal">(Obrigatório)</span>
                                </Label>
                                <IconInputWrapper icon={User}>
                                    <Input id="name" value={formData.name} onChange={(e) => updateField('name', e.target.value)} className="bg-muted shadow-inner pl-10" />
                                </IconInputWrapper>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="email" className="font-semibold">
                                    Email <span className="text-destructive font-normal">(Obrigatório)</span>
                                </Label>
                                <IconInputWrapper icon={Mail}>
                                    <Input id="email" type="email" value={formData.email} onChange={(e) => updateField('email', e.target.value)} className="bg-muted shadow-inner pl-10" />
                                </IconInputWrapper>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="phone" className="font-semibold">Telefone</Label>
                                <IconInputWrapper icon={Phone}>
                                    <InputMask
                                        mask="(99) 99999-9999" 
                                        value={formData.phone}
                                        onChange={(e) => updateField('phone', e.target.value)}
                                    >
                                        {(inputProps) => <Input {...inputProps} id="phone" className="bg-muted shadow-inner pl-10" />}
                                    </InputMask>
                                </IconInputWrapper>
                            </div>
                            
                            {/* --- INÍCIO DO BLOCO JSX DA DATA (ALTERADO) --- */}
                            <div className="space-y-2">
                                <Label htmlFor="birth_date" className="font-semibold">Data de Nascimento</Label>
                                <div className="flex w-full space-x-2">
                                    {/* 1. O Input para digitar */}
                                    <div className="flex-grow">
                                        <IconInputWrapper icon={CalendarIcon}>
                                            <InputMask
                                                mask="99/99/9999"
                                                placeholder="dd/mm/aaaa"
                                                value={localDateString}
                                                onChange={handleDateInputChange}
                                            >
                                                {(inputProps) => <Input {...inputProps} id="birth_date" className="bg-muted shadow-inner pl-10" />}
                                            </InputMask>
                                        </IconInputWrapper>
                                    </div>
                                </div>
                            </div>
                            {/* --- FIM DO BLOCO JSX DA DATA --- */}

                            <div className="space-y-2">
                                <Label htmlFor="gender" className="font-semibold">Gênero</Label>
                                <IconInputWrapper icon={Users}>
                                    <Select value={formData.gender} onValueChange={(value) => updateField('gender', value)}>
                                        <SelectTrigger className="bg-muted shadow-inner pl-10"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Masculino">Masculino</SelectItem>
                                            <SelectItem value="Feminino">Feminino</SelectItem>
                                            <SelectItem value="Outro">Outro</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </IconInputWrapper>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="cpf" className="font-semibold">CPF</Label>
                                <IconInputWrapper icon={FileText}>
                                    <InputMask
                                        mask="999.999.999-99"
                                        value={formData.cpf}
                                        onChange={(e) => updateField('cpf', e.target.value)}
                                    >
                                        {(inputProps) => <Input {...inputProps} id="cpf" className="bg-muted shadow-inner pl-10" />}
                                    </InputMask>
                                </IconInputWrapper>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="occupation" className="font-semibold">Profissão</Label>
                                <IconInputWrapper icon={Briefcase}>
                                    <Input id="occupation" value={formData.occupation} onChange={(e) => updateField('occupation', e.target.value)} className="bg-muted shadow-inner pl-10" />
                                </IconInputWrapper>
                            </div>
                            <div className="md:col-span-2 space-y-2">
                                <Label htmlFor="civil_status" className="font-semibold">Estado Civil</Label>
                                <IconInputWrapper icon={Heart}>
                                    <Select value={formData.civil_status} onValueChange={(value) => updateField('civil_status', value)}>
                                        <SelectTrigger className="bg-muted shadow-inner pl-10"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Solteiro(a)">Solteiro(a)</SelectItem>
                                            <SelectItem value="Casado(a)">Casado(a)</SelectItem>
                                            <SelectItem value="Divorciado(a)">Divorciado(a)</SelectItem>
                                            <SelectItem value="Viúvo(a)">Viúvo(a)</SelectItem>
                                            <SelectItem value="União Estável">União Estável</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </IconInputWrapper>
                            </div>
                            <div className="md:col-span-2 space-y-2">
                                <Label htmlFor="observations" className="font-semibold">Observações Iniciais</Label>
                                <IconInputWrapper icon={PenSquare}>
                                    <Textarea id="observations" value={formData.observations} onChange={(e) => updateField('observations', e.target.value)} className="bg-muted resize-none shadow-inner pl-10" />
                                </IconInputWrapper>
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="2">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-4">
                            <div className="md:col-span-1 space-y-2">
                                <Label htmlFor="cep" className="font-semibold">CEP</Label>
                                <IconInputWrapper icon={MapPin}>
                                    <InputMask
                                        mask="99999-999"
                                        value={formData.cep}
                                        onChange={(e) => updateField('cep', e.target.value)}
                                        onBlur={(e) => handleCepBlur(e.target.value)}
                                    >
                                        {(inputProps) => <Input {...inputProps} id="cep" className="bg-muted shadow-inner pl-10" />}
                                    </InputMask>
                                </IconInputWrapper>
                            </div>
                            <div className="md:col-span-2 space-y-2">
                                <Label htmlFor="street" className="font-semibold">Endereço (Rua, Av.)</Label>
                                <IconInputWrapper icon={Map}>
                                    <Input id="street" value={formData.street} onChange={(e) => updateField('street', e.target.value)} className="bg-muted shadow-inner pl-10" />
                                </IconInputWrapper>
                            </div>
                            <div className="md:col-span-1 space-y-2">
                                <Label htmlFor="number" className="font-semibold">Número</Label>
                                <IconInputWrapper icon={Hash}>
                                    <Input id="number" value={formData.number} onChange={(e) => updateField('number', e.target.value)} className="bg-muted shadow-inner pl-10" />
                                </IconInputWrapper>
                            </div>
                            <div className="md:col-span-2 space-y-2">
                                <Label htmlFor="complement" className="font-semibold">Complemento</Label>
                                <IconInputWrapper icon={Building2}>
                                    <Input id="complement" value={formData.complement} onChange={(e) => updateField('complement', e.target.value)} className="bg-muted shadow-inner pl-10" />
                                </IconInputWrapper>
                            </div>
                            <div className="md:col-span-1 space-y-2">
                                <Label htmlFor="neighborhood" className="font-semibold">Bairro</Label>
                                <IconInputWrapper icon={Home}>
                                    <Input id="neighborhood" value={formData.neighborhood} onChange={(e) => updateField('neighborhood', e.target.value)} className="bg-muted shadow-inner pl-10" />
                                </IconInputWrapper>
                            </div>
                            <div className="md:col-span-1 space-y-2">
                                <Label htmlFor="city" className="font-semibold">Cidade</Label>
                                <IconInputWrapper icon={Building}>
                                    <Input id="city" value={formData.city} onChange={(e) => updateField('city', e.target.value)} className="bg-muted shadow-inner pl-10" />
                                </IconInputWrapper>
                            </div>
                            <div className="md:col-span-1 space-y-2">
                                <Label htmlFor="state" className="font-semibold">Estado (UF)</Label>
                                <IconInputWrapper icon={Landmark}>
                                    <Input id="state" value={formData.state} onChange={(e) => updateField('state', e.target.value)} className="bg-muted shadow-inner pl-10" />
                                </IconInputWrapper>
                            </div>
                        </div>
                    </TabsContent>
                </Tabs>

                <DialogFooter>
                    <Button variant="outline" onClick={handleClose} disabled={loading}>
                        Cancelar
                    </Button>
                    <Button onClick={handleSavePatient} disabled={loading}>
                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        {loading ? "Enviando Convite..." : "Salvar e Enviar Convite"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default AddPatientModal;