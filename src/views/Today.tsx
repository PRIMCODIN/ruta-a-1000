import { useMemo, useState } from 'react'
import { Coach } from '../components/ui'
import { MOTIF_LABEL } from '../analysis/core'
import { PHASE_LABEL } from '../lib/chess-utils'
import { streak, useStore, type StoredPuzzle } from '../lib/store'
import { useSync } from '../lib/sync'
import { go } from '../lib/router'
import { LineDrill } from './Repertoire'
import { PuzzleSolver } from './Mistakes'
import { EndgamePlay } from './Endgames'
import { lines, endgames, type Endgame, type Line } from '../data'
const GROUP_ORDER = ['Blancas · Cuando te disputan el centro', 'Blancas · Tu sistema', 'Negras · Contra 1.e4', 'Negras · Contra 1.d4']

type Item = { t: 'line'; x: Line } | { t: 'pz'; x: StoredPuzzle } | { t: 'eg'; x: Endgame }

function useSessionPlan(): Item[] {
  const store = useStore()
  return useMemo(() => {
    const seen = (id: string) => (store.review(id) ? 0 : 1) // primero lo que ya falló
    const L = lines.filter((l) => store.isDue(l.id)).sort((a, b) => seen(a.id) - seen(b.id) || GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group)).slice(0, 2)
    const pz = store.puzzles.filter((p) => store.isDue(p.id)).sort((a, b) => seen(a.id) - seen(b.id) || b.date.localeCompare(a.date))
    const byPh = (ph: string, n: number) => pz.filter((p) => p.phase === ph).slice(0, n)
    const P = [...byPh('medio', 3), ...byPh('apertura', 1), ...byPh('final', 1)]
    const E = endgames.filter((e) => store.isDue(e.id)).sort((a, b) => seen(a.id) - seen(b.id)).slice(0, 1)
    const items: Item[] = []
    if (L[0]) items.push({ t: 'line', x: L[0] })
    P.slice(0, 3).forEach((x) => items.push({ t: 'pz', x }))
    if (L[1]) items.push({ t: 'line', x: L[1] })
    P.slice(3).forEach((x) => items.push({ t: 'pz', x }))
    if (E[0]) items.push({ t: 'eg', x: E[0] })
    return items
  }, [store.puzzles, store.reviews]) // eslint-disable-line react-hooks/exhaustive-deps
}

let activeSession: Item[] | null = null

