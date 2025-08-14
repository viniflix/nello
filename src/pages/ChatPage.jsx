import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Send, ArrowLeft, Paperclip, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useChat } from '@/contexts/ChatContext';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';

const ChatMessage = ({ msg, isSender }) => {
  const renderContent = () => {
    switch (msg.message_type) {
      case 'image':
        return <img src={msg.media_url} alt="Imagem enviada" className="rounded-lg max-w-full h-auto cursor-pointer" onClick={() => window.open(msg.media_url, '_blank')} />;
      case 'audio':
        return <audio controls src={msg.media_url} className="w-full" />;
      default:
        return <p className="text-sm whitespace-pre-wrap">{msg.message}</p>;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`flex ${isSender ? 'justify-end' : 'justify-start'}`}
    >
      <div className={`max-w-xs md:max-w-md p-3 rounded-2xl shadow-sm ${
        isSender
          ? 'bg-primary text-primary-foreground rounded-br-lg'
          : 'bg-card text-card-foreground rounded-bl-lg border'
      }`}>
        {renderContent()}
        <p className={`text-xs mt-1 ${
          isSender ? 'text-primary-foreground/70' : 'text-muted-foreground'
        } text-right`}>
          {new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </motion.div>
  );
};

const ChatPage = () => {
  const { user } = useAuth();
  const { messages, sendMessage, fetchMessages, loading } = useChat();
  const { patientId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [newMessage, setNewMessage] = useState('');
  const [recipient, setRecipient] = useState(null);
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [mediaType, setMediaType] = useState(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const [isSending, setIsSending] = useState(false);

  const recipientId = user.profile.user_type === 'nutritionist' ? patientId : user.profile.nutritionist_id;

  useEffect(() => {
    const fetchRecipient = async () => {
      if (!recipientId) return;
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, name, user_type')
        .eq('id', recipientId)
        .maybeSingle();
      
      if (error) console.error("Error fetching recipient", error);
      else setRecipient(data);
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

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      if (file.type.startsWith('image/')) {
        setMediaType('image');
      } else if (file.type.startsWith('audio/')) {
        setMediaType('audio');
      } else {
        toast({ title: "Arquivo inválido", description: "Por favor, selecione uma imagem ou um áudio.", variant: "destructive" });
        return;
      }
      setMediaFile(file);
      setMediaPreview(URL.createObjectURL(file));
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if ((newMessage.trim() === '' && !mediaFile) || !recipientId || isSending) return;

    setIsSending(true);

    let mediaUrl = null;
    let messageType = 'text';

    if (mediaFile) {
      messageType = mediaType;
      const filePath = `${user.id}/${Date.now()}_${mediaFile.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('chat_media')
        .upload(filePath, mediaFile);

      if (uploadError) {
        toast({ title: "Erro no upload", description: uploadError.message, variant: "destructive" });
        setIsSending(false);
        return;
      }

      const { data: urlData } = supabase.storage.from('chat_media').getPublicUrl(uploadData.path);
      mediaUrl = urlData.publicUrl;
    }

    await sendMessage({
      from_id: user.id,
      to_id: recipientId,
      message: newMessage,
      message_type: messageType,
      media_url: mediaUrl,
    });

    setNewMessage('');
    setMediaFile(null);
    setMediaPreview(null);
    setMediaType(null);
    setIsSending(false);
  };

  const handleBack = () => {
    if (user.profile.user_type === 'nutritionist') {
      navigate('/nutritionist');
    } else {
      navigate('/patient');
    }
  };


  if (!recipient && !loading) {
    const target = user.profile.user_type === 'patient' ? 'nutricionista' : 'paciente';
    return <div className="flex items-center justify-center h-screen">Você não tem um {target} associado para conversar.</div>;
  }
  
  if (loading) {
      return <div className="flex items-center justify-center h-screen">Carregando chat...</div>;
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      <header className="bg-card/80 backdrop-blur-md border-b border-border p-4 flex items-center sticky top-0 z-10">
        <Button variant="ghost" size="icon" onClick={handleBack} className="mr-2"><ArrowLeft className="w-5 h-5" /></Button>
        <div className="w-10 h-10 bg-secondary rounded-full mr-3 flex items-center justify-center font-bold text-primary">{recipient.name.charAt(0)}</div>
        <div>
          <h2 className="font-semibold text-foreground">{recipient.name}</h2>
          <p className="text-xs text-muted-foreground">{recipient.user_type === 'nutritionist' ? 'Nutricionista' : 'Paciente'}</p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => <ChatMessage key={msg.id} msg={msg} isSender={msg.from_id === user.id} />)}
        <div ref={messagesEndRef} />
      </main>

      <footer className="bg-card p-4 border-t">
        {mediaPreview && (
          <div className="relative p-2 mb-2 border rounded-lg">
            {mediaType === 'image' && <img src={mediaPreview} alt="Preview" className="max-h-24 rounded" />}
            {mediaType === 'audio' && <audio controls src={mediaPreview} className="w-full" />}
            <Button variant="ghost" size="icon" className="absolute top-0 right-0" onClick={() => { setMediaFile(null); setMediaPreview(null); setMediaType(null); }}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}
        <form onSubmit={handleSendMessage} className="flex items-center space-x-3">
          <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*,audio/*" />
          <Button type="button" variant="ghost" size="icon" onClick={() => fileInputRef.current.click()} disabled={isSending}><Paperclip className="w-5 h-5" /></Button>
          <Input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Digite sua mensagem..."
            className="flex-1 bg-background"
            autoComplete="off"
            disabled={isSending}
          />
          <Button type="submit" size="icon" disabled={isSending || (newMessage.trim() === '' && !mediaFile)}><Send className="w-5 h-5" /></Button>
        </form>
      </footer>
    </div>
  );
};

export default ChatPage;