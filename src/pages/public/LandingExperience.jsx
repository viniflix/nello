import React, { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { ArrowDown, Check, MessageCircle } from 'lucide-react';
import { PublicAction } from './PublicSiteLayout';
import ProductScreenshot, { getProductCaptureSrc } from './ProductScreenshot';
import { usePublicReveal } from './usePublicReveal';

const examples = {
  plan: { label: 'Plano alimentar', title: 'Planejamento alimentar no Nello' },
  context: { label: 'Visão clínica', title: 'O acompanhamento em uma visão' },
  patient: { label: 'Área do paciente', title: 'O cuidado na rotina do paciente' },
};

export function useLandingMotion() {
  const root = useRef(null);
  const [reduced, setReduced] = useState(false);
  const [arrived, setArrived] = useState(false);

  usePublicReveal(root, true, reduced);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  useEffect(() => {
    if (reduced) setArrived(true);
  }, [reduced]);
  useEffect(() => {
    const element = root.current;
    if (!element) return undefined;
    const sync = () => element.toggleAttribute('data-tab-hidden', document.hidden);
    sync();
    document.addEventListener('visibilitychange', sync);
    const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
      entries.forEach(entry => {
        entry.target.classList.toggle('landing-motion-offscreen', !entry.isIntersecting);
        if (entry.target.classList.contains('landing-hero-copy')) {
          element.toggleAttribute('data-hero-away', !entry.isIntersecting);

        }
      });
    }) : null;
    element.querySelectorAll('.landing-hero, .landing-hero-copy, .landing-phone-scene, .landing-journey, .landing-final-cta').forEach(scene => observer?.observe(scene));
    return () => { document.removeEventListener('visibilitychange', sync); observer?.disconnect(); };
  }, []);
  useEffect(() => {
    const element = root.current;
    if (!element) return undefined;
    const journey = element.querySelector('.landing-journey-grid');
    const nodes = [...element.querySelectorAll('.landing-journey-node')];
    const reducedNow = reduced || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const stopped = reducedNow;
    let frame = 0;
    const update = () => {
      frame = 0;
      if (document.hidden) return;
      const height = document.documentElement.scrollHeight - window.innerHeight;
      if (!stopped) element.style.setProperty('--reading-progress', height > 0 ? String(Math.min(1, Math.max(0, window.scrollY / height))) : '0');
      if (!journey || nodes.length < 2) return;
      const bounds = journey.getBoundingClientRect();
      const first = nodes[0].getBoundingClientRect();
      const mobile = window.matchMedia('(max-width: 760px)').matches;
      const trackHeight = nodes.at(-1).parentElement.offsetTop - nodes[0].parentElement.offsetTop;
      journey.style.setProperty('--care-track-height', `${trackHeight}px`);
      if (stopped) {
        if (reducedNow) nodes.forEach(node => node.removeAttribute('data-care-active'));
        return;
      }
      const span = mobile ? trackHeight : bounds.height;
      const progress = Math.min(1, Math.max(0, (window.innerHeight * .64 - first.top - first.height / 2) / Math.max(1, span)));
      journey.style.setProperty('--care-progress', String(progress));
      nodes.forEach((node, index) => node.toggleAttribute('data-care-active', index === Math.round(progress * (nodes.length - 1))));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    schedule();
    if (!stopped) window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    document.addEventListener('visibilitychange', schedule);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    observer?.observe(element);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      document.removeEventListener('visibilitychange', schedule);
      observer?.disconnect();
    };
  }, [reduced]);
  return { root, reduced, arrived };
}