export default function Today() {
  const store = useStore()
  const sync = useSync()
  const plan = useSessionPlan()
  const st = streak(store.attempts)
  const today = store.attempts.filter((a) => new Date(a.at).toDateString() === new Date().toDateString())
  const newSinceSync = store.games.filter((g) => g.source !== 'seed').slice(-5)

  if (!store.games.length) {
    return (
      <div className="stack" style={{ maxWidth: 720 }}>
        <div className="eyebrow">Bienvenido</div>
        <h1>Empecemos con tus partidas</h1>
        <Coach title="Primer paso">
          Ya analicé tus 500 partidas de Chess.com (abril–octubre). Impórtalas con un clic: crean tus 120 primeros ejercicios y la línea base para medir tu progreso.
        </Coach>
        <div className="row">
          <button type="button" className="btn primary big" disabled={sync.running} onClick={() => sync.importSeed()}>{sync.running ? 'Importando…' : 'Importar mis 500 partidas'}</button>
        </div>
        <p className="dim">Después, el botón «Actualizar desde Chess.com» de Partidas trae y analiza solo las nuevas.</p>
      </div>
    )
  }

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="page-head">
        <div>
          <div className="eyebrow">Hoy · racha de {st} día{st === 1 ? '' : 's'} · {today.length} ejercicio{today.length === 1 ? '' : 's'} hechos</div>
          <h1>{plan.length ? `Tu sesión de hoy: ${plan.length} ejercicios` : 'Lo tienes todo al día'}</h1>
          <p className="muted" style={{ margin: 0 }}>Unos 15 minutos. Primero lo que fallaste, después lo nuevo.</p>
        </div>
        {plan.length > 0 && (
          <button type="button" className="btn primary big" onClick={() => { activeSession = plan; go('sesion') }}>Empezar</button>
        )}
      </div>
      <div className="grid-2">
        <section className="card stack" style={{ gap: 8 }}>
          <h2>Qué toca</h2>
          {!plan.length && <p className="muted">No hay nada pendiente. Sincroniza tus partidas nuevas para generar ejercicios.</p>}
          <div className="list">
            {plan.map((it, k) => (
              <div key={k} className="item" style={{ cursor: 'default' }}>
                <span style={{ fontWeight: 600 }}>
                  {it.t === 'line' ? `Repertorio · ${it.x.name}` : it.t === 'pz' ? `Tu error · ${MOTIF_LABEL[it.x.motif]}` : `Final · ${it.x.title}`}
                </span>
                <span className="pill">{it.t === 'line' ? 'Apertura' : it.t === 'pz' ? PHASE_LABEL[it.x.phase] : 'Final'}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="stack">
          <Coach title="Antes de cada jugada">
            <ol style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              <li>¿Qué amenaza su última jugada?</li>
              <li>¿La casilla a la que voy está atacada? ¿Qué dejo sin defensa?</li>
              <li>Jaques, capturas y amenazas: primero las suyas, después las mías.</li>
            </ol>
          </Coach>
          <div className="card stack" style={{ gap: 8 }}>
            <h2>Tus partidas</h2>
            <p className="muted" style={{ margin: 0 }}>
              {newSinceSync.length ? `Últimas analizadas: ${newSinceSync.map((g) => (g.result === 'W' ? 'G' : g.result === 'L' ? 'P' : '½')).join(' · ')}.` : 'Sincroniza Chess.com para ver tu evolución desde que entrenas.'}
            </p>
            <div className="row">
              <button type="button" className="btn" disabled={sync.running} onClick={() => sync.syncChesscom()}>Actualizar desde Chess.com</button>
              <button type="button" className="btn ghost" onClick={() => go('progreso')}>Ver progreso</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

export function SessionRunner() {
  const fresh = useSessionPlan()
  const [items] = useState<Item[]>(() => activeSession ?? fresh)
  const [k, setK] = useState(0)
  const [okCount, setOk] = useState(0)
  const next = (ok: boolean) => {
    if (ok) setOk((n) => n + 1)
    setK((x) => x + 1)
    window.scrollTo({ top: 0 })
  }
  const bar = (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="eyebrow">Sesión · ejercicio {Math.min(k + 1, items.length)} de {items.length}</span>
        <button type="button" className="btn ghost sm" onClick={() => go('hoy')}>Terminar</button>
      </div>
      <div className="steps">{items.map((_, n) => <span key={n} className={n < k ? 'done' : n === k ? 'now' : ''} />)}</div>
    </div>
  )
  const it = items[k]
  if (!it) {
    return (
      <div className="stack" style={{ maxWidth: 640 }}>
        <h1>Sesión terminada</h1>
        <Coach kind="good" title={`${okCount} de ${items.length} a la primera`}>Lo que hayas fallado vuelve mañana. Lo acertado se espacia cada vez más (1, 3, 7, 16 y 35 días).</Coach>
        <div className="row"><button type="button" className="btn primary" onClick={() => go('hoy')}>Volver</button><button type="button" className="btn" onClick={() => go('progreso')}>Ver progreso</button></div>
      </div>
    )
  }
  if (it.t === 'line') return <LineDrill key={`l${k}`} line={it.x} onDone={next} header={bar} />
  if (it.t === 'pz') return <PuzzleSolver key={`p${k}`} puzzle={it.x} onDone={next} header={bar} />
  return <EndgamePlay key={`e${k}`} eg={it.x} onDone={next} header={bar} />
}
