import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

export function HubPanel({ title, description, action, children }) {
    return <Card className="min-w-0 rounded-xl border-[#d8d5d0] bg-white shadow-card">
        <CardHeader className="gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0"><CardTitle className="font-heading text-lg font-semibold leading-snug">{title}</CardTitle>{description && <CardDescription className="mt-1 text-xs leading-relaxed">{description}</CardDescription>}</div>
            {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
        </CardHeader>
        <CardContent className="p-4">{children}</CardContent>
    </Card>;
}

export function HubMetric({ label, value, detail }) {
    return <div className="min-w-0 rounded-lg border border-[#d8d5d0] bg-[#efeeec] px-3 py-2.5 shadow-inner">
        <p className="text-[13px] font-semibold leading-snug text-slate-600">{label}</p>
        <p className="mt-1 break-words text-lg font-semibold leading-tight text-slate-900">{value}</p>
        {detail && <p className="mt-1 text-xs leading-snug text-slate-500">{detail}</p>}
    </div>;
}
