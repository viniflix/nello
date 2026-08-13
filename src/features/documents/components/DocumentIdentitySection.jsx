import { useCallback, useEffect, useState } from 'react';
import { FileImage, Loader2, PenLine, RefreshCw, ShieldAlert, ShieldCheck, Stamp, Upload } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import {
  getMyDocumentAssetPreview,
  getMyDocumentIdentity,
  saveMyDocumentIdentity,
  uploadDocumentAsset,
} from '../api/document-queries';
import DocumentIdentityPreview from './DocumentIdentityPreview';

const EMPTY = {
  version: 0,
  professional_name: '', clinic_name: '', professional_email: '', professional_phone: '',
  address_line: '', address_city: '', address_state: '', address_postal_code: '',
  primary_color: '#4F8A3C', accent_color: '#7DAF69', header_text: '', footer_text: '',
  assets: { has_logo: false, has_visual_signature: false, has_stamp: false },
};

const FIELDS = [
  'professional_name', 'clinic_name', 'professional_email', 'professional_phone',
  'address_line', 'address_city', 'address_state', 'address_postal_code',
  'primary_color', 'accent_color', 'header_text', 'footer_text',
];

const ASSETS = [
  { type: 'logo', label: 'Logo documental', Icon: FileImage, max: '5 MB' },
  { type: 'visual_signature', label: 'Assinatura visual', Icon: PenLine, max: '2 MB' },
  { type: 'stamp', label: 'Carimbo visual', Icon: Stamp, max: '2 MB' },
];

const messageFor = (error) => {
  const message = error?.message || '';
  if (message.includes('document_identity_requires_verified_nutritionist')) return 'A personalização documental será liberada após a aprovação do seu CRN.';
  if (message.includes('document_identity_revision_conflict')) return 'A identidade foi alterada em outra sessão. Recarregue os dados antes de salvar.';
  if (message.includes('unsupported_document_asset_mime')) return 'Use uma imagem PNG, JPEG ou WebP.';
  if (message.includes('invalid_document_asset_size')) return 'A imagem ultrapassa o limite permitido.';
  return 'Não foi possível concluir a operação. Tente novamente sem perder os dados preenchidos.';
};

