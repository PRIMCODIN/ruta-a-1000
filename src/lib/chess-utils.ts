import { Chess, type Square, type PieceSymbol, type Color } from 'chess.js'

export const FILES = 'abcdefgh'
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

/** SAN inglesa → notación española (R, D, T, A, C). */
export const es = (san: string) =>
  String(san).replace(/[KQRBN]/g, (c) => ({ K: 'R', Q: 'D', R: 'T', B: 'A', N: 'C' })[c as 'K'])

/** Probabilidad de ganar (0-100) a partir de centipeones, fórmula de Lichess. */
export function winPct(cp: number) {
  const c = Math.max(-1500, Math.min(1500, cp))
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1)
}

/** Precisión de una jugada a partir de la caída de probabilidad (fórmula de Lichess). */
export function moveAccuracy(loss: number) {
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * Math.max(0, loss)) - 3.1669))
}

export const PIECE_VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }
export const PIECE_NAME: Record<PieceSymbol, string> = {
  p: 'un peón', n: 'el caballo', b: 'el alfil', r: 'la torre', q: 'la dama', k: 'el rey',
}

export function uciToMove(u: string) {
  return { from: u.slice(0, 2) as Square, to: u.slice(2, 4) as Square, promotion: (u[4] as PieceSymbol | undefined) || undefined }
}

/** Intenta una jugada sin lanzar excepción (chess.js 1.x lanza en jugadas ilegales). */
export function tryMove(g: Chess, m: string | { from: string; to: string; promotion?: string }) {
  try {
    return g.move(m as never)
  } catch {
    return null
  }
}

export function material(g: Chess, color: Color) {
  let s = 0
  for (const row of g.board()) for (const p of row) if (p) s += PIECE_VALUE[p.type] * (p.color === color ? 1 : -1)
  return s
}

/** Suma de material de piezas (sin peones ni reyes) de ambos bandos: decide la fase de final. */
export function nonPawnMaterial(g: Chess) {
  let s = 0
  for (const row of g.board()) for (const p of row) if (p && p.type !== 'p' && p.type !== 'k') s += PIECE_VALUE[p.type]
  return s
}

export type Phase = 'apertura' | 'medio' | 'final'
export const PHASE_LABEL: Record<Phase, string> = { apertura: 'Apertura', medio: 'Medio juego', final: 'Final' }

export function phaseOf(ply: number, npm: number): Phase {
  if (npm <= 26) return 'final'
  if (ply < 20) return 'apertura'
  return 'medio'
}

/** Línea de jugadas UCI → SAN española numerada, a partir de una FEN. */
export function pvToSan(fen: string, pv: string[], max = 6) {
  const g = new Chess(fen)
  const out: string[] = []
  for (const u of pv.slice(0, max)) {
    const num = g.moveNumber()
    const white = g.turn() === 'w'
    const m = tryMove(g, uciToMove(u))
    if (!m) break
    out.push((white ? `${num}. ` : out.length === 0 ? `${num}... ` : '') + es(m.san))
  }
  return out.join(' ')
}

/**
 * Piezas propias amenazadas: atacadas por una pieza de menor valor o sin defensa suficiente.
 * Devuelve flechas atacante → pieza. Es la "comprobación de seguridad" visual.
 */
export function threatsAgainst(fen: string, color: Color) {
  const g = new Chess(fen)
  const enemy: Color = color === 'w' ? 'b' : 'w'
  const out: { from: Square; to: Square }[] = []
  for (const row of g.board())
    for (const p of row) {
      if (!p || p.color !== color || p.type === 'k') continue
      const attackers = g.attackers(p.square, enemy)
      if (!attackers.length) continue
      const defenders = g.attackers(p.square, color)
      const cheapest = Math.min(...attackers.map((s) => PIECE_VALUE[g.get(s)!.type] || 0.5))
      if (defenders.length === 0 || cheapest < PIECE_VALUE[p.type])
        for (const a of attackers) out.push({ from: a, to: p.square })
    }
  return out
}

/** Lo que ataca la pieza que acaba de moverse (para explicar tenedores y amenazas). */
export function attacksOfPiece(fen: string, sq: Square) {
  const g = new Chess(fen)
  const p = g.get(sq)
  if (!p) return []
  const enemy: Color = p.color === 'w' ? 'b' : 'w'
  const out: { from: Square; to: Square }[] = []
  for (const row of g.board())
    for (const q of row) {
      if (!q || q.color !== enemy) continue
      if (q.type === 'p' && p.type !== 'p') continue
      if (g.attackers(q.square, p.color).includes(sq)) out.push({ from: sq, to: q.square })
    }
  return out
}