function CarePreview({ reduced }) {
  const [selected, setSelected] = useState('plan');
  const [interactive, setInteractive] = useState(false);
  useEffect(() => setInteractive(true), []);
  const stage = useRef(null);
  const tabs = useRef(null);
  const transition = useRef(null);
  const fallbackAnimation = useRef(null);
  const motionStopped = useRef(reduced);
  motionStopped.current = reduced;
  const selectionRequest = useRef(0);
  const [pending, setPending] = useState(null);
  const example = examples[selected];
  useEffect(() => {
    const element = tabs.current;
    const measure = () => {
      const button = element?.querySelector('[aria-pressed="true"]');
      if (!button) return;
      element.style.setProperty('--tab-x', `${button.offsetLeft}px`);
      element.style.setProperty('--tab-y', `${button.offsetTop}px`);
      element.style.setProperty('--tab-width', `${button.offsetWidth}px`);
      element.style.setProperty('--tab-height', `${button.offsetHeight}px`);
      element.setAttribute('data-marker-ready', '');
    };
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (element) observer?.observe(element);
    return () => observer?.disconnect();
  }, [selected]);
  useEffect(() => {
    const stop = () => { if (document.hidden) { transition.current?.skipTransition(); fallbackAnimation.current?.cancel(); } };
    if (reduced) { transition.current?.skipTransition(); fallbackAnimation.current?.cancel(); }
    document.addEventListener('visibilitychange', stop);
    return () => document.removeEventListener('visibilitychange', stop);
  }, [reduced]);
  useEffect(() => () => { selectionRequest.current += 1; transition.current?.skipTransition(); fallbackAnimation.current?.cancel(); }, []);
  useEffect(() => {
    if (!stage.current || !('IntersectionObserver' in window)) return undefined;
    const observer = new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting) { transition.current?.skipTransition(); fallbackAnimation.current?.cancel(); }
    });
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);
  const selectExample = async key => {
    if (key === selected && !pending) return;
    const request = ++selectionRequest.current;
    setPending(key);
    const image = new Image();
    image.src = getProductCaptureSrc(key, key === 'patient' || window.matchMedia('(max-width: 1000px)').matches, window.devicePixelRatio > 1);
    try { await image.decode(); } catch { /* The normal image element retains its native error/alt fallback. */ }
    if (request !== selectionRequest.current) return;
    transition.current?.skipTransition();
    const update = () => flushSync(() => {
      if (request === selectionRequest.current) { setSelected(key); setPending(null); }
    });
    const bounds = stage.current?.getBoundingClientRect();
    const stopped = motionStopped.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.hidden || !bounds || bounds.bottom <= 0 || bounds.top >= window.innerHeight;
    // Portrait and desktop captures have different geometry; never morph one into the other.
    if (stopped || !document.startViewTransition || key === 'patient' || selected === 'patient') {
      update();
      fallbackAnimation.current?.cancel();
      if (!stopped) fallbackAnimation.current = stage.current?.querySelector('.product-screenshot')?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: 'ease-out' });
    } else {
      transition.current = document.startViewTransition(update);
      transition.current.ready.catch(() => {});
      transition.current.finished.catch(() => {});
    }
  };
  useEffect(() => {
    const element = stage.current;
    if (!element || reduced) return undefined;
    const pointer = window.matchMedia('(min-width: 761px) and (hover: hover) and (pointer: fine)');
    let frame = 0;
    const reset = () => {
      cancelAnimationFrame(frame);
      element.style.setProperty('--tilt-x', '0deg');
      element.style.setProperty('--tilt-y', '0deg');
    };
    const move = event => {
      if (!pointer.matches) { reset(); return; }
      const bounds = element.getBoundingClientRect();
      cancelAnimationFrame(frame);
      const x = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1));
      const y = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1));
      frame = requestAnimationFrame(() => {
        element.style.setProperty('--tilt-x', `${-y * 2}deg`);
        element.style.setProperty('--tilt-y', `${x * 3}deg`);
      });
    };
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerleave', reset);
    window.addEventListener('resize', reset);
    return () => {
      reset();
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerleave', reset);
      window.removeEventListener('resize', reset);
    };
  }, [reduced]);
  return <div className="landing-preview-stage" ref={stage}>
    <div className="landing-preview-tabs" ref={tabs} role="group" aria-label="Explorar a demonstração do Nello" aria-busy={pending !== null}><span className="landing-tab-marker" aria-hidden="true" />{Object.entries(examples).map(([key, { label }]) => <button type="button" key={key} disabled={!interactive} aria-controls="landing-product-capture" aria-pressed={selected === key} onClick={() => selectExample(key)}>{label}</button>)}</div>
    <figure className="landing-demo" data-screen={selected}>
      <div id="landing-product-capture" data-device={selected === 'patient' ? 'phone' : 'adaptive'} className={`landing-demo-workspace landing-capture-workspace${selected === 'patient' ? ' landing-capture-patient' : ''}`}>
        <h2 className="sr-only">{example.title}</h2>
        <ProductScreenshot screen={selected} mobileOnly={selected === 'patient'} eager />
      </div>
      <figcaption className="landing-demo-summary">{selected === 'plan' ? 'Refeições, porções e análise nutricional. Seu plano, do início à revisão.' : selected === 'context' ? 'Histórico e avaliações para acompanhar cada paciente com contexto.' : 'O plano do nutricionista, os registros e as mensagens na rotina do paciente.'}</figcaption>
    <div className="landing-float landing-float-plan"><span className="landing-float-icon"><Check aria-hidden="true" size={20} /></span><div><strong>Do plano à rotina.</strong><span>Cuidado com continuidade</span></div></div>
    <div className="landing-float landing-float-message"><span className="landing-float-icon"><MessageCircle aria-hidden="true" size={20} /></span><div><strong>Uma conversa mais próxima.</strong><span>Entre uma consulta e outra</span></div></div>
    </figure>
  </div>;
}

