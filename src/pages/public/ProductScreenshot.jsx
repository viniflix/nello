import React from 'react';
import { PRODUCT_CAPTURE_BASE } from './productCaptureAssets';

const screens = {
  dashboard: { base: '/images/product/', desktop: 'nutri-dashboard-desktop', mobile: 'nutri-dashboard-mobile', width: 1410, height: 891, mobileWidth: 360, retina: false, alt: 'Painel profissional do Nello com agendamentos e atividades de pacientes de exemplo.' },
  diary: { desktop: 'paciente-diario-mobile', mobile: 'paciente-diario-mobile', width: 345, height: 812, mobileWidth: 345, alt: 'Diário alimentar real do Nello, com registros de uma conta de exemplo.' },
  chat: { desktop: 'paciente-chat-mobile', mobile: 'paciente-chat-mobile', width: 345, height: 812, mobileWidth: 345, alt: 'Conversa real na área do paciente do Nello, com mensagens fictícias de acompanhamento.' },
  progress: { desktop: 'paciente-progresso-mobile', mobile: 'paciente-progresso-mobile', width: 345, height: 812, mobileWidth: 345, alt: 'Histórico de evolução na área do paciente do Nello, com dados de uma conta de exemplo.' },
  plan: { desktop: 'nutri-plano-desktop', mobile: 'nutri-plano-mobile', width: 1410, height: 891, mobileWidth: 360, alt: 'Tela real de planejamento alimentar do Nello, com refeições, porções e análise nutricional. Dados fictícios.' },
  context: { desktop: 'nutri-prontuario-desktop', mobile: 'nutri-prontuario-mobile', width: 1410, height: 891, mobileWidth: 360, alt: 'Prontuário real do Nello com resumo do acompanhamento da paciente fictícia Marina Alves.' },
  patient: { desktop: 'paciente-inicio-desktop', mobile: 'paciente-inicio-mobile', width: 1235, height: 712, mobileWidth: 345, alt: 'Área real do paciente no Nello, com plano alimentar, registro de refeições e navegação mobile. Dados fictícios.' },
};

export function getProductCaptureSrc(screen, mobile = false, retina = false) {
  const image = screens[screen];
  return `${image.base || PRODUCT_CAPTURE_BASE}${mobile ? image.mobile : image.desktop}-${(mobile ? image.mobileWidth : image.width) * (retina && image.retina !== false ? 2 : 1)}.webp`;
}

export default function ProductScreenshot({ screen = 'plan', mobileOnly = false, eager = false, sizes = '(max-width: 760px) 288px, (max-width: 1000px) 90vw, 1100px', className = '' }) {
  const image = screens[screen];
  const base = image.base || PRODUCT_CAPTURE_BASE;
  const portraitOnly = mobileOnly || image.desktop === image.mobile;
  return <picture className={`product-screenshot ${className}`}>
    {!portraitOnly && <source media="(max-width: 1000px)" srcSet={image.retina === false ? `${base}${image.mobile}-${image.mobileWidth}.webp` : `${base}${image.mobile}-${image.mobileWidth}.webp 1x, ${base}${image.mobile}-${image.mobileWidth * 2}.webp 2x`} width={image.mobileWidth} height="812" />}
    <img
      src={`${base}${portraitOnly ? image.mobile + '-' + image.mobileWidth : image.desktop + '-' + image.width}.webp`}
      srcSet={portraitOnly ? `${base}${image.mobile}-${image.mobileWidth}.webp 1x, ${base}${image.mobile}-${image.mobileWidth * 2}.webp 2x` : `${base}${image.desktop}-720.webp 720w, ${base}${image.desktop}-${image.width}.webp ${image.width}w${image.retina === false ? '' : `, ${base}${image.desktop}-${image.width * 2}.webp ${image.width * 2}w`}`}
      sizes={portraitOnly ? undefined : sizes}
      width={portraitOnly ? image.mobileWidth : image.width}
      height={portraitOnly ? 812 : image.height}
      alt={image.alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
    />
  </picture>;
}
