import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { buildPlies, computeStats, generatePuzzles, ENGINE_TAG, type GameRow, type Puzzle } from '../analysis/core'
import { loadBook, reviewGame, reviewSummary, type DeepAnalysis } from '../analysis/review'
import { db } from './db'
import { useStore } from './store'

export type SyncState = {
  running: boolean
  label: string
  done: number
  total: number
  plyDone: number
  plyTotal: number
  message: string | null
  error: string | null
}

type Sync = SyncState & {
  syncChesscom: () => Promise<void>
  importPgnText: (text: string) => Promise<void>
  importSeed: () => Promise<void>
  cancel: () => void
}

const Ctx = createContext<Sync | null>(null)
const idle: SyncState = { running: false, label: '', done: 0, total: 0, plyDone: 0, plyTotal: 0, message: null, error: null }

export const DEFAULT_USER = (import.meta.env.VITE_CHESSCOM_USERNAME as string | undefined) ?? ''

/** Nodos por posición: más nodos, análisis más fino y más lento. */
export function getNodes() {
  try {
    return Number(localStorage.getItem('r1000.nodes')) || 150000
  } catch {
    return 150000
  }
}

function fnv(s: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16)
}

const DRAW = new Set(['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient'])
const header = (pgn: string, k: string) => pgn.match(new RegExp(`\\[${k} "([^"]*)"\\]`))?.[1] ?? null
const openingName = (pgn: string) => {
  const u = header(pgn, 'ECOUrl')
  if (!u) return header(pgn, 'Opening')
  return decodeURIComponent(u.split('/').pop() ?? '').replace(/-/g, ' ').replace(/\.\.\./g, '…')
}

type ChesscomGame = {
  url: string
  pgn?: string
  end_time: number
  time_control: string
  rules: string
  initial_setup?: string
  white: { username: string; rating: number; result: string }
  black: { username: string; rating: number; result: string }
}

function fromChesscom(g: ChesscomGame, user: string): GameRow | null {
  if (g.rules !== 'chess' || !g.pgn) return null
  if (g.initial_setup && !g.initial_setup.startsWith('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w')) return null
  const white = g.white.username.toLowerCase() === user.toLowerCase()
  const mine = white ? g.white : g.black
  const opp = white ? g.black : g.white
  const result = mine.result === 'win' ? 'W' : DRAW.has(mine.result) ? 'D' : 'L'
  return {
    ext_id: g.url, source: 'chesscom', played_at: new Date(g.end_time * 1000).toISOString(),
    time_control: g.time_control, color: white ? 'w' : 'b', result, termination: header(g.pgn, 'Termination'),
    my_elo: mine.rating, opp_elo: opp.rating, opening: openingName(g.pgn), pgn: g.pgn,
  }
}

