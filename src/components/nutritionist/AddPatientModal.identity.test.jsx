import { act, render } from '@testing-library/react';
import { expect,it,vi } from 'vitest';
import { usePatientFormStore } from '@/stores/usePatientFormStore';
import { clearPrivateDraftStorage } from '@/lib/utils/privateDraftStorage';
import AddPatientModal from './AddPatientModal';
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:'synthetic-a'}})}));
vi.mock('@/infrastructure/supabase/client',()=>({supabase:{}}));
vi.mock('@/components/ui/use-toast',()=>({useToast:()=>({toast:vi.fn()})}));
vi.mock('@/infrastructure/analytics/posthog',()=>({track:vi.fn(),Events:{}}));
it('does not restore an old registration draft from modal cleanup after identity loss',()=>{
 usePatientFormStore.getState().resetForm();usePatientFormStore.getState().updateField('name','Previous private A');
 const view=render(<AddPatientModal isOpen onClose={()=>{}} preserveExistingDraft initialName="Temporary A"/>);
 act(()=>{clearPrivateDraftStorage();usePatientFormStore.getState().resetForm();});view.unmount();
 expect(usePatientFormStore.getState().formData.name).toBe('');
});
