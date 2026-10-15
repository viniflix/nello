import React,{Suspense,useState}from'react';import{it,expect,vi}from'vitest';import{render,screen,fireEvent,waitFor}from'@testing-library/react';import{MemoryRouter,Routes,Route}from'react-router-dom';
import Layout from './NutritionistLayout';
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:'fictitious',profile:{name:'Fictitious'}},signOut:vi.fn()})}));
vi.mock('@/components/DashboardHeader',()=>({default:()=> <nav aria-label="Navegação do portal">Portal</nav>}));
vi.mock('@/components/navigation/PortalBreadcrumbs',()=>({default:()=>null}));
const pending=new Promise(()=>{});
function Editor(){const[slow,setSlow]=useState(false);if(slow)throw pending;return <><input aria-label="Rascunho"defaultValue="rascunho fictício"/><button onClick={()=>setSlow(true)}>Carregar seção</button></>}
it('keeps the portal shell visible and the draft mounted when its outlet suspends',async()=>{
 render(<MemoryRouter><Suspense fallback={<p>Carregando aplicativo</p>}><Routes><Route element={<Layout/>}><Route index element={<Editor/>}/></Route></Routes></Suspense></MemoryRouter>);
 fireEvent.change(screen.getByLabelText('Rascunho'),{target:{value:'edição fictícia'}});fireEvent.click(screen.getByText('Carregar seção'));
 expect(screen.getByRole('navigation',{name:'Navegação do portal'})).toBeVisible();await waitFor(()=>expect(screen.getByRole('status')).toBeInTheDocument());expect(screen.getByLabelText('Rascunho',{selector:'input'})).toHaveValue('edição fictícia');expect(screen.queryByText('Carregando aplicativo')).toBeNull();
});
