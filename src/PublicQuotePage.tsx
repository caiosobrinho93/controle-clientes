import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type FormEvent } from 'react'
import { ArrowDownToLine, Check, CheckCircle2, CircleAlert, Clock3, FileText, Hammer, LoaderCircle, LockKeyhole, RotateCcw, ShieldCheck } from 'lucide-react'
import { supabase } from './lib/supabase'

type PublicItem = { description: string; unit: string; quantity: number; unitPrice: number }
type PublicAttachment = { name: string; mimeType: string; size: number; url: string }
type PublicQuote = {
  number: string; title: string; shopName: string; clientName: string; createdAt: string; validUntil: string | null
  deliveryEstimate: string; paymentTerms: string; notes: string; items: PublicItem[]; attachments: PublicAttachment[]; subtotal: number; discount: number; total: number; acceptanceText: string
}
const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0)
const date = (value: string) => new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR')

export default function PublicQuotePage({ token }: { token: string }) {
  const [quote, setQuote] = useState<PublicQuote | null>(null)
  const [status, setStatus] = useState<'loading' | 'pending' | 'signed' | 'locked' | 'error'>('loading')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [fullName, setFullName] = useState('')
  const [code, setCode] = useState('')
  const [consented, setConsented] = useState(false)
  const [signature, setSignature] = useState('')
  const [signaturePadKey, setSignaturePadKey] = useState(0)
  const [signedAt, setSignedAt] = useState('')
  const [signedBy, setSignedBy] = useState('')
  const [signedSignature, setSignedSignature] = useState('')
  const [documentHash, setDocumentHash] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      if (!supabase) { setStatus('error'); setError('Esta proposta não está disponível no momento.'); return }
      const { data, error: functionError } = await supabase.functions.invoke('get-quote-share', { body: { token } })
      if (!active) return
      if (functionError || data?.error) { setStatus('error'); setError(data?.error || 'Não foi possível abrir esta proposta.'); return }
      setQuote(data.quote as PublicQuote)
      setStatus(data.status)
      if (data.signedAt) setSignedAt(data.signedAt)
      if (data.signedBy) setSignedBy(data.signedBy)
      if (data.signatureData) setSignedSignature(data.signatureData)
      if (data.documentHash) setDocumentHash(data.documentHash)
    }
    void load()
    return () => { active = false }
  }, [token])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('')
    if (code.length !== 6) { setError('Digite o código de seis números recebido no WhatsApp.'); return }
    if (!signature) { setError('Assine no campo antes de continuar.'); return }
    if (!consented) { setError('Leia e aceite as condições da proposta.'); return }
    setBusy(true)
    const { data, error: functionError } = await supabase!.functions.invoke('sign-quote', { body: { token, code, fullName: fullName.trim(), signatureData: signature } })
    if (functionError || data?.error) setError(await readFunctionError(functionError, data?.error))
    else { setStatus('signed'); setSignedAt(data.signedAt || new Date().toISOString()); setSignedBy(data.signedBy || fullName.trim()); setSignedSignature(data.signatureData || signature); setDocumentHash(data.documentHash || '') }
    setBusy(false)
  }

  async function downloadSignedCopy() {
    if (!quote || !signedSignature) return
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const left = 18; const right = 192; let y = 22
    doc.setFillColor(42, 57, 45); doc.rect(0, 0, 210, 48, 'F')
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text(quote.shopName.toUpperCase(), left, y)
    y += 14; doc.setFontSize(20); doc.text('Proposta aceita', left, y); doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(`Orçamento ${quote.number} · ${quote.title}`, left, y + 8)
    y = 62; doc.setTextColor(50, 55, 48); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text(`Cliente: ${quote.clientName}`, left, y); y += 8
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
    quote.items.forEach(item => {
      const lines = doc.splitTextToSize(`${item.description} — ${item.quantity} ${item.unit} × ${money(item.unitPrice)} = ${money(item.quantity * item.unitPrice)}`, right - left) as string[]
      if (y + lines.length * 5 > 265) { doc.addPage(); y = 22 }
      doc.text(lines, left, y); y += Math.max(7, lines.length * 5)
    })
    if (quote.attachments?.length) {
      y += 4; doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.text('ARQUIVOS ANEXADOS AO PROJETO', left, y); y += 6
      doc.setFont('helvetica', 'normal')
      quote.attachments.forEach(file => { const lines = doc.splitTextToSize(file.name, right - left) as string[]; if (y + lines.length * 4 > 265) { doc.addPage(); y = 22 }; doc.text(lines, left, y); y += Math.max(5, lines.length * 4) })
    }
    y += 4; doc.setDrawColor(222, 222, 214); doc.line(left, y, right, y); y += 8
    doc.setFont('helvetica', 'bold'); doc.text(`Valor aceito: ${money(quote.total)}`, left, y); y += 8
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
    for (const line of [quote.validUntil && `Validade da proposta: ${date(quote.validUntil)}`, quote.deliveryEstimate && `Prazo: ${quote.deliveryEstimate}`, quote.paymentTerms && `Pagamento: ${quote.paymentTerms}`, quote.notes && `Observações: ${quote.notes}`].filter(Boolean)) {
      const lines = doc.splitTextToSize(String(line), right - left) as string[]; doc.text(lines, left, y); y += Math.max(6, lines.length * 4)
    }
    y += 5
    const acceptedTerms = doc.splitTextToSize(`Termos aceitos: ${quote.acceptanceText}`, right - left) as string[]
    if (y + acceptedTerms.length * 4 + 30 > 270) { doc.addPage(); y = 22 }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.text('TERMOS ACEITOS', left, y); y += 5
    doc.setFont('helvetica', 'normal'); doc.text(acceptedTerms, left, y); y += Math.max(6, acceptedTerms.length * 4) + 6
    if (y > 238) { doc.addPage(); y = 24 }
    doc.setDrawColor(222, 222, 214); doc.line(left, y, right, y); y += 8
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.text('ACEITE DIGITAL', left, y); y += 6
    doc.addImage(signedSignature, 'PNG', left, y, 52, 15); y += 20
    doc.setFontSize(9); doc.text(signedBy, left, y); y += 6
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text(`Confirmado em ${signedAt ? new Date(signedAt).toLocaleString('pt-BR') : '—'} com código enviado ao WhatsApp.`, left, y)
    if (documentHash) { y += 6; const hashLines = doc.splitTextToSize(`Hash do documento: ${documentHash}`, right - left) as string[]; doc.text(hashLines, left, y) }
    doc.save(`proposta-assinada-${quote.number}.pdf`)
  }

  if (status === 'loading') return <div className="public-loading"><LoaderCircle className="spin" size={22} /><span>Carregando sua proposta…</span></div>
  if (status === 'error' || !quote) return <main className="public-state-page"><span className="public-state-icon error"><CircleAlert size={24} /></span><h1>Não foi possível abrir</h1><p>{error || 'O link pode ter expirado. Fale com a marcenaria para receber uma nova proposta.'}</p></main>

  return <div className="public-quote-page"><header className="public-header"><a href="/" className="public-brand"><span className="public-brand-mark"><Hammer size={19} /></span><span>{quote.shopName}<small>PROPOSTA DE PROJETO</small></span></a><span className="public-private"><LockKeyhole size={13} /> LINK PRIVADO</span></header>
    <main className="public-quote-main"><div className="public-welcome"><span className="public-overline">PREPARADO PARA VOCÊ, {quote.clientName.split(' ')[0].toUpperCase()}</span><h1>{status === 'signed' ? 'Projeto confirmado.' : 'Sua ideia começa aqui.'}</h1><p>{status === 'signed' ? 'A marcenaria recebeu seu aceite e já pode preparar a execução.' : 'Revise os detalhes do projeto. Se estiver tudo certo, confirme e assine com segurança.'}</p></div>
      <section className="public-document"><div className="public-document-head"><div><span className="public-quote-number">ORÇAMENTO {quote.number}</span><h2>{quote.title}</h2><span className="public-shop-name">{quote.shopName}</span></div><div className="public-status-label"><i className={status === 'signed' ? 'is-signed' : ''} />{status === 'signed' ? 'Assinado' : status === 'locked' ? 'Aguardando novo código' : 'Aguardando sua aprovação'}</div></div>
        <div className="public-meta"><div><span>PARA</span><b>{quote.clientName}</b></div><div><span>EMITIDO EM</span><b>{date(quote.createdAt)}</b></div><div><span>VÁLIDO ATÉ</span><b>{quote.validUntil ? date(quote.validUntil) : 'Sem validade definida'}</b></div></div>
        <div className="public-items-head"><span>DESCRIÇÃO</span><span>QUANTIDADE</span><span>VALOR</span></div>
        <div className="public-items">{quote.items.map((item, index) => <div className="public-item" key={`${item.description}-${index}`}><div><b>{item.description}</b><small>{money(item.unitPrice)} / {item.unit}</small></div><span>{item.quantity} {item.unit}</span><strong>{money(item.quantity * item.unitPrice)}</strong></div>)}</div>
        <div className="public-totals"><div><span>Subtotal</span><b>{money(quote.subtotal)}</b></div>{quote.discount > 0 && <div className="public-discount"><span>Desconto</span><b>− {money(quote.discount)}</b></div>}<div className="public-total"><span>Valor do projeto</span><b>{money(quote.total)}</b></div></div>
        <div className="public-conditions">{quote.deliveryEstimate && <div><Clock3 size={15} /><span><small>PRAZO ESTIMADO</small><b>{quote.deliveryEstimate}</b></span></div>}{quote.paymentTerms && <div><span className="condition-symbol">R$</span><span><small>CONDIÇÕES DE PAGAMENTO</small><b>{quote.paymentTerms}</b></span></div>}{quote.notes && <div className="public-note"><span><small>OBSERVAÇÕES</small><b>{quote.notes}</b></span></div>}</div>
      </section>
      {quote.attachments?.length > 0 && <section className="public-attachments"><div><span className="public-attachment-icon"><FileText size={18} /></span><span><b>Arquivos do projeto</b><small>Referências para consultar antes de confirmar.</small></span></div><ul>{quote.attachments.map((file, index) => <li key={`${file.name}-${index}`}><a href={file.url} target="_blank" rel="noreferrer"><FileText size={16} /><span>{file.name}<small>{file.mimeType === 'application/pdf' ? 'PDF' : file.name.toLowerCase().endsWith('.skp') ? 'SketchUp' : 'Imagem'} · {(file.size / (1024 * 1024)).toFixed(1)} MB</small></span><ArrowDownToLine size={16} /></a></li>)}</ul></section>}
      {status === 'signed' ? <section className="signature-success"><div className="success-check"><Check size={22} /></div><div><h2>Aceite registrado</h2><p>Assinatura confirmada por <b>{signedBy || fullName || quote.clientName}</b>{signedAt && <> em {new Date(signedAt).toLocaleString('pt-BR')}.</>}</p><span>Baixe uma cópia do aceite para guardar com você.</span><button className="secondary-button" onClick={() => void downloadSignedCopy()}><ArrowDownToLine size={16} /> Baixar proposta assinada</button></div></section>
        : status === 'locked' ? <section className="public-locked"><LockKeyhole size={19} /><div><b>O código precisa ser renovado</b><span>Para proteger sua assinatura, as tentativas se esgotaram. Peça um novo código à marcenaria.</span></div></section>
          : <section className="public-sign-panel"><div className="sign-panel-heading"><span className="sign-shield"><ShieldCheck size={18} /></span><div><h2>De acordo com o projeto?</h2><p>Confirme sua identidade e assine pelo celular.</p></div></div><div className="sign-steps"><span><i>1</i> Código no WhatsApp</span><span><i>2</i> Nome e assinatura</span></div><form onSubmit={submit} className="public-sign-form"><label className="public-label">Código de segurança<input className="security-code-input" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" required /></label><label className="public-label">Seu nome completo<input type="text" autoComplete="name" maxLength={120} minLength={3} value={fullName} onChange={event => setFullName(event.target.value)} placeholder="Como aparece no seu documento" required /></label><label className="public-label signature-label">Sua assinatura<span>Assine com o dedo dentro do quadro.</span><SignaturePad key={signaturePadKey} onChange={setSignature} /></label><button type="button" className="signature-clear" onClick={() => { setSignature(''); setSignaturePadKey(key => key + 1) }}><RotateCcw size={13} /> Limpar assinatura</button><label className="consent-row"><input type="checkbox" checked={consented} onChange={event => setConsented(event.target.checked)} /><span>{quote.acceptanceText}</span></label>{error && <div className="public-form-error" role="alert"><CircleAlert size={15} />{error}</div>}<button type="submit" className="sign-submit" disabled={busy || !consented || !signature}>{busy ? <><LoaderCircle className="spin" size={17} /> Validando sua assinatura…</> : <><CheckCircle2 size={18} /> Confirmar e assinar proposta</>}</button><p className="sign-security"><LockKeyhole size={13} /> O código é de uso único e só pode ser tentado 5 vezes.</p></form></section>}
      <footer className="public-footer"><span>PROPOSTA PREPARADA POR {quote.shopName.toUpperCase()}</span><span>Este aceite confirma os termos e valores apresentados nesta proposta.</span></footer>
    </main>
  </div>
}

