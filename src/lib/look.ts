/**
 * Aspecto: el tablero manda. Cada tema de tablero trae su tono para la interfaz
 * (neutros teñidos con el mismo matiz) y su color de acento. Todo se aplica como
 * variables CSS en <html>, así que cambiarlo no vuelve a pintar React.
 */
import { useEffect, useState } from 'react'

export type Mode = 'dark' | 'light' | 'auto'
export type Look = {
  board: string
  pieces: string
  mode: Mode
  tint: 'board' | 'neutral'
  coords: 'in' | 'off'
  anim: 'normal' | 'fast' | 'off'
}

export type BoardTheme = {
  id: string
  name: string
  light: string
  dark: string
  /** última jugada y casilla seleccionada */
  hl: string
  /** matiz y saturación de los neutros de la interfaz */
  hue: number
  sat: number
  accent: { dark: string; light: string }
}

export const BOARDS: BoardTheme[] = [
  { id: 'verde', name: 'Verde torneo', light: '#ebecd0', dark: '#739552', hl: 'rgba(255, 255, 51, 0.42)', hue: 82, sat: 12, accent: { dark: '#bcd77a', light: '#4a6a1c' } },
  { id: 'madera', name: 'Madera', light: '#f0d9b5', dark: '#b58863', hl: 'rgba(155, 199, 0, 0.41)', hue: 30, sat: 16, accent: { dark: '#e9b067', light: '#8a5413' } },
  { id: 'hielo', name: 'Hielo', light: '#dee3e6', dark: '#8ca2ad', hl: 'rgba(155, 199, 0, 0.41)', hue: 200, sat: 14, accent: { dark: '#7dc4ea', light: '#1c6390' } },
  { id: 'pizarra', name: 'Pizarra', light: '#d8d9db', dark: '#878b92', hl: 'rgba(255, 210, 60, 0.45)', hue: 220, sat: 5, accent: { dark: '#e9ebee', light: '#1f2329' } },
  { id: 'lavanda', name: 'Lavanda', light: '#e8e2f1', dark: '#9b88b9', hl: 'rgba(255, 230, 90, 0.45)', hue: 265, sat: 13, accent: { dark: '#c6b0f7', light: '#5a3d98' } },
  { id: 'terracota', name: 'Terracota', light: '#f2e2d0', dark: '#c48a69', hl: 'rgba(255, 230, 90, 0.45)', hue: 22, sat: 16, accent: { dark: '#f19c74', light: '#9a4520' } },
  { id: 'noche', name: 'Noche', light: '#c9d4e0', dark: '#5b7493', hl: 'rgba(94, 234, 212, 0.38)', hue: 218, sat: 34, accent: { dark: '#5eead4', light: '#0f766e' } },
]

export const PIECE_SETS: { id: string; name: string; license: string }[] = [
  { id: 'cburnett', name: 'Clásicas', license: 'Colin M.L. Burnett, GPLv2+' },
  { id: 'merida', name: 'Mérida', license: 'Armando H. Marroquín, GPLv2+' },
  { id: 'maestro', name: 'Maestro', license: 'sadsnake1, CC BY-NC-SA 4.0' },
  { id: 'staunty', name: 'Staunty', license: 'sadsnake1, CC BY-NC-SA 4.0' },
  { id: 'cardinal', name: 'Cardinal', license: 'sadsnake1, CC BY-NC-SA 4.0' },
  { id: 'tatiana', name: 'Tatiana', license: 'sadsnake1, CC BY-NC-SA 4.0' },
  { id: 'chessnut', name: 'Chessnut', license: 'Alexis Luengas, Apache 2.0' },
  { id: 'spatial', name: 'Spatial', license: 'Maurizio Monge, MIT' },
]

export const DEFAULT_LOOK: Look = { board: 'verde', pieces: 'cburnett', mode: 'dark', tint: 'board', coords: 'in', anim: 'normal' }
const KEY = 'r1000.look'

const hsl = (h: number, s: number, l: number) => `hsl(${h} ${s}% ${l}%)`

