import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, CalendarDays, Check, ChevronRight, ClipboardList, Leaf, MessageCircle, Pause, Play, Plus, Users, Utensils } from 'lucide-react';
import { PublicAction } from './PublicSiteLayout';

const examples = {
  plan: { label: 'Plano alimentar', eyebrow: 'Planejar com contexto', title: 'Cada refeição, uma possibilidade.', note: 'Refeições, porções e alternativas', rows: [['Café da manhã', '08:00', 'Alimentos e medidas para começar o dia'], ['Almoço', '12:30', 'Porções e alternativas para a rotina'], ['Lanche da tarde', '16:00', 'Um plano feito para acompanhar']] },
  context: { label: 'Visão clínica', eyebrow: 'Conhecer a pessoa', title: 'O contexto faz parte do cuidado.', note: 'História, avaliações e evolução', rows: [['História do paciente', '01', 'Informações do acompanhamento'], ['Avaliações', '02', 'Registros que apoiam o olhar clínico'], ['Evolução', '03', 'Uma perspectiva do percurso']] },
  patient: { label: 'Área do paciente', eyebrow: 'Continuar presente', title: 'O cuidado encontra a rotina.', note: 'Plano, diário e comunicação', rows: [['Meu plano', '01', 'Alimentos, porções e orientações'], ['Meu diário', '02', 'Registros da alimentação'], ['Minha conversa', '03', 'Comunicação com o nutricionista']] },
};

export function useLandingMotion() {
  const root = useRef(null);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  useEffect(() => {
    const element = root.current;
    if (!element || paused || reduced || !('IntersectionObserver' in window)) return undefined;
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('landing-revealed');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08 });
    element.querySelectorAll('[data-reveal]').forEach(section => observer.observe(section));
    return () => observer.disconnect();
  }, [paused, reduced]);
  return { root, paused, reduced, toggleMotion: () => setPaused(value => !value) };
}

function CarePreview({ paused, reduced }) {
  const [selected, setSelected] = useState('plan');
  const stage = useRef(null);
  const example = examples[selected];
  useEffect(() => {
    const element = stage.current;
    if (!element || paused || reduced || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return undefined;
    let frame = 0;
    let bounds;
    const reset = () => {
      cancelAnimationFrame(frame);
      element.style.setProperty('--tilt-x', '0deg');
      element.style.setProperty('--tilt-y', '0deg');
    };
    const enter = () => { bounds = element.getBoundingClientRect(); };
    const move = event => {
      if (!bounds) return;
      cancelAnimationFrame(frame);
      const x = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1));
      const y = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1));
      frame = requestAnimationFrame(() => {
        element.style.setProperty('--tilt-x', `${-y * 2}deg`);
        element.style.setProperty('--tilt-y', `${x * 3}deg`);
      });
    };
    element.addEventListener('pointerenter', enter);
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerleave', reset);
    window.addEventListener('resize', reset);
    return () => {
      reset();
      element.removeEventListener('pointerenter', enter);
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerleave', reset);
      window.removeEventListener('resize', reset);
    };
  }, [paused, reduced]);
  return <div className="landing-preview-stage" ref={stage}>
    <div className="landing-preview-tabs" role="group" aria-label="Explorar a demonstração do Nello">{Object.entries(examples).map(([key, { label }]) => <button type="button" key={key} aria-pressed={selected === key} onClick={() => setSelected(key)}>{label}<ArrowUpRight aria-hidden="true" size={14} /></button>)}</div>
    <figure className="landing-demo">
      <div className="landing-demo-chrome"><span><Leaf size={20} aria-hidden="true" />nello<span className="landing-demo-beta">Beta</span></span><span className="landing-demo-label">Seu consultório, conectado.</span><span className="landing-demo-avatar" aria-hidden="true">N</span></div>
      <div className="landing-demo-layout"><div className="landing-demo-sidebar" aria-hidden="true"><span className="landing-demo-sidebar-label">SEU ESPAÇO</span>{[[Users, 'Pacientes'], [ClipboardList, 'Avaliações'], [Utensils, 'Planos'], [CalendarDays, 'Agenda'], [MessageCircle, 'Mensagens']].map(([Icon, label]) => <span className={label === 'Planos' && selected === 'plan' ? 'is-selected' : ''} key={label}><Icon size={16} />{label}</span>)}<span className="landing-sidebar-bottom"><Leaf size={16} />Cuidado em cada detalhe.</span></div>
        <div className="landing-demo-workspace" key={selected}><div className="landing-demo-heading"><div><span>{example.eyebrow}</span><h2>{example.title}</h2></div><span className="landing-demo-add" aria-hidden="true"><Plus size={18} /></span></div><div className="landing-demo-summary"><span><span className="landing-demo-dot" />{example.note}</span><span>Exemplo ilustrativo</span></div><div className="landing-demo-rows">{example.rows.map(([title, time, text], index) => <div className="landing-demo-row" key={title}><span className="landing-demo-row-icon" aria-hidden="true">{index === 0 ? <Utensils size={18} /> : index === 1 ? <Leaf size={18} /> : <CalendarDays size={18} />}</span><div><strong>{title}</strong><span>{text}</span></div><span className="landing-demo-time">{time}</span><ChevronRight size={16} aria-hidden="true" /></div>)}</div><div className="landing-demo-bottom"><span><Check aria-hidden="true" size={15} />O profissional orienta. O Nello conecta.</span><span aria-hidden="true"><ArrowUpRight size="1em" /></span></div></div>
      </div><figcaption>Demonstração ilustrativa. Dados fictícios; não é uma prescrição alimentar.</figcaption>
    </figure>
    <div className="landing-float landing-float-plan"><span className="landing-float-icon"><Check aria-hidden="true" size={20} /></span><div><strong>Do plano à rotina.</strong><span>Cuidado com continuidade</span></div></div>
    <div className="landing-float landing-float-message"><span className="landing-float-icon"><MessageCircle aria-hidden="true" size={20} /></span><div><strong>Uma conversa mais próxima.</strong><span>Entre uma consulta e outra</span></div></div>
  </div>;
}

