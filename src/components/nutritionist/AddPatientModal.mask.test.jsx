import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { usePatientFormStore } from '@/stores/usePatientFormStore';
import AddPatientModal from './AddPatientModal';
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:'synthetic-mask-owner'}})}));
vi.mock('@/infrastructure/supabase/client',()=>({supabase:{}}));
vi.mock('@/components/ui/use-toast',()=>({useToast:()=>({toast:vi.fn()})}));
vi.mock('@/infrastructure/analytics/posthog',()=>({track:vi.fn(),Events:{}}));
afterEach(()=>{act(()=>usePatientFormStore.getState().resetForm());vi.restoreAllMocks();});
it('opens editable patient fields in StrictMode without legacy DOM lookup',()=>{
 const errors=[];vi.spyOn(console,'error').mockImplementation((...args)=>errors.push(args.map(String).join(' ')));
 render(<React.StrictMode><AddPatientModal isOpen setIsOpen={()=>{}} /></React.StrictMode>);
 expect(screen.getByLabelText('CPF')).toBeEnabled();
 expect(errors).toEqual([]);
});

it('keeps the formatted registration draft and birth date when changing tabs',()=>{
 const store=usePatientFormStore.getState();
 store.updateField('phone','(85) 98765-4321');store.updateField('cpf','123.456.789-00');
 store.updateField('cep','60000-001');store.updateField('birth_date',new Date(1990,0,2));
 render(<AddPatientModal isOpen setIsOpen={()=>{}} />);
 expect(screen.getByLabelText('Telefone')).toHaveValue('(85) 98765-4321');
 expect(screen.getByLabelText('CPF')).toHaveValue('123.456.789-00');
 expect(screen.getByPlaceholderText('dd/mm/aaaa')).toHaveValue('02/01/1990');
 fireEvent.keyDown(screen.getByRole('tab',{name:/Endereço/}),{key:'Enter'});
 expect(screen.getByLabelText('CEP')).toHaveValue('60000-001');
 fireEvent.keyDown(screen.getByRole('tab',{name:/Dados Pessoais/}),{key:'Enter'});
 expect(screen.getByLabelText('Telefone')).toHaveValue('(85) 98765-4321');
 expect(screen.getByLabelText('CPF')).toHaveValue('123.456.789-00');
});
it('keeps digits from a legacy partial draft without rewriting the draft on open',()=>{
 const store=usePatientFormStore.getState();store.updateField('cpf','123.___.___-__');
 render(<AddPatientModal isOpen setIsOpen={()=>{}} />);
 expect(screen.getByLabelText('CPF').value.replace(/\D/g,'')).toBe('123');
 expect(usePatientFormStore.getState().formData.cpf).toBe('123.___.___-__');
});

it('formats raw draft digits without changing stored values on open',()=>{
 const store=usePatientFormStore.getState();store.updateField('phone','85987654321');store.updateField('cpf','12345678900');store.updateField('cep','60000001');
 render(<AddPatientModal isOpen setIsOpen={()=>{}} />);
 expect(screen.getByLabelText('Telefone')).toHaveValue('(85) 98765-4321');expect(screen.getByLabelText('CPF')).toHaveValue('123.456.789-00');
 fireEvent.keyDown(screen.getByRole('tab',{name:/Endereço/}),{key:'Enter'});expect(screen.getByLabelText('CEP')).toHaveValue('60000-001');
 expect(usePatientFormStore.getState().formData.cpf).toBe('12345678900');
});
