import React from 'react';
import { Check, CalendarDays, Utensils, MessageCircle, ArrowUpRight, Leaf } from 'lucide-react';

export default function ProductIllustration({ patient = false }) {
  return <figure className={`site-product${patient ? ' site-product-patient' : ''}`}>
    <div className="site-product-bar"><span><Leaf aria-hidden="true" size={17} />Nello</span><span className="site-product-label">{patient ? 'Meu acompanhamento' : 'Seu consultório, conectado'}</span><span aria-hidden="true" className="site-demo-avatar">N</span></div>
    <div className="site-product-body"><div className="site-product-heading"><div><span className="site-eyebrow">{patient ? 'Um dia de cada vez' : 'Visão do acompanhamento'}</span><h2>{patient ? 'Seu plano. Sua rotina.' : 'O cuidado, em perspectiva.'}</h2></div><ArrowUpRight aria-hidden="true" /></div>
      <div className="site-demo-metrics"><div><CalendarDays aria-hidden="true" /><span>Próximo encontro</span><strong>Consulta agendada</strong></div><div><Check aria-hidden="true" /><span>{patient ? 'Minha evolução' : 'Plano alimentar'}</span><strong>{patient ? 'Cada registro conta' : 'Pronto para acompanhar'}</strong></div></div>
      <div className="site-demo-meal"><div><span className="site-demo-icon"><Utensils aria-hidden="true" /></span><div><h3>Café da manhã</h3><p>Alimentos, porções e alternativas</p></div><span className="site-demo-time">08:00</span></div><ul><li><span>Pão integral</span><span>2 fatias</span></li><li><span>Ovo mexido</span><span>1 unidade</span></li><li><span>Uma fruta da sua preferência</span><span>1 porção</span></li></ul></div>
      <div className="site-demo-note"><MessageCircle aria-hidden="true" size={20} /><span>O plano continua na rotina.<br /><strong>E a conversa também.</strong></span><span className="site-note-dot" aria-hidden="true" /></div>
    </div><figcaption>Demonstração ilustrativa da experiência. Não é uma prescrição alimentar.</figcaption>
  </figure>;
}
