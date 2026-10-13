import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Chess } from 'chess.js'
import Board, { type Arrow, type Mark, type MoveInput } from '../board/Board'
import { sfx } from '../board/sounds'
import { ArrowLegend, Coach, Mastery } from '../components/ui'
import { attacksOfPiece, es, START_FEN, tryMove } from '../lib/chess-utils'
import { useStore } from '../lib/store'
import { go } from '../lib/router'
import { lines, type Line } from '../data'
import { BRANCHES, REP_META } from '../data/repMeta'
import { SideSwitch, useSide } from '../components/SideSwitch'
import { setQueue } from '../lib/queue'
/** Posición justo antes de tu jugada clave, con la jugada previa del rival. */
function keyPosition(l: Line, key: number) {
  const g = new Chess()
  let last: [string, string] | null = null
  for (const m of l.moves.slice(0, key)) {
    const r = g.move(m)
    last = [r.from, r.to]
  }
  const km = tryMove(new Chess(g.fen()), l.moves[key])
  return { fen: g.fen(), last, km }
}

export default function Repertoire() {
  const store = useStore()
  const [side, setSide] = useSide()
  const branches = BRANCHES.filter((b) => b.side === side)
  const ordered = branches.flatMap((b) => lines.filter((l) => REP_META[l.id]?.branch === b.id))
  const due = ordered.filter((l) => store.isDue(l.id))
  const open = (id: string) => {
    setQueue('rep', ordered.map((l) => l.id))
    go(`repertorio/${id}`)
  }
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <div className="eyebrow">Repertorio · {ordered.length} líneas</div>
          <h1>¿Qué juega el rival?</h1>
          <p className="muted" style={{ margin: 0, maxWidth: '62ch' }}>Cada rama es una respuesta del rival. Cada tarjeta muestra la posición clave y la flecha de tu jugada.</p>
        </div>
        <div className="row">
          <SideSwitch side={side} onChange={setSide} />
          <button type="button" className="btn primary" disabled={!due.length} onClick={() => { setQueue('rep', due.map((l) => l.id)); go(`repertorio/${due[0].id}`) }}>
            Repasar {due.length} pendiente{due.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>
      <section className="card">
        {branches.map((b) => {
          const ls = lines.filter((l) => REP_META[l.id]?.branch === b.id)
          const done = ls.filter((l) => (store.review(l.id)?.box ?? 0) >= 2).length
          return (
            <div key={b.id} className="branch">
              <div className="branch-head">
                <span className="eyebrow">Si el rival…</span>
                <h3>{b.title}</h3>
                <div className="movechips">{b.chips.map((m, i) => <span key={i} className={i === b.chips.length - 1 && i % 2 === (side === 'w' ? 1 : 0) ? 'key' : ''}>{i % 2 === 0 ? `${i / 2 + 1}.` : ''}{es(m)}</span>)}</div>
                <p className="dim" style={{ margin: 0, fontSize: 13 }}>{b.desc}</p>
                <span className="dim mono" style={{ fontSize: 11.5 }}>{done}/{ls.length} dominadas</span>
              </div>
              <div className="lcards">
                {ls.map((l) => <LineCard key={l.id} l={l} side={side} onOpen={() => open(l.id)} />)}
              </div>
            </div>
          )
        })}
      </section>
    </div>
  )
}

function LineCard({ l, side, onOpen }: { l: Line; side: 'w' | 'b'; onOpen: () => void }) {
  const store = useStore()
  const meta = REP_META[l.id]
  const kp = useMemo(() => keyPosition(l, meta.key), [l, meta.key])
  const r = store.review(l.id)
  const due = store.isDue(l.id)
  return (
    <button type="button" className="lcard" onClick={onOpen} title={l.name}>
      <Board fen={kp.fen} orientation={side} mini lastMove={kp.last} arrows={kp.km ? [{ from: kp.km.from, to: kp.km.to, color: 'green' }] : []} />
      <div className="meta">
        <span className="when">Si… {meta.when}</span>
        <span className="then"><span className="arrow">→</span><span className="mv">{kp.km ? es(kp.km.san) : ''}</span></span>
        <div className="foot">
          {!r ? <span className="pill orange">Nueva</span> : due ? <span className="pill red">Toca hoy</span> : <Mastery box={r.box} />}
          <span className="dim mono" style={{ fontSize: 11 }}>{l.moves.length} jug.</span>
        </div>
      </div>
    </button>
  )
}

