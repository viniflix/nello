import React, { useState, useEffect } from 'react';
import { usePatientFormStore } from '@/stores/usePatientFormStore'; 
import InputMask from 'react-input-mask'; 
import { useAuth } from '@/contexts/AuthContext'; 
import { supabase } from '@/lib/customSupabaseClient'; 
import { useToast } from '@/components/ui/use-toast'; 

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"; 
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"; 
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { 
    Calendar as CalendarIcon, Loader2, User, Mail, Phone, Users, FileText, 
    Briefcase, Heart, PenSquare, MapPin, Map, Hash, Building2, Home, Building, Landmark,
    Smartphone, UserCircle, Layout, Lock, Info, CheckCircle2, UserPlus, ToggleLeft, ToggleRight
} from "lucide-react";
import { format, parse } from "date-fns";
import { ptBR } from 'date-fns/locale';
import { cn } from "@/lib/utils"; 
import { toPortugueseError } from '@/lib/utils/errorMessages';
import { motion, AnimatePresence } from 'framer-motion';

const IconInputWrapper = ({ icon: Icon, children }) => (
    <div className="relative">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        {children}
    </div>
);

// Assuming DateInputWithCalendar is a new component that needs to be defined or imported
// For the purpose of this edit, I'll create a placeholder that mimics the original functionality
// but uses the new props structure implied by the diff.
const DateInputWithCalendar = ({ value, onChange, required }) => {
    const [localDateString, setLocalDateString] = useState('');
    const [calendarOpen, setCalendarOpen] = useState(false);

    useEffect(() => {
        if (value) {
            const formattedDate = format(value, 'dd/MM/yyyy');
            if (localDateString !== formattedDate) {
                setLocalDateString(formattedDate);
            }
        } else if (!value && localDateString.length === 10) {
            // Keep local string if it was an invalid date being typed
        } else {
            setLocalDateString('');
        }
    }, [value]);

    const handleDateInputChange = (e) => {
        const dateStr = e.target.value;
        setLocalDateString(dateStr); 

        if (dateStr.replace(/[_/]/g, '').length === 8) {
            try {
                const parsedDate = parse(dateStr, 'dd/MM/yyyy', new Date());
                if (!isNaN(parsedDate) && parsedDate.getFullYear() > 1900 && parsedDate <= new Date()) {
                    onChange(parsedDate);
                } else {
                    onChange(null);
                }
            } catch {
                onChange(null);
            }
        } else if (dateStr.length === 0 || dateStr.replace(/[_/]/g, '').length === 0) {
            onChange(null);
        }
    };

    const handleDateSelect = (date) => {
        onChange(date); 
        setLocalDateString(date ? format(date, 'dd/MM/yyyy') : ''); 
        setCalendarOpen(false);
    };

    return (
        <div className="flex gap-2">
            <div className="relative flex-grow">
                <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <InputMask
                    mask="99/99/9999"
                    placeholder="dd/mm/aaaa"
                    value={localDateString}
                    onChange={handleDateInputChange}
                >
                    {(inputProps) => (
                        <Input 
                            {...inputProps} 
                            id="birth_date" 
                            className="bg-muted/50 focus:bg-background shadow-sm pl-10 h-10 transition-all border-muted-foreground/20" 
                            required={required} 
                        />
                    )}
                </InputMask>
            </div>
            
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                    <Button 
                        variant="outline" 
                        size="icon" 
                        className="h-10 w-10 shrink-0 bg-muted/30 hover:bg-primary/10 hover:text-primary border-muted-foreground/20 transition-colors"
                        type="button"
                    >
                        <CalendarIcon className="h-4 w-4" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                    <Calendar
                        mode="single"
                        selected={value}
                        onSelect={handleDateSelect}
                        initialFocus
                        locale={ptBR}
                        captionLayout="dropdown-buttons"
                        fromYear={1900}
                        toYear={new Date().getFullYear()}
                    />
                </PopoverContent>
            </Popover>
        </div>
    );
};


