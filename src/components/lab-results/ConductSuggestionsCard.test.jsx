import React from 'react';
import {render,screen,waitFor} from '@testing-library/react';
import {it,expect,vi} from 'vitest';
import ConductSuggestionsCard from './ConductSuggestionsCard';
const mocks=vi.hoisted(()=>({read:vi.fn(async()=>({data:[],error:null}))}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:'synthetic-nutritionist'}})}));
vi.mock('@/components/ui/use-toast',()=>({useToast:()=>({toast:vi.fn()})}));
vi.mock('@/lib/supabase/conduct-queries',()=>({evaluateLabGoalRules:vi.fn(),createConductSuggestion:vi.fn(),approveConductSuggestion:vi.fn(),rejectConductSuggestion:vi.fn(),getConductSuggestions:mocks.read}));
it('renders the examination domain without reading a callback before initialization',async()=>{
 render(<ConductSuggestionsCard patientId="synthetic-patient"/>);
 await waitFor(()=>expect(screen.getByText(/Nenhuma sugestão de conduta/)).toBeVisible());
 expect(mocks.read).toHaveBeenCalledWith({nutritionistId:'synthetic-nutritionist',patientId:'synthetic-patient',limit:15});
});
