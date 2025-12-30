import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ACTIVITY_FACTORS } from '@/lib/utils/energy-calculations';
import { 
    Sofa, 
    Footprints, 
    Activity, 
    Dumbbell, 
    Zap 
} from 'lucide-react';

const ACTIVITY_ICONS = {
    1.2: Sofa,
    1.375: Footprints,
    1.55: Activity,
    1.725: Dumbbell,
    1.9: Zap
};

const ACTIVITY_COLORS = {
    1.2: 'border-gray-300 bg-gray-50 hover:bg-gray-100',
    1.375: 'border-blue-300 bg-blue-50 hover:bg-blue-100',
    1.55: 'border-green-300 bg-green-50 hover:bg-green-100',
    1.725: 'border-orange-300 bg-orange-50 hover:bg-orange-100',
    1.9: 'border-purple-300 bg-purple-50 hover:bg-purple-100'
};

const SELECTED_COLORS = {
    1.2: 'border-gray-500 bg-gray-100 ring-2 ring-gray-400',
    1.375: 'border-blue-500 bg-blue-100 ring-2 ring-blue-400',
    1.55: 'border-green-500 bg-green-100 ring-2 ring-green-400',
    1.725: 'border-orange-500 bg-orange-100 ring-2 ring-orange-400',
    1.9: 'border-purple-500 bg-purple-100 ring-2 ring-purple-400'
};

export default function ActivityLevelSelector({ value, onChange }) {
    return (
        <div className="space-y-3">
            {ACTIVITY_FACTORS.map((factor) => {
                const Icon = ACTIVITY_ICONS[factor.value] || Activity;
                const isSelected = value === factor.value;
                
                return (
                    <button
                        key={factor.value}
                        type="button"
                        onClick={() => onChange && onChange(factor.value)}
                        className={cn(
                            "w-full p-4 rounded-lg border-2 transition-all duration-200 text-left",
                            "hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                            isSelected 
                                ? "border-primary bg-primary/5 shadow-sm" 
                                : "border-border bg-card hover:border-primary/50"
                        )}
                    >
                        <div className="flex items-start gap-3">
                            <div className={cn(
                                "flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center",
                                isSelected ? "bg-primary text-primary-foreground" : "bg-muted"
                            )}>
                                <Icon className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2 mb-1">
                                    <p className={cn(
                                        "font-semibold text-sm",
                                        isSelected ? "text-foreground" : "text-foreground"
                                    )}>
                                        {factor.label}
                                    </p>
                                    <span className={cn(
                                        "text-xs font-mono px-2 py-0.5 rounded flex-shrink-0",
                                        isSelected 
                                            ? "bg-primary text-primary-foreground" 
                                            : "bg-muted text-muted-foreground"
                                    )}>
                                        x{factor.value}
                                    </span>
                                </div>
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                    {factor.desc}
                                </p>
                            </div>
                        </div>
                    </button>
                );
            })}
        </div>
    );
}

