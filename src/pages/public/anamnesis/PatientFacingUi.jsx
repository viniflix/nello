import React from 'react';
import { useParams } from 'react-router-dom';

export default function PatientFacingUi() {
    const { token } = useParams();

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <div className="w-full max-w-2xl bg-white rounded-xl shadow-sm border p-8 text-center space-y-4">
                <div className="mx-auto w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center text-2xl mb-6">
                    📋
                </div>
                <h1 className="text-2xl font-bold text-slate-800">Ficha Clínica Web</h1>
                <p className="text-slate-500">
                    Sua nutricionista solicitou informações prévias (Token ID: {token || 'N/A'}).
                </p>
                <div className="py-12 bg-slate-50 rounded-lg mt-6 border border-dashed">
                    <p className="text-sm font-medium text-slate-400">Em Construção (Sprint 4)</p>
                </div>
            </div>
        </div>
    );
}
