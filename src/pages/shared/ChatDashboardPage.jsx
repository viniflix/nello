import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Search, MessageSquare, Loader2, User as UserIcon } from 'lucide-react';
import { useChat } from '@/contexts/ChatContext';
import { useOnlinePresence } from '@/hooks/useOnlinePresence';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { format, parseISO, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import ChatPage from './ChatPage';
import { motion, AnimatePresence } from 'framer-motion';

const formatMessageTime = (dateStr) => {
  if (!dateStr) return '';
  const date = parseISO(dateStr);
  if (isToday(date)) return format(date, 'HH:mm');
  if (isYesterday(date)) return 'Ontem';
  return format(date, 'dd/MM/yy');
};

const ConversationItem = ({ conversation, isActive, onClick }) => {
  const { isUserOnline } = useOnlinePresence();
  const isOnline = isUserOnline(conversation.recipient_id);

  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 p-3 cursor-pointer transition-colors relative border-b border-border/50
        ${isActive ? 'bg-primary/10 border-r-4 border-r-primary' : 'hover:bg-muted/50'}`}
    >
      <div className="relative shrink-0">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden border">
          {conversation.recipient_avatar ? (
            <img 
              src={conversation.recipient_avatar} 
              alt={conversation.recipient_name} 
              className="w-full h-full object-cover"
            />
          ) : (
            <UserIcon className="w-6 h-6 text-primary" />
          )}
        </div>
        {isOnline && (
          <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-card rounded-full" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className="font-semibold text-sm truncate text-foreground">
            {conversation.recipient_name}
          </span>
          <span className="text-[10px] text-muted-foreground shrink-0">
            {formatMessageTime(conversation.last_message_at)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className={`text-xs truncate flex-1 ${conversation.unread_count > 0 ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
            {conversation.last_message_content || 'Sem mensagens'}
          </p>
          {conversation.unread_count > 0 && (
            <span className="bg-primary text-primary-foreground text-[10px] font-bold h-5 min-w-5 px-1 rounded-full flex items-center justify-center shrink-0">
              {conversation.unread_count}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

const ChatDashboardPage = () => {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const { conversations, loading } = useChat();
  const [search, setSearch] = useState('');

  const filteredConversations = useMemo(() => {
    return conversations.filter(c => 
      c.recipient_name.toLowerCase().includes(search.toLowerCase())
    );
  }, [conversations, search]);

  const handleSelectConversation = (id) => {
    navigate(`/nutritionist/chat/${id}`);
  };

  return (
    <div className="flex h-[calc(100vh-64px)] bg-background overflow-hidden">
      {/* Sidebar - Lista de Conversas */}
      <aside className={`w-full md:w-80 lg:w-96 border-r flex flex-col bg-card shrink-0 
        ${patientId ? 'hidden md:flex' : 'flex'}`}>
        
        <div className="p-4 border-b space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-primary" />
              Conversas
            </h1>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar paciente..."
              className="pl-9 bg-muted/50 border-none focus-visible:ring-primary"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && conversations.length === 0 ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : filteredConversations.length > 0 ? (
            filteredConversations.map(conv => (
              <ConversationItem
                key={conv.recipient_id}
                conversation={conv}
                isActive={patientId === conv.recipient_id}
                onClick={() => handleSelectConversation(conv.recipient_id)}
              />
            ))
          ) : (
            <div className="p-8 text-center space-y-2">
              <p className="text-sm text-muted-foreground">Nenhuma conversa encontrada.</p>
            </div>
          )}
        </div>
      </aside>

      {/* Main Area - Conteúdo do Chat */}
      <main className={`flex-1 flex flex-col min-w-0 h-full relative 
        ${!patientId ? 'hidden md:flex' : 'flex'}`}>
        <AnimatePresence mode="wait">
          {patientId ? (
            <motion.div
              key={patientId}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="h-full w-full"
            >
              <ChatPage propRecipientId={patientId} isEmbedded={true} />
              
              {/* Botão de Voltar Mobile */}
              <Button
                variant="outline"
                size="icon"
                className="absolute top-4 left-4 z-40 md:hidden shadow-md bg-white/80 backdrop-blur rounded-full"
                onClick={() => navigate('/nutritionist/chat')}
              >
                <Search className="w-4 h-4" /> {/* Poderia ser ArrowLeft, mas Search combina com a lista */}
              </Button>
            </motion.div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-muted/10 opacity-60">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <MessageSquare className="w-10 h-10 text-primary" />
              </div>
              <h2 className="text-xl font-semibold mb-2 text-foreground">Suas Mensagens</h2>
              <p className="text-sm text-muted-foreground max-w-sm">
                Selecione um paciente na lista ao lado para ver o histórico de conversas e enviar novas mensagens.
              </p>
            </div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};

export default ChatDashboardPage;
