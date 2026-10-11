import { useEffect, useState } from 'react'
import { useRoute, go } from './lib/router'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/db'
import { StoreProvider, useStore } from './lib/store'
import { SyncProvider, useSync } from './lib/sync'
import { Icons, Progress } from './components/ui'
import Login from './views/Login'
import Today, { SessionRunner } from './views/Today'
import Repertoire, { LineDrill } from './views/Repertoire'
import Mistakes, { PuzzleSolver } from './views/Mistakes'
import Endgames, { EndgamePlay } from './views/Endgames'
import Games, { GameReview } from './views/Games'
import ProgressView from './views/Progress'
import SettingsView from './views/Settings'
import { lines, endgames } from './data'

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  if (session === undefined) return <div className="center-screen dim">Cargando…</div>
  if (!session) return <Login />
  return (
    <StoreProvider key={session.user.id}>
      <SyncProvider>
        <Shell />
      </SyncProvider>
    </StoreProvider>
  )
}

const NAV: { id: string; label: string; icon: keyof typeof Icons }[] = [
  { id: 'hoy', label: 'Hoy', icon: 'hoy' },
  { id: 'repertorio', label: 'Repertorio', icon: 'repertorio' },
  { id: 'errores', label: 'Mis errores', icon: 'errores' },
  { id: 'finales', label: 'Finales', icon: 'finales' },
  { id: 'partidas', label: 'Partidas', icon: 'partidas' },
  { id: 'progreso', label: 'Progreso', icon: 'progreso' },
  { id: 'ajustes', label: 'Ajustes', icon: 'ajustes' },
]

function Shell() {
  const { page, arg } = useRoute()
  const store = useStore()
  const sync = useSync()
  const due: Record<string, number> = {
    repertorio: lines.filter((l) => store.isDue(l.id)).length,
    errores: store.puzzles.filter((p) => store.isDue(p.id)).length,
  }

  let view
  if (store.loading) view = <p className="dim">Cargando tus datos…</p>
  else if (page === 'repertorio' && arg) {
    const l = lines.find((x) => x.id === arg)
    view = l ? <LineDrill key={l.id} line={l} onDone={() => go('repertorio')} /> : <Repertoire />
  } else if (page === 'repertorio') view = <Repertoire />
  else if (page === 'errores' && arg) {
    const p = store.puzzles.find((x) => x.id === arg)
    view = p ? <PuzzleSolver key={p.id} puzzle={p} onDone={() => go('errores')} /> : <Mistakes />
  } else if (page === 'errores') view = <Mistakes />
  else if (page === 'finales' && arg) {
    const e = endgames.find((x) => x.id === arg)
    view = e ? <EndgamePlay key={e.id} eg={e} onDone={() => go('finales')} /> : <Endgames />
  } else if (page === 'finales') view = <Endgames />
  else if (page === 'partidas' && arg) view = <GameReview key={arg} id={arg} />
  else if (page === 'partidas') view = <Games />
  else if (page === 'progreso') view = <ProgressView />
  else if (page === 'ajustes') view = <SettingsView />
  else if (page === 'sesion') view = <SessionRunner />
  else view = <Today />

  const navPage = page === 'sesion' ? 'hoy' : page
  return (
    <div className="app">
      <nav className="side-nav" aria-label="Secciones">
        <div className="brand"><span className="logo" />Ruta a 1000</div>
        {NAV.map((n) => (
          <button key={n.id} type="button" className="nav-btn" aria-current={navPage === n.id ? 'page' : undefined} onClick={() => go(n.id)}>
            {Icons[n.icon]}
            <span>{n.label}</span>
            {due[n.id] ? <span className="count">{due[n.id] > 99 ? '99+' : due[n.id]}</span> : null}
          </button>
        ))}
        <div className="nav-foot">{store.games.length} partidas analizadas</div>
      </nav>
      <main className="main">
        {store.error && (
          <div className="banner err" style={{ marginBottom: 14 }}>
            <span>{store.error}</span>
            <button type="button" className="btn sm" onClick={() => store.reload()}>Reintentar</button>
          </div>
        )}
        {view}
      </main>
      {(sync.running || sync.message || sync.error) && <SyncToast />}
    </div>
  )
}

function SyncToast() {
  const s = useSync()
  const [hidden, setHidden] = useState(false)
  useEffect(() => setHidden(false), [s.running, s.message, s.error])
  if (hidden) return null
  const pctGames = s.total ? (100 * (s.done + (s.plyTotal ? s.plyDone / s.plyTotal : 0))) / s.total : 0
  return (
    <div className="toast card stack" style={{ gap: 8, boxShadow: '0 8px 24px rgba(0,0,0,.45)' }} role="status">
      {s.running ? (
        <>
          <b>{s.total ? `Analizando partida ${Math.min(s.done + 1, s.total)} de ${s.total}` : 'Sincronizando…'}</b>
          <span className="dim" style={{ fontSize: 13 }}>{s.label}</span>
          <Progress value={pctGames} />
          <div className="row"><button type="button" className="btn sm" onClick={s.cancel}>Detener</button></div>
        </>
      ) : (
        <>
          <b style={{ color: s.error ? 'var(--red)' : 'var(--green)' }}>{s.error ?? s.message}</b>
          {s.error && s.message && <span className="dim">{s.message}</span>}
          <div className="row">
            {!s.error && <button type="button" className="btn sm primary" onClick={() => { setHidden(true); go('progreso') }}>Ver progreso</button>}
            <button type="button" className="btn sm ghost" onClick={() => setHidden(true)}>Cerrar</button>
          </div>
        </>
      )}
    </div>
  )
}
