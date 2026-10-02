import React, {useState, useEffect} from 'react';
import {parsePrivateFile, signPrivateFile} from '@/lib/storage/privateFiles';
import {PrivateImage} from '@/components/ui/private-image';
import {useAuth} from '@/contexts/AuthContext';
import {Loader2, PlayCircle, FileText, Download} from 'lucide-react';
import AudioPlayer from './AudioPlayer';
const getBucketPath = (value) => parsePrivateFile(value, 'chat_media')?.path || null;

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
    if (!currentAccess) return <div role="status" aria-label="Carregando arquivo" className="h-24 flex items-center justify-center"><Loader2 aria-hidden="true" className="animate-spin" /></div>;
    if (currentAccess.error) return <p role="alert" className="text-xs text-destructive">Arquivo indisponível ou acesso não autorizado</p>;
    const signedUrl = currentAccess.url;

    const fileType = mediaPath.split('.').pop().toLowerCase();

    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileType)) {
        return <button type="button" aria-label="Abrir imagem enviada" className="block rounded-lg max-w-full min-h-11 min-w-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" onClick={() => onImageClick(signedUrl, 'image')}><PrivateImage src={signedUrl} alt={messageText || "Imagem enviada"} className="rounded-lg max-w-[200px] md:max-w-xs h-auto" /></button>;
    }

    // --- CORREÇÃO DO BUG DE ÁUDIO/VÍDEO ---
    // .webm foi REMOVIDO daqui
    if (mediaType === 'video' || (mediaType !== 'audio' && ['mp4', 'mov', 'quicktime'].includes(fileType))) {
        return (
          <button type="button" aria-label="Abrir vídeo enviado" className="relative block rounded-lg max-w-[200px] md:max-w-xs min-h-11 min-w-11 h-auto group focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" onClick={() => onImageClick(signedUrl, 'video')}>
            <video src={signedUrl} className="rounded-lg w-full h-full" />
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 group-hover:bg-black/60 transition-all rounded-lg">
              <PlayCircle aria-hidden="true" className="w-12 h-12 text-white/80" />
            </div>
          </button>
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


export default MediaViewer;
