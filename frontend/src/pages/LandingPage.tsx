import { Link } from 'react-router-dom'
import { ArrowRight, BarChart3, BookOpen, Braces, Check, Copy, KeyRound, LockKeyhole, Mail, Menu, ShieldCheck, Star, Webhook, X, Zap } from 'lucide-react'
import { useState } from 'react'
import './LandingPage.css'

const features = [
  [Zap, 'Envio por API', 'Dispare e-mails via API com alta performance e confiabilidade.'],
  [ShieldCheck, 'Autenticação de domínio', 'Configure SPF, DKIM e DMARC de forma simples e segura.'],
  [KeyRound, 'Templates reutilizáveis', 'Crie, edite e organize modelos para diferentes cenários.'],
  [BarChart3, 'Analytics em tempo real', 'Acompanhe entregas, aberturas, cliques e falhas.'],
] as const
const steps = [['Gere sua API key', 'Crie sua conta e habilite as permissões necessárias.'], ['Autentique seu domínio', 'Publique os registros SPF, DKIM e DMARC.'], ['Configure seus templates', 'Crie e personalize seus modelos de e-mail.'], ['Envie e acompanhe', 'Dispare os e-mails e monitore os resultados em tempo real.']]
const codeSamples = {
  cURL: `curl -X POST https://api.velomail.com/emails/send \\
  -H "Authorization: Bearer sua_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "from": "cliente@exemplo.com",
    "subject": "Seu código de acesso",
    "template_id": "tmpl_123",
    "variables": { "nome": "João", "codigo": "996472" }
  }'`,
  JavaScript: `import { VeloMail } from '@velomail/sdk'

const velomail = new VeloMail({
  apiKey: process.env.VELOMAIL_API_KEY,
})

await velomail.emails.send({
  from: 'cliente@exemplo.com',
  to: 'usuario@exemplo.com',
  subject: 'Seu código de acesso',
  templateId: 'tmpl_123',
  variables: { nome: 'João', codigo: '996472' },
})`,
  Python: `from velomail import VeloMail

velomail = VeloMail(
    api_key=os.environ['VELOMAIL_API_KEY']
)

velomail.emails.send(
    from_='cliente@exemplo.com',
    to='usuario@exemplo.com',
    subject='Seu código de acesso',
    template_id='tmpl_123',
    variables={'nome': 'João', 'codigo': '996472'},
)`,
  PHP: `<?php
$velomail = new VeloMail\Client([
  'api_key' => getenv('VELOMAIL_API_KEY'),
]);

$velomail->emails->send([
  'from' => 'cliente@exemplo.com',
  'to' => 'usuario@exemplo.com',
  'subject' => 'Seu código de acesso',
  'template_id' => 'tmpl_123',
  'variables' => ['nome' => 'João', 'codigo' => '996472'],
]);`,
} as const

