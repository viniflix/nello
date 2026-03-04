import React, { createContext, useContext } from 'react';
import { Link } from 'react-router-dom';
import { useResolvedPatientId } from '@/hooks/useResolvedPatientId';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export const PatientIdContext = createContext(null);

export function usePatientIdFromResolver() {
    return useContext(PatientIdContext);
}

/**
 * Wrapper que resolve slug/UUID para patientId e renderiza children com contexto.
 * Usado em páginas de paciente (anthropometry, meal-plan, etc.)
 */
export default function PatientPageResolver({ children, fallback = null }) {
    const { patientId, loading, error, paramValue } = useResolvedPatientId();
    const slugNotFound = !loading && !patientId && paramValue;

    if (loading && !patientId) {
        if (fallback) return fallback;
        return (
            <div className="min-h-screen bg-background p-4">
                <Skeleton className="h-10 w-48 mb-4" />
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }
    if (error || slugNotFound) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] p-4">
                <Alert variant="destructive" className="max-w-md mb-6">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                        Paciente não encontrado ou você não tem permissão para visualizá-lo.
                    </AlertDescription>
                </Alert>
                <Button asChild variant="outline">
                    <Link to="/nutritionist/patients">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Voltar para Pacientes
                    </Link>
                </Button>
            </div>
        );
    }
    return (
        <PatientIdContext.Provider value={patientId}>
            {children}
        </PatientIdContext.Provider>
    );
}
