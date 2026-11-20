import { useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Copy, ExternalLink, LockKeyhole, MessageCircle, ShieldCheck } from 'lucide-react'
import { supabase, type Quote } from './lib/supabase'

const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0)

export default function ShareQuotePage({ quote, onBack, onEditContact }: { quote: Quote; onBack: () => void; onEditContact: () => void }) {
  const [busy, setBusy] = useState(false)
  const [share, setShare] = useState<{ token: string; code: string; phone: string; expiresAt: string } | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')
  const shareUrl = share ? `${window.location.origin}/p/${share.token}` : ''
  const digits = (quote.contacts?.phone ?? '').replace(/\D/g, '')

  async function prepareShare() {
    if (!supabase) return
    setBusy(true); setError('')
    const { data, error: invokeError } = await supabase.functions.invoke('issue-quote-share', { body: { quoteId: quote.id } })
    if (invokeError || data?.error) {
      setError(await readFunctionError(invokeError, data?.error)); setBusy(false); return
    }
    setShare({ token: data.token, code: data.code, phone: data.phone, expiresAt: data.expiresAt })
    setBusy(false)
  }

  const message = share ? [
    `Olá, ${quote.contacts?.name || 'tudo bem'}!`,
    `O orçamento ${quote.number} — ${quote.title} está pronto para você analisar:`,
    shareUrl,
    `Código de segurança para assinar: ${share.code}`,
    'O link e o código valem por 7 dias. O código é de uso único.',
    'Se você não solicitou este orçamento, pode desconsiderar esta mensagem.',
  ].join('\n\n') : ''
  const whatsappUrl = share ? `https://wa.me/${share.phone}?text=${encodeURIComponent(message)}` : ''

  async function copy(value: string, field: string) {
    try { await navigator.clipboard.writeText(value); setCopied(field); window.setTimeout(() => setCopied(''), 1800) }
    catch { setError('Não foi possível copiar. Selecione e copie o texto manualmente.') }
  }

  return <div className="page-content share-page"><button className="wizard-back" onClick={onBack}><ArrowLeft size={16} /> Voltar aos orçamentos</button>
    <div className="share-heading"><div className="share-success-mark"><Check size={22} /></div><span className="eyebrow">ORÇAMENTO PRONTO PARA COMPARTILHAR</span><h1>Agora, o cliente decide.</h1><p>Envie o link privado e o código de assinatura diretamente no WhatsApp.</p></div>
    <div className="share-layout"><section className="share-left"><div className="share-quote-preview"><div className="share-doc-icon"><span><Check size={16} /></span></div><div className="share-doc-copy"><span>PROPOSTA {quote.number}</span><h2>{quote.title}</h2><small>Para {quote.contacts?.name || 'cliente'} · {quote.items.length} {quote.items.length === 1 ? 'item' : 'itens'}</small></div><div className="share-amount"><span>VALOR FINAL</span><b>{money(quote.total)}</b></div></div>
      <div className="share-flow"><div className={`share-flow-step ${share ? 'completed' : 'current'}`}><span>{share ? <Check size={15} /> : '1'}</span><div><b>Gerar link e código</b><small>Um acesso exclusivo, com validade de 7 dias.</small></div></div><div className={`share-flow-step ${share ? 'current' : ''}`}><span>2</span><div><b>Enviar pelo WhatsApp</b><small>Mensagem pronta para o cliente da proposta.</small></div></div><div className="share-flow-step"><span>3</span><div><b>Cliente analisa e assina</b><small>Sem criar conta. O código confirma o aceite.</small></div></div></div>
      {error && <div className="share-error" role="alert">{error}</div>}
      {!share ? <button className="primary-button share-create-button" disabled={busy || digits.length < 10} onClick={prepareShare}><LockKeyhole size={17} />{busy ? 'Preparando acesso seguro…' : 'Gerar link privado'}{!busy && <ArrowRight size={16} />}</button> : <div className="share-issued"><div className="share-issued-heading"><ShieldCheck size={18} /><div><b>Link e código estão prontos</b><span>Compartilhe os dois na mesma mensagem.</span></div></div><div className="share-field"><span>LINK DO ORÇAMENTO</span><div><a href={shareUrl} target="_blank" rel="noreferrer">{shareUrl}</a><button onClick={() => copy(shareUrl, 'link')} aria-label="Copiar link">{copied === 'link' ? <Check size={16} /> : <Copy size={16} />}</button></div></div><div className="share-field code-field"><span>CÓDIGO DE SEGURANÇA</span><div><b>{share.code}</b><button onClick={() => copy(share.code, 'code')} aria-label="Copiar código">{copied === 'code' ? <Check size={16} /> : <Copy size={16} />}</button></div></div><div className="share-expiry"><LockKeyhole size={13} /> Válido até {new Date(share.expiresAt).toLocaleDateString('pt-BR')} · usado uma única vez.</div><a className="primary-button whatsapp-send" href={whatsappUrl} target="_blank" rel="noreferrer"><MessageCircle size={18} /> Abrir WhatsApp com a mensagem <ExternalLink size={14} /></a><p className="whatsapp-note">O WhatsApp abrirá com o texto preenchido. Revise e toque em enviar.</p></div>}
      {!share && digits.length < 10 && <div className="missing-phone"><MessageCircle size={16} /><span>Adicione um WhatsApp válido ao contato para compartilhar esta proposta.</span><button onClick={onEditContact}>Editar contato</button></div>}
    </section><aside className="share-security-card"><div className="share-security-icon"><LockKeyhole size={18} /></div><h3>Uma assinatura com proteção extra.</h3><p>O código só vai para o WhatsApp cadastrado do cliente. Ele não aparece no link nem é guardado em texto aberto.</p><div className="security-rule"><span><Check size={13} /></span>Até 5 tentativas para digitar o código</div><div className="security-rule"><span><Check size={13} /></span>O código é válido por 7 dias</div><div className="security-rule"><span><Check size={13} /></span>O cliente não precisa fazer cadastro</div><div className="privacy-caption"><ShieldCheck size={14} /> O custo e o multiplicador ficam privados.</div></aside></div>
  </div>
}

async function readFunctionError(error: unknown, responseError?: string) {
  if (responseError) return responseError
  if (error && typeof error === 'object' && 'context' in error) {
    const context = (error as { context?: unknown }).context
    if (context && typeof context === 'object') {
      if ('status' in context && Number(context.status) === 404) return 'A função de compartilhamento não foi encontrada no Supabase. O orçamento foi salvo, mas o link não foi gerado.'
      if ('clone' in context && typeof context.clone === 'function') {
        try {
          const body = await context.clone().json() as { error?: string; message?: string }
          if (body.error) return body.error
          if (body.message) return `Falha no compartilhamento: ${body.message}`
        } catch { /* use fallback below */ }
      }
    }
  }
  return 'Não foi possível alcançar a função de compartilhamento do Supabase. O orçamento foi salvo, mas o link não foi gerado.'
}