export default function DocumentIdentitySection({ verification }) {
  const { toast } = useToast();
  const [identity, setIdentity] = useState(EMPTY);
  const [form, setForm] = useState(EMPTY);
  const [assetUrls, setAssetUrls] = useState({});
  const [state, setState] = useState('loading');
  const [uploading, setUploading] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    setState('loading');
    setLoadError(null);
    const result = await getMyDocumentIdentity();
    if (result.error) {
      setLoadError(messageFor(result.error));
      setState('error');
      return;
    }
    const next = { ...EMPTY, ...result.data, assets: { ...EMPTY.assets, ...result.data?.assets } };
    setIdentity(next);
    setForm(next);
    const availableAssets = ASSETS.filter(({ type }) => next.assets[`has_${type}`]);
    const previews = await Promise.all(availableAssets.map(async ({ type }) => {
      const preview = await getMyDocumentAssetPreview(type);
      return [type, preview.data?.signed_url || null];
    }));
    setAssetUrls(Object.fromEntries(previews.filter(([, url]) => url)));
    setState('ready');
  }, []);

  useEffect(() => { void load(); }, [load]);

  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  const save = async (event) => {
    event.preventDefault();
    setState('saving');
    const payload = Object.fromEntries(FIELDS.map((field) => [field, form[field] || null]));
    const result = await saveMyDocumentIdentity(payload, identity.version, 'profile_update');
    if (result.error) {
      setState('ready');
      toast({ title: 'Identidade não salva', description: messageFor(result.error), variant: 'destructive' });
      return;
    }
    const next = { ...EMPTY, ...result.data, assets: { ...EMPTY.assets, ...result.data?.assets } };
    setIdentity(next);
    setForm(next);
    setState('ready');
    toast({ title: 'Identidade documental atualizada', description: `Versão ${next.version} preservada no histórico.` });
  };

  const upload = async (assetType, file) => {
    if (!file) return;
    setUploading(assetType);
    const result = await uploadDocumentAsset(assetType, file, identity.version);
    if (result.error || result.data?.success === false) {
      toast({ title: 'Imagem não enviada', description: messageFor(result.error || result.data), variant: 'destructive' });
      setUploading(null);
      return;
    }
    await load();
    setUploading(null);
    toast({ title: 'Ativo documental atualizado', description: 'A versão anterior foi preservada para auditoria.' });
  };

  if (state === 'loading') return <Card><CardContent className="flex min-h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" aria-label="Carregando identidade documental" /></CardContent></Card>;
  if (state === 'error') return <Card><CardContent className="space-y-4 py-8 text-center"><ShieldAlert className="mx-auto h-8 w-8 text-amber-600" /><p>{loadError}</p><Button variant="outline" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Tentar novamente</Button></CardContent></Card>;

  const canSign = identity.can_sign === true;
  const pending = verification?.professional_role === 'student' || identity.verification_status !== 'approved';

  return (
    <div className="space-y-6">
      <Alert>
        {canSign ? <ShieldCheck className="h-4 w-4 text-emerald-600" /> : <ShieldAlert className="h-4 w-4 text-amber-600" />}
        <AlertTitle>{canSign ? 'Identidade habilitada para documentos' : 'Identidade documental com pendência'}</AlertTitle>
        <AlertDescription>
          {pending
            ? 'Estudantes podem preparar documentos sob supervisão, mas somente o nutricionista responsável assina. Contas pendentes não emitem documentos profissionais.'
            : 'O nome e o CRN exibidos nos documentos vêm da verificação aprovada e não podem ser substituídos pelo navegador.'}
        </AlertDescription>
      </Alert>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.85fr)]">
        <form onSubmit={save} className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="uppercase">Identidade documental</CardTitle><CardDescription>Dados exclusivos dos documentos. Sua foto pessoal continua separada.</CardDescription></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="document-professional-name">Nome profissional *</Label><Input id="document-professional-name" required maxLength={160} value={form.professional_name} onChange={update('professional_name')} /></div>
              <div className="space-y-2"><Label htmlFor="document-clinic-name">Consultório ou clínica</Label><Input id="document-clinic-name" maxLength={160} value={form.clinic_name} onChange={update('clinic_name')} placeholder="Consultório de Nutrição" /></div>
              <div className="space-y-2"><Label htmlFor="document-email">E-mail profissional</Label><Input id="document-email" type="email" maxLength={254} value={form.professional_email} onChange={update('professional_email')} /></div>
              <div className="space-y-2"><Label htmlFor="document-phone">Telefone profissional</Label><Input id="document-phone" maxLength={40} value={form.professional_phone} onChange={update('professional_phone')} /></div>
              <div className="space-y-2 md:col-span-2"><Label htmlFor="document-address">Endereço profissional</Label><Input id="document-address" maxLength={240} value={form.address_line} onChange={update('address_line')} /></div>
              <div className="space-y-2"><Label htmlFor="document-city">Cidade</Label><Input id="document-city" maxLength={120} value={form.address_city} onChange={update('address_city')} /></div>
              <div className="grid grid-cols-[1fr_1.2fr] gap-3"><div className="space-y-2"><Label htmlFor="document-state">UF</Label><Input id="document-state" maxLength={40} value={form.address_state} onChange={update('address_state')} /></div><div className="space-y-2"><Label htmlFor="document-postal-code">CEP</Label><Input id="document-postal-code" maxLength={20} value={form.address_postal_code} onChange={update('address_postal_code')} /></div></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="uppercase">Apresentação visual</CardTitle><CardDescription>Cores e textos permitidos, mantendo a identificação Nello obrigatória.</CardDescription></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="document-primary-color">Cor principal</Label><div className="flex gap-2"><Input aria-label="Seletor da cor principal" type="color" className="h-10 w-14 p-1" value={form.primary_color} onChange={update('primary_color')} /><Input id="document-primary-color" pattern="^#[0-9A-Fa-f]{6}$" value={form.primary_color} onChange={update('primary_color')} /></div></div>
              <div className="space-y-2"><Label htmlFor="document-accent-color">Cor de apoio</Label><div className="flex gap-2"><Input aria-label="Seletor da cor de apoio" type="color" className="h-10 w-14 p-1" value={form.accent_color} onChange={update('accent_color')} /><Input id="document-accent-color" pattern="^#[0-9A-Fa-f]{6}$" value={form.accent_color} onChange={update('accent_color')} /></div></div>
              <div className="space-y-2 md:col-span-2"><Label htmlFor="document-header">Texto do cabeçalho</Label><Textarea id="document-header" maxLength={300} value={form.header_text} onChange={update('header_text')} placeholder="Cuidado nutricional personalizado" /></div>
              <div className="space-y-2 md:col-span-2"><Label htmlFor="document-footer">Texto do rodapé</Label><Textarea id="document-footer" maxLength={300} value={form.footer_text} onChange={update('footer_text')} placeholder="Documento emitido eletronicamente." /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="uppercase">Imagens documentais</CardTitle><CardDescription>PNG, JPEG ou WebP. A assinatura visual não substitui a assinatura eletrônica nem representa certificado digital.</CardDescription></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              {ASSETS.map(({ type, label, Icon, max }) => (
                <label key={type} className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-4 text-center transition-colors hover:bg-muted/50">
                  <Icon className="h-6 w-6 text-primary" /><span className="text-sm font-medium">{label}</span><span className="text-xs text-muted-foreground">Máx. {max}</span>
                  <span className="text-xs font-medium text-primary">{uploading === type ? 'Enviando...' : identity.assets[`has_${type}`] ? 'Substituir imagem' : 'Selecionar imagem'}</span>
                  <input aria-label={`Enviar ${label}`} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" disabled={Boolean(uploading) || !canSign} onChange={(event) => void upload(type, event.target.files?.[0])} />
                </label>
              ))}
            </CardContent>
          </Card>

          <Button type="submit" disabled={state === 'saving' || !canSign} className="w-full sm:w-auto">
            {state === 'saving' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Salvar identidade documental
          </Button>
        </form>

        <div className="xl:sticky xl:top-6"><DocumentIdentityPreview identity={form} assetUrls={assetUrls} /></div>
      </div>
    </div>
  );
}
