import React from'react';import{it,expect,vi,afterEach}from'vitest';import{render,screen,cleanup}from'@testing-library/react';import{MemoryRouter}from'react-router-dom';import AppRouter from'./index';
const owners=vi.hoisted(()=>({chat:vi.fn(),realtime:vi.fn(),notices:vi.fn()}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:null,loading:true,initializing:true})}));
vi.mock('@/contexts/ChatContext',()=>({ChatProvider:({children})=>{owners.chat();return children}}));
vi.mock('@/contexts/RealtimeContext',()=>({RealtimeProvider:({children})=>{owners.realtime();return children}}));
vi.mock('@/hooks/useNotificationsData',()=>({NotificationsCacheOwner:({children})=>{owners.notices();return children}}));
vi.mock('./authRoutes',()=>({authRoutes:null}));vi.mock('./patientRoutes',()=>({patientRoutes:null}));vi.mock('./nutritionistRoutes',()=>({nutritionistRoutes:null}));vi.mock('./adminRoutes',()=>({adminRoutes:null}));
vi.mock('@/pages/public/ResearchPage',()=>({default:()=> <h1>Pesquisa pública</h1>}));
vi.mock('@/pages/public/anamnesis/PatientFacingUi.jsx',()=>({default:()=> <h1>Questionário público</h1>}));
vi.mock('@/pages/public/DocumentAuthenticityPage.jsx',()=>({default:()=> <h1>Autenticidade pública</h1>}));
afterEach(()=>{cleanup();vi.clearAllMocks()});
it.each([['/pesquisa','Pesquisa pública'],['/f/SYNTHETIC','Questionário público'],['/verificar-documento','Autenticidade pública']])('routes %s without waiting for Auth or mounting private transport owners',async(path,title)=>{
 render(<MemoryRouter initialEntries={[path]}><AppRouter/></MemoryRouter>);expect(await screen.findByRole('heading',{name:title})).toBeInTheDocument();expect(owners.chat).not.toHaveBeenCalled();expect(owners.realtime).not.toHaveBeenCalled();expect(owners.notices).not.toHaveBeenCalled();
});