async function readFunctionError(error: unknown, responseError?: string) {
  if (responseError) return responseError
  if (error && typeof error === 'object' && 'context' in error) {
    const context = (error as { context?: unknown }).context
    if (context instanceof Response) {
      try { const body = await context.clone().json() as { error?: string }; if (body.error) return body.error } catch { /* use fallback below */ }
    }
  }
  return 'Não foi possível confirmar. Confira os dados e tente novamente.'
}

function SignaturePad({ onChange }: { onChange: (signature: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const previous = useRef<{ x: number; y: number } | null>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height)
    context.strokeStyle = '#293b30'; context.lineWidth = 4; context.lineCap = 'round'; context.lineJoin = 'round'
  }, [])
  function point(event: ReactPointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: (event.clientX - rect.left) * (event.currentTarget.width / rect.width), y: (event.clientY - rect.top) * (event.currentTarget.height / rect.height) }
  }
  function start(event: ReactPointerEvent<HTMLCanvasElement>) {
    event.preventDefault(); drawing.current = true; previous.current = point(event); event.currentTarget.setPointerCapture(event.pointerId)
  }
  function draw(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !previous.current) return
    event.preventDefault(); const current = point(event); const context = event.currentTarget.getContext('2d')
    if (!context) return
    context.beginPath(); context.moveTo(previous.current.x, previous.current.y); context.lineTo(current.x, current.y); context.stroke(); previous.current = current
  }
  function stop(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    drawing.current = false; previous.current = null; onChange(event.currentTarget.toDataURL('image/png'))
  }
  return <canvas ref={canvasRef} className="signature-canvas" width={900} height={240} aria-label="Campo para desenhar sua assinatura" onPointerDown={start} onPointerMove={draw} onPointerUp={stop} onPointerCancel={stop} />
}