export function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [codeLanguage, setCodeLanguage] = useState<keyof typeof codeSamples>('cURL')
  const [copied, setCopied] = useState(false)
  const copyCode = async () => {
    const snippet = codeSamples[codeLanguage]
    try {
      await navigator.clipboard.writeText(snippet)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = snippet
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      textarea.remove()
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }
  return <main className="velo-page">
    <section className="velo-hero" id="inicio">
      <header className="velo-nav">
        <Link to="/" className="velo-logo" aria-label="VeloMail - início"><img src="/landing/logo-white.png" alt="VeloMail" /></Link>
        <nav className={`velo-links ${menuOpen ? 'is-open' : ''}`} aria-label="Navegação principal">
          <a onClick={() => setMenuOpen(false)} href="#produto">Produto</a><a onClick={() => setMenuOpen(false)} href="#recursos">Recursos</a><a onClick={() => setMenuOpen(false)} href="#precos">Preços</a><Link onClick={() => setMenuOpen(false)} to="/developers">Documentação</Link><a onClick={() => setMenuOpen(false)} href="#integracoes">Integrações</a><a onClick={() => setMenuOpen(false)} href="#blog">Blog</a>
        </nav>
        <div className="velo-nav-actions"><Link className="velo-login" to="/login">Entrar</Link><Link className="velo-button velo-button-small" to="/login">Criar conta gratuita <ArrowRight /></Link></div>
        <button className="velo-menu" type="button" aria-label="Abrir menu" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>
      </header>
      <div className="velo-hero-copy"><p className="velo-eyebrow"><span /> Infraestrutura de e-mail para quem constrói o futuro</p><h1>E-mails transacionais<br />que chegam <em>mais longe</em></h1><p className="velo-hero-description">Velocidade, confiabilidade e controle para suas aplicações.<br className="desktop-only" /> Integre em minutos e escale sem preocupação.</p><div className="velo-hero-buttons"><Link className="velo-button" to="/login">Começar agora <ArrowRight /></Link><Link className="velo-button velo-button-ghost" to="/developers">Ver documentação <BookOpen /></Link></div><ul className="velo-checks"><li><Check /> Setup em minutos</li><li><Check /> Sem taxa de adesão</li><li><Check /> Suporte especializado</li></ul></div>
      <div className="velo-dashboard" aria-label="Prévia do painel VeloMail"><aside><img src="/landing/logo-white.png" alt="" /><span className="active"><BarChart3 /> Visão geral</span><span><Mail /> E-mails</span><span><Braces /> Templates</span><span><ShieldCheck /> Domínios</span><span><Webhook /> Webhooks</span></aside><div className="velo-dashboard-content"><div className="dashboard-heading"><div><b>Visão geral</b><small>Olá, equipe VeloMail</small></div><span className="status-dot">Sistema operacional</span></div><div className="metric-row"><div><small>Enviados</small><b>12.542</b><i>+12%</i></div><div><small>Entregues</small><b>12.410</b><i>99,7%</i></div><div><small>Aberturas</small><b>8.456</b><i>67,4%</i></div><div><small>Cliques</small><b>2.103</b><i className="red">16,9%</i></div></div><div className="mini-chart"><div className="chart-tip">1.842 e-mails<br />em 12:00</div><svg viewBox="0 0 500 150" aria-label="Gráfico crescente de envios"><path d="M0 126 L45 105 L90 112 L135 88 L175 100 L225 42 L260 74 L310 78 L360 65 L410 38 L500 15" fill="none" stroke="#1976ff" strokeWidth="4" /></svg></div><p className="activity-title">Atividade em tempo real</p><div className="activity"><span><i /> email.delivered</span><span>cliente@exemplo.com</span><small>há 2s</small><span><i /> email.opened</span><span>usuario@saas.com</span><small>há 12s</small><span><i /> email.clicked</span><span>contato@empresa.com</span><small>há 20s</small></div></div></div>
      <img className="velo-hero-mascot" src="/landing/mascot-hero.png" alt="Mascote robô da VeloMail segurando um envelope" />
    </section>
    <section id="produto" className="velo-section velo-features"><p className="velo-section-kicker">◉ &nbsp; POR QUE VELOMAIL?</p><h2>Tudo o que seu SaaS precisa para<br />e-mail transacional, em um só lugar</h2><p className="velo-section-lead">Da API ao analytics, você tem total controle sobre sua operação de e-mails.</p><div className="velo-feature-grid" id="recursos">{features.map(([Icon, title, text]) => <article className="velo-feature" key={title}><span className="feature-icon"><Icon /></span><h3>{title}</h3><p>{text}</p><a href="#integracoes">Saiba mais <ArrowRight /></a></article>)}</div></section>
    <section id="integracoes" className="velo-code-section"><div className="velo-code-layout"><div className="velo-code-copy"><p className="velo-section-kicker">◉ &nbsp; DEVELOPER FIRST</p><h2>Integre em minutos<br />com uma API simples<br />e poderosa</h2><p>Envie e-mails transacionais com poucas linhas de código. Nossa API é segura e fácil de implementar.</p><Link className="velo-button velo-button-ghost" to="/developers">Ver documentação <BookOpen /></Link></div><div className="velo-code-card"><div className="code-tabs" role="tablist" aria-label="Linguagem do exemplo">{(Object.keys(codeSamples) as Array<keyof typeof codeSamples>).map((language) => <button key={language} type="button" role="tab" aria-selected={codeLanguage === language} className={codeLanguage === language ? 'is-active' : ''} onClick={() => { setCodeLanguage(language); setCopied(false) }}>{language}</button>)}</div><button type="button" className={`code-copy ${copied ? 'is-copied' : ''}`} onClick={copyCode} aria-label="Copiar código" title={copied ? 'Código copiado' : 'Copiar código'}>{copied ? <Check /> : <Copy />}<span>{copied ? 'Copiado!' : 'Copiar'}</span></button><pre aria-live="polite"><code>{codeSamples[codeLanguage]}</code></pre><div className="code-card-footer"><span><Zap /> Resposta em milissegundos</span><span><LockKeyhole /> Conexão segura (HTTPS)</span><span><Braces /> SDKs e exemplos</span></div></div></div></section>
    <section className="velo-section velo-how"><p className="velo-section-kicker">◉ &nbsp; COMO FUNCIONA</p><h2>Do código ao e-mail enviado<br />em 4 passos</h2><p className="velo-section-lead">Uma experiência simples, rápida e segura.</p><img className="velo-email-flow" src="/landing/email-flow.png" alt="Fluxo de API para e-mail enviado" /><div className="velo-step-grid">{steps.map(([title, text], index) => <article key={title}><span>{index + 1}</span><h3>{title}</h3><p>{text}</p></article>)}</div><div className="velo-demo-grid"><div className="velo-events-card"><div className="demo-heading"><span className="feature-icon"><Webhook /></span><div><h3>Eventos de webhook</h3><p>Receba eventos de entrega e engajamento em tempo real para automatizar seu backend.</p></div></div>{[['email.sent','Mensagem enviada e registrada.','há 2s'],['email.delivered','Aceito pelo servidor do destinatário.','há 8s'],['email.opened','E-mail aberto pelo destinatário.','há 24s'],['email.clicked','Link clicado no e-mail.','há 1min'],['email.failed','Falha na entrega. Verifique o motivo.','há 3min']].map(([event, text, time], i) => <div className="event" key={event}><i className={i === 4 ? 'error' : ''} /><div><b>{event}</b><small>{text}</small></div><time>{time}</time></div>)}</div><div className="velo-template-card"><div className="demo-heading"><span className="feature-icon"><Mail /></span><div><h3>Templates profissionais</h3><p>Crie, edite e reutilize templates para diferentes cenários transacionais.</p></div></div><div className="template-inner"><aside><b>Meus templates</b><span className="selected">Confirmação de cadastro</span><span>Recuperação de senha</span><span>Notificação de pagamento</span><span>Convite para equipe</span><button>+ Novo template</button></aside><div className="mail-preview"><img src="/landing/logo-color.png" alt="VeloMail" /><h4>Olá, {'{nome}'}!</h4><p>Seu cadastro foi confirmado<br />com sucesso!</p><b>Acessar conta</b><small>Se você não realizou este cadastro,<br />ignore este e-mail.</small></div></div></div></div></section>
    <section className="velo-proof"><p className="velo-section-kicker">◉ &nbsp; CONFIANÇA</p><h2>Mais que envio. Resultados reais.</h2><p className="velo-section-lead">Empresas que confiam na VeloMail para entregar sua comunicação.</p><div className="proof-stats"><div><Mail /><b>+99%</b><span>Taxa de entrega</span></div><div><BarChart3 /><b>50M+</b><span>E-mails enviados</span></div><div><Webhook /><b>2.500+</b><span>Aplicações em produção</span></div><div><Star /><b>99,9%</b><span>Uptime da plataforma</span></div></div><div className="logo-cloud"><b>stripe</b><b>▲ vercel</b><b>↯ supabase</b><b>◒ docker</b><b>aws</b><b>☁ Google Cloud</b></div></section>
    <section id="precos" className="velo-cta"><img src="/landing/mascot-footer.png" alt="Mascote robô VeloMail" /><div><p className="velo-section-kicker">COMECE AGORA</p><h2>Pronto para enviar seus<br />e-mails com mais performance?</h2><p>Crie sua conta gratuita e comece a usar a VeloMail em minutos.</p><div className="velo-hero-buttons"><Link className="velo-button" to="/login">Criar conta gratuita <ArrowRight /></Link><Link className="velo-button velo-button-ghost" to="/developers">Ver documentação <BookOpen /></Link></div></div><ul><li><Check /> Sem cartão de crédito</li><li><Check /> Setup em minutos</li><li><Check /> Suporte especializado</li><li><Check /> Escala conforme seu crescimento</li></ul></section>
    <footer className="velo-footer" id="blog"><div className="velo-footer-top"><div className="footer-brand"><img src="/landing/logo-white.png" alt="VeloMail" /><p>Infraestrutura de e-mail transacional para aplicações que vão mais longe.</p></div><div><b>Produto</b><a href="#recursos">Recursos</a><a href="#precos">Preços</a><a href="#integracoes">Integrações</a><a href="#">Changelog</a></div><div><b>Desenvolvedores</b><Link to="/developers">Documentação</Link><a href="#">API</a><a href="#">SDKs</a><a href="#">Status</a></div><div><b>Empresa</b><a href="#">Sobre</a><a href="#blog">Blog</a><a href="#">Suporte</a><a href="#">Contato</a></div><div><b>Siga-nos</b><div className="socials"><a href="#">in</a><a href="#">𝕏</a><a href="#">▶</a><a href="#">◉</a></div></div></div><div className="velo-footer-bottom"><span>© 2026 VeloMail. Todos os direitos reservados.</span><div><a href="#">Termos de uso</a><a href="#">Política de privacidade</a><a href="#">Status</a></div></div></footer>
  </main>
}
