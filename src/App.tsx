import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowDownToLine, ArrowRight, Box, Check, ChevronDown, ClipboardList, Clock3, FileText, Hammer, HardHat, LayoutDashboard, LoaderCircle, LockKeyhole, LogOut, Mail, Menu, MessageCircle, Pencil, Plus, Search, ShieldCheck, Users, Wallet, X } from 'lucide-react'
import { isSupabaseConfigured, supabase, type Contact, type Product, type Quote } from './lib/supabase'
import CampusDashboard from './CampusDashboard'
const ProductPage = lazy(() => import('./ProductPage'))
const ProjectWizard = lazy(() => import('./ProjectWizard'))
const PublicQuotePage = lazy(() => import('./PublicQuotePage'))
const ShareQuotePage = lazy(() => import('./ShareQuotePage'))

type Page = 'inicio' | 'orcamentos' | 'contatos' | 'produtos' | 'novo-projeto' | 'compartilhar'
type StatusFilter = 'Todos' | 'Pendente' | 'Aprovado' | 'Recusado'
const brl = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0)
const datePt = (value: string) => new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR')
const formatWhatsApp = (value: string) => {
  const digits = value.replace(/\D/g, '')
  const national = digits.startsWith('55') && digits.length === 13 ? digits.slice(2) : digits
  if (national.length === 11) return `(${national.slice(0, 2)}) ${national.slice(2, 7)}-${national.slice(7)}`
  if (national.length === 10) return `(${national.slice(0, 2)}) ${national.slice(2, 6)}-${national.slice(6)}`
  return value
}