export function LandingHero({ reduced }) {
  return <section className="landing-hero" aria-labelledby="landing-title">
    <div className="landing-atmosphere" aria-hidden="true"><div className="landing-aurora landing-aurora-green" /><div className="landing-aurora landing-aurora-orange" /><div className="landing-light-beam" /><div className="landing-orbit landing-orbit-one" /><div className="landing-orbit landing-orbit-two" /><div className="landing-grid" /><span className="landing-star landing-star-one" /><span className="landing-star landing-star-two" /><span className="landing-star landing-star-three" /></div>
    <svg className="landing-care-orbits" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><path d="M-100 780C80 140 850-70 1390 190S1700 810 1030 940" pathLength="100" /><path d="M-100 780C80 140 850-70 1390 190S1700 810 1030 940" pathLength="100" className="landing-orbit-signal" /><path d="M-80 380C270 860 950 940 1530 290" pathLength="100" className="landing-orbit-signal landing-orbit-signal-secondary" /></svg>
    <div className="landing-hero-copy site-container"><span className="landing-pill"><span aria-hidden="true" />Seu consultório e seus pacientes, no mesmo lugar.</span><h1 id="landing-title"><span className="landing-title-line">{'O cuidado não termina'.split(' ').map((word, index) => <React.Fragment key={word}><span className="landing-title-word" style={{ '--word-order': index }}>{word}</span>{index < 3 ? ' ' : null}</React.Fragment>)}</span><em>na consulta.</em></h1><p>Prontuários, planos alimentares e acompanhamento.<br className="landing-desktop-break" /> Organize o consultório e mantenha o plano perto da rotina do paciente.</p><div className="site-hero-actions"><PublicAction compactLabel="Criar conta">Começar com o Nello</PublicAction><a className="site-action site-action-secondary landing-explore" href="#nello-em-acao"><span className="site-action-full-label">Ver as telas do Nello</span><span className="site-action-compact-label">Ver o Nello</span><ArrowDown size={16} aria-hidden="true" /></a></div><span className="landing-hero-for">Feito para nutricionistas. Acessível também aos seus pacientes.</span></div>
    <div id="nello-em-acao" className="landing-preview-wrap site-container"><CarePreview reduced={reduced} /></div>
    <div className="landing-hero-bottom site-container"><a href="#site-features" className="landing-scroll-cue"><span aria-hidden="true">↓</span>Explore os recursos</a></div>
  </section>;
}

export function LandingPatientVisual() {
  return <div className="landing-phone-scene"><div className="landing-phone-halo" aria-hidden="true" /><figure className="landing-phone landing-phone-capture"><ProductScreenshot screen="diary" mobileOnly /></figure><div className="landing-phone-caption"><Check aria-hidden="true" size={18} /><span>Sua rotina, registrada.</span></div></div>;
}
