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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {ACTIVITY_FACTORS.map((factor) => {
                const Icon = ACTIVITY_ICONS[factor.value] || Activity;
                const isSelected = value === factor.value;
                
                return (
                    <Card
                        key={factor.value}
                        className={cn(
                            "cursor-pointer transition-all duration-200",
                            isSelected 
                                ? SELECTED_COLORS[factor.value] 
                                : ACTIVITY_COLORS[factor.value]
                        )}
                        onClick={() => onChange && onChange(factor.value)}
                    >
                        <CardContent className="p-4">
                            <div className="flex flex-col items-center text-center space-y-2">
                                <Icon className={cn(
                                    "w-8 h-8",
                                    isSelected ? "text-primary" : "text-muted-foreground"
                                )} />
                                <div>
                                    <p className={cn(
                                        "font-semibold text-sm",
                                        isSelected ? "text-foreground" : "text-muted-foreground"
                                    )}>
                                        {factor.label}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {factor.desc}
                                    </p>
                                </div>
                                <div className={cn(
                                    "text-xs font-mono px-2 py-1 rounded",
                                    isSelected 
                                        ? "bg-primary text-primary-foreground" 
                                        : "bg-muted text-muted-foreground"
                                )}>
                                    x{factor.value}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}

