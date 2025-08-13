
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Send, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useChat } from '@/contexts/ChatContext';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const ChatPage = () => {
  const { user } = useAuth();
  const { messages, sendMessage, fetchMessages, loading } = useChat();
  const { patientId } = useParams();
  const navigate = useNavigate();
  const [newMessage, setNewMessage] = useState('');
  const [recipient, setRecipient] = useState(null);
  const messagesEndRef = useRef(null);

  const recipientId = user.profile.user_type === 'nutritionist' ? patientId : user.profile.nutritionist_id;

  useEffect(() => {
    const fetchRecipient = async () => {
      if (!recipientId) return;
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, name, user_type')
        .eq('id', recipientId)
        .maybeSingle();
      
      if (error) {
        console.error("Error fetching recipient", error);
      } else {
        setRecipient(data);
      }
    };
    fetchRecipient();
  }, [recipientId]);

  useEffect(() => {
    if (user && recipientId) {
      fetchMessages(user.id, recipientId);
    }
  }, [user, recipientId, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (newMessage.trim() === '' || !recipientId) return;

    await sendMessage({
      from_id: user.id,
      to_id: recipientId,
      message: newMessage,
    });

    setNewMessage('');
  };

  const handleBack = () => {
    if (user.profile.user_type === 'nutritionist') {
      navigate('/nutritionist');
    } else {
      navigate('/patient');
    }
  };

  if (!recipient || loading) {
    return <div className="flex items-center justify-center h-screen">Carregando chat...</div>;
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      <header className="bg-card/80 backdrop-blur-md border-b border-border p-4 flex items-center sticky top-0 z-10">
        <Button variant="ghost" size="icon" onClick={handleBack} className="mr-2">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="w-10 h-10 bg-secondary rounded-full mr-3 flex items-center justify-center font-bold text-primary">
          {recipient.name.charAt(0)}
        </div>
        <div>
          <h2 className="font-semibold text-foreground">{recipient.name}</h2>
          <p className="text-xs text-muted-foreground">{recipient.user_type === 'nutritionist' ? 'Nutricionista' : 'Paciente'}</p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, index) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
            className={`flex ${msg.from_id === user.id ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-xs md:max-w-md p-3 rounded-2xl shadow-sm ${
              msg.from_id === user.id
                ? 'bg-primary text-primary-foreground rounded-br-lg'
                : 'bg-card text-card-foreground rounded-bl-lg border'
            }`}>
              <p className="text-sm">{msg.message}</p>
              <p className={`text-xs mt-1 ${
                msg.from_id === user.id ? 'text-primary-foreground/70' : 'text-muted-foreground'
              } text-right`}>
                {new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </motion.div>
        ))}
        <div ref={messagesEndRef} />
      </main>

      <footer className="bg-card p-4 border-t">
        <form onSubmit={handleSendMessage} className="flex items-center space-x-3">
          <Input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Digite sua mensagem..."
            className="flex-1 bg-background"
            autoComplete="off"
          />
          <Button type="submit" size="icon">
            <Send className="w-5 h-5" />
          </Button>
        </form>
      </footer>
    </div>
  );
};

export default ChatPage;
