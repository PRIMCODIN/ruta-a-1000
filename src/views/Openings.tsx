import { useMemo, useState } from 'react'
import { Chess } from 'chess.js'
import Board from '../board/Board'
import { Coach, Progress } from '../components/ui'
import { Status } from './Repertoire'
import { ArrowLeft } from '@phosphor-icons/react'
import { SideSwitch, getSide, useSide } from '../components/SideSwitch'
import { es, START_FEN, tryMove } from '../lib/chess-utils'
import { useStore } from '../lib/store'
import { go } from '../lib/router'
import { setQueue } from '../lib/queue'
import type { Line } from '../data'
import type { GameLite } from '../analysis/aggregate'
import OPENINGS from '../data/openings.json'

export type OpVar = { id: string; name: string; eco: string; book: number; moves: string[] }
export type Family = { id: string; side: 'w' | 'b'; name: string; desc: string; root: string[]; vars: OpVar[] }
export const FAMILIES = OPENINGS as unknown as Family[]

const fenAfter = (moves: string[]) => {
  const g = new Chess()
  let last: [string, string] | null = null
  for (const m of moves) {
    const r = tryMove(g, m)
    if (!r) break
    last = [r.from, r.to]
  }
  return { fen: g.fen(), last }
}
const numbered = (moves: string[], from = 0) =>
  moves.map((m, i) => ((i + from) % 2 === 0 ? `${(i + from) / 2 + 1}.` : (i === 0 ? `${Math.floor((i + from) / 2) + 1}...` : '')) + es(m)).join(' ')

/** Convierte una variante del libro en una línea de entrenamiento. */
export function varToLine(f: Family, v: OpVar, side: 'w' | 'b'): Line {
  const notes: Record<string, string> = {}
  if (v.book < v.moves.length) notes[String(v.book)] = 'Fin de la teoría con nombre. Desde aquí, la continuación que recomienda el motor.'
  notes[String(v.moves.length - 1)] = `Final de la línea: ${v.name}.`
  return { id: v.id, group: f.name, side, name: v.name, moves: v.moves, intro: f.desc, outro: `${f.name}: ${v.name}.`, notes }
}

/* ------------------------------------------------------------------ */
/* Mi apertura: árbol de tus partidas y posiciones donde más fallas      */

type Node = { n: number; w: number; d: number; l: number }
export type HotSpot = {
  key: string // jugadas hasta la posición, separadas por espacios
  path: string[]
  reached: number
  failed: number
  loss: number
  played: string // tu jugada más habitual en el error (SAN inglesa)
  playedCount: number
  best: string // SAN inglesa
  bestUci: string
}

export function myTree(games: GameLite[], side: 'w' | 'b') {
  const mine = games.filter((g) => g.color === side && g.stats?.open)
  const nodes = new Map<string, Node>()
  const errs = new Map<string, { n: number; loss: number; played: Map<string, number>; best: Map<string, { san: string; uci: string; n: number }> }>()
  for (const g of mine) {
    const path = g.stats!.open.path
    for (let k = 0; k <= path.length; k++) {
      const key = path.slice(0, k).join(' ')
      const nd = nodes.get(key) ?? { n: 0, w: 0, d: 0, l: 0 }
      nd.n++
      if (g.result === 'W') nd.w++
      else if (g.result === 'D') nd.d++
      else nd.l++
      nodes.set(key, nd)
    }
    for (const e of g.stats!.open.errs) {
      const key = path.slice(0, e.i).join(' ')
      const x = errs.get(key) ?? { n: 0, loss: 0, played: new Map(), best: new Map() }
      x.n++
      x.loss += e.loss
      x.played.set(e.san, (x.played.get(e.san) ?? 0) + 1)
      const b = x.best.get(e.bestSan) ?? { san: e.bestSan, uci: e.best, n: 0 }
      b.n++
      x.best.set(e.bestSan, b)
      errs.set(key, x)
    }
  }
  const hot: HotSpot[] = []
  for (const [key, x] of errs) {
    const reached = nodes.get(key)?.n ?? x.n
    if (x.n < 2) continue
    const played = [...x.played.entries()].sort((a, b) => b[1] - a[1])[0]
    const best = [...x.best.values()].sort((a, b) => b.n - a.n)[0]
    hot.push({ key, path: key ? key.split(' ') : [], reached, failed: x.n, loss: x.loss, played: played[0], playedCount: played[1], best: best.san, bestUci: best.uci })
  }
  hot.sort((a, b) => b.loss - a.loss)
  return { games: mine, nodes, hot }
}

export function hotToLine(h: HotSpot, side: 'w' | 'b'): Line {
  const i = h.path.length
  return {
    id: `mia:${side}:${h.key}`,
    group: 'Mi apertura',
    side,
    name: `Corregir ${es(h.played)} → ${es(h.best)}`,
    moves: [...h.path, h.best],
    intro: `Reproduce tu línea habitual hasta la posición donde sueles fallar (llegaste ${h.reached} veces y fallaste ${h.failed}).`,
    outro: `Aquí jugabas ${es(h.played)}. Lo correcto es ${es(h.best)}.`,
    notes: { [String(i)]: `En tus partidas jugaste ${es(h.played)} ${h.playedCount} ${h.playedCount === 1 ? 'vez' : 'veces'} en esta posición. Mejor ${es(h.best)}.` },
  }
}

