import React from 'react';
import ProductScreenshot from './ProductScreenshot';

export default function ProductIllustration({ patient = false }) {
  return <figure className={`site-product site-product-capture${patient ? ' site-product-patient' : ''}`}>
    <div className={patient ? "public-phone-frame" : "public-desktop-frame"}><ProductScreenshot screen={patient ? 'chat' : 'context'} mobileOnly={patient} eager sizes="(max-width: 1000px) 320px, 1080px" /></div>
    <figcaption>{patient ? 'Converse com seu nutricionista entre as consultas.' : 'Histórico, avaliações e próximos passos no prontuário.'}</figcaption>
  </figure>;
}
