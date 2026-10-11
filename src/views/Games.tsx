import { useEffect, useMemo, useRef, useState } from 'react'
import Board, { type Arrow, type Mark } from '../board/Board'
import { sfx } from '../board/sounds'
import { Coach, EvalBar, Icons } from '../components/ui'
import { buildPlies, type GameRow, type Ply } from '../analysis/core'
import { es, PHASE_LABEL, pvToSan, START_FEN, uciToMove, winPct } from '../lib/chess-utils'
import { db } from '../lib/db'
import { useStore } from '../lib/store'
import { useSync } from '../lib/sync'
import { go } from '../lib/router'

export function SyncButtons() {
  const sync = useSync()
  const [showPgn, setShowPgn] = useState(false)
  const [text, setText] = useState('')
  const file = useRef<HTMLInputElement>(null)
  return (
    <div className="stack" style={{ gap: 10, alignItems: 'flex-end' }}>
      <div className="row">
        <button type="button" className="btn primary" disabled={sync.running} onClick={() => sync.syncChesscom()}>
          {Icons.refresh}<span>{sync.running ? 'Sincronizando…' : 'Actualizar desde Chess.com'}</span>
        </button>
        <button type="button" className="btn" onClick={() => setShowPgn(!showPgn)} aria-expanded={showPgn}>Subir PGN</button>
      </div>
      {showPgn && (
        <div className="card flat stack" style={{ width: 'min(520px, 100%)' }}>
          <label className="f" htmlFor="pgnfile">Archivo .pgn (una o varias partidas)
            <input id="pgnfile" ref={file} type="file" accept=".pgn,text/plain" className="input" onChange={async (e) => {
              const f = e.target.files?.[0]
              if (f) setText(await f.text())
            }} />
          </label>
          <label className="f" htmlFor="pgntext">O pégalo aquí
            <textarea id="pgntext" className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder='[Event "Live Chess"] …' />
          </label>
          <div className="row">
            <button type="button" className="btn primary" disabled={!text.trim() || sync.running} onClick={() => { void sync.importPgnText(text); setShowPgn(false); setText('') }}>Analizar e importar</button>
            <span className="dim" style={{ fontSize: 12.5 }}>Cada partida tarda unos segundos: el motor corre en tu navegador.</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Games() {
  const store = useStore()
  const [color, setColor] = useState<'all' | 'w' | 'b'>('all')
  const [res, setRes] = useState<'all' | 'W' | 'L' | 'D'>('all')
  const [n, setN] = useState(50)
  const list = [...store.games].reverse().filter((g) => (color === 'all' || g.color === color) && (res === 'all' || g.result === res))
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <div className="eyebrow">Partidas · {store.games.length} analizadas</div>
          <h1>Tus partidas</h1>
          <p className="muted" style={{ margin: 0 }}>{store.settings.last_sync_at ? `Última actualización: ${new Date(store.settings.last_sync_at).toLocaleString('es-ES')}` : 'Aún no has sincronizado Chess.com.'}</p>
        </div>
        <SyncButtons />
      </div>
      <div className="row">
        {(['all', 'w', 'b'] as const).map((c) => <button key={c} type="button" className="chip" aria-pressed={color === c} onClick={() => setColor(c)}>{c === 'all' ? 'Ambos colores' : c === 'w' ? 'Blancas' : 'Negras'}</button>)}
        {(['all', 'W', 'L', 'D'] as const).map((c) => <button key={c} type="button" className="chip" aria-pressed={res === c} onClick={() => setRes(c)}>{c === 'all' ? 'Todos los resultados' : c === 'W' ? 'Victorias' : c === 'L' ? 'Derrotas' : 'Tablas'}</button>)}
      </div>
      <div className="card table-wrap" style={{ padding: 6 }}>
        <table className="t">
          <thead><tr><th>Res.</th><th>Fecha</th><th>Color</th><th>Ritmo</th><th>Elo</th><th>Precisión</th><th>Errores graves</th><th>Apertura</th></tr></thead>
          <tbody>
            {list.slice(0, n).map((g) => {
              const b = g.stats ? g.stats.blunders.apertura + g.stats.blunders.medio + g.stats.blunders.final : null
              return (
                <tr key={g.id} className="click" onClick={() => go(`partidas/${g.id}`)}>
                  <td><span className={`res ${g.result}`}>{g.result === 'W' ? 'G' : g.result === 'L' ? 'P' : '½'}</span></td>
                  <td className="num">{new Date(g.played_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' })}</td>
                  <td>{g.color === 'w' ? '♔ Blancas' : '♚ Negras'}</td>
                  <td className="num">{fmtTc(g.time_control)}</td>
                  <td className="num">{g.my_elo ?? '—'} <span className="dim">vs {g.opp_elo ?? '—'}</span></td>
                  <td className="num">{g.stats ? `${g.stats.accuracy.toFixed(0)}%` : '—'}</td>
                  <td className="num" style={{ color: b ? 'var(--red)' : 'var(--green)' }}>{b ?? '—'}</td>
                  <td className="dim" style={{ maxWidth: 260, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.stats?.bucket.replace(/^(Blancas|Negras) · /, '') ?? ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {list.length > n && <button type="button" className="btn" onClick={() => setN(n + 50)}>Ver más</button>}
    </div>
  )
}

const fmtTc = (tc: string | null) => {
  if (!tc) return '—'
  const [b, inc] = tc.split('+')
  const m = Number(b) / 60
  return `${m >= 1 ? m : Number(b) + 's'}${inc ? `+${inc}` : ''} min`.replace('s min', ' s')
}

const CLS = (p: Ply) => (p.loss >= 30 ? 'blunder' : p.loss >= 20 ? 'mistake' : p.loss >= 10 ? 'inacc' : null)
const CLS_LABEL = { blunder: 'Error grave', mistake: 'Error', inacc: 'Imprecisión' } as const
const CLS_ICON = { blunder: '??', mistake: '?', inacc: '?!' } as const

export function GameReview({ id }: { id: string }) {
  const [game, setGame] = useState<(GameRow & { id: string }) | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [i, setI] = useState(0) // posición mostrada (0 = inicial)
  const [showBest, setShowBest] = useState(true)

  useEffect(() => {
    db.gameFull(id).then(setGame).catch((e) => setErr(e.message))
  }, [id])
  const plies = useMemo(() => (game?.analysis ? buildPlies(game.pgn, game.analysis) : []), [game])
  const myErrors = plies.filter((p) => p.color === game?.color && p.loss >= 20)

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setI((x) => Math.min(x + 1, plies.length))
      if (e.key === 'ArrowLeft') setI((x) => Math.max(x - 1, 0))
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [plies.length])
  useEffect(() => {
    if (i > 0 && plies[i - 1]) sfx.forSan(plies[i - 1].san)
  }, [i]) // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return <div className="banner err">No se pudo abrir la partida: {err}</div>
  if (!game) return <p className="dim">Cargando partida…</p>

  const ply = i > 0 ? plies[i - 1] : null
  const fen = ply ? ply.fenAfter : START_FEN
  const cpWhite = game.analysis?.evals[i] ?? 0
  const arrows: Arrow[] = []
  const marks: Mark[] = []
  const cls = ply ? CLS(ply) : null
  if (ply) {
    const c = cls === 'blunder' ? 'red' : cls ? 'orange' : 'green'
    arrows.push({ from: ply.uci.slice(0, 2), to: ply.uci.slice(2, 4), color: c })
    if (cls) marks.push({ sq: ply.uci.slice(2, 4), color: cls === 'blunder' ? 'red' : 'orange', badge: CLS_ICON[cls] })
    if (cls && showBest && ply.best) {
      const b = uciToMove(ply.best)
      arrows.push({ from: b.from, to: b.to, color: 'green' })
    }
  }
  const nextError = () => {
    const n = myErrors.find((p) => p.i + 1 > i)
    setI(n ? n.i + 1 : myErrors[0] ? myErrors[0].i + 1 : i)
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <button type="button" className="btn ghost sm" onClick={() => go('partidas')}>← Partidas</button>
          <h1>{game.color === 'w' ? 'Blancas' : 'Negras'} · {game.result === 'W' ? 'Victoria' : game.result === 'L' ? 'Derrota' : 'Tablas'}</h1>
          <p className="muted" style={{ margin: 0 }}>{new Date(game.played_at).toLocaleString('es-ES')} · {game.my_elo} vs {game.opp_elo} · {game.termination}</p>
        </div>
        <div className="row">
          {game.ext_id.startsWith('http') && <a className="btn" href={game.ext_id} target="_blank" rel="noreferrer">Ver en Chess.com</a>}
          <button type="button" className="btn primary" onClick={nextError} disabled={!myErrors.length}>Siguiente error ({myErrors.length})</button>
        </div>
      </div>
      <div className="train">
        <div>
          <div className="board-col">
            <EvalBar cpWhite={cpWhite} orientation={game.color} />
            <Board fen={fen} orientation={game.color} lastMove={ply ? [ply.uci.slice(0, 2), ply.uci.slice(2, 4)] : null} arrows={arrows} marks={marks} />
          </div>
          <EvalGraph plies={plies} evals={game.analysis?.evals ?? []} me={game.color} cur={i} onPick={setI} />
        </div>
        <div className="card stack">
          {ply ? (
            <Coach
              kind={cls === 'blunder' || cls === 'mistake' ? 'bad' : cls ? 'info' : 'good'}
              title={`${Math.floor(ply.i / 2) + 1}${ply.color === 'w' ? '.' : '...'} ${es(ply.san)} · ${cls ? CLS_LABEL[cls] : ply.loss < 2 ? 'Buena jugada' : 'Correcta'}`}
            >
              <div className="dim" style={{ color: '#5c5a57' }}>{PHASE_LABEL[ply.phase]} · {ply.color === game.color ? 'tu jugada' : 'jugada del rival'}{ply.clock !== null ? ` · reloj ${fmtClock(ply.clock)}` : ''}</div>
              {cls && ply.best && (
                <div style={{ marginTop: 4 }}>
                  Probabilidad de ganar: {Math.round(ply.wpBefore)}% → {Math.round(ply.wpAfter)}%. Mejor era <span className="mv">{pvToSan(ply.fenBefore, [ply.best], 1).replace(/^\d+\.+\s?/, '')}</span> (flecha verde).
                  <div className="mono" style={{ fontSize: 12.5, marginTop: 4 }}>{pvToSan(ply.fenBefore, ply.pv, 6)}</div>
                </div>
              )}
              {cls && ply.replyPv[0] && <div style={{ marginTop: 4 }}>Respuesta del rival que lo castiga: <span className="mv">{pvToSan(ply.fenAfter, ply.replyPv, 3)}</span></div>}
            </Coach>
          ) : (
            <Coach title="Revisión de la partida">Pulsa en la gráfica o en una jugada, o usa <kbd>←</kbd> <kbd>→</kbd>. Tus errores llevan marca roja (??) o naranja (?).</Coach>
          )}
          <label className="row" style={{ fontSize: 13 }}><input type="checkbox" checked={showBest} onChange={(e) => setShowBest(e.target.checked)} /> Mostrar la mejor jugada en mis errores</label>
          <div className="moves">
            {Array.from({ length: Math.ceil(plies.length / 2) }, (_, k) => (
              <MoveRow key={k} k={k} plies={plies} cur={i} me={game.color} onPick={setI} />
            ))}
          </div>
          <div className="row">
            <button type="button" className="btn" onClick={() => setI(0)} aria-label="Inicio">⏮</button>
            <button type="button" className="btn" onClick={() => setI(Math.max(0, i - 1))} aria-label="Anterior">◀</button>
            <button type="button" className="btn" onClick={() => setI(Math.min(plies.length, i + 1))} aria-label="Siguiente">▶</button>
            <button type="button" className="btn" onClick={() => setI(plies.length)} aria-label="Final">⏭</button>
          </div>
        </div>
      </div>
    </div>
  )
}

const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

function MoveRow({ k, plies, cur, me, onPick }: { k: number; plies: Ply[]; cur: number; me: 'w' | 'b'; onPick: (n: number) => void }) {
  const cell = (idx: number) => {
    const p = plies[idx]
    if (!p) return <span />
    const c = p.color === me ? CLS(p) : null
    return (
      <button type="button" className={cur === idx + 1 ? 'cur' : ''} onClick={() => onPick(idx + 1)}>
        {c && <span className={`cls ${c}`}>{CLS_ICON[c]}</span>}{es(p.san)}
      </button>
    )
  }
  return (<><span className="n">{k + 1}.</span>{cell(2 * k)}{cell(2 * k + 1)}</>)
}

function EvalGraph({ plies, evals, me, cur, onPick }: { plies: Ply[]; evals: number[]; me: 'w' | 'b'; cur: number; onPick: (n: number) => void }) {
  const W = 620, H = 90
  if (evals.length < 2) return null
  const n = evals.length - 1
  const x = (k: number) => (k / n) * W
  const y = (cp: number) => {
    const w = winPct(cp) / 100
    return me === 'w' ? H - w * H : w * H
  }
  const pts = evals.map((e, k) => `${x(k)},${y(e)}`).join(' ')
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} style={{ marginTop: 10, borderRadius: 4, cursor: 'pointer', background: me === 'w' ? '#403d39' : '#fff' }}
      onClick={(e) => {
        const r = (e.currentTarget as SVGElement).getBoundingClientRect()
        onPick(Math.round(((e.clientX - r.left) / r.width) * n))
      }} role="img" aria-label="Gráfica de evaluación">
      <polygon points={`0,${H} ${pts} ${W},${H}`} fill={me === 'w' ? '#fff' : '#403d39'} />
      <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="#8a8784" strokeDasharray="3 3" />
      {plies.map((p) => {
        const c = p.color === me ? CLS(p) : null
        if (!c || c === 'inacc') return null
        return <circle key={p.i} cx={x(p.i + 1)} cy={y(evals[p.i + 1])} r="4.5" fill={c === 'blunder' ? 'var(--red)' : '#e58f2a'} stroke="#000" strokeWidth=".5" />
      })}
      <line x1={x(cur)} x2={x(cur)} y1="0" y2={H} stroke="var(--green)" strokeWidth="2" />
    </svg>
  )
}
