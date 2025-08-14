
import React, { useState, useEffect, useRef, Fragment } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Send, ArrowLeft, Paperclip, X, FileText, Download, Mic, Square, Play, Pause, Loader2, User as UserIcon } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useChat } from '@/contexts/ChatContext';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { isToday, isYesterday, format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import ImageModal from '@/components/ImageModal';

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
        const setAudioData = () => setDuration(audio.duration);
        const setAudioTime = () => setCurrentTime(audio.currentTime);

        audio.addEventListener('loadeddata', setAudioData);
        audio.addEventListener('timeupdate', setAudioTime);
        audio.addEventListener('ended', () => setIsPlaying(false));

        return () => {
            if (audio) {
                audio.removeEventListener('loadeddata', setAudioData);
                audio.removeEventListener('timeupdate', setAudioTime);
                audio.removeEventListener('ended', () => setIsPlaying(false));
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
            <Button size="icon" variant="ghost" className="rounded-full" onClick={togglePlay}>
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
            <span className="text-xs w-12 text-right">{formatTime(duration)}</span>
        </div>
    );
};

const MediaViewer = ({ mediaPath, messageText, onImageClick }) => {
    const [signedUrl, setSignedUrl] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const getSignedUrl = async () => {
            if (!mediaPath) {
                setLoading(false);
                return;
            }
            
            const path = mediaPath;
            setLoading(true);
            const { data, error } = await supabase.storage
                .from('chat_media')
                .createSignedUrl(path, 300); // 5 minutes validity

            if (error) {
                console.error('Error creating signed URL:', error);
                setSignedUrl('');
            } else {
                setSignedUrl(data.signedUrl);
            }
            setLoading(false);
        };
        getSignedUrl();
    }, [mediaPath]);

    if (loading) return <div className="h-24 flex items-center justify-center"><Loader2 className="animate-spin" /></div>;
    if (!signedUrl) return <p className="text-xs text-destructive">Erro ao carregar mídia</p>;
    
    const fileType = mediaPath.split('.').pop().toLowerCase();
    
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileType)) {
        return <img src={signedUrl} alt={messageText || "Imagem enviada"} className="rounded-lg max-w-[200px] md:max-w-xs h-auto cursor-pointer" onClick={() => onImageClick(signedUrl)} />;
    }
    if (['mp4', 'webm', 'mov', 'quicktime'].includes(fileType)) {
        return <video controls src={signedUrl} className="rounded-lg max-w-[200px] md:max-w-xs h-auto" />;
    }
    if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'webm'].includes(fileType)) {
        return <AudioPlayer src={signedUrl} />;
    }
    if (fileType === 'pdf') {
        return (
             <a href={signedUrl} download={messageText || 'document.pdf'} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-2 bg-background/50 rounded-lg hover:bg-background/80 transition-colors">
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
        {mediaPath ? <MediaViewer mediaPath={mediaPath} messageText={originalFileName} onImageClick={onImageClick} /> : <p className="text-sm whitespace-pre-wrap">{messageText}</p>}
        {mediaPath && messageText && messageText !== originalFileName && <p className="text-sm mt-2">{messageText}</p>}
        <p className={`text-xs mt-1 ${isSender ? 'text-primary-foreground/70' : 'text-muted-foreground'} text-right`}>{format(parseISO(msg.created_at), 'HH:mm')}</p>
      </div>
    </motion.div>
  );
};