export default function App() {
  const publicPath = useMemo(() => window.location.pathname.startsWith('/p/'), [])
  const publicToken = useMemo(() => window.location.pathname.match(/^\/p\/([A-Za-z0-9_-]{40,50})\/?$/)?.[1] ?? null, [])
  const [session, setSession] = useState<{ user: { id: string; email?: string; user_metadata?: Record<string, string> } } | null>(null)
  const [configured, setConfigured] = useState(false)
  const [authReady, setAuthReady] = useState(false)
  const [page, setPage] = useState<Page>('inicio')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')
  const [authError, setAuthError] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [showContactForm, setShowContactForm] = useState(false)
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null)
  const [editingContact, setEditingContact] = useState<Contact | null>(null)
  const [shareQuote, setShareQuote] = useState<Quote | null>(null)
  const [wizardPausedForCatalog, setWizardPausedForCatalog] = useState(false)
  const [showProjectModal, setShowProjectModal] = useState(false)
  const [projectWizardInstance, setProjectWizardInstance] = useState(0)
  const [contactSearch, setContactSearch] = useState('')
  const [quoteSearch, setQuoteSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('Todos')
  const [mobileNav, setMobileNav] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => {
    setConfigured(isSupabaseConfigured)
    if (!supabase) { setAuthReady(true); return }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => subscription.unsubscribe()
  }, [])

  const refreshData = useCallback(async () => {
    if (!supabase || !session) return
    setLoading(true)
    const [contactsResult, quotesResult, productsResult] = await Promise.all([
      supabase.from('contacts').select('*').order('created_at', { ascending: false }),
      supabase.from('quotes').select('*, contacts(name,phone,email,address)').order('created_at', { ascending: false }),
      supabase.from('catalog_products').select('*').order('name', { ascending: true }),
    ])
    if (contactsResult.error || quotesResult.error || productsResult.error) {
      showToast('Não foi possível carregar os dados. Confira a migração do Supabase.')
    } else {
      setContacts((contactsResult.data ?? []) as Contact[])
      setQuotes((quotesResult.data ?? []) as Quote[])
      setProducts((productsResult.data ?? []) as Product[])
    }
    setLoading(false)
  }, [session])

  useEffect(() => { void refreshData() }, [refreshData])
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 3200); return () => window.clearTimeout(timer) }, [toast])
  function showToast(message: string) { setToast(message) }

  const displayName = session?.user.user_metadata?.full_name || session?.user.email?.split('@')[0] || 'Minha oficina'
  function startProject() { setProjectWizardInstance(value => value + 1); setPage('orcamentos'); setShareQuote(null); setWizardPausedForCatalog(false); setShowProjectModal(true) }
  function closeProjectModal() { setShowProjectModal(false); setWizardPausedForCatalog(false); setProjectWizardInstance(value => value + 1) }
  const filteredContacts = useMemo(() => contacts.filter(contact => `${contact.name} ${contact.phone} ${contact.email}`.toLowerCase().includes(contactSearch.toLowerCase())), [contacts, contactSearch])
  const filteredQuotes = useMemo(() => quotes.filter(quote => {
    const matchesSearch = `${quote.number} ${quote.title} ${quote.contacts?.name ?? ''}`.toLowerCase().includes(quoteSearch.toLowerCase())
    const statuses: Record<StatusFilter, string | undefined> = { Todos: undefined, Pendente: 'pending', Aprovado: 'approved', Recusado: 'rejected' }
    return matchesSearch && (!statuses[statusFilter] || quote.status === statuses[statusFilter])
  }), [quotes, quoteSearch, statusFilter])

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase) return
    setAuthBusy(true); setAuthError(''); setAuthMessage('')
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') ?? '').trim()
    const password = String(form.get('password') ?? '')
    const name = String(form.get('name') ?? '').trim()
    const result = authMode === 'login'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } })
    if (result.error) {
      const message = result.error.message
      setAuthError(message.includes('over_email_send_rate_limit') || message.toLowerCase().includes('email rate limit exceeded')
        ? 'O limite de envio de e-mails do projeto foi atingido. Aguarde a renovação ou configure um servidor SMTP próprio no Supabase antes de tentar novamente.'
        : message.includes('Invalid login credentials') ? 'E-mail ou senha incorretos.' : message)
    }
    else if (authMode === 'signup' && !result.data.session) setAuthMessage('Cadastro iniciado. Confira seu e-mail para confirmar a conta.')
    setAuthBusy(false)
  }

  async function signOut() { await supabase?.auth.signOut(); setQuotes([]); setContacts([]); setProducts([]) }
  async function saveContact(values: Omit<Contact, 'id' | 'created_at'>, id?: string) {
    if (!supabase) return
    const result = id
      ? await supabase.from('contacts').update(values).eq('id', id).select().single()
      : await supabase.from('contacts').insert(values).select().single()
    const { data: savedContact, error } = result
    if (error) { showToast(error.message); return }
    const savedContactId = id ?? savedContact?.id
    if (!savedContactId) { showToast('O contato foi salvo, mas não foi possível atualizar a proposta.'); return }
    setShareQuote(current => {
      if (!current || current.contact_id !== savedContactId) return current
      return { ...current, contacts: { name: values.name, phone: values.phone, email: values.email, address: values.address } }
    })
    setShowContactForm(false); setEditingContact(null); showToast(id ? 'Contato atualizado.' : 'Contato adicionado.'); await refreshData()
  }
  async function saveQuote(input: Omit<Quote, 'id' | 'created_at' | 'contacts' | 'signed_at' | 'signed_by' | 'signature_data' | 'signed_document_hash' | 'attachments'>, files: File[] = [], quickContact?: { name: string; phone: string }) {
    if (!supabase) return
    const { data: userResult, error: userError } = await supabase.auth.getUser()
    if (userError || !userResult.user) { showToast('Sua sessão expirou. Entre novamente para salvar o projeto.'); return }
    const quoteId = crypto.randomUUID()
    const uploadedPaths: string[] = []
    const attachments: Quote['attachments'] = []
    for (const file of files) {
      const safeName = file.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'arquivo'
      const path = `${userResult.user.id}/${quoteId}/${crypto.randomUUID()}-${safeName}`
      const mimeType = file.name.toLowerCase().endsWith('.glb') ? 'model/gltf-binary' : file.type || 'application/octet-stream'
      const { error: uploadError } = await supabase.storage.from('project-files').upload(path, file, { contentType: mimeType, upsert: false })
      if (uploadError) {
        if (uploadedPaths.length) await supabase.storage.from('project-files').remove(uploadedPaths)
        showToast(`Não foi possível anexar “${file.name}”. Confira a conexão e tente novamente.`)
        return
      }
      uploadedPaths.push(path)
      attachments.push({ path, name: file.name, mime_type: mimeType, size: file.size })
    }
    let contactId = input.contact_id
    let createdContactId: string | null = null
    if (!contactId && quickContact) {
      const { data: createdContact, error: contactError } = await supabase.from('contacts').insert({ name: quickContact.name.trim(), phone: quickContact.phone.trim() }).select('id').single()
      if (contactError || !createdContact) {
        if (uploadedPaths.length) await supabase.storage.from('project-files').remove(uploadedPaths)
        showToast('Não foi possível salvar os dados do cliente. Confira o WhatsApp e tente novamente.')
        return
      }
      contactId = createdContact.id
      createdContactId = createdContact.id
    }
    const { data, error } = await supabase.from('quotes').insert({ ...input, contact_id: contactId, id: quoteId, attachments }).select('*, contacts(name,phone,email,address)').single()
    if (error) {
      if (uploadedPaths.length) await supabase.storage.from('project-files').remove(uploadedPaths)
      if (createdContactId) await supabase.from('contacts').delete().eq('id', createdContactId)
      showToast('Não foi possível salvar o projeto. Os arquivos enviados foram removidos.')
      return
    }
    setShowProjectModal(false); setWizardPausedForCatalog(false); setPage('compartilhar'); setShareQuote(data as Quote); showToast('Orçamento salvo. Prepare o envio ao cliente.'); await refreshData()
  }
  async function saveProduct(input: Pick<Product, 'name' | 'unit' | 'cost_price'>, id?: string): Promise<boolean> {
    if (!supabase) return false
    const result = id ? await supabase.from('catalog_products').update(input).eq('id', id) : await supabase.from('catalog_products').insert(input)
    if (result.error) { showToast('Não foi possível salvar o produto.'); return false }
    await refreshData(); showToast(id ? 'Produto atualizado.' : 'Produto adicionado ao catálogo.'); return true
  }
  async function updateQuote(quote: Quote, changes: Pick<Quote, 'title' | 'status' | 'items' | 'cost_subtotal' | 'subtotal' | 'valid_until' | 'delivery_estimate' | 'payment_terms' | 'notes' | 'discount' | 'total'>) {
    if (!supabase) return false
    const { data, error } = await supabase.from('quotes').update(changes).eq('id', quote.id).select('*, contacts(name,phone,email,address)').single()
    if (error || !data) { showToast('Não foi possível atualizar o orçamento.'); return false }
    const updated = data as Quote
    setQuotes(current => current.map(item => item.id === updated.id ? updated : item))
    setSelectedQuote(updated)
    showToast('Orçamento atualizado.')
    return true
  }
  async function archiveProduct(product: Product) {
    if (!supabase) return
    const { error } = await supabase.from('catalog_products').update({ is_active: false }).eq('id', product.id)
    if (error) { showToast('Não foi possível arquivar o produto.'); return }
    await refreshData(); showToast('Produto arquivado; projetos antigos continuam preservados.')
  }
  async function deleteContact(contact: Contact) {
    if (!supabase || !window.confirm(`Excluir o contato ${contact.name}?`)) return
    const { error } = await supabase.from('contacts').delete().eq('id', contact.id)
    if (error) { showToast('Não foi possível excluir o contato.'); return }
    await refreshData(); showToast('Contato excluído.')
  }

  async function downloadQuote(quote: Quote) {
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const left = 18; const right = 192; let y = 22
    doc.setFillColor(42, 57, 45); doc.rect(0, 0, 210, 52, 'F')
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('OFICINA  /  GESTÃO DE MARCENARIA', left, y)
    y += 14; doc.setFontSize(22); doc.text('Orçamento de serviço', left, y)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text(`Nº ${quote.number}`, left, y + 9)
    doc.setFontSize(9); doc.text(`Emitido em ${datePt(quote.created_at)}`, right, y + 3, { align: 'right' })
    y = 68; doc.setTextColor(90, 96, 86); doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.text('CLIENTE', left, y)
    doc.setTextColor(34, 39, 33); doc.setFontSize(12); doc.text(quote.contacts?.name || 'Cliente', left, y + 7)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
    const contactDetails = [quote.contacts?.phone, quote.contacts?.email, quote.contacts?.address].filter(Boolean)
    contactDetails.forEach((line, index) => doc.text(String(line), left, y + 14 + index * 5))
    const detailsY = y + 20 + contactDetails.length * 5
    doc.setDrawColor(222, 222, 214); doc.line(left, detailsY, right, detailsY)
    y = detailsY + 10; doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text(quote.title, left, y)
    y += 12; doc.setFillColor(244, 243, 237); doc.rect(left, y, right - left, 9, 'F')
    doc.setFontSize(8); doc.setTextColor(99, 103, 94); doc.text('DESCRIÇÃO', left + 3, y + 6); doc.text('QTD.', 124, y + 6, { align: 'right' }); doc.text('UNITÁRIO', 157, y + 6, { align: 'right' }); doc.text('TOTAL', right - 3, y + 6, { align: 'right' })
    y += 15; doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(34, 39, 33)
    quote.items.forEach((item, index) => {
      if (y > 250) { doc.addPage(); y = 22 }
      const desc = doc.splitTextToSize(item.description, 90) as string[]
      doc.text(desc, left + 3, y); doc.text(`${item.quantity} ${item.unit || 'un'}`, 124, y, { align: 'right' }); doc.text(brl(item.unitPrice), 157, y, { align: 'right' }); doc.text(brl(item.quantity * item.unitPrice), right - 3, y, { align: 'right' })
      y += Math.max(10, desc.length * 4 + 4); doc.setDrawColor(236, 236, 230); doc.line(left, y - 3, right, y - 3)
      if (index === quote.items.length - 1) y += 2
    })
    y = Math.max(y, 115); doc.setFontSize(9); doc.setTextColor(87, 92, 82)
    doc.text('Subtotal', 142, y); doc.text(brl(quote.subtotal), right - 3, y, { align: 'right' }); y += 7
    if (quote.discount > 0) { doc.text('Desconto', 142, y); doc.text(`− ${brl(quote.discount)}`, right - 3, y, { align: 'right' }); y += 7 }
    doc.setFillColor(42, 57, 45); doc.roundedRect(126, y, right - 126, 15, 2, 2, 'F'); doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text('VALOR TOTAL', 131, y + 9); doc.setFontSize(12); doc.text(brl(quote.total), right - 4, y + 9, { align: 'right' })
    y += 28; doc.setTextColor(90, 96, 86); doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.text('CONDIÇÕES DO ORÇAMENTO', left, y); y += 7
    doc.setTextColor(47, 51, 43); doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
    const terms = [quote.valid_until ? `Validade: ${datePt(quote.valid_until)}` : '', quote.delivery_estimate ? `Prazo de entrega: ${quote.delivery_estimate}` : '', quote.payment_terms ? `Pagamento: ${quote.payment_terms}` : '', quote.notes ? `Observações: ${quote.notes}` : ''].filter(Boolean)
    terms.forEach(line => { const lines = doc.splitTextToSize(line, 168) as string[]; doc.text(lines, left, y); y += Math.max(6, lines.length * 5) })
    if (quote.attachments?.length) {
      y += 4; doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.text('ARQUIVOS ANEXADOS À PROPOSTA', left, y); y += 6
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
      quote.attachments.forEach(file => { if (y > 270) { doc.addPage(); y = 22 }; const lines = doc.splitTextToSize(file.name, 168) as string[]; doc.text(lines, left, y); y += Math.max(5, lines.length * 4) })
    }
    y += 6; doc.setDrawColor(222, 222, 214); doc.line(left, y, right, y); y += 8
    doc.setFontSize(8); doc.setTextColor(113, 117, 107); doc.text('Este orçamento é uma proposta comercial para análise e aprovação do cliente.', left, y)
    if (quote.signed_at && quote.signed_by && quote.signature_data) {
      if (y > 235) { doc.addPage(); y = 24 }
      y += 13; doc.setDrawColor(222, 222, 214); doc.line(left, y, right, y); y += 9
      doc.setTextColor(90, 96, 86); doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.text('ACEITE DIGITAL DO CLIENTE', left, y); y += 8
      doc.addImage(quote.signature_data, 'PNG', left, y, 52, 15); y += 20
      doc.setFont('helvetica', 'bold'); doc.setTextColor(42, 48, 41); doc.setFontSize(9); doc.text(quote.signed_by, left, y)
      doc.setFont('helvetica', 'normal'); doc.setTextColor(113, 117, 107); doc.setFontSize(8); doc.text(`Assinado em ${new Date(quote.signed_at).toLocaleString('pt-BR')}`, left, y + 5)
      if (quote.signed_document_hash) {
        const hashLines = doc.splitTextToSize(`Hash do orçamento assinado: ${quote.signed_document_hash}`, right - left) as string[]
        doc.text(hashLines, left, y + 11)
      }
    }
    doc.save(`${quote.signed_at ? 'projeto-assinado' : 'orcamento'}-${quote.number}.pdf`)
  }

  if (!authReady) return <div className="loading-screen"><LoaderCircle className="spin" size={24} /><span>Preparando sua oficina…</span></div>
  if (publicPath) return configured && publicToken ? <Suspense fallback={<RouteLoader />}><PublicQuotePage token={publicToken} /></Suspense> : <PublicUnavailable />
  if (!configured) return <SetupScreen />
  if (!session) return <AuthScreen mode={authMode} onSwitchMode={() => { setAuthError(''); setAuthMessage(''); setAuthMode(authMode === 'login' ? 'signup' : 'login') }} onSubmit={handleAuth} error={authError} message={authMessage} busy={authBusy} />

  const navItems: { id: Page; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'inicio', label: 'Visão geral', icon: LayoutDashboard },
    { id: 'orcamentos', label: 'Projetos', icon: ClipboardList },
    { id: 'contatos', label: 'Contatos', icon: Users },
    { id: 'produtos', label: 'Produtos', icon: Box },
  ]
  const pending = quotes.filter(quote => quote.status === 'pending').length
  const approvedTotal = quotes.filter(quote => quote.status === 'approved').reduce((sum, quote) => sum + quote.total, 0)

  return <div className={page === 'inicio' ? 'app-shell campus-shell' : 'app-shell'}>
    {mobileNav && <button className="mobile-scrim" aria-label="Fechar menu" onClick={() => setMobileNav(false)} />}
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
      <div className="brand"><span className="brand-mark"><Hammer size={19} strokeWidth={1.7} /></span><span className="brand-name">oficina<span className="brand-dot">.</span><small>GESTÃO DE MARCENARIA</small></span><button className="mobile-close icon-button" onClick={() => setMobileNav(false)} aria-label="Fechar menu"><X size={18} /></button></div>
      <div className="workspace-switch"><span className="workspace-avatar"><HardHat size={17} /></span><span className="workspace-copy"><b>{displayName}</b><small>Plano inicial</small></span><ChevronDown size={15} /></div>
      <div className="nav-caption">MENU PRINCIPAL</div>
      <nav className="side-nav" aria-label="Navegação principal">
      {navItems.map(item => <button key={item.id} className={`nav-item ${page === item.id ? 'active' : ''}`} onClick={() => { setPage(item.id); closeProjectModal(); setMobileNav(false) }}><item.icon size={18} strokeWidth={1.8} /><span>{item.label}</span>{item.id === 'orcamentos' && pending > 0 && <span className="nav-count">{pending}</span>}</button>)}
      </nav>
      <div className="sidebar-bottom"><div className="user-profile"><span className="user-avatar">{displayName.slice(0, 1).toUpperCase()}</span><span className="user-copy"><b>{displayName}</b><small>{session.user.email}</small></span><button className="icon-button" title="Sair da conta" onClick={signOut}><LogOut size={17} /></button></div></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="topbar-left"><button className="mobile-menu icon-button" onClick={() => setMobileNav(true)} aria-label="Abrir menu"><Menu size={20} /></button><div className="breadcrumb">Sua oficina <span>/</span> <b>{page === 'compartilhar' ? 'Compartilhar orçamento' : page === 'novo-projeto' ? 'Novo projeto' : navItems.find(item => item.id === page)?.label}</b></div></div><div className="topbar-actions"><span className="today-label">{new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</span><span className="top-avatar">{displayName.slice(0, 1).toUpperCase()}</span></div></header>
      {page === 'inicio' && <CampusDashboard name={displayName} clients={contacts.length} products={products.filter(product => product.is_active).length}
        projects={quotes.length} pending={pending} approved={quotes.filter(quote => quote.status === 'approved').length} approvedTotal={approvedTotal}
        loading={loading} onNewQuote={startProject} onNewContact={() => { setEditingContact(null); setShowContactForm(true) }}
        onOpen={sector => {
          setPage(sector === 'production' ? 'orcamentos' : sector === 'showroom' ? 'contatos' : 'produtos')
          window.scrollTo(0, 0)
        }}>
        <QuoteTable quotes={quotes.slice(0, 5)} loading={loading} onSelect={setSelectedQuote} onDownload={downloadQuote} />
      </CampusDashboard>}
      {page === 'contatos' && <ContactsPage contacts={filteredContacts} query={contactSearch} onQuery={setContactSearch} onAdd={() => { setEditingContact(null); setShowContactForm(true) }} onEdit={contact => { setEditingContact(contact); setShowContactForm(true) }} onDelete={deleteContact} />}
      {page === 'orcamentos' && <QuotesPage quotes={filteredQuotes} totalCount={quotes.length} pendingCount={pending} approvedCount={quotes.filter(quote => quote.status === 'approved').length} approvedTotal={approvedTotal} query={quoteSearch} onQuery={setQuoteSearch} filter={statusFilter} onFilter={setStatusFilter} onAdd={startProject} onSelect={setSelectedQuote} onDownload={downloadQuote} />}
      {page === 'produtos' && <Suspense fallback={<RouteLoader />}><ProductPage products={products} onSave={saveProduct} onArchive={archiveProduct} onReturnToProject={wizardPausedForCatalog ? () => { setPage('orcamentos'); setWizardPausedForCatalog(false); setShowProjectModal(true) } : undefined} /></Suspense>}
      {(showProjectModal || wizardPausedForCatalog) && <div hidden={!showProjectModal}><Suspense fallback={<RouteLoader />}><Modal title="Novo projeto" subtitle="Defina cliente, itens, arquivos e condições." onClose={closeProjectModal} wide className="project-wizard-modal"><ProjectWizard key={projectWizardInstance} contacts={contacts} products={products} onBack={closeProjectModal} onNewContact={() => { setEditingContact(null); setShowContactForm(true) }} onManageProducts={() => { setWizardPausedForCatalog(true); setShowProjectModal(false); setPage('produtos') }} onSave={saveQuote} /></Modal></Suspense></div>}
      {page === 'compartilhar' && shareQuote && <Suspense fallback={<RouteLoader />}><ShareQuotePage quote={shareQuote} onBack={() => { setPage('orcamentos'); setShareQuote(null) }} onEditContact={() => { const contact = contacts.find(item => item.id === shareQuote.contact_id); setEditingContact(contact ?? null); setShowContactForm(true) }} /></Suspense>}
    </main>
    {showContactForm && <ContactDialog contact={editingContact} onClose={() => { setShowContactForm(false); setEditingContact(null) }} onSave={saveContact} />}
    {selectedQuote && <QuoteDetail quote={selectedQuote} onClose={() => setSelectedQuote(null)} onDownload={downloadQuote} onUpdate={updateQuote} onShare={() => { setShareQuote(selectedQuote); setSelectedQuote(null); setPage('compartilhar') }} />}
    {toast && <div className="toast" role="status"><Check size={16} />{toast}</div>}
  </div>
}

