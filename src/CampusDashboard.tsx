import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowRight, Box, ClipboardList, Focus, Maximize, Minimize, Minus, Plus, RotateCcw, SlidersHorizontal, Users, X } from 'lucide-react'
import type { Sector } from './CampusScene'
import './campus-dashboard.css'

const CampusScene = lazy(() => import('./CampusScene'))
const preview = import.meta.env.BASE_URL + 'campus/oficina.webp'
const motionQuery = '(prefers-reduced-motion: reduce)'
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

interface Props {
  name: string
  pending: number
  projects: number
  approved: number
  approvedTotal: number
  clients: number
  products: number
  loading: boolean
  onNewQuote: () => void
  onNewContact: () => void
  onOpen: (sector: Sector) => void
  children: ReactNode
}

export default function CampusDashboard(props: Props) {
  const workspace = useRef<HTMLDivElement>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [showTools, setShowTools] = useState(false)
  const [showData, setShowData] = useState(false)
  const toolsToggle = useRef<HTMLButtonElement>(null)
  const [walking, setWalking] = useState(false)
  const [room, setRoom] = useState('Pátio')
  const [reduced, setReduced] = useState(() => matchMedia(motionQuery).matches)
  const [moving, setMoving] = useState(true)
  const [enabled, setEnabled] = useState(() => !matchMedia(motionQuery).matches)
  const [ready, setReady] = useState(false)
  const [failure, setFailure] = useState<'unavailable' | 'slow' | null>(null)
  const [sector, setSector] = useState<Sector | null>(null)
  const [zoom, setZoom] = useState(1)
  const [reset, setReset] = useState(0)
  useEffect(() => {
    const media = matchMedia(motionQuery)
    const change = () => setReduced(media.matches)
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])
  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement === workspace.current)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])

  const count = (value: number) => props.loading ? '—' : value
  const modules = {
    production: { label: 'Produção', route: 'Projetos', value: count(props.projects), unit: 'projetos registrados', detail: `${count(props.pending)} aguardando resposta` },
    showroom: { label: 'Showroom', route: 'Contatos', value: count(props.clients), unit: 'contatos cadastrados', detail: 'Consulte os dados dos seus clientes.' },
    storage: { label: 'Depósito', route: 'Produtos', value: count(props.products), unit: 'produtos ativos no catálogo', detail: 'Consulte os materiais usados em orçamentos.' },
  }
  const active = sector ? modules[sector] : null

  function select(next: Sector | null) {
    setShowTools(false)
    setShowData(false)
    setSector(next)
    setZoom(1)
    setReset(value => value + 1)
  }
  function toggleScene() {
    setWalking(false)
    setReady(false)
    setFailure(null)
    setEnabled(value => !value)
  }
  async function createProject() {
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined)
    props.onNewQuote()
  }
  async function toggleFullscreen() {
    setShowData(false)
    try {
      if (document.fullscreenElement === workspace.current) await document.exitFullscreen()
      else await workspace.current?.requestFullscreen()
    } catch {
      // The map already fills the workspace when the browser blocks fullscreen.
    }
  }

  return <div className="page-content campus-dashboard">
    <div className="campus-workspace" ref={workspace}>
      <section className="campus-map" aria-labelledby="campus-map-heading">
        <header className="campus-heading">
          <div><h1 id="campus-map-heading">Central da oficina</h1><p>{props.name} · Sede conceitual</p></div>
          <div className="campus-heading-actions">
            <button ref={toolsToggle} type="button" className="campus-control" aria-label="Opções da oficina"
              aria-expanded={showTools} aria-controls="campus-tools" onClick={() => {
                setShowData(false)
                setShowTools(value => !value)
              }}><SlidersHorizontal size={18} /> Opções</button>
            {showTools && <section id="campus-tools" className="campus-tools" aria-label="Opções da oficina"
              onKeyDown={event => { if (event.key === 'Escape') { setShowTools(false); toolsToggle.current?.focus() } }}>
              <div className="campus-tools-row">
                {!fullscreen && !walking && <button type="button" className="campus-control"
                  aria-expanded={showData} aria-controls="campus-office-data" onClick={() => {
                    if (sector) select(null)
                    setShowTools(false)
                    setShowData(!showData)
                  }}><ClipboardList size={17} /> Resumo</button>}
                <button type="button" className="campus-control campus-toggle" aria-pressed={enabled} onClick={toggleScene}>{enabled ? 'Desativar 3D' : 'Ativar 3D'}</button>
                {document.fullscreenEnabled && <button type="button" className="campus-control" aria-label={fullscreen ? 'Sair da tela cheia' : 'Tela cheia'} title={fullscreen ? 'Sair da tela cheia' : 'Tela cheia'} onClick={() => { setShowTools(false); void toggleFullscreen() }}>
                  {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
                </button>}
              </div>
              {!walking && <>
                <span className="campus-tools-label">Setores da sede</span>
                <div className="campus-sectors" aria-label="Setores da sede">
                  {(Object.keys(modules) as Sector[]).map(key =>
                    <button key={key} type="button" className="campus-control" aria-pressed={sector === key} onClick={() => select(key)}>
                      {modules[key].label}
                    </button>)}
                </div>
                {enabled && ready && <div className="campus-camera" aria-label="Controles da câmera">
                  <button type="button" className="campus-control" aria-label="Afastar câmera" disabled={zoom <= .8} onClick={() => setZoom(value => Math.max(.8, value - .15))}><Minus size={17} /></button>
                  <button type="button" className="campus-control" aria-label="Aproximar câmera" disabled={zoom >= 1.45} onClick={() => setZoom(value => Math.min(1.45, value + .15))}><Plus size={17} /></button>
                  <button type="button" className="campus-control" title="Visão geral" aria-label="Restaurar visão geral" onClick={() => select(null)}><RotateCcw size={16} /></button>
                  {!reduced && <button type="button" className="campus-control" onClick={() => setMoving(value => !value)}>{moving ? 'Pausar movimento' : 'Ativar movimento'}</button>}
                </div>}
              </>}
            </section>}
            <button type="button" className="primary-button" onClick={createProject}><Plus size={18} /> Novo projeto</button>
          </div>
          <section id="campus-office-data" hidden={!showData} className="campus-data" aria-labelledby="campus-data-heading"
            onKeyDown={event => {
              if (event.key === 'Escape') { setShowData(false); toolsToggle.current?.focus() }
            }}>
            <header className="campus-data-heading">
              <h2 id="campus-data-heading">Resumo da oficina</h2>
              <button type="button" className="campus-control" aria-label="Fechar resumo" onClick={() => {
                setShowData(false)
                toolsToggle.current?.focus()
              }}><X size={18} /></button>
            </header>
            <dl className="campus-metrics">
              <div><dt>Projetos</dt><dd>{count(props.projects)}</dd></div>
              <div><dt>Aguardando resposta</dt><dd>{count(props.pending)}</dd></div>
              <div><dt>Aprovados</dt><dd>{count(props.approved)}</dd></div>
              <div><dt>Valor aprovado</dt><dd>{props.loading ? '—' : money.format(props.approvedTotal)}</dd></div>
            </dl>
            <div className="campus-quick-actions" aria-label="Atalhos da oficina">
              <a href={import.meta.env.BASE_URL + 'showroom'} target="_blank" rel="noreferrer" className="campus-control"><Box size={17} /> Showroom digital</a>
              <button type="button" className="campus-control" onClick={props.onNewContact}><Users size={18} /> Cadastrar cliente</button>
            </div>
            <section className="campus-recent" aria-labelledby="campus-recent-heading">
              <header><h2 id="campus-recent-heading">Projetos recentes</h2><button type="button" className="campus-context-link" onClick={() => props.onOpen('production')}>Ver todos <ArrowRight size={16} /></button></header>
              {props.children}
            </section>
          </section>
        </header>
        <div className="campus-view" data-ready={ready}>
          <img src={preview} alt="Vista noturna da sede conceitual, com pavilhões, janelas iluminadas e pátio" width="1120" height="720" />
          {enabled && <Suspense fallback={null}><CampusScene selected={sector} reset={reset} zoom={zoom}
            moving={moving && !reduced} walking={walking} onRoom={setRoom} onLeaveWalk={() => setWalking(false)}
            onSelect={select} onReady={() => setReady(true)}
            onFailure={reason => { setFailure(reason); setEnabled(false); setReady(false); setWalking(false) }} /></Suspense>}
          {walking && <div className="campus-room" role="status">{room}</div>}
          <div className="campus-view-status" role="status">{enabled && !ready && 'Carregando maquete…'}
            {failure === 'unavailable' && 'Vista estática · renderização 3D indisponível'}
            {failure === 'slow' && 'Vista estática · desempenho do dispositivo'}
          </div>
        </div>
        <div className="campus-map-footer">
          {enabled && ready && <button type="button" className="campus-control campus-explore" aria-pressed={walking} onClick={() => { select(null); setWalking(value => !value) }}>
              {walking ? 'Voltar à vista aérea' : 'Explorar a pé'}
            </button>}
        </div>
      </section>
      {active && sector && <aside className="campus-context" aria-label="Setor selecionado">
        <section className="campus-inspector" aria-live="polite">
          <span className="campus-kicker"><Focus size={15} /> {active.route}</span>
          <h2>{active.label}</h2>
            <div className="campus-context-value"><strong>{active.value}</strong><span>{active.unit}</span></div>
            <p>{active.detail}</p>
            <button type="button" className="campus-context-link" onClick={() => props.onOpen(sector)}>Abrir {active.route} <ArrowRight size={17} /></button>
            <button type="button" className="campus-back" onClick={() => select(null)}>Voltar à visão geral</button>
        </section>
      </aside>}
    </div>
  </div>
}
