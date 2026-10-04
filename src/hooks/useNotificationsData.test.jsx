import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { NotificationsCacheOwner, useNotificationsData } from './useNotificationsData';
const mock=vi.hoisted(()=>({from:vi.fn(),user:{id:'owner'}}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:mock.user})}));
vi.mock('@/infrastructure/supabase/client',()=>({supabase:{from:mock.from}}));
beforeEach(()=>{
 vi.clearAllMocks();mock.user={id:'owner'};
 mock.from.mockImplementation(()=>{
  let head=false;const query={select:vi.fn((_columns,options)=>{head=Boolean(options?.head);return query;}),eq:vi.fn(()=>query),order:vi.fn(()=>query),limit:vi.fn(()=>query),abortSignal:vi.fn(async()=>head?{count:205,error:null}:{data:[{id:1,is_read:false,content:{}}],error:null})};return query;
 });
});
function Counter({name}){const {unreadCount}=useNotificationsData();return <output aria-label={name}>{unreadCount}</output>;}
it('deduplicates notifications reads for header, panel and page and uses the exact total beyond the displayed window',async()=>{
 const cache=new QueryClient({defaultOptions:{queries:{retry:false}}});
 const view=render(<QueryClientProvider client={cache}><NotificationsCacheOwner><Counter name="header"/><Counter name="panel"/><Counter name="page"/></NotificationsCacheOwner></QueryClientProvider>);
 await waitFor(()=>expect(screen.getByLabelText('header')).toHaveTextContent('205'));
 expect(screen.getByLabelText('panel')).toHaveTextContent('205');expect(screen.getByLabelText('page')).toHaveTextContent('205');
 expect(mock.from).toHaveBeenCalledTimes(2);view.unmount();cache.clear();
});
it('does not expose the previous account cached notifications on a user switch',async()=>{
 const cache=new QueryClient({defaultOptions:{queries:{retry:false}}});const wrapper=()=> <QueryClientProvider client={cache}><Counter name="header"/></QueryClientProvider>;
 const view=render(wrapper());await waitFor(()=>expect(screen.getByLabelText('header')).toHaveTextContent('205'));
 mock.user=null;view.rerender(wrapper());expect(screen.getByLabelText('header')).toHaveTextContent('0');view.unmount();cache.clear();
});
