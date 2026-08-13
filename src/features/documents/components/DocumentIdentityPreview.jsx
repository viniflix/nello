import { FileText } from 'lucide-react';

const line = (value, fallback) => value?.trim() || fallback;

export default function DocumentIdentityPreview({ identity, assetUrls = {} }) {
  const primary = identity.primary_color || '#4F8A3C';
  const accent = identity.accent_color || '#7DAF69';
  const address = [identity.address_line, identity.address_city, identity.address_state]
    .filter(Boolean)
    .join(' • ');

  return (
    <section aria-labelledby="document-preview-title" className="space-y-3">
      <div>
        <h3 id="document-preview-title" className="text-sm font-semibold uppercase tracking-wide">
          Preview do documento
        </h3>
        <p className="text-sm text-muted-foreground">Simulação visual; ainda não é um documento assinado.</p>
      </div>
      <div className="mx-auto aspect-[210/297] w-full max-w-[560px] overflow-hidden rounded-md border bg-white text-slate-900 shadow-sm">
        <div className="h-2" style={{ backgroundColor: primary }} />
        <div className="flex h-[calc(100%-0.5rem)] flex-col p-[6%]">
          <header className="flex items-start justify-between gap-4 border-b pb-4" style={{ borderColor: `${accent}66` }}>
            <div className="min-w-0">
              {assetUrls.logo ? (
                <img src={assetUrls.logo} alt="Logo documental do consultório" className="mb-3 max-h-12 max-w-36 object-contain object-left" />
              ) : (
                <div className="mb-3 flex h-10 w-24 items-center justify-center rounded border border-dashed text-[10px] uppercase text-slate-400">
                  Sua logo
                </div>
              )}
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: primary }}>
                {line(identity.header_text, 'Cuidado nutricional personalizado')}
              </p>
              <h4 className="mt-1 text-base font-bold uppercase">{line(identity.clinic_name, 'Consultório de Nutrição')}</h4>
            </div>
            <div className="text-right text-[9px] leading-4 text-slate-500">
              <p className="font-semibold text-slate-800">{line(identity.professional_name, 'Nome do profissional')}</p>
              <p>{identity.crn_region && identity.crn_number ? `${identity.crn_region} ${identity.crn_number}` : 'CRN validado na plataforma'}</p>
              <p>{line(identity.professional_phone, 'Telefone profissional')}</p>
              <p>{line(identity.professional_email, 'E-mail profissional')}</p>
            </div>
          </header>

          <main className="flex-1 py-6">
            <div className="mb-5 flex items-center gap-2">
              <span className="rounded p-2" style={{ backgroundColor: `${accent}22`, color: primary }}><FileText className="h-4 w-4" /></span>
              <div><p className="text-[9px] uppercase text-slate-400">Documento clínico</p><h5 className="text-sm font-bold uppercase">Evolução clínica</h5></div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-[9px]">
              <div className="rounded border p-3"><p className="uppercase text-slate-400">Paciente</p><p className="mt-1 font-semibold">Nome do paciente</p></div>
              <div className="rounded border p-3"><p className="uppercase text-slate-400">Atendimento</p><p className="mt-1 font-semibold">00/00/0000 às 00:00</p></div>
            </div>
            <div className="mt-4 space-y-3">
              {[92, 78, 86, 64].map((width) => <div key={width} className="h-1.5 rounded bg-slate-100" style={{ width: `${width}%` }} />)}
            </div>
          </main>

          <footer className="border-t pt-4" style={{ borderColor: `${accent}66` }}>
            <div className="flex min-h-16 items-end justify-between gap-4">
              <div className="text-[8px] leading-4 text-slate-500"><p>{line(address, 'Endereço profissional')}</p><p>{line(identity.footer_text, 'Documento emitido eletronicamente.')}</p></div>
              <div className="flex items-end gap-3">
                {assetUrls.stamp ? <img src={assetUrls.stamp} alt="Carimbo visual" className="max-h-12 max-w-20 object-contain" /> : null}
                <div className="min-w-28 text-center">
                  {assetUrls.visual_signature ? <img src={assetUrls.visual_signature} alt="Assinatura visual" className="mx-auto max-h-10 max-w-28 object-contain" /> : <div className="h-7" />}
                  <div className="border-t pt-1 text-[8px]">Assinatura visual</div>
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-[7px] uppercase tracking-wide text-slate-400"><span>Autenticidade verificável por código</span><span className="font-semibold" style={{ color: primary }}>Gerado com Nello</span></div>
          </footer>
        </div>
      </div>
    </section>
  );
}
