import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import { supabase } from '@/infrastructure/supabase/client';
import { logDiagnostic } from '@/infrastructure/observability/safeLogger';

export default function TopPatientsWidget({ nutritionistId, refreshKey = 0 }) {
    const [rows, setRows] = useState([]);
    const [state, setState] = useState('loading');
    const request = useRef(0);
    const load = useCallback(async () => {
        const sequence = ++request.current;
        setRows([]); setState('loading');
        if (!nutritionistId) { setState('empty'); return; }
        try {
            const { data, error } = await supabase.rpc('get_top_financial_patients', { p_limit: 3 });
            if (error) throw error;
            if (sequence !== request.current) return;
            setRows(data || []); setState('ready');
        } catch (error) {
            if (sequence !== request.current) return;
            logDiagnostic('warn', 'financial/top-patients', 'Ranking query failed', { code: error?.code || 'unknown' });
            setState('error');
        }
    }, [nutritionistId]);
    useEffect(() => { void load(); return () => { request.current++; }; }, [load, refreshKey]);
    return <Card className="min-w-0 rounded-2xl bg-card shadow-sm">
        <CardHeader className="pb-3"><CardTitle className="font-sans text-base font-semibold">Recebimentos por paciente</CardTitle><CardDescription>Recebimentos líquidos acumulados · todos os períodos (LTV)</CardDescription></CardHeader>
        <CardContent>
            {state === 'loading' ? <p role="status" className="text-sm text-muted-foreground">Carregando ranking…</p>
                : state === 'error' ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 text-sm"><span>Não foi possível carregar o ranking.</span><Button variant="outline" onClick={load}>Tentar novamente</Button></div>
                    : !rows.length ? <p className="text-sm text-muted-foreground">Nenhum dado disponível</p>
                        : <ol className="grid gap-3 lg:grid-cols-3">{rows.map((row, index) => <li key={row.patient_id} className="flex min-w-0 items-center gap-3 rounded-xl border p-4"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium" aria-label={`${index + 1}º lugar`}>{index + 1}</span><div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{row.patient_name || 'Paciente não identificado'}</p><p className="mt-1 break-all text-base font-semibold tabular-nums">{formatCurrency(Number(row.total) || 0)}</p></div></li>)}</ol>}
        </CardContent>
    </Card>;
}
