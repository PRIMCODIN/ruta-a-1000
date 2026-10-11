import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Chess } from 'chess.js'
import Board, { type Arrow, type Mark, type MoveInput } from '../board/Board'
import { sfx } from '../board/sounds'
import { ArrowLegend, Coach, Mastery } from '../components/ui'
import { attacksOfPiece, es, START_FEN, tryMove } from '../lib/chess-utils'
import { useStore } from '../lib/store'
import { go } from '../lib/router'
import { lines, type Line } from '../data'
const GROUP_NOTES: Record<string, string> = {
  'Blancas · Cuando te disputan el centro': 'Tu problema real con blancas: contra ...e5 temprano puntuabas 38% y contra 1...e5 un 35%. Aquí está el tenedor ...e5-e4 que te costó 9 partidas.',
  'Blancas · Tu sistema': 'Tu Colle con sus dos rupturas: e4 (y e5 cuando gana algo concreto) y c4 cuando el negro controla e4.',
  'Negras · Contra 1.e4': 'Siciliana con ...Cc6 y fianchetto, y cómo evitar la clavada Ag5 sobre tu caballo de f6.',
  'Negras · Contra 1.d4': 'Una sola estructura contra 1.d4: ...d5 y ...Cf6, con ...c5 contra el Londres.',
}

export default function Repertoire() {
  const store = useStore()
  const groups = [...new Set(lines.map((l) => l.group))]
  const due = lines.filter((l) => store.isDue(l.id))
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <div className="eyebrow">Repertorio</div>
          <h1>Tus aperturas, jugada a jugada</h1>
          <p className="muted" style={{ margin: 0 }}>Juegas tus jugadas, el rival responde solo y cada idea se explica sobre el tablero.</p>
        </div>
        <button type="button" className="btn primary" disabled={!due.length} onClick={() => go(`repertorio/${due[0].id}`)}>
          Repasar {due.length} pendiente{due.length === 1 ? '' : 's'}
        </button>
      </div>
      {groups.map((g) => (
        <section key={g} className="card stack" style={{ gap: 10 }}>
          <div>
            <h2>{g}</h2>
            <p className="muted" style={{ margin: 0, maxWidth: '70ch' }}>{GROUP_NOTES[g]}</p>
          </div>
          <div className="grid-3">
            {lines.filter((l) => l.group === g).map((l) => {
              const r = store.review(l.id)
              const isDue = store.isDue(l.id)
              return (
                <button key={l.id} type="button" className="item" onClick={() => go(`repertorio/${l.id}`)}>
                  <span style={{ fontWeight: 700 }}>{l.name}</span>
                  {!r ? <span className="pill orange">Nueva</span> : isDue ? <span className="pill red">Toca hoy</span> : <Mastery box={r.box} />}
                  <span className="sub mono">{l.moves.slice(0, 6).map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}.` : '') + es(m)).join(' ')}…</span>
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </div>
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

export function LineDrill({ line, onDone, header }: { line: Line; onDone: (ok: boolean) => void; header?: ReactNode }) {
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
            <button type="button" className="btn primary" onClick={() => onDone(errors === 0)}>Continuar</button>
            <button type="button" className="btn" onClick={restart}>Repetir</button>
          </div>
        ) : (
          <div className="row">
            <button type="button" className="btn" onClick={hint} disabled={!userTurn}>Pista</button>
            <button type="button" className="btn ghost" onClick={() => onDone(false)}>Salir</button>
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
