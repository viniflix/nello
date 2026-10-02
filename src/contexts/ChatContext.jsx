import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { invalidateDomain, subscribeDomain } from '@/infrastructure/realtime/events';
import { mergeChatMessages, reconcileChatPage } from '@/infrastructure/realtime/chatMessages';

const ChatContext = createContext();
export function useChat() {
  const context = useContext(ChatContext);
  if (!context) throw new Error('useChat deve ser usado dentro de um ChatProvider');
  return context;
}
export function ChatProvider({ children }) {
  const { user } = useAuth();
  const userId = user?.id;
  const identity = useRef(userId); identity.current = userId;
  const { toast } = useToast();
  const [view, setView] = useState({ owner: null, recipient: null, messages: [], hasMore: false, loading: false });
  const [conversationState, setConversationState] = useState({ owner: null, data: [] });
  const [loadError, setLoadError] = useState(false);
  const recipientRef = useRef(null);
  const viewRef = useRef(view); viewRef.current = view;
  const requestEpoch = useRef(0);
  const conversationEpoch = useRef(0);
  const readThrough = useRef(null);
  const sending = useRef(false);
  const conversationRequest = useRef(null);
  const fetchConversations = useCallback(async () => {
    if (!userId) return;
    if (conversationRequest.current?.owner === userId) { conversationRequest.current.dirty = true; return conversationRequest.current.promise; }
    const epoch = ++conversationEpoch.current;
    const promise = (async () => {
      try {
        const { data, error } = await supabase.rpc('get_nutritionist_conversations', { p_nutritionist_id: userId });
        if (identity.current !== userId || epoch !== conversationEpoch.current) return;
        if (!error) setConversationState({ owner: userId, data: data || [] });
      } catch { /* Keep the last confirmed counter until reconciliation succeeds. */ }
      finally { if (conversationRequest.current?.promise === promise) { const dirty = conversationRequest.current.dirty; conversationRequest.current = null; if (dirty && identity.current === userId) void fetchConversations(); } }
    })();
    conversationRequest.current = { owner: userId, promise };
    return promise;
  }, [userId]);
  const fetchMessages = useCallback(async (fromId, toId, { older = false, refresh = false } = {}) => {
    if (!userId || fromId !== userId || !toId) return;
    const epoch = ++requestEpoch.current;
    const previous = viewRef.current;
    const first = older ? previous.messages[0] : null;
    recipientRef.current = toId;
    setView(current => ({ owner: userId, recipient: toId, messages: (older || refresh) && current.recipient === toId ? current.messages : [], hasMore: false, loading: true }));
    setLoadError(false);
    try {
      const { data, error } = await supabase.rpc('list_chat_messages', {
        p_recipient: toId, p_before_time: first?.created_at || null,
        p_before_id: first ? String(first.id) : null, p_limit: 50, p_actor: userId,
      });
      if (identity.current !== userId || epoch !== requestEpoch.current) return;
      if (error) throw error;
      const reconciled = refresh ? reconcileChatPage(previous, data) : { messages: mergeChatMessages(older ? previous.messages : [], data?.messages || []), hasMore: data?.has_more === true };
      setView({ owner: userId, recipient: toId, ...reconciled, loading: false });
    } catch {
      if (identity.current === userId && epoch === requestEpoch.current) {
        setView({ owner: userId, recipient: toId, messages: older || refresh ? previous.messages : [], hasMore: (older || refresh) && previous.hasMore, loading: false });
        setLoadError(true);
      }
    }
  }, [userId]);
  const loadOlderMessages = useCallback(() => {
    const current = viewRef.current;
    if (current.owner === userId && current.hasMore && !current.loading) return fetchMessages(userId, current.recipient, { older: true });
  }, [userId, fetchMessages]);
  const closeConversation = useCallback(() => {
    recipientRef.current = null; requestEpoch.current += 1; readThrough.current = null;
    setView({ owner: userId, recipient: null, messages: [], hasMore: false, loading: false });
  }, [userId]);
  const markChatAsRead = useCallback(async senderId => {
    const current = viewRef.current;
    if (identity.current !== userId || current.owner !== userId || current.recipient !== senderId || document.visibilityState === 'hidden') return;
    const latest = current.messages.at(-1);
    if (!latest) return;
    const key = `${userId}:${senderId}:${latest.id}`;
    if (readThrough.current === key) return;
    readThrough.current = key;
    let error;
    try { ({ error } = await supabase.rpc('mark_chat_read', { p_recipient: senderId, p_through_id: String(latest.id), p_actor: userId })); } catch { error = true; }
    if (identity.current !== userId) return;
    if (error) { if (readThrough.current === key) readThrough.current = null; return; }
    invalidateDomain(userId, 'notifications');
    void fetchConversations();
  }, [userId, fetchConversations]);
  const sendMessage = useCallback(async input => {
    if (!userId || sending.current || !input?.client_message_id) return null;
    sending.current = true;
    try {
      const { data, error } = await supabase.rpc('send_chat_message', {
        p_recipient: input.to_id, p_message: input.message, p_type: input.message_type || 'text',
        p_media: input.media_url || null, p_client_id: input.client_message_id, p_actor: userId,
      });
      if (error) throw error;
      if (identity.current !== userId) return null;
      if (recipientRef.current === input.to_id) setView(current => ({ ...current, messages: mergeChatMessages(current.messages, [data]) }));
      invalidateDomain(userId, 'chat');
      return true;
    } catch {
      if (identity.current === userId) toast({ title: 'Mensagem não enviada', description: 'O rascunho foi mantido. Confira a conexão e tente novamente.', variant: 'destructive' });
      return null;
    } finally { sending.current = false; }
  }, [userId, toast]);
  useEffect(() => {
    if (!userId) return;
    void fetchConversations();
    const refresh = () => {
      void fetchConversations();
      if (recipientRef.current) void fetchMessages(userId, recipientRef.current, { refresh: true });
    };
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => { if (session?.user?.id !== userId) { identity.current = null; requestEpoch.current += 1; conversationEpoch.current += 1; } });
    const unsubChat = subscribeDomain(userId, 'chat', refresh);
    const unsubNotifications = subscribeDomain(userId, 'notifications', () => { void fetchConversations(); });
    const unsubAccess = subscribeDomain(userId, 'access', () => {
      readThrough.current = null;
      setConversationState({ owner: userId, data: [] });
      setView({ owner: userId, recipient: recipientRef.current, messages: [], hasMore: false, loading: false });
      void fetchConversations();
      if (recipientRef.current) void fetchMessages(userId, recipientRef.current);
    });
    return () => { authListener.subscription.unsubscribe(); unsubChat(); unsubNotifications(); unsubAccess(); recipientRef.current = null; readThrough.current = null; requestEpoch.current += 1; conversationEpoch.current += 1; };
  }, [userId, fetchConversations, fetchMessages]);
  const conversations = conversationState.owner === userId ? conversationState.data : [];
  const messages = view.owner === userId ? view.messages : [];
  return <ChatContext.Provider value={{ messages, sendMessage, fetchMessages, loading: view.owner === userId && view.loading,
    loadError, hasMoreMessages: view.owner === userId && view.hasMore, loadOlderMessages, closeConversation,
    unreadSenders: new Set(conversations.filter(c => Number(c.unread_count) > 0).map(c => c.recipient_id)),
    markChatAsRead, conversations, fetchConversations,
    totalUnreadMessages: conversations.reduce((sum, c) => sum + Number(c.unread_count || 0), 0) }}>{children}</ChatContext.Provider>;
}
