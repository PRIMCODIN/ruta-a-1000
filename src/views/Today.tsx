import { useMemo, useState } from 'react'
import { Coach, Icons } from '../components/ui'
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
      <div className="page" style={{ maxWidth: 720 }}>
        <div className="stack tight">
          <h1>Empecemos con tus partidas</h1>
          <p className="lead">Ya analicé tus 500 partidas de Chess.com (abril a octubre). Impórtalas con un clic: crean tus 120 primeros ejercicios y la línea base para medir tu progreso.</p>
        </div>
        <div className="row">
          <button type="button" className="btn primary big" disabled={sync.running} onClick={() => sync.importSeed()}>{sync.running ? 'Importando…' : 'Importar mis 500 partidas'}</button>
        </div>
        <p className="meta">Después, «Actualizar desde Chess.com» en Partidas trae y analiza solo las nuevas.</p>
      </div>
    )
  }

  const KIND = {
    line: { icon: Icons.repertorio, label: 'Repertorio' },
    pz: { icon: Icons.errores, label: 'Tu error' },
    eg: { icon: Icons.finales, label: 'Final' },
  } as const
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{plan.length ? 'Tu sesión de hoy' : 'Lo tienes todo al día'}</h1>
          <p className="lead">{plan.length ? `${plan.length} ejercicios, unos 15 minutos. Primero lo que fallaste, después lo nuevo.` : 'No hay nada pendiente. Sincroniza tus partidas nuevas para generar ejercicios.'}</p>
          <p className="meta">Racha de {st} día{st === 1 ? '' : 's'} · {today.length} ejercicio{today.length === 1 ? '' : 's'} hecho{today.length === 1 ? '' : 's'} hoy</p>
        </div>
        {plan.length > 0 && (
          <button type="button" className="btn primary big" onClick={() => { activeSession = plan; go('sesion') }}>Empezar sesión</button>
        )}
      </div>
      <div className="today">
        {plan.length > 0 && (
          <section className="card stack" aria-labelledby="toca">
            <h2 id="toca">Qué toca</h2>
            <ol className="rows plan">
              {plan.map((it, k) => (
                <li key={k}>
                  <span className="plan-ic" aria-hidden="true">{KIND[it.t].icon}</span>
                  <span className="plan-t">
                    <span className="meta">{KIND[it.t].label}</span>
                    <span>{it.t === 'line' ? it.x.name : it.t === 'pz' ? MOTIF_LABEL[it.x.motif] : it.x.title}</span>
                  </span>
                  <span className="meta">{it.t === 'line' ? 'Apertura' : it.t === 'pz' ? PHASE_LABEL[it.x.phase] : 'Final'}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
        <div className="stack">
          <section className="card stack tight">
            <h2>Antes de cada jugada</h2>
            <ol className="routine">
              <li>¿Qué amenaza su última jugada?</li>
              <li>¿La casilla a la que voy está atacada? ¿Qué dejo sin defensa?</li>
              <li>Jaques, capturas y amenazas: primero las suyas, después las mías.</li>
            </ol>
          </section>
          <section className="card stack">
            <div className="stack tight">
              <h2>Tus partidas</h2>
              {newSinceSync.length ? (
                <div className="row" aria-label="Resultados de las últimas partidas analizadas">
                  <span className="sec muted">Últimas analizadas</span>
                  {newSinceSync.map((g) => <span key={g.id} className={`res ${g.result}`}>{g.result === 'W' ? 'G' : g.result === 'L' ? 'P' : '½'}</span>)}
                </div>
              ) : <p className="sec muted">Sincroniza Chess.com para ver tu evolución desde que entrenas.</p>}
            </div>
            <div className="row">
              <button type="button" className="btn" disabled={sync.running} onClick={() => sync.syncChesscom()}>{Icons.refresh}Actualizar desde Chess.com</button>
              <button type="button" className="btn ghost" onClick={() => go('progreso')}>Ver progreso</button>
            </div>
          </section>
        </div>
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
    <div className="stack tight">
      <div className="row between">
        <span className="meta">Sesión: ejercicio {Math.min(k + 1, items.length)} de {items.length}</span>
        <button type="button" className="btn ghost sm" onClick={() => go('hoy')}>Terminar</button>
      </div>
      <div className="steps">{items.map((_, n) => <span key={n} className={n < k ? 'done' : n === k ? 'now' : ''} />)}</div>
    </div>
  )
  const it = items[k]
  if (!it) {
    return (
      <div className="page" style={{ maxWidth: 640 }}>
        <h1>Sesión terminada</h1>
        <Coach kind="good" title={`${okCount} de ${items.length} a la primera`}>Lo que hayas fallado vuelve mañana. Lo acertado se espacia cada vez más (1, 3, 7, 16 y 35 días).</Coach>
        <div className="row"><button type="button" className="btn primary" onClick={() => go('hoy')}>Volver a Hoy</button><button type="button" className="btn" onClick={() => go('progreso')}>Ver progreso</button></div>
      </div>
    )
  }
  if (it.t === 'line') return <LineDrill key={`l${k}`} line={it.x} onDone={next} header={bar} />
  if (it.t === 'pz') return <PuzzleSolver key={`p${k}`} puzzle={it.x} onDone={next} header={bar} />
  return <EndgamePlay key={`e${k}`} eg={it.x} onDone={next} header={bar} />
}
