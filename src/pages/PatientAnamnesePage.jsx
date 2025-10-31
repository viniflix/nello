// src/pages/PatientAnamnesePage.jsx

import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Plus } from 'lucide-react';

const PatientAnamnesePage = () => {
    const { patientId } = useParams();
    // (Lógica futura para buscar 'patient', 'fields' e 'answers' virá aqui)

    return (
        <div className="flex flex-col min-h-screen bg-background-page">
            <header className="bg-card/80 backdrop-blur-md border-b border-border p-4 sticky top-0 z-10">
                <div className="max-w-4xl mx-auto flex items-center justify-between">
                    <Button asChild variant="ghost" size="sm">
                        <Link to={`/nutritionist/patients/${patientId}/hub`}>
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Voltar para o Hub do Paciente
                        </Link>
                    </Button>
                </div>
            </header>
            
            <main className="max-w-4xl mx-auto w-full p-4 md:p-8">
                <Card className="bg-card shadow-figma-btn rounded-xl">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle className="font-clash text-2xl font-semibold text-primary">
                                Anamnese
                            </CardTitle>
                            <CardDescription style={{ color: '#B99470' }}>
                                Perguntas customizadas e histórico do paciente.
                            </CardDescription>
                        </div>
                        <Button>
                            <Plus className="w-4 h-4 mr-2" />
                            Adicionar Pergunta
                        </Button>
                    </CardHeader>
                    <CardContent>
                        <p className="text-muted-foreground text-center py-8">
                            (Módulo de Anamnese Modular em construção)
                        </p>
                        {/* Aqui vamos renderizar os campos de 'anamnese_fields'
                          e preenchê-los com os dados de 'anamnese_answers'
                        */}
                    </CardContent>
                </Card>
            </main>
        </div>
    );
};

export default PatientAnamnesePage;