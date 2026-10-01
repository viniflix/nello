import { Link } from 'react-router-dom';

export default function LegalSignupChoice({ accepted, analytics, onAccepted, onAnalytics }) {
  return <fieldset className="space-y-3 rounded-lg border p-3 text-sm">
    <legend className="px-1 font-medium">Termos e privacidade</legend>
    <label className="flex items-start gap-2">
      <input type="checkbox" required checked={accepted} onChange={e => onAccepted(e.target.checked)} className="mt-1" />
      <span>Li e aceito os <Link to="/termos" target="_blank" rel="noopener noreferrer" className="underline">Termos de Uso</Link> e li o <Link to="/privacidade" target="_blank" rel="noopener noreferrer" className="underline">Aviso de Privacidade</Link>.</span>
    </label>
    <label className="flex items-start gap-2">
      <input type="checkbox" checked={analytics} onChange={e => onAnalytics(e.target.checked)} className="mt-1" />
      <span>Permito analytics de navegação para melhorar o Nello (opcional). Posso retirar essa permissão a qualquer momento.</span>
    </label>
  </fieldset>;
}
