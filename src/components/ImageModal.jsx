
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { supabase } from '@/lib/customSupabaseClient';

const ImageModal = ({ mediaPath, onClose }) => {
  const [signedUrl, setSignedUrl] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getSignedUrl = async () => {
      if (!mediaPath) return;
      setLoading(true);
      const { data, error } = await supabase.storage
        .from('chat_media')
        .createSignedUrl(mediaPath, 300); // 5 minutes validity

      if (error) {
        console.error('Error creating signed URL for modal:', error);
        setSignedUrl('');
      } else {
        setSignedUrl(data.signedUrl);
      }
      setLoading(false);
    };

    getSignedUrl();
  }, [mediaPath]);

  if (!mediaPath) return null;

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
          {loading ? (
             <div className="w-full h-[50vh] flex items-center justify-center">
                <Loader2 className="w-12 h-12 text-white animate-spin" />
             </div>
          ) : signedUrl ? (
             <img src={signedUrl} alt="Visualização ampliada" className="object-contain w-full h-full max-h-[90vh] rounded-lg" />
          ) : (
            <p className="text-white text-center">Não foi possível carregar a imagem.</p>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ImageModal;
