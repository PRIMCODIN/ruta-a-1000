import { useEffect, useMemo, useRef, useState, type PointerEvent as RPE } from 'react'
import { Chess, type Square, type PieceSymbol } from 'chess.js'
import { PIECES } from './pieces'
import { FILES } from '../lib/chess-utils'

export type ArrowColor = 'green' | 'red' | 'orange' | 'blue'
export type Arrow = { from: string; to: string; color?: ArrowColor; dashed?: boolean }
export type Mark = { sq: string; color?: ArrowColor; badge?: string }
export type MoveInput = { from: Square; to: Square; promotion?: PieceSymbol }

type Props = {
  fen: string
  orientation: 'w' | 'b'
  lastMove?: [string, string] | null
  interactive?: boolean
  onMove?: (m: MoveInput) => void
  arrows?: Arrow[]
  marks?: Mark[]
  flash?: { sq: string; kind: 'good' | 'bad'; key: number } | null
  mini?: boolean
  coords?: boolean
}

type P = { id: number; code: string; sq: string }
let nextId = 1

/** Empareja piezas entre posiciones para animar el movimiento (misma pieza → misma id). */
function diffPieces(prev: P[], fen: string): P[] {
  const g = new Chess(fen)
  const now: { code: string; sq: string }[] = []
  for (const row of g.board()) for (const p of row) if (p) now.push({ code: p.color + p.type, sq: p.square })
  const left = [...prev]
  const out: P[] = []
  const pending: { code: string; sq: string }[] = []
  for (const n of now) {
    const k = left.findIndex((o) => o.code === n.code && o.sq === n.sq)
    if (k >= 0) out.push(left.splice(k, 1)[0])
    else pending.push(n)
  }
  const dist = (a: string, b: string) => Math.abs(a.charCodeAt(0) - b.charCodeAt(0)) + Math.abs(+a[1] - +b[1])
  for (const n of pending) {
    let best = -1
    for (let k = 0; k < left.length; k++) if (left[k].code === n.code && (best < 0 || dist(left[k].sq, n.sq) < dist(left[best].sq, n.sq))) best = k
    if (best >= 0) out.push({ ...left.splice(best, 1)[0], sq: n.sq })
    else out.push({ id: nextId++, ...n })
  }
  return out
}

const ARROW_FILL: Record<ArrowColor, string> = {
  green: 'rgba(20,184,166,.9)',
  red: 'rgba(240,72,60,.88)',
  orange: 'rgba(245,165,36,.92)',
  blue: 'rgba(80,130,240,.88)',
}