const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0)

function WDL({ nd }: { nd: Node }) {
  return (
    <div className="wdl" title={`${nd.w} ganadas · ${nd.d} tablas · ${nd.l} perdidas`}>
      <i className="w" style={{ width: `${pct(nd.w, nd.n)}%` }} />
      <i className="d" style={{ width: `${pct(nd.d, nd.n)}%` }} />
      <i className="l" style={{ width: `${pct(nd.l, nd.n)}%` }} />
    </div>
  )
}

/* ------------------------------------------------------------------ */

export default function Openings() {
  const store = useStore()
  const [side, setSide] = useSide()
  const fams = FAMILIES.filter((f) => f.side === side)
  const { games, nodes, hot } = useMemo(() => myTree(store.games, side), [store.games, side])
  const root = nodes.get('')
  // línea principal: la jugada más frecuente en cada paso
  const main: string[] = []
  for (let k = 0; k < 8; k++) {
    const pre = main.join(' ')
    let best: [string, number] | null = null
    for (const [key, nd] of nodes) {
      const parts = key ? key.split(' ') : []
      if (parts.length === k + 1 && parts.slice(0, k).join(' ') === pre && (!best || nd.n > best[1])) best = [parts[k], nd.n]
    }
    if (!best) break
    main.push(best[0])
  }
  const mainPos = fenAfter(main)
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Aperturas</h1>
          <p className="lead">«Mi apertura» sale de tus partidas y te lleva a las posiciones donde más fallas. Debajo, las aperturas más jugadas con sus variantes principales.</p>
        </div>
        <SideSwitch side={side} onChange={setSide} />
      </div>

      <section className="card hero-card" aria-labelledby="mia">
        <Board fen={mainPos.fen} orientation={side} mini lastMove={mainPos.last} />
        <div className="stack">
          <div className="stack tight">
            <span className="meta">Mi apertura con {side === 'w' ? 'blancas' : 'negras'}</span>
            <h2 id="mia" className="mono hero-line">{main.length ? numbered(main) : 'Aún sin datos'}</h2>
            <p className="sec muted">
              {games.length} partidas{root ? `, ${pct(root.w, root.n)}% ganadas` : ''}. {hot.length} posiciones donde fallas al menos dos veces.
            </p>
          </div>
          {root && (
            <div className="stack tight" style={{ maxWidth: 360 }}>
              <WDL nd={root} />
              <span className="meta num">{root.w} ganadas · {root.d} tablas · {root.l} perdidas</span>
            </div>
          )}
          <div className="row">
            <button type="button" className="btn primary" disabled={!hot.length} onClick={() => {
              const ids = hot.slice(0, 12).map((h) => h.key)
              setQueue('mia', ids.map((k) => `${side}|${k}`))
              go(`aperturas/mia/${side}|${ids[0]}`)
            }}>Corregir mis fallos ({Math.min(12, hot.length)})</button>
            <button type="button" className="btn" onClick={() => go(`aperturas/mia`)}>Explorar mi árbol</button>
          </div>
          {!games.length && <span className="meta">Si acabas de actualizar la app, espera a que termine «Actualizando tus análisis».</span>}
        </div>
      </section>

      <section className="stack" aria-labelledby="libro">
        <h2 id="libro">Aperturas del libro</h2>
        <div className="fam-list">
          {fams.map((f) => {
            const done = f.vars.filter((v) => (store.review(v.id)?.box ?? 0) >= 2).length
            const due = f.vars.filter((v) => store.isDue(v.id)).length
            const pos = fenAfter(f.root.length ? f.root : f.vars[0].moves.slice(0, 2))
            return (
              <button key={f.id} type="button" className="fam-card" onClick={() => go(`aperturas/${f.id}`)}>
                <Board fen={pos.fen} orientation={side} mini lastMove={pos.last} />
                <div className="body">
                  <h3>{f.name}</h3>
                  <span className="mono meta">{numbered(f.root.length ? f.root : f.vars[0].moves.slice(0, 2))}</span>
                  <p>{f.desc}</p>
                  <div className="row between" style={{ marginTop: 'auto' }}>
                    <span className="meta">{f.vars.length} variantes · {done} dominadas</span>
                    {due > 0 && <span className="tag new">{due} pendientes</span>}
                  </div>
                  <Progress value={(100 * done) / f.vars.length} />
                </div>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}

export function OpeningFamily({ fam }: { fam: Family }) {
  const store = useStore()
  const side = getSide()
  const due = fam.vars.filter((v) => store.isDue(v.id))
  const start = (ids: string[]) => {
    setQueue('op', ids.map((id) => `${fam.id}|${id}`))
    go(`aperturas/${fam.id}/${ids[0]}`)
  }
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <button type="button" className="back" onClick={() => go('aperturas')}><ArrowLeft size={16} />Aperturas</button>
          <h1>{fam.name}</h1>
          <p className="lead">{fam.desc} Juegas con {side === 'w' ? 'blancas' : 'negras'}.</p>
        </div>
        <div className="row">
          <button type="button" className="btn primary" disabled={!due.length} onClick={() => start(due.map((v) => v.id))}>Entrenar {due.length} pendientes</button>
          <button type="button" className="btn" onClick={() => start(fam.vars.map((v) => v.id))}>Todas las variantes</button>
        </div>
      </div>
      <div className="lcards">
        {fam.vars.map((v) => {
          const pos = fenAfter(v.moves)
          return (
            <button key={v.id} type="button" className="thumb" onClick={() => start([v.id, ...fam.vars.filter((x) => x.id !== v.id).map((x) => x.id)])}>
              <Board fen={pos.fen} orientation={side} mini lastMove={pos.last} />
              <div className="info">
                <span className="title">{v.name}</span>
                <span className="mono meta">{v.eco} · {numbered(v.moves.slice(fam.root.length, fam.root.length + 6), fam.root.length)}…</span>
                <div className="foot">
                  <Status id={v.id} />
                  <span className="meta num">{v.moves.length} jugadas</span>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function MyOpeningExplorer() {
  const store = useStore()
  const [side, setSide] = useSide()
  const [path, setPath] = useState<string[]>([])
  const { nodes, hot } = useMemo(() => myTree(store.games, side), [store.games, side])
  const pos = fenAfter(path)
  const pre = path.join(' ')
  const next: { san: string; nd: Node }[] = []
  for (const [key, nd] of nodes) {
    const parts = key ? key.split(' ') : []
    if (parts.length === path.length + 1 && parts.slice(0, path.length).join(' ') === pre) next.push({ san: parts[path.length], nd })
  }
  next.sort((a, b) => b.nd.n - a.nd.n)
  const here = hot.find((h) => h.key === pre)
  const myTurn = (path.length % 2 === 0) === (side === 'w')
  const arrows = here ? (() => {
    const g = new Chess(pos.fen)
    const b = tryMove(new Chess(pos.fen), here.best)
    const p = tryMove(g, here.played)
    return [...(p ? [{ from: p.from, to: p.to, color: 'red' as const }] : []), ...(b ? [{ from: b.from, to: b.to, color: 'green' as const }] : [])]
  })() : []
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <button type="button" className="back" onClick={() => go('aperturas')}><ArrowLeft size={16} />Aperturas</button>
          <h1>Mi árbol de aperturas</h1>
          <p className="lead">Cada jugada con cuántas veces la has visto y cómo te fue. En rojo, donde sueles fallar.</p>
        </div>
        <SideSwitch side={side} onChange={(s) => { setSide(s); setPath([]) }} />
      </div>
      <div className="train">
        <div>
          <Board fen={path.length ? pos.fen : START_FEN} orientation={side} lastMove={pos.last} arrows={arrows} />
          <nav className="crumbs" aria-label="Jugadas hasta esta posición">
            <button type="button" onClick={() => setPath([])}>Inicio</button>
            {path.map((m, i) => <button key={i} type="button" onClick={() => setPath(path.slice(0, i + 1))}>{i % 2 === 0 ? `${i / 2 + 1}.` : ''}{es(m)}</button>)}
          </nav>
        </div>
        <div className="side">
          {here ? (
            <Coach kind="bad" title={`Aquí fallas: ${here.failed} de ${here.reached} veces`}>
              Sueles jugar <span className="mv">{es(here.played)}</span> (flecha roja). Mejor <span className="mv">{es(here.best)}</span> (flecha verde).
              <div className="row" style={{ marginTop: 8 }}>
                <button type="button" className="btn sm primary" onClick={() => { setQueue('mia', [`${side}|${here.key}`]); go(`aperturas/mia/${side}|${here.key}`) }}>Corregir esta posición</button>
              </div>
            </Coach>
          ) : (
            <Coach title={myTurn ? 'Te toca a ti' : 'Le toca al rival'}>{next.length ? 'Pulsa una jugada para seguir por esa rama.' : 'No tienes más partidas por esta rama.'}</Coach>
          )}
          {next.length > 0 && (
            <div className="card pad-s">
              <div className="xm-head meta"><span>Jugada</span><span>Resultados</span><span>Partidas</span></div>
              <div className="explorer-moves">
                {next.map(({ san, nd }) => {
                  const isHot = hot.some((h) => h.key === [...path, san].join(' '))
                  return (
                    <button key={san} type="button" className="xm" onClick={() => setPath([...path, san])} aria-label={`${es(san)}: ${nd.n} partidas, ${pct(nd.w, nd.n)}% ganadas${isHot ? ', sueles fallar después' : ''}`}>
                      <span className={`san${isHot ? ' hot' : ''}`}>{es(san)}</span>
                      <WDL nd={nd} />
                      <span className="meta mono num" style={{ textAlign: 'right' }}>{nd.n} · {pct(nd.w, nd.n)}%</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          {path.length > 0 && <div><button type="button" className="btn ghost sm" onClick={() => setPath(path.slice(0, -1))}><ArrowLeft size={16} />Atrás</button></div>}
        </div>
      </div>
    </div>
  )
}
