import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';

const ChatContext = createContext();

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat deve ser usado dentro de um ChatProvider');
  }
  return context;
}

export function ChatProvider({ children }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentRecipientId, setCurrentRecipientId] = useState(null);
  const [unreadSenders, setUnreadSenders] = useState(new Set());
  const [conversations, setConversations] = useState([]);
  const channelRef = useRef(null);
  const unreadSendersCacheRef = useRef({ key: null, data: null, ts: 0 });

  const fetchConversations = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase.rpc('get_nutritionist_conversations', { p_nutritionist_id: user.id });
    if (!error && data) {
      setConversations(data);
    } else if (error) {
      console.error('Erro ao buscar conversas:', error);
    }
  }, [user]);

  const markChatAsRead = useCallback(async (senderId) => {
      if (!user || !senderId) return;

      const { error } = await supabase.rpc('mark_chat_notifications_as_read', { p_user_id: user.id, p_sender_id: senderId });
      if (error) {
        console.error("Falha ao marcar chat como lido:", error);
        return;
      }

      await supabase
        .from('notifications')
        .delete()
        .eq('user_id', user.id)
        .eq('type', 'new_message')
        .filter('content->>from_id', 'eq', String(senderId));

      unreadSendersCacheRef.current = { key: null, data: null, ts: 0 };
      setUnreadSenders(prev => {
          const newSet = new Set(prev);
          newSet.delete(senderId);
          return newSet;
      });
      // Atualiza conversas para atualizar contagem de não lidos
      fetchConversations();
  }, [user, fetchConversations]);

  const fetchMessages = useCallback(async (fromId, toId) => {
    if (!fromId || !toId) return;
    setLoading(true);
    setCurrentRecipientId(toId);

    const { data, error } = await supabase
      .from('chats')
      .select('*')
      .or(`and(from_id.eq.${fromId},to_id.eq.${toId}),and(from_id.eq.${toId},to_id.eq.${fromId})`)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Erro ao buscar mensagens:', error);
      setMessages([]);
    } else {
      setMessages(data);
    }
    setLoading(false);
    
    markChatAsRead(toId);

  }, [markChatAsRead]);

  const sendMessage = async (newMessageData) => {
    const { error } = await supabase.from('chats').insert([newMessageData]);

    if (error) {
      console.error('Erro ao enviar mensagem:', error);
      toast({ title: "Erro", description: "Não foi possível enviar a mensagem.", variant: "destructive" });
      return null;
    }
    // Atualiza conversas para mover o destinatário ao topo
    fetchConversations();
    return true;
  };

  const UNREAD_SENDERS_CACHE_TTL_MS = 30000;

  useEffect(() => {
    if (!user) {
        setConversations([]);
        if (channelRef.current) {
            supabase.removeChannel(channelRef.current);
            channelRef.current = null;
        }
        return;
    }

    fetchConversations();

    const fetchUnread = async () => {
        const cacheKey = user.id;
        const cache = unreadSendersCacheRef.current;
        if (cache.key === cacheKey && (Date.now() - cache.ts) < UNREAD_SENDERS_CACHE_TTL_MS) {
            setUnreadSenders(new Set(cache.data || []));
            return;
        }
        const { data } = await supabase.rpc('get_unread_senders', { p_user_id: user.id });
        if (data) {
            const ids = data.map(item => item.from_id);
            unreadSendersCacheRef.current = { key: cacheKey, data: ids, ts: Date.now() };
            setUnreadSenders(new Set(ids));
        }
    };
    fetchUnread();
    
    if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
    }

    const channel = supabase.channel(`realtime:chat:${user.id}`);
    
    channel.on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'chats'
      }, (payload) => {
        const newMessage = payload.new;
        
        const isForMe = newMessage.to_id === user.id;
        const isFromMe = newMessage.from_id === user.id;
        
        if (isForMe || isFromMe) {
            fetchConversations(); // Reordena a lista e atualiza os trechos
        }

        if (isForMe) {
            if (newMessage.from_id === currentRecipientId) {
                setMessages(currentMessages => [...currentMessages, newMessage]);
                markChatAsRead(newMessage.from_id);
            } else {
                setUnreadSenders(prev => new Set(prev).add(newMessage.from_id));
                 toast({
                    title: "Nova Mensagem",
                    description: `Você recebeu uma nova mensagem.`,
                });
            }
        } else if (isFromMe) {
             if(newMessage.to_id === currentRecipientId) {
                setMessages(currentMessages => [...currentMessages, newMessage]);
             }
        }
    }).subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR') {
          console.error(`Erro no canal:`, err);
        }
    });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [user, currentRecipientId, toast, markChatAsRead, fetchConversations]);

  const value = {
    messages,
    sendMessage,
    fetchMessages,
    loading,
    unreadSenders,
    markChatAsRead,
    conversations,
    fetchConversations,
    totalUnreadMessages: conversations.reduce((acc, c) => acc + Number(c.unread_count || 0), 0)
  };

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
}