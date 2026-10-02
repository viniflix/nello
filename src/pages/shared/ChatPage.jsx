import { uploadVerifiedFile } from '@/lib/storage/verifiedUpload';
import { parsePrivateFile, signPrivateFile } from '@/lib/storage/privateFiles';
import { validateUploadSelection, CHAT_UPLOAD_MAX_BYTES, fileExtensionForMime } from '@/lib/storage/uploadPolicy';
import { PrivateImage } from '@/components/ui/private-image';
import { logDiagnostic } from '@/infrastructure/observability/safeLogger';
import React, { useState, useEffect, useRef, Fragment, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Send, ArrowLeft, Paperclip, X, FileText, Download, Mic, Square, Play, Pause, Loader2, User as UserIcon, PlayCircle } from 'lucide-react'; // Adicionado PlayCircle
import { useAuth } from '@/contexts/AuthContext';
import { useChat } from '@/contexts/ChatContext';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { isToday, isYesterday, format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import ImageModal from '@/components/ImageModal';
import { toPortugueseError } from '@/lib/utils/errorMessages';
import { useOnlinePresence } from '@/hooks/useOnlinePresence';
import { ChatAreaSkeleton } from '@/components/ui/custom-skeletons';

const DateSeparator = ({ date }) => {
  const parsedDate = parseISO(date);
  let label;
  if (isToday(parsedDate)) {
    label = 'Hoje';
  } else if (isYesterday(parsedDate)) {
    label = 'Ontem';
  } else {
    label = format(parsedDate, "d 'de' MMMM 'de' yyyy", { locale: ptBR });
  }

  return (
    <div className="flex items-center justify-center my-4">
      <span className="px-3 py-1 text-xs font-semibold text-muted-foreground bg-muted rounded-full">
        {label}
      </span>
    </div>
  );
};

const formatLastSeen = (lastSeenAt) => {
  if (!lastSeenAt) return null;
  const date = parseISO(lastSeenAt);
  const time = format(date, 'HH:mm');
  
  if (isToday(date)) {
      return `visto hoje às ${time}`;
  } else if (isYesterday(date)) {
      return `visto ontem às ${time}`;
  } else {
      return `visto em ${format(date, 'dd/MM/yyyy')} às ${time}`;
  }
};

const getBucketPath = (value) => parsePrivateFile(value, 'chat_media')?.path || null;

const AudioPlayer = ({ src }) => {
    const audioRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);

    const togglePlay = () => {
        if (!audioRef.current.src) return;
        if (isPlaying) audioRef.current.pause();
        else audioRef.current.play();
        setIsPlaying(!isPlaying);
    };

    useEffect(() => {
        const audio = audioRef.current;
        if(!audio) return;
        const setAudioData = () => {
          if(isFinite(audio.duration)) setDuration(audio.duration);
        };
        const setAudioTime = () => setCurrentTime(audio.currentTime);

        audio.addEventListener('loadeddata', setAudioData);
        audio.addEventListener('timeupdate', setAudioTime);
        const handleEnded = () => setIsPlaying(false);
        audio.addEventListener('ended', handleEnded);

        return () => {
            if (audio) {
                audio.removeEventListener('loadeddata', setAudioData);
                audio.removeEventListener('timeupdate', setAudioTime);
                audio.removeEventListener('ended', handleEnded);
            }
        };
    }, []);

    const formatTime = (time) => {
        if (!time || !isFinite(time)) return '0:00';
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60).toString().padStart(2, '0');
        return `${minutes}:${seconds}`;
    };

    return (
        <div className="flex items-center gap-2 w-64">
            <audio ref={audioRef} src={src} preload="metadata"></audio>
            <Button
              size="icon"
              variant="ghost"
              className="rounded-full"
              aria-label={isPlaying ? 'Pausar áudio' : 'Reproduzir áudio'}
              onClick={togglePlay}
            >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </Button>
            <div className="w-full h-1 bg-muted rounded-full cursor-pointer" onClick={(e) => {
                if (!duration) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const clickPosition = e.clientX - rect.left;
                const newTime = (clickPosition / rect.width) * duration;
                audioRef.current.currentTime = newTime;
            }}>
                <div className="h-full bg-primary rounded-full" style={{ width: `${(currentTime / duration) * 100}%` }}></div>
            </div>
            <span className="text-xs w-12 text-right">{formatTime(isFinite(duration) ? duration : 0)}</span>
        </div>
    );
};

