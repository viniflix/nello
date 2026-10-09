import React from 'react';
import ProductScreenshot from './ProductScreenshot';
import ProductCaptureZoom from './ProductCaptureZoom';

export default function ProductIllustration({ patient = false }) {
  return <figure className={`site-product site-product-capture${patient ? ' site-product-patient' : ''}`}>
    <ProductScreenshot screen={patient ? 'patient' : 'context'} mobileOnly={patient} eager sizes="(max-width: 1000px) 320px, 550px" />
    <figcaption>{patient ? 'Plano, diário e mensagens ao alcance do paciente.' : 'Histórico, avaliações e próximos passos no prontuário.'}<ProductCaptureZoom screen={patient ? 'patient' : 'context'} mobileOnly={patient} /></figcaption>
  </figure>;
}
