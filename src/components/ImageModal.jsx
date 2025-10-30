import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, AlertTriangle } from 'lucide-react'; // Importado AlertTriangle
import { Button } from './ui/button';

// O 'mediaPath' é a URL assinada, e 'mediaType' nos diz o que é
const ImageModal = ({ mediaPath, mediaType, onClose }) => {

  // Se não há 'mediaPath', não renderiza nada
  if (!mediaPath) return null;

  const renderMedia = () => {
    if (mediaType === 'video') {
      return (
        <video 
          src={mediaPath} 
          controls 
          autoPlay 
          className="object-contain w-full h-full max-h-[90vh] rounded-lg"
        >
          Seu navegador não suporta vídeos.
        </video>
      );
    }
    
    // O padrão é imagem
    if (mediaType === 'image') {
      return (
        <img 
          src={mediaPath} 
          alt="Visualização ampliada" 
          className="object-contain w-full h-full max-h-[90vh] rounded-lg" 
        />
      );
    }

    // Fallback para caso algo dê errado
    return (
      <div className="w-full h-[50vh] flex flex-col items-center justify-center text-white">
        <AlertTriangle className="w-12 h-12 mb-4" />
        <p>Tipo de mídia não suportado para visualização.</p>
      </div>
    );
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.8, y: 50 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.8, y: 50 }}
          className="relative max-w-4xl max-h-[90vh] w-full"
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            variant="ghost"
            size="icon"
            className="absolute -top-12 right-2 text-white hover:text-white hover:bg-white/20 rounded-full z-10"
            onClick={onClose}
          >
            <X className="w-6 h-6" />
            <span className="sr-only">Fechar</span>
          </Button>
          
          {mediaPath ? renderMedia() : (
            <p className="text-white text-center">Não foi possível carregar a mídia.</p>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ImageModal;