const MediaViewer = ({ mediaPath, messageText, mediaType, onImageClick }) => {
    const { user } = useAuth();
    const actorId = user?.id;
    const [access, setAccess] = useState(null);
    useEffect(() => {
        let cancelled = false;
        let refreshTimer;
        const load = async () => {
            try {
                const cleanPath = getBucketPath(mediaPath);
                if (!cleanPath) throw new Error('invalid_private_file_reference');
                const url = await signPrivateFile(cleanPath, 'chat_media');
                if (cancelled) return;
                setAccess({ mediaPath, actorId, url });
                refreshTimer = setTimeout(load, 240000);
            } catch {
                if (!cancelled) setAccess({ mediaPath, actorId, error: true });
            }
        };
        void load();
        return () => { cancelled = true; clearTimeout(refreshTimer); };
    }, [mediaPath, actorId]);
    const currentAccess = access?.mediaPath === mediaPath && access?.actorId === actorId ? access : null;
    if (!currentAccess) return <div className="h-24 flex items-center justify-center"><Loader2 className="animate-spin" /></div>;
    if (currentAccess.error) return <p className="text-xs text-destructive">Arquivo indisponível ou acesso não autorizado</p>;
    const signedUrl = currentAccess.url;

    const fileType = mediaPath.split('.').pop().toLowerCase();
    
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileType)) {
        return <PrivateImage src={signedUrl} alt={messageText || "Imagem enviada"} className="rounded-lg max-w-[200px] md:max-w-xs h-auto cursor-pointer" onClick={() => onImageClick(signedUrl, 'image')} />;
    }

    // --- CORREÇÃO DO BUG DE ÁUDIO/VÍDEO ---
    // .webm foi REMOVIDO daqui
    if (mediaType === 'video' || (mediaType !== 'audio' && ['mp4', 'mov', 'quicktime'].includes(fileType))) {
        return (
          <div className="relative rounded-lg max-w-[200px] md:max-w-xs h-auto cursor-pointer group" onClick={() => onImageClick(signedUrl, 'video')}>
            <video src={signedUrl} className="rounded-lg w-full h-full" />
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 group-hover:bg-black/60 transition-all rounded-lg">
              <PlayCircle className="w-12 h-12 text-white/80" />
            </div>
          </div>
        );
    }
    // .webm foi ADICIONADO aqui
    if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'webm'].includes(fileType)) {
        return <AudioPlayer src={signedUrl} />;
    }
    // --- FIM DA CORREÇÃO ---

    if (fileType === 'pdf') {
        return (
             <a href={signedUrl} download={messageText || 'documento.pdf'} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-2 bg-background/50 rounded-lg hover:bg-background/80 transition-colors">
                <FileText className="w-8 h-8 text-primary flex-shrink-0" />
                <div className="flex-grow"><p className="text-sm font-medium text-foreground truncate">{messageText || 'Documento PDF'}</p><p className="text-xs text-muted-foreground">Clique para baixar</p></div>
                <Download className="w-5 h-5 text-muted-foreground" />
            </a>
        );
    }
    return <p>Tipo de arquivo não suportado.</p>
}

const ChatMessage = ({ msg, isSender, onImageClick }) => {
  const mediaPath = msg.message_type !== 'text' ? msg.media_url : null;
  const messageText = msg.message_type === 'text' ? msg.message : null;
  const originalFileName = mediaPath ? msg.message : null;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className={`flex ${isSender ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-xs md:max-w-md p-3 rounded-2xl shadow-sm ${ isSender ? 'bg-primary text-primary-foreground rounded-br-lg' : 'bg-card text-card-foreground rounded-bl-lg border'}`}>
        {/* Passa o tipo de mídia para o onImageClick */}
        {mediaPath ? <MediaViewer mediaPath={mediaPath} messageText={originalFileName} mediaType={msg.message_type} onImageClick={onImageClick} /> : <p className="text-sm whitespace-pre-wrap">{messageText}</p>}
        {mediaPath && messageText && messageText !== originalFileName && <p className="text-sm mt-2">{messageText}</p>}
        <p className={`text-xs mt-1 ${isSender ? 'text-primary-foreground/70' : 'text-muted-foreground'} text-right`}>{format(parseISO(msg.created_at), 'HH:mm')}</p>
      </div>
    </motion.div>
  );
};

