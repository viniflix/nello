
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';

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
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchMessages = useCallback(async (fromId, toId) => {
    if (!fromId || !toId) return;
    setLoading(true);
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
  }, []);

  const sendMessage = async (newMessageData) => {
    const { data, error } = await supabase
      .from('chats')
      .insert([newMessageData])
      .select();

    if (error) {
      console.error('Error sending message:', error);
      return null;
    }
    return data[0];
  };

  useEffect(() => {
    if (!user) return;

    const handleNewMessage = (payload) => {
      const newMessage = payload.new;
      const isRelevant = (newMessage.from_id === user.id || newMessage.to_id === user.id);
      if (isRelevant) {
        setMessages(currentMessages => {
          if (currentMessages.find(m => m.id === newMessage.id)) {
            return currentMessages;
          }
          return [...currentMessages, newMessage].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        });
      }
    };

    const subscription = supabase
      .channel('public:chats')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chats' }, handleNewMessage)
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [user]);

  const value = {
    messages,
    sendMessage,
    fetchMessages,
    loading,
  };

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
}
