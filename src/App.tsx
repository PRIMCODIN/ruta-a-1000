import { useEffect, useRef, useState } from 'react'
import { useRoute, go } from './lib/router'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/db'
import { StoreProvider, useStore } from './lib/store'
import { SyncProvider, useSync } from './lib/sync'
import { Icons, Logo, Progress } from './components/ui'
import Login from './views/Login'
import Today, { SessionRunner } from './views/Today'
import Repertoire, { LineDrill } from './views/Repertoire'
import Mistakes, { PuzzleSolver } from './views/Mistakes'
import Endgames, { EndgamePlay } from './views/Endgames'
import Games from './views/Games'
import { GameReview } from './views/Review'
import ProgressView from './views/Progress'
import SettingsView from './views/Settings'
import { lines, endgames } from './data'
import Openings, { FAMILIES, MyOpeningExplorer, OpeningFamily, hotToLine, myTree, varToLine } from './views/Openings'
import { getSide } from './components/SideSwitch'
import { getQueue, nextInQueue, setQueue } from './lib/queue'

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  if (session === undefined) return <div className="center-screen" aria-busy="true" />
  if (!session) return <Login />
  return (
    <StoreProvider key={session.user.id}>
      <SyncProvider>
        <Shell />
      </SyncProvider>
    </StoreProvider>
  )
}

const NAV: { id: string; label: string; short?: string; icon: keyof typeof Icons; tab?: boolean }[] = [
  { id: 'hoy', label: 'Hoy', icon: 'hoy', tab: true },
  { id: 'repertorio', label: 'Repertorio', icon: 'repertorio', tab: true },
  { id: 'aperturas', label: 'Aperturas', icon: 'aperturas', tab: true },
  { id: 'errores', label: 'Mis errores', short: 'Errores', icon: 'errores', tab: true },
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

  /** Al terminar un ejercicio, pasa al siguiente de la lista de la que vienes. */
  const after = (kind: string, current: string, toPath: (id: string) => string, back: string, prefer?: (id: string) => boolean) => () => {
    const n = nextInQueue(kind, current, prefer)
    go(n ? toPath(n) : back)
  }
  const dueOf = (id: string) => store.isDue(id)

  let view
  if (store.loading) view = <PageSkeleton />
  else if (page === 'repertorio' && arg) {
    const l = lines.find((x) => x.id === arg)
    view = l ? <LineDrill key={l.id} line={l} onDone={after('rep', l.id, (id) => `repertorio/${id}`, 'repertorio', dueOf)} onExit={() => go('repertorio')} /> : <Repertoire />
  } else if (page === 'repertorio') view = <Repertoire />
  else if (page === 'errores' && arg) {
    const p = store.puzzles.find((x) => x.id === arg)
    if (p && !getQueue('err').includes(p.id)) setQueue('err', store.puzzles.filter((x) => store.isDue(x.id)).sort((a, b) => b.date.localeCompare(a.date)).map((x) => x.id))
    view = p ? <PuzzleSolver key={p.id} puzzle={p} onDone={after('err', p.id, (id) => `errores/${id}`, 'errores', dueOf)} /> : <Mistakes />
  } else if (page === 'errores') view = <Mistakes />
  else if (page === 'finales' && arg) {
    const e = endgames.find((x) => x.id === arg)
    if (e && !getQueue('fin').includes(e.id)) setQueue('fin', endgames.map((x) => x.id))
    view = e ? <EndgamePlay key={e.id} eg={e} onDone={after('fin', e.id, (id) => `finales/${id}`, 'finales', dueOf)} onExit={() => go('finales')} /> : <Endgames />
  } else if (page === 'finales') view = <Endgames />
  else if (page === 'aperturas' && arg === 'mia') view = <MyOpeningExplorer />
  else if (page === 'aperturas' && arg?.startsWith('mia/')) {
    const item = arg.slice(4)
    const [side, key] = [item.slice(0, 1) as 'w' | 'b', item.slice(2)]
    const h = myTree(store.games, side).hot.find((x) => x.key === key)
    view = h ? <LineDrill key={item} line={hotToLine(h, side)} onDone={after('mia', item, (id) => `aperturas/mia/${id}`, 'aperturas')} onExit={() => go('aperturas')} /> : <Openings />
  } else if (page === 'aperturas' && arg) {
    const [famId, varId] = arg.split('/')
    const fam = FAMILIES.find((f) => f.id === famId)
    const v = fam?.vars.find((x) => x.id === varId)
    if (fam && v) view = <LineDrill key={v.id} line={varToLine(fam, v, getSide())} onDone={after('op', `${fam.id}|${v.id}`, (id) => `aperturas/${id.replace('|', '/')}`, `aperturas/${fam.id}`, (id) => dueOf(id.split('|')[1]))} onExit={() => go(`aperturas/${fam.id}`)} />
    else view = fam ? <OpeningFamily fam={fam} /> : <Openings />
  } else if (page === 'aperturas') view = <Openings />
  else if (page === 'partidas' && arg) view = <GameReview key={arg} id={arg} />
  else if (page === 'partidas') view = <Games />
  else if (page === 'progreso') view = <ProgressView />
  else if (page === 'ajustes') view = <SettingsView />
  else if (page === 'sesion') view = <SessionRunner />
  else view = <Today />

  const navPage = page === 'sesion' ? 'hoy' : page
  const count = (id: string) => (due[id] ? <span className="count">{due[id] > 99 ? '99+' : due[id]}</span> : null)
  return (
    <div className="app">
      <a className="skip btn" href="#contenido" onClick={(e) => { e.preventDefault(); document.getElementById('contenido')?.focus() }}>Saltar al contenido</a>
      <nav className="side-nav" aria-label="Secciones">
        <div className="brand"><Logo />Ruta a 1000</div>
        {NAV.map((n) => (
          <button key={n.id} type="button" className="nav-btn" aria-current={navPage === n.id ? 'page' : undefined} onClick={() => go(n.id)}>
            {Icons[n.icon]}
            <span>{n.label}</span>
            {count(n.id)}
          </button>
        ))}
        <div className="nav-foot">{store.games.length} partidas</div>
      </nav>
      <main className="main" id="contenido" tabIndex={-1}>
        {store.error && (
          <div className="banner err" style={{ marginBottom: 16 }}>
            <span>{store.error}</span>
            <button type="button" className="btn sm" onClick={() => store.reload()}>Reintentar</button>
          </div>
        )}
        {view}
      </main>
      <TabBar page={navPage} count={count} />
      {(sync.running || sync.message || sync.error) && <SyncToast />}
    </div>
  )
}

