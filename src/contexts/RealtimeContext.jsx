import {readRequest} from '@/lib/supabase/readRequest';
import {readPolicies} from '@/lib/utils/readPolicy';
import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/infrastructure/supabase/client';
import { invalidateDomain, subscribeDomain } from '@/infrastructure/realtime/events';
import { getAccessEpoch } from '@/infrastructure/realtime/accessEpochState';
import { invalidateQueryReads, observeQueryReads } from '@/infrastructure/realtime/queryReads';
import { clinicalQueryPredicate } from '@/infrastructure/realtime/resourceDomains';

import { createReadCoordinator } from '@/infrastructure/realtime/readCoordinator';
import { currentReadSignal } from '@/infrastructure/realtime/readSignalState';

const RealtimeContext = createContext(null);
const kinds = ['chat', 'notifications', 'presence', 'profile', 'clinical', 'access'];
export function RealtimeProvider({ children }) {
  const { user } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();
  const [presence, setPresence] = useState({ userId: null, peers: [] });
  const [connection, setConnection] = useState('connecting');
  const writer = useRef(null);
  const typing = useRef({ recipient: null, active: false });
  const setTyping = useCallback((active, recipient = null) => {
    typing.current = { recipient: active ? recipient : null, active: Boolean(active && recipient) };
    writer.current?.();
  }, []);
  useEffect(() => {
    if (!userId) return;
    const stopQueryReads = observeQueryReads(queryClient);
    const lifecycle = new AbortController();
    const readPolicy = {...readPolicies.clinical,maxAttempts:1};
    let active = true, channel, writing = false, dirty = false;
    const session = crypto.randomUUID();
    typing.current = { recipient: null, active: false };
    const accept = (data, epoch) => { if (active && epoch === getAccessEpoch(userId) && Array.isArray(data)) setPresence({ userId, peers: data }); };
    let presenceOwner;
    const readPresence = signal => {
      const epoch = getAccessEpoch(userId);
      if (presenceOwner?.epoch !== epoch) {
        presenceOwner?.reader.dispose();
        presenceOwner = { epoch, reader: createReadCoordinator(() => active && epoch === getAccessEpoch(userId), 100, currentReadSignal) };
      }
      return presenceOwner.reader.request(async () => {
      const epoch = getAccessEpoch(userId);
      try {
        const { data, error } = await readRequest(() => supabase.rpc('get_chat_presence', { p_actor: userId }),{signal:lifecycle.signal,policy:readPolicy});
        if (!error) accept(data, epoch); else if (active && epoch === getAccessEpoch(userId)) setPresence({ userId: null, peers: [] });
      } catch { if (active && epoch === getAccessEpoch(userId)) setPresence({ userId: null, peers: [] }); }
      }, [], false, signal?.sequence);
    };
    const heartbeat = async () => {
      if (!active) return;
      if (writing) { dirty = true; return; }
      writing = true;
      const epoch = getAccessEpoch(userId);
      try {
        const current = typing.current;
        const { data, error } = await supabase.rpc('update_chat_presence', {
          p_session: session, p_recipient: current.recipient, p_typing: current.active, p_online: true, p_actor: userId,
        });
        if (!error) accept(data, epoch);
        else if (active) { typing.current = { recipient: null, active: false }; setPresence({ userId: null, peers: [] }); }
      } catch { if (active) setPresence({ userId: null, peers: [] }); } finally {
        writing = false;
        if (dirty && active) { dirty = false; void heartbeat(); }
      }
    };
    let typingTimer;
    writer.current = () => { typingTimer ??= setTimeout(() => { typingTimer = undefined; void heartbeat(); }, 500); };
    const subscriptions = [
      subscribeDomain(userId, 'presence', readPresence),
      subscribeDomain(userId, 'profile', signal => invalidateQueryReads(queryClient, { queryKey: ['profile', userId] }, userId, signal?.sequence)),
      subscribeDomain(userId, 'clinical', signal => invalidateQueryReads(queryClient, { predicate: clinicalQueryPredicate }, userId, signal?.sequence)),
      subscribeDomain(userId, 'access', () => {
        typing.current = { recipient: null, active: false };
        setPresence({ userId, peers: [] });
        // Access is a security boundary, including notifications. Cancellation
        // prevents pre-event responses from restoring a removed private copy.
        void queryClient.cancelQueries({ predicate: query => query.queryKey[0] !== 'profile' });
        void queryClient.resetQueries({ predicate: query => query.queryKey[0] !== 'profile' });
        for (const kind of ['chat', 'notifications', 'profile', 'presence']) invalidateDomain(userId, kind);
      }),
    ];
    const reconcile = () => { for (const kind of kinds.filter(k => k !== 'access')) invalidateDomain(userId, kind); void heartbeat(); };
    const connect = async () => {
      const { data: topic, error } = await readRequest(() => supabase.rpc('get_realtime_inbox', { p_actor: userId }),{signal:lifecycle.signal,policy:readPolicy});
      if (!active) return;
      if (error || !/^inbox:[0-9a-f-]{36}$/i.test(topic || '')) { setConnection('unavailable'); return; }
      await supabase.realtime.setAuth();
      if (!active) return;
      channel = supabase.channel(topic, { config: { private: true, broadcast: { ack: true }, presence: { enabled: false } } })
        .on('broadcast', { event: 'changed' }, ({ payload }) => {
          if (active && kinds.includes(payload?.kind)) invalidateDomain(userId, payload.kind);
        }).subscribe(status => {
          if (!active) return;
          setConnection(status === 'SUBSCRIBED' ? 'connected' : 'reconnecting');
          if (status === 'SUBSCRIBED') reconcile();
        });
    };
    void connect().catch(() => { if (active) setConnection('unavailable'); });
    const interval = setInterval(() => { void heartbeat(); if (!channel) void connect().catch(() => { if (active) setConnection('unavailable'); }); }, 30000);
    const expiry = setInterval(() => {
      if (active) setPresence(current => {
        const peers = current.peers.map(peer => ({ ...peer, online: Date.parse(peer.online_until) > Date.now(), typing: Date.parse(peer.typing_until) > Date.now() }));
        return peers.some((peer,index) => peer.online !== current.peers[index].online || peer.typing !== current.peers[index].typing) ? { ...current, peers } : current;
      });
    }, 1000);
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (nextSession?.user?.id !== userId) { active = false; typing.current = { recipient: null, active: false }; setPresence({ userId: null, peers: [] }); if (channel) void supabase.removeChannel(channel); }
    });
    window.addEventListener('online', reconcile);
    const focus = () => { if (document.visibilityState === 'visible') reconcile(); };
    document.addEventListener('visibilitychange', focus);
    const focusReads = () => { if (document.visibilityState === 'visible') for (const kind of kinds.filter(k => k !== 'access')) invalidateDomain(userId, kind); };
    window.addEventListener('focus', focusReads);
    return () => {
      active = false; writer.current = null; lifecycle.abort();
      stopQueryReads();
      presenceOwner?.reader.dispose();
      authListener.subscription.unsubscribe(); clearInterval(expiry); clearInterval(interval); clearTimeout(typingTimer);
      subscriptions.forEach(unsubscribe => unsubscribe());
      window.removeEventListener('online', reconcile);
      document.removeEventListener('visibilitychange', focus);
      window.removeEventListener('focus', focusReads);
      if (channel) supabase.removeChannel(channel);
      // A closed/offline tab's server lease expires independently. Never send a
      // delayed cleanup request under another account's session.
    };
  }, [userId, queryClient]);
  const peers = presence.userId === userId ? presence.peers : [];
  return <RealtimeContext.Provider value={{ peers, setTyping, connection, presenceReady: presence.userId === userId }}>{children}</RealtimeContext.Provider>;
}
export function useRealtime() {
  return useContext(RealtimeContext) || { peers: [], setTyping: () => {}, connection: 'unavailable' };
}