function SetupScreen() {
  return <div className="setup-page"><div className="setup-card"><span className="brand-mark setup-mark"><Hammer size={20} /></span><p className="eyebrow">OFICINA · PRIMEIROS PASSOS</p><h1>Conecte sua oficina</h1><p>O dashboard usa Supabase Auth e banco de dados com políticas de acesso por conta. Configure o projeto para começar.</p><ol><li><span>1</span><div><b>Crie um projeto no Supabase</b><small>Copie a URL e a chave publishable do projeto.</small></div></li><li><span>2</span><div><b>Configure as variáveis locais</b><small>Duplique <code>.env.example</code> como <code>.env.local</code> e preencha os valores.</small></div></li><li><span>3</span><div><b>Crie as tabelas e políticas</b><small>Execute as migrações em <code>supabase/migrations</code> pela ordem do nome.</small></div></li><li><span>4</span><div><b>Configure os endpoints seguros</b><small>Publique as funções Edge e defina <code>QUOTE_CODE_HMAC_SECRET</code> no Supabase.</small></div></li></ol><div className="setup-note"><ShieldCheck size={17} /><span>Custos, códigos, arquivos e dados de assinatura ficam protegidos por conta.</span></div><code className="env-sample">VITE_SUPABASE_URL=…<br />VITE_SUPABASE_PUBLISHABLE_KEY=…</code></div></div>
}

