import { useEffect } from 'react';

export function usePublicReveal(root, enabled = true, stopped = false) {
  useEffect(() => {
    const element = root.current;
    if (!element || !enabled) return undefined;
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const targets = [...element.querySelectorAll('[data-reveal] > div, .landing-bento-card, .landing-trust-grid > article, .landing-journey-grid > article, .landing-final-cta > .site-container, main h1, main .site-feature, main .site-product-capture, main .site-section-heading, main .research-method-grid > article, main .research-credit-grid > article')].filter(target => !target.closest('.landing-hero') && !target.matches('.landing-bento, .landing-journey-grid, .landing-trust-grid'));
    let observer;
    const show = target => target.classList.add('public-motion-visible');
    const sync = () => {
      observer?.disconnect();
      element.removeAttribute('data-motion-ready');
      if (stopped || !media || media.matches || !('IntersectionObserver' in window)) {
        targets.forEach(show);
        return;
      }
      observer = new IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting) {
          show(entry.target);
          observer.unobserve(entry.target);
        }
      }, { threshold: 0, rootMargin: '0px 0px -32px 0px' });
      targets.forEach(target => {
        target.classList.add('public-motion-item');
        const kind = target.matches('h1, .landing-section-heading, .site-section-heading') ? 'heading' : target.matches('.landing-phone-scene, .site-product-capture') ? 'media' : target.closest('.landing-final-cta') ? 'cta' : target.matches('.landing-bento-card, .site-feature, .research-credit-grid > article') ? 'card' : 'fade';
        target.dataset.motionKind = kind;
        const index = [...target.parentElement.children].filter(child => child.matches('.landing-bento-card, .site-feature, article')).indexOf(target);
        target.style.setProperty('--entrance-delay', `${Math.max(0, Math.min(index, 3)) * 90}ms`);
        observer.observe(target);
      });
      element.setAttribute('data-motion-ready', '');
    };
    const focus = event => targets.filter(target => target.contains(event.target)).forEach(show);
    sync();
    media?.addEventListener('change', sync);
    element.addEventListener('focusin', focus);
    return () => {
      observer?.disconnect();
      media?.removeEventListener('change', sync);
      element.removeEventListener('focusin', focus);
      element.removeAttribute('data-motion-ready');
    };
  }, [root, enabled, stopped]);
}