/** Móvil: cuatro pestañas fijas y «Más» con el resto, en una hoja que se cierra con Esc. */
function TabBar({ page, count }: { page: string; count: (id: string) => JSX.Element | null }) {
  const [open, setOpen] = useState(false)
  const moreBtn = useRef<HTMLButtonElement>(null)
  const sheet = useRef<HTMLDivElement>(null)
  const extra = NAV.filter((n) => !n.tab)
  const inExtra = extra.some((n) => n.id === page)
  useEffect(() => setOpen(false), [page])
  useEffect(() => {
    if (!open) return
    sheet.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); moreBtn.current?.focus() }
      if (e.key === 'Tab' && sheet.current) {
        const b = [...sheet.current.querySelectorAll<HTMLButtonElement>('button')]
        if (e.shiftKey && document.activeElement === b[0]) { e.preventDefault(); b[b.length - 1].focus() }
        else if (!e.shiftKey && document.activeElement === b[b.length - 1]) { e.preventDefault(); b[0].focus() }
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [open])
  return (
    <>
      <div className={`scrim${open ? ' open' : ''}`} onClick={() => setOpen(false)} />
      <div ref={sheet} className={`sheet${open ? ' open' : ''}`} role="dialog" aria-modal="true" aria-label="Más secciones" hidden={!open}>
        {extra.map((n) => (
          <button key={n.id} type="button" className="nav-btn" aria-current={page === n.id ? 'page' : undefined} onClick={() => go(n.id)}>
            {Icons[n.icon]}<span>{n.label}</span>
          </button>
        ))}
      </div>
      <nav className="tabbar" aria-label="Secciones">
        {NAV.filter((n) => n.tab).map((n) => (
          <button key={n.id} type="button" className="tab" aria-current={page === n.id ? 'page' : undefined} onClick={() => go(n.id)}>
            {Icons[n.icon]}<span>{n.short ?? n.label}</span>{count(n.id)}
          </button>
        ))}
        <button ref={moreBtn} type="button" className="tab" aria-current={inExtra ? 'page' : undefined} aria-expanded={open} onClick={() => setOpen(!open)}>
          {Icons.mas}<span>{inExtra ? NAV.find((n) => n.id === page)!.label : 'Más'}</span>
        </button>
      </nav>
    </>
  )
}

function SyncToast() {
  const s = useSync()
  const [hidden, setHidden] = useState(false)
  useEffect(() => setHidden(false), [s.running, s.message, s.error])
  if (hidden) return null
  const pctGames = s.total ? (100 * (s.done + (s.plyTotal ? s.plyDone / s.plyTotal : 0))) / s.total : 0
  return (
    <div className="toast card stack tight" role="status">
      {s.running ? (
        <>
          <b>{s.total ? `Analizando partida ${Math.min(s.done + 1, s.total)} de ${s.total}` : 'Sincronizando…'}</b>
          <span className="meta">{s.label}</span>
          <Progress value={pctGames} />
          <div className="row"><button type="button" className="btn sm" onClick={s.cancel}>Detener</button></div>
        </>
      ) : (
        <>
          <b style={{ color: s.error ? 'var(--bad)' : 'var(--ink)', fontWeight: 600 }}>{s.error ?? s.message}</b>
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

/** Esqueleto mientras llegan los datos: la forma de una página, sin spinner. */
function PageSkeleton() {
  return (
    <div className="page" aria-busy="true" aria-label="Cargando tus datos">
      <div className="stack tight"><span className="sk" style={{ width: 280, height: 32 }} /><span className="sk" style={{ width: '50%', height: 16 }} /></div>
      <div className="grid-2"><span className="sk" style={{ height: 240 }} /><span className="sk" style={{ height: 240 }} /></div>
    </div>
  )
}
