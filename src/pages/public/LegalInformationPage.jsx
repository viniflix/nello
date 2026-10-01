import { Link } from 'react-router-dom';
import { LEGAL_VERSION, SUPPORT_EMAIL } from '@/features/privacy/consent';
import PublicHelpLinks from '@/features/privacy/components/PublicHelpLinks';

const content = {
  '/termos': { title: 'Termos de Uso do Nello', sections: [
    ['Sobre o serviço', 'O Nello, mantido por Vinicius Costa, é uma plataforma Beta de apoio ao acompanhamento nutricional. Funcionalidades podem mudar e falhas devem ser comunicadas ao suporte. A plataforma não substitui avaliação, diagnóstico ou decisão de um profissional habilitado. Não é um serviço de emergência.'],
    ['Contas e acompanhamento', 'Use informações corretas, proteja seu acesso e não compartilhe sua senha. Pacientes entram por convite do profissional. A aprovação de documentos profissionais é uma verificação de cadastro; não garante qualidade clínica. Contas profissionais pendentes têm recursos clínicos limitados até a aprovação.'],
    ['Responsabilidade profissional', 'O profissional deve ter habilitação válida para sua atividade, justificar a coleta de informações clínicas e fornecer ao paciente as informações necessárias sobre o acompanhamento. Não use dados de terceiros sem autorização e fundamento aplicável.'],
    ['Acesso e senha', 'Pacientes convidados podem receber uma senha inicial baseada na data de nascimento. Essa senha é previsível: recomendamos fortemente substituí-la por uma senha pessoal. A troca é opcional no modelo atual. O convite por email também permite definir uma senha. Nunca envie sua senha ao suporte.'],
    ['Uso e encerramento', 'Não tente acessar contas ou dados de outras pessoas. Para corrigir dados, solicitar encerramento de conta ou comunicar falhas, contate o suporte. A exclusão de registros clínicos depende da análise das obrigações de guarda do profissional e dos direitos do titular.'],
  ]},
  '/privacidade': { title: 'Aviso de Privacidade', sections: [
    ['Responsável e finalidades', 'Vinicius Costa mantém o Nello e atende solicitações sobre contas e operação. O profissional responsável pelo acompanhamento define a finalidade e a necessidade dos registros clínicos. O Nello oferece a infraestrutura para esse acompanhamento; os papéis e obrigações dependem do tratamento realizado.'],
    ['Dados necessários', 'Usamos dados de conta para autenticação e prestação do serviço. Informações de saúde são registradas no contexto do vínculo de acompanhamento, conforme a finalidade e o fundamento aplicável informados pelo profissional. O cadastro público pede dados mínimos de identificação e acesso, sem altura, peso ou histórico clínico.'],
    ['Diagnóstico técnico', 'Usamos Sentry para falhas e disponibilidade, com metadados técnicos minimizados. Não enviamos senhas, tokens, prontuários ou conteúdo clínico à telemetria. O diagnóstico necessário à segurança e à execução do serviço é separado de analytics opcional. IDs pseudônimos ainda podem ser dados pessoais.'],
    ['Analytics opcional', 'Com sua permissão, PostHog recebe eventos de navegação, identificadores pseudônimos de conta/sessão, navegador, tela, versão e resultado técnico de ações. Sem permissão, essa captura permanece desligada. Replay, captura automática de campos e gravação de console estão desabilitados. Você pode mudar a escolha no botão “Preferências de privacidade”. A recusa não impede o uso do serviço.'],
    ['Fornecedores e transferências', 'Supabase fornece banco/autenticação/arquivos; Vercel fornece hospedagem; Resend entrega e recebe emails; Sentry e PostHog recebem somente os dados técnicos descritos. Cloudflare Turnstile verifica automação nos formulários de acesso e recebe dados técnicos do navegador para essa proteção. Esses fornecedores podem processar dados no exterior conforme suas condições e contratos aplicáveis. Não enviamos conteúdo clínico a analytics.'],
    ['Guarda e direitos', 'O prazo dos registros clínicos depende da finalidade e das obrigações legais aplicáveis ao profissional. O pedido de exclusão é analisado individualmente; backups e cópias de fornecedores podem ter ciclos próprios de expiração. Para acesso, correção, informação, oposição quando aplicável, revogação de analytics ou exclusão, contate o suporte. Não prometemos eliminação instantânea de todas as cópias.'],
    ['Contato seguro', 'No primeiro contato, descreva a solicitação sem anexar prontuários, documentos pessoais, senhas ou tokens. A verificação de identidade e o tratamento da solicitação ocorrerão por um procedimento apropriado ao caso.'],
  ]},
  '/ajuda': { title: 'Ajuda para acessar o Nello', sections: [
    ['Entrar ou recuperar acesso', 'Use o email cadastrado. Se esqueceu a senha, escolha “Esqueci minha senha” no login. Verifique spam e caixa de entrada. Não repita envios enquanto o contador de espera estiver ativo. Links de confirmação e recuperação expiram e não devem ser compartilhados.'],
    ['Acesso de pacientes', 'Se recebeu convite por email, abra o link para confirmar o acesso e definir sua senha. A confirmação de email é necessária para entrar. Se seu profissional informou uma senha inicial por nascimento, use o formato DDMMAA (dia, mês e dois últimos dígitos do ano). Recomendamos uma senha pessoal. Para cadastro por código, peça um convite válido ao profissional.'],
    ['Verificação profissional', 'O cadastro profissional começa pendente. Consulte a tela de verificação para enviar os documentos solicitados e acompanhar o resultado. Recursos clínicos protegidos exigem aprovação; cadastro e confirmação de email não equivalem a habilitação profissional aprovada.'],
    ['Pedir suporte', 'Informe qual etapa falhou, o horário aproximado e o navegador utilizado. Não envie senhas, códigos de acesso, prontuários nem capturas com informações de pacientes.'],
  ]},
  '/seguranca': { title: 'Relatar uma falha de segurança', sections: [
    ['Como relatar', 'Escreva ao suporte com o caminho afetado e os passos mínimos para reproduzir usando sua própria conta e dados fictícios. Não explore contas de outras pessoas e não inclua tokens, senhas ou conteúdo clínico no relato.'],
    ['Proteja seu acesso', 'Use uma senha pessoal, evite reutilizá-la e saia da conta em dispositivos compartilhados. A data de nascimento é uma senha inicial previsível; recomendamos substituí-la. Links de convite e recuperação são privados.'],
  ]},
};

export default function LegalInformationPage({ pathname }) {
  const page = content[pathname];
  return <main className="mx-auto max-w-3xl space-y-6 p-6 pb-24 text-foreground">
    <Link to="/login" className="text-primary underline">Voltar ao acesso</Link>
    <h1 className="text-3xl font-semibold">{page.title}</h1>
    <p className="text-sm text-muted-foreground">Versão {LEGAL_VERSION} · Nello Beta</p>
    {page.sections.map(([title, text]) => <section key={title} className="space-y-2"><h2 className="text-xl font-medium">{title}</h2><p className="leading-relaxed">{text}</p></section>)}
    <p>Suporte, privacidade e segurança: <a className="text-primary underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
    <PublicHelpLinks />
  </main>;
}
