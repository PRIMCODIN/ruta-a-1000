import { createClient } from '@supabase/supabase-js'
import type { GameRow, Puzzle, RawAnalysis } from '../analysis/core'
import type { GameLite } from '../analysis/aggregate'

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'https://vlvjqhpgjibqdapwkoft.supabase.co'
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || 'sb_publishable_x86TC108SLRdTLvDYFiJcQ_72v-ZNev'
export const supabase = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })

export type Review = { item_id: string; kind: 'line' | 'puzzle' | 'endgame'; box: number; due: string; seen: number; ok: number }
export type Settings = { chesscom_username: string | null; last_sync_at: string | null; prefs?: Record<string, unknown> | null }
export type Attempt = { item_id: string; kind: string; ok: boolean; at: string }

const LITE_COLS = 'id, ext_id, source, played_at, time_control, color, result, my_elo, opp_elo, termination, opening, stats, eng:analysis->>eng, av:analysis->>v'

function check<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message)
  return r.data
}

/** Supabase devuelve como mucho 1000 filas por petición: pagina. */
async function selectAll<T>(table: string, cols: string, order?: string): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    let q = supabase.from(table).select(cols).range(from, from + 999)
    if (order) q = q.order(order, { ascending: true })
    const rows = check(await q) as T[]
    out.push(...rows)
    if (rows.length < 1000) break
  }
  return out
}

export const db = {
  async user() {
    const { data } = await supabase.auth.getUser()
    return data.user
  },
  games: () => selectAll<GameLite>('games', LITE_COLS, 'played_at'),
  async gameFull(id: string) {
    return check(await supabase.from('games').select('*').eq('id', id).single()) as GameRow & { id: string; analysis: RawAnalysis }
  },
  async gamesFull(ids: string[]) {
    if (!ids.length) return []
    return check(await supabase.from('games').select('*').in('id', ids)) as (GameRow & { id: string })[]
  },
  async saveAnalysis(id: string, analysis: RawAnalysis, stats: unknown) {
    check(await supabase.from('games').update({ analysis, stats }).eq('id', id))
  },
  async deletePuzzlesOfGame(gameId: string) {
    check(await supabase.from('puzzles').delete().eq('game_id', gameId))
  },
  async upsertGames(rows: GameRow[]) {
    for (let i = 0; i < rows.length; i += 50) {
      check(await supabase.from('games').upsert(rows.slice(i, i + 50), { onConflict: 'user_id,ext_id', ignoreDuplicates: false }))
    }
  },
  async gameIdsByExt(ext: string[]) {
    const map: Record<string, string> = {}
    for (let i = 0; i < ext.length; i += 200) {
      const rows = check(await supabase.from('games').select('id, ext_id').in('ext_id', ext.slice(i, i + 200))) as { id: string; ext_id: string }[]
      for (const r of rows) map[r.ext_id] = r.id
    }
    return map
  },
  async puzzles() {
    const rows = await selectAll<{ id: string; game_id: string | null; data: Puzzle; created_at: string }>('puzzles', 'id, game_id, data, created_at', 'created_at')
    return rows.map((r) => ({ ...r.data, id: r.id, game_id: r.game_id }))
  },
  async upsertPuzzles(ps: (Puzzle & { game_id: string | null })[]) {
    const rows = ps.map(({ game_id, ...p }) => ({ id: p.id, game_id, phase: p.phase, motif: p.motif, data: p }))
    for (let i = 0; i < rows.length; i += 100) check(await supabase.from('puzzles').upsert(rows.slice(i, i + 100), { onConflict: 'user_id,id' }))
  },
  reviews: () => selectAll<Review>('reviews', 'item_id, kind, box, due, seen, ok'),
  async saveReview(r: Review) {
    check(await supabase.from('reviews').upsert({ ...r, updated_at: new Date().toISOString() }, { onConflict: 'user_id,item_id' }))
  },
  async logAttempt(item_id: string, kind: string, ok: boolean) {
    check(await supabase.from('attempts').insert({ item_id, kind, ok }))
  },
  async attemptsSince(days: number) {
    const since = new Date(Date.now() - days * 86400000).toISOString()
    return check(await supabase.from('attempts').select('item_id, kind, ok, at').gte('at', since).order('at')) as Attempt[]
  },
  async settings(): Promise<Settings> {
    const r = check(await supabase.from('settings').select('chesscom_username, last_sync_at, prefs').maybeSingle()) as Settings | null
    return r ?? { chesscom_username: null, last_sync_at: null, prefs: null }
  },
  async saveSettings(s: Partial<Settings>) {
    const u = await db.user()
    check(await supabase.from('settings').upsert({ user_id: u!.id, ...s }, { onConflict: 'user_id' }))
  },
}
