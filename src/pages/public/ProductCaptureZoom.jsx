import React from 'react';
import { Expand } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import ProductScreenshot from './ProductScreenshot';

export default function ProductCaptureZoom({ screen, mobileOnly = false }) {
  return <Dialog>
    <DialogTrigger asChild><button type="button" className="public-capture-expand"><Expand aria-hidden="true" size={16} />Ampliar a tela</button></DialogTrigger>
    <DialogContent className="public-capture-dialog">
      <DialogTitle>Explore a tela do Nello</DialogTitle>
      <DialogDescription>Demonstração com uma conta de exemplo. Use a rolagem para ver os detalhes.</DialogDescription>
      <div className={`public-capture-scroll${mobileOnly ? ' public-capture-scroll-phone' : ''}`} tabIndex={0} role="region" aria-label="Captura ampliada do Nello"><ProductScreenshot screen={screen} mobileOnly={mobileOnly} eager sizes="95vw" /></div>
    </DialogContent>
  </Dialog>;
}
