import {act,fireEvent,render,screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {afterEach,expect,it,vi} from 'vitest';
import ChatPage from './ChatPage';
import {invalidateDomain} from '@/infrastructure/realtime/events';
const state=vi.hoisted(()=>({user:{id:'synthetic-a',profile:{user_type:'nutritionist'}},fetch:vi.fn(),send:vi.fn(),close:vi.fn(),typing:vi.fn(),mark:vi.fn(),older:vi.fn(),toast:vi.fn(),denied:false}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:state.user})}));
vi.mock('@/contexts/ChatContext',()=>({useChat:()=>({messages:[],fetchMessages:state.fetch,sendMessage:state.send,closeConversation:state.close,markChatAsRead:state.mark,loadOlderMessages:state.older,loading:false})}));
vi.mock('@/hooks/useOnlinePresence',()=>({useOnlinePresence:()=>({setTyping:state.typing,isUserTyping:()=>false,isUserOnline:()=>false,isRelationshipActive:()=>true,presenceReady:true})}));
vi.mock('@/components/ui/use-toast',()=>({useToast:()=>({toast:state.toast})}));
vi.mock('@/infrastructure/supabase/client',()=>({supabase:{rpc:async()=>state.denied?{error:{status:403}}:{data:[{name:'Pessoa fictícia',is_active:true}]},from:()=>{const q={select:()=>q,eq:()=>q,single:async()=>({data:{name:'Pessoa fictícia'}})};return q;}}}));
afterEach(()=>vi.restoreAllMocks());
it('stops a microphone stream granted after its owner was unmounted',async()=>{
 let finish;const stop=vi.fn();vi.stubGlobal('navigator',{...navigator,mediaDevices:{getUserMedia:()=>new Promise(resolve=>{finish=resolve})}});
 const view=render(<MemoryRouter><ChatPage propRecipientId="synthetic-peer"/></MemoryRouter>);
 fireEvent.click(await screen.findByRole('button',{name:'Gravar áudio'}));view.unmount();
 await act(async()=>finish({getTracks:()=>[{stop}]}));expect(stop).toHaveBeenCalledOnce();vi.unstubAllGlobals();
});
it('removes denied recipient metadata after an access event instead of keeping the old private header',async()=>{
 state.denied=false;render(<MemoryRouter><ChatPage propRecipientId="synthetic-peer"/></MemoryRouter>);await screen.findByText('Pessoa fictícia');
 state.denied=true;act(()=>invalidateDomain('synthetic-a','access'));
 await vi.waitFor(()=>expect(screen.queryByText('Pessoa fictícia')).not.toBeInTheDocument());
});
