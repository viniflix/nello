import React from 'react';
import { SUPPORT_EMAIL } from '../../features/privacy/consent';

export default function LandingPage() {
  return <div className="min-h-dvh bg-background text-foreground">
    <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5">
      <a href="/" aria-label="Nello, início"><img src="/nello-logo.png" alt="Nello" width="120" height="48" className="h-12 w-auto object-contain" /></a>
      <nav aria-label="Navegação pública" className="flex flex-wrap items-center gap-4 text-sm">
        <a className="inline-flex min-h-11 items-center underline" href="/ajuda">Ajuda</a>
        <a className="inline-flex min-h-11 items-center underline" href="/status">Status</a>
        <a className="inline-flex min-h-11 items-center rounded-lg bg-primary px-5 font-medium text-primary-foreground" href="/login">Entrar</a>
      </nav>
    </header>
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-6xl px-5 pb-16">
      <section className="grid items-center gap-8 py-10 md:grid-cols-[1.3fr_1fr] md:py-20" aria-labelledby="landing-title">
        <div className="space-y-6">
          <p className="text-sm font-medium text-primary">Nello · Nutrição clínica · Beta</p>
          <h1 id="landing-title" className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">Mais clareza para cuidar. Mais tempo para acompanhar.</h1>
          <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">Organize pacientes, avaliações, planos alimentares e a rotina do consultório em um só lugar. Acompanhe o cuidado com informação clínica em destaque.</p>
          <div className="flex flex-wrap gap-3">
            <a className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground" href="/register">Criar minha conta</a>
            <a className="inline-flex min-h-11 items-center justify-center rounded-lg border border-input bg-card px-6 py-3 font-medium" href="/login">Já tenho acesso</a>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">Nutricionista ou paciente? No cadastro, escolha seu papel. O acompanhamento do paciente depende do vínculo com o profissional.</p>
        </div>
        <aside className="space-y-5 rounded-3xl border bg-card p-6 sm:p-8" aria-label="O cuidado em cada etapa">
          <h2 className="text-xl font-semibold">Do primeiro encontro ao acompanhamento</h2>
          {[
            ['01', 'Conheça o paciente', 'Prontuário, anamnese e avaliações em uma jornada organizada.'],
            ['02', 'Planeje com precisão', 'Cálculos nutricionais e planos alimentares com substituições.'],
            ['03', 'Mantenha o cuidado próximo', 'Diário alimentar, metas, mensagens e acompanhamento.'],
          ].map(([number, title, description]) => <div key={number} className="flex gap-4 border-t pt-4"><span className="text-sm font-semibold text-primary" aria-hidden="true">{number}</span><div className="space-y-1"><h3 className="font-semibold">{title}</h3><p className="text-sm leading-relaxed text-muted-foreground">{description}</p></div></div>)}
        </aside>
      </section>
      <section className="grid gap-5 md:grid-cols-3" aria-label="Confiança, acesso e suporte">
        {[
          ['Privacidade no cuidado', 'Conheça como os dados são usados e como exercer seus direitos. As preferências de analytics são opcionais.', '/privacidade', 'Conhecer a privacidade'],
          ['Acesso e segurança', 'Contas, vínculos e documentos possuem controles de acesso. Consulte as orientações de segurança e proteção da sua conta.', '/seguranca', 'Ver orientações de segurança'],
          ['Suporte durante a Beta', 'Precisa de ajuda para acessar ou usar o Nello? Consulte as orientações e o canal de suporte.', '/ajuda', 'Encontrar ajuda'],
        ].map(([title, description, href, label]) => <article key={href} className="flex flex-col gap-3 rounded-2xl border bg-card p-6"><h2 className="text-xl font-semibold">{title}</h2><p className="flex-1 text-sm leading-relaxed text-muted-foreground">{description}</p><a href={href} className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline">{label}</a></article>)}
      </section>
    </main>
    <footer className="border-t px-5 py-8 text-sm"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
      <p>Nello · Consultório nutricional</p><nav className="flex flex-wrap gap-5" aria-label="Informações e suporte"><a href="/termos" className="underline">Termos</a><a href="/privacidade" className="underline">Privacidade</a><a href={`mailto:${SUPPORT_EMAIL}`} className="break-all underline">{SUPPORT_EMAIL}</a></nav>
    </div></footer>
  </div>;
}
