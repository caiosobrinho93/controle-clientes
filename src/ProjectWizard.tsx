import { useMemo, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Check, FileText, ImagePlus, Minus, Plus, Search, ShieldCheck, Trash2, UserRound, X } from 'lucide-react'
import type { Contact, Product, Quote, QuoteItem } from './lib/supabase'

type ProjectItem = QuoteItem & { productId: string }
const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0)
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
const maxAttachmentSize = 20 * 1024 * 1024
const acceptedExtensions = ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'skp']
const formatSize = (size: number) => size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`

export default function ProjectWizard({ contacts, products, onBack, onNewContact, onManageProducts, onSave }: {
  contacts: Contact[]
  products: Product[]
  onBack: () => void
  onNewContact: () => void
  onManageProducts: () => void
  onSave: (input: Omit<Quote, 'id' | 'created_at' | 'contacts' | 'signed_at' | 'signed_by' | 'signature_data' | 'signed_document_hash' | 'attachments'>, files: File[], quickContact?: { name: string; phone: string }) => Promise<void>
}) {
  const [step, setStep] = useState<1 | 2>(1)
  const [name, setName] = useState('')
  const [contactId, setContactId] = useState('')
  const [clientPickerOpen, setClientPickerOpen] = useState(false)
  const [clientSearch, setClientSearch] = useState('')
  const [items, setItems] = useState<ProjectItem[]>([])
  const [attachments, setAttachments] = useState<File[]>([])
  const [search, setSearch] = useState('')
  const [multiplier, setMultiplier] = useState(2.5)
  const [customTotal, setCustomTotal] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const activeProducts = useMemo(() => products.filter(product => product.is_active && `${product.name} ${product.unit}`.toLowerCase().includes(search.toLowerCase())), [products, search])
  const filteredContacts = useMemo(() => contacts.filter(contact => contact.name.toLowerCase().includes(clientSearch.toLowerCase()) || contact.phone.includes(clientSearch)), [contacts, clientSearch])
  const costSubtotal = roundMoney(items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0))
  const suggestedSubtotal = roundMoney(items.reduce((sum, item) => sum + item.quantity * roundMoney(item.unitCost * multiplier), 0))
  const total = customTotal === null ? suggestedSubtotal : Math.min(suggestedSubtotal, Math.max(0, customTotal))
  const discount = roundMoney(suggestedSubtotal - total)

  function addProduct(product: Product) {
    setItems(current => {
      const existingIndex = current.findIndex(item => item.productId === product.id)
      if (existingIndex >= 0) return current.map((item, index) => index === existingIndex ? { ...item, quantity: item.quantity + 1 } : item)
      return [...current, { productId: product.id, description: product.name, unit: product.unit, quantity: 1, unitCost: Number(product.cost_price), unitPrice: roundMoney(Number(product.cost_price) * multiplier) }]
    })
  }
  function changeQuantity(productId: string, quantity: number) {
    if (quantity < 1) { setItems(current => current.filter(item => item.productId !== productId)); return }
    setItems(current => current.map(item => item.productId === productId ? { ...item, quantity } : item))
  }
  function setPriceMultiplier(value: number) { setMultiplier(value); setCustomTotal(null) }
  function addAttachments(fileList: FileList | null) {
    if (!fileList) return
    const incoming = Array.from(fileList)
    const invalid = incoming.find(file => !acceptedExtensions.includes(file.name.split('.').pop()?.toLowerCase() ?? ''))
    if (invalid) { setError(`O arquivo “${invalid.name}” não é suportado. Use imagem, PDF ou SketchUp (.skp).`); return }
    const tooLarge = incoming.find(file => file.size > maxAttachmentSize)
    if (tooLarge) { setError(`Cada arquivo pode ter no máximo ${formatSize(maxAttachmentSize)}.`); return }
    if (attachments.length + incoming.length > 10) { setError('Você pode anexar até 10 arquivos por projeto.'); return }
    setAttachments(current => [...current, ...incoming])
    setError('')
  }
  function goForward() {
    if (items.length === 0) { setError('Adicione ao menos um item ao projeto.'); return }
    setError(''); setStep(2)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (total <= 0 || !Number.isFinite(total)) { setError('O valor final precisa ser maior que zero.'); return }
    setBusy(true); setError('')
    const data = new FormData(event.currentTarget)
    const clientName = String(data.get('client_name') || '').trim()
    const clientPhone = String(data.get('client_phone') || '').trim()
    if (!contactId && (clientName.length < 2 || clientPhone.replace(/\D/g, '').length < 10 || clientPhone.replace(/\D/g, '').length > 15)) {
      setError('Informe o nome e um WhatsApp válido para enviar o orçamento.')
      setBusy(false)
      return
    }
    const number = `ORC-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`
    const pricedItems = items.map(item => ({ ...item, unitPrice: roundMoney(item.unitCost * multiplier) }))
    await onSave({
      contact_id: contactId || null,
      number,
      title: name.trim() || 'Projeto sem nome',
      status: 'pending',
      items: pricedItems,
      multiplier,
      cost_subtotal: costSubtotal,
      subtotal: suggestedSubtotal,
      discount,
      total: roundMoney(total),
      valid_until: null,
      delivery_estimate: '',
      payment_terms: '',
      notes: '',
    }, attachments, !contactId ? { name: clientName, phone: clientPhone } : undefined)
    setBusy(false)
  }

  return <div className="page-content project-wizard-page">
    {step === 1 ? <>
    <section className="project-identity"><h1>Novo Projeto</h1><div className="project-identity-fields"><input className="project-name-input" aria-label="Nome do projeto (opcional)" value={name} onChange={event => setName(event.target.value)} placeholder="Nome do projeto (opcional)" maxLength={160} /><button type="button" className={`project-client-picker ${contactId ? 'has-client' : ''}`} aria-label="Selecionar cliente (opcional)" onClick={() => { setClientSearch(''); setClientPickerOpen(true) }}><UserRound size={20} aria-hidden="true" /><span>{contacts.find(contact => contact.id === contactId)?.name || 'Selecionar cliente (opcional)'}</span></button></div>{contacts.length === 0 && <div className="wizard-inline-hint">Você poderá informar o nome e WhatsApp do cliente ao finalizar. <button type="button" onClick={onNewContact}>Adicionar cliente</button></div>}</section>
    {clientPickerOpen && <div className="client-picker-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setClientPickerOpen(false) }}><section className="client-picker-modal" role="dialog" aria-modal="true" aria-labelledby="client-picker-title"><header><div><h2 id="client-picker-title">Selecionar cliente</h2><p>Escolha um contato salvo para esta proposta.</p></div><button type="button" aria-label="Fechar seleção de cliente" onClick={() => setClientPickerOpen(false)}><X size={20} /></button></header><label className="client-picker-search"><Search size={18} /><input autoFocus value={clientSearch} onChange={event => setClientSearch(event.target.value)} placeholder="Buscar por nome ou telefone" /></label><div className="client-picker-list"><button type="button" className="client-picker-option" onClick={() => { setContactId(''); setClientPickerOpen(false) }}><span className="client-picker-avatar"><UserRound size={18} /></span><span><b>Sem cliente salvo</b><small>Informarei os dados no final</small></span>{!contactId && <Check size={18} />}</button>{filteredContacts.map(contact => <button type="button" className="client-picker-option" key={contact.id} onClick={() => { setContactId(contact.id); setClientPickerOpen(false) }}><span className="client-picker-avatar"><UserRound size={18} /></span><span><b>{contact.name}</b><small>{contact.phone || 'Sem telefone cadastrado'}</small></span>{contactId === contact.id && <Check size={18} />}</button>)}{filteredContacts.length === 0 && contacts.length > 0 && <p className="client-picker-empty">Nenhum cliente encontrado.</p>}</div><button type="button" className="client-picker-add" onClick={() => { setClientPickerOpen(false); onNewContact() }}><Plus size={17} /> Cadastrar novo cliente</button></section></div>}
    <div className="project-builder">
      <section className="builder-main">
        <div className="project-list-heading"><div><h2>Itens do projeto</h2><p>Toque em um produto para adicioná-lo à lista.</p></div><button className="text-button" onClick={onManageProducts}>Gerenciar catálogo <ArrowRight size={14} /></button></div>
        {activeProducts.length ? <><div className="catalog-search"><Search size={16} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar produto ou serviço" /></div><div className="picker-list">{activeProducts.map(product => { const selected = items.find(item => item.productId === product.id); return <button type="button" className={`picker-product ${selected ? 'added' : ''}`} key={product.id} onClick={() => addProduct(product)}><span className="picker-product-main"><i className="product-wood-icon"><span /></i><span><b>{product.name}</b><small>por {product.unit}</small></span></span><span className="picker-cost">{money(Number(product.cost_price))}<small>custo / {product.unit}</small></span><span className="picker-add">{selected ? <><Check size={15} /><b>{selected.quantity}</b></> : <Plus size={17} />}</span></button>})}</div></> : <div className="catalog-empty"><div className="catalog-empty-icon"><Plus size={17} /></div><b>{products.length ? 'Nenhum produto ativo encontrado' : 'Cadastre seu primeiro produto'}</b><span>Use custos de materiais, ferragens, mão de obra e serviços para formar o projeto.</span><button className="secondary-button" onClick={onManageProducts}>Abrir catálogo <ArrowRight size={14} /></button></div>}
        <div className="project-attachments"><div className="project-list-heading"><div><h2>Arquivos do projeto</h2><p>Anexe referências para o cliente analisar junto com a proposta.</p></div><label className="secondary-button attachment-picker"><ImagePlus size={17} /> Adicionar arquivos<input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,.skp,image/jpeg,image/png,image/webp,application/pdf,application/octet-stream,model/vnd.skp" multiple onChange={event => { addAttachments(event.currentTarget.files); event.currentTarget.value = '' }} /></label></div><div className="attachment-help">Imagens, PDF e arquivos SketchUp · Até 10 arquivos, 20 MB cada</div>{attachments.length > 0 && <ul className="attachment-list">{attachments.map((file, index) => <li key={`${file.name}-${file.lastModified}-${index}`}><span className="attachment-file-icon">{file.type.startsWith('image/') ? <ImagePlus size={18} /> : <FileText size={18} />}</span><span className="attachment-file-copy"><b>{file.name}</b><small>{formatSize(file.size)} · {file.name.toLowerCase().endsWith('.skp') ? 'SketchUp' : file.type === 'application/pdf' ? 'PDF' : 'Imagem'}</small></span><button type="button" className="attachment-remove" onClick={() => setAttachments(current => current.filter((_, fileIndex) => fileIndex !== index))} aria-label={`Remover ${file.name}`}><Trash2 size={17} /></button></li>)}</ul>}</div>
      </section>
      <aside className="project-summary"><div className="summary-eyebrow">RESUMO INTERNO</div><h3>Composição</h3>{items.length ? <div className="selected-items">{items.map(item => <div className="selected-item" key={item.productId}><div className="selected-item-copy"><b>{item.description}</b><small>{money(item.unitCost)} / {item.unit}</small></div><div className="selected-item-controls"><div className="quantity-stepper"><button type="button" onClick={() => changeQuantity(item.productId, item.quantity - 1)} aria-label={`Remover uma unidade de ${item.description}`}><Minus size={12} /></button><span>{item.quantity}</span><button type="button" onClick={() => changeQuantity(item.productId, item.quantity + 1)} aria-label={`Adicionar uma unidade de ${item.description}`}><Plus size={12} /></button></div><strong>{money(item.quantity * item.unitCost)}</strong></div></div>)}</div> : <div className="selected-empty">Os produtos escolhidos aparecem aqui.</div>}<div className="summary-cost"><span>Custo estimado</span><b>{money(costSubtotal)}</b></div><div className="summary-privacy"><ShieldCheck size={15} /> Esse custo só aparece para você.</div>{error && <p className="wizard-error">{error}</p>}<button className="primary-button wizard-next" onClick={goForward}>Avançar para o preço <ArrowRight size={16} /></button></aside>
    </div>
    </> : <>
    <div className="wizard-topline"><button className="wizard-back" onClick={() => { setStep(1); setError('') }}><ArrowLeft size={16} /> Voltar aos itens</button><span>PROJETO NOVO <i>·</i> ETAPA 2 DE 2</span></div>
    <div className="wizard-heading"><div><span className="eyebrow">FORMAÇÃO DO PREÇO</span><h1>Quanto vale esse projeto?</h1><p>Defina seu multiplicador e ajuste o valor final para apresentar.</p></div><div className="wizard-progress" aria-label="Etapa 2 de 2"><i className="done" /><i className="done" /></div></div>
    <form className="pricing-layout" onSubmit={submit}>
      <section className="pricing-main"><div className="pricing-panel"><div className="pricing-panel-heading"><div><h2>Multiplicador</h2><p>O fator aplicado sobre o custo dos itens.</p></div><label className="multiplier-input"><input type="number" min="2" max="4.5" step="0.1" value={multiplier} onChange={event => setPriceMultiplier(Math.min(4.5, Math.max(2, Number(event.target.value) || 2)))} /><span>×</span></label></div><input className="multiplier-slider" aria-label="Multiplicador do preço" type="range" min="2" max="4.5" step="0.1" value={multiplier} onChange={event => setPriceMultiplier(Number(event.target.value))} /><div className="multiplier-scale"><span>2,0×</span><span>Faixa usual: 2,0× a 3,0×</span><span>4,5× máx.</span></div></div>
        <div className="pricing-fields"><label className="field-label">Valor para apresentar ao cliente<div className="currency-input"><span>R$</span><input type="number" min="0.01" max={suggestedSubtotal} step="0.01" required value={customTotal ?? suggestedSubtotal} onChange={event => { const value = Number(event.target.value); setCustomTotal(Math.min(suggestedSubtotal, Math.max(0, Number.isFinite(value) ? value : 0))) }} /></div><small>O valor não pode passar do preço sugerido. Você pode ajustar para conceder um desconto.</small></label><div className="discount-card"><span>Desconto concedido</span><b>{money(discount)}</b><small>Deduzido do preço sugerido</small></div></div>
        {!contactId && <div className="project-conditions"><div className="project-list-heading"><div><h2>Dados do cliente</h2><p>Informe nome e WhatsApp para enviar o orçamento.</p></div></div><div className="builder-field-row"><label className="field-label">Nome do cliente<input name="client_name" autoComplete="name" required minLength={2} maxLength={120} placeholder="Nome completo" /></label><label className="field-label">WhatsApp do cliente<input name="client_phone" type="tel" inputMode="tel" autoComplete="tel" required placeholder="(11) 99999-9999" /></label></div></div>}
      </section>
      <aside className="project-summary pricing-summary"><div className="summary-eyebrow">PRÉVIA DO ORÇAMENTO</div><h3>{name || 'Novo projeto'}</h3><p className="summary-client">Para {contacts.find(contact => contact.id === contactId)?.name || 'seu cliente'}</p><div className="price-preview-lines"><span>Produtos <b>{money(suggestedSubtotal)}</b></span>{discount > 0 && <span>Desconto <b>− {money(discount)}</b></span>}</div><div className="summary-final"><span>Valor final</span><b>{money(total)}</b></div><div className="signature-included"><ShieldCheck size={16} /><span>O cliente revisa e assina com código enviado no WhatsApp.</span></div>{error && <p className="wizard-error">{error}</p>}<button className="primary-button wizard-next" disabled={busy || total <= 0}>{busy ? 'Salvando projeto…' : 'Criar orçamento'}{!busy && <ArrowRight size={16} />}</button><button type="button" className="wizard-cancel" onClick={onBack}>Cancelar</button></aside>
    </form>
    </>}
  </div>
}
