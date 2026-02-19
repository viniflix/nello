import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Settings, User, Calendar, DollarSign, Key, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import ProfilePersonalTab from '@/components/profile/ProfilePersonalTab';
import ProfileAgendaTab from '@/components/profile/ProfileAgendaTab';
import ProfileFinancialTab from '@/components/profile/ProfileFinancialTab';

const NutritionistProfilePage = () => {
    const { user, updateUserProfile } = useAuth();
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState(null);

    useEffect(() => {
        if (user) {
            if (user.profile) {
                setProfile(user.profile);
            } else {
                // Se não houver profile, criar um objeto vazio para evitar erro
                setProfile({});
            }
            setLoading(false);
        }
    }, [user]);

    const handleProfileUpdate = (updatedProfile) => {
        setProfile(updatedProfile);
        if (updateUserProfile) {
            updateUserProfile(updatedProfile);
        }
    };

    if (loading || !user) {
        return (
            <div className="flex items-center justify-center h-screen">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    // Se não houver profile, usar objeto vazio
    const currentProfile = profile || {};

    return (
        <div className="min-h-screen bg-background overflow-x-hidden">
            <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-8 min-w-0">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="space-y-6 min-w-0"
                >
                    {/* Header */}
                    <Card className="overflow-hidden">
                        <CardHeader>
                            <div className="flex flex-col sm:flex-row sm:items-center gap-4 min-w-0">
                                <div className="p-3 rounded-lg bg-primary/10 shrink-0">
                                    <Settings className="w-7 h-7 md:w-8 md:h-8 text-primary" />
                                </div>
                                <div className="min-w-0">
                                    <CardTitle className="text-2xl md:text-3xl break-words">Ajustes do Consultório</CardTitle>
                                    <CardDescription className="text-sm md:text-base mt-1">
                                        Configure todas as informações e preferências do seu consultório em um só lugar
                                    </CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                    </Card>

                    {/* Tabs */}
                    <Card>
                        <CardContent className="p-0">
                            <Tabs defaultValue="personal" className="w-full">
                                <TabsList className="grid w-full grid-cols-4 h-auto p-1">
                                    <TabsTrigger value="personal" className="flex items-center gap-2 py-3">
                                        <User className="w-4 h-4" />
                                        <span className="hidden sm:inline">Dados & Branding</span>
                                        <span className="sm:hidden">Dados</span>
                                    </TabsTrigger>
                                    <TabsTrigger value="agenda" className="flex items-center gap-2 py-3">
                                        <Calendar className="w-4 h-4" />
                                        <span className="hidden sm:inline">Agenda & Horários</span>
                                        <span className="sm:hidden">Agenda</span>
                                    </TabsTrigger>
                                    <TabsTrigger value="financial" className="flex items-center gap-2 py-3">
                                        <DollarSign className="w-4 h-4" />
                                        <span className="hidden sm:inline">Financeiro & Serviços</span>
                                        <span className="sm:hidden">Financeiro</span>
                                    </TabsTrigger>
                                    <TabsTrigger value="account" className="flex items-center gap-2 py-3">
                                        <Key className="w-4 h-4" />
                                        <span className="hidden sm:inline">Conta</span>
                                        <span className="sm:hidden">Conta</span>
                                    </TabsTrigger>
                                </TabsList>

                                <div className="p-6">
                                    <TabsContent value="personal" className="mt-0">
                                        <ProfilePersonalTab
                                            profile={currentProfile}
                                            onUpdate={handleProfileUpdate}
                                        />
                                    </TabsContent>

                                    <TabsContent value="agenda" className="mt-0">
                                        <ProfileAgendaTab
                                            userId={user.id}
                                            onUpdate={handleProfileUpdate}
                                        />
                                    </TabsContent>

                                    <TabsContent value="financial" className="mt-0">
                                        <ProfileFinancialTab
                                            userId={user.id}
                                            onUpdate={handleProfileUpdate}
                                        />
                                    </TabsContent>

                                    <TabsContent value="account" className="mt-0">
                                        <Card>
                                            <CardHeader>
                                                <CardTitle>Configurações da Conta</CardTitle>
                                                <CardDescription>
                                                    Gerencie sua senha e preferências de conta
                                                </CardDescription>
                                            </CardHeader>
                                            <CardContent className="space-y-4">
                                                <div className="space-y-2">
                                                    <p className="text-sm font-medium">E-mail</p>
                                                    <p className="text-sm text-muted-foreground">{user.email}</p>
                                                </div>
                                                <div className="pt-4 border-t">
                                                    <p className="text-sm text-muted-foreground mb-4">
                                                        Para alterar sua senha, entre em contato com o suporte ou use a funcionalidade de recuperação de senha na página de login.
                                                    </p>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </TabsContent>
                                </div>
                            </Tabs>
                        </CardContent>
                    </Card>
                </motion.div>
            </main>
        </div>
    );
};

export default NutritionistProfilePage;