function PublicUnavailable() {
  return <main className="public-state-page"><span className="public-state-icon error"><X size={24} /></span><h1>Esta proposta não está disponível</h1><p>Confira o link recebido ou fale com a marcenaria para solicitar um novo.</p></main>
}

function RouteLoader() {
  return <div className="route-loader"><LoaderCircle className="spin" size={20} /><span>Carregando…</span></div>
}

function AuthScreen({ mode, onSwitchMode, onSubmit, error, message, busy }: { mode: 'login' | 'signup'; onSwitchMode: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; error: string; message: string; busy: boolean }) {
  return <div className="auth-page"><div className="auth-intro"><div className="brand auth-brand"><span className="brand-mark"><Hammer size={19} /></span><span className="brand-name">oficina<span className="brand-dot">.</span><small>GESTÃO DE MARCENARIA</small></span></div><div className="intro-copy"><span className="eyebrow">MAIS TEMPO NO QUE IMPORTA</span><h1>Sua marcenaria,<br /><i>bem organizada.</i></h1><p>Contatos, orçamentos e propostas prontas para compartilhar. Tudo em um só lugar, só seu.</p><div className="intro-points"><span><Check size={15} /> Seus dados sempre privados</span><span><Check size={15} /> Orçamentos em PDF para enviar</span></div></div><div className="intro-footer">FEITO PARA QUEM TRANSFORMA MADEIRA EM HISTÓRIA</div></div><div className="auth-form-side"><div className="auth-form-wrap"><span className="auth-mark"><Hammer size={19} /></span><div className="auth-heading"><h2>{mode === 'login' ? 'Bem-vindo de volta' : 'Crie sua conta'}</h2><p>{mode === 'login' ? 'Entre para cuidar da sua oficina.' : 'Organize sua marcenaria em poucos passos.'}</p></div><form onSubmit={onSubmit} className="form-stack">{mode === 'signup' && <label>Nome da oficina<input name="name" autoComplete="organization" placeholder="Ex.: Marcenaria Horizonte" required minLength={2} /></label>}<label>E-mail<input name="email" type="email" autoComplete="email" placeholder="voce@exemplo.com" required /></label><label>Senha<input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="Mínimo de 6 caracteres" required minLength={6} /></label>{error && <div className="form-error" role="alert">{error}</div>}{message && <div className="form-success" role="status">{message}</div>}<button className="primary-button auth-submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : mode === 'login' ? 'Entrar na minha oficina' : 'Criar minha conta'}<ArrowRight size={16} /></button></form><p className="auth-switch">{mode === 'login' ? 'Ainda não tem conta?' : 'Já tem uma conta?'} <button onClick={onSwitchMode}>{mode === 'login' ? 'Criar conta' : 'Fazer login'}</button></p><div className="auth-privacy"><ShieldCheck size={16} /> Seus dados e os da sua oficina ficam protegidos.</div></div></div></div>
}

