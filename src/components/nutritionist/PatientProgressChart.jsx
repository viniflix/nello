
import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';

const PatientProgressChart = ({ patientId, prescription }) => {
    const [totals, setTotals] = useState({ calories: 0, protein: 0, fat: 0, carbs: 0 });

    useEffect(() => {
        const fetchTodayEntries = async () => {
            if (!patientId) return;

            const today = new Date().toISOString().split('T')[0];
            const { data, error } = await supabase
                .from('meals')
                .select('total_calories, total_protein, total_fat, total_carbs')
                .eq('patient_id', patientId)
                .eq('meal_date', today);

            if (error) {
                console.error("Error fetching entries for progress chart", error);
                return;
            }

            const dailyTotals = data.reduce((acc, entry) => {
                acc.calories += entry.total_calories || 0;
                acc.protein += entry.total_protein || 0;
                acc.fat += entry.total_fat || 0;
                acc.carbs += entry.total_carbs || 0;
                return acc;
            }, { calories: 0, protein: 0, fat: 0, carbs: 0 });

            setTotals(dailyTotals);
        };

        fetchTodayEntries();
    }, [patientId]);

    if (!prescription) {
        return <div className="text-xs text-muted-foreground mt-2 text-center">Sem metas de dieta definidas para hoje.</div>;
    }

    return (
        <div className="w-full">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-center">
                <div className="bg-muted/50 rounded-md p-1">
                    <p className="text-xs text-muted-foreground">Calorias</p>
                    <p className="font-bold text-sm">{`${Math.round(totals.calories)} / ${Math.round(prescription.calories)}`}</p>
                </div>
                <div className="bg-muted/50 rounded-md p-1">
                    <p className="text-xs text-muted-foreground">Proteínas</p>
                    <p className="font-bold text-sm">{`${Math.round(totals.protein)} / ${Math.round(prescription.protein)}g`}</p>
                </div>
                <div className="bg-muted/50 rounded-md p-1">
                    <p className="text-xs text-muted-foreground">Gorduras</p>
                    <p className="font-bold text-sm">{`${Math.round(totals.fat)} / ${Math.round(prescription.fat)}g`}</p>
                </div>
                <div className="bg-muted/50 rounded-md p-1">
                    <p className="text-xs text-muted-foreground">Carboidratos</p>
                    <p className="font-bold text-sm">{`${Math.round(totals.carbs)} / ${Math.round(prescription.carbs)}g`}</p>
                </div>
            </div>
        </div>
    );
};

export default PatientProgressChart;
