import { Link } from 'react-router-dom';

export default function PublicHelpLinks() {
  return <nav aria-label="Ajuda e documentos públicos" className="flex flex-wrap justify-center gap-4 py-4 text-xs text-muted-foreground">
    <Link to="/ajuda" className="underline">Precisa de ajuda?</Link>
    <Link to="/termos" className="underline">Termos</Link>
    <Link to="/privacidade" className="underline">Privacidade</Link>
    <Link to="/seguranca" className="underline">Segurança</Link>
  </nav>;
}
