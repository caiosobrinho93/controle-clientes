import { useMemo, useState, type FormEvent } from 'react'
import { Archive, ArrowLeft, Box, Pencil, Plus, Search, X } from 'lucide-react'
import type { Product } from './lib/supabase'

type ProductInput = Pick<Product, 'name' | 'unit' | 'cost_price'>
const brl = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0)

export default function ProductPage({ products, onSave, onArchive, onReturnToProject }: {
  products: Product[]
  onSave: (input: ProductInput, id?: string) => Promise<boolean>
  onArchive: (product: Product) => void
  onReturnToProject?: () => void
}) {
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Product | null | undefined>(undefined)
  const visible = useMemo(() => products.filter(product => `${product.name} ${product.unit}`.toLowerCase().includes(query.toLowerCase())), [products, query])

  return <div className="page-content">
    <div className="page-heading"><div>{onReturnToProject && <button className="wizard-back catalog-return" onClick={onReturnToProject}><ArrowLeft size={15} /> Voltar ao projeto</button>}<span className="eyebrow">CUSTOS DA SUA OFICINA</span><h1>Produtos</h1><p>Cadastre materiais, serviços e seus custos atuais.</p></div><button className="primary-button" onClick={() => setEditing(null)}><Plus size={17} /> Novo produto</button></div>
    <div className="catalog-summary"><div className="catalog-mark"><Box size={19} /></div><div><b>{products.filter(product => product.is_active).length} produtos ativos</b><span>O custo cadastrado fica visível apenas para sua conta e é usado no cálculo dos projetos.</span></div><span className="catalog-private">PRIVADO</span></div>
    <div className="content-toolbar"><div className="search-box"><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar produto ou serviço" /></div><span className="result-count">{visible.length} itens</span></div>
    {visible.length ? <div className="catalog-table-wrap"><table className="catalog-table"><thead><tr><th>PRODUTO / SERVIÇO</th><th>UNIDADE</th><th>CUSTO UNITÁRIO</th><th>SITUAÇÃO</th><th /></tr></thead><tbody>{visible.map(product => <tr key={product.id}><td><span className="catalog-product"><i><Box size={16} /></i><b>{product.name}</b></span></td><td>{product.unit}</td><td className="catalog-price">{brl(product.cost_price)}</td><td><span className={`catalog-state ${product.is_active ? 'active' : ''}`}><i />{product.is_active ? 'Ativo' : 'Arquivado'}</span></td><td><div className="catalog-actions"><button className="icon-button" title="Editar produto" onClick={() => setEditing(product)}><Pencil size={15} /></button>{product.is_active && <button className="icon-button archive-button" title="Arquivar produto" onClick={() => onArchive(product)}><Archive size={15} /></button>}</div></td></tr>)}</tbody></table></div> : <div className="empty-state"><span className="empty-icon"><Box size={24} /></span><h3>{query ? 'Nenhum produto encontrado' : 'Seu catálogo começa aqui'}</h3><p>{query ? 'Tente outro termo.' : 'Cadastre o custo de materiais e serviços para agilizar os próximos projetos.'}</p>{!query && <button className="primary-button" onClick={() => setEditing(null)}><Plus size={16} /> Cadastrar produto</button>}</div>}
    {editing !== undefined && <ProductDialog product={editing} onClose={() => setEditing(undefined)} onSave={async (input) => { const saved = await onSave(input, editing?.id); if (saved) setEditing(undefined); return saved }} />}
  </div>
}

function ProductDialog({ product, onClose, onSave }: { product: Product | null; onClose: () => void; onSave: (input: ProductInput) => Promise<boolean> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setError('')
    const saved = await onSave({ name: String(data.get('name')).trim(), unit: String(data.get('unit')), cost_price: Number(data.get('cost_price')) })
    if (!saved) setError('Não foi possível salvar. Verifique sua conexão e tente novamente.')
    setBusy(false)
  }
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><section className="modal-card product-dialog" role="dialog" aria-modal="true" aria-labelledby="product-dialog-title"><div className="modal-header"><div><span className="eyebrow">CATÁLOGO DA OFICINA</span><h2 id="product-dialog-title">{product ? 'Editar produto' : 'Novo produto'}</h2><p>Informe o custo de compra ou execução.</p></div><button className="icon-button modal-close" onClick={onClose} aria-label="Fechar"><X size={19} /></button></div><form className="dialog-form" onSubmit={submit}><label>Nome <em>*</em><input name="name" defaultValue={product?.name} placeholder="Ex.: MDF Carvalho 18 mm" required minLength={2} autoFocus /></label><div className="form-row"><label>Unidade<select name="unit" defaultValue={product?.unit || 'un'}><option value="un">Unidade (un)</option><option value="m">Metro (m)</option><option value="m²">Metro quadrado (m²)</option><option value="kg">Quilograma (kg)</option><option value="l">Litro (L)</option><option value="serviço">Serviço</option></select></label><label>Custo unitário (R$) <em>*</em><input name="cost_price" type="number" min="0" step="0.01" defaultValue={product?.cost_price ?? ''} placeholder="0,00" required /></label></div>{error && <p className="wizard-error" role="alert">{error}</p>}<div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy}>{busy ? 'Salvando…' : product ? 'Salvar alterações' : 'Salvar produto'}</button></div></form></section></div>
}
