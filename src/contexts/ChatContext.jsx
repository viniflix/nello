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
    
    setUnreadSenders(prev => {
        const newSet = new Set(prev);
        newSet.delete(toId);
        return newSet;
    });
  }, []);

  const sendMessage = async (newMessageData) => {
    const { error } = await supabase.from('chats').insert([newMessageData]);

    if (error) {
      console.error('Error sending message:', error);
      toast({ title: "Erro", description: "Não foi possível enviar a mensagem.", variant: "destructive" });
      return null;
    }
    // No need to manually add the message here, realtime will handle it
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
    
    // Fetch initial unread messages
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
        
        // Is this message for me or from me?
        const isForMe = newMessage.to_id === user.id;
        const isFromMe = newMessage.from_id === user.id;
        
        if (isForMe) {
            // If I'm currently chatting with the sender, add message and mark as read
            if (newMessage.from_id === currentRecipientId) {
                setMessages(currentMessages => [...currentMessages, newMessage]);
            } else {
                // Otherwise, just mark as unread
                setUnreadSenders(prev => new Set(prev).add(newMessage.from_id));
                 toast({
                    title: "Nova Mensagem",
                    description: `Você recebeu uma nova mensagem.`,
                });
            }
        } else if (isFromMe) {
             // If I sent the message and I'm viewing the chat, add it to the view
             if(newMessage.to_id === currentRecipientId) {
                setMessages(currentMessages => [...currentMessages, newMessage]);
             }
        }
    }).subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
            // console.log('Subscribed to chat channel!');
        }
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
  }, [user, currentRecipientId, toast]);

  const value = {
    messages,
    sendMessage,
    fetchMessages,
    loading,
    unreadSenders
  };

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
}