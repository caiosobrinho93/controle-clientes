import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import './readability-refresh.css'
import './theme-v2.css'

const ShowroomPage = React.lazy(() => import('./ShowroomPage'))
const showroom = /^\/showroom\/?$/.test(window.location.pathname)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {showroom
      ? <React.Suspense fallback={<main className="loading-screen" role="status">Carregando showroom…</main>}><ShowroomPage /></React.Suspense>
      : <App />}
  </React.StrictMode>,
)
