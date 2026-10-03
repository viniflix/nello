import { legalContent } from '@/features/privacy/legalContent';
import { LEGAL_VERSION, SUPPORT_EMAIL } from '@/features/privacy/consent';
import { Mail, KeyRound, ShieldCheck } from 'lucide-react';
import PublicSiteLayout from './PublicSiteLayout';

export default function LegalInformationPage({ pathname }) {
  const page = legalContent[pathname];
  const intro = {'/ajuda':'Encontre seu caminho para acessar, receber um convite e continuar o acompanhamento.', '/seguranca':'Proteja sua conta e saiba como relatar uma possível falha de forma responsável.', '/privacidade':'Entenda o uso das informações, suas preferências e como exercer seus direitos.', '/termos':'Conheça as condições de acesso e as responsabilidades no uso da plataforma.'}[pathname];
  return <PublicSiteLayout activePath={pathname}><main id="main-content" tabIndex={-1} className="site-container">
    <header className="site-subhero"><span className="site-eyebrow">Nello · Informação e confiança</span><h1>{page.title}</h1><p>{intro}</p><p className="site-small">Versão {LEGAL_VERSION} · Nello Beta</p></header>
    {pathname === '/ajuda' && <nav className="site-support-cards" aria-label="Acesso rápido à ajuda">{[[KeyRound,'Entrar na minha conta','Acesse com seu email e senha.','/login'],[ShieldCheck,'Orientações de segurança','Cuide da sua conta e dos seus acessos.','/seguranca'],[Mail,'Falar com o suporte','Ajuda para usar e acessar o Nello.',`mailto:${SUPPORT_EMAIL}`]].map(([Icon,title,text,href])=><a key={href} href={href}><Icon aria-hidden="true" size={22} /><strong>{title}</strong><span>{text}</span></a>)}</nav>}
    <div className="site-document"><nav className="site-document-nav" aria-label="Nesta página"><span>NESTA PÁGINA</span>{page.sections.map(([title],index)=><a key={title} href={`#document-section-${index}`}>{title}</a>)}</nav><div className="site-document-body">{page.sections.map(([title, paragraphs],sectionIndex) => <section key={title} id={`document-section-${sectionIndex}`}><h2>{title}</h2>{paragraphs.map((text,index)=><p key={index}>{text}</p>)}</section>)}<aside className="site-document-contact"><h2>Conte com o suporte</h2><p>Suporte, privacidade e segurança: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p><a className="site-inline-link" href="/login">Voltar ao acesso</a></aside></div></div>
  </main></PublicSiteLayout>;
}
