import React from 'react';import {render,screen} from '@testing-library/react';import {beforeEach,expect,it,vi} from 'vitest';
import PatientCheckinHistoryWidget from './PatientCheckinHistoryWidget';
const m=vi.hoisted(()=>({data:[]}));vi.mock('@/hooks/useCheckins',()=>({useCheckins:()=>({useCheckinHistory:()=>({data:m.data,isLoading:false})})}));
beforeEach(()=>{m.data=[];});
it.each([null,undefined,'',false,' ',101,-1,'invalid'])('renders missing or invalid %s score neutrally',value=>{m.data=[{id:'session',adherence_percentage:value,completed_at:'2026-10-16T12:00:00Z',checkin_templates:{name:'Sem nota'}}];const {container}=render(<PatientCheckinHistoryWidget patientId="patient"/>);expect(screen.getByText('Sem pontuação')).toBeInTheDocument();expect(screen.queryByText('0%')).toBeNull();expect(container.querySelector('.bg-red-500')).toBeNull();});
it('preserves a real zero score',()=>{m.data=[{id:'session',adherence_percentage:0,completed_at:'2026-10-16T12:00:00Z'}];render(<PatientCheckinHistoryWidget patientId="patient"/>);expect(screen.getByText('0%')).toBeInTheDocument();});
