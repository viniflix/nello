import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, User, Check, AlertCircle, ArrowRight, Activity, Smartphone, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getInviteDetails } from '@/lib/supabase/patient-queries';
import { supabase } from '@/lib/customSupabaseClient';
import { toPortugueseError } from '@/lib/utils/errorMessages';

const RedeemDeepLinkPage = () => {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    const navigate = useNavigate();
    const { toast } = useToast();
    const { user, signUp, signOut } = useAuth();

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [inviteData, setInviteData] = useState(null);
    const [error, setError] = useState(null);

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        confirmPassword: ''
    });
    const [honeypot, setHoneypot] = useState(''); // Anti-spam bot trap

    useEffect(() => {
        if (!token) {
            navigate('/login');
            return;
        }

        const fetchDetails = async () => {
            setLoading(true);
            const res = await getInviteDetails(token);
            if (!res.success) {
                setError(res.message);
            } else {
                setInviteData(res.data);
                setFormData(prev => ({ ...prev, name: res.data.patient_name || '' }));
            }
            setLoading(false);
        };

        fetchDetails();
    }, [token, navigate]);

    const handleInputChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const getPronoun = (gender) => {
        if (gender === 'female') return 'sua nutricionista';
        if (gender === 'male') return 'seu nutricionista';
        return 'seu(ua) nutricionista';
    };

    // Fluxo 1: Deslogado -> Criação Simples
    const handleRegisterSubmit = async (e) => {
        e.preventDefault();

        // 0. Anti-spam: Honeypot (se preenchido, rejeita silenciosamente)
        if (honeypot) {
            console.warn('Bot detectado.');
            return;
        }
        
        const cleanName = formData.name.trim();
        const cleanEmail = formData.email.trim();

        // 1. Sanitização Básica (Proteção contra injeções de script/HTML)
        const htmlTagRegex = /<[^>]*>?/gm;
        if (htmlTagRegex.test(cleanName) || htmlTagRegex.test(cleanEmail)) {
            toast({ title: "Acesso Negado", description: "Caracteres inválidos detectados.", variant: "destructive" });
            return;
        }

        // 2. Formato de Email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(cleanEmail)) {
            toast({ title: "Erro", description: "Por favor, insira um e-mail válido.", variant: "destructive" });
            return;
        }

        // 3. Força e Igualdade da Senha
        if (formData.password.length < 6) {
            toast({ title: "Atenção", description: "A senha deve conter pelo menos 6 caracteres.", variant: "destructive" });
            return;
        }

        if (formData.password !== formData.confirmPassword) {
            toast({ title: "Erro", description: "As senhas não coincidem.", variant: "destructive" });
            return;
        }

        setSubmitting(true);
        const profileData = {
            full_name: cleanName,
            name: cleanName,
            display_name: cleanName,
            role: 'patient',
            user_type: 'patient'
        };

        const { data, error } = await signUp({
            email: cleanEmail,
            password: formData.password,
            options: {
                data: profileData,
                emailRedirectTo: `${window.location.origin}/auth/v1/verify?redirect_to=${window.location.origin}/patient`,
            }
        });

        if (error) {
            toast({ title: "Erro no cadastro", description: toPortugueseError(error), variant: "destructive" });
            setSubmitting(false);
            return;
        }

        // Armazena no localStorage. O AuthContext processa automaticamente após o login
        localStorage.setItem('pending_invite_code', token);
        
        toast({
            title: "Conta criada com sucesso!",
            description: "Você já pode acessar seu Prontuário Digital.",
        });
        navigate('/login');
    };

    // Fluxo 2: Logado -> Validação de Conflito e Vinculação
    const handleAcceptAsLoggedIn = async () => {
        setSubmitting(true);
        try {
            const { data, error } = await supabase.rpc('redeem_invite_code', { input_code: token });
            if (error) throw error;
            
            toast({
                title: "Vínculo concluído!",
                description: `Você agora está vinculado a ${inviteData.nutritionist_name}.`,
            });
            navigate('/patient');
        } catch (err) {
            toast({
                title: "Falha ao vincular",
                description: err.message?.includes('inválido') ? 'Convite expirado ou inválido.' : toPortugueseError(err),
                variant: 'destructive'
            });
            setSubmitting(false);
        }
    };

    const handleSwitchAccount = async () => {
        await signOut();
        window.location.reload(); // Recarrega para limpar estado e voltar à tela Deslogada
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background p-4">
                <div className="animate-pulse flex flex-col items-center">
                    <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4" />
                    <p className="text-muted-foreground">Validando convite...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background p-4">
                <Card className="w-full max-w-md shadow-lg border-red-100 dark:border-red-900/30">
                    <CardHeader className="text-center pb-2">
                        <div className="mx-auto w-12 h-12 bg-red-100 dark:bg-red-900/50 rounded-full flex items-center justify-center mb-4">
                            <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
                        </div>
                        <CardTitle className="text-xl">Convite Inválido ou Expirado</CardTitle>
                        <CardDescription className="pt-2 text-base">
                            Este link parece já ter sido utilizado ou foi cancelado.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-4 flex flex-col gap-4">
                        <p className="text-sm text-center text-muted-foreground">
                            Se você já se cadastrou usando este link antes, basta fazer o login na sua conta para acessar seu plano.
                        </p>
                        <Button className="w-full h-11" onClick={() => navigate('/login')}>
                            Fazer Login
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // Tela para usuários já LOGADOS
    if (user && inviteData) {
        // Warning: Nomes diferentes!
        const isDifferentPerson = user.profile?.name?.split(' ')[0].toLowerCase() !== inviteData.patient_name?.split(' ')[0].toLowerCase();
        
        return (
            <div className="min-h-screen flex items-center justify-center bg-background p-4">
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md">
                    <Card className="shadow-xl border-primary/20">
                        <CardHeader className="text-center pb-4">
                            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-2">
                                <User className="w-8 h-8 text-primary" />
                            </div>
                            <CardTitle className="text-2xl mt-2">Você já está logado!</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <Alert className="bg-muted/50">
                                <AlertCircle className="h-4 w-4" />
                                <AlertTitle>Atenção ao vincular</AlertTitle>
                                <AlertDescription>
                                    Este convite de acompanhamento foi enviado por <strong>{inviteData.nutritionist_name}</strong> para o paciente chamado <strong>{inviteData.patient_name}</strong>.
                                </AlertDescription>
                            </Alert>
                            
                            <div className="bg-card border rounded-lg p-4 space-y-3">
                                <div className="text-sm">Sua conta atual logada:</div>
                                <div className="font-semibold text-lg flex items-center gap-2">
                                    <div className="w-8 h-8 bg-black dark:bg-white text-white dark:text-black rounded-full flex items-center justify-center text-sm">
                                        {user.profile?.name?.charAt(0)}
                                    </div>
                                    {user.profile?.name} {isDifferentPerson && <span className="text-xs font-normal text-red-500">(Nomes Divergentes)</span>}
                                </div>
                            </div>

                            {isDifferentPerson && (
                                <p className="text-sm text-red-500/90 text-center font-medium px-4">
                                    Parece que você está logado em uma conta diferente da pessoa destinada a este convite. Se você aceitar, seu acesso será fundido ao deste convite.
                                </p>
                            )}

                            <div className="space-y-3 pt-2">
                                <Button 
                                    className="w-full h-11 text-base font-semibold" 
                                    onClick={handleAcceptAsLoggedIn} 
                                    disabled={submitting}
                                >
                                    {submitting ? "Vinculando..." : "Sim, confirmar vínculo nesta conta"}
                                </Button>
                                <Button 
                                    variant="outline" 
                                    className="w-full h-11 border-muted-foreground/30 hover:bg-muted"
                                    onClick={handleSwitchAccount}
                                >
                                    <LogOut className="w-4 h-4 mr-2" />
                                    Sair e criar conta para {inviteData.patient_name?.split(' ')[0]}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            </div>
        );
    }

    // Tela Principal para Usuários DESLOGADOS
    return (
        <div className="min-h-screen grid lg:grid-cols-2 bg-background">
            {/* Coluna Esquerda: Texto e Valor */}
            <div className="hidden lg:flex flex-col justify-center px-16 bg-muted/30 border-r border-border relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-10 blur-3xl pointer-events-none">
                    <div className="w-96 h-96 bg-primary rounded-full" />
                </div>
                
                <div className="z-10 max-w-lg space-y-6">
                    <img 
                        src="https://afyoidxrshkmplxhcyeh.supabase.co/storage/v1/object/public/IDV/HIPOZERO%20(2).png" 
                        alt="HipoZero" 
                        className="h-10 w-auto mb-8"
                    />
                    
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                        <Badge variant="outline" className="text-primary border-primary/30 bg-primary/5 uppercase tracking-widest text-[10px] px-3 py-1">
                            Acesso Exclusivo
                        </Badge>
                        <h1 className="text-4xl font-black tracking-tight text-foreground leading-tight">
                            Seu Plano Alimentar está pronto para acesso.
                        </h1>
                        <p className="text-lg text-muted-foreground">
                            {getPronoun(inviteData?.nutritionist_gender)} <strong>{inviteData?.nutritionist_name}</strong> montou e liberou o seu acompanhamento completo no HipoZero.
                        </p>
                    </motion.div>

                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="pt-8 space-y-6">
                        <h3 className="font-semibold text-foreground">Vantagens de acessar na plataforma:</h3>
                        <ul className="space-y-4">
                            {[
                                { icon: Smartphone, text: 'Acesse seu cardápio sempre atualizado direto do celular, a qualquer hora.' },
                                { icon: Activity, text: 'Acompanhe seu próprio progresso, compare medidas e fotos evolução.' },
                                { icon: Check, text: 'Valide suas refeições diárias e envie feedback rápido para seu nutricionista.' }
                            ].map((item, idx) => (
                                <li key={idx} className="flex gap-3 text-muted-foreground">
                                    <div className="mt-1 w-6 h-6 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
                                        <item.icon className="w-3.5 h-3.5 text-primary" />
                                    </div>
                                    <span className="text-sm leading-relaxed">{item.text}</span>
                                </li>
                            ))}
                        </ul>
                    </motion.div>
                </div>
            </div>

            {/* Coluna Direita: O Formulário */}
            <div className="flex flex-col justify-center p-6 sm:p-12 h-screen overflow-y-auto w-full">
                {/* Mobile Heading */}
                <div className="lg:hidden mb-8 text-center space-y-4">
                    <img 
                        src="https://afyoidxrshkmplxhcyeh.supabase.co/storage/v1/object/public/IDV/HIPOZERO%20(2).png" 
                        alt="HipoZero" 
                        className="h-10 w-auto mx-auto mb-4"
                    />
                    <h1 className="text-2xl font-black text-foreground max-w-[280px] mx-auto">
                        Seu Plano Alimentar está pronto
                    </h1>
                    <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                        {getPronoun(inviteData?.nutritionist_gender)} <strong>{inviteData?.nutritionist_name}</strong> liberou seu acesso.
                    </p>
                </div>

                <motion.div 
                    initial={{ opacity: 0, x: 20 }} 
                    animate={{ opacity: 1, x: 0 }} 
                    transition={{ delay: 0.1 }}
                    className="w-full max-w-sm mx-auto"
                >
                    <Card className="border-0 shadow-none bg-transparent">
                        <CardHeader className="px-0 pt-0 pb-6">
                            <CardTitle className="text-xl font-bold">Quase lá!</CardTitle>
                            <CardDescription>
                                Crie uma senha para proteger seus dados e começar.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="px-0">
                            <form onSubmit={handleRegisterSubmit} className="space-y-4">
                                {/* Anti-Spam Honeypot Field */}
                                <div style={{ display: 'none' }} aria-hidden="true">
                                    <Input
                                        type="text"
                                        name="alt_email"
                                        tabIndex="-1"
                                        autoComplete="off"
                                        value={honeypot}
                                        onChange={(e) => setHoneypot(e.target.value)}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-sm font-semibold">Nome</Label>
                                    <div className="relative">
                                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                        <Input
                                            type="text"
                                            required
                                            maxLength={100}
                                            value={formData.name}
                                            onChange={(e) => handleInputChange('name', e.target.value)}
                                            className="pl-10 h-11 bg-background"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-sm font-semibold">E-mail</Label>
                                    <div className="relative">
                                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                        <Input
                                            type="email"
                                            required
                                            maxLength={120}
                                            placeholder="seu@melhoremail.com"
                                            value={formData.email}
                                            onChange={(e) => handleInputChange('email', e.target.value)}
                                            className="pl-10 h-11 bg-background"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3 pt-1">
                                    <div className="space-y-2">
                                        <Label className="text-sm font-semibold text-muted-foreground">Nova Senha</Label>
                                        <Input
                                            type="password"
                                            required
                                            maxLength={72}
                                            placeholder="••••••••"
                                            value={formData.password}
                                            onChange={(e) => handleInputChange('password', e.target.value)}
                                            className="h-11 bg-background"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-sm font-semibold text-muted-foreground">Confirmar</Label>
                                        <Input
                                            type="password"
                                            required
                                            maxLength={72}
                                            placeholder="••••••••"
                                            value={formData.confirmPassword}
                                            onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                                            className="h-11 bg-background"
                                        />
                                    </div>
                                </div>

                                <Button
                                    type="submit"
                                    className="w-full h-12 text-base font-bold mt-6 group"
                                    disabled={submitting}
                                >
                                    {submitting ? "Acessando..." : "Ver Meu Plano Agora"}
                                    {!submitting && <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />}
                                </Button>
                                
                                <p className="text-[11px] text-center text-muted-foreground mt-4 px-4 leading-tight">
                                    Ao acessar, você concorda em compartilhar seus dados clínicos com seu(ua) nutricionista.
                                </p>
                            </form>
                        </CardContent>
                    </Card>
                </motion.div>
            </div>
        </div>
    );
};

// Helper simples só pro icone no Header
function Badge({ variant, className, children }) {
    return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${className}`}>{children}</span>
}

export default RedeemDeepLinkPage;
