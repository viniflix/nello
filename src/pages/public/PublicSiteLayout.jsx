import React from 'react';
import { ArrowUpRight, Menu, ArrowRight } from 'lucide-react';
import { SUPPORT_EMAIL } from '../../features/privacy/consent';

const links = [['/recursos', 'Recursos'], ['/para-pacientes', 'Para pacientes'], ['/ajuda', 'Ajuda']];
export function PublicAction({ href = '/register', children = 'Criar minha conta', secondary = false }) {
  return <a className={`site-action${secondary ? ' site-action-secondary' : ''}`} href={href}>{children}<ArrowUpRight aria-hidden="true" size={18} /></a>;
}
export function PublicNextStep() {
  return <section className="site-cta site-container" aria-labelledby="site-next-step"><div><span className="site-eyebrow">O próximo passo é seu</span><h2 id="site-next-step">Seu cuidado merece<br />um lugar à altura.</h2><p>Conheça o Nello e organize o acompanhamento do primeiro encontro à rotina do paciente.</p></div><div><PublicAction /><p className="site-small">Já utiliza o Nello? <a href="/login">Entre na sua conta <ArrowRight size={14} aria-hidden="true" /></a></p></div></section>;
}
export default function PublicSiteLayout({ children, activePath = '/' }) {
  return <div className="nello-public-site">
    <header className="site-header site-container">
      <a href="/" aria-label="Nello, início" className="site-brand"><img src="/nello-logo.png" alt="Nello" width="130" height="52" /><span>Nutrição, conectada.</span></a>
      <nav aria-label="Navegação pública" className="site-desktop-nav">{links.map(([href, label]) => <a key={href} href={href} aria-current={activePath === href ? 'page' : undefined}>{label}</a>)}</nav>
      <div className="site-desktop-access"><a href="/login">Entrar</a><PublicAction /></div>
      <details className="site-mobile-menu"><summary><Menu aria-hidden="true" size={20} />Menu</summary><nav aria-label="Navegação pública no celular">{links.map(([href, label]) => <a key={href} href={href} aria-current={activePath === href ? 'page' : undefined}>{label}</a>)}<a href="/login">Entrar</a><PublicAction /></nav></details>
    </header>
    {children}
    <footer className="site-footer"><div className="site-container site-footer-grid"><div><a href="/" aria-label="Nello, início"><img src="/nello-logo.png" alt="Nello" width="120" height="48" /></a><p>Tecnologia para organizar o cuidado.<br />Proximidade para acompanhar pessoas.</p><span className="site-beta">Nello está em Beta</span></div><div><h2>Conheça o Nello</h2><a href="/recursos">Recursos para o consultório</a><a href="/para-pacientes">Experiência do paciente</a><a href="/register">Criar conta</a><a href="/login">Acessar minha conta</a></div><div><h2>Conte com a gente</h2><a href="/ajuda">Central de ajuda</a><a href="/status">Status dos serviços</a><a href="/seguranca">Segurança</a><a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></div></div><div className="site-container site-footer-bottom"><p>Nello · Plataforma de acompanhamento nutricional</p><nav aria-label="Documentos e privacidade"><a href="/termos">Termos de uso</a><a href="/privacidade">Privacidade</a></nav></div></footer>
  </div>;
}
