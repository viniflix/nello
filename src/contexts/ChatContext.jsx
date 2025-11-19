import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';

const ChatContext = createContext();

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
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
  const channelRef = useRef(null);

  const markChatAsRead = useCallback(async (senderId) => {
      if (!user || !senderId) return;
      
      const { error } = await supabase.rpc('mark_chat_notifications_as_read', { p_user_id: user.id, p_sender_id: senderId });
      if (error) {
        console.error("Failed to mark chat as read:", error);
        return;
      }
      
      setUnreadSenders(prev => {
          const newSet = new Set(prev);
          newSet.delete(senderId);
          return newSet;
      });
  }, [user]);

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
      console.error('Error fetching messages:', error);
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
      console.error('Error sending message:', error);
      toast({ title: "Erro", description: "Não foi possível enviar a mensagem.", variant: "destructive" });
      return null;
    }
    return true;
  };

  useEffect(() => {
    if (!user) {
        if (channelRef.current) {
            supabase.removeChannel(channelRef.current);
            channelRef.current = null;
        }
        return;
    }
    
    const fetchUnread = async () => {
        const { data } = await supabase.rpc('get_unread_senders', { p_user_id: user.id });
        if (data) {
            setUnreadSenders(new Set(data.map(item => item.from_id)));
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
          console.error(`Channel error:`, err);
        }
    });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [user, currentRecipientId, toast, markChatAsRead]);

  const value = {
    messages,
    sendMessage,
    fetchMessages,
    loading,
    unreadSenders,
    markChatAsRead
  };

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
}