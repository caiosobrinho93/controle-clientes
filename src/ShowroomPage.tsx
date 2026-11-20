import { lazy, Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, Box, DoorOpen, Hammer } from 'lucide-react'
import { supabase } from './lib/supabase'
import type { Exhibit } from './ShowroomRoom'
import './showroom.css'

const ShowroomViewer = lazy(() => import('./ShowroomViewer'))
const ShowroomRoom = lazy(() => import('./ShowroomRoom'))
const categories = ['Puxadores', 'Montagens', 'Móveis'] as const
type Category = typeof categories[number]
const pieces = [
  { id: 'barra-grafite', category: 'Puxadores', title: 'Barra grafite', description: 'Pega externa com acabamento escuro. Dá contraste às frentes de laca e facilita a abertura.' },
  { id: 'perfil-latao', category: 'Puxadores', title: 'Perfil em latão', description: 'Pega integrada à borda da frente. Mantém o desenho mais contínuo e deixa a ferragem discreta.' },
  { id: 'porta-embutida', category: 'Montagens', title: 'Porta embutida', description: 'A porta fica dentro do vão, com as laterais da estrutura aparentes.' },
  { id: 'porta-sobreposta', category: 'Montagens', title: 'Porta sobreposta', description: 'A porta cobre parte da estrutura e cria uma frente visualmente mais uniforme.' },
  { id: 'buffet-ripado', category: 'Móveis', title: 'Buffet ripado', description: 'Buffet baixo com frentes texturizadas, puxadores metálicos e tampo amadeirado.' },
  { id: 'mesa-escritorio', category: 'Móveis', title: 'Mesa de escritório', description: 'Tampo de madeira, estrutura metálica e uma gaveta suspensa sob o tampo.' },
] satisfies { id: string; category: Category; title: string; description: string; layout?: 'wide' | 'floor' }[]
const assets = import.meta.env.BASE_URL + 'showroom/'
type Access = { title: string; expiresAt: string; pieces: Exhibit[] }

