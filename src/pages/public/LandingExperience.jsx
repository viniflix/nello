import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, MessageCircle, Pause, Play } from 'lucide-react';
import { PublicAction } from './PublicSiteLayout';
import ProductScreenshot from './ProductScreenshot';

const examples = {
  plan: { label: 'Plano alimentar', title: 'Planejamento alimentar no Nello' },
  context: { label: 'Visão clínica', title: 'O acompanhamento em uma visão' },
  patient: { label: 'Área do paciente', title: 'O cuidado na rotina do paciente' },
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
      <div className="landing-demo-workspace landing-capture-workspace" key={selected}>
        <h2 className="sr-only">{example.title}</h2>
        <ProductScreenshot screen={selected} eager />
      </div>
      <figcaption><span className="landing-capture-dot" aria-hidden="true" />Interface real do Nello · contas temporárias com dados fictícios.</figcaption>
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
  return <figure className="landing-meal-visual landing-meal-capture"><ProductScreenshot screen="plan" sizes="(max-width: 760px) 288px, 520px" /><figcaption>Planejamento real · dados fictícios.</figcaption></figure>;
}

export function LandingPatientVisual() {
  return <div className="landing-phone-scene"><div className="landing-phone-halo" aria-hidden="true" /><figure className="landing-phone landing-phone-capture"><ProductScreenshot screen="patient" mobileOnly /><figcaption>Área real do paciente · dados fictícios.</figcaption></figure><div className="landing-phone-caption"><span aria-hidden="true"><ArrowUpRight size="1em" /></span>O que foi combinado<br />continua ao alcance.</div></div>;
}
