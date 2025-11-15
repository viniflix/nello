import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const AlertsPage = () => {
    const { user, signOut } = useAuth();

    return (
        <div className="flex flex-col min-h-screen bg-background">
            
            <main className="max-w-4xl mx-auto w-full p-4 md:p-8">
                <div className="mb-4">
                    <Button asChild variant="outline" size="sm">
                        <Link to="/nutritionist">
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Voltar ao Dashboard
                        </Link>
                    </Button>
                </div>

                <Card className="bg-card shadow-card-dark rounded-xl">
                    <CardHeader>
                        <CardTitle className="font-clash text-2xl font-semibold text-primary">
                            Alertas e Notificações
                        </CardTitle>
                        <CardDescription className="text-muted-foreground">
                            Avisos importantes, aniversários e pendências.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-muted-foreground text-center py-8">
                            (Módulo de Alertas em construção)
                        </p>
                        {/* Aqui listaremos no futuro:
                          - Aniversariantes do dia
                          - Consultas de hoje
                          - Mensagens de chat não lidas
                        */}
                    </CardContent>
                </Card>
            </main>
        </div>
    );
};

export default AlertsPage;