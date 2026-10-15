import React,{useState}from'react';import{afterEach,it,expect,vi}from'vitest';import{render,screen,fireEvent,act,cleanup}from'@testing-library/react';import{OutletLoadingBoundary}from'./outlet-loading-boundary';
afterEach(()=>{cleanup();vi.restoreAllMocks()});
it('does not steal focus from navigation after a pending section resolves',async()=>{
 let pending=false,resolve,repaint;const promise=new Promise(r=>resolve=r);
 function Editor(){const[,set]=useState(0);repaint=()=>set(x=>x+1);if(pending)throw promise;return <input aria-label="Campo"defaultValue="rascunho fictício"/>}
 render(<><button>Outra navegação</button><OutletLoadingBoundary><Editor/></OutletLoadingBoundary></>);
 const input=screen.getByLabelText('Campo');input.focus();fireEvent.focus(input);pending=true;act(()=>repaint());screen.getByRole('button',{name:'Outra navegação'}).focus();pending=false;await act(async()=>resolve());await act(()=>new Promise(r=>setTimeout(r,30)));expect(screen.getByRole('button',{name:'Outra navegação'})).toHaveFocus();expect(input).toHaveValue('rascunho fictício');
});