export default function ShowroomPage() {
  const [failed, setFailed] = useState(false)
  const showFallback = useCallback(() => setFailed(true), [])
  const [filter, setFilter] = useState<Category | 'Tudo'>('Tudo')
  const [preview, setPreview] = useState<string | null>(null)
  const [door, setDoor] = useState(() => /^#minha-sala(?:\/|$)/.test(window.location.hash))
  const [code, setCode] = useState('')
  const [access, setAccess] = useState<Access | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [privateFailed, setPrivateFailed] = useState(false)
  const attempt = useRef(0)
  const openDoor = useCallback(() => { setError(''); setDoor(true) }, [])
  const failPrivate = useCallback(() => setPrivateFailed(true), [])
  function leaveRoom() {
    setAccess(null)
    setCode('')
    setDoor(true)
    setPrivateFailed(false)
  }
  useEffect(() => {
    if (!access) return
    const timer = window.setTimeout(() => {
      setAccess(null)
      setPrivateFailed(false)
      setDoor(true)
      setError('Sua sessão na sala terminou. Digite o código novamente.')
    }, Math.max(0, Date.parse(access.expiresAt) - Date.now()))
    return () => window.clearTimeout(timer)
  }, [access])
  useEffect(() => {
    const reset = (event: PageTransitionEvent) => {
      if (event.persisted) { setAccess(null); setCode(''); setDoor(/^#minha-sala(?:\/|$)/.test(window.location.hash)) }
    }
    window.addEventListener('pageshow', reset)
    return () => window.removeEventListener('pageshow', reset)
  }, [])
  async function openRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalized = code.replace(/[\s-]/g, '').toUpperCase()
    const token = window.location.hash.match(/^#minha-sala\/([A-Za-z0-9_-]{43})$/)?.[1]
    if (!token && /^[A-Z]{4}$/.test(normalized)) { setError('Abra o link da sua sala no orçamento para usar o código de quatro letras.'); return }
    if (token ? !/^[A-Z]{4}$/.test(normalized) : !/^[A-F0-9]{24}$/.test(normalized)) { setError('Confira o código da sala enviado junto com o orçamento.'); return }
    if (!supabase) { setError('O acesso à sala está indisponível.'); return }
    const request = ++attempt.current
    setBusy(true)
    setError('')
    const { data, error: invokeError } = await supabase.functions.invoke('open-showroom-room', { body: { code: normalized, ...(token ? { token } : {}) } })
    if (request !== attempt.current) return
    setBusy(false)
    if (invokeError || !data || !Array.isArray(data.models) || !data.models.length || !Number.isFinite(Date.parse(data.expiresAt))) {
      const status = invokeError && 'context' in invokeError ? (invokeError.context as Response | undefined)?.status : undefined
      setError(status === 404 ? 'Código inválido ou expirado.' : 'Não foi possível abrir a sala agora. Tente novamente.')
      return
    }
    setAccess({
      title: data.title, expiresAt: data.expiresAt,
      pieces: data.models.map((model: { name: string; url: string }, index: number) => ({
        id: `modelo-${index}`, title: model.name, assetUrl: model.url, category: 'Seu projeto',
        description: 'Modelo 3D selecionado para este orçamento.',
      })),
    })
    setCode('')
    setPrivateFailed(false)
    setDoor(false)
  }
  if (door) return <main className="showroom-private-entry">
    <form onSubmit={openRoom} className="showroom-private-card">
      <DoorOpen size={30} aria-hidden="true" />
      <h1>Minha sala</h1>
      <p>Digite o código da sala enviado junto com o orçamento.</p>
      <label htmlFor="showroom-room-code">Código da sala</label>
      <input id="showroom-room-code" value={code} onChange={event => setCode(event.target.value)} autoCapitalize="characters"
        maxLength={40} autoComplete="off" spellCheck={false} required autoFocus />
      {error && <p role="alert">{error}</p>}
      <button type="submit" className="primary-button" disabled={busy}>{busy ? 'Abrindo…' : 'Abrir minha sala'}</button>
      <button type="button" className="secondary-button" onClick={() => {
        attempt.current++; setBusy(false); setDoor(false); setCode(''); setError('')
        if (/^#minha-sala(?:\/|$)/.test(window.location.hash)) history.replaceState(null, '', window.location.pathname + window.location.search)
      }}><ArrowLeft size={16} /> Voltar ao showroom</button>
    </form>
  </main>
  if (access && privateFailed) return <main className="showroom-private-entry">
    <section className="showroom-private-card">
      <h1>{access.title}</h1><p role="alert">A visualização 3D está indisponível neste dispositivo.</p>
      <ul>{access.pieces.map(piece => <li key={piece.id}>{piece.title}</li>)}</ul>
      <button type="button" className="secondary-button" onClick={leaveRoom}>Sair da sala</button>
    </section>
  </main>
  if (access) return <main className="showroom-room">
    <header className="showroom-room-heading">
      <span className="showroom-room-mark"><DoorOpen size={22} /></span>
      <div><h1>{access.title}</h1><p>Minha sala</p></div>
      <button type="button" className="showroom-room-door" onClick={leaveRoom}>Sair da sala</button>
    </header>
    <Suspense fallback={<div className="showroom-room-status" role="status">Preparando sua sala…</div>}>
      <ShowroomRoom key="private" pieces={access.pieces} assets={assets} onFailure={failPrivate} />
    </Suspense>
  </main>
  const visible = pieces.filter(piece => filter === 'Tudo' || piece.category === filter)
  if (!failed) return <main className="showroom-room">
    <header className="showroom-room-heading">
      <span className="showroom-room-mark"><Hammer size={22} /></span>
      <div><h1>Showroom digital</h1><p>Projetos e peças em exposição</p></div>
      <button type="button" className="showroom-room-door" onClick={openDoor}><DoorOpen size={17} /> Minha sala</button>
    </header>
    <Suspense fallback={<div className="showroom-room-status" role="status">Preparando a sala 3D…</div>}>
      <ShowroomRoom pieces={pieces} assets={assets} onFailure={showFallback} onDoor={openDoor} />
    </Suspense>
  </main>

  return <main className="showroom-page">
    <header className="showroom-brand"><span><Hammer size={17} /></span> oficina.
      <button type="button" className="showroom-room-door" onClick={openDoor}><DoorOpen size={17} /> Minha sala</button>
    </header>
    <div className="showroom-content">
      <section className="showroom-intro" aria-labelledby="showroom-title">
        <div><span className="showroom-eyebrow">Inspiração para o seu projeto</span><h1 id="showroom-title">Showroom digital</h1>
          <p role="status">A sala 3D está indisponível neste dispositivo. Veja aqui as peças expostas.</p>
        </div>
      </section>
      <section id="showroom-catalog" aria-labelledby="showroom-catalog-title">
        <div className="showroom-catalog-heading"><h2 id="showroom-catalog-title">Peças em exposição</h2>
          <p>Conheça projetos e exemplos de acabamento.</p></div>
        <div className="showroom-filters" aria-label="Categorias">
          {(['Tudo', ...categories] as const).map(item => <button type="button" key={item} aria-pressed={filter === item}
            onClick={() => { setFilter(item); setPreview(null) }}>{item}</button>)}
        </div>
        <div className="showroom-grid">
          {visible.map(piece => <article key={piece.id} className="showroom-piece">
            <div className="showroom-media">
              <img src={assets + piece.id + '.webp'} alt={piece.title} width="640" height="440" loading="lazy" />
              {preview === piece.id && <Suspense fallback={<span className="showroom-loading" role="status">Carregando visualizador…</span>}>
                <ShowroomViewer asset={assets + piece.id + '.glb'} title={piece.title} />
              </Suspense>}
            </div>
            <div className="showroom-piece-copy">
              <span className="showroom-eyebrow">{piece.category}</span><h3>{piece.title}</h3><p>{piece.description}</p>
              <button type="button" aria-pressed={preview === piece.id} onClick={() => setPreview(preview === piece.id ? null : piece.id)}>
                <Box size={17} /> {preview === piece.id ? 'Voltar à imagem' : 'Explorar em 3D'}
              </button>
              {preview === piece.id && <small>Arraste o modelo para girar.</small>}
            </div>
          </article>)}
        </div>
      </section>
    </div>
  </main>
}