function StatCard({ icon, label, value, detail, tone }: { icon: ReactNode; label: string; value: string; detail: string; tone: string }) { return <div className="stat-card"><div className={`stat-icon ${tone}`}>{icon}</div><span className="stat-label">{label}</span><strong className={value.length > 9 ? 'stat-money' : ''}>{value}</strong><span className="stat-detail">{detail}</span></div> }

function ContactsPage({ contacts, query, onQuery, onAdd, onEdit, onDelete }: { contacts: Contact[]; query: string; onQuery: (value: string) => void; onAdd: () => void; onEdit: (contact: Contact) => void; onDelete: (contact: Contact) => void }) {
  return <div className="page-content"><div className="page-heading"><div><span className="eyebrow">RELACIONAMENTO</span><h1>Contatos</h1><p>Seus clientes, sempre por perto.</p></div><button className="primary-button" onClick={onAdd}><Plus size={17} /> Adicionar contato</button></div><div className="content-toolbar"><div className="search-box"><Search size={17} /><input value={query} onChange={event => onQuery(event.target.value)} placeholder="Buscar por nome, telefone ou e-mail" /></div><span className="result-count">{contacts.length} {contacts.length === 1 ? 'contato' : 'contatos'}</span></div>{contacts.length === 0 ? <EmptyState icon={<Users size={24} />} title={query ? 'Nenhum contato encontrado' : 'Sua lista começa aqui'} description={query ? 'Tente buscar por outro nome ou telefone.' : 'Cadastre seus clientes para criar projetos com mais facilidade.'} action={!query ? 'Adicionar contato' : undefined} onAction={onAdd} /> : <div className="contact-grid">{contacts.map(contact => <article className="contact-card" key={contact.id}><div className="contact-card-top"><span className="contact-avatar">{contact.name.slice(0, 1).toUpperCase()}</span><div className="contact-actions"><button className="icon-button" title="Editar contato" onClick={() => onEdit(contact)}><Pencil size={15} /></button><button className="icon-button contact-delete" title="Excluir contato" onClick={() => onDelete(contact)}><X size={16} /></button></div></div><h3>{contact.name}</h3><div className="contact-lines">{contact.phone ? <span><MessageCircle size={14} />WhatsApp · {formatWhatsApp(contact.phone)}</span> : null}{contact.email ? <span><Mail size={14} />{contact.email}</span> : null}{contact.address ? <span className="contact-address">{contact.address}</span> : null}{!contact.phone && !contact.email && !contact.address && <span className="muted">Sem dados adicionais</span>}</div><div className="contact-card-footer"><span>Desde {datePt(contact.created_at)}</span><span className="contact-status"><i /> CLIENTE</span></div></article>)}</div>}</div>
}