/** Flechas automáticas: la jugada en verde y lo que ataca la pieza movida en rojo. */
function moveVisual(fenAfter: string, from: string, to: string, color: Arrow['color'] = 'green'): { arrows: Arrow[]; marks: Mark[] } {
  const threats = attacksOfPiece(fenAfter, to as never)
  return {
    arrows: [{ from, to, color }, ...threats.map((t) => ({ from: t.from, to: t.to, color: 'red' as const }))],
    marks: threats.map((t) => ({ sq: t.to, color: 'red' as const })),
  }
}

export function LineDrill({ line, onDone, onExit, header }: { line: Line; onDone: (ok: boolean) => void; onExit?: () => void; header?: ReactNode }) {
  const store = useStore()
  const [mode, setMode] = useState<'train' | 'explore'>('train')
  const [i, setI] = useState(0) // jugadas ya hechas
  const [errors, setErrors] = useState(0)
  const [missed, setMissed] = useState(false)
  const [vis, setVis] = useState<{ arrows: Arrow[]; marks: Mark[] }>({ arrows: [], marks: [] })
  const [bubble, setBubble] = useState<{ kind: 'good' | 'bad' | 'info'; title: string; text?: string }>({
    kind: 'info', title: `Juegas con ${line.side === 'w' ? 'blancas' : 'negras'}`, text: line.intro,
  })
  const [flash, setFlash] = useState<{ sq: string; kind: 'good' | 'bad'; key: number } | null>(null)
  const [graded, setGraded] = useState(false)

  const positions = useMemo(() => {
    const g = new Chess()
    const out = [{ fen: START_FEN, last: null as [string, string] | null, san: '' }]
    for (const m of line.moves) {
      const r = g.move(m)
      out.push({ fen: g.fen(), last: [r.from, r.to], san: r.san })
    }
    return out
  }, [line])
  const done = i >= line.moves.length
  const userTurn = !done && (i % 2 === 0 ? 'w' : 'b') === line.side
  const cur = positions[i]

  // el rival juega solo
  useEffect(() => {
    if (mode !== 'train' || done || userTurn) return
    const t = setTimeout(() => {
      const next = positions[i + 1]
      sfx.forSan(next.san)
      const note = line.notes[String(i)]
      setVis(moveVisual(next.fen, next.last![0], next.last![1], 'orange'))
      if (note) setBubble({ kind: 'info', title: `Rival: ${es(next.san)}`, text: note })
      setI(i + 1)
    }, i === 0 ? 600 : 520)
    return () => clearTimeout(t)
  }, [i, mode, done, userTurn]) // eslint-disable-line react-hooks/exhaustive-deps

  // fin de la línea
  useEffect(() => {
    if (mode === 'train' && done && !graded) {
      setGraded(true)
      const ok = errors === 0
      store.grade(line.id, 'line', ok)
      ok ? sfx.good() : sfx.bad()
      setBubble({
        kind: ok ? 'good' : 'bad',
        title: ok ? 'Línea completa sin fallos' : `Línea completa con ${errors} fallo${errors > 1 ? 's' : ''}`,
        text: `${line.outro ?? ''} ${ok ? 'Volverá dentro de unos días.' : 'Te la vuelvo a poner hoy.'}`,
      })
    }
  }, [done, mode]) // eslint-disable-line react-hooks/exhaustive-deps

  // modo explorar: flechas del paso actual y teclado
  useEffect(() => {
    if (mode !== 'explore') return
    if (i === 0) setVis({ arrows: [], marks: [] })
    else {
      const p = positions[i]
      setVis(moveVisual(p.fen, p.last![0], p.last![1], (i - 1) % 2 === (line.side === 'w' ? 0 : 1) ? 'green' : 'orange'))
      const note = line.notes[String(i - 1)]
      setBubble({ kind: 'info', title: `${Math.floor((i - 1) / 2) + 1}${(i - 1) % 2 ? '...' : '.'} ${es(p.san)}`, text: note ?? 'Jugada normal de desarrollo.' })
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setI((x) => Math.min(x + 1, line.moves.length))
      if (e.key === 'ArrowLeft') setI((x) => Math.max(x - 1, 0))
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [i, mode]) // eslint-disable-line react-hooks/exhaustive-deps

  const onMove = (m: MoveInput) => {
    const g = new Chess(cur.fen)
    const exp = tryMove(new Chess(cur.fen), line.moves[i])!
    const mv = tryMove(g, m)
    if (!mv) return
    if (mv.from === exp.from && mv.to === exp.to) {
      const next = positions[i + 1]
      sfx.forSan(next.san)
      setFlash({ sq: exp.to, kind: 'good', key: Date.now() })
      const v = moveVisual(next.fen, exp.from, exp.to)
      setVis({ ...v, marks: [...v.marks, { sq: exp.to, color: missed ? 'orange' : 'green', badge: missed ? '!' : '✓' }] })
      if (missed) setErrors((e) => e + 1)
      setBubble({ kind: missed ? 'bad' : 'good', title: `${missed ? 'Anotado' : 'Bien'}: ${es(exp.san)}`, text: line.notes[String(i)] ?? 'Sigue el plan.' })
      setMissed(false)
      setI(i + 1)
    } else {
      sfx.bad()
      setFlash({ sq: mv.to, kind: 'bad', key: Date.now() })
      setMissed(true)
      setVis({ arrows: [{ from: mv.from, to: mv.to, color: 'red' }, { from: exp.from, to: exp.to, color: 'green' }], marks: [{ sq: mv.to, color: 'red', badge: '✗' }] })
      setBubble({ kind: 'bad', title: `${es(mv.san)} no es la jugada del plan`, text: `Aquí toca ${es(exp.san)} (flecha verde). ${line.notes[String(i)] ?? ''}` })
    }
  }

  const hint = () => {
    const exp = tryMove(new Chess(cur.fen), line.moves[i])
    if (!exp) return
    setMissed(true)
    setVis({ arrows: [{ from: exp.from, to: exp.to, color: 'orange' }], marks: [{ sq: exp.from, color: 'orange' }] })
  }
  const restart = () => {
    setI(0); setErrors(0); setMissed(false); setGraded(false); setVis({ arrows: [], marks: [] })
    setBubble({ kind: 'info', title: `Juegas con ${line.side === 'w' ? 'blancas' : 'negras'}`, text: line.intro })
  }
  const r = store.review(line.id)

  return (
    <div className="train">
      <div>
        <Board fen={cur.fen} orientation={line.side} lastMove={cur.last} interactive={mode === 'train' && userTurn} onMove={onMove} arrows={vis.arrows} marks={vis.marks} flash={flash} />
        <div className="under-board"><ArrowLegend /></div>
      </div>
      <div className="card stack">
        {header}
        <div>
          <div className="eyebrow">{line.group}</div>
          <h2>{line.name}</h2>
          <div className="row" style={{ gap: 12 }}>{r ? <Mastery box={r.box} /> : <span className="pill orange">Nueva</span>}<span className="dim" style={{ fontSize: 13 }}>{i} / {line.moves.length} jugadas</span></div>
        </div>
        <div className="row" role="tablist">
          <button type="button" className="chip" aria-pressed={mode === 'train'} onClick={() => { setMode('train'); restart() }}>Entrenar</button>
          <button type="button" className="chip" aria-pressed={mode === 'explore'} onClick={() => { setMode('explore'); setI(0) }}>Ver explicada</button>
        </div>
        <Coach kind={bubble.kind} title={bubble.title}>{bubble.text && <div>{bubble.text}</div>}</Coach>
        <div className="moves" style={{ gridTemplateColumns: '34px 1fr 1fr' }}>
          {Array.from({ length: Math.ceil(line.moves.length / 2) }, (_, k) => (
            <Row key={k} k={k} line={line} upto={i} onPick={mode === 'explore' ? (n) => setI(n) : undefined} />
          ))}
        </div>
        {mode === 'explore' ? (
          <div className="row">
            <button type="button" className="btn" onClick={() => setI(Math.max(0, i - 1))} aria-label="Jugada anterior">◀</button>
            <button type="button" className="btn primary" onClick={() => setI(Math.min(line.moves.length, i + 1))}>Siguiente ▶</button>
            <span className="dim" style={{ fontSize: 12 }}>También con <kbd>←</kbd> <kbd>→</kbd></span>
          </div>
        ) : done ? (
          <div className="row">
            <button type="button" className="btn primary" onClick={() => onDone(errors === 0)}>Siguiente línea →</button>
            <button type="button" className="btn" onClick={restart}>Repetir</button>
          </div>
        ) : (
          <div className="row">
            <button type="button" className="btn" onClick={hint} disabled={!userTurn}>Pista</button>
            <button type="button" className="btn ghost" onClick={() => (onExit ? onExit() : onDone(false))}>Salir</button>
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ k, line, upto, onPick }: { k: number; line: Line; upto: number; onPick?: (n: number) => void }) {
  const cell = (idx: number) => {
    if (idx >= line.moves.length) return <span />
    const shown = idx < upto || !!onPick
    return (
      <button type="button" className={idx === upto - 1 ? 'cur' : ''} onClick={() => onPick?.(idx + 1)} disabled={!onPick} style={{ opacity: shown ? 1 : 0.25 }}>
        {shown ? es(line.moves[idx]) : '…'}
      </button>
    )
  }
  return (
    <>
      <span className="n">{k + 1}.</span>
      {cell(2 * k)}
      {cell(2 * k + 1)}
    </>
  )
}