const ChatPage = ({ propRecipientId, isEmbedded = false, initialDraft = '' }) => {
  const { user } = useAuth();
  const { messages, sendMessage, fetchMessages, loading: messagesLoading, markChatAsRead, hasMoreMessages, loadOlderMessages, loadError, closeConversation } = useChat();
  const { patientId: urlPatientId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [newMessage, setNewMessage] = useState('');
  const [recipient, setRecipient] = useState(null);
  const [recipientLoading, setRecipientLoading] = useState(true);
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [mediaType, setMediaType] = useState(null);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const fileInputRef = useRef(null);
  const initialDraftAppliedRef = useRef(false);
  const [isSending, setIsSending] = useState(false);
  const { setTyping, isUserTyping, isUserOnline, presenceReady, isRelationshipActive } = useOnlinePresence();
  const sendIntent = useRef(null);
  const recipientEpoch = useRef(0);
  const scrollRecipient = useRef(null);
  const typingTimeoutRef = useRef(null);
  // --- MUDANÇA NO ESTADO DO MODAL ---
  const [modalMedia, setModalMedia] = useState({ path: null, type: null });
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const recipientId = React.useMemo(() => {
    if (propRecipientId) return propRecipientId;
    if (user?.profile?.user_type === 'nutritionist') return urlPatientId;
    return user?.profile?.nutritionist_id;
  }, [propRecipientId, urlPatientId, user]);

  useEffect(() => {
    if (!initialDraft || initialDraftAppliedRef.current) return;
    initialDraftAppliedRef.current = true;
    setNewMessage((current) => current.trim() ? current : initialDraft);
  }, [initialDraft]);

  const isArchived = React.useMemo(() => {
    if (!user || !recipient) return false;
    if (presenceReady && !isRelationshipActive(recipientId)) return true;
    
    // Se o usuário logado está inativo, tudo está "arquivado" para ele
    if (user?.profile?.is_active === false) return true;

    if (user?.profile?.user_type === 'patient') {
        // Para o paciente, o chat é com o seu nutricionista fixo.
        // Se o nutricionista do paciente está inativo, o chat está arquivado.
        // Nota: recipient aqui é o nutricionista.
        return recipient.is_active === false;
    } else {
        // Para o nutricionista, o chat é com um paciente específico (recipient).
        // Um chat é considerado "arquivado" apenas se o paciente estiver explicitamente inativo.
        return recipient.is_active === false;
    }
  }, [user, recipient, recipientId, presenceReady, isRelationshipActive]);

  const fetchRecipient = useCallback(async (id) => {
    if (!id) {
      setRecipientLoading(false); 
      return;
    }
    const epoch = ++recipientEpoch.current;
    setRecipient(null);
    setRecipientLoading(true); 

    const { data, error } = await supabase.rpc('get_chat_recipient_profile', {
      recipient_id: id
    });
    
    if (epoch !== recipientEpoch.current) return;
    const recipientData = data ? data[0] : null;

    if (error) {
      logDiagnostic('error', 'pages/shared/ChatPage.jsx:318', 'Erro ao buscar destinatário:', error);
      toast({
        title: "Erro",
        description: toPortugueseError(error, 'Não foi possível carregar os dados do destinatário.'),
        variant: "destructive"
      });
      setRecipient(null);
    } else {
      setRecipient(recipientData);
    }
    setRecipientLoading(false); 
  }, [toast]);

  useEffect(() => {
    fetchRecipient(recipientId);
    return () => { recipientEpoch.current += 1; };
  }, [recipientId, fetchRecipient]);

  const userId = user?.id;
  useEffect(() => {
    sendIntent.current = null;
    setNewMessage(initialDraft || ''); setMediaFile(null); setMediaPreview(null); setMediaType(null);
    if (userId && recipientId) void fetchMessages(userId, recipientId);
    return () => { clearTimeout(typingTimeoutRef.current); setTyping(false); closeConversation(); };
  }, [userId, recipientId, fetchMessages, closeConversation, setTyping, initialDraft]);

  const latestId = messages.at(-1)?.id;
  useEffect(() => {
    const area = messagesContainerRef.current;
    if (!area || !latestId) return;
    if (scrollRecipient.current !== recipientId || area.scrollHeight - area.scrollTop - area.clientHeight < 250) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      scrollRecipient.current = recipientId;
    }
  }, [latestId, recipientId, messagesLoading]);
  const loadOlder = async () => {
    const area = messagesContainerRef.current;
    if (!area) return;
    const height = area.scrollHeight, top = area.scrollTop;
    await loadOlderMessages();
    requestAnimationFrame(() => { if (messagesContainerRef.current === area) area.scrollTop = top + area.scrollHeight - height; });
  };

  useEffect(() => { if(recipientId) markChatAsRead(recipientId); }, [recipientId, markChatAsRead, messages]);

  const handleTyping = () => {
    setTyping(true, recipientId);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setTyping(false);
    }, 2000);
  };

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      const MAX_FILE_SIZE = CHAT_UPLOAD_MAX_BYTES;
      if (file.size > MAX_FILE_SIZE) {
        toast({ title: "Arquivo muito grande", description: "O tamanho máximo do arquivo é de 20 MB.", variant: "destructive" });
        if(fileInputRef.current) fileInputRef.current.value = ""; return;
      }
      try { validateUploadSelection('chat_media', file); } catch {
        toast({ title: 'Arquivo inválido', description: 'Envie JPG, PNG, WebP, PDF, áudio ou vídeo de até 20 MB.', variant: 'destructive' });
        event.target.value = ''; return;
      }
      let type = null;
      if (file.type.startsWith('image/')) type = 'image';
      else if (file.type.startsWith('audio/')) type = 'audio';
      else if (file.type.startsWith('video/')) type = 'video';
      else if (file.type === 'application/pdf') type = 'pdf';
      else {
        toast({ title: "Arquivo inválido", description: "Apenas imagens, vídeos, áudios e PDFs são permitidos.", variant: "destructive" });
        if(fileInputRef.current) fileInputRef.current.value = ""; return;
      }
      setMediaType(type); setMediaFile(file); setMediaPreview(URL.createObjectURL(file));
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if ((!newMessage.trim() && !mediaFile) || !recipientId || !user?.id || isSending) return;
    const actor = user.id, destination = recipientId, text = newMessage.trim();
    const previous = sendIntent.current;
    const intent = previous?.actor === actor && previous.recipient === destination && previous.text === text && previous.file === mediaFile
      ? previous : { actor, recipient: destination, text, file: mediaFile, type: mediaFile ? mediaType : 'text', id: crypto.randomUUID(), path: null };
    sendIntent.current = intent;
    setIsSending(true);
    try {
      if (intent.file && !intent.path) {
        validateUploadSelection('chat_media', intent.file);
        intent.path = `${actor}/${crypto.randomUUID()}.${fileExtensionForMime(intent.file.type)}`;
        try { await uploadVerifiedFile('chat_media', intent.path, intent.file, { chatRecipientId: destination }); }
        catch (error) { intent.path = null; throw error; }
      }
      const sent = await sendMessage({ to_id: destination, message: intent.file ? (intent.type === 'audio' ? '' : intent.file.name) : text,
        message_type: intent.type, media_url: intent.path, client_message_id: intent.id });
      if (sent && sendIntent.current === intent) {
        sendIntent.current = null;
        setNewMessage(''); setMediaFile(null); setMediaPreview(null); setMediaType(null); setTyping(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    } catch (error) {
      toast({ title: 'Falha no envio', description: toPortugueseError(error, 'O rascunho foi mantido. Tente novamente.'), variant: 'destructive' });
    } finally { setIsSending(false); }
  };

  const startRecording = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mimeType = 'audio/webm';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
            toast({ title: "Formato não suportado", description: "Seu navegador não suporta gravação em áudio WebM.", variant: "destructive" });
            return;
        }
        const mediaRecorder = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];
        
        mediaRecorder.ondataavailable = (event) => { 
          if(event.data.size > 0) audioChunksRef.current.push(event.data); 
        };
        
        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
            const audioFile = new File([audioBlob], `audio_${Date.now()}.webm`, { type: mimeType });
            setMediaFile(audioFile);
            setMediaPreview(URL.createObjectURL(audioBlob));
            setMediaType('audio');
            mediaRecorder.stream.getTracks().forEach(track => track.stop());
            setIsRecording(false); 
        };
        
        mediaRecorder.start(); 
        setIsRecording(true);
      } catch (err) {
          logDiagnostic('error', 'pages/shared/ChatPage.jsx:445', "Erro ao gravar áudio:", err);
          toast({ title: "Erro de gravação", description: "Não foi possível acessar o microfone. Verifique as permissões.", variant: "destructive"});
      }
  };

  const stopRecording = () => { 
    if (mediaRecorderRef.current?.state === "recording") { 
      mediaRecorderRef.current.stop(); 
    }
  };
  
  const groupedMessages = messages.filter(msg => (msg.from_id === user?.id && msg.to_id === recipientId) || (msg.to_id === user?.id && msg.from_id === recipientId)).reduce((acc, msg) => {
    const date = format(parseISO(msg.created_at), 'yyyy-MM-dd');
    if (!acc[date]) acc[date] = [];
    acc[date].push(msg); return acc;
  }, {});

  if ((messagesLoading && !messages.length) || recipientLoading) return (
    <div className={`flex flex-col bg-slate-50 ${isEmbedded ? 'h-full' : 'h-screen'}`}>
      <header className="shrink-0 bg-white border-b p-4 flex items-center shadow-md z-30 opacity-50">
        <div className="w-10 h-10 bg-primary/10 rounded-full mr-3" />
        <div className="space-y-2">
            <div className="h-4 w-32 bg-muted rounded" />
            <div className="h-3 w-20 bg-muted rounded" />
        </div>
      </header>
      <ChatAreaSkeleton messages={8} />
    </div>
  );

  if (!recipient) return (
    <div className={`flex items-center justify-center p-4 text-center text-muted-foreground ${isEmbedded ? 'h-full' : 'h-screen'}`}>
      Você não tem um {user?.profile?.user_type === 'patient' ? 'nutricionista' : 'paciente'} associado.
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* --- MUDANÇA NA CHAMADA DO MODAL --- */}
      <ImageModal
        mediaPath={modalMedia.path}
        mediaType={modalMedia.type}
        onClose={() => setModalMedia({ path: null, type: null })}
      />
      {/* Cabeçalho - fixo no topo do container */}
      <header className="shrink-0 bg-white border-b p-4 flex items-center shadow-md z-30">
        {!isEmbedded && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Voltar"
            onClick={() => navigate(-1)}
            className="mr-2"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
        )}
        <div className="w-10 h-10 bg-primary/10 rounded-full mr-3 flex items-center justify-center font-bold overflow-hidden">
          {recipient.avatar_url ? (
            <PrivateImage src={recipient.avatar_url} alt={recipient.name} className="w-full h-full object-cover" />
          ) : (
            <UserIcon className="w-6 h-6 text-primary" />
          )}
        </div>
        <div>
          <h2 className="font-semibold text-foreground leading-tight">{recipient.name}</h2>
          <div className="flex flex-col min-h-[1.5rem] justify-center">
            {isUserOnline(recipientId) ? (
              <div className="flex items-center gap-1.5 leading-none">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shrink-0" />
                <p className="text-xs font-medium text-green-600">Disponível</p>
                {isUserTyping(recipientId) && (
                  <span className="text-[10px] text-primary animate-pulse font-medium ml-1.5">
                    digitando...
                  </span>
                )}
              </div>
            ) : (
                <p className="text-[10px] sm:text-xs text-muted-foreground leading-none animate-in fade-in duration-500">
                    {formatLastSeen(recipient.last_seen_at) || (recipient.user_type === 'nutritionist' ? 'Nutricionista' : 'Paciente')}
                </p>
            )}
          </div>
        </div>
      </header>

      {/* Lista de mensagens - área com rolagem */}
      <main ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-2">
        {loadError && <p role="alert" className="text-sm text-destructive">Falha ao atualizar o chat. <Button variant="link" onClick={() => fetchMessages(user.id, recipientId)}>Tentar novamente</Button></p>}
        {hasMoreMessages && <Button variant="outline" disabled={messagesLoading} onClick={loadOlder}>Carregar mensagens anteriores</Button>}
        {Object.entries(groupedMessages).map(([date, msgs]) => (
          <Fragment key={date}>
            <DateSeparator date={date} />
            {/* --- MUDANÇA NO onImageClick --- */}
            <div className="space-y-4">
              {msgs.map((msg) => {
                // Detectar se é mensagem de aviso (consulta agendada)
                const isAppointmentNotice = msg.message && msg.message.includes('Consulta agendada');

                if (isAppointmentNotice) {
                  return (
                    <div key={msg.id} className="text-center">
                      <div className="inline-block px-4 py-2 bg-blue-100 text-blue-600 rounded-lg text-sm">
                        {msg.message}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(parseISO(msg.created_at), 'HH:mm')}
                      </p>
                    </div>
                  );
                }

                return (
                  <ChatMessage
                    key={msg.id}
                    msg={msg}
                    isSender={msg.from_id === user.id}
                    onImageClick={(path, type) => setModalMedia({ path, type })}
                  />
                );
              })}
            </div>
          </Fragment>
        ))}

        <div ref={messagesEndRef} />
      </main>
      {/* Área de entrada - fixa na base do container */}
      <footer className="shrink-0 bg-white p-4 border-t shadow-lg z-20">
        {isArchived ? (
            <div className="flex items-center justify-center p-3 sm:p-4 bg-muted/50 rounded-xl border border-dashed border-border flex-col text-center">
                <p className="text-secondary-foreground font-medium text-sm sm:text-base">Módulo Arquivado</p>
                <p className="text-muted-foreground text-xs sm:text-sm mt-1 max-w-sm">Você não pode enviar novas mensagens para este chat, pois o vínculo foi arquivado.</p>
            </div>
        ) : (
          <>
            {mediaPreview && (
              <div className="relative p-2 mb-2 border rounded-lg max-w-sm flex items-center gap-2 bg-slate-50">
                {mediaType === 'image' && <PrivateImage src={mediaPreview} alt="Prévia" className="max-h-24 rounded" />}
                {mediaType === 'video' && <video src={mediaPreview} className="max-h-24 rounded" muted loop autoPlay />}
                {mediaType === 'audio' && <AudioPlayer src={mediaPreview} />}
                {mediaType === 'pdf' && (
                  <div className="flex items-center gap-2">
                    <FileText className="w-8 h-8 text-destructive" />
                    <span className="text-sm text-muted-foreground truncate">{mediaFile?.name}</span>
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remover anexo"
                  className="absolute -top-3 -right-3 bg-white rounded-full h-6 w-6 shadow-md"
                  onClick={() => {
                    setMediaFile(null);
                    setMediaPreview(null);
                    setMediaType(null);
                    if(fileInputRef.current) fileInputRef.current.value = "";
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}
            <form onSubmit={handleSendMessage} className="flex items-center space-x-3">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept="image/*,video/*,audio/*,application/pdf"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Anexar arquivo"
                onClick={() => fileInputRef.current.click()}
                disabled={isSending}
              >
                <Paperclip className="w-5 h-5" />
              </Button>
              {isRecording ? (
                <div className="flex items-center gap-2 flex-1">
                  <div className="w-2 h-2 bg-destructive rounded-full animate-pulse"></div>
                  <p className="text-sm text-destructive">Gravando...</p>
                </div>
              ) : (
                <Input
                  id="new-message"
                  name="new-message"
                  type="text"
                  aria-label="Mensagem"
                  value={newMessage}
                  onChange={(e) => {
                  setNewMessage(e.target.value);
                  handleTyping();
                }}
                  placeholder="Digite sua mensagem..."
                  className="flex-1 bg-slate-50 border-gray-200 focus:border-primary focus:ring-primary"
                  autoComplete="off"
                  disabled={isSending}
                />
              )}
              {newMessage.trim() === '' && !mediaFile ?
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={isRecording ? 'Parar gravação' : 'Gravar áudio'}
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={isSending}
                >
                  {isRecording ? <Square className="w-5 h-5 text-destructive" /> : <Mic className="w-5 h-5" />}
                </Button>
                :
                <Button
                  type="submit"
                  size="icon"
                  aria-label={isSending ? 'Enviando mensagem' : 'Enviar mensagem'}
                  disabled={isSending || (newMessage.trim() === '' && !mediaFile)}
                  className=""
                >
                  {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                </Button>
              }
            </form>
          </>
        )}
      </footer>
    </div>
  );
};

export default ChatPage;
