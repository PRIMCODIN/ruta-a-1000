import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { db, type Attempt, type Review, type Settings } from './db'
import type { GameLite } from '../analysis/aggregate'
import type { Puzzle } from '../analysis/core'

export const INTERVALS = [0, 1, 3, 7, 16, 35]
export const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const addDays = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export type StoredPuzzle = Puzzle & { game_id: string | null }

type Store = {
  loading: boolean
  error: string | null
  games: GameLite[]
  puzzles: StoredPuzzle[]
  reviews: Record<string, Review>
  attempts: Attempt[]
  settings: Settings
  reload: () => Promise<void>
  review: (id: string) => Review | undefined
  isDue: (id: string) => boolean
  grade: (id: string, kind: Review['kind'], ok: boolean) => void
  setSettings: (s: Partial<Settings>) => Promise<void>
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [games, setGames] = useState<GameLite[]>([])
  const [puzzles, setPuzzles] = useState<StoredPuzzle[]>([])
  const [reviews, setReviews] = useState<Record<string, Review>>({})
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [settings, setS] = useState<Settings>({ chesscom_username: null, last_sync_at: null })

  const reload = useCallback(async () => {
    setError(null)
    try {
      const [g, p, r, a, s] = await Promise.all([db.games(), db.puzzles(), db.reviews(), db.attemptsSince(60), db.settings()])
      setGames(g)
      setPuzzles(p)
      setReviews(Object.fromEntries(r.map((x) => [x.item_id, x])))
      setAttempts(a)
      setS(s)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const grade = useCallback((id: string, kind: Review['kind'], ok: boolean) => {
    setReviews((prev) => {
      const c = prev[id] ?? { item_id: id, kind, box: 0, due: todayStr(), seen: 0, ok: 0 }
      const box = ok ? Math.min(c.box + 1, INTERVALS.length - 1) : 0
      const next: Review = { ...c, kind, seen: c.seen + 1, ok: c.ok + (ok ? 1 : 0), box, due: addDays(ok ? INTERVALS[box] : 0) }
      db.saveReview(next).catch((e) => setError(`No se pudo guardar el progreso: ${e.message}`))
      return { ...prev, [id]: next }
    })
    setAttempts((prev) => [...prev, { item_id: id, kind, ok, at: new Date().toISOString() }])
    db.logAttempt(id, kind, ok).catch(() => {})
  }, [])

  const value = useMemo<Store>(
    () => ({
      loading, error, games, puzzles, reviews, attempts, settings, reload,
      review: (id) => reviews[id],
      isDue: (id) => {
        const r = reviews[id]
        return !r || r.due <= todayStr()
      },
      grade,
      setSettings: async (s) => {
        await db.saveSettings(s)
        setS((prev) => ({ ...prev, ...s }))
      },
    }),
    [loading, error, games, puzzles, reviews, attempts, settings, reload, grade],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useStore fuera de StoreProvider')
  return v
}

/** Días seguidos con al menos un ejercicio (hoy o ayer cuentan como racha viva). */
export function streak(attempts: Attempt[]) {
  const days = new Set(attempts.map((a) => {
    const d = new Date(a.at)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }))
  let n = 0
  const d = new Date()
  const key = () => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  if (!days.has(key())) d.setDate(d.getDate() - 1)
  while (days.has(key())) {
    n++
    d.setDate(d.getDate() - 1)
  }
  return n
}
