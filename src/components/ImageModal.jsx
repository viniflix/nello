import React, { useLayoutEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog';

const ImageModal = ({ mediaPath, mediaType, onClose }) => {
  const origin = useRef(null);
  useLayoutEffect(() => { if (mediaPath) origin.current = document.activeElement; }, [mediaPath]);
  if (!mediaPath) return null;
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent aria-describedby={undefined} className="max-w-4xl pt-14" onCloseAutoFocus={event => { event.preventDefault(); origin.current?.focus(); }}>
      <DialogTitle className="sr-only">{mediaType === 'video' ? 'Visualizar vídeo' : 'Visualizar imagem'}</DialogTitle>
      {mediaType === 'video' ? <video src={mediaPath} controls autoPlay className="object-contain w-full max-h-[calc(100dvh-8rem)] rounded-lg">Seu navegador não suporta vídeos.</video>
        : mediaType === 'image' ? <img src={mediaPath} alt="Visualização ampliada" className="object-contain w-full max-h-[calc(100dvh-8rem)] rounded-lg" />
          : <p role="alert">Tipo de mídia não suportado para visualização.</p>}
    </DialogContent>
  </Dialog>;
};
export default ImageModal;