function QuotesPage({ quotes, totalCount, pendingCount, approvedCount, approvedTotal, query, onQuery, filter, onFilter, onAdd, onSelect, onDownload }: { quotes: Quote[]; totalCount: number; pendingCount: number; approvedCount: number; approvedTotal: number; query: string; onQuery: (value: string) => void; filter: StatusFilter; onFilter: (value: StatusFilter) => void; onAdd: () => void; onSelect: (quote: Quote) => void; onDownload: (quote: Quote) => void }) {
  const filters: StatusFilter[] = ['Todos', 'Pendente', 'Aprovado', 'Recusado']
  return <div className="page-content"><div className="page-heading"><div><span className="eyebrow">ACOMPANHAMENTO DA OFICINA</span><h1>Projetos</h1><p>Propostas, aprovações e próximos passos em um só lugar.</p></div><button className="primary-button" onClick={onAdd}><Plus size={17} /> Novo projeto</button></div><div className="stats-grid project-metrics"><StatCard icon={<ClipboardList size={18} />} label="Projetos" value={String(totalCount).padStart(2, '0')} detail="propostas criadas" tone="sage" /><StatCard icon={<Clock3 size={18} />} label="Aguardando cliente" value={String(pendingCount).padStart(2, '0')} detail="pendentes de resposta" tone="amber" /><StatCard icon={<Check size={18} />} label="Aprovados" value={String(approvedCount).padStart(2, '0')} detail="confirmados para executar" tone="blue" /><StatCard icon={<Wallet size={18} />} label="Valor aprovado" value={brl(approvedTotal)} detail="em projetos aprovados" tone="lilac" /></div><div className="quotes-toolbar"><div className="filter-tabs">{filters.map(item => <button key={item} className={filter === item ? 'selected' : ''} onClick={() => onFilter(item)}>{item}</button>)}</div><div className="search-box"><Search size={17} /><input value={query} onChange={event => onQuery(event.target.value)} placeholder="Buscar projeto ou cliente" /></div></div>{quotes.length > 0 ? <div className="table-card"><QuoteTable quotes={quotes} loading={false} onSelect={onSelect} onDownload={onDownload} /></div> : <EmptyState icon={<FileText size={24} />} title="Nenhum projeto por aqui" description={query || filter !== 'Todos' ? 'Altere a busca ou o filtro para ver outros resultados.' : 'Crie seu primeiro projeto para acompanhar cada etapa.'} action={!query && filter === 'Todos' ? 'Criar projeto' : undefined} onAction={onAdd} />}</div>
}

function QuoteTable({ quotes, loading, onSelect, onDownload }: { quotes: Quote[]; loading: boolean; onSelect: (quote: Quote) => void; onDownload: (quote: Quote) => void }) {
  if (loading && quotes.length === 0) return <div className="table-loading"><LoaderCircle className="spin" size={20} />Carregando orçamentos…</div>
  if (quotes.length === 0) return <div className="table-empty">Seus orçamentos aparecerão aqui.</div>
  return <>
    <div className="table-scroll quote-table-desktop"><table><thead><tr><th>ORÇAMENTO</th><th>CLIENTE</th><th>DATA</th><th>VALOR</th><th>STATUS</th><th aria-label="Ações" /></tr></thead><tbody>{quotes.map(quote => <tr className="quote-row-clickable" key={quote.id} onClick={() => onSelect(quote)}><td data-label="Orçamento"><button className="quote-number" onClick={() => onSelect(quote)}><span className="quote-file-icon"><FileText size={16} /></span><span><b>{quote.number}</b><small>{quote.title}</small></span></button></td><td data-label="Cliente"><span className="table-client"><i>{(quote.contacts?.name || 'C').slice(0, 1).toUpperCase()}</i>{quote.contacts?.name || 'Cliente'}</span></td><td data-label="Data">{datePt(quote.created_at)}</td><td data-label="Valor" className="table-value">{brl(quote.total)}</td><td data-label="Status"><StatusPill status={quote.status} /></td><td data-label="PDF"><button className="download-button" title="Baixar PDF" aria-label={`Baixar PDF do orçamento ${quote.number}`} onClick={event => { event.stopPropagation(); onDownload(quote) }}><ArrowDownToLine size={19} /></button></td></tr>)}</tbody></table></div>
    <div className="quote-list-mobile">{quotes.map(quote => { const statusLabel = quote.status === 'pending' ? 'Pendente' : quote.status === 'approved' ? 'Aprovado' : 'Recusado'; return <button className="quote-mobile-row" key={quote.id} onClick={() => onSelect(quote)} aria-label={`Abrir ${quote.number}, ${quote.title}, ${quote.contacts?.name || 'Cliente'}, status ${statusLabel}`}><span className={`quote-mobile-status ${quote.status}`} aria-hidden="true" /><span className="quote-mobile-main"><b>{quote.number}</b><small>{quote.title}</small><span className="quote-mobile-client">{quote.contacts?.name || 'Cliente'}</span></span><span className="quote-mobile-date">{datePt(quote.created_at)}</span></button> })}</div>
  </>
}