/** Variables de color de la interfaz para un tablero, un modo y un tinte. */
export function palette(b: BoardTheme, mode: 'dark' | 'light', tint: Look['tint']): Record<string, string> {
  const h = b.hue
  const s = tint === 'neutral' ? 3 : b.sat
  const si = Math.min(s, 10) // los textos llevan menos color que las superficies
  const accent = b.accent[mode]
  const base = mode === 'dark'
    ? {
      '--bg': hsl(h, s, 7), '--nav': hsl(h, s, 5.5), '--panel': hsl(h, s, 10), '--panel-2': hsl(h, s, 13.5),
      '--line': hsl(h, s, 17), '--line-2': hsl(h, s, 23),
      '--ink': hsl(h, si, 93), '--ink-2': hsl(h, si, 77), '--muted': hsl(h, si, 61),
      '--accent-ink': hsl(h, 40, 9),
      '--good': '#4fcf9a', '--bad': '#ff7a68', '--warn': '#f3b54e',
      '--edge': 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
      '--shadow-pop': '0 12px 32px rgba(0, 0, 0, 0.45)',
    }
    : {
      '--bg': hsl(h, Math.min(s, 18), 96), '--nav': hsl(h, Math.min(s, 18), 93), '--panel': hsl(h, Math.min(s, 18), 99.2), '--panel-2': hsl(h, Math.min(s, 18), 94),
      '--line': hsl(h, Math.min(s, 14), 87), '--line-2': hsl(h, Math.min(s, 14), 78),
      '--ink': hsl(h, Math.min(s, 20), 11), '--ink-2': hsl(h, Math.min(s, 14), 28), '--muted': hsl(h, Math.min(s, 10), 40),
      '--accent-ink': '#ffffff',
      '--good': '#127a54', '--bad': '#c0392b', '--warn': '#93600a',
      '--edge': '0 1px 2px rgba(20, 20, 30, 0.05)',
      '--shadow-pop': '0 12px 32px rgba(20, 24, 40, 0.14)',
    }
  return { ...base, '--accent': accent, '--sq-light': b.light, '--sq-dark': b.dark, '--hl': b.hl }
}

export function boardOf(id: string) {
  return BOARDS.find((x) => x.id === id) ?? BOARDS[0]
}

function read(): Look {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return sanitize(JSON.parse(raw))
  } catch {
    /* sin almacenamiento */
  }
  return DEFAULT_LOOK
}

export function sanitize(x: unknown): Look {
  const o = (x && typeof x === 'object' ? x : {}) as Partial<Look>
  return {
    board: BOARDS.some((b) => b.id === o.board) ? o.board! : DEFAULT_LOOK.board,
    pieces: PIECE_SETS.some((p) => p.id === o.pieces) ? o.pieces! : DEFAULT_LOOK.pieces,
    mode: o.mode === 'light' || o.mode === 'auto' || o.mode === 'dark' ? o.mode : DEFAULT_LOOK.mode,
    tint: o.tint === 'neutral' ? 'neutral' : 'board',
    coords: o.coords === 'off' ? 'off' : 'in',
    anim: o.anim === 'fast' || o.anim === 'off' ? o.anim : 'normal',
  }
}

let current: Look = read()
const listeners = new Set<(l: Look) => void>()
const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: light)') : null

export function resolvedMode(l: Look = current): 'dark' | 'light' {
  if (l.mode === 'auto') return mq?.matches ? 'light' : 'dark'
  return l.mode
}

export const pieceUrl = (set: string, code: string) => `${import.meta.env.BASE_URL}pieces/${set}/${code}.svg`

export function applyLook(l: Look = current) {
  const root = document.documentElement
  const mode = resolvedMode(l)
  for (const [k, v] of Object.entries(palette(boardOf(l.board), mode, l.tint))) root.style.setProperty(k, v)
  for (const c of ['w', 'b']) for (const p of 'kqrbnp') root.style.setProperty(`--p-${c}${p}`, `url("${pieceUrl(l.pieces, c + p)}")`)
  root.dataset.mode = mode
  root.dataset.coords = l.coords
  root.dataset.anim = l.anim
  root.style.colorScheme = mode
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(root).getPropertyValue('--nav').trim() || '#111')
}

export function getLook() {
  return current
}

/** Cambia el aspecto, lo guarda en este dispositivo y avisa a quien escuche. */
export function setLook(next: Partial<Look>) {
  current = sanitize({ ...current, ...next })
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    /* sin almacenamiento */
  }
  applyLook(current)
  listeners.forEach((f) => f(current))
}

export function useLook() {
  const [l, set] = useState(current)
  useEffect(() => {
    listeners.add(set)
    return () => void listeners.delete(set)
  }, [])
  return l
}

mq?.addEventListener?.('change', () => {
  if (current.mode === 'auto') applyLook(current)
})