const ChatPage = () => {
  const { user } = useAuth();
  const { messages, sendMessage, fetchMessages, loading, markChatAsRead } = useChat();
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
  const [modalMediaPath, setModalMediaPath] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const recipientId = user.profile.user_type === 'nutritionist' ? patientId : user.profile.nutritionist_id;

  useEffect(() => {
    const fetchRecipient = async () => {
      if (!recipientId) return;
      const { data, error } = await supabase.from('user_profiles').select('id, name, user_type, avatar_url').eq('id', recipientId).maybeSingle();
      if (error) console.error("Error fetching recipient", error); else setRecipient(data);
    };
    fetchRecipient();
  }, [recipientId]);

  useEffect(() => { if (user && recipientId) fetchMessages(user.id, recipientId); }, [user, recipientId, fetchMessages]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'auto' }); }, [messages]);
  useEffect(() => { if(recipientId) markChatAsRead(recipientId); }, [recipientId, markChatAsRead, messages]);


  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      const MAX_FILE_SIZE = 100 * 1024 * 1024;
      if (file.size > MAX_FILE_SIZE) {
        toast({ title: "Arquivo muito grande", description: "O tamanho máximo do arquivo é de 100MB.", variant: "destructive" });
        if(fileInputRef.current) fileInputRef.current.value = ""; return;
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
    if ((newMessage.trim() === '' && !mediaFile) || !recipientId || isSending) return;
    setIsSending(true);

    let mediaPath = null;
    let messageType = 'text';
    let messageText = newMessage.trim();

    if (mediaFile) {
      messageType = mediaType;
      messageText = mediaFile.name; 
      const fileExtension = mediaFile.name.split('.').pop();
      const filePath = `${user.id}/${Date.now()}.${fileExtension}`;
      const { error } = await supabase.storage.from('chat_media').upload(filePath, mediaFile);
      if (error) { toast({ title: "Erro no upload", description: error.message, variant: "destructive" }); setIsSending(false); return; }
      mediaPath = filePath;
    }

    await sendMessage({ from_id: user.id, to_id: recipientId, message: messageText, message_type: messageType, media_url: mediaPath });
    setNewMessage(''); setMediaFile(null); setMediaPreview(null); setMediaType(null);
    if(fileInputRef.current) fileInputRef.current.value = ""; setIsSending(false);
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
        mediaRecorder.ondataavailable = (event) => { if(event.data.size > 0) audioChunksRef.current.push(event.data); };
        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
            const audioFile = new File([audioBlob], `audio_${Date.now()}.webm`, { type: mimeType });
            setMediaFile(audioFile);
            setMediaPreview(URL.createObjectURL(audioBlob));
            setMediaType('audio');
            mediaRecorder.stream.getTracks().forEach(track => track.stop());
        };
        mediaRecorder.start(); setIsRecording(true);
      } catch (err) {
          toast({ title: "Erro de gravação", description: "Não foi possível acessar o microfone. Verifique as permissões.", variant: "destructive"});
      }
  };

  const stopRecording = () => { if (mediaRecorderRef.current?.state === "recording") { mediaRecorderRef.current.stop(); setIsRecording(false); } };
  
  const handleBack = () => { user.profile.user_type === 'nutritionist' ? navigate('/nutritionist') : navigate('/patient'); };
  const groupedMessages = messages.reduce((acc, msg) => {
    const date = format(parseISO(msg.created_at), 'yyyy-MM-dd');
    if (!acc[date]) acc[date] = [];
    acc[date].push(msg); return acc;
  }, {});

  if (!recipient && !loading) return <div className="flex items-center justify-center h-screen">Você não tem um {user.profile.user_type === 'patient' ? 'nutricionista' : 'paciente'} associado.</div>;
  if (loading) return <div className="flex items-center justify-center h-screen">Carregando chat...</div>;

  return (
    <div className="h-screen flex flex-col bg-background">
      <ImageModal mediaPath={modalMediaPath} onClose={() => setModalMediaPath(null)} />
      <header className="bg-card/80 backdrop-blur-md border-b border-border p-4 flex items-center sticky top-0 z-10">
        <Button variant="ghost" size="icon" onClick={handleBack} className="mr-2"><ArrowLeft className="w-5 h-5" /></Button>
        <div className="w-10 h-10 bg-secondary rounded-full mr-3 flex items-center justify-center font-bold text-primary overflow-hidden">
            {recipient.avatar_url ? <img src={recipient.avatar_url} alt={recipient.name} className="w-full h-full object-cover" /> : <UserIcon className="w-6 h-6 text-muted-foreground" />}
        </div>
        <div>
          <h2 className="font-semibold text-foreground">{recipient.name}</h2>
          <p className="text-xs text-muted-foreground">{recipient.user_type === 'nutritionist' ? 'Nutricionista' : 'Paciente'}</p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-2">
         {Object.entries(groupedMessages).map(([date, msgs]) => (
            <Fragment key={date}>
              <DateSeparator date={date} />
              <div className="space-y-4">{msgs.map((msg) => (<ChatMessage key={msg.id} msg={msg} isSender={msg.from_id === user.id} onImageClick={setModalMediaPath} />))}</div>
            </Fragment>
        ))}
        <div ref={messagesEndRef} />
      </main>

      <footer className="bg-card p-4 border-t">
        {mediaPreview && (
          <div className="relative p-2 mb-2 border rounded-lg max-w-sm flex items-center gap-2">
            {mediaType === 'image' && <img src={mediaPreview} alt="Preview" className="max-h-24 rounded" />}
            {mediaType === 'video' && <video src={mediaPreview} className="max-h-24 rounded" muted loop autoPlay />}
            {mediaType === 'audio' && <AudioPlayer src={mediaPreview} />}
            {mediaType === 'pdf' && <div className="flex items-center gap-2"><FileText className="w-8 h-8 text-destructive" /> <span className="text-sm text-muted-foreground truncate">{mediaFile?.name}</span></div>}
            <Button variant="ghost" size="icon" className="absolute -top-3 -right-3 bg-card rounded-full h-6 w-6" onClick={() => { setMediaFile(null); setMediaPreview(null); setMediaType(null); if(fileInputRef.current) fileInputRef.current.value = ""; }}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}
        <form onSubmit={handleSendMessage} className="flex items-center space-x-3">
          <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*,video/*,audio/*,application/pdf" />
          <Button type="button" variant="ghost" size="icon" onClick={() => fileInputRef.current.click()} disabled={isSending}><Paperclip className="w-5 h-5" /></Button>
          {isRecording ? (
             <div className="flex items-center gap-2 flex-1"><div className="w-2 h-2 bg-destructive rounded-full animate-pulse"></div><p className="text-sm text-destructive">Gravando...</p></div>
          ) : (
             <Input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Digite sua mensagem..." className="flex-1 bg-background" autoComplete="off" disabled={isSending} />
          )}
          {newMessage.trim() === '' && !mediaFile ? 
            <Button type="button" variant="ghost" size="icon" onClick={isRecording ? stopRecording : startRecording} disabled={isSending}>
                {isRecording ? <Square className="w-5 h-5 text-destructive" /> : <Mic className="w-5 h-5" />}
            </Button>
            : 
            <Button type="submit" size="icon" disabled={isSending || (newMessage.trim() === '' && !mediaFile)}><Send className="w-5 h-5" /></Button>
          }
        </form>
      </footer>
    </div>
  );
};

export default ChatPage;