export default function Board({
  fen, orientation, lastMove, interactive, onMove, arrows = [], marks = [], flash, mini, coords = true,
}: Props) {
  const box = useRef<HTMLDivElement>(null)
  const [pieces, setPieces] = useState<P[]>(() => diffPieces([], fen))
  const [sel, setSel] = useState<string | null>(null)
  const [drag, setDrag] = useState<{ sq: string; x: number; y: number } | null>(null)
  const [promo, setPromo] = useState<{ from: Square; to: Square } | null>(null)
  const [flashOn, setFlashOn] = useState<typeof flash>(null)

  useEffect(() => {
    setPieces((prev) => diffPieces(prev, fen))
    setSel(null)
    setPromo(null)
  }, [fen])
  useEffect(() => {
    if (!flash) return
    setFlashOn(flash)
    const t = setTimeout(() => setFlashOn(null), 700)
    return () => clearTimeout(t)
  }, [flash?.key]) // eslint-disable-line react-hooks/exhaustive-deps

  const game = useMemo(() => new Chess(fen), [fen])
  const dests = useMemo(() => (sel ? game.moves({ square: sel as Square, verbose: true }) : []), [sel, game])

  const xy = (sq: string) => {
    const f = FILES.indexOf(sq[0])
    const r = +sq[1] - 1
    return orientation === 'w' ? [f, 7 - r] : [7 - f, r]
  }
  const sqAt = (cx: number, cy: number) => {
    const r = box.current!.getBoundingClientRect()
    const x = Math.floor(((cx - r.left) / r.width) * 8)
    const y = Math.floor(((cy - r.top) / r.height) * 8)
    if (x < 0 || x > 7 || y < 0 || y > 7) return null
    return orientation === 'w' ? FILES[x] + (8 - y) : FILES[7 - x] + (y + 1)
  }

  const attempt = (from: string, to: string) => {
    const m = game.moves({ square: from as Square, verbose: true }).find((x) => x.to === to)
    if (!m) return false
    setSel(null)
    if (m.promotion) {
      setPromo({ from: from as Square, to: to as Square })
      return true
    }
    onMove?.({ from: from as Square, to: to as Square })
    return true
  }

  const down = (e: RPE) => {
    if (!interactive || promo) return
    const sq = sqAt(e.clientX, e.clientY)
    if (!sq) return
    if (sel && sel !== sq && dests.some((d) => d.to === sq)) {
      attempt(sel, sq)
      return
    }
    const p = game.get(sq as Square)
    if (p && p.color === game.turn()) {
      setSel(sq)
      setDrag({ sq, x: e.clientX, y: e.clientY })
      ;(e.target as Element).setPointerCapture?.(e.pointerId)
    } else setSel(null)
  }
  const move = (e: RPE) => {
    if (drag) setDrag({ ...drag, x: e.clientX, y: e.clientY })
  }
  const up = (e: RPE) => {
    if (!drag) return
    const to = sqAt(e.clientX, e.clientY)
    const from = drag.sq
    setDrag(null)
    if (to && to !== from) attempt(from, to)
  }

  const rect = box.current?.getBoundingClientRect()
  const markBy = Object.fromEntries(marks.map((m) => [m.sq, m]))
  const squares = []
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const sq = orientation === 'w' ? FILES[x] + (8 - y) : FILES[7 - x] + (y + 1)
      const light = (FILES.indexOf(sq[0]) + +sq[1]) % 2 === 1
      const isLast = lastMove && (lastMove[0] === sq || lastMove[1] === sq)
      const d = dests.find((m) => m.to === sq)
      const mk = markBy[sq]
      squares.push(
        <div key={sq} className={`sq ${light ? 'l' : 'd'}`}>
          {isLast && <span className="hl last" />}
          {sel === sq && <span className="hl sel" />}
          {flashOn && flashOn.sq === sq && <span className={`hl flash-${flashOn.kind}`} />}
          {mk && !mk.badge && <span className={`ring ring-${mk.color ?? 'orange'}`} />}
          {d && <span className={d.captured ? 'dest cap' : 'dest'} />}
          {coords && !mini && x === 0 && <span className="coord rank">{sq[1]}</span>}
          {coords && !mini && y === 7 && <span className="coord file">{sq[0]}</span>}
        </div>,
      )
    }

  return (
    <div className={`board-wrap${mini ? ' mini' : ''}`}>
      <div
        className="board"
        ref={box}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => setDrag(null)}
        style={{ cursor: interactive ? 'pointer' : 'default' }}
      >
        <div className="squares">{squares}</div>
        {pieces.map((p) => {
          const [x, y] = xy(p.sq)
          const dragging = drag && drag.sq === p.sq && rect
          const style = dragging
            ? { transform: `translate(${((drag.x - rect.left) / rect.width) * 800 - 50}%, ${((drag.y - rect.top) / rect.height) * 800 - 50}%)` }
            : { transform: `translate(${x * 100}%, ${y * 100}%)` }
          return (
            <div
              key={p.id}
              className={`piece${dragging ? ' dragging' : ''}`}
              style={{ ...style, backgroundImage: `url("${PIECES[p.code]}")` }}
            />
          )
        })}
        {marks.filter((m) => m.badge).map((m) => {
          const [x, y] = xy(m.sq)
          return (
            <span key={`b${m.sq}`} className={`badge badge-${m.color ?? 'orange'}`} style={{ left: `${(x + 1) * 12.5}%`, top: `${y * 12.5}%` }}>
              {m.badge}
            </span>
          )
        })}
        <svg className="arrows" viewBox="0 0 800 800" aria-hidden="true">
          {arrows.map((a, k) => (
            <ArrowShape key={k} a={a} xy={xy} />
          ))}
        </svg>
        {promo && (
          <div className="promo" onPointerDown={(e) => e.stopPropagation()}>
            {(['q', 'r', 'b', 'n'] as PieceSymbol[]).map((t) => (
              <button
                key={t}
                type="button"
                aria-label={`Coronar ${t}`}
                style={{ backgroundImage: `url("${PIECES[game.turn() + t]}")` }}
                onClick={() => {
                  const p = promo
                  setPromo(null)
                  onMove?.({ ...p, promotion: t })
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ArrowShape({ a, xy }: { a: Arrow; xy: (s: string) => number[] }) {
  const [x1, y1] = xy(a.from).map((v) => v * 100 + 50)
  const [x2, y2] = xy(a.to).map((v) => v * 100 + 50)
  const fill = ARROW_FILL[a.color ?? 'orange']
  const dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1)
  const knight = (dx === 100 && dy === 200) || (dx === 200 && dy === 100)
  const W = 13, HW = 26, HL = 34
  const seg = (ax: number, ay: number, bx: number, by: number, head: boolean, start: number) => {
    const L = Math.hypot(bx - ax, by - ay)
    const ux = (bx - ax) / L, uy = (by - ay) / L
    const px = -uy, py = ux
    const sx = ax + ux * start, sy = ay + uy * start
    const ex = head ? bx - ux * HL : bx, ey = head ? by - uy * HL : by
    const pts = [
      [sx + px * W / 2, sy + py * W / 2], [ex + px * W / 2, ey + py * W / 2],
      ...(head ? [[ex + px * HW / 2, ey + py * HW / 2], [bx, by], [ex - px * HW / 2, ey - py * HW / 2]] : []),
      [ex - px * W / 2, ey - py * W / 2], [sx - px * W / 2, sy - py * W / 2],
    ]
    return pts.map((p) => p.join(',')).join(' ')
  }
  const style = a.dashed ? { opacity: 0.75 } : undefined
  if (knight) {
    const midX = dx > dy ? x2 : x1
    const midY = dx > dy ? y1 : y2
    const ex = midX + (midX === x1 ? 0 : 0)
    return (
      <g style={style}>
        <polygon points={seg(x1, y1, ex + (x1 < ex ? W / 2 : x1 > ex ? -W / 2 : 0), midY + (y1 < midY ? W / 2 : y1 > midY ? -W / 2 : 0), false, 22)} fill={fill} />
        <polygon points={seg(midX, midY, x2, y2, true, 0)} fill={fill} />
      </g>
    )
  }
  return <polygon points={seg(x1, y1, x2, y2, true, 22)} fill={fill} style={style} />
}