const AddPatientModal = ({ isOpen, setIsOpen, onPatientAdded }) => {
    const { user } = useAuth(); 
    const { toast } = useToast(); 
    const [step, setStep] = useState("1");
    
    const { formData, updateField, resetForm, fillAddress } = usePatientFormStore();
    const [loading, setLoading] = useState(false); 
    const [cepLoading, setCepLoading] = useState(false); 
    const [sendInvite, setSendInvite] = useState(true);

    // Derive isOffline from email content
    const isOffline = !formData.email || formData.email.trim() === '';

    // These handlers are now part of the DateInputWithCalendar component
    // const handleDateInputChange = (e) => {
    //     const dateStr = e.target.value;
    //     setLocalDateString(dateStr); 

    //     if (dateStr.length === 10) {
    //         try {
    //             const parsedDate = parse(dateStr, 'dd/MM/yyyy', new Date());
    //             if (!isNaN(parsedDate) && parsedDate.getFullYear() > 1900 && parsedDate < new Date()) {
    //                 updateField('birth_date', parsedDate);
    //             } else {
    //                 updateField('birth_date', null);
    //             }
    //         } catch {
    //             updateField('birth_date', null);
    //         }
    //     } else if (dateStr.length === 0) {
    //         updateField('birth_date', null);
    //     }
    // };

    // const handleDateSelect = (date) => {
    //     updateField('birth_date', date); 
    //     setLocalDateString(date ? format(date, 'dd/MM/yyyy') : ''); 
    //     setCalendarOpen(false);
    // };
    // --- FIM DAS ALTERAÇÕES ---

    const handleClose = () => {
        setIsOpen(false);
        resetForm();
        setStep("1");
        setSendInvite(true);
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
        if (!formData.name) {
            toast({ title: "Campo obrigatório", description: "Nome é obrigatório.", variant: "destructive" });
            setStep("1");
            return;
        }

        if (!isOffline && (!formData.email || !formData.birth_date)) {
            toast({
                title: "Campos obrigatórios",
                description: "Para convidar um paciente digitalmente, o e-mail e a data de nascimento são obrigatórios.",
                variant: "destructive",
            });
            setLoading(false);
            return;
        }

        setLoading(true);

        const addressData = formData.cep ? {
            cep: formData.cep, street: formData.street, number: formData.number,
            complement: formData.complement, neighborhood: formData.neighborhood,
            city: formData.city, state: formData.state,
        } : null;

        const defaultPassword = formData.birth_date 
            ? format(formData.birth_date, 'ddMMyy') 
            : Math.random().toString(36).slice(-8);

        const clean = (val) => typeof val === 'string' ? val.trim() : val;

        const metadata = {
            name: clean(formData.name), 
            user_type: 'patient', 
            nutritionist_id: user.id, 
            birth_date: formData.birth_date ? format(formData.birth_date, 'yyyy-MM-dd') : null,
            gender: formData.gender, 
            phone: clean(formData.phone), 
            cpf: clean(formData.cpf),
            occupation: clean(formData.occupation), 
            civil_status: formData.civil_status,
            observations: clean(formData.observations),
            needs_password_reset: true
        };

        if (addressData) {
            // Clean address string fields
            metadata.address = Object.fromEntries(
                Object.entries(addressData).map(([k, v]) => [k, clean(v)])
            );
        }
        
        const redirectTo = `${window.location.origin}/login`;

        const body = {
            email: isOffline ? null : clean(formData.email),
            metadata: metadata,
            redirectTo: redirectTo,
            defaultPassword: defaultPassword,
            isOffline: isOffline,
            sendInvite: sendInvite
        };

        try {
            // Chama a Edge Function 'create-patient'
            const { data, error: functionError } = await supabase.functions.invoke('create-patient', {
                body: JSON.stringify(body)
            });

            if (functionError) {
                const errorData = functionError.context ? await functionError.context.json() : null;
                if (errorData && errorData.error) {
                    throw new Error(errorData.error);
                }
                throw functionError;
            }

            if (isOffline && data?.data?.inviteCode) {
                toast({
                    title: "Paciente offline criado!",
                    description: `Código de acesso: ${data.data.inviteCode}. Salve este código para o paciente resgatar o perfil depois.`,
                    duration: 10000,
                });
            } else if (!isOffline && sendInvite) {
                toast({ title: "Sucesso!", description: `Convite enviado para ${formData.name}.`, variant: "success" });
            } else {
                toast({ title: "Sucesso!", description: `Paciente ${formData.name} adicionado.`, variant: "success" });
            }
            
            resetForm(); 
            onPatientAdded(); // Atualiza a lista na página
            handleClose(); 

        } catch (error) {
            toast({ title: "Erro ao adicionar paciente", description: toPortugueseError(error, 'Não foi possível adicionar o paciente.'), variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };
    
    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
                <DialogHeader className="pb-2">
                    <DialogTitle className="font-heading text-3xl font-black text-primary tracking-tight">
                        {isOffline ? "Novo Perfil Offline" : "Convidar Paciente"}
                    </DialogTitle>
                    <DialogDescription className="text-muted-foreground font-medium">
                        {isOffline 
                            ? "Crie um perfil para gestão interna dos dados do paciente." 
                            : "O paciente será cadastrado e receberá um acesso digital via e-mail."}
                    </DialogDescription>
                </DialogHeader>

                <Tabs value={step} onValueChange={setStep} className="w-full">
                    <TabsList className="grid w-full grid-cols-2 bg-muted/50 p-1 mb-4 h-12">
                        <TabsTrigger value="1" className="data-[state=active]:bg-background data-[state=active]:shadow-sm font-bold text-xs uppercase tracking-wider">
                            <User className="w-4 h-4 mr-2" /> Dados Pessoais
                        </TabsTrigger>
                        <TabsTrigger value="2" className="data-[state=active]:bg-background data-[state=active]:shadow-sm font-bold text-xs uppercase tracking-wider">
                            <MapPin className="w-4 h-4 mr-2" /> Endereço
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="1" className="mt-0 outline-none">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 py-2">
                            <div className="md:col-span-2 space-y-2.5">
                                <Label htmlFor="name" className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                    Nome Completo <span className="text-destructive">*</span>
                                </Label>
                                <IconInputWrapper icon={User}>
                                    <Input 
                                        id="name" 
                                        value={formData.name} 
                                        onChange={(e) => updateField('name', e.target.value)} 
                                        placeholder="Nome oficial do paciente"
                                        className="bg-muted/50 focus:bg-background shadow-sm pl-10 h-10 transition-all font-medium border-muted-foreground/20" 
                                    />
                                </IconInputWrapper>
                            </div>

                            <div className="space-y-2.5">
                                <Label htmlFor="email" className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                    E-mail {!isOffline && <span className="text-destructive">*</span>}
                                </Label>
                                <IconInputWrapper icon={Mail}>
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="exemplo@email.com"
                                        value={formData.email}
                                        onChange={(e) => updateField('email', e.target.value)}
                                        className="h-10 bg-muted/50 focus:bg-background shadow-sm pl-10 transition-all border-muted-foreground/20"
                                    />
                                </IconInputWrapper>
                            </div>

                            <div className="space-y-2.5">
                                <Label htmlFor="birth_date" className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                    Data de Nascimento {!isOffline && <span className="text-destructive">*</span>}
                                </Label>
                                <DateInputWithCalendar
                                    value={formData.birth_date}
                                    onChange={(date) => updateField('birth_date', date)}
                                    required={!isOffline}
                                />
                            </div>

                            {!isOffline && (
                                <motion.div 
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="md:col-span-2 bg-primary/5 border border-primary/20 rounded-xl p-4 flex gap-3 items-center"
                                >
                                    <div className="p-2 bg-primary/10 rounded-full shrink-0">
                                        <Lock className="w-4 h-4 text-primary" />
                                    </div>
                                    <p className="text-xs text-primary/80 leading-relaxed font-medium">
                                        <strong>Atenção:</strong> A senha inicial será a data de nascimento no formato **DDMMAA**. 
                                        <br />Ex: 07/08/2001 &rarr; <span className="font-mono bg-primary/10 px-1 rounded">070801</span>.
                                    </p>
                                </motion.div>
                            )}

                            <div className="space-y-2.5">
                                <Label htmlFor="phone" className="text-xs font-black uppercase tracking-widest text-muted-foreground">Telefone</Label>
                                <IconInputWrapper icon={Phone}>
                                    <InputMask
                                        mask="(99) 99999-9999" 
                                        value={formData.phone}
                                        onChange={(e) => updateField('phone', e.target.value)}
                                    >
                                        {(inputProps) => <Input {...inputProps} id="phone" className="bg-muted/50 focus:bg-background shadow-sm pl-10 h-10 border-muted-foreground/20" />}
                                    </InputMask>
                                </IconInputWrapper>
                            </div>

                            <div className="space-y-2.5">
                                <Label htmlFor="gender" className="text-xs font-black uppercase tracking-widest text-muted-foreground">Gênero</Label>
                                <div className="relative">
                                    <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
                                    <Select name="gender" value={formData.gender} onValueChange={(value) => updateField('gender', value)}>
                                        <SelectTrigger className="bg-muted/50 focus:bg-background shadow-sm pl-10 h-10 border-muted-foreground/20"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Masculino">Masculino</SelectItem>
                                            <SelectItem value="Feminino">Feminino</SelectItem>
                                            <SelectItem value="Outro">Outro</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="space-y-2.5">
                                <Label htmlFor="cpf" className="text-xs font-black uppercase tracking-widest text-muted-foreground">CPF</Label>
                                <IconInputWrapper icon={FileText}>
                                    <InputMask
                                        mask="999.999.999-99"
                                        value={formData.cpf}
                                        onChange={(e) => updateField('cpf', e.target.value)}
                                    >
                                        {(inputProps) => <Input {...inputProps} id="cpf" className="bg-muted/50 focus:bg-background shadow-sm pl-10 h-10 border-muted-foreground/20" />}
                                    </InputMask>
                                </IconInputWrapper>
                            </div>

                            <div className="space-y-2.5">
                                <Label htmlFor="occupation" className="text-xs font-black uppercase tracking-widest text-muted-foreground">Profissão</Label>
                                <IconInputWrapper icon={Briefcase}>
                                    <Input id="occupation" value={formData.occupation} onChange={(e) => updateField('occupation', e.target.value)} placeholder="Ex: Engenheiro" className="bg-muted/50 focus:bg-background shadow-sm pl-10 h-10 border-muted-foreground/20" />
                                </IconInputWrapper>
                            </div>

                            <div className="md:col-span-2 space-y-2.5">
                                <Label htmlFor="civil_status" className="text-xs font-black uppercase tracking-widest text-muted-foreground">Estado Civil</Label>
                                <div className="relative">
                                    <Heart className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
                                    <Select name="civil_status" value={formData.civil_status} onValueChange={(value) => updateField('civil_status', value)}>
                                        <SelectTrigger className="bg-muted/50 focus:bg-background shadow-sm pl-10 h-10 border-muted-foreground/20"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Solteiro(a)">Solteiro(a)</SelectItem>
                                            <SelectItem value="Casado(a)">Casado(a)</SelectItem>
                                            <SelectItem value="Divorciado(a)">Divorciado(a)</SelectItem>
                                            <SelectItem value="Viúvo(a)">Viúvo(a)</SelectItem>
                                            <SelectItem value="União Estável">União Estável</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="md:col-span-2 space-y-2.5">
                                <Label htmlFor="observations" className="text-xs font-black uppercase tracking-widest text-muted-foreground">Observações Iniciais</Label>
                                <IconInputWrapper icon={PenSquare}>
                                    <Textarea id="observations" value={formData.observations} onChange={(e) => updateField('observations', e.target.value)} placeholder="Anotações importantes..." className="bg-muted/50 focus:bg-background resize-none shadow-sm pl-10 transition-all border-muted-foreground/20 h-24" />
                                </IconInputWrapper>
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="2" className="mt-0 outline-none">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 py-2">
                            <div className="md:col-span-1 space-y-2.5">
                                <Label htmlFor="cep" className="text-xs font-black uppercase tracking-widest text-muted-foreground">CEP</Label>
                                <IconInputWrapper icon={MapPin}>
                                    <InputMask
                                        mask="99999-999"
                                        value={formData.cep}
                                        onChange={(e) => updateField('cep', e.target.value)}
                                        onBlur={(e) => handleCepBlur(e.target.value)}
                                    >
                                        {(inputProps) => <Input {...inputProps} id="cep" className="bg-muted/50 focus:bg-background shadow-sm pl-10 h-10 border-muted-foreground/20" />}
                                    </InputMask>
                                </IconInputWrapper>
                            </div>
                            <div className="md:col-span-2 space-y-2.5">
                                <Label htmlFor="street" className="text-xs font-black uppercase tracking-widest text-muted-foreground">Endereço (Rua, Av.)</Label>
                                <IconInputWrapper icon={Map}>
                                    <Input id="street" value={formData.street} onChange={(e) => updateField('street', e.target.value)} className="bg-muted/50 focus:bg-background shadow-sm pl-10 h-10 border-muted-foreground/20" />
                                </IconInputWrapper>
                            </div>
                            <div className="md:col-span-1 space-y-2.5">
                                <Label htmlFor="number" className="text-xs font-black uppercase tracking-widest text-muted-foreground">Número</Label>
                                <IconInputWrapper icon={Hash}>
                                    <Input id="number" value={formData.number} onChange={(e) => updateField('number', e.target.value)} className="bg-muted/50 focus:bg-background shadow-sm pl-10 h-10 border-muted-foreground/20" />
                                </IconInputWrapper>
                            </div>
                            <div className="md:col-span-2 space-y-2.5">
                                <Label htmlFor="complement" className="text-xs font-black uppercase tracking-widest text-muted-foreground">Complemento</Label>
                                <IconInputWrapper icon={Building2}>
                                    <Input id="complement" value={formData.complement} onChange={(e) => updateField('complement', e.target.value)} className="bg-muted/50 focus:bg-background shadow-sm pl-10 h-10 border-muted-foreground/20" />
                                </IconInputWrapper>
                            </div>
                            <div className="md:col-span-1 space-y-2.5">
                                <Label htmlFor="neighborhood" className="text-xs font-black uppercase tracking-widest text-muted-foreground">Bairro</Label>
                                <IconInputWrapper icon={Home}>
                                    <Input id="neighborhood" value={formData.neighborhood} onChange={(e) => updateField('neighborhood', e.target.value)} className="bg-muted/50 focus:bg-background shadow-sm pl-10 h-10 border-muted-foreground/20" />
                                </IconInputWrapper>
                            </div>
                            <div className="md:col-span-1 space-y-2.5">
                                <Label htmlFor="city" className="text-xs font-black uppercase tracking-widest text-muted-foreground">Cidade</Label>
                                <IconInputWrapper icon={Building}>
                                    <Input id="city" value={formData.city} onChange={(e) => updateField('city', e.target.value)} className="bg-muted/50 focus:bg-background shadow-sm pl-10 h-10 border-muted-foreground/20" />
                                </IconInputWrapper>
                            </div>
                            <div className="md:col-span-1 space-y-2.5">
                                <Label htmlFor="state" className="text-xs font-black uppercase tracking-widest text-muted-foreground">Estado (UF)</Label>
                                <IconInputWrapper icon={Landmark}>
                                    <Input id="state" value={formData.state} onChange={(e) => updateField('state', e.target.value)} className="bg-muted/50 focus:bg-background shadow-sm pl-10 h-10 border-muted-foreground/20" />
                                </IconInputWrapper>
                            </div>
                        </div>
                    </TabsContent>
                </Tabs>

                <DialogFooter className="mt-4 pt-4 border-t gap-3">
                    <Button variant="ghost" onClick={handleClose} disabled={loading} className="font-bold text-xs uppercase tracking-widest h-11 px-6">
                        Cancelar
                    </Button>
                    <Button 
                        onClick={handleSavePatient} 
                        disabled={loading}
                        className="font-bold text-xs uppercase tracking-widest bg-primary hover:bg-primary/90 h-11 px-8 shadow-lg shadow-primary/20"
                    >
                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                        {loading ? "Processando..." : (isOffline ? "Salvar Perfil" : "Salvar e Convidar")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default AddPatientModal;