export function LandingHero({ paused, reduced, toggleMotion }) {
  return <section className="landing-hero" aria-labelledby="landing-title">
    <div className="landing-atmosphere" aria-hidden="true"><div className="landing-aurora landing-aurora-green" /><div className="landing-aurora landing-aurora-orange" /><div className="landing-light-beam" /><div className="landing-orbit landing-orbit-one" /><div className="landing-orbit landing-orbit-two" /><div className="landing-grid" /><span className="landing-star landing-star-one" /><span className="landing-star landing-star-two" /><span className="landing-star landing-star-three" /></div>
    <div className="landing-hero-copy site-container"><span className="landing-pill"><span aria-hidden="true" />Nutrição, conectada.<span className="landing-pill-beta">Nello Beta</span></span><h1 id="landing-title"><span>O cuidado não termina</span><em>na consulta.</em></h1><p>Seu olhar clínico. A rotina do paciente.<br className="landing-desktop-break" /> Um lugar para conectar cada parte do acompanhamento.</p><div className="site-hero-actions"><PublicAction compactLabel="Criar conta">Começar com o Nello</PublicAction><a className="site-action site-action-secondary landing-explore" href="#nello-em-acao"><span className="site-action-full-label">Explore a experiência</span><span className="site-action-compact-label">Ver o Nello</span><span className="landing-play-icon"><Play size={12} aria-hidden="true" /></span></a></div><span className="landing-hero-for">Feito para nutricionistas. Pensado também para pacientes.</span></div>
    <div id="nello-em-acao" className="landing-preview-wrap site-container"><CarePreview paused={paused} reduced={reduced} /></div>
    <div className="landing-hero-bottom site-container"><a href="#site-features" className="landing-scroll-cue"><span aria-hidden="true">↓</span>Conheça o cuidado conectado</a><button type="button" className="landing-motion-toggle" aria-pressed={paused} onClick={toggleMotion} disabled={reduced}>{paused || reduced ? <Play aria-hidden="true" size={14} /> : <Pause aria-hidden="true" size={14} />}{reduced ? 'Movimento reduzido' : paused ? 'Ativar animações' : 'Pausar animações'}</button></div>
  </section>;
}

export function LandingMealVisual() {
  return <div className="landing-meal-visual" aria-label="Exemplo ilustrativo de organização de refeições"><div className="landing-meal-orbit" aria-hidden="true" /><div className="landing-meal-icon" aria-hidden="true"><Utensils size={30} /></div>{[['Café da manhã', 'Comece pelo contexto'], ['Almoço', 'Personalize as porções'], ['Lanche', 'Explore as alternativas']].map(([label, text], index) => <div className={`landing-meal-chip landing-meal-chip-${index}`} key={label}><span className="landing-meal-chip-dot" aria-hidden="true" /><span><strong>{label}</strong><small>{text}</small></span><Check size={14} aria-hidden="true" /></div>)}</div>;
}

export function LandingPatientVisual() {
  return <div className="landing-phone-scene"><div className="landing-phone-halo" aria-hidden="true" /><div className="landing-phone"><div className="landing-phone-camera" aria-hidden="true" /><div className="landing-phone-header"><Leaf aria-hidden="true" size={20} /><span>nello</span><span className="landing-phone-avatar" aria-hidden="true">N</span></div><span className="landing-phone-greeting">Um dia de cada vez.</span><h3>Seu plano.<br />Sua rotina.</h3><div className="landing-phone-date"><CalendarDays aria-hidden="true" size={14} />Meu acompanhamento</div><div className="landing-phone-meal"><span><Utensils aria-hidden="true" size={17} />Café da manhã</span><p>Alimentos, porções<br />e alternativas.</p><span className="landing-phone-link">Consultar o plano<ArrowRight aria-hidden="true" size={14} /></span></div><div className="landing-phone-message"><MessageCircle aria-hidden="true" size={18} /><span>Uma dúvida?<br /><strong>Converse com seu nutri.</strong></span></div><div className="landing-phone-nav" aria-hidden="true"><Leaf size={18} /><Utensils size={18} /><MessageCircle size={18} /></div></div><div className="landing-phone-caption"><span aria-hidden="true"><ArrowUpRight size="1em" /></span>O que foi combinado<br />continua ao alcance.</div><span className="landing-phone-disclaimer">Demonstração ilustrativa da área do paciente.</span></div>;
}
