import React from 'react';
import ProductScreenshot from './ProductScreenshot';

export default function ProductIllustration({ patient = false }) {
  return <figure className={`site-product site-product-capture${patient ? ' site-product-patient' : ''}`}>
    <ProductScreenshot screen={patient ? 'patient' : 'context'} mobileOnly={patient} eager sizes="(max-width: 1000px) 320px, 550px" />
    <figcaption>Captura real do Nello · dados fictícios.</figcaption>
  </figure>;
}