function StatusPill({ status }: { status: Quote['status'] }) { const labels = { pending: 'Pendente', approved: 'Aprovado', rejected: 'Recusado' }; return <span className={`status-pill ${status}`}><i />{labels[status]}</span> }
function EmptyState({ icon, title, description, action, onAction }: { icon: ReactNode; title: string; description: string; action?: string; onAction: () => void }) { return <div className="empty-state"><span className="empty-icon">{icon}</span><h3>{title}</h3><p>{description}</p>{action && <button className="primary-button" onClick={onAction}><Plus size={16} />{action}</button>}</div> }

function Modal({ title, subtitle, onClose, children, wide = false, className = '' }: { title: string; subtitle: string; onClose: () => void; children: ReactNode; wide?: boolean; className?: string }) { return <div className={`modal-backdrop ${className ? `${className}-backdrop` : ''}`} onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><section className={`modal-card ${wide ? 'modal-wide' : ''} ${className}`} role="dialog" aria-modal="true" aria-label={title}><div className="modal-header"><div><span className="eyebrow">OFICINA</span><h2>{title}</h2><p>{subtitle}</p></div><button className="icon-button modal-close" onClick={onClose} aria-label="Fechar"><X size={19} /></button></div>{children}</section></div> }

function ContactDialog({ contact, onClose, onSave }: { contact: Contact | null; onClose: () => void; onSave: (values: Omit<Contact, 'id' | 'created_at'>, id?: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); const data = new FormData(event.currentTarget); await onSave({ name: String(data.get('name')).trim(), phone: String(data.get('phone') || '').trim(), email: String(data.get('email') || '').trim(), address: String(data.get('address') || '').trim(), notes: String(data.get('notes') || '').trim() }, contact?.id); setBusy(false) }
  return <Modal title={contact ? 'Editar contato' : 'Novo contato'} subtitle={contact ? 'Atualize os dados do cliente.' : 'Guarde os dados do cliente para seus projetos.'} onClose={onClose}><form className="dialog-form" onSubmit={submit}><label>Nome do cliente <em>*</em><input name="name" defaultValue={contact?.name} placeholder="Ex.: Mariana Costa" required minLength={2} autoFocus /></label><div className="form-row"><label>WhatsApp<input name="phone" type="tel" defaultValue={contact?.phone} placeholder="(11) 99999-9999" /></label><label>E-mail<input name="email" type="email" defaultValue={contact?.email} placeholder="cliente@exemplo.com" /></label></div><label>Endereço<input name="address" defaultValue={contact?.address} placeholder="Rua, número, cidade" /></label><label>Observações<textarea name="notes" defaultValue={contact?.notes} rows={3} placeholder="Preferências, detalhes importantes…" /></label><div className="dialog-actions"><button className="secondary-button" type="button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : contact ? <Check size={16} /> : <Plus size={16} />}{contact ? 'Salvar contato' : 'Adicionar contato'}</button></div></form></Modal>
}

