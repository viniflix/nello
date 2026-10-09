import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import AppRouter from './index';
vi.mock('@/contexts/AuthContext', () => ({useAuth:()=>({user:null,loading:false})}));
vi.mock('@/contexts/ChatContext',()=>({ChatProvider:({children})=>children}));
vi.mock('@/contexts/RealtimeContext',()=>({RealtimeProvider:({children})=>children}));
vi.mock('@/hooks/useNotificationsData',()=>({NotificationsCacheOwner:({children})=>children}));
vi.mock('./authRoutes',()=>({authRoutes:null}));
vi.mock('./nutritionistRoutes',()=>({nutritionistRoutes:null}));
vi.mock('./patientRoutes',()=>({patientRoutes:null}));
vi.mock('./adminRoutes',()=>({adminRoutes:null}));
vi.mock('@/pages/public/anamnesis/PatientFacingUi.jsx',async()=>{
 const React=await import('react');const {useParams}=await import('react-router-dom');
 return {default:function Form(){const {token}=useParams();const [draft]=React.useState(token);return <output aria-label="resposta vinculada">{draft}</output>;}};
});
function Navigation(){const navigate=useNavigate();return <button onClick={()=>navigate('/f/SECOND')}>Outro questionário</button>;}
it('creates fresh page state when the anonymous questionnaire token changes',async()=>{
 render(<MemoryRouter initialEntries={['/f/FIRST']}><Navigation /><AppRouter /></MemoryRouter>);
 expect(await screen.findByLabelText('resposta vinculada')).toHaveTextContent('FIRST');
 fireEvent.click(screen.getByText('Outro questionário'));
 expect(await screen.findByLabelText('resposta vinculada')).toHaveTextContent('SECOND');
});
