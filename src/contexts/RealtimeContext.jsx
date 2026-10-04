import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/infrastructure/supabase/client';
import { invalidateDomain, subscribeDomain } from '@/infrastructure/realtime/events';

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
    let active = true, channel, writing = false, reading = false, dirty = false;
    const session = crypto.randomUUID();
    typing.current = { recipient: null, active: false };
    const accept = data => { if (active && Array.isArray(data)) setPresence({ userId, peers: data }); };
    const readPresence = async () => {
      if (!active || reading) return;
      reading = true;
      try {
        const { data, error } = await supabase.rpc('get_chat_presence', { p_actor: userId });
        if (!error) accept(data); else if (active) setPresence({ userId: null, peers: [] });
      } catch { if (active) setPresence({ userId: null, peers: [] }); } finally { reading = false; }
    };
    const heartbeat = async () => {
      if (!active) return;
      if (writing) { dirty = true; return; }
      writing = true;
      try {
        const current = typing.current;
        const { data, error } = await supabase.rpc('update_chat_presence', {
          p_session: session, p_recipient: current.recipient, p_typing: current.active, p_online: true, p_actor: userId,
        });
        if (!error) accept(data);
        else if (active) { typing.current = { recipient: null, active: false }; setPresence({ userId: null, peers: [] }); }
      } catch { if (active) setPresence({ userId: null, peers: [] }); } finally {
        writing = false;
        if (dirty && active) { dirty = false; void heartbeat(); }
      }
    };
    let typingTimer;
    writer.current = () => { typingTimer ??= setTimeout(() => { typingTimer = undefined; void heartbeat(); }, 500); };
    const clinicalPredicate = query => !['profile', 'notifications'].includes(query.queryKey[0]);
    const subscriptions = [
      subscribeDomain(userId, 'presence', () => { void readPresence(); }),
      subscribeDomain(userId, 'profile', () => { void queryClient.invalidateQueries({ queryKey: ['profile', userId] }); }),
      subscribeDomain(userId, 'clinical', () => { void queryClient.invalidateQueries({ predicate: clinicalPredicate }); }),
      subscribeDomain(userId, 'access', () => {
        typing.current = { recipient: null, active: false };
        setPresence({ userId, peers: [] });
        void queryClient.resetQueries({ predicate: clinicalPredicate });
        for (const kind of ['chat', 'notifications', 'profile', 'presence']) invalidateDomain(userId, kind);
      }),
    ];
    const reconcile = () => { for (const kind of kinds.filter(k => k !== 'access')) invalidateDomain(userId, kind); void heartbeat(); };
    const connect = async () => {
      const { data: topic, error } = await supabase.rpc('get_realtime_inbox', { p_actor: userId });
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
    return () => {
      active = false; writer.current = null;
      authListener.subscription.unsubscribe(); clearInterval(expiry); clearInterval(interval); clearTimeout(typingTimer);
      subscriptions.forEach(unsubscribe => unsubscribe());
      window.removeEventListener('online', reconcile);
      document.removeEventListener('visibilitychange', focus);
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
