import { legalContent } from '@/features/privacy/legalContent';
import { LEGAL_VERSION, SUPPORT_EMAIL } from '@/features/privacy/consent';
import { Mail, KeyRound, ShieldCheck } from 'lucide-react';
import PublicSiteLayout from './PublicSiteLayout';
import { useEffect, useState } from 'react';

function ContactText({ text }) {
  return text.split(/(suporte@nellonutri\.com\.br)/g).map((part, index) => part === SUPPORT_EMAIL ? <a key={index} href={`mailto:${SUPPORT_EMAIL}`}>{part}</a> : part);
}

function DocumentParagraph({ text }) {
  const items = text.split(/(?<=[.!?]) (?=[A-ZÀ-Ý])/);
  return items.length > 2 ? <div className="site-document-paragraph"><p><ContactText text={items[0]} /></p><ul className="site-document-list">{items.slice(1).map((item, index) => <li key={index}><ContactText text={item} /></li>)}</ul></div> : <p><ContactText text={text} /></p>;
}

export default function LegalInformationPage({ pathname }) {
  const page = legalContent[pathname];
  const [activeSection, setActiveSection] = useState(0);
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return undefined;
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible.length) setActiveSection(Number(visible[0].target.dataset.sectionIndex));
    }, { rootMargin: '-12% 0px -55% 0px' });
    document.querySelectorAll('.site-document-body > section[data-section-index]').forEach(section => observer.observe(section));
    return () => observer.disconnect();
  }, [pathname]);
  const intro = {'/ajuda':'Encontre seu caminho para acessar, receber um convite e continuar o acompanhamento.', '/seguranca':'Proteja sua conta e saiba como relatar uma possível falha de forma responsável.', '/privacidade':'Entenda o uso das informações, suas preferências e como exercer seus direitos.', '/termos':'Conheça as condições de acesso e as responsabilidades no uso da plataforma.'}[pathname];
  const indexLinks = page.sections.map(([title], index) => <a key={title} href={`#document-section-${index}`} aria-current={activeSection === index ? 'location' : undefined} onClick={() => setActiveSection(index)}>{title}</a>);
  return <PublicSiteLayout activePath={pathname}><main id="main-content" tabIndex={-1} className="site-container">
    <header className="site-subhero"><span className="site-eyebrow">Nello · Informação e confiança</span><h1>{page.title}</h1><p>{intro}</p><p className="site-small">Versão {LEGAL_VERSION}</p></header>
    {pathname === '/ajuda' && <nav className="site-support-cards" aria-label="Acesso rápido à ajuda">{[[KeyRound,'Entrar na minha conta','Acesse com seu email e senha.','/login'],[ShieldCheck,'Orientações de segurança','Cuide da sua conta e dos seus acessos.','/seguranca'],[Mail,'Falar com o suporte','Ajuda para usar e acessar o Nello.',`mailto:${SUPPORT_EMAIL}`]].map(([Icon,title,text,href])=><a key={href} href={href}><Icon aria-hidden="true" size={22} /><strong>{title}</strong><span>{text}</span></a>)}</nav>}
    <div className="site-document"><aside className="site-document-index"><nav className="site-document-nav site-document-desktop" aria-label="Nesta página">{indexLinks}</nav><details className="site-document-mobile"><summary>Nesta página</summary><nav className="site-document-nav" aria-label="Nesta página">{indexLinks}</nav></details></aside><div className="site-document-body">{page.sections.map(([title, paragraphs],sectionIndex) => <section key={title} id={`document-section-${sectionIndex}`} data-section-index={sectionIndex}><h2>{title}</h2>{paragraphs.map((text,index)=><DocumentParagraph key={index} text={text} />)}{pathname === '/ajuda' && sectionIndex < 3 && <a className="site-action" href="/login">{sectionIndex === 2 ? 'Recuperar meu acesso' : sectionIndex === 1 ? 'Acessar minha conta de paciente' : 'Entrar no Nello'}</a>}</section>)}{pathname === '/ajuda' && <section id="sobre-o-nello"><h2>Um produto em desenvolvimento</h2><p>O Nello está em fase beta. Os recursos e a experiência continuam recebendo melhorias. Se encontrar uma dificuldade, fale com o suporte e consulte o status dos serviços.</p><a className="site-inline-link" href="/status">Consultar disponibilidade</a></section>}<aside className="site-document-contact"><h2>Conte com o suporte</h2><p>Suporte, privacidade e segurança: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p><a className="site-inline-link" href="/login">Voltar ao acesso</a></aside></div></div>
  </main></PublicSiteLayout>;
}