export function splitPgn(text: string) {
  return text.replace(/\r/g, '').split(/\n\s*\n(?=\[Event )/).map((s) => s.trim()).filter((s) => s.startsWith('['))
}

function fromPgn(pgn: string, user: string): GameRow | null {
  const w = header(pgn, 'White') ?? ''
  const b = header(pgn, 'Black') ?? ''
  const white = w.toLowerCase() === user.toLowerCase()
  if (!white && b.toLowerCase() !== user.toLowerCase()) return null
  const r = header(pgn, 'Result')
  const result = r === '1/2-1/2' ? 'D' : (r === '1-0') === white ? 'W' : 'L'
  const date = (header(pgn, 'UTCDate') ?? header(pgn, 'Date') ?? '2000.01.01').replace(/\./g, '-')
  const time = (header(pgn, 'UTCTime') ?? header(pgn, 'EndTime') ?? '00:00:00').split(' ')[0]
  const link = header(pgn, 'Link')
  const iso = new Date(`${date}T${time}Z`)
  return {
    ext_id: link ?? `pgn:${fnv(pgn)}`, source: link?.includes('chess.com') ? 'chesscom' : 'pgn',
    played_at: isNaN(iso.getTime()) ? new Date().toISOString() : iso.toISOString(),
    time_control: header(pgn, 'TimeControl'), color: white ? 'w' : 'b', result: r === '*' ? 'D' : result,
    termination: header(pgn, 'Termination'), my_elo: Number(header(pgn, white ? 'WhiteElo' : 'BlackElo')) || null,
    opp_elo: Number(header(pgn, white ? 'BlackElo' : 'WhiteElo')) || null, opening: openingName(pgn), pgn,
  }
}

/**
 * Termina el análisis de una partida que se acaba de pasar por el motor: métricas,
 * resumen de la revisión y, si hace falta, ejercicios a partir de sus errores. Lo guarda todo.
 */
export async function saveGameAnalysis(game: GameRow & { id: string }, analysis: DeepAnalysis) {
  const plies = buildPlies(game.pgn, analysis)
  const review = reviewSummary(reviewGame(game.pgn, game.color, analysis, await loadBook()), game.color)
  // las métricas de las 500 partidas iniciales vienen del análisis en Python: se conservan
  const stats = game.source === 'seed' && game.stats ? { ...game.stats, review } : { ...computeStats(game, plies), review }
  await db.saveAnalysis(game.id, analysis, stats)
  let puzzles = 0
  if (!game.analysis || (game.source !== 'seed' && game.analysis.eng !== ENGINE_TAG)) {
    const ps: Puzzle[] = await generatePuzzles(game, plies)
    await db.deletePuzzlesOfGame(game.id)
    if (ps.length) await db.upsertPuzzles(ps.map((p) => ({ ...p, game_id: game.id })))
    puzzles = ps.length
  }
  return { stats, puzzles }
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const store = useStore()
  const [st, setSt] = useState<SyncState>(idle)
  const cancelled = useRef(false)
  const patch = (p: Partial<SyncState>) => setSt((s) => ({ ...s, ...p }))

  const processGames = useCallback(async (rows: GameRow[]) => {
    const known = new Set(store.games.map((g) => g.ext_id))
    const todo = rows.filter((r) => !known.has(r.ext_id)).sort((a, b) => a.played_at.localeCompare(b.played_at))
    if (!todo.length) {
      patch({ running: false, message: 'No hay partidas nuevas.' })
      return 0
    }
    // solo los datos básicos: el análisis con el motor se hace al abrir cada partida
    patch({ label: `Guardando ${todo.length} partida${todo.length === 1 ? '' : 's'}…`, total: 0 })
    await db.upsertGames(todo.map((r) => ({ ...r, analysis: null, stats: null })))
    const n = todo.length
    return n
  }, [store.games])

  const run = useCallback(async (label: string, fn: () => Promise<string>) => {
    if (st.running) return
    cancelled.current = false
    setSt({ ...idle, running: true, label })
    try {
      const msg = await fn()
      await store.reload()
      setSt((s) => ({ ...s, running: false, message: cancelled.current ? 'Sincronización detenida. Lo analizado ya está guardado.' : msg }))
    } catch (e) {
      setSt((s) => ({ ...s, running: false, error: (e as Error).message }))
    }
  }, [st.running, store])

  const syncChesscom = useCallback(() => run('Buscando partidas en Chess.com…', async () => {
    const user = store.settings.chesscom_username || DEFAULT_USER
    if (!user) throw new Error('Añade tu usuario de Chess.com en Ajustes.')
    const r = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(user.toLowerCase())}/games/archives`)
    if (!r.ok) throw new Error(r.status === 404 ? `Chess.com no encuentra al usuario «${user}».` : `Chess.com respondió ${r.status}. Prueba en unos minutos.`)
    const { archives } = (await r.json()) as { archives: string[] }
    const lastMs = store.games.reduce((m, g) => Math.max(m, Date.parse(g.played_at) || 0), 0)
    const cutoff = new Date(lastMs || Date.now() - 30 * 86400000)
    const fromMonth = `${cutoff.getUTCFullYear()}/${String(cutoff.getUTCMonth() + 1).padStart(2, '0')}`
    const months = archives.filter((a) => a.slice(-7) >= fromMonth)
    const rows: GameRow[] = []
    for (const m of months) {
      patch({ label: `Descargando ${m.slice(-7)}…` })
      const res = await fetch(m)
      if (!res.ok) continue
      const { games } = (await res.json()) as { games: ChesscomGame[] }
      for (const g of games) {
        if (g.end_time * 1000 <= cutoff.getTime()) continue
        const row = fromChesscom(g, user)
        if (row) rows.push(row)
      }
    }
    const n = await processGames(rows)
    await store.setSettings({ last_sync_at: new Date().toISOString(), chesscom_username: user })
    return n ? `${n} partida${n === 1 ? '' : 's'} nueva${n === 1 ? '' : 's'}. Cada una se analiza al abrirla.` : 'Ya estabas al día.'
  }), [run, store, processGames])

  const importPgnText = useCallback((text: string) => run('Leyendo PGN…', async () => {
    const user = store.settings.chesscom_username || DEFAULT_USER
    const rows = splitPgn(text).map((p) => fromPgn(p, user)).filter(Boolean) as GameRow[]
    if (!rows.length) throw new Error(`No encontré partidas de «${user}» en ese PGN. Revisa el usuario en Ajustes.`)
    const n = await processGames(rows)
    return `${n} partida${n === 1 ? '' : 's'} importada${n === 1 ? '' : 's'}. Cada una se analiza al abrirla.`
  }), [run, store, processGames])

  const importSeed = useCallback(() => run('Importando tus 500 partidas analizadas…', async () => {
    const res = await fetch(`${import.meta.env.BASE_URL}seed.json`)
    if (!res.ok) throw new Error('No se pudo descargar el análisis inicial.')
    const seed = (await res.json()) as { games: GameRow[]; puzzles: Puzzle[] }
    patch({ total: seed.games.length, done: 0 })
    const rows = seed.games.map((g, i) => {
      if (i % 50 === 0) patch({ done: i })
      return { ...g, stats: computeStats(g, buildPlies(g.pgn, g.analysis!)) }
    })
    patch({ label: 'Guardando partidas…' })
    await db.upsertGames(rows)
    const ids = await db.gameIdsByExt(rows.map((r) => r.ext_id))
    patch({ label: 'Guardando ejercicios…' })
    await db.upsertPuzzles(seed.puzzles.map((p) => ({ ...p, game_id: ids[p.game_ext_id ?? ''] ?? null })))
    const lastMs = rows.reduce((m, g) => Math.max(m, Date.parse(g.played_at) || 0), 0)
    await store.setSettings({ last_sync_at: new Date(lastMs).toISOString(), chesscom_username: store.settings.chesscom_username || DEFAULT_USER })
    patch({ done: rows.length })
    return `${rows.length} partidas y ${seed.puzzles.length} ejercicios importados.`
  }), [run, store])

  /**
   * Mantenimiento automático: recalcula las métricas antiguas (v<3) de las partidas ya analizadas.
   * No usa el motor: el reanálisis de cada partida se hace al abrirla.
   */
  const upgradeTried = useRef(false)
  useEffect(() => {
    if (store.loading || upgradeTried.current || st.running || !store.games.length) return
    upgradeTried.current = true
    const restat = store.games.filter((g) => g.av && (!g.stats || g.stats.v < 3)).map((g) => g.id)
    if (!restat.length) return
    void run('Actualizando tus métricas…', async () => {
      for (let i = 0; i < restat.length; i += 100) {
        if (cancelled.current) break
        patch({ label: `Recalculando métricas (${Math.min(i + 100, restat.length)} de ${restat.length})…`, total: 0 })
        const rows = (await db.gamesFull(restat.slice(i, i + 100))).filter((r) => r.analysis)
        await db.upsertGames(rows.map((r) => ({ ...r, stats: { ...computeStats(r, buildPlies(r.pgn, r.analysis!)), review: r.stats?.review } })))
      }
      return 'Métricas actualizadas.'
    })
  }, [store.loading, store.games]) // eslint-disable-line react-hooks/exhaustive-deps

  const value: Sync = { ...st, syncChesscom, importPgnText, importSeed, cancel: () => { cancelled.current = true } }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSync() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useSync fuera de SyncProvider')
  return v
}
