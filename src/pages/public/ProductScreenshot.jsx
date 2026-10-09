import React from 'react';
import { PRODUCT_CAPTURE_BASE } from './productCaptureAssets';

const screens = {
  plan: { desktop: 'nutri-plano-desktop', mobile: 'nutri-plano-mobile', width: 1410, height: 891, mobileWidth: 360, alt: 'Tela real de planejamento alimentar do Nello, com refeições, porções e análise nutricional. Dados fictícios.' },
  context: { desktop: 'nutri-prontuario-desktop', mobile: 'nutri-prontuario-mobile', width: 1410, height: 891, mobileWidth: 360, alt: 'Prontuário real do Nello com resumo do acompanhamento da paciente fictícia Marina Alves.' },
  dashboard: { desktop: 'nutri-dashboard-desktop', mobile: 'nutri-dashboard-mobile', width: 1410, height: 891, mobileWidth: 360, alt: 'Dashboard real do Nello com pacientes, registros e consultas fictícias.' },
  patient: { desktop: 'paciente-inicio-desktop', mobile: 'paciente-inicio-mobile', width: 1235, height: 712, mobileWidth: 345, alt: 'Área real do paciente no Nello, com plano alimentar, registro de refeições e navegação mobile. Dados fictícios.' },
};

export function getProductCaptureSrc(screen, mobile = false) {
  const image = screens[screen];
  return `${PRODUCT_CAPTURE_BASE}${mobile ? image.mobile + '-' + image.mobileWidth : image.desktop + '-' + image.width}.webp`;
}

export default function ProductScreenshot({ screen = 'plan', mobileOnly = false, eager = false, sizes = '(max-width: 760px) 288px, (max-width: 1000px) 90vw, 1100px', className = '' }) {
  const image = screens[screen];
  const base = PRODUCT_CAPTURE_BASE;
  return <picture className={`product-screenshot ${className}`}>
    {!mobileOnly && <source media="(max-width: 760px)" srcSet={`${base}${image.mobile}-${image.mobileWidth}.webp`} width={image.mobileWidth} height="812" />}
    <img
      src={`${base}${mobileOnly ? image.mobile + '-' + image.mobileWidth : image.desktop + '-' + image.width}.webp`}
      srcSet={mobileOnly ? undefined : `${base}${image.desktop}-720.webp 720w, ${base}${image.desktop}-${image.width}.webp ${image.width}w`}
      sizes={mobileOnly ? undefined : sizes}
      width={mobileOnly ? image.mobileWidth : image.width}
      height={mobileOnly ? 812 : image.height}
      alt={image.alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
    />
  </picture>;
}