function QuoteDetail({ quote, onClose, onDownload, onShare, onUpdate }: { quote: Quote; onClose: () => void; onDownload: (quote: Quote) => void; onShare: () => void; onUpdate: (quote: Quote, changes: Pick<Quote, 'title' | 'status' | 'items' | 'cost_subtotal' | 'subtotal' | 'valid_until' | 'delivery_estimate' | 'payment_terms' | 'notes' | 'discount' | 'total'>) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [finalValue, setFinalValue] = useState(String(quote.total))
  const [quoteItems, setQuoteItems] = useState(quote.items)
  const [form, setForm] = useState({ title: quote.title, status: quote.status, valid_until: quote.valid_until ?? '', delivery_estimate: quote.delivery_estimate, payment_terms: quote.payment_terms, notes: quote.notes })
  const setField = <K extends keyof typeof form>(key: K, value: typeof form[K]) => setForm(current => ({ ...current, [key]: value }))
  const editedSubtotal = quoteItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const subtotal = Math.round(editedSubtotal * 100) / 100
    const costSubtotal = Math.round(quoteItems.reduce((sum, item) => sum + item.quantity * item.unitCost, 0) * 100) / 100
    const total = Math.max(0, Math.min(subtotal, Number(finalValue.replace(',', '.')) || 0))
    setSaving(true)
    const saved = await onUpdate(quote, { ...form, items: quoteItems, cost_subtotal: costSubtotal, subtotal, valid_until: form.valid_until || null, discount: Math.max(0, subtotal - total), total })
    setSaving(false)
    if (saved) { setFinalValue(String(total)); setEditing(false) }
  }
  return <Modal title={quote.number} subtitle={quote.title} onClose={onClose} wide><div className="quote-detail">
    <div className="detail-summary"><div><span className="detail-label">CLIENTE</span><b>{quote.contacts?.name || 'Cliente'}</b><small>{quote.contacts?.phone || quote.contacts?.email || 'Sem dados de contato'}</small></div><div><span className="detail-label">CRIADO EM</span><b>{datePt(quote.created_at)}</b><small>Validade {quote.valid_until ? datePt(quote.valid_until) : 'não definida'}</small></div><div><span className="detail-label">STATUS</span><StatusPill status={quote.status} /></div></div>
    {editing ? <form className="quote-config-form" onSubmit={submit}>
      <h3>Configurar orçamento</h3>
      <label>Nome do projeto<input value={form.title} onChange={event => setField('title', event.target.value)} /></label>
      <label>Status<select value={form.status} onChange={event => setField('status', event.target.value as Quote['status'])}><option value="pending">Pendente</option><option value="approved">Aprovado</option><option value="rejected">Recusado</option></select></label>
      <fieldset className="quote-config-items"><legend>Itens e quantidades</legend>{quoteItems.map((item, index) => <div className="quote-config-item" key={`${quote.id}-${index}`}><label>Item<input value={item.description} onChange={event => setQuoteItems(current => current.map((currentItem, itemIndex) => itemIndex === index ? { ...currentItem, description: event.target.value } : currentItem))} /></label><div className="quote-config-item-fields"><label>Quantidade<input type="number" min="0.01" step="0.01" value={item.quantity} onChange={event => setQuoteItems(current => current.map((currentItem, itemIndex) => itemIndex === index ? { ...currentItem, quantity: Math.max(0.01, Number(event.target.value) || 0) } : currentItem))} /></label><label>Valor unitário<input type="number" min="0" step="0.01" value={item.unitPrice} onChange={event => setQuoteItems(current => current.map((currentItem, itemIndex) => itemIndex === index ? { ...currentItem, unitPrice: Math.max(0, Number(event.target.value) || 0) } : currentItem))} /></label></div></div>)}</fieldset>
      <div className="quote-config-grid"><label>Validade<input type="date" value={form.valid_until} onChange={event => setField('valid_until', event.target.value)} /></label><label>Prazo de entrega<input value={form.delivery_estimate} onChange={event => setField('delivery_estimate', event.target.value)} placeholder="Ex.: 30 dias úteis" /></label></div>
      <label>Valor final<input type="number" min="0" max={editedSubtotal} step="0.01" value={finalValue} onChange={event => setFinalValue(event.target.value)} /><small>Preço sugerido atualizado: {brl(editedSubtotal)}. O valor final pode ser menor para aplicar desconto.</small></label>
      <label>Pagamento<input value={form.payment_terms} onChange={event => setField('payment_terms', event.target.value)} /></label>
      <label>Observações<textarea value={form.notes} onChange={event => setField('notes', event.target.value)} rows={3} /></label>
      <div className="quote-config-actions"><button type="button" className="secondary-button" onClick={() => setEditing(false)}>Cancelar</button><button className="primary-button" disabled={saving}>{saving ? 'Salvando…' : 'Salvar alterações'}</button></div>
    </form> : <>
      <div className="detail-items">{quote.items.map((item, index) => <div className="detail-item" key={`${item.description}-${index}`}><span><b>{item.description}</b><small>{item.quantity} {item.unit || 'un'} × {brl(item.unitPrice)}</small></span><strong>{brl(item.quantity * item.unitPrice)}</strong></div>)}</div><div className="detail-totals"><span>Preço sugerido <b>{brl(quote.subtotal)}</b></span>{quote.discount > 0 && <span>Desconto <b>− {brl(quote.discount)}</b></span>}<span className="grand-total">Valor final <b>{brl(quote.total)}</b></span></div>
      {quote.delivery_estimate && <div className="detail-notes"><b>Prazo de entrega</b><p>{quote.delivery_estimate}</p></div>}
      <QuoteAttachments attachments={quote.attachments ?? []} />{quote.notes && <div className="detail-notes"><b>Observações</b><p>{quote.notes}</p></div>}{quote.payment_terms && <div className="detail-notes"><b>Pagamento</b><p>{quote.payment_terms}</p></div>}{quote.signed_at && <div className="signed-note"><ShieldCheck size={16} /><span>Assinado digitalmente por <b>{quote.signed_by}</b> em {new Date(quote.signed_at).toLocaleString('pt-BR')}.</span></div>}
      <div className="detail-actions"><div>{quote.status === 'pending' && <button className="approve-button" onClick={onShare}><LockKeyhole size={15} /> Compartilhar com código</button>}<button className="secondary-button quote-edit-button" onClick={() => setEditing(true)}><Pencil size={15} /> Configurar orçamento</button></div><button className="primary-button" onClick={() => onDownload(quote)}><ArrowDownToLine size={16} /> {quote.signed_at ? 'Baixar contrato assinado' : 'Baixar proposta PDF'}</button></div>
    </>}
  </div></Modal>
}

function QuoteAttachments({ attachments }: { attachments: Quote['attachments'] }) {
  const [links, setLinks] = useState<{ name: string; url: string }[]>([])
  useEffect(() => {
    let active = true
    const client = supabase
    if (!client || attachments.length === 0) { setLinks([]); return }
    void Promise.all(attachments.map(async file => {
      const { data } = await client.storage.from('project-files').createSignedUrl(file.path, 300)
      return data?.signedUrl ? { name: file.name, url: data.signedUrl } : null
    })).then(results => { if (active) setLinks(results.filter((link): link is { name: string; url: string } => Boolean(link))) })
    return () => { active = false }
  }, [attachments])
  if (!attachments.length) return null
  return <section className="quote-attachments"><h3>Arquivos do projeto</h3><div className="quote-attachments-list">{attachments.map((file, index) => { const link = links.find(item => item.name === file.name); return link ? <a className="quote-attachment-link" href={link.url} target="_blank" rel="noreferrer" key={`${file.path}-${index}`}><FileText size={17} /><span>{file.name}</span><small>{Math.ceil(file.size / 1024)} KB</small><ArrowDownToLine size={16} /></a> : <div className="quote-attachment-link" key={`${file.path}-${index}`}><FileText size={17} /><span>{file.name}</span><small>Carregando…</small></div> })}</div></section>
}
