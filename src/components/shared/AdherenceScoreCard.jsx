import React from 'react';

const AdherenceScoreCard = ({ percentage, period = "Desempenho Atual" }) => {
  const pct = Number(percentage) || 0;
  
  let colorClass = 'bg-red-500';
  let textClass = 'text-red-700';
  let badgeClass = 'bg-red-50 border-red-200';
  let label = 'Atenção Necessária';
  
  if (pct >= 80) {
    colorClass = 'bg-green-500';
    textClass = 'text-green-700';
    badgeClass = 'bg-green-50 border-green-200';
    label = 'Excelente Aderência';
  } else if (pct >= 50) {
    colorClass = 'bg-amber-500';
    textClass = 'text-amber-700';
    badgeClass = 'bg-amber-50 border-amber-200';
    label = 'Aderência Razoável';
  }

  return (
    <div className={`p-4 rounded-xl border ${badgeClass} flex flex-col gap-3 transition-colors`}>
      <div className="flex justify-between items-start">
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{period}</span>
          <span className={`text-sm font-medium ${textClass}`}>{label}</span>
        </div>
        <span className={`text-3xl font-bold tracking-tight ${textClass}`}>
          {Math.round(pct)}%
        </span>
      </div>
      
      <div className="h-2.5 w-full bg-black/5 rounded-full overflow-hidden shadow-inner">
        <div 
          className={`h-full ${colorClass} transition-all duration-1000 ease-out`} 
          style={{ width: `${pct}%` }} 
        />
      </div>
    </div>
  );
};

export default AdherenceScoreCard;
