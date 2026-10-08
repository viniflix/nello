import React from 'react';

const screens = {
  plan: { desktop: 'nutri-plano-desktop', mobile: 'nutri-plano-mobile', width: 1425, height: 891, alt: 'Tela real de planejamento alimentar do Nello, com refeições, porções e análise nutricional. Dados fictícios.' },
  context: { desktop: 'nutri-prontuario-desktop', mobile: 'nutri-prontuario-mobile', width: 1425, height: 891, alt: 'Prontuário real do Nello com resumo do acompanhamento da paciente fictícia Marina Alves.' },
  dashboard: { desktop: 'nutri-dashboard-desktop', mobile: 'nutri-dashboard-mobile', width: 1425, height: 891, alt: 'Dashboard real do Nello com pacientes, registros e consultas fictícias.' },
  patient: { desktop: 'paciente-inicio-desktop', mobile: 'paciente-inicio-mobile', width: 1265, height: 712, alt: 'Área real do paciente no Nello com próxima consulta, plano alimentar e registros fictícios.' },
};

export default function ProductScreenshot({ screen = 'plan', mobileOnly = false, eager = false, sizes = '(max-width: 760px) 288px, (max-width: 1000px) 90vw, 1100px', className = '' }) {
  const image = screens[screen];
  const base = '/images/product/';
  return <picture className={`product-screenshot ${className}`}>
    {!mobileOnly && <source media="(max-width: 760px)" srcSet={`${base}${image.mobile}-375.webp`} width="375" height="812" />}
    <img
      src={`${base}${mobileOnly ? image.mobile + '-375' : image.desktop + '-' + image.width}.webp`}
      srcSet={mobileOnly ? undefined : `${base}${image.desktop}-720.webp 720w, ${base}${image.desktop}-${image.width}.webp ${image.width}w`}
      sizes={mobileOnly ? undefined : sizes}
      width={mobileOnly ? 375 : image.width}
      height={mobileOnly ? 812 : image.height}
      alt={image.alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
    />
  </picture>;
}
