import { legalContent } from '@/features/privacy/legalContent';
import { Link } from 'react-router-dom';
import { LEGAL_VERSION, SUPPORT_EMAIL } from '@/features/privacy/consent';
import PublicHelpLinks from '@/features/privacy/components/PublicHelpLinks';

export default function LegalInformationPage({ pathname }) {
  const page = legalContent[pathname];
  return <main className="mx-auto max-w-3xl space-y-6 p-6 pb-24 text-foreground">
    <Link to="/login" className="text-primary underline">Voltar ao acesso</Link>
    <h1 className="text-3xl font-semibold">{page.title}</h1>
    <p className="text-sm text-muted-foreground">Versão {LEGAL_VERSION} · Nello Beta</p>
    {page.sections.map(([title, paragraphs]) => <section key={title} className="space-y-2"><h2 className="text-xl font-medium">{title}</h2>{paragraphs.map((text, index) => <p key={index} className="leading-relaxed">{text}</p>)}</section>)}
    <p>Suporte, privacidade e segurança: <a className="text-primary underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
    <PublicHelpLinks />
  </main>;
